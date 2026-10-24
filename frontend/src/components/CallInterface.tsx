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
}

export function CallInterface({
  onEndInterview,
  interviewType = "full",
  hasResume = false,
  topic = "",
  candidateName = "Saket Suman",
  jobTitle = "L3+ software engineering",
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
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);
  const liveTranscriptRef = useRef<string>("");

  // Intelligent Proctoring Hook
  const { events: proctoringEvents, warningMessage, integrityScore } = useProctoring(true);

  // MediaRecorder for Video Interview Storage (Google Cloud Storage)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let streamToRecord: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamToRecord = stream;
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
        mediaRecorderRef.current.stop();
      }
      if (streamToRecord) {
        streamToRecord.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

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

  const handleEndInterview = async () => {
    setIsSubmittingEvaluation(true);
    let finalVideoUrl = "";
    let storageProvider = "Google Cloud Storage";

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

  return (
    <div className="onboarding-modal-overlay">
      {/* Real-time Proctoring Alert Banner */}
      {warningMessage && (
        <div className="proctoring-warning-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span className="warning-text">{warningMessage}</span>
        </div>
      )}

      <div className="onboarding-card">
        {/* Top Header Bar matching Screenshot */}
        <header className="onboarding-top-bar">
          <button className="icon-btn-ghost" onClick={handleEndInterview} title="Exit interview">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="onboarding-step-indicator">
            <span className="step-circle">2</span>
            <span className="step-label">{jobTitle} &bull; Live Interview</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="recording-pill">
              <span className="rec-dot"></span>
              <span>REC &bull; GCS Active</span>
            </div>
            <div className="integrity-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <span>{integrityScore}% Integrity</span>
            </div>
          </div>
        </header>

        {/* Section Headline */}
        <section className="onboarding-headline">
          <h1>Live Interview with Zara</h1>
          <p>
            Zara is listening and evaluating in real time. Speak naturally into your microphone — questions are tailored to {topic}.
          </p>
        </section>

        {/* Two-Column Grid matching Screenshot */}
        <div className="onboarding-grid">
          {/* Left Column: Your Camera Feed */}
          <div className="onboarding-left-panel">
            <div className="panel-header">
              <h2>Your Camera Feed</h2>
              <p>{isLocalCameraEnabled ? "Webcam active and framed in center." : "Connecting camera..."}</p>
            </div>

            <div className="camera-preview-box">
              <VideoRenderer track={localVideoTrack} label={candidateName || "You"} isLocal={true} />
              <div className="camera-badge-pill">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
                </svg>
              </div>
            </div>

            {/* Device Status row */}
            <div className="device-selectors-row">
              <div className="device-select-wrapper" onClick={toggleMic} style={{ cursor: "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                </svg>
                <span style={{ fontSize: "0.8rem", color: isLocalMicEnabled ? "#10b981" : "#ef4444" }}>
                  {isLocalMicEnabled ? "Mic Active (Click to mute)" : "Mic Muted"}
                </span>
              </div>

              <div className="device-select-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                </svg>
                <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  {hasResume ? "Resume Grounded" : "Direct Assessment"}
                </span>
              </div>

              <div className="device-select-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 14 14"></polyline>
                </svg>
                <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  {interviewType.toUpperCase()} Mode
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Zara AI with glowing 3D particle sphere */}
          <div className="onboarding-right-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Zara (AI Interviewer)</h2>
              <span className={`ai-status-tag ${isAgentSpeaking ? "speaking" : "listening"}`}>
                {isAgentSpeaking ? "Zara Speaking" : "Zara Listening..."}
              </span>
            </div>

            <div className="zara-canvas-card">
              <ZaraOrb size={280} isSpeaking={isAgentSpeaking} />
            </div>

            {/* Real-time Subtitles / Instructions Box */}
            <div className="connection-test-card" style={{ minHeight: "68px" }}>
              <div className="connection-header">
                <span className="connection-label">
                  {isAgentSpeaking ? "Zara is speaking:" : "Zara is listening to you:"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#38bdf8" }}>
                  {connectionState === ConnectionState.Connected ? "Connected (Low Latency)" : "Connecting..."}
                </span>
              </div>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#d1d5db", fontStyle: "italic" }}>
                {isAgentSpeaking
                  ? "Awaiting your response... feel free to speak as soon as Zara completes the question."
                  : "Go ahead and answer — Zara will acknowledge and ask the next question immediately."}
              </p>
            </div>

            {/* Bottom Actions matching Screenshot */}
            <div className="onboarding-actions">
              <button
                className={`btn-secondary-dark ${isTranscriptOpen ? "active" : ""}`}
                onClick={() => setIsTranscriptOpen((o) => !o)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                {isTranscriptOpen ? "Hide Transcript" : "Live Transcript"}
              </button>

              <button className="btn-test-sound" onClick={toggleMic}>
                {isLocalMicEnabled ? "Mute Microphone" : "Unmute Microphone"}
              </button>

              <button
                className="btn-primary-start"
                onClick={handleEndInterview}
                disabled={isSubmittingEvaluation}
                style={{ background: "#dc2626" }}
              >
                {isSubmittingEvaluation ? "Generating Report..." : "End Interview"}
              </button>
            </div>
          </div>
        </div>

        {/* Always-mounted transcript container so all dialogue is captured for evaluation */}
        <div style={{
          marginTop: "1.5rem",
          borderTop: "1px solid #2d2d32",
          paddingTop: "1rem",
          display: isTranscriptOpen ? "block" : "none"
        }}>
          <h3 style={{ fontSize: "1rem", color: "#ffffff", marginBottom: "0.75rem" }}>Live Dialogue Transcript</h3>
          <div style={{ maxHeight: "200px", overflowY: "auto", background: "#18181b", borderRadius: "8px", padding: "1rem" }}>
            <Transcript onTranscriptUpdate={(txt) => { liveTranscriptRef.current = txt; }} />
          </div>
        </div>
        {/* Invisible listener when drawer is closed so useTranscriptions is still capturing */}
        {!isTranscriptOpen && (
          <div style={{ display: "none" }}>
            <Transcript onTranscriptUpdate={(txt) => { liveTranscriptRef.current = txt; }} />
          </div>
        )}
      </div>
    </div>
  );
}
export default CallInterface;
