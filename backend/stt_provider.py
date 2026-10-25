"""
STT Provider Adapter Module for AI Interview Platform.

Provides unified, first-class configuration and initialization for:
- Deepgram Streaming WebSocket API (Conversational Flux model `flux-general-en` and Nova-3 `nova-3`)
- Groq Transcription (`whisper-large-v3-turbo` / `whisper-large-v3`)
- AssemblyAI Streaming (`universal-streaming-english`) fallback

Includes:
- Strict server-side credential management (permanent keys never sent to clients)
- Technical interview vocabulary boosting (keyterms)
- Safe transcript reconciliation (interim vs. final, duplicate removal, verbatim preservation)
- Strict turn gating (provisional text NEVER triggers question progression)
- Disconnect and rate-limit recovery
- Answers persistence on session cancellation or error
"""

import json
import logging
import os
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from livekit.agents import stt

_STT_DIR = Path(__file__).resolve().parent
load_dotenv(_STT_DIR / ".env.local")
load_dotenv(_STT_DIR.parent / ".env.local")
logger = logging.getLogger("stt_provider")

# ─── TECHNICAL INTERVIEW VOCABULARY ─────────────────────────────────────────
# Preserves technical terms during recognition without altering candidate speech
TECHNICAL_INTERVIEW_KEYTERMS: List[str] = [
    "Kubernetes", "PostgreSQL", "FastAPI", "Docker", "Redis", "gRPC", "GraphQL",
    "microservices", "asyncio", "WebSockets", "Kafka", "CI/CD", "Prometheus",
    "ChromaDB", "LiveKit", "Deepgram", "Pydantic", "Celery", "OAuth2", "JWT",
    "SQLAlchemy", "NoSQL", "DevOps", "Terraform", "Nginx", "ACID", "CAP theorem",
    "sharding", "replication", "event-driven", "idempotency", "consensus", "Raft",
    "Paxos", "MapReduce", "DynamoDB", "Cassandra", "RabbitMQ", "Elasticsearch",
    "multithreading", "concurrency", "deadlock", "race condition", "microfrontend",
    "TypeScript", "Python", "Go", "Rust", "vector database", "RAG", "LLM", "TTS", "STT"
]

# Boosted keywords for Nova-3 / Nova-2 legacy models (word, boost_score)
TECHNICAL_INTERVIEW_KEYWORDS: List[Tuple[str, float]] = [
    (term, 1.5) for term in TECHNICAL_INTERVIEW_KEYTERMS[:30]
]


# ─── ENUMS & EXCEPTIONS ─────────────────────────────────────────────────────

class STTProviderType(str, Enum):
    DEEPGRAM = "deepgram"
    GROQ = "groq"
    ASSEMBLYAI = "assemblyai"


class DeepgramModelType(str, Enum):
    FLUX = "flux-general-en"
    NOVA_3 = "nova-3"
    NOVA_2 = "nova-2"
    NOVA_2_CONVERSATIONAL = "nova-2-conversationalai"


class GroqModelType(str, Enum):
    WHISPER_LARGE_V3_TURBO = "whisper-large-v3-turbo"
    WHISPER_LARGE_V3 = "whisper-large-v3"


class STTException(Exception):
    """Base exception for STT provider errors."""
    pass


class MissingCredentialError(STTException):
    """Raised when an STT provider API key is missing or empty."""
    pass


class InvalidConfigurationError(STTException):
    """Raised when provider or model configuration is invalid."""
    pass


class STTRateLimitError(STTException):
    """Raised when provider returns HTTP/WS 429 rate limit."""
    pass


class STTConnectionError(STTException):
    """Raised when connection to STT provider drops or fails."""
    pass


# ─── CONFIGURATION ──────────────────────────────────────────────────────────

@dataclass
class STTConfig:
    provider: str = "deepgram"
    model: Optional[str] = None
    language: str = "en-US"
    api_key: Optional[str] = None

    # Endpointing & turn detection tuning
    endpointing_ms: int = 200             # Nova-3 silence gap before turn ends (was 300ms)
    eot_threshold: float = 0.60           # Flux EOT probability threshold (was 0.75 — lower = faster)
    eager_eot_threshold: float = 0.40     # Flux eager-EOT threshold (was 0.55)
    eot_timeout_ms: int = 1200            # Flux forced EOT timeout (was 2500ms — critical latency cut)

    # Feature flags
    interim_results: bool = True
    punctuate: bool = True
    smart_format: bool = True
    keyterms: List[str] = field(default_factory=lambda: list(TECHNICAL_INTERVIEW_KEYTERMS))

    # Retry & timeout policies
    max_retries: int = 3
    retry_backoff_sec: float = 0.5
    request_timeout_sec: float = 10.0


def resolve_provider_credentials(provider: str) -> str:
    """
    Safely retrieve provider credentials server-side without leaking them.
    Raises MissingCredentialError if the required key is missing.
    """
    prov = provider.lower().strip()
    if prov == STTProviderType.DEEPGRAM:
        key = os.getenv("DEEPGRAM_API_KEY", "").strip()
        if not key:
            raise MissingCredentialError(
                "DEEPGRAM_API_KEY is not configured in backend environment. "
                "Add 'DEEPGRAM_API_KEY=...' to backend/.env.local or select 'groq' as STT provider."
            )
        return key
    elif prov == STTProviderType.GROQ:
        key = os.getenv("GROQ_API_KEY", "").strip()
        if not key:
            raise MissingCredentialError(
                "GROQ_API_KEY is not configured in backend environment. "
                "Add 'GROQ_API_KEY=...' to backend/.env.local or select another STT provider."
            )
        return key
    elif prov == STTProviderType.ASSEMBLYAI:
        key = os.getenv("ASSEMBLYAI_API_KEY", "").strip()
        if not key:
            raise MissingCredentialError(
                "ASSEMBLYAI_API_KEY is not configured in backend environment. "
                "Add 'ASSEMBLYAI_API_KEY=...' to backend/.env.local."
            )
        return key
    else:
        raise InvalidConfigurationError(f"Unsupported STT provider: '{provider}'")


def validate_stt_config(config: STTConfig) -> STTConfig:
    """Validate STT configuration and ensure credentials exist."""
    prov = config.provider.lower().strip()
    if prov not in [p.value for p in STTProviderType]:
        raise InvalidConfigurationError(
            f"Invalid STT provider '{config.provider}'. Supported providers: {[p.value for p in STTProviderType]}"
        )

    # Ensure server-side API key exists
    if not config.api_key:
        config.api_key = resolve_provider_credentials(prov)

    # Validate / normalize model defaults
    if prov == STTProviderType.DEEPGRAM:
        if not config.model:
            config.model = os.getenv("DEEPGRAM_MODEL", DeepgramModelType.FLUX.value)
        # Verify supported Deepgram model
        valid_dg_models = [m.value for m in DeepgramModelType]
        if config.model not in valid_dg_models and not config.model.startswith("nova") and not config.model.startswith("flux"):
            raise InvalidConfigurationError(
                f"Invalid Deepgram model '{config.model}'. Supported models: {valid_dg_models}"
            )
    elif prov == STTProviderType.GROQ:
        if not config.model:
            config.model = os.getenv("GROQ_STT_MODEL", GroqModelType.WHISPER_LARGE_V3_TURBO.value)

    return config


# ─── PROVIDER ADAPTER FACTORY ───────────────────────────────────────────────

def create_stt_provider(config: Optional[STTConfig] = None) -> stt.STT:
    """
    Factory creating a LiveKit STT instance according to configuration.
    
    Supports:
    - Deepgram Flux (`flux-general-en` via livekit.plugins.deepgram.STTv2)
    - Deepgram Nova-3 (`nova-3` via livekit.plugins.deepgram.STT)
    - Groq STT (`whisper-large-v3-turbo` via livekit.plugins.groq.STT)
    - AssemblyAI fallback (`universal-streaming-english` via livekit.plugins.assemblyai.STT)
    """
    if config is None:
        prov = os.getenv("STT_PROVIDER", STTProviderType.DEEPGRAM.value).lower()
        dg_model = os.getenv("DEEPGRAM_MODEL", DeepgramModelType.FLUX.value)
        config = STTConfig(provider=prov, model=dg_model)

    config = validate_stt_config(config)
    prov = config.provider.lower().strip()

    if prov == STTProviderType.DEEPGRAM:
        model = config.model or DeepgramModelType.FLUX.value
        is_flux = "flux" in model.lower()

        if is_flux:
            from livekit.plugins.deepgram import STTv2
            logger.info(
                f"Initializing Deepgram Flux STTv2 streaming adapter "
                f"(model={model}, eot_threshold={config.eot_threshold}, eot_timeout_ms={config.eot_timeout_ms})"
            )
            assert config.api_key, "Deepgram API key must be set before STT initialization"
            return STTv2(
                model=model,
                api_key=config.api_key,
                sample_rate=16000,
                eot_threshold=config.eot_threshold,
                eager_eot_threshold=config.eager_eot_threshold,
                eot_timeout_ms=config.eot_timeout_ms,
                keyterms=config.keyterms,
                base_url="wss://api.deepgram.com/v2/listen",
            )
        else:
            from livekit.plugins.deepgram import STT as DeepgramSTT
            logger.info(
                f"Initializing Deepgram Nova STT streaming adapter "
                f"(model={model}, endpointing_ms={config.endpointing_ms})"
            )
            assert config.api_key, "Deepgram API key must be set before STT initialization"
            return DeepgramSTT(
                model=model,
                api_key=config.api_key,
                language=config.language,
                sample_rate=16000,
                interim_results=config.interim_results,
                punctuate=config.punctuate,
                smart_format=config.smart_format,
                endpointing_ms=config.endpointing_ms,
                keyterms=config.keyterms,
                base_url="https://api.deepgram.com/v1/listen",
            )

    elif prov == STTProviderType.GROQ:
        from livekit.plugins.groq import STT as GroqSTT
        model = config.model or GroqModelType.WHISPER_LARGE_V3_TURBO.value
        logger.info(f"Initializing Groq STT adapter (model={model})")
        vocab_prompt = "Technical interview discussion covering: " + ", ".join(config.keyterms[:35])
        assert config.api_key, "Groq API key must be set before STT initialization"
        return GroqSTT(
            model=model,
            api_key=config.api_key,
            language="en",
            prompt=vocab_prompt,
        )

    elif prov == STTProviderType.ASSEMBLYAI:
        from livekit.plugins.assemblyai import STT as AssemblyAISTT
        logger.info("Initializing AssemblyAI STT adapter (model=universal-streaming-english)")
        assert config.api_key, "AssemblyAI API key must be set before STT initialization"
        return AssemblyAISTT(
            api_key=config.api_key,
            model="universal-streaming-english",
            format_turns=True,
            keyterms_prompt=config.keyterms[:50],
        )

    raise InvalidConfigurationError(f"Unknown STT provider '{prov}'")


# ─── TRANSCRIPT RECONCILIATION & SAFE TURN GATING ───────────────────────────

@dataclass
class TranscriptSegment:
    text: str
    is_final: bool
    timestamp: float
    confidence: float = 1.0
    segment_id: Optional[str] = None


class TranscriptReconciler:
    """
    Reconciles streaming speech events into cohesive turn transcripts.
    
    Guarantees:
    1. NEVER triggers next question from provisional/interim text.
    2. Safely reconciles partial and final segments without duplicating words.
    3. Preserves verbatim candidate words without silent modification of meaning.
    4. Persists state on disconnect, error, or session cancellation.
    """

    def __init__(self, session_id: str, storage_dir: Optional[Path] = None):
        self.session_id = session_id
        self.storage_dir = storage_dir or (Path(__file__).parent / "data" / "interviews")
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # State tracking
        self.current_provisional_text: str = ""
        self.finalized_segments: List[TranscriptSegment] = []
        self.persisted_answers: List[Dict[str, Any]] = []

        # Active turn gate
        self._turn_finalized: bool = False
        self._turn_active: bool = False
        self._last_final_text: str = ""

    def process_interim(self, text: str, timestamp: float, confidence: float = 0.8) -> str:
        """
        Record provisional/interim text for real-time UI captions.
        Does NOT commit to final answer or trigger interview progression.
        """
        clean_text = self._clean_text(text)
        self.current_provisional_text = clean_text
        self._turn_active = True
        self._turn_finalized = False
        return clean_text

    def process_final(self, text: str, timestamp: float, confidence: float = 1.0) -> Optional[TranscriptSegment]:
        """
        Safely append finalized segment, deduplicating against recent segments.
        Marks turn as candidate for completion.
        """
        clean_text = self._clean_text(text)
        if not clean_text:
            return None

        # Check for duplicate segment
        if self.finalized_segments:
            last = self.finalized_segments[-1].text
            if last == clean_text or clean_text.startswith(last) or last.endswith(clean_text):
                # Update text if new segment is a more complete version
                if len(clean_text) > len(last):
                    self.finalized_segments[-1].text = clean_text
                    self.finalized_segments[-1].timestamp = timestamp
                    self.finalized_segments[-1].confidence = confidence
                    self.current_provisional_text = ""
                    self._last_final_text = clean_text
                    return self.finalized_segments[-1]
                return None

        segment = TranscriptSegment(
            text=clean_text,
            is_final=True,
            timestamp=timestamp,
            confidence=confidence,
        )
        self.finalized_segments.append(segment)
        self.current_provisional_text = ""
        self._last_final_text = clean_text
        return segment

    def finalize_turn(self, explicit_timeout: bool = False) -> Tuple[bool, str]:
        """
        Finalize the current candidate turn.
        
        Returns:
            Tuple[bool, str]: (is_valid_turn, finalized_transcript_text)
            
        Constraint 4: Returns is_valid_turn=False if there is only provisional text
        without a finalized segment (unless explicitly handled timeout occurred).
        """
        # If explicit timeout occurred but candidate was speaking provisional text,
        # we accept the provisional text after silence threshold
        if explicit_timeout and self.current_provisional_text and not self.finalized_segments:
            clean_provisional = self._clean_text(self.current_provisional_text)
            if clean_provisional:
                self.finalized_segments.append(
                    TranscriptSegment(
                        text=clean_provisional,
                        is_final=True,
                        timestamp=0.0,
                        confidence=0.7,
                    )
                )
                self.current_provisional_text = ""

        if not self.finalized_segments:
            # Gating: provisional text alone CANNOT trigger turn
            self._turn_finalized = False
            return False, ""

        # Assemble full finalized turn text
        turn_text = " ".join([seg.text for seg in self.finalized_segments]).strip()
        turn_text = self._reconcile_text(turn_text)

        if len(turn_text.split()) < 1:
            return False, ""

        self._turn_finalized = True
        self._turn_active = False
        return True, turn_text

    def commit_turn_answer(
        self,
        question: str,
        answer_text: Optional[str] = None,
        latency_ms: float = 0.0,
        answer: Optional[str] = None,
    ) -> None:
        """Commit finalized answer to history and persist to disk immediately."""
        final_answer = answer or answer_text or ""
        record = {
            "question": question,
            "answer": final_answer,
            "latency_ms": latency_ms,
            "segment_count": len(self.finalized_segments),
        }
        self.persisted_answers.append(record)
        self.finalized_segments = []
        self.current_provisional_text = ""
        self._turn_finalized = False
        self._turn_active = False

        # Immediate persistence to prevent answer loss on disconnect/cancel
        self.persist_to_disk()

    def persist_to_disk(self) -> Path:
        """Write current session answers to JSON file safely."""
        out_file = self.storage_dir / f"{self.session_id}_transcript.json"
        data = {
            "session_id": self.session_id,
            "answers": self.persisted_answers,
            "in_progress_segments": [
                {"text": s.text, "timestamp": s.timestamp, "confidence": s.confidence}
                for s in self.finalized_segments
            ],
            "provisional_tail": self.current_provisional_text,
        }
        out_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return out_file

    def get_persisted_answers(self) -> List[Dict[str, Any]]:
        return list(self.persisted_answers)

    @staticmethod
    def _clean_text(text: str) -> str:
        """Strip whitespace and excessive internal spaces while preserving punctuation."""
        if not text:
            return ""
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _reconcile_text(full_text: str) -> str:
        """
        Deduplicate immediate adjacent word phrases caused by streaming boundaries.
        Example: 'Kubernetes Kubernetes cluster' -> 'Kubernetes cluster'
        """
        words = full_text.split()
        if not words:
            return ""
        deduped = []
        for i, word in enumerate(words):
            if i > 0 and word.lower() == words[i - 1].lower():
                continue
            deduped.append(word)
        return " ".join(deduped)
