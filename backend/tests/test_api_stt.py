"""
API Integration Tests for STT Endpoints and Health Checks.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from token_server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_api_health_providers(client):
    response = client.get("/api/health/providers")
    assert response.status_code == 200
    data = response.json()
    assert "overall_status" in data
    assert "providers" in data
    assert "deepgram" in data["providers"]
    assert "groq" in data["providers"]
    assert "livekit" in data["providers"]

    # Verify credentials are NEVER exposed in health check
    for prov_name, prov_info in data["providers"].items():
        assert "api_key" not in prov_info
        assert "secret" not in prov_info


def test_api_stt_config_get(client):
    response = client.get("/api/stt/config")
    assert response.status_code == 200
    data = response.json()
    assert "active_provider" in data
    assert "supported_providers" in data
    assert "deepgram" in data["supported_providers"]
    assert "groq" in data["supported_providers"]
    assert "supported_models" in data
    assert "flux-general-en" in data["supported_models"]["deepgram"]
    assert "nova-3" in data["supported_models"]["deepgram"]


def test_api_stt_config_switch_to_groq(client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_valid_key")
    response = client.post("/api/stt/config", json={
        "provider": "groq",
        "model": "whisper-large-v3-turbo"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["active_provider"] == "groq"
    assert data["model"] == "whisper-large-v3-turbo"


def test_api_stt_config_missing_key_rejection(client, monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    response = client.post("/api/stt/config", json={
        "provider": "deepgram",
        "model": "flux-general-en"
    })
    assert response.status_code == 400
    assert "DEEPGRAM_API_KEY is not configured" in response.json()["detail"]


def test_api_stt_metrics(client):
    response = client.get("/api/stt/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "total_turns" in data
    assert "latency_ms" in data
    assert "first_interim" in data["latency_ms"]
    assert "final_transcript" in data["latency_ms"]
    assert "voice_turnaround" in data["latency_ms"]


def test_api_stt_benchmark_endpoint(client):
    with patch("token_server.run_stt_benchmark") as mock_bench:
        mock_bench.return_value = {
            "benchmark_timestamp": 12345.0,
            "reference_text": "We deployed microservices to Kubernetes.",
            "results": {
                "deepgram": {"provider": "deepgram", "success": True, "latency_ms": 150},
                "groq": {"provider": "groq", "success": True, "latency_ms": 190},
            },
            "summary": {"fastest_provider": "deepgram", "latency_delta_ms": 40}
        }
        response = client.post("/api/stt/benchmark", data={
            "reference_text": "We deployed microservices to Kubernetes.",
            "deepgram_model": "nova-3",
            "groq_model": "whisper-large-v3-turbo"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["summary"]["fastest_provider"] == "deepgram"
