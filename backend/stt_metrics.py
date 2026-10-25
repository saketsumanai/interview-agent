"""
STT Latency & Accuracy Telemetry Service.

Records turn-level timestamps:
- speech_end_time
- first_interim_time
- final_transcript_time
- first_ai_audio_time

Calculates:
- p50 and p95 latencies for interim transcript, final transcript, and voice turnaround
- Transcription error rates
- Word Error Rate (WER) and Character Error Rate (CER) for benchmark evaluations
"""

import math
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


def calculate_levenshtein_distance(ref_tokens: List[str], hyp_tokens: List[str]) -> int:
    """Standard Levenshtein matrix computation for WER/CER calculation."""
    r_len = len(ref_tokens)
    h_len = len(hyp_tokens)
    dp = [[0] * (h_len + 1) for _ in range(r_len + 1)]

    for i in range(r_len + 1):
        dp[i][0] = i
    for j in range(h_len + 1):
        dp[0][j] = j

    for i in range(1, r_len + 1):
        for j in range(1, h_len + 1):
            if ref_tokens[i - 1].lower() == hyp_tokens[j - 1].lower():
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # deletion
                    dp[i][j - 1],      # insertion
                    dp[i - 1][j - 1]   # substitution
                )
    return dp[r_len][h_len]


def calculate_wer(reference: str, hypothesis: str) -> float:
    """Compute Word Error Rate (WER = (S + D + I) / N)."""
    ref_words = reference.strip().split()
    hyp_words = hypothesis.strip().split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
    distance = calculate_levenshtein_distance(ref_words, hyp_words)
    return min(1.0, distance / len(ref_words))


def calculate_cer(reference: str, hypothesis: str) -> float:
    """Compute Character Error Rate (CER = distance / char_count)."""
    ref_chars = list(reference.strip().replace(" ", ""))
    hyp_chars = list(hypothesis.strip().replace(" ", ""))
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0
    distance = calculate_levenshtein_distance(ref_chars, hyp_chars)
    return min(1.0, distance / len(ref_chars))


@dataclass
class TurnTimingRecord:
    turn_id: int
    provider: str
    model: str
    speech_start_time: float = 0.0
    speech_end_time: float = 0.0
    first_interim_time: float = 0.0
    final_transcript_time: float = 0.0
    first_ai_audio_time: float = 0.0
    transcript_text: str = ""
    error: Optional[str] = None

    @property
    def interim_latency_ms(self) -> float:
        """Latency from speech activity to first interim transcript."""
        if self.first_interim_time > 0:
            origin = self.speech_start_time if self.speech_start_time > 0 else self.speech_end_time
            if self.first_interim_time >= origin:
                return round((self.first_interim_time - origin) * 1000, 2)
        return 0.0

    @property
    def final_transcript_latency_ms(self) -> float:
        """Latency from speech-end to final transcript emission."""
        if self.final_transcript_time > 0 and self.speech_end_time > 0:
            diff = self.final_transcript_time - self.speech_end_time
            if diff >= 0:
                return round(diff * 1000, 2)
            # If final transcript arrived before Silero confirmed end-of-speech
            return round(max(0.0, diff) * 1000, 2)
        return 0.0

    @property
    def voice_turnaround_latency_ms(self) -> float:
        """Total turnaround from speech-end to first AI synthesized audio packet."""
        if self.first_ai_audio_time > 0 and self.speech_end_time > 0:
            diff = self.first_ai_audio_time - self.speech_end_time
            return round(max(0.0, diff) * 1000, 2)
        return 0.0


class STTMetricsTracker:
    """
    In-memory and persistent metrics tracker for STT latency and error rates.
    """

    def __init__(self):
        self.records: List[TurnTimingRecord] = []
        self.total_errors: int = 0
        self.active_turns: Dict[int, TurnTimingRecord] = {}
        self._turn_counter: int = 0

    def start_turn(self, provider: str, model: str) -> int:
        self._turn_counter += 1
        turn_id = self._turn_counter
        self.active_turns[turn_id] = TurnTimingRecord(
            turn_id=turn_id,
            provider=provider,
            model=model,
            speech_start_time=time.time(),
        )
        return turn_id

    def record_speech_end(self, turn_id: int, timestamp: Optional[float] = None) -> None:
        rec = self.active_turns.get(turn_id)
        if rec:
            rec.speech_end_time = timestamp or time.time()

    def record_first_interim(self, turn_id: int, timestamp: Optional[float] = None) -> None:
        rec = self.active_turns.get(turn_id)
        if rec and rec.first_interim_time == 0.0:
            rec.first_interim_time = timestamp or time.time()

    def record_final_transcript(self, turn_id: int, text: str, timestamp: Optional[float] = None) -> None:
        rec = self.active_turns.get(turn_id)
        if rec:
            rec.final_transcript_time = timestamp or time.time()
            rec.transcript_text = text
            if rec.speech_end_time == 0.0:
                rec.speech_end_time = rec.final_transcript_time

    def record_first_ai_audio(self, turn_id: int, timestamp: Optional[float] = None) -> None:
        rec = self.active_turns.get(turn_id)
        if rec:
            rec.first_ai_audio_time = timestamp or time.time()
            # Move completed turn to history
            self.records.append(rec)
            self.active_turns.pop(turn_id, None)

    def record_error(self, turn_id: Optional[int], error_msg: str) -> None:
        self.total_errors += 1
        if turn_id and turn_id in self.active_turns:
            rec = self.active_turns.pop(turn_id)
            rec.error = error_msg
            self.records.append(rec)

    def calculate_percentiles(self, values: List[float]) -> Dict[str, float]:
        if not values:
            return {"p50": 0.0, "p95": 0.0, "min": 0.0, "max": 0.0, "avg": 0.0}
        sorted_vals = sorted(values)
        n = len(sorted_vals)

        def percentile(p: float) -> float:
            k = (n - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return sorted_vals[f]
            d0 = sorted_vals[f] * (c - k)
            d1 = sorted_vals[c] * (k - f)
            return round(d0 + d1, 2)

        return {
            "p50": percentile(0.50),
            "p95": percentile(0.95),
            "min": round(sorted_vals[0], 2),
            "max": round(sorted_vals[-1], 2),
            "avg": round(sum(sorted_vals) / n, 2),
        }

    def get_summary_metrics(self) -> Dict[str, Any]:
        """Produce comprehensive latency and reliability metrics."""
        completed = [r for r in self.records if r.error is None]
        total_attempts = len(self.records) + self.total_errors
        error_rate = round(self.total_errors / max(1, total_attempts), 4)

        interim_latencies = [r.interim_latency_ms for r in completed if r.interim_latency_ms > 0]
        final_latencies = [r.final_transcript_latency_ms for r in completed if r.final_transcript_latency_ms > 0]
        turnaround_latencies = [r.voice_turnaround_latency_ms for r in completed if r.voice_turnaround_latency_ms > 0]

        return {
            "total_turns": len(self.records),
            "successful_turns": len(completed),
            "total_errors": self.total_errors,
            "error_rate": error_rate,
            "latency_ms": {
                "first_interim": self.calculate_percentiles(interim_latencies),
                "final_transcript": self.calculate_percentiles(final_latencies),
                "voice_turnaround": self.calculate_percentiles(turnaround_latencies),
            },
            "recent_turns": [
                {
                    "turn_id": r.turn_id,
                    "provider": r.provider,
                    "model": r.model,
                    "interim_latency_ms": r.interim_latency_ms,
                    "final_latency_ms": r.final_transcript_latency_ms,
                    "turnaround_ms": r.voice_turnaround_latency_ms,
                    "transcript_preview": r.transcript_text[:60] + "..." if len(r.transcript_text) > 60 else r.transcript_text,
                }
                for r in self.records[-10:]
            ],
        }


# Global singleton instance for backend monitoring
stt_telemetry = STTMetricsTracker()
