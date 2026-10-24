import { useState, useEffect, useCallback } from "react";

interface AdminStats {
  active_sessions: number;
  max_sessions: number;
  active_rooms: string[];
  resume: { uploaded: boolean; filename: string | null; size_kb: number; chunks: number; state: string };
  project_docs: { ingested: boolean };
}

interface AdminPortalProps {
  tokenServerUrl: string;
  onBack: () => void;
}

export function AdminPortal({ tokenServerUrl, onBack }: AdminPortalProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(
    async (token: string) => {
      try {
        const res = await fetch(`${tokenServerUrl}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (res.status === 403) {
            setIsLoggedIn(false);
            setAuthToken(null);
            return;
          }
          throw new Error(`Stats fetch failed: ${res.status}`);
        }
        const data = await res.json();
        setStats(data);
        setStatsError(null);
      } catch (e) {
        setStatsError(String(e));
      }
    },
    [tokenServerUrl]
  );

  useEffect(() => {
    if (!authToken) return;
    fetchStats(authToken);
    const interval = setInterval(() => fetchStats(authToken), 5000);
    return () => clearInterval(interval);
  }, [authToken, fetchStats]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch(`${tokenServerUrl}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Invalid credentials");
      }
      const data = await res.json();
      setAuthToken(data.token);
      setIsLoggedIn(true);
      setPassword("");
    } catch (e) {
      setLoginError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (authToken) {
      await fetch(`${tokenServerUrl}/admin/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    setIsLoggedIn(false);
    setAuthToken(null);
    setStats(null);
  };

  const handleDeleteResume = async () => {
    if (!authToken) return;
    if (!window.confirm("Delete the uploaded resume and clear its context?")) return;
    await fetch(`${tokenServerUrl}/resume`, { method: "DELETE" });
    fetchStats(authToken);
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="onboarding-modal-overlay">
        <div className="onboarding-card" style={{ maxWidth: "520px", margin: "3rem auto" }}>
          <header className="onboarding-top-bar">
            <button className="icon-btn-ghost" onClick={onBack} title="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div className="onboarding-step-indicator">
              <span className="step-circle">A</span>
              <span className="step-label">Admin Authentication</span>
            </div>
          </header>

          <section className="onboarding-headline">
            <h1>Admin Console</h1>
            <p>Authenticate to monitor concurrent sessions, live room telemetry, and proctoring logs.</p>
          </section>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field-group">
              <label>Admin Access Key</label>
              <input
                type="password"
                placeholder="Enter admin password (default: admin123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                autoFocus
              />
            </div>

            {loginError && (
              <div style={{ color: "#f87171", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{loginError}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              <button type="button" className="btn-secondary-dark" onClick={onBack}>
                Cancel
              </button>
              <button type="submit" className="btn-primary-start" disabled={loading || !password}>
                {loading ? "Verifying..." : "Sign In to Console"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-card">
        {/* Top Header matching Screenshot */}
        <header className="onboarding-top-bar">
          <button className="icon-btn-ghost" onClick={onBack} title="Close admin console">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="onboarding-step-indicator">
            <span className="step-circle">A</span>
            <span className="step-label">Admin Console &bull; Live Telemetry</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button className="btn-secondary-dark" onClick={handleLogout}>
              Sign Out
            </button>
            <button className="btn-primary-start" onClick={onBack}>
              Return to Candidate View
            </button>
          </div>
        </header>

        {/* Section Headline */}
        <section className="onboarding-headline">
          <h1>System Telemetry & Real-Time Monitoring</h1>
          <p>
            Review active LiveKit WebRTC rooms, candidate resume index state, and platform capacity limits.
          </p>
        </section>

        {statsError && (
          <div className="error-banner">
            <span>{statsError}</span>
          </div>
        )}

        {!stats ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#9ca3af" }}>
            Querying LiveKit and Token Server telemetry...
          </div>
        ) : (
          <div className="onboarding-grid">
            {/* Left Column: Live Sessions & Capacity */}
            <div className="onboarding-left-panel">
              <div className="panel-header">
                <h2>Active LiveKit Rooms</h2>
                <p>Real-time room occupancy and concurrent worker capacity.</p>
              </div>

              <div className="connection-test-card">
                <div className="connection-header">
                  <span className="connection-label">Server Capacity</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8" }}>
                    {stats.active_sessions} / {stats.max_sessions} Slots
                  </span>
                </div>
                <div className="connection-bar-bg">
                  <div
                    className="connection-bar-fill"
                    style={{ width: `${(stats.active_sessions / stats.max_sessions) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div style={{ marginTop: "0.5rem" }}>
                <span className="tips-title">Connected Sessions:</span>
                {stats.active_rooms.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {stats.active_rooms.map((room) => (
                      <div key={room} className="tip-item">
                        <span className="bullet-dot bullet-success"></span>
                        <span style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{room}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "0.5rem" }}>
                    No candidates currently in an active interview session.
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: Candidate Resume & Docs */}
            <div className="onboarding-right-panel">
              <h2>Candidate Context & Grounding</h2>

              <div className="connection-test-card">
                <div className="connection-header">
                  <span className="connection-label">Ingested Resume</span>
                  <span style={{ fontSize: "0.78rem", color: stats.resume.uploaded ? "#10b981" : "#9ca3af" }}>
                    {stats.resume.uploaded ? "Active in RAG" : "None Uploaded"}
                  </span>
                </div>
                {stats.resume.uploaded ? (
                  <div style={{ fontSize: "0.84rem", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <div>Filename: <strong>{stats.resume.filename || "resume.pdf"}</strong></div>
                    <div>Size: {stats.resume.size_kb} KB &bull; Chunks: {stats.resume.chunks}</div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280" }}>
                    Upload candidate resume in the Recruiter Console to seed AI questions.
                  </p>
                )}
              </div>

              <div className="onboarding-actions">
                {stats.resume.uploaded && (
                  <button className="btn-secondary-dark" onClick={handleDeleteResume} style={{ borderColor: "#ef4444", color: "#f87171" }}>
                    Clear Ingested Resume
                  </button>
                )}
                <button className="btn-primary-start" onClick={onBack}>
                  Exit Console
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default AdminPortal;
