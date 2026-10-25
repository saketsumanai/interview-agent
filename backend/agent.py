import asyncio
import logging
import os
import sys
import time
from pathlib import Path

# Ensure backend directory and project root are on sys.path
_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _BACKEND_DIR.parent
for _d in (str(_BACKEND_DIR), str(_PROJECT_DIR)):
    if _d not in sys.path:
        sys.path.insert(0, _d)

from typing import Any, Optional

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import Agent, AgentServer, AgentSession, room_io
from livekit.plugins import groq, noise_cancellation, silero

try:
    from backend.prompts import build_interview_greeting, build_interview_prompt
    from backend.rag import get_resume_full_text
    from backend.stt_metrics import stt_telemetry
    from backend.stt_provider import (
        TECHNICAL_INTERVIEW_KEYTERMS,
        MissingCredentialError,
        STTConfig,
        TranscriptReconciler,
        create_stt_provider,
    )
    from backend.tools import (
        generate_feedback,
        search_candidate_resume,
        search_project_docs,
        search_web_info,
    )
except ImportError:
    from prompts import (  # type: ignore
        build_interview_greeting,
        build_interview_prompt,
    )
    from rag import get_resume_full_text  # type: ignore
    from stt_metrics import stt_telemetry  # type: ignore
    from stt_provider import (  # type: ignore
        MissingCredentialError,
        STTConfig,
        TranscriptReconciler,
        create_stt_provider,
    )
    from tools import (  # type: ignore
        generate_feedback,
        search_candidate_resume,
        search_project_docs,
        search_web_info,
    )

# Load env from backend dir or parent
load_dotenv(_BACKEND_DIR / ".env.local")
load_dotenv(_BACKEND_DIR.parent / ".env.local")

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
                if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                    has_real_participants = True
                    break

            # If no real participants, wait grace period and check again
            if not has_real_participants:
                await asyncio.sleep(EMPTY_ROOM_GRACE_PERIOD)

                # Re-check after grace period
                has_real_participants = False
                for participant in room.remote_participants.values():
                    if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
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
            if track.kind == rtc.TrackKind.KIND_AUDIO and participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
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
        import json
        from pathlib import Path
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
        deepgram_model = os.getenv("DEEPGRAM_MODEL", "nova-3")

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
                # Load endpointing tuning from env (set in .env.local for per-deployment control)
                endpointing_ms=int(os.getenv("DEEPGRAM_ENDPOINTING_MS", "150")),
                eot_threshold=float(os.getenv("DEEPGRAM_EOT_THRESHOLD", "0.55")),
                eot_timeout_ms=int(os.getenv("DEEPGRAM_EOT_TIMEOUT_MS", "1000")),
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
            # ── TTS Provider ─────────────────────────────────────────────────
            # Groq PlayAI TTS: included in the free Groq API plan, sub-200ms latency
            # Voice options: 'Aaliyah-PlayAI' (F), 'Arista-PlayAI' (F), 'Calum-PlayAI' (M),
            #                'Chip-PlayAI' (M), 'Basil-PlayAI' (M, deep), 'Cimo-PlayAI' (M)
            # NOTE: Cartesia was returning HTTP 402 (quota exceeded) — switched to Groq TTS
            groq_tts_voice = os.getenv("GROQ_TTS_VOICE", "Aaliyah-PlayAI")
            groq_tts_model = os.getenv("GROQ_TTS_MODEL", "playai-tts")
            tts_plugin = groq.TTS(
                model=groq_tts_model,
                voice=groq_tts_voice,
            )  # api_key read from GROQ_API_KEY env var automatically
            logger.info(f"TTS: Groq PlayAI ({groq_tts_model} / {groq_tts_voice})")

            # Silero VAD: tuned for noisy real-world environments
            # Lower activation_threshold (0.40) → catches speech even with background noise/fan/HVAC
            # Shorter min_silence_duration (0.25s) → faster turn-taking after user finishes
            # Longer prefix_padding (0.40s) → don't clip the first syllable (critical for pronunciation)
            vad_plugin = silero.VAD.load(
                min_speech_duration=0.06,
                min_silence_duration=0.25,
                activation_threshold=0.40,
                prefix_padding_duration=0.40,
            )

            # Groq LLM: ultra-low latency inference on Groq LPU
            groq_model_name = os.getenv("GROQ_LLM_MODEL", "openai/gpt-oss-120b")
            groq_llm = groq.LLM(
                model=groq_model_name,
                temperature=0.1,  # slight warmth for natural follow-ups
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
        current_turn_id: list[Optional[int]] = [None]
        active_provider_name = stt_config.provider
        active_model_name = getattr(stt_plugin, "model", deepgram_model)

        @session.on("user_state_changed")
        def on_user_state_changed(ev):
            try:
                if ev.new_state == "speaking":
                    current_turn_id[0] = stt_telemetry.start_turn(active_provider_name, str(active_model_name))
                elif ev.old_state == "speaking" and ev.new_state == "listening" and current_turn_id[0]:
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
                        # Always apply noise cancellation for ALL participant types.
                        # BVCTelephony for SIP (phone calls), BVC for all web/WebRTC participants.
                        # This removes background noise, keyboard/fan sounds, and room echo.
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
            logger.info(f"Speaking greeting for {session_id}: {greeting[:100]}...")
            session.say(greeting, add_to_chat_ctx=True)
            logger.info(f"Greeting started successfully for {session_id}")
        except Exception as e:
            logger.error(f"Failed to speak greeting for {session_id}: {e}", exc_info=True)

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
    print("LiveKit URL: [Configured]")
    print("API Endpoint: http://localhost:8000")
    print("Connect at: https://meet.livekit.io")
    print("="*60 + "\n")
    agents.cli.run_app(server)

