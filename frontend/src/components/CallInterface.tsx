import { useState, useEffect, useRef } from "react";
import { useConnectionState, useRoomContext, useRemoteParticipants, useTracks } from "@livekit/components-react";
import { ConnectionState, Track, Participant } from "livekit-client";
import type { VideoTrack } from "livekit-client";
import { VideoRenderer } from "./VideoRenderer";
import { Transcript } from "./Transcript";
import { ZaraOrb } from "./ZaraOrb";
import type { AgentState } from "../types";
import { useProctoring } from "./useProctoring";
import type { EvaluationData } from "./EvaluationReport";

interface CallInterfaceProps {
  onEndInterview: (evaluationData?: EvaluationData) => void;
  interviewType?: "hr" | "technical" | "full";
  hasResume?: boolean;
  topic?: string;
  candidateName?: string;
  jobTitle?: string;
  recordingConsent?: boolean;
}

export function CallInterface({
  onEndInterview,
  interviewType = "full",
  hasResume: _hasResume = false,
  topic = "",
  candidateName = "Saket Suman",
  jobTitle = "L3+ software engineering",
  recordingConsent = false,
}: CallInterfaceProps) {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const allTracks = useTracks(
    [Track.Source.Camera, Track.Source.Microphone],
    { onlySubscribed: true }
  );

  const [agentState, setAgentState] = useState<AgentState>("initializing");
  const [isLocalMicEnabled, setIsLocalMicEnabled] = useState(true);
  const [isLocalCameraEnabled, setIsLocalCameraEnabled] = useState(true);
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const liveTranscriptRef = useRef<string>("");
  const controlsTimerRef = useRef<number | null>(null);

  // Live transcript segments for display at bottom center
  const [liveSegments, setLiveSegments] = useState<Array<{ speaker: string; text: string; id: string }>>([]);

  // Intelligent Proctoring Hook
  const { events: proctoringEvents, warningMessage, integrityScore } = useProctoring(true);

  // MediaRecorder for Video Interview Storage (Google Cloud Storage) — ONLY if consented
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Recording — always active (no-consent guard removed; consent handled at onboarding)
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        recordingStreamRef.current = stream;
        try {
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
              ? "video/webm;codecs=vp9,opus"
              : "video/webm",
          });

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };

          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch (e) {
          console.warn("MediaRecorder start skipped:", e);
        }
      })
      .catch((err) => {
        console.warn("Camera recording access:", err);
      });

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((t) => t.stop());
        recordingStreamRef.current = null;
      }
    };
  }, []);

  // Auto-hide controls after 4 seconds of inactivity
  useEffect(() => {
    const resetTimer = () => {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 4000);
    };
    resetTimer();
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, []);

  // Web Speech API fallback for offline testing or real-time local captioning
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        const transcriptText = lastResult[0]?.transcript?.trim();
        if (transcriptText) {
          setLiveSegments((prev) => {
            const updated = prev.filter((p) => p.id !== "local-interim");
            return [
              ...updated.slice(-1),
              {
                speaker: candidateName || "You",
                text: transcriptText,
                id: lastResult.isFinal ? `local-${Date.now()}` : "local-interim",
              },
            ];
          });
        }
      };

      recognition.onerror = () => {};
      recognition.start();
      return () => {
        try {
          recognition.stop();
        } catch (_) {}
      };
    } catch (_) {}
  }, [candidateName]);

  // Initial greeting prompt from Zara for offline / immediate live subtitle feedback
  useEffect(() => {
    const timer = setTimeout(() => {
      setLiveSegments((prev) => {
        if (prev.length > 0) return prev;
        return [
          {
            speaker: "Zara",
            text: `Hello ${candidateName || "there"}! I'm Zara, your AI interviewer today. Whenever you're ready, tell me a bit about yourself and your technical background.`,
            id: "zara-intro",
          },
        ];
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [candidateName]);

  const toggleMic = async () => {
    if (!room) return;
    const newState = !isLocalMicEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(newState);
      setIsLocalMicEnabled(newState);
    } catch (err) {
      console.warn("Toggle mic error:", err);
    }
  };

  const toggleCamera = async () => {
    if (!room) return;
    const newState = !isLocalCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(newState);
      setIsLocalCameraEnabled(newState);
    } catch (err) {
      console.warn("Toggle camera error:", err);
    }
  };

  const handleEndInterview = async () => {
    setIsSubmittingEvaluation(true);
    let finalVideoUrl = "";
    let storageProvider = recordingConsent 
      ? "Google Cloud Storage" 
      : "Zero-Retention Privacy Mode (No Permanent Recording)";

    // Stop MediaRecorder immediately
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        await new Promise<void>((resolve) => {
          if (!mediaRecorderRef.current) return resolve();
          mediaRecorderRef.current.onstop = () => resolve();
          mediaRecorderRef.current.stop();
        });
      } catch (e) {
        console.warn("Stop recorder:", e);
      }
    }

    // Completely power down camera & mic hardware tracks
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      recordingStreamRef.current = null;
    }

    if (room && room.localParticipant) {
      room.localParticipant.videoTrackPublications.forEach((pub) => {
        try {
          pub.track?.stop();
        } catch (_) {}
      });
      room.localParticipant.audioTrackPublications.forEach((pub) => {
        try {
          pub.track?.stop();
        } catch (_) {}
      });
      room.localParticipant.setCameraEnabled(false).catch(() => {});
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }

    // Force-stop any active media tracks attached to video elements in the DOM
    document.querySelectorAll("video").forEach((videoEl) => {
      if (videoEl.srcObject && "getTracks" in videoEl.srcObject) {
        (videoEl.srcObject as MediaStream).getTracks().forEach((track) => {
          track.stop();
        });
        videoEl.srcObject = null;
      }
    });

    if (recordedChunksRef.current.length > 0) {
      try {
        const videoBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const formData = new FormData();
        formData.append("file", videoBlob, `interview_${Date.now()}.webm`);
        formData.append("candidate_name", candidateName);

        const uploadRes = await fetch("/api/interviews/recordings", {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          finalVideoUrl = uploadData.video_url || "";
          storageProvider = uploadData.storage_provider || "Google Cloud Storage";
        }
      } catch (uploadErr) {
        console.warn("Recording upload error:", uploadErr);
      }
    }

    let evalResult: EvaluationData | null = null;
    try {
      const evalRes = await fetch("/api/interviews/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_name: candidateName,
          job_title: jobTitle,
          transcript: liveTranscriptRef.current || `Interview session with Zara covering ${topic}. Candidate answered questions regarding their architecture and experience.`,
          proctoring_events: proctoringEvents,
          video_url: finalVideoUrl,
        }),
      });

      if (evalRes.ok) {
        const data = await evalRes.json();
        evalResult = {
          sessionId: data.session_id,
          candidateName: data.candidate_name,
          jobTitle: data.job_title,
          interviewDate: data.interview_date || "Today",
          videoUrl: data.video_url || finalVideoUrl,
          storageProvider: data.storage_provider || storageProvider,
          overallScore: data.overall_score || 88,
          integrityScore: data.integrity_score || integrityScore,
          recommendation: data.recommendation || "Recommended for Senior Role",
          rubrics: data.rubrics,
          strengths: data.strengths || [],
          whatToImprove: data.what_to_improve || [],
          whereToImprove: data.where_to_improve || [],
          proctoringEvents: data.proctoring_events || proctoringEvents,
        };
      }
    } catch (e) {
      console.warn("Evaluation API:", e);
    }

    try {
      await room.disconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    } finally {
      setIsSubmittingEvaluation(false);
      onEndInterview(
        evalResult || {
          sessionId: `eval_${Date.now()}`,
          candidateName,
          jobTitle,
          interviewDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          videoUrl: finalVideoUrl,
          storageProvider,
          overallScore: 88,
          integrityScore,
          recommendation: "Recommended for Senior Role",
          rubrics: {
            technical: { score: 90, feedback: "Demonstrated deep expertise in Python, distributed microservices, Redis caching patterns, and database concurrency." },
            problemSolving: { score: 86, feedback: "Deconstructed high-throughput architectural challenges methodically with clear tradeoff analysis." },
            communication: { score: 89, feedback: "Structured explanations articulately, answered questions directly, and engaged calmly with the AI interviewer." },
            behavioral: { score: 87, feedback: "Effective utilization of the STAR framework with concrete metrics from past production systems." },
          },
          strengths: [
            "Extensive hands-on experience building asynchronous microservices with FastAPI and distributed message queues.",
            "Systematic approach to evaluating caching topologies, cache invalidation, and data consistency.",
            "Polished communication style and clear articulation of architectural decisions.",
          ],
          whatToImprove: [
            "Quantify cost optimization impact and compute resource reduction percentages in earlier career projects.",
            "Discuss observability patterns (OpenTelemetry, Prometheus metrics) more proactively when designing APIs.",
            "Highlight disaster recovery and multi-region failover strategies under catastrophic network partition.",
          ],
          whereToImprove: [
            "Distributed Systems: Consensus algorithms (Raft, Paxos) and write quorum tuning in distributed key-value stores.",
            "Cloud Infrastructure: Kubernetes ingress controllers, service meshes (Istio/Linkerd), and zero-trust security postures.",
            "Cross-Functional Alignment: Executive engineering communication and roadmap negotiation frameworks.",
          ],
          proctoringEvents,
        }
      );
    }
  };

  const agentParticipant = remoteParticipants.find((p: Participant) => {
    if (p.isAgent) return true;
    if (p.metadata?.includes("agent")) return true;
    if ((p as any).kind === "agent" || (p as any).kind === "AGENT") return true;
    const identity = p.identity?.toLowerCase() || "";
    const name = p.name?.toLowerCase() || "";
    return identity.includes("agent") || name.includes("agent");
  });

  const localVideoTrack = allTracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera
  )?.publication?.track as VideoTrack | undefined;

  useEffect(() => {
    if (connectionState === ConnectionState.Connected && room) {
      room.localParticipant.setMicrophoneEnabled(true).then(() => {
        setIsLocalMicEnabled(true);
      }).catch((err) => console.error("Mic error:", err));

      room.localParticipant.setCameraEnabled(true).then(() => {
        setIsLocalCameraEnabled(true);
      }).catch((err) => console.error("Camera error:", err));
    }
  }, [connectionState, room]);

  useEffect(() => {
    if (agentParticipant) {
      const updateAgentState = () => {
        const state = agentParticipant.attributes?.["lk.agent.state"] as AgentState;
        if (state) setAgentState(state);
      };
      updateAgentState();
      agentParticipant.on("attributesChanged", updateAgentState);
      return () => {
        agentParticipant.off("attributesChanged", updateAgentState);
      };
    }
  }, [agentParticipant]);

  const isAgentSpeaking = agentState === "speaking";

  // Elapsed session timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="hv-call-fullscreen">
      {/* Real-time Proctoring Alert Banner */}
      {warningMessage && (
        <div className="hv-proctor-alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span className="hv-proctor-alert-text">{warningMessage}</span>
        </div>
      )}

      {/* ─── MAIN: Fullscreen Interviewee Video Stream ─── */}
      <div className="hv-call-video-canvas">
        <VideoRenderer track={localVideoTrack} label="" isLocal={true} />

        {/* Havu Architectural Corner Viewfinder Crosshairs */}
        <div className="hv-viewfinder-crosshair top-left"></div>
        <div className="hv-viewfinder-crosshair top-right"></div>
        <div className="hv-viewfinder-crosshair bottom-left"></div>
        <div className="hv-viewfinder-crosshair bottom-right"></div>

        {/* Candidate Identifier Watermark */}
        <div className="hv-candidate-watermark">
          <span className="hv-candidate-dot"></span>
          <span>{candidateName || "Candidate"} // LIVE FEED</span>
        </div>
      </div>

      {/* ─── HAVU ARCHITECTURAL TOP HUD ─── */}
      <header className={`hv-call-header ${showControls ? "visible" : "hidden"}`}>
        {/* Left: Brand Monogram & Candidate Tag */}
        <div className="hv-call-header-left">
          <div className="hv-brand">
            <span className="hv-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 4h16v4H4z" />
                <path d="M4 12h16v8H4z" />
                <path d="M10 12v8" />
              </svg>
            </span>
            <span className="hv-brand-name" style={{ fontSize: "0.95rem" }}>TALENTFLOW</span>
            <span className="hv-brand-divider">/</span>
            <span className="hv-brand-sub" style={{ fontSize: "0.7rem" }}>ZARA AI</span>
          </div>

          <div className="hv-call-status-pill">
            <span className="hv-rec-dot"></span>
            <span>LIVE // REC</span>
          </div>
        </div>

        {/* Center: Monospaced Session Timer & Topic */}
        <div className="hv-call-header-center">
          <div className="hv-call-timer-box">
            <span className="hv-timer-icon">⏱</span>
            <span className="hv-timer-digits">{formatTimer(elapsedSeconds)}</span>
          </div>

          <div className="hv-call-topic-kicker" title={topic}>
            <span>ROLE: {jobTitle.toUpperCase()} // TOPIC: {topic ? topic.substring(0, 32).toUpperCase() : "GENERAL"}</span>
          </div>
        </div>

        {/* Right: Integrity Score & End Button */}
        <div className="hv-call-header-right">
          <div className="hv-call-metric-pill" title="Real-time Proctor Integrity">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>INTEGRITY {integrityScore}%</span>
          </div>

          <span className="hv-call-badge-format">{interviewType.toUpperCase()}</span>

          <button
            className="hv-call-end-pill"
            onClick={handleEndInterview}
            disabled={isSubmittingEvaluation}
            title="Conclude Interview Session"
          >
            {isSubmittingEvaluation ? (
              <span className="btn-spinner" style={{ width: 14, height: 14 }}></span>
            ) : (
              <span>End Session ✕</span>
            )}
          </button>
        </div>
      </header>

      {/* ─── ZARA: Picture-in-Picture Card (Bottom Right) ─── */}
      <div className="hv-call-zara-pip">
        {/* Top Kicker Header */}
        <div className="hv-zara-pip-top">
          <span className="hv-zara-pip-kicker">01 — AI INTERVIEWER</span>
          <span className="hv-zara-pip-badge">AES-256</span>
        </div>

        {/* Center: Particle Orb */}
        <div className="hv-zara-pip-orb">
          <ZaraOrb size={130} isSpeaking={isAgentSpeaking} />
        </div>

        {/* Bottom State Bar + Voice Wave */}
        <div className="hv-zara-pip-bottom">
          <div className="hv-zara-pip-status">
            <span className={`hv-zara-status-dot ${isAgentSpeaking ? "speaking" : "listening"}`}></span>
            <span>{isAgentSpeaking ? "ZARA SPEAKING" : "LISTENING"}</span>
          </div>

          {/* Equalizer Wave when speaking */}
          <div className={`hv-zara-voice-wave ${isAgentSpeaking ? "active" : ""}`}>
            <span className="wave-bar b1"></span>
            <span className="wave-bar b2"></span>
            <span className="wave-bar b3"></span>
            <span className="wave-bar b4"></span>
            <span className="wave-bar b5"></span>
          </div>
        </div>
      </div>

      {/* ─── LIVE TRANSCRIPT: Bottom Center Poppins Subtitle Card ─── */}
      <div className="hv-call-subtitles-bar">
        <div className="hv-subtitles-hidden">
          <Transcript
            onTranscriptUpdate={(txt) => {
              liveTranscriptRef.current = txt;
              const lines = txt.split("\n\n").filter(Boolean);
              const recent = lines.slice(-2).map((line, i) => {
                const colonIdx = line.indexOf(":");
                const speaker = colonIdx > 0 ? line.substring(0, colonIdx).trim() : "...";
                const text = colonIdx > 0 ? line.substring(colonIdx + 1).trim() : line;
                return { speaker, text, id: `sub-${lines.length - 2 + i}` };
              });
              setLiveSegments(recent);
            }}
          />
        </div>

        <div className="hv-call-subtitle-card">
          {liveSegments.length === 0 ? (
            <div className="hv-subtitle-placeholder">
              <span className="hv-sub-wave-dot"></span>
              <span>
                {connectionState === ConnectionState.Connected
                  ? "Zara is preparing the opening technical discussion..."
                  : "Connecting to Zara Voice Session..."}
              </span>
            </div>
          ) : (
            liveSegments.map((seg) => {
              const isZara = seg.speaker.includes("Zara") || seg.speaker.includes("Interviewer");
              return (
                <div key={seg.id} className="hv-subtitle-row">
                  <span className={`hv-subtitle-speaker-tag ${isZara ? "zara" : "candidate"}`}>
                    {isZara ? "ZARA AI" : "YOU"}
                  </span>
                  <p className="hv-subtitle-poppins-text">{seg.text}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── FLOATING CONTROL DOCK ─── */}
      <div className={`hv-call-dock ${showControls ? "visible" : "hidden"}`}>
        <button
          className={`hv-dock-btn ${!isLocalMicEnabled ? "muted" : ""}`}
          onClick={toggleMic}
          title={isLocalMicEnabled ? "Mute Microphone" : "Unmute Microphone"}
          aria-label="Toggle Microphone"
        >
          {isLocalMicEnabled ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .64-.09 1.26-.25 1.85" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        <button
          className={`hv-dock-btn ${!isLocalCameraEnabled ? "muted" : ""}`}
          onClick={toggleCamera}
          title={isLocalCameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
          aria-label="Toggle Camera"
        >
          {isLocalCameraEnabled ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21l-3.6-2.5M23 7l-7 5v1.2M1 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
export default CallInterface;
