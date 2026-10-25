import json
import logging
import os
import secrets
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import aiohttp

_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _BACKEND_DIR.parent
for _d in (str(_BACKEND_DIR), str(_PROJECT_DIR)):
    if _d not in sys.path:
        sys.path.insert(0, _d)

logger = logging.getLogger(__name__)
from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from livekit import api

try:
    from backend.database import (
        create_interview_session,
        delete_user_account_all_stores,
        get_interview_report,
        get_latest_benchmark_metrics,
        get_or_create_user,
        get_user_interviews,
        get_user_profile,
        get_user_resume,
        save_evaluation_result,
        save_user_resume,
        update_user_profile,
    )
    from backend.evaluation_service import (
        evaluate_interview_session,
        generate_interview_questions,
        get_evaluation_report,
        list_evaluation_reports,
    )
    from backend.gcs_storage import RECORDINGS_DIR, list_recordings, save_recording
    from backend.rag import get_resume_full_text, get_resume_retriever, ingest_resume
    from backend.stt_benchmark import run_stt_benchmark
    from backend.stt_metrics import stt_telemetry
    from backend.stt_provider import (
        DeepgramModelType,
        GroqModelType,
        MissingCredentialError,
        STTConfig,
        STTProviderType,
        validate_stt_config,
    )
except ImportError:
    from database import (  # type: ignore
        create_interview_session,
        delete_user_account_all_stores,
        get_interview_report,
        get_latest_benchmark_metrics,
        get_or_create_user,
        get_user_interviews,
        get_user_profile,
        get_user_resume,
        save_evaluation_result,
        save_user_resume,
        update_user_profile,
    )
    from evaluation_service import (  # type: ignore
        evaluate_interview_session,
        generate_interview_questions,
        get_evaluation_report,
        list_evaluation_reports,
    )
    from gcs_storage import (  # type: ignore
        RECORDINGS_DIR,
        list_recordings,
        save_recording,
    )
    from rag import (  # type: ignore
        get_resume_full_text,
        get_resume_retriever,
        ingest_resume,
    )
    from stt_benchmark import run_stt_benchmark  # type: ignore
    from stt_metrics import stt_telemetry  # type: ignore
    from stt_provider import (  # type: ignore
        DeepgramModelType,
        GroqModelType,
        MissingCredentialError,
        STTConfig,
        STTProviderType,
        validate_stt_config,
    )
import time

load_dotenv(Path(__file__).parent / ".env.local")

app = FastAPI(title="Interview Coach API with Proctoring & GCS", version="3.0.0")

# Mount recordings directory for local/fallback video streaming playback
app.mount("/recordings", StaticFiles(directory=str(RECORDINGS_DIR)), name="recordings")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
MAX_CONCURRENT_SESSIONS = 5
BACKEND_DIR = Path(__file__).parent
if os.getenv("VERCEL") or not os.access(BACKEND_DIR, os.W_OK):
    DATA_DIR = Path("/tmp") / "data"
else:
    DATA_DIR = BACKEND_DIR / "data"

try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    DATA_DIR = Path("/tmp") / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)

RESUME_PATH = DATA_DIR / "resume.pdf"
RESUME_DB_PATH = DATA_DIR / "resume_chroma_db"
MAX_RESUME_SIZE_MB = 10
ALLOWED_MIME_TYPES = {"application/pdf"}

# Simple token store for admin auth (production: use a real DB)
ADMIN_SESSIONS: Dict[str, str] = {}
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")  # Override in .env.local

# Resume ingestion status tracking
resume_status = {"state": "none", "filename": None, "chunks": 0, "error": None}


# ─── HELPERS ──────────────────────────────────────────────────────────────────

async def get_active_rooms() -> list[Dict[str, Any]]:
    livekit_url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not livekit_url or not api_key or not api_secret:
        return []

    try:
        host = livekit_url.replace("ws://", "http://").replace("wss://", "https://")
        token = api.AccessToken(api_key, api_secret).with_grants(api.VideoGrants()).to_jwt()

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{host}/twirp/livekit.RoomService/ListRooms",
                headers={"Authorization": f"Bearer {token}"},
                json={}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    rooms = data.get("rooms", [])
                    return [
                        r for r in rooms
                        if r.get("name", "").startswith("interview-") and r.get("numParticipants", 0) > 0
                    ]
        return []
    except Exception as e:
        print(f"Error getting active rooms: {e}")
        return []


async def run_resume_ingestion(pdf_path: Path, filename: str):
    """Background task: ingest resume PDF into ChromaDB."""
    global resume_status
    resume_status = {"state": "processing", "filename": filename, "chunks": 0, "error": None}

    try:
        # Clear old DB
        if RESUME_DB_PATH.exists():
            shutil.rmtree(RESUME_DB_PATH)

        vectorstore = ingest_resume(pdf_path=pdf_path, persist_directory=RESUME_DB_PATH)

        # Count chunks
        try:
            coll = getattr(vectorstore, "_collection", None)
            count = coll.count() if coll else 0
        except Exception:
            count = 0

        resume_status = {
            "state": "ready",
            "filename": filename,
            "chunks": count,
            "error": None,
        }
        print(f"✅ Resume ingested: {count} chunks")

    except Exception as e:
        resume_status = {
            "state": "error",
            "filename": filename,
            "chunks": 0,
            "error": str(e),
        }
        print(f"❌ Resume ingestion failed: {e}")


# ─── PUBLIC ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/livekit-url")
async def get_livekit_url():
    url = os.getenv("LIVEKIT_URL")
    if not url:
        return {"error": "LIVEKIT_URL not configured"}
    return {"url": url}


@app.get("/capacity-check")
async def check_capacity():
    try:
        rooms = await get_active_rooms()
        count = len(rooms)
        has_capacity = count < MAX_CONCURRENT_SESSIONS
        return {
            "has_capacity": has_capacity,
            "active_sessions": count,
            "max_sessions": MAX_CONCURRENT_SESSIONS,
            "message": "Capacity available" if has_capacity else "Maximum concurrent interviews reached.",
        }
    except Exception as e:
        logger.error(f"Capacity check error: {e}")
        return {
            "has_capacity": True,
            "active_sessions": 0,
            "max_sessions": MAX_CONCURRENT_SESSIONS,
            "message": "Capacity check temporarily unavailable",
        }


ROOM_CONFIGS: Dict[str, Dict[str, Any]] = {}
SESSION_CONFIG_PATH = DATA_DIR / "session_config.json"
RESUME_TEXT_PATH = DATA_DIR / "resume_text.txt"


@app.get("/room-config/{room}")
async def get_room_config(room: str):
    """Retrieve session configuration (topic, interview_type) for a room."""
    if room in ROOM_CONFIGS:
        return ROOM_CONFIGS[room]
    if SESSION_CONFIG_PATH.exists():
        try:
            import json
            data = json.loads(SESSION_CONFIG_PATH.read_text(encoding="utf-8"))
            return data
        except Exception:
            pass
    return {
        "room": room,
        "interview_type": "full",
        "topic": "Full Stack Development & System Design",
    }


@app.get("/token")
async def get_token(
    room: str,
    username: str,
    interview_type: str = "full",
    topic: str = "Full Stack Development & System Design",
    stt_provider: Optional[str] = None,
    deepgram_model: Optional[str] = None,
):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    if room.startswith("interview-"):
        cap = await check_capacity()
        if not cap.get("has_capacity", True):
            raise HTTPException(status_code=429, detail=cap.get("message", "Too many sessions"))

    resolved_stt_provider = stt_provider or os.getenv("STT_PROVIDER", "deepgram")
    resolved_dg_model = deepgram_model or os.getenv("DEEPGRAM_MODEL", "flux-general-en")

    # Save room config
    config = {
        "room": room,
        "username": username,
        "interview_type": interview_type,
        "topic": topic,
        "stt_provider": resolved_stt_provider,
        "deepgram_model": resolved_dg_model,
    }
    ROOM_CONFIGS[room] = config
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        SESSION_CONFIG_PATH.write_text(json.dumps(config), encoding="utf-8")
    except Exception as e:
        print(f"Warning: could not write session_config.json: {e}")

    meta = {
        "interview_type": interview_type,
        "topic": topic,
        "stt_provider": resolved_stt_provider,
        "deepgram_model": resolved_dg_model,
    }

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(username)
        .with_name(username)
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .with_metadata(json.dumps(meta))
    )

    # Persist interview session in primary database
    try:
        session_id = f"session_{room}"
        create_interview_session(
            session_id=session_id,
            user_id=username,
            room_name=room,
            job_title=topic,
            interview_type=interview_type,
            topic=topic,
        )
    except Exception as e:
        logger.warning(f"Could not record interview session in primary DB: {e}")

    logger.info(f"Granted room entry: room={room}, user={username}, type={interview_type}, topic={topic}, stt={resolved_stt_provider}")
    return {
        "token": token.to_jwt(),
        "interview_type": interview_type,
        "topic": topic,
        "stt_provider": resolved_stt_provider,
        "deepgram_model": resolved_dg_model,
    }


# ─── STT & PROVIDER HEALTH ENDPOINTS ────────────────────────────────────────

@app.get("/api/health/providers")
async def health_check_providers():
    """
    Health check for all AI and speech providers without leaking credentials.
    Verifies actual connectivity and returns latency.
    """
    results: Dict[str, Any] = {}

    # 1. Deepgram Check
    dg_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if dg_key:
        try:
            t0 = time.time()
            async with aiohttp.ClientSession() as s:
                async with s.get(
                    "https://api.deepgram.com/v1/projects",
                    headers={"Authorization": f"Token {dg_key}"},
                    timeout=aiohttp.ClientTimeout(total=4.0)
                ) as r:
                    lat_ms = round((time.time() - t0) * 1000, 1)
                    if r.status in (200, 201):
                        results["deepgram"] = {
                            "configured": True,
                            "status": "healthy",
                            "latency_ms": lat_ms,
                            "models": ["flux-general-en", "nova-3", "nova-2"],
                            "streaming_protocol": "WebSocket (v2 for Flux, v1 for Nova-3)",
                        }
                    elif r.status in (401, 403):
                        results["deepgram"] = {
                            "configured": True,
                            "status": "unauthorized",
                            "error": "DEEPGRAM_API_KEY rejected by Deepgram API (HTTP 401/403)",
                            "latency_ms": lat_ms,
                        }
                    else:
                        results["deepgram"] = {
                            "configured": True,
                            "status": f"http_{r.status}",
                            "latency_ms": lat_ms,
                        }
        except Exception as e:
            results["deepgram"] = {
                "configured": True,
                "status": "unreachable",
                "error": str(e),
            }
    else:
        results["deepgram"] = {
            "configured": False,
            "status": "missing_credentials",
            "error": "DEEPGRAM_API_KEY is not configured in backend/.env.local.",
            "models": ["flux-general-en", "nova-3", "nova-2"],
        }

    # 2. Groq Check
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        try:
            t0 = time.time()
            async with aiohttp.ClientSession() as s, s.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {groq_key}"},
                timeout=aiohttp.ClientTimeout(total=4.0)
            ) as r:
                lat_ms = round((time.time() - t0) * 1000, 1)
                if r.status == 200:
                    results["groq"] = {
                        "configured": True,
                        "status": "healthy",
                        "latency_ms": lat_ms,
                        "models": ["whisper-large-v3-turbo", "whisper-large-v3"],
                    }
                else:
                    results["groq"] = {
                        "configured": True,
                        "status": f"http_{r.status}",
                        "latency_ms": lat_ms,
                    }
        except Exception as e:
            results["groq"] = {
                "configured": True,
                "status": "unreachable",
                "error": str(e),
            }
    else:
        results["groq"] = {
            "configured": False,
            "status": "missing_credentials",
        }

    # 3. AssemblyAI Check
    aai_key = os.getenv("ASSEMBLYAI_API_KEY", "").strip()
    results["assemblyai"] = {
        "configured": bool(aai_key),
        "status": "configured" if aai_key else "missing_credentials",
    }

    # 4. Cartesia TTS Check
    cartesia_key = os.getenv("CARTESIA_API_KEY", "").strip()
    results["cartesia"] = {
        "configured": bool(cartesia_key),
        "status": "configured" if cartesia_key else "missing_credentials",
    }

    # 5. LiveKit Cloud Check
    lk_url = os.getenv("LIVEKIT_URL", "").strip()
    lk_key = os.getenv("LIVEKIT_API_KEY", "").strip()
    lk_sec = os.getenv("LIVEKIT_API_SECRET", "").strip()
    results["livekit"] = {
        "configured": bool(lk_url and lk_key and lk_sec),
        "status": "configured" if (lk_url and lk_key and lk_sec) else "missing_credentials",
        "url": lk_url or "not_configured",
    }

    overall_healthy = (
        (results["deepgram"].get("status") == "healthy" or results["groq"].get("status") == "healthy")
        and results["livekit"]["configured"]
    )

    return {
        "timestamp": time.time(),
        "overall_status": "healthy" if overall_healthy else "degraded",
        "active_stt_provider": os.getenv("STT_PROVIDER", "deepgram"),
        "providers": results,
    }


@app.get("/api/stt/config")
async def get_stt_configuration():
    """Retrieve current STT provider configuration and capabilities."""
    return {
        "active_provider": os.getenv("STT_PROVIDER", "deepgram"),
        "deepgram_model": os.getenv("DEEPGRAM_MODEL", "flux-general-en"),
        "groq_model": os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo"),
        "supported_providers": [p.value for p in STTProviderType],
        "supported_models": {
            "deepgram": [m.value for m in DeepgramModelType],
            "groq": [m.value for m in GroqModelType],
        },
        "endpointing": {
            "nova3_endpointing_ms": int(os.getenv("DEEPGRAM_ENDPOINTING_MS", 300)),
            "flux_eot_threshold": float(os.getenv("DEEPGRAM_EOT_THRESHOLD", 0.75)),
            "flux_eot_timeout_ms": int(os.getenv("DEEPGRAM_EOT_TIMEOUT_MS", 2500)),
        },
        "credentials_status": {
            "deepgram": bool(os.getenv("DEEPGRAM_API_KEY")),
            "groq": bool(os.getenv("GROQ_API_KEY")),
            "assemblyai": bool(os.getenv("ASSEMBLYAI_API_KEY")),
        }
    }


@app.post("/api/stt/config")
async def set_stt_configuration(request: Request):
    """
    Dynamically configure active STT provider and model.
    Never persists keys from client; only switches provider selection.
    """
    body = await request.json()
    provider = body.get("provider", "deepgram").lower().strip()
    model = body.get("model")

    if provider not in [p.value for p in STTProviderType]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider '{provider}'. Must be one of {[p.value for p in STTProviderType]}"
        )

    # Check that required server-side credentials exist
    if provider == "deepgram" and not os.getenv("DEEPGRAM_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="DEEPGRAM_API_KEY is not configured in backend/.env.local. Add your key or select 'groq'."
        )
    elif provider == "groq" and not os.getenv("GROQ_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="GROQ_API_KEY is not configured in backend/.env.local."
        )

    # Apply configuration
    os.environ["STT_PROVIDER"] = provider
    if model:
        if provider == "deepgram":
            os.environ["DEEPGRAM_MODEL"] = model
        elif provider == "groq":
            os.environ["GROQ_STT_MODEL"] = model

    # Update session_config.json if present
    if SESSION_CONFIG_PATH.exists():
        try:
            curr = json.loads(SESSION_CONFIG_PATH.read_text(encoding="utf-8"))
            curr["stt_provider"] = provider
            if model:
                curr["deepgram_model"] = model
            SESSION_CONFIG_PATH.write_text(json.dumps(curr), encoding="utf-8")
        except Exception:
            pass

    return {
        "status": "success",
        "active_provider": provider,
        "model": model or os.getenv("DEEPGRAM_MODEL" if provider == "deepgram" else "GROQ_STT_MODEL"),
    }


@app.get("/api/stt/metrics")
async def get_stt_metrics():
    """Retrieve rolling p50/p95 latency and transcription error rates."""
    return stt_telemetry.get_summary_metrics()


@app.post("/api/stt/benchmark")
async def run_benchmark_endpoint(
    reference_text: Optional[str] = Form(None),
    deepgram_model: Optional[str] = Form("nova-3"),
    groq_model: Optional[str] = Form("whisper-large-v3-turbo"),
    audio_file: Optional[UploadFile] = File(None),
):
    """
    Run benchmark comparing Deepgram vs Groq without double-processing live interviews.
    Can accept uploaded audio or auto-generate synthetic audio with technical terminology.
    """
    audio_bytes = None
    if audio_file:
        audio_bytes = await audio_file.read()

    results = await run_stt_benchmark(
        audio_bytes=audio_bytes,
        reference_text=reference_text,
        deepgram_model=deepgram_model or "nova-3",
        groq_model=groq_model or "whisper-large-v3-turbo",
    )
    return results


# ─── RESUME ENDPOINTS ─────────────────────────────────────────────────────────

@app.post("/upload-resume")
async def upload_resume(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload and ingest a candidate's resume PDF."""
    # Validate file type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must have a .pdf extension.")

    # Read and validate size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_RESUME_SIZE_MB:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_RESUME_SIZE_MB}MB.")

    if len(content) < 1000:
        raise HTTPException(status_code=400, detail="File appears to be empty or corrupt.")

    # Save to disk
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(RESUME_PATH, "wb") as f:
        f.write(content)

    # Trigger background ingestion
    background_tasks.add_task(run_resume_ingestion, RESUME_PATH, file.filename)

    return {
        "status": "uploaded",
        "filename": file.filename,
        "size_kb": round(len(content) / 1024, 1),
        "message": "Resume uploaded. Ingestion started in background.",
    }


@app.get("/resume-status")
async def get_resume_status():
    """Check the current state of resume ingestion."""
    return {
        "has_resume": RESUME_PATH.exists(),
        "is_ingested": resume_status["state"] == "ready",
        **resume_status,
    }


@app.delete("/resume")
async def delete_resume():
    """Delete the uploaded resume and its vector DB."""
    global resume_status
    deleted = []

    if RESUME_PATH.exists():
        RESUME_PATH.unlink()
        deleted.append("resume.pdf")

    if RESUME_TEXT_PATH.exists():
        RESUME_TEXT_PATH.unlink()
        deleted.append("resume_text.txt")

    if RESUME_DB_PATH.exists():
        shutil.rmtree(RESUME_DB_PATH)
        deleted.append("resume_chroma_db")

    resume_status = {"state": "none", "filename": None, "chunks": 0, "error": None}
    return {"deleted": deleted, "message": "Resume cleared successfully."}


# ─── ADMIN AUTH ENDPOINTS ─────────────────────────────────────────────────────

@app.post("/admin/login")
async def admin_login(request: Request):
    body = await request.json()
    password = body.get("password", "")

    if not secrets.compare_digest(password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = secrets.token_hex(32)
    ADMIN_SESSIONS[token] = "admin"
    return {"token": token, "role": "admin"}


def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())):
    if credentials.credentials not in ADMIN_SESSIONS:
        raise HTTPException(status_code=403, detail="Not authorized")
    return credentials.credentials


@app.get("/admin/stats")
async def admin_stats(admin=Depends(verify_admin)):
    """Admin dashboard stats."""
    rooms = await get_active_rooms()
    resume_exists = RESUME_PATH.exists()
    resume_size = round(RESUME_PATH.stat().st_size / 1024, 1) if resume_exists else 0

    db_chunks = 0
    if RESUME_DB_PATH.exists():
        try:
            r = get_resume_retriever()
            if r:
                coll = getattr(getattr(r, "vectorstore", None), "_collection", None)
                db_chunks = coll.count() if coll else 0
        except Exception:
            pass

    return {
        "active_sessions": len(rooms),
        "max_sessions": MAX_CONCURRENT_SESSIONS,
        "active_rooms": [r.get("name") for r in rooms],
        "resume": {
            "uploaded": resume_exists,
            "filename": resume_status.get("filename"),
            "size_kb": resume_size,
            "chunks": resume_status.get("chunks", db_chunks),
            "state": resume_status.get("state", "none"),
        },
        "project_docs": {
            "ingested": (DATA_DIR / "chroma_db").exists(),
        },
    }


# ─── USER AUTH & PROFILE HELPERS ──────────────────────────────────────────────

def get_auth_user_id(request: Request) -> str:
    """Extract and sanitize authenticated user ID from Authorization header, X-User-Id, or query param."""
    raw_uid = request.headers.get("X-User-Id", "")
    if not raw_uid:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            if token and len(token) > 5 and not token.startswith("offline"):
                raw_uid = token[:40]
    if not raw_uid:
        raw_uid = request.query_params.get("user_id", "") or "candidate_default"

    # Sanitize to valid identifier
    sanitized = "".join(c for c in raw_uid if c.isalnum() or c in ("-", "_", "@", "."))[:64]
    return sanitized or "candidate_default"


@app.get("/api/user/profile")
async def get_profile_endpoint(request: Request):
    """Retrieve full authenticated user profile, preferences, and resume status."""
    user_id = get_auth_user_id(request)
    profile = get_user_profile(user_id)
    if not profile:
        profile = get_or_create_user(user_id)
    resume = get_user_resume(user_id)
    return JSONResponse(content={"profile": profile, "resume": resume})


@app.post("/api/user/profile")
async def update_profile_endpoint(request: Request):
    """Save onboarding progress, career preferences, and candidate-edited skills."""
    user_id = get_auth_user_id(request)
    body = await request.json()
    res = update_user_profile(
        user_id=user_id,
        profile_data=body.get("profile_data"),
        skills=body.get("skills"),
        interview_preferences=body.get("interview_preferences"),
        onboarding_completed=body.get("onboarding_completed"),
        display_name=body.get("display_name"),
    )
    return JSONResponse(content={"status": "success", "profile": res})


@app.get("/api/user/interviews")
async def list_user_interviews_endpoint(request: Request):
    """List authenticated user's past interview sessions with deterministic scores."""
    user_id = get_auth_user_id(request)
    interviews = get_user_interviews(user_id)
    return JSONResponse(content={"interviews": interviews})


@app.get("/api/user/interviews/{session_id}")
async def get_user_interview_endpoint(session_id: str, request: Request):
    """Retrieve complete scorecard for a specific user interview."""
    user_id = get_auth_user_id(request)
    report = get_interview_report(session_id, user_id=user_id)
    if not report:
        # Fallback to global search if session was created prior
        report = get_evaluation_report(session_id)
        if not report:
            raise HTTPException(status_code=404, detail="Interview evaluation not found")
    return JSONResponse(content=report)


@app.delete("/api/user/account")
async def delete_user_account_endpoint(request: Request):
    """
    Permanent cross-store deletion (Phase 5.5 and Phase 9):
    Purges SQLite primary records, ChromaDB embeddings, and disk files.
    """
    user_id = get_auth_user_id(request)
    audit = delete_user_account_all_stores(user_id)
    return JSONResponse(content={
        "status": "success",
        "message": "Account and all associated records permanently purged across all stores.",
        "audit": audit,
    })


@app.get("/api/benchmarks/latest")
async def get_latest_benchmarks_endpoint():
    """Retrieve verified model evaluation benchmark metrics."""
    return JSONResponse(content=get_latest_benchmark_metrics())


# ─── PRIVACY COMPLIANT RECORDINGS (ZERO MEDIA RETENTION) ──────────────────────

@app.post("/api/interviews/recordings")
async def upload_interview_recording():
    """
    Enforces Phase 5.5 & Phase 10: ZERO PERMANENT VIDEO/AUDIO RECORDING RETENTION.
    Candidate camera frames are analyzed ephemerally in-memory only.
    No video or audio files are written to disk or cloud storage.
    """
    return {
        "recording_disabled": True,
        "storage_provider": "None (Zero Retention Privacy Enforced)",
        "message": "Zero permanent audio/video retention policy enforced. Candidate media is processed ephemerally in-memory.",
        "video_url": "",
    }


@app.get("/api/interviews/recordings")
async def get_recordings():
    """List all available recordings (enforces empty list under privacy policy)."""
    return {"recordings": []}


# ─── EVALUATION & QUALITY SCORECARD ENDPOINTS ───────────────────────────────

@app.post("/api/interviews/evaluate")
async def evaluate_interview(request: Request):
    """
    Generate complete AI evaluation rating, rubric scores,
    'What to Improve', 'Where to Improve', and proctoring integrity score.
    Saves authoritative results into primary SQLite database.
    """
    body = await request.json()
    user_id = get_auth_user_id(request)
    session_id = body.get("session_id", f"session-{secrets.token_hex(4)}")
    transcript = body.get("transcript", "")
    proctoring_logs = body.get("proctoring_logs") or body.get("proctoring_events") or []
    topic = body.get("topic", "Software Engineering")
    video_url = ""  # Zero media retention enforced
    job_description = body.get("job_description", "")
    candidate_name = body.get("candidate_name", "Saket Suman")
    job_title = body.get("job_title", "L3+ software engineering")

    # Load candidate resume text if available
    resume_text = ""
    try:
        resume_text = get_resume_full_text()
    except Exception:
        pass

    report = await evaluate_interview_session(
        session_id=session_id,
        transcript=transcript,
        resume_text=resume_text,
        job_description=job_description,
        proctoring_logs=proctoring_logs,
        topic=topic,
        video_url=video_url,
    )
    report["candidate_name"] = candidate_name
    report["job_title"] = job_title

    # Persist authoritative evaluation in SQLite
    try:
        save_evaluation_result(
            session_id=session_id,
            user_id=user_id,
            eval_data=report,
        )
    except Exception as e:
        logger.warning(f"Could not save evaluation result to primary DB: {e}")

    return JSONResponse(content=report)


@app.get("/api/interviews/reports")
async def get_all_reports():
    """List all evaluation scorecards."""
    return {"reports": list_evaluation_reports()}


@app.get("/api/interviews/reports/{session_id}")
async def get_single_report(session_id: str):
    """Retrieve full evaluation scorecard by session ID."""
    report = get_evaluation_report(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Evaluation report not found")
    return report


# ─── RECRUITER INTERVIEW CONFIGURATION & QUESTION GENERATION ────────────────

RECRUITER_INTERVIEWS_DIR = DATA_DIR / "interviews"
RECRUITER_INTERVIEWS_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/recruiter/configure-interview")
async def configure_recruiter_interview(request: Request):
    """
    Configure an interview with Job Title, JD, required skills,
    and generate 10 structured questions matched against resume + JD.
    """
    body = await request.json()
    job_title = body.get("job_title", "Software Engineer")
    job_description = body.get("job_description", "")
    required_skills = body.get("required_skills", "General Engineering")
    experience_level = body.get("experience_level", "Mid")
    question_count = int(body.get("question_count", 10))
    categories = body.get("categories", ["Technical", "Behavioral (STAR)", "System Design", "Project Deep Dive"])
    custom_questions = body.get("custom_questions", [])

    # Load resume text
    resume_text = ""
    try:
        resume_text = get_resume_full_text()
    except Exception:
        pass

    generated = await generate_interview_questions(
        job_title=job_title,
        job_description=job_description,
        required_skills=required_skills,
        experience_level=experience_level,
        question_count=question_count,
        categories=categories,
        custom_questions=custom_questions,
        resume_text=resume_text,
    )

    interview_id = f"job-{secrets.token_hex(4)}"
    interview_data = {
        "id": interview_id,
        "job_title": job_title,
        "job_description": job_description,
        "required_skills": required_skills,
        "experience_level": experience_level,
        "question_count": question_count,
        "categories": categories,
        "custom_questions": custom_questions,
        "has_resume": bool(resume_text),
        "generated": generated,
    }

    # Save to disk
    interview_file = RECRUITER_INTERVIEWS_DIR / f"{interview_id}.json"
    interview_file.write_text(json.dumps(interview_data, indent=2), encoding="utf-8")

    return interview_data


@app.get("/api/recruiter/interviews")
async def list_recruiter_interviews():
    """List all recruiter-configured interviews."""
    interviews = []
    for f in RECRUITER_INTERVIEWS_DIR.glob("*.json"):
        try:
            interviews.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            continue
    return {"interviews": interviews}


if __name__ == "__main__":
    import uvicorn
    print("Backend Server Started!\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
