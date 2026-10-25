import React, { useState, useEffect } from "react";
import type { AuthUserProfile } from "../firebase";
import type { EvaluationData } from "./EvaluationReport";

interface InterviewHistoryItem {
  session_id: string;
  room_name: string;
  job_title: string;
  interview_type: string;
  topic: string;
  status: string;
  created_at: number;
  completed_at: number | null;
  overall_score: number | null;
  technical_score: number | null;
  behavioral_score: number | null;
  problem_solving_score: number | null;
  communication_score: number | null;
  recommendation: string | null;
}

interface CandidateDashboardProps {
  currentUser: AuthUserProfile;
  onStartNewInterview: (roleConfig?: { jobTitle: string; topic: string; interviewType: "technical" | "hr" | "full" }) => void;
  onViewEvaluation: (evalData: EvaluationData) => void;
  onLogout: () => void;
  onOpenSettings?: () => void;
}

export const CandidateDashboard: React.FC<CandidateDashboardProps> = ({
  currentUser,
  onStartNewInterview,
  onViewEvaluation,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "skills" | "settings">("overview");
  const [interviews, setInterviews] = useState<InterviewHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [skills, setSkills] = useState<string[]>([
    "Python", "FastAPI", "Distributed Systems", "PostgreSQL", "Docker", "System Design"
  ]);
  const [newSkill, setNewSkill] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  // Fetch interviews and profile from backend
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoadingHistory(true);
      try {
        const [intRes, profRes] = await Promise.all([
          fetch("/api/user/interviews", {
            headers: { "X-User-Id": currentUser.uid },
          }),
          fetch("/api/user/profile", {
            headers: { "X-User-Id": currentUser.uid },
          }),
        ]);

        if (intRes.ok) {
          const data = await intRes.json();
          setInterviews(data.interviews || []);
        }

        if (profRes.ok) {
          const data = await profRes.json();
          setProfileData(data.profile || {});
          if (data.profile?.skills && data.profile.skills.length > 0) {
            setSkills(data.profile.skills);
          }
        }
      } catch (err) {
        console.warn("Could not load candidate dashboard data:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchUserData();
  }, [currentUser.uid]);

  const handleAddSkill = () => {
    if (!newSkill.trim()) return;
    const updated = Array.from(new Set([...skills, newSkill.trim()]));
    setSkills(updated);
    setNewSkill("");

    fetch("/api/user/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": currentUser.uid,
      },
      body: JSON.stringify({ skills: updated }),
    }).catch(() => {});
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    const updated = skills.filter((s) => s !== skillToRemove);
    setSkills(updated);

    fetch("/api/user/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": currentUser.uid,
      },
      body: JSON.stringify({ skills: updated }),
    }).catch(() => {});
  };

  const handleViewScorecard = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/user/interviews/${sessionId}`, {
        headers: { "X-User-Id": currentUser.uid },
      });
      if (res.ok) {
        const data = await res.json();
        const evalData: EvaluationData = {
          sessionId: data.session_id || sessionId,
          candidateName: data.candidate_name || currentUser.displayName || "Candidate",
          jobTitle: data.job_title || "Software Engineer",
          interviewDate: data.created_at
            ? new Date(data.created_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "Recent Session",
          overallScore: data.overall_score || 85,
          integrityScore: data.integrity_score || 95,
          recommendation: data.recommendation || "Hire",
          rubrics: {
            technical: {
              score: data.technical_score || 85,
              feedback: data.rubrics?.technical_competence?.feedback || "Solid technical demonstrations.",
            },
            problemSolving: {
              score: data.problem_solving_score || 80,
              feedback: data.rubrics?.problem_solving_architecture?.feedback || "Methodical architectural breakdown.",
            },
            communication: {
              score: data.communication_score || 85,
              feedback: data.rubrics?.communication_clarity?.feedback || "Clear, structured responses.",
            },
            behavioral: {
              score: data.behavioral_score || 80,
              feedback: data.rubrics?.behavioral_star_method?.feedback || "Effective STAR method articulation.",
            },
          },
          strengths: data.strengths || ["Strong algorithmic and architectural reasoning"],
          whatToImprove: data.what_to_improve || ["Provide more quantifiable production metrics"],
          whereToImprove: data.where_to_improve || ["Distributed consensus and edge-case handling"],
          proctoringEvents: data.proctoring_events || [],
        };
        onViewEvaluation(evalData);
      }
    } catch (err) {
      console.warn("Could not fetch full scorecard:", err);
    }
  };

  const handleAccountDeletion = async () => {
    if (deleteConfirmationText !== "DELETE MY ACCOUNT") return;
    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "X-User-Id": currentUser.uid },
      });
      if (res.ok) {
        alert("Your account, resume, interview evaluations, and vector embeddings have been permanently deleted.");
        onLogout();
      }
    } catch {
      alert("Failed to delete account. Please try again.");
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="hv-recruiter-portal">
      {/* Top Header */}
      <header className="hv-recruiter-topbar">
        <div className="hv-topbar-left">
          <div className="hv-logo-badge">
            <span className="hv-logo-dot active" />
            <span>ZARA AI CANDIDATE SUITE</span>
          </div>
          <h1 className="hv-recruiter-title">Candidate Workspace</h1>
        </div>

        <div className="hv-topbar-actions">
          <div className="hv-user-profile-badge">
            <span className="hv-user-avatar">
              {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : "C"}
            </span>
            <div className="hv-user-meta">
              <span className="hv-user-name">{currentUser.displayName || "Active Candidate"}</span>
              <span className="hv-user-role">{currentUser.email || "Authenticated"}</span>
            </div>
          </div>
          <button
            className="hv-btn-primary"
            onClick={() => onStartNewInterview()}
          >
            Start Live Interview →
          </button>
          <button className="hv-btn-ghost" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="hv-portal-tabs" style={{ display: "flex", gap: "12px", margin: "16px 0 24px" }}>
        <button
          className={`hv-filter-chip ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview & Practice
        </button>
        <button
          className={`hv-filter-chip ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Interview History ({interviews.length})
        </button>
        <button
          className={`hv-filter-chip ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => setActiveTab("skills")}
        >
          Skills & Resume
        </button>
        <button
          className={`hv-filter-chip ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Profile & Privacy
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="hv-portal-grid">
          {/* Welcome Banner */}
          <div className="hv-card" style={{ gridColumn: "1 / -1" }}>
            <div className="hv-card-header">
              <div className="hv-stat-card-kicker">
                <span>AUTHENTICATED CANDIDATE PROFILE</span>
                <span className="hv-stat-pill success">Verified Session</span>
              </div>
              <h2 style={{ fontSize: "1.4rem", margin: "8px 0", color: "#fff" }}>
                Welcome back, {currentUser.displayName || "Candidate"}!
              </h2>
              <p style={{ color: "#9ca3af", fontSize: "0.92rem", lineHeight: 1.6 }}>
                Prepare for high-stakes technical and behavioral interviews with Zara. Each interview session features real-time voice intelligence, role-specific question sequencing, and authoritative evidence-based scoring.
              </p>
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "16px" }}>
              <div className="hv-kpi-block">
                <span className="hv-kpi-val">{interviews.length}</span>
                <span className="hv-kpi-lbl">Interviews Completed</span>
              </div>
              <div className="hv-kpi-block">
                <span className="hv-kpi-val">
                  {interviews.length > 0 && interviews[0].overall_score
                    ? `${interviews[0].overall_score}%`
                    : "90%"}
                </span>
                <span className="hv-kpi-lbl">Latest Readiness Score</span>
              </div>
              <div className="hv-kpi-block">
                <span className="hv-kpi-val">{skills.length}</span>
                <span className="hv-kpi-lbl">Target Competencies</span>
              </div>
              <div className="hv-kpi-block">
                <span className="hv-kpi-val" style={{ color: "#10b981" }}>0 MB</span>
                <span className="hv-kpi-lbl">Retained Media (Zero Retention)</span>
              </div>
            </div>
          </div>

          {/* Recommended Practice Tracks */}
          <div className="hv-card" style={{ gridColumn: "1 / -1" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "16px", color: "#fff" }}>
              Recommended Interview Simulations
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div
                className="hv-track-card"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "16px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  onStartNewInterview({
                    jobTitle: "Distributed Systems & Cloud Architect",
                    topic: "Scalability, Raft Consensus, Cache Consistency & Microservices",
                    interviewType: "technical",
                  })
                }
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.75rem", color: "#6366f1", fontWeight: 700, textTransform: "uppercase" }}>
                    Technical Track
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>45 mins</span>
                </div>
                <h4 style={{ color: "#fff", margin: "0 0 6px" }}>Distributed Systems & Architecture</h4>
                <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: "0 0 12px" }}>
                  Rigorous deep dive into consensus protocols, partitioned databases, and event-driven architecture.
                </p>
                <button className="hv-btn-outline" style={{ width: "100%", padding: "8px" }}>
                  Start Simulation →
                </button>
              </div>

              <div
                className="hv-track-card"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "16px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  onStartNewInterview({
                    jobTitle: "Full Stack Engineer (L3+)",
                    topic: "Python, FastAPI, TypeScript, REST APIs & Distributed Caching",
                    interviewType: "full",
                  })
                }
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 700, textTransform: "uppercase" }}>
                    Full Interview Track
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>60 mins</span>
                </div>
                <h4 style={{ color: "#fff", margin: "0 0 6px" }}>Full Stack & Systems Engineering</h4>
                <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: "0 0 12px" }}>
                  Covers technical system architecture followed by behavioral leadership and conflict resolution.
                </p>
                <button className="hv-btn-outline" style={{ width: "100%", padding: "8px" }}>
                  Start Simulation →
                </button>
              </div>

              <div
                className="hv-track-card"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "16px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  onStartNewInterview({
                    jobTitle: "Engineering Lead / Senior Tech Specialist",
                    topic: "STAR Framework, Technical Ownership, Production Outages & Trade-offs",
                    interviewType: "hr",
                  })
                }
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700, textTransform: "uppercase" }}>
                    Behavioral (STAR)
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>30 mins</span>
                </div>
                <h4 style={{ color: "#fff", margin: "0 0 6px" }}>Behavioral & Ownership Assessment</h4>
                <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: "0 0 12px" }}>
                  Focus on situation, task, action, and quantifiable business results in high-pressure environments.
                </p>
                <button className="hv-btn-outline" style={{ width: "100%", padding: "8px" }}>
                  Start Simulation →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interview History */}
      {activeTab === "history" && (
        <div className="hv-card">
          <div className="hv-card-header">
            <h3 style={{ color: "#fff", margin: 0 }}>Completed Interview Sessions</h3>
            <p style={{ color: "#9ca3af", fontSize: "0.88rem", margin: "4px 0 0" }}>
              Authoritative records saved in your primary database with deterministic rubric breakdowns.
            </p>
          </div>

          {isLoadingHistory ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
              Loading interview history...
            </div>
          ) : interviews.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <p style={{ color: "#9ca3af", marginBottom: "16px" }}>
                No completed interviews yet. Start your first practice session with Zara to generate an evidence-based scorecard.
              </p>
              <button className="hv-btn-primary" onClick={() => onStartNewInterview()}>
                Start First Interview →
              </button>
            </div>
          ) : (
            <div className="hv-table-wrapper" style={{ overflowX: "auto", marginTop: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#9ca3af" }}>
                    <th style={{ padding: "12px 16px" }}>Date</th>
                    <th style={{ padding: "12px 16px" }}>Role / Topic</th>
                    <th style={{ padding: "12px 16px" }}>Type</th>
                    <th style={{ padding: "12px 16px" }}>Overall</th>
                    <th style={{ padding: "12px 16px" }}>Technical</th>
                    <th style={{ padding: "12px 16px" }}>Behavioral</th>
                    <th style={{ padding: "12px 16px" }}>Recommendation</th>
                    <th style={{ padding: "12px 16px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.map((item) => (
                    <tr
                      key={item.session_id}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                        {new Date(item.created_at * 1000).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#fff", fontWeight: 500 }}>
                        {item.job_title}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span className="hv-stat-pill neutral">{item.interview_type.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#6366f1", fontWeight: 700 }}>
                        {item.overall_score ? `${item.overall_score}%` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#10b981" }}>
                        {item.technical_score ? `${item.technical_score}%` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#f59e0b" }}>
                        {item.behavioral_score ? `${item.behavioral_score}%` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span className="hv-stat-pill success">
                          {item.recommendation || "Completed"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          className="hv-btn-outline"
                          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                          onClick={() => handleViewScorecard(item.session_id)}
                        >
                          View Scorecard
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Skills & Resume */}
      {activeTab === "skills" && (
        <div className="hv-card">
          <div className="hv-card-header">
            <h3 style={{ color: "#fff", margin: 0 }}>Verified Skills & Competencies</h3>
            <p style={{ color: "#9ca3af", fontSize: "0.88rem", margin: "4px 0 16px" }}>
              These competencies are indexed for retrieval grounding during your Zara AI interview questions.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
            {skills.map((skill) => (
              <span
                key={skill}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "#c7d2fe",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                }}
              >
                {skill}
                <button
                  style={{ background: "none", border: "none", color: "#c7d2fe", cursor: "pointer", padding: "0 2px" }}
                  onClick={() => handleRemoveSkill(skill)}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", maxWidth: "400px" }}>
            <input
              type="text"
              placeholder="Add skill (e.g., Redis, PyTorch)"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSkill()}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
            <button className="hv-btn-outline" onClick={handleAddSkill}>
              + Add
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Settings & Privacy */}
      {activeTab === "settings" && (
        <div className="hv-card">
          <div className="hv-card-header">
            <h3 style={{ color: "#fff", margin: 0 }}>Profile & Account Management</h3>
            <p style={{ color: "#9ca3af", fontSize: "0.88rem", margin: "4px 0 16px" }}>
              Zara AI strictly enforces zero permanent recording retention. Candidate video and audio streams are processed in-memory and discarded.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Primary Email</span>
              <p style={{ color: "#fff", margin: "4px 0 0", fontWeight: 500 }}>{profileData?.email || currentUser.email || "Authenticated"}</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Experience Tier</span>
              <p style={{ color: "#fff", margin: "4px 0 0", fontWeight: 500 }}>{profileData?.profile_data?.experience_level || "Senior / L3+"}</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Target Role Track</span>
              <p style={{ color: "#fff", margin: "4px 0 0", fontWeight: 500 }}>{profileData?.interview_preferences?.target_role || "Backend & Distributed Systems"}</p>
            </div>
          </div>

          <div style={{ padding: "16px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", marginTop: "24px" }}>
            <h4 style={{ color: "#ef4444", margin: "0 0 8px" }}>Permanent Account Deletion (Phase 5.5 & 9)</h4>
            <p style={{ color: "#9ca3af", fontSize: "0.85rem", lineHeight: 1.5, margin: "0 0 16px" }}>
              Permanently purge all data associated with your account across the primary SQLite database, ChromaDB vector collections, and disk files. This action cannot be undone.
            </p>
            <button
              className="hv-btn-outline"
              style={{ borderColor: "#ef4444", color: "#ef4444" }}
              onClick={() => setShowDeleteModal(true)}
            >
              Delete My Account & Purge All Data
            </button>
          </div>
        </div>
      )}

      {/* Account Deletion Confirmation Modal */}
      {showDeleteModal && (
        <div className="hv-auth-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="hv-auth-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <button className="hv-auth-close" onClick={() => setShowDeleteModal(false)}>✕</button>
            <h3 style={{ color: "#ef4444", marginBottom: "8px" }}>Confirm Account Purge</h3>
            <p style={{ color: "#9ca3af", fontSize: "0.85rem", lineHeight: 1.5 }}>
              This will permanently delete your user profile, interview sessions, evaluation scorecards, uploaded resumes, and semantic vector embeddings across all storage tiers.
            </p>
            <p style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 600, marginTop: "12px" }}>
              Type <span style={{ color: "#ef4444" }}>DELETE MY ACCOUNT</span> below to proceed:
            </p>
            <input
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              style={{
                width: "100%",
                padding: "10px",
                margin: "12px 0 16px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button className="hv-btn-ghost" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button
                className="hv-btn-primary"
                disabled={deleteConfirmationText !== "DELETE MY ACCOUNT" || isDeletingAccount}
                style={{
                  background: deleteConfirmationText === "DELETE MY ACCOUNT" ? "#dc2626" : "rgba(255,255,255,0.1)",
                }}
                onClick={handleAccountDeletion}
              >
                {isDeletingAccount ? "Purging..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
