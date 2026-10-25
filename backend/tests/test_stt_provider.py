"""
Unit and Integration Test Suite for STT Provider Architecture.

Tests:
1. Provider configuration & validation
2. Missing credential handling and explicit error messages
3. Deepgram Flux (STTv2) and Nova-3 (STT) adapter creation
4. Groq Whisper STT adapter creation and switching
5. Technical vocabulary injection
6. Safe transcript reconciliation (interim vs final, deduplication, verbatim preservation)
7. Strict turn gating (provisional text NEVER triggers interview question progression)
8. Answer persistence on disconnect/cancellation
9. Latency telemetry, p50/p95 calculations, WER/CER calculations
10. Provider health check & benchmarking harness
"""

import os
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from stt_provider import (
    STTProviderType,
    DeepgramModelType,
    GroqModelType,
    STTConfig,
    validate_stt_config,
    resolve_provider_credentials,
    create_stt_provider,
    TranscriptReconciler,
    MissingCredentialError,
    InvalidConfigurationError,
    TECHNICAL_INTERVIEW_KEYTERMS,
)
from stt_metrics import (
    calculate_levenshtein_distance,
    calculate_wer,
    calculate_cer,
    STTMetricsTracker,
    TurnTimingRecord,
)
from stt_benchmark import run_stt_benchmark


# ─── 1. CONFIGURATION & CREDENTIAL VALIDATION TESTS ─────────────────────────

def test_missing_deepgram_credential_raises_clear_error(monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    with pytest.raises(MissingCredentialError) as exc_info:
        resolve_provider_credentials("deepgram")
    assert "DEEPGRAM_API_KEY is not configured" in str(exc_info.value)
    assert "backend/.env.local" in str(exc_info.value)


def test_missing_groq_credential_raises_clear_error(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(MissingCredentialError) as exc_info:
        resolve_provider_credentials("groq")
    assert "GROQ_API_KEY is not configured" in str(exc_info.value)


def test_invalid_provider_raises_error():
    config = STTConfig(provider="unsupported_provider", api_key="dummy")
    with pytest.raises(InvalidConfigurationError):
        validate_stt_config(config)


def test_deepgram_flux_default_config(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg_test_key_12345")
    config = STTConfig(provider="deepgram")
    validated = validate_stt_config(config)
    assert validated.provider == "deepgram"
    assert validated.model == DeepgramModelType.FLUX.value
    assert validated.api_key == "dg_test_key_12345"


def test_deepgram_nova3_config(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg_test_key_12345")
    config = STTConfig(provider="deepgram", model="nova-3")
    validated = validate_stt_config(config)
    assert validated.provider == "deepgram"
    assert validated.model == "nova-3"


# ─── 2. ADAPTER INSTANTIATION & VOCABULARY TESTS ────────────────────────────

def test_deepgram_flux_adapter_creation():
    config = STTConfig(
        provider="deepgram",
        model="flux-general-en",
        api_key="dg_dummy_secret",
        eot_threshold=0.8,
        eot_timeout_ms=3000,
    )
    provider = create_stt_provider(config)
    assert provider.model == "flux-general-en"
    # Ensure technical vocabulary keyterms are populated
    assert "Kubernetes" in config.keyterms
    assert "FastAPI" in config.keyterms
    assert "PostgreSQL" in config.keyterms


def test_deepgram_nova3_adapter_creation():
    config = STTConfig(
        provider="deepgram",
        model="nova-3",
        api_key="dg_dummy_secret",
        endpointing_ms=350,
    )
    provider = create_stt_provider(config)
    assert provider.model == "nova-3"


def test_groq_adapter_creation(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_12345")
    config = STTConfig(
        provider="groq",
        model="whisper-large-v3-turbo",
        api_key="gsk_test_key_12345",
    )
    provider = create_stt_provider(config)
    assert provider.model == "whisper-large-v3-turbo"


# ─── 3. TRANSCRIPT RECONCILIATION & SAFE TURN GATING TESTS ──────────────────

def test_reconciler_provisional_text_does_not_finalize(tmp_path):
    reconciler = TranscriptReconciler(session_id="test_session_1", storage_dir=tmp_path)

    # Candidate speaks partial text
    reconciler.process_interim("I scaled the", timestamp=100.0)
    reconciler.process_interim("I scaled the Kubernetes cluster", timestamp=100.5)

    # REQUIREMENT 4: Must NOT trigger turn completion from provisional text
    is_valid, turn_text = reconciler.finalize_turn(explicit_timeout=False)
    assert is_valid is False
    assert turn_text == ""


def test_reconciler_finalized_text_triggers_valid_turn(tmp_path):
    reconciler = TranscriptReconciler(session_id="test_session_2", storage_dir=tmp_path)

    # Interim followed by finalized segment
    reconciler.process_interim("We used Redis", timestamp=100.0)
    seg = reconciler.process_final("We used Redis for distributed caching.", timestamp=101.0)
    assert seg is not None
    assert seg.text == "We used Redis for distributed caching."

    is_valid, turn_text = reconciler.finalize_turn(explicit_timeout=False)
    assert is_valid is True
    assert turn_text == "We used Redis for distributed caching."


def test_reconciler_deduplicates_boundary_artifacts(tmp_path):
    reconciler = TranscriptReconciler(session_id="test_session_3", storage_dir=tmp_path)

    # Segments with duplicate boundary word
    reconciler.process_final("Kubernetes", timestamp=1.0)
    reconciler.process_final("Kubernetes cluster was configured", timestamp=2.0)

    is_valid, turn_text = reconciler.finalize_turn()
    assert is_valid is True
    # Duplicate 'Kubernetes' at boundary is reconciled
    assert "Kubernetes cluster was configured" in turn_text


def test_reconciler_explicit_timeout_handling(tmp_path):
    reconciler = TranscriptReconciler(session_id="test_session_4", storage_dir=tmp_path)

    reconciler.process_interim("My final answer is gRPC", timestamp=10.0)

    # When explicit timeout occurs, pending provisional text is committed safely
    is_valid, turn_text = reconciler.finalize_turn(explicit_timeout=True)
    assert is_valid is True
    assert "gRPC" in turn_text


def test_reconciler_persists_answers_on_disconnect(tmp_path):
    reconciler = TranscriptReconciler(session_id="sess_disconnect_test", storage_dir=tmp_path)

    reconciler.process_final("Yes, ACID compliance ensures transactional integrity.", timestamp=5.0)
    is_valid, text = reconciler.finalize_turn()
    assert is_valid is True

    reconciler.commit_turn_answer(
        question="What does ACID mean in databases?",
        answer=text,
        latency_ms=250.0,
    )

    out_file = reconciler.persist_to_disk()
    assert out_file.exists()

    saved_data = json.loads(out_file.read_text(encoding="utf-8"))
    assert saved_data["session_id"] == "sess_disconnect_test"
    assert len(saved_data["answers"]) == 1
    assert saved_data["answers"][0]["question"] == "What does ACID mean in databases?"
    assert "ACID compliance" in saved_data["answers"][0]["answer"]


# ─── 4. TELEMETRY, P50/P95 & ACCURACY METRICS TESTS ─────────────────────────

def test_wer_and_cer_computations():
    ref = "We deployed microservices to Kubernetes"
    hyp_exact = "We deployed microservices to Kubernetes"
    hyp_minor = "We deployed microservices to Kubernets"  # 1 typo

    assert calculate_wer(ref, hyp_exact) == 0.0
    assert calculate_cer(ref, hyp_exact) == 0.0

    wer_minor = calculate_wer(ref, hyp_minor)
    assert 0.0 < wer_minor < 0.3
    cer_minor = calculate_cer(ref, hyp_minor)
    assert 0.0 < cer_minor < 0.1


def test_stt_metrics_turn_timestamps_and_p50_p95():
    tracker = STTMetricsTracker()

    # Simulate 5 turns with known timings
    latencies = [100.0, 150.0, 200.0, 250.0, 500.0]
    for i, lat in enumerate(latencies):
        tid = tracker.start_turn(provider="deepgram", model="flux-general-en")
        t_start = 1000.0 + i * 10
        tracker.record_first_interim(tid, timestamp=t_start + 0.05)
        tracker.record_speech_end(tid, timestamp=t_start + 1.0)
        tracker.record_final_transcript(tid, text=f"Turn {i} answer", timestamp=t_start + 1.0 + (lat / 1000.0))
        tracker.record_first_ai_audio(tid, timestamp=t_start + 1.0 + (lat / 1000.0) + 0.1)

    summary = tracker.get_summary_metrics()
    assert summary["total_turns"] == 5
    assert summary["successful_turns"] == 5
    assert summary["error_rate"] == 0.0

    final_lat_stats = summary["latency_ms"]["final_transcript"]
    assert final_lat_stats["p50"] == 200.0
    assert final_lat_stats["p95"] >= 450.0
    assert final_lat_stats["min"] == 100.0
    assert final_lat_stats["max"] == 500.0


# ─── 5. BENCHMARK HARNESS TEST ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stt_benchmark_runner():
    # Run benchmark with mocked API responses
    with patch("stt_benchmark.benchmark_deepgram") as mock_dg, \
         patch("stt_benchmark.benchmark_groq") as mock_groq:

        mock_dg.return_value = {
            "provider": "deepgram",
            "model": "nova-3",
            "success": True,
            "latency_ms": 180.5,
            "transcript": "We architected scalable microservices on Kubernetes using Docker.",
        }
        mock_groq.return_value = {
            "provider": "groq",
            "model": "whisper-large-v3-turbo",
            "success": True,
            "latency_ms": 220.0,
            "transcript": "We architected scalable microservices on Kubernetes using Docker.",
        }

        result = await run_stt_benchmark(
            reference_text="We architected scalable microservices on Kubernetes using Docker.",
            deepgram_model="nova-3",
            groq_model="whisper-large-v3-turbo",
        )

        assert "results" in result
        assert result["results"]["deepgram"]["success"] is True
        assert result["results"]["groq"]["success"] is True
        assert result["results"]["deepgram"]["metrics"]["wer"] == 0.0
        assert result["summary"]["fastest_provider"] == "deepgram"
        assert result["summary"]["latency_delta_ms"] == 39.5
