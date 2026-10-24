import os
import json
import asyncio
import aiohttp
import shutil
import secrets
from pathlib import Path
from typing import Dict, Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from livekit import api

from gcs_storage import save_recording, list_recordings, RECORDINGS_DIR
from evaluation_service import (
    generate_interview_questions,
    evaluate_interview_session,
    get_evaluation_report,
    list_evaluation_reports,
)

load_dotenv(".env.local")

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
DATA_DIR = BACKEND_DIR / "data"
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

    if not all([livekit_url, api_key, api_secret]):
        return []

    try:
        import re
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

        from rag import ingest_resume
        vectorstore = ingest_resume(pdf_path=pdf_path, persist_directory=RESUME_DB_PATH)

        # Count chunks
        try:
            count = vectorstore._collection.count()
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
        return {
            "has_capacity": True,
            "active_sessions": 0,
            "max_sessions": MAX_CONCURRENT_SESSIONS,
            "message": "Capacity check unavailable",
            "error": str(e),
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
):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    if room.startswith("interview-"):
        cap = await check_capacity()
        if not cap.get("has_capacity", True):
            raise HTTPException(status_code=429, detail=cap.get("message", "Too many sessions"))

    # Save room config
    import json
    config = {
        "room": room,
        "username": username,
        "interview_type": interview_type,
        "topic": topic,
    }
    ROOM_CONFIGS[room] = config
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        SESSION_CONFIG_PATH.write_text(json.dumps(config), encoding="utf-8")
    except Exception as e:
        print(f"Warning: could not write session_config.json: {e}")

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(username)
        .with_name(username)
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .with_metadata(json.dumps({"interview_type": interview_type, "topic": topic}))
    )

    print(f"Token issued: room={room}, user={username}, type={interview_type}, topic={topic}")
    return {"token": token.to_jwt(), "interview_type": interview_type, "topic": topic}


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
            from rag import get_resume_retriever
            r = get_resume_retriever()
            if r:
                db_chunks = r.vectorstore._collection.count()
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


# ─── VIDEO RECORDING & GCS ENDPOINTS ──────────────────────────────────────────

@app.post("/api/interviews/recordings")
async def upload_interview_recording(
    file: UploadFile = File(...),
    session_id: str = Form("session-default"),
):
    """
    Receive interview recording from candidate browser,
    upload to Google Cloud Storage (with automatic local streaming fallback).
    """
    content = await file.read()
    filename = f"{session_id}_{file.filename}"
    res = await save_recording(
        file_bytes=content,
        filename=filename,
        content_type=file.content_type or "video/webm",
        metadata={"session_id": session_id},
    )
    return res


@app.get("/api/interviews/recordings")
async def get_recordings():
    """List all available interview recordings."""
    return {"recordings": list_recordings()}


# ─── EVALUATION & QUALITY SCORECARD ENDPOINTS ───────────────────────────────

@app.post("/api/interviews/evaluate")
async def evaluate_interview(request: Request):
    """
    Generate complete AI evaluation rating, rubric scores,
    'What to Improve', 'Where to Improve', and proctoring integrity score.
    """
    body = await request.json()
    session_id = body.get("session_id", f"session-{secrets.token_hex(4)}")
    transcript = body.get("transcript", "")
    proctoring_logs = body.get("proctoring_logs") or body.get("proctoring_events") or []
    topic = body.get("topic", "Software Engineering")
    video_url = body.get("video_url")
    job_description = body.get("job_description", "")
    candidate_name = body.get("candidate_name", "Saket Suman")
    job_title = body.get("job_title", "L3+ software engineering")

    # Load candidate resume text if available
    resume_text = ""
    try:
        from rag import get_resume_full_text
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
        from rag import get_resume_full_text
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
    print("Token Server Started!\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
