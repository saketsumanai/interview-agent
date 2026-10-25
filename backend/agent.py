import logging
import asyncio
import time
from typing import Optional
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import noise_cancellation, silero, assemblyai, cartesia, groq
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from tools import search_project_docs, search_candidate_resume, search_web_info, generate_feedback
from prompts import build_interview_prompt, build_interview_greeting
from rag import get_resume_full_text
from stt_provider import (
    create_stt_provider,
    STTConfig,
    TranscriptReconciler,
    MissingCredentialError,
    TECHNICAL_INTERVIEW_KEYTERMS,
)
from stt_metrics import stt_telemetry

load_dotenv(".env.local")

# Configure logging to show INFO level and above
# This ensures tool call logs are visible
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Concurrency tracking (thread-safe using asyncio)
active_sessions = 0
MAX_CONCURRENT_SESSIONS = 5
sessions_lock = asyncio.Lock()

# Idle timeout settings (in seconds)
IDLE_TIMEOUT = 900  # 15 minutes
ACTIVITY_CHECK_INTERVAL = 60  # Check every 60 seconds
EMPTY_ROOM_GRACE_PERIOD = 3  # Wait 3 seconds before cleanup to avoid race conditions


class Assistant(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(
            instructions=instructions,
            tools=[],  # Direct conversational mode for sub-second turn latency
        )

server = AgentServer()


async def increment_session_count() -> bool:
    """
    Try to increment active session count.
    Returns True if successful (under limit), False if at capacity.
    """
    global active_sessions
    async with sessions_lock:
        if active_sessions >= MAX_CONCURRENT_SESSIONS:
            logger.warning(
                f"Session limit reached: {active_sessions}/{MAX_CONCURRENT_SESSIONS}"
            )
            return False
        active_sessions += 1
        logger.info(
            f"Session started. Active sessions: {active_sessions}/{MAX_CONCURRENT_SESSIONS}"
        )
        return True


async def decrement_session_count():
    """Decrement active session count."""
    global active_sessions
    async with sessions_lock:
        active_sessions = max(0, active_sessions - 1)
        logger.info(
            f"Session ended. Active sessions: {active_sessions}/{MAX_CONCURRENT_SESSIONS}"
        )


async def monitor_room_activity(
    room: rtc.Room,
    session: AgentSession,
    last_activity_time: list[float]
):
    """
    Monitor room for:
    1. Empty room (no non-agent participants)
    2. Idle timeout (no user activity for IDLE_TIMEOUT seconds)
    """
    try:
        while True:
            await asyncio.sleep(ACTIVITY_CHECK_INTERVAL)
            
            # Check for non-agent participants
            has_real_participants = False
            for participant in room.remote_participants.values():
                if not (participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT):
                    has_real_participants = True
                    break
            
            # If no real participants, wait grace period and check again
            if not has_real_participants:
                await asyncio.sleep(EMPTY_ROOM_GRACE_PERIOD)
                
                # Re-check after grace period
                has_real_participants = False
                for participant in room.remote_participants.values():
                    if not (participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT):
                        has_real_participants = True
                        break
                
                if not has_real_participants:
                    logger.info(f"Room {room.name} empty - cleaning up session")
                    break
            
            # Check for idle timeout
            time_since_activity = time.time() - last_activity_time[0]
            if time_since_activity > IDLE_TIMEOUT:
                logger.info(f"Session idle timeout in room {room.name}")
                break
    
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Error in activity monitor for room {room.name}: {e}", exc_info=True)


@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    """
    Main agent session handler with cleanup and concurrency management.
    """
    session_id = f"{ctx.room.name}-{time.time()}"
    logger.info(f"Session starting: {session_id}")
    
    # Check concurrency limit
    if not await increment_session_count():
        logger.warning(f"Rejecting session {session_id}: capacity limit reached")
        return
    
    session: Optional[AgentSession] = None
    monitor_task: Optional[asyncio.Task] = None
    reconciler: Optional[TranscriptReconciler] = None
    
    try:
        # Track last activity time (using list to allow modification in nested function)
        last_activity_time = [time.time()]
        
        # Define event handler to update last activity time
        def on_track_subscribed(track: rtc.Track, publication: rtc.TrackPublication, participant: rtc.RemoteParticipant):
            """Update activity time when receiving audio from user."""
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                    last_activity_time[0] = time.time()
        
        # Register event handler
        ctx.room.on("track_subscribed", on_track_subscribed)
        
        # 1. Resolve interview topic and interview type
        topic = "Full Stack Development & System Design"
        interview_type = "full"

        if ctx.room.metadata:
            try:
                import json
                meta = json.loads(ctx.room.metadata)
                if meta.get("topic"):
                    topic = meta["topic"]
                if meta.get("interview_type"):
                    interview_type = meta["interview_type"]
            except Exception:
                pass

        # Also check persisted session_config.json if metadata wasn't populated
        from pathlib import Path
        import json
        session_file = Path(__file__).parent / "data" / "session_config.json"
        if session_file.exists():
            try:
                saved = json.loads(session_file.read_text(encoding="utf-8"))
                if saved.get("topic"):
                    topic = saved["topic"]
                if saved.get("interview_type"):
                    interview_type = saved["interview_type"]
            except Exception:
                pass

        # 2. Load candidate resume full text
        resume_text = get_resume_full_text()
        logger.info(
            f"Configured interview: type='{interview_type}', topic='{topic}', "
            f"resume={'LOADED (' + str(len(resume_text)) + ' chars)' if resume_text else 'NONE'}"
        )

        # 3. Build personalized system prompt and greeting
        system_prompt = build_interview_prompt(topic, interview_type, resume_text)
        greeting = build_interview_greeting(topic, interview_type, resume_text)

        # 4. Resolve STT Provider & Model from room metadata, session_config, or env
        stt_provider_name = os.getenv("STT_PROVIDER", "deepgram")
        deepgram_model = os.getenv("DEEPGRAM_MODEL", "flux-general-en")

        if ctx.room.metadata:
            try:
                import json
                meta = json.loads(ctx.room.metadata)
                if meta.get("stt_provider"):
                    stt_provider_name = meta["stt_provider"]
                if meta.get("deepgram_model"):
                    deepgram_model = meta["deepgram_model"]
            except Exception:
                pass

        try:
            stt_config = STTConfig(
                provider=stt_provider_name,
                model=deepgram_model if stt_provider_name == "deepgram" else None,
            )
            stt_plugin = create_stt_provider(stt_config)
            logger.info(
                f"Initialized STT provider '{stt_provider_name}' "
                f"(model='{getattr(stt_plugin, 'model', deepgram_model)}')"
            )
        except MissingCredentialError as e:
            logger.warning(f"Preferred STT provider '{stt_provider_name}' missing credentials: {e}")
            if os.getenv("GROQ_API_KEY"):
                logger.info("Automatically falling back to Groq STT (whisper-large-v3-turbo)")
                stt_config = STTConfig(provider="groq", model="whisper-large-v3-turbo")
                stt_plugin = create_stt_provider(stt_config)
            elif os.getenv("ASSEMBLYAI_API_KEY"):
                logger.info("Automatically falling back to AssemblyAI STT")
                stt_config = STTConfig(provider="assemblyai")
                stt_plugin = create_stt_provider(stt_config)
            else:
                raise

        # Initialize session with optimized audio plugins for crystal-clear sound & understanding
        try:
            # Cartesia Sonic-3 with Jacqueline voice: expressive, natural cadence, clear articulation
            tts_plugin = cartesia.TTS(
                model="sonic-3",
                voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                speed=1.05,
            )
            # Silero VAD tuned for snappy, sub-second natural conversational response
            vad_plugin = silero.VAD.load(
                min_silence_duration=0.35,
                activation_threshold=0.45,
            )

            # Groq: sub-100ms TTFT, generous free-tier (no daily cap), perfect for real-time voice
            # Using qwen/qwen3.8-27b — ultra-fast (~40ms TTFT) conversational model available on Groq
            groq_llm = groq.LLM(
                model="qwen/qwen3.8-27b",
                temperature=0.7,
            )

            session = AgentSession(
                stt=stt_plugin,
                llm=groq_llm,
                tts=tts_plugin,
                vad=vad_plugin,
            )
        except Exception as e:
            logger.error(f"Failed to initialize session {session_id}: {e}", exc_info=True)
            raise

        # Wire up transcript reconciler and latency telemetry tracker
        reconciler = TranscriptReconciler(session_id=session_id)
        current_turn_id = [None]
        active_provider_name = stt_config.provider
        active_model_name = getattr(stt_plugin, "model", deepgram_model)

        @session.on("user_state_changed")
        def on_user_state_changed(ev):
            try:
                if ev.new_state == "speaking":
                    current_turn_id[0] = stt_telemetry.start_turn(active_provider_name, str(active_model_name))
                elif ev.old_state == "speaking" and ev.new_state == "listening":
                    if current_turn_id[0]:
                        stt_telemetry.record_speech_end(current_turn_id[0], ev.created_at)
            except Exception as ex:
                logger.debug(f"Telemetry user_state_changed error: {ex}")

        @session.on("user_input_transcribed")
        def on_user_input_transcribed(ev):
            try:
                tid = current_turn_id[0]
                if not ev.is_final:
                    # Interim transcript: update UI captions, record interim latency
                    # NEVER trigger question from provisional text
                    reconciler.process_interim(ev.transcript, ev.created_at)
                    if tid:
                        stt_telemetry.record_first_interim(tid, ev.created_at)
                else:
                    # Finalized transcript segment: reconcile and deduplicate
                    reconciler.process_final(ev.transcript, ev.created_at)
                    if tid:
                        stt_telemetry.record_final_transcript(tid, ev.transcript, ev.created_at)
            except Exception as ex:
                logger.debug(f"Telemetry user_input_transcribed error: {ex}")

        @session.on("agent_state_changed")
        def on_agent_state_changed(ev):
            try:
                if ev.new_state == "speaking":
                    tid = current_turn_id[0]
                    if tid:
                        stt_telemetry.record_first_ai_audio(tid, ev.created_at)
            except Exception as ex:
                logger.debug(f"Telemetry agent_state_changed error: {ex}")

        try:
            agent_instance = Assistant(instructions=system_prompt)
            await session.start(
                room=ctx.room,
                agent=agent_instance,
                room_options=room_io.RoomOptions(
                    audio_input=room_io.AudioInputOptions(
                        noise_cancellation=lambda params: noise_cancellation.BVCTelephony() 
                        if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP 
                        else noise_cancellation.BVC(),
                    ),
                ),
            )
        except Exception as e:
            logger.error(f"Failed to start session {session_id}: {e}", exc_info=True)
            raise

        try:
            logger.info(f"Queuing greeting for {session_id}: {greeting[:100]}...")
            session.generate_reply(instructions=greeting)
            logger.info(f"Greeting queued successfully for {session_id}")
        except Exception as e:
            logger.error(f"Failed to generate greeting for {session_id}: {e}", exc_info=True)
        
        # Start monitoring room activity
        monitor_task = asyncio.create_task(
            monitor_room_activity(ctx.room, session, last_activity_time)
        )
        
        # Wait for monitor to signal cleanup
        await monitor_task
        
    except asyncio.CancelledError:
        logger.info(f"Session {session_id} cancelled")
        raise
    except Exception as e:
        logger.error(f"Error in session {session_id}: {e}", exc_info=True)
    finally:
        # Safely persist candidate answers even if canceled or disconnected
        if reconciler:
            try:
                saved_path = reconciler.persist_to_disk()
                logger.info(f"Persisted candidate session transcripts to {saved_path}")
            except Exception as pe:
                logger.warning(f"Failed to persist transcripts: {pe}")

        # Cleanup
        if monitor_task and not monitor_task.done():
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
        
        # Decrement active session count
        await decrement_session_count()
        
        logger.info(f"Session {session_id} ended")


if __name__ == "__main__":
    import os
    livekit_url = os.getenv("LIVEKIT_URL", "Not configured")
    print("\n" + "="*60)
    print("Agent Server Starting...")
    print("="*60)
    print(f"LiveKit URL: {livekit_url}")
    print("Token Server: http://localhost:8000/token?room=<room>&username=<user>")
    print("Connect at: https://meet.livekit.io")
    print("="*60 + "\n")
    agents.cli.run_app(server)

    