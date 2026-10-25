import { useState, useRef, useEffect } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { CallInterface } from "./components/CallInterface";
import { CandidateOnboarding } from "./components/CandidateOnboarding";
import { EvaluationReport } from "./components/EvaluationReport";
import type { EvaluationData } from "./components/EvaluationReport";
import { RecruiterPortal } from "./components/RecruiterPortal";
import { AdminPortal } from "./components/AdminPortal";
import { LandingPage } from "./components/LandingPage";
import { CandidateDashboard } from "./components/CandidateDashboard";
import { getStoredUser, setStoredUser, logoutUser, listenAuthState, type AuthUserProfile } from "./firebase";
import type { ConnectionDetails } from "./types";
import "./App.css";

const TOKEN_SERVER_URL = import.meta.env.VITE_BACKEND_URL || "";

type AppView = "landing" | "dashboard" | "onboarding" | "interview" | "evaluation" | "recruiter" | "admin";
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
  const [view, setView] = useState<AppView>("landing");
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Firebase User Authentication state
  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>(() => getStoredUser());

  // Interview session configuration
  const [jobTitle, setJobTitle] = useState("L3+ software engineering");
  const [candidateName, setCandidateName] = useState(() => getStoredUser()?.displayName || "Saket Suman");
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
      const roomName = `interview-${Date.now()}`;
      const username = candidateName || "candidate";

      // 1. Fetch livekit url with 8s timeout
      const urlRes = await fetch(`${TOKEN_SERVER_URL}/livekit-url`, { signal: AbortSignal.timeout(8000) });
      if (!urlRes.ok) throw new Error("Failed to get LiveKit URL");
      const { url, error: urlErr } = await urlRes.json();
      if (urlErr) throw new Error(urlErr);

      // 2. Fetch room token with 10s timeout
      const activeTopic = topic.trim() || "Full Stack & AI Development";
      const tokenRes = await fetch(
        `${TOKEN_SERVER_URL}/token?room=${roomName}&username=${encodeURIComponent(username)}&interview_type=${interviewType}&topic=${encodeURIComponent(activeTopic)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to obtain room token");
      }
      const { token, error: tokenErr } = await tokenRes.json();
      if (tokenErr) throw new Error(tokenErr);

      if (!token || !url) {
        throw new Error("Invalid token or LiveKit URL received from server");
      }

      setConnectionDetails({ url, token, roomName });
      setView("interview");
    } catch (err: any) {
      console.error("Start interview error:", err);
      setError(err?.message || "Failed to connect to Zara AI. Please try again.");
    } finally {
      setIsConnecting(false);
      isStartingRef.current = false;
    }
  };

  const handleInterviewEnded = (evalData?: EvaluationData) => {
    // Forcefully stop any lingering camera or mic tracks across the whole page
    try {
      document.querySelectorAll("video").forEach((videoEl) => {
        if (videoEl.srcObject && "getTracks" in videoEl.srcObject) {
          (videoEl.srcObject as MediaStream).getTracks().forEach((track) => {
            track.stop();
          });
          videoEl.srcObject = null;
        }
      });
    } catch (_) {}

    setConnectionDetails(null);
    setIsConnecting(false);
    isStartingRef.current = false;
    if (evalData) {
      setLatestEvaluation(evalData);
      setView("evaluation");
    } else {
      setView("landing");
    }
  };

  // Sync with Firebase auth state
  useEffect(() => {
    const unsubscribe = listenAuthState((firebaseUser) => {
      if (firebaseUser) {
        const stored = getStoredUser();
        if (!stored || stored.uid !== firebaseUser.uid) {
          const profile: AuthUserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Candidate",
            role: stored?.role || "candidate",
            isDemo: false,
          };
          setStoredUser(profile);
          setCurrentUser(profile);
          if (profile.displayName) setCandidateName(profile.displayName);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (user: AuthUserProfile) => {
    setCurrentUser(user);
    if (user.displayName) {
      setCandidateName(user.displayName);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
  };

  // 0. Landing Page (Hero intro, stats, CTA to start interview or portals)
  if (view === "landing") {
    return (
      <LandingPage
        onStartInterview={() => (currentUser ? setView("dashboard") : setView("onboarding"))}
        onRecruiterPortal={() => setView("recruiter")}
        onAdminConsole={() => setView("admin")}
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />
    );
  }

  // 0b. Candidate Dashboard (Authenticated user workspace: history, recommendations, skills, deletion)
  if (view === "dashboard" && currentUser) {
    return (
      <div className="app app-dark-canvas">
        <CandidateDashboard
          currentUser={currentUser}
          onStartNewInterview={(cfg) => {
            if (cfg) {
              setJobTitle(cfg.jobTitle);
              setTopic(cfg.topic);
              setInterviewType(cfg.interviewType);
            }
            setView("onboarding");
          }}
          onViewEvaluation={(evalData) => {
            setLatestEvaluation(evalData);
            setView("evaluation");
          }}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // 1. Candidate Onboarding View (Matches User's Provided Screenshot)
  if (view === "onboarding") {
    return (
      <div className="app app-dark-canvas">
        {/* Top Navbar */}
        <nav className="hv-header" style={{ position: "sticky", top: 0, zIndex: 50 }}>
          <div className="hv-brand" onClick={() => setView("landing")}>
            <span className="hv-logo-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 4h16v4H4z" />
                <path d="M4 12h16v8H4z" />
                <path d="M10 12v8" />
              </svg>
            </span>
            <span className="hv-brand-name">TALENTFLOW</span>
            <span className="hv-brand-divider">/</span>
            <span className="hv-brand-sub">ZARA AI</span>
          </div>
          <div className="hv-nav-links">
            <button className="hv-nav-item" onClick={() => setView("landing")}>Home</button>
            <button className="hv-nav-item" onClick={() => setView("recruiter")}>Recruiter Console</button>
            <button className="hv-nav-item" onClick={() => setView("admin")}>Admin</button>
          </div>
          <div className="hv-header-actions">
            {currentUser && (
              <div className="hv-user-profile-badge">
                <span className="hv-user-avatar">
                  {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : "U"}
                </span>
                <div className="hv-user-meta">
                  <span className="hv-user-name">{currentUser.displayName || "Active User"}</span>
                  <span className="hv-user-role">{currentUser.role.toUpperCase()}</span>
                </div>
              </div>
            )}
            <button className="hv-pill-cta" onClick={startLiveInterview}>
              Start Live Interview →
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
          token={connectionDetails.token || "offline-token"}
          connect={Boolean(connectionDetails.token)}
          connectOptions={{ autoSubscribe: true }}
          options={{
            // Browser-side audio capture: maximum noise/echo suppression
            audioCaptureDefaults: {
              autoGainControl: true,        // Normalize volume so soft-spoken = same as loud
              echoCancellation: true,       // Kills speaker echo from Zara's voice
              noiseSuppression: true,       // Browser-level background noise removal
              sampleRate: 48000,            // 48kHz for highest fidelity STT input
              channelCount: 1,              // Mono capture — reduces cross-channel noise
            },
            publishDefaults: {
              dtx: true,                   // Discontinuous transmission — mutes silence packets
              red: true,                   // Redundant encoding for packet-loss resilience
              stopMicTrackOnMute: true,    // Stop mic track when muted to save bandwidth
              audioPreset: "speech" as any, // Voice-optimized codec preset
            },
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
      <div className="app app-dark-canvas">
        {/* Top Navbar */}
        <nav className="hv-header" style={{ position: "sticky", top: 0, zIndex: 50 }}>
          <div className="hv-brand" onClick={() => setView("landing")}>
            <span className="hv-logo-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 4h16v4H4z" />
                <path d="M4 12h16v8H4z" />
                <path d="M10 12v8" />
              </svg>
            </span>
            <span className="hv-brand-name">TALENTFLOW</span>
            <span className="hv-brand-divider">/</span>
            <span className="hv-brand-sub">ZARA AI</span>
          </div>
          <div className="hv-nav-links">
            <button className="hv-nav-item" onClick={() => setView("landing")}>Home</button>
            <button className="hv-nav-item" onClick={() => setView("recruiter")}>Recruiter Console</button>
            <button className="hv-nav-item" onClick={() => setView("admin")}>Admin</button>
          </div>
          <div className="hv-header-actions">
            <button className="hv-pill-cta" onClick={() => setView("onboarding")}>
              New Assessment →
            </button>
          </div>
        </nav>

        <EvaluationReport
          evaluation={latestEvaluation}
          onRetake={() => setView("landing")}
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
          onBack={() => setView("landing")}
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
  return <AdminPortal tokenServerUrl={TOKEN_SERVER_URL} onBack={() => setView("landing")} />;
}
export default App;
