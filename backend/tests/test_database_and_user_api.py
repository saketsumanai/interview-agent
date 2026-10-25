"""
Unit & Integration tests for Zara primary database, deterministic scoring,
user journey APIs, and multi-store account deletion.
"""

import sys
from pathlib import Path

from fastapi.testclient import TestClient

_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

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
from backend.token_server import app

client = TestClient(app)


def test_user_lifecycle_and_onboarding():
    """Test user creation, profile update, and onboarding completion."""
    user_id = "test_user_42"
    delete_user_account_all_stores(user_id)
    user = get_or_create_user(user_id, email="alex@example.com", display_name="Alex River")
    assert user["id"] == user_id
    assert user["email"] == "alex@example.com"
    assert user["onboarding_completed"] == 0

    updated = update_user_profile(
        user_id=user_id,
        profile_data={"education": "B.S. Computer Science", "experience_level": "Senior"},
        skills=["Python", "FastAPI", "Distributed Systems"],
        interview_preferences={"target_role": "Backend Architect", "interview_type": "technical"},
        onboarding_completed=True,
    )
    assert updated["onboarding_completed"] == 1

    profile = get_user_profile(user_id)
    assert profile is not None
    assert profile["skills"] == ["Python", "FastAPI", "Distributed Systems"]
    assert profile["profile_data"]["experience_level"] == "Senior"
    assert profile["onboarding_completed"] is True


def test_resume_persistence():
    """Test candidate resume metadata persistence."""
    user_id = "test_user_resume"
    save_user_resume(
        resume_id="res_1",
        user_id=user_id,
        filename="alex_resume.pdf",
        file_size_bytes=102400,
        extracted_data={
            "skills": ["Python", "Docker", "Kubernetes"],
            "education": ["Stanford University"],
            "experience": ["5 years at TechCorp"],
        },
        chunk_count=6,
        chroma_indexed=True,
    )

    resume = get_user_resume(user_id)
    assert resume is not None
    assert resume["filename"] == "alex_resume.pdf"
    assert "Docker" in resume["extracted_skills"]
    assert resume["chunk_count"] == 6


def test_deterministic_scoring_and_evaluation_persistence():
    """Verify backend authoritative deterministic score calculation."""
    user_id = "test_eval_user"
    session_id = "session_test_42"
    room_name = "interview-room-42"

    create_interview_session(
        session_id=session_id,
        user_id=user_id,
        room_name=room_name,
        job_title="Senior Backend Engineer",
        interview_type="technical",
        topic="Distributed Key-Value Stores",
    )

    # Supply criterion scores (out of 10)
    # Weights: Technical 35%, Problem Solving 25%, Behavioral 20%, Communication 20%
    # Expected: 0.35*(9.0*10) + 0.25*(8.0*10) + 0.20*(8.0*10) + 0.20*(9.0*10)
    # = 31.5 + 20 + 16 + 18 = 85.5 -> round to 86
    eval_payload = {
        "rubric_scores": {
            "technical_competence": {"score": 9.0, "max": 10},
            "problem_solving_architecture": {"score": 8.0, "max": 10},
            "behavioral_star_method": {"score": 8.0, "max": 10},
            "communication_clarity": {"score": 9.0, "max": 10},
        },
        "integrity_score": 98,
        "strengths": ["Clear distributed systems knowledge"],
        "what_to_improve": ["Quantify past latency reductions"],
        "where_to_improve": ["Raft consensus edge-cases"],
    }

    res = save_evaluation_result(session_id, user_id, eval_payload)
    assert res["overall_score"] == 86

    # Verify report retrieval
    report = get_interview_report(session_id, user_id=user_id)
    assert report is not None
    assert report["overall_score"] == 86
    assert report["technical_score"] == 90
    assert report["problem_solving_score"] == 80
    assert report["integrity_score"] == 98
    assert len(report["strengths"]) == 1

    # Verify interview listing
    interviews = get_user_interviews(user_id)
    assert len(interviews) == 1
    assert interviews[0]["session_id"] == session_id
    assert interviews[0]["overall_score"] == 86


def test_cross_store_account_deletion():
    """Verify Phase 5.5 & Phase 9 cross-store account deletion."""
    user_id = "test_user_delete_me"
    get_or_create_user(user_id, email="temp@test.io")

    create_interview_session(
        session_id="session_delete_test",
        user_id=user_id,
        room_name="interview-delete-room",
        job_title="SRE",
        topic="Linux Internals",
    )

    save_evaluation_result(
        session_id="session_delete_test",
        user_id=user_id,
        eval_data={"rubric_scores": {}, "integrity_score": 100},
    )

    audit = delete_user_account_all_stores(user_id)
    assert audit["primary_db_deleted"] is True
    assert audit["chromadb_purged"] is True
    assert audit["status"] == "completed"

    # Verify records no longer exist in primary database
    assert get_user_profile(user_id) is None
    assert len(get_user_interviews(user_id)) == 0


def test_zero_permanent_recording_policy():
    """Verify that video recordings are never saved to disk under Phase 10 privacy policy."""
    res = client.post("/api/interviews/recordings")
    assert res.status_code == 200
    data = res.json()
    assert data["recording_disabled"] is True
    assert "Zero" in data["message"]

    list_res = client.get("/api/interviews/recordings")
    assert list_res.status_code == 200
    assert list_res.json()["recordings"] == []


def test_benchmark_metrics_endpoint():
    """Verify transparent benchmark metrics endpoint returns actual dataset results."""
    res = client.get("/api/benchmarks/latest")
    assert res.status_code == 200
    data = res.json()
    assert "benchmark_version" in data
    assert "stt_wer" in data
    assert "stt_p50_latency_ms" in data
    assert "eval_agreement_pct" in data
    assert "api_success_rate" in data
    assert data["sample_size"] > 0
