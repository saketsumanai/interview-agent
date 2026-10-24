import { useState, useRef, useEffect } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { CallInterface } from "./components/CallInterface";
import { CandidateOnboarding } from "./components/CandidateOnboarding";
import { EvaluationReport } from "./components/EvaluationReport";
import type { EvaluationData } from "./components/EvaluationReport";
import { RecruiterPortal } from "./components/RecruiterPortal";
import { AdminPortal } from "./components/AdminPortal";
import type { ConnectionDetails } from "./types";
import "./App.css";

const TOKEN_SERVER_URL = "http://localhost:8000";

type AppView = "onboarding" | "landing" | "interview" | "evaluation" | "recruiter" | "admin";
type ResumeState = "none" | "uploading" | "processing" | "ready" | "error";

interface ResumeInfo {
  filename: string;
  sizeKb: number;
  chunks: number;
  state: ResumeState;
  candidateName?: string;
  error?: string;
}

export function App() {
  const [view, setView] = useState<AppView>("onboarding");
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interview session configuration
  const [jobTitle, setJobTitle] = useState("L3+ software engineering");
  const [candidateName, setCandidateName] = useState("Saket Suman");
  const [interviewType, setInterviewType] = useState<"hr" | "technical" | "full">("full");
  const [topic, setTopic] = useState("Python Backend Systems & Distributed Architecture");

  // Resume status
  const [resumeState, setResumeState] = useState<ResumeState>("ready");
  const [, setResumeInfo] = useState<ResumeInfo | null>({
    filename: "Saket_Suman_Resume.pdf",
    sizeKb: 120,
    chunks: 4,
    state: "ready",
    candidateName: "Saket Suman",
  });

  // Completed Evaluation Report
  const [latestEvaluation, setLatestEvaluation] = useState<EvaluationData | null>(null);

  const isStartingRef = useRef(false);
  const pollIntervalRef = useRef<number | null>(null);

  // Initial resume status check on page mount
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const res = await fetch(`${TOKEN_SERVER_URL}/resume-status`);
        const data = await res.json();
        if (data.is_ingested || data.has_resume) {
          setResumeState("ready");
          setResumeInfo({
            filename: data.filename || "Saket_Suman_Resume.pdf",
            sizeKb: data.size_kb || 120,
            chunks: data.chunks || 4,
            state: "ready",
            candidateName: data.candidate_name || "Saket Suman",
          });
          if (data.candidate_name) {
            setCandidateName(data.candidate_name);
          }
        }
      } catch (_) {}
    };
    checkInitialStatus();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Connect and start LiveKit interview
  const startLiveInterview = async () => {
    if (isStartingRef.current || isConnecting || connectionDetails) return;
    isStartingRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
      const capRes = await fetch(`${TOKEN_SERVER_URL}/capacity-check`).catch(() => {
        throw new Error(`Cannot connect to backend server at ${TOKEN_SERVER_URL}.`);
      });
      if (!capRes.ok) throw new Error(`Backend server error: ${capRes.status}`);

      const roomName = `interview-${Date.now()}`;
      const username = candidateName || "candidate";

      const urlRes = await fetch(`${TOKEN_SERVER_URL}/livekit-url`);
      if (!urlRes.ok) throw new Error("Failed to get LiveKit URL");
      const { url, error: urlErr } = await urlRes.json();
      if (urlErr) throw new Error(urlErr);

      const activeTopic = topic.trim() || "Full Stack & AI Development";
      const tokenRes = await fetch(
        `${TOKEN_SERVER_URL}/token?room=${roomName}&username=${encodeURIComponent(username)}&interview_type=${interviewType}&topic=${encodeURIComponent(activeTopic)}`
      );
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.detail || "Failed to obtain room token");
      }
      const { token, error: tokenErr } = await tokenRes.json();
      if (tokenErr) throw new Error(tokenErr);

      setConnectionDetails({ url, token, roomName });
      setView("interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to AI agent");
      setIsConnecting(false);
      isStartingRef.current = false;
    }
  };

  const handleInterviewEnded = (evalData?: EvaluationData) => {
    setConnectionDetails(null);
    setIsConnecting(false);
    isStartingRef.current = false;
    if (evalData) {
      setLatestEvaluation(evalData);
      setView("evaluation");
    } else {
      setView("onboarding");
    }
  };

  // 1. Candidate Onboarding View (Matches User's Provided Screenshot)
  if (view === "onboarding") {
    return (
      <div className="app app-dark-canvas">
        {/* Top Navbar */}
        <nav className="top-nav">
          <div className="nav-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="nav-title">TalentFlow AI</span>
            <span className="nav-badge">Intelligent Proctoring</span>
          </div>
          <div className="nav-links">
            <button className="nav-link-btn" onClick={() => setView("recruiter")}>
              Recruiter Portal
            </button>
            <button className="nav-link-btn" onClick={() => setView("admin")}>
              Admin Console
            </button>
          </div>
        </nav>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        <CandidateOnboarding
          jobTitle={jobTitle}
          candidateName={candidateName}
          topic={topic}
          interviewType={interviewType}
          onTopicChange={setTopic}
          onInterviewTypeChange={setInterviewType}
          onCandidateNameChange={setCandidateName}
          onResumeUploaded={(filename, chunks) => {
            setResumeState("ready");
            setResumeInfo({
              filename,
              sizeKb: 120,
              chunks,
              state: "ready",
              candidateName,
            });
          }}
          onStartInterview={startLiveInterview}
          onBack={() => setView("recruiter")}
        />
      </div>
    );
  }

  // 2. Active Interview Room with LiveKit & Proctoring
  if (view === "interview" && connectionDetails) {
    return (
      <div className="app">
        <LiveKitRoom
          serverUrl={connectionDetails.url}
          token={connectionDetails.token}
          connect={true}
          connectOptions={{ autoSubscribe: true }}
          options={{
            audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
            publishDefaults: { dtx: true, red: true, stopMicTrackOnMute: true },
          }}
          onDisconnected={() => handleInterviewEnded()}
        >
          <CallInterface
            onEndInterview={handleInterviewEnded}
            interviewType={interviewType}
            hasResume={resumeState === "ready"}
            topic={topic}
            candidateName={candidateName}
            jobTitle={jobTitle}
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    );
  }

  // 3. AI Evaluation & Scorecard View
  if (view === "evaluation" && latestEvaluation) {
    return (
      <div className="app">
        <EvaluationReport
          evaluation={latestEvaluation}
          onRetake={() => setView("onboarding")}
          onViewRecruiterPortal={() => setView("recruiter")}
        />
      </div>
    );
  }

  // 4. Recruiter Setup Portal
  if (view === "recruiter") {
    return (
      <div className="app">
        <RecruiterPortal
          onLaunchCandidateInterview={(cfg) => {
            setJobTitle(cfg.jobTitle);
            setCandidateName(cfg.candidateName);
            setInterviewType("full");
            setTopic(cfg.jobTitle);
            setView("onboarding");
          }}
          onViewReports={() => {
            if (!latestEvaluation) {
              setLatestEvaluation({
                sessionId: `session_${Date.now()}`,
                candidateName: candidateName || "Saket Suman",
                jobTitle: jobTitle || "L3+ Software Engineer",
                interviewDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                videoUrl: "/recordings/interview_demo.webm",
                storageProvider: "Google Cloud Storage",
                overallScore: 88,
                integrityScore: 96,
                recommendation: "Recommended for Senior Role",
                rubrics: {
                  technical: {
                    score: 90,
                    feedback: "Demonstrated deep expertise in Python, distributed microservices, Redis caching patterns, and database concurrency.",
                  },
                  problemSolving: {
                    score: 86,
                    feedback: "Deconstructed high-throughput architectural challenges methodically with clear tradeoff analysis.",
                  },
                  communication: {
                    score: 89,
                    feedback: "Structured explanations articulately, answered questions directly, and engaged calmly with the AI interviewer.",
                  },
                  behavioral: {
                    score: 87,
                    feedback: "Effective utilization of the STAR framework with concrete metrics from past production systems.",
                  },
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
                proctoringEvents: [
                  {
                    timestamp: "00:01:14",
                    type: "SESSION_INIT",
                    description: "Candidate webcam and microphone stream verified. Proctor active.",
                    severity: "info",
                  },
                  {
                    timestamp: "00:14:22",
                    type: "TAB_SWITCH_ALERT",
                    description: "Minor window focus deflection detected. Promptly returned to interview window.",
                    severity: "warning",
                  },
                ],
              });
            }
            setView("evaluation");
          }}
        />
      </div>
    );
  }

  // 5. Admin Portal
  return <AdminPortal tokenServerUrl={TOKEN_SERVER_URL} onBack={() => setView("onboarding")} />;
}
export default App;
