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

  const [providerHealth, setProviderHealth] = useState<any>(null);
  const [sttMetrics, setSttMetrics] = useState<any>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  const fetchProviderHealthAndMetrics = useCallback(async () => {
    try {
      const [hRes, mRes] = await Promise.all([
        fetch(`${tokenServerUrl}/api/health/providers`).catch(() => null),
        fetch(`${tokenServerUrl}/api/stt/metrics`).catch(() => null),
      ]);
      if (hRes && hRes.ok) setProviderHealth(await hRes.json());
      if (mRes && mRes.ok) setSttMetrics(await mRes.json());
    } catch (e) {
      console.warn("Failed to fetch provider health:", e);
    }
  }, [tokenServerUrl]);

  const handleRunBenchmark = async () => {
    setIsRunningBenchmark(true);
    setBenchmarkError(null);
    try {
      const res = await fetch(`${tokenServerUrl}/api/stt/benchmark`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Benchmark failed with status ${res.status}`);
      }
      const data = await res.json();
      setBenchmarkResult(data);
    } catch (e) {
      setBenchmarkError(String(e));
    } finally {
      setIsRunningBenchmark(false);
    }
  };

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
    fetchProviderHealthAndMetrics();
    const interval = setInterval(() => {
      fetchStats(authToken);
      fetchProviderHealthAndMetrics();
    }, 5000);
    return () => clearInterval(interval);
  }, [authToken, fetchStats, fetchProviderHealthAndMetrics]);

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

        {/* STT Telemetry & Benchmark Mode Section */}
        {stats && (
          <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Speech-to-Text Infrastructure & Benchmark Mode
                </h2>
                <p style={{ fontSize: "0.82rem", color: "#94a3b8", margin: "0.25rem 0 0" }}>
                  Deepgram Flux & Nova-3 vs Groq Whisper transcription accuracy and latency comparison.
                </p>
              </div>
              <button
                className="btn-primary-start"
                onClick={handleRunBenchmark}
                disabled={isRunningBenchmark}
                style={{ padding: "0.45rem 0.9rem", fontSize: "0.8rem" }}
              >
                {isRunningBenchmark ? "Running Benchmark..." : "Run STT Benchmark"}
              </button>
            </div>

            {/* Provider Status Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              {/* Deepgram Card */}
              <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Deepgram Streaming</span>
                  <span style={{
                    fontSize: "0.72rem",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    background: providerHealth?.providers?.deepgram?.status === "healthy" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                    color: providerHealth?.providers?.deepgram?.status === "healthy" ? "#10b981" : "#f87171",
                    fontWeight: 700,
                  }}>
                    {providerHealth?.providers?.deepgram?.status || "Checking..."}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div>Models: <span style={{ color: "#38bdf8" }}>flux-general-en, nova-3</span></div>
                  <div>Protocol: WebSocket v2 (Flux) / v1 (Nova-3)</div>
                  {providerHealth?.providers?.deepgram?.latency_ms && (
                    <div>Health Ping: <strong>{providerHealth.providers.deepgram.latency_ms} ms</strong></div>
                  )}
                  {providerHealth?.providers?.deepgram?.error && (
                    <div style={{ color: "#f87171", fontSize: "0.72rem", marginTop: "0.25rem" }}>
                      {providerHealth.providers.deepgram.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Groq Card */}
              <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Groq Whisper STT</span>
                  <span style={{
                    fontSize: "0.72rem",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    background: providerHealth?.providers?.groq?.status === "healthy" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                    color: providerHealth?.providers?.groq?.status === "healthy" ? "#10b981" : "#f87171",
                    fontWeight: 700,
                  }}>
                    {providerHealth?.providers?.groq?.status || "Checking..."}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div>Model: <span style={{ color: "#f59e0b" }}>whisper-large-v3-turbo</span></div>
                  <div>Status: Selectable Live Alternative</div>
                  {providerHealth?.providers?.groq?.latency_ms && (
                    <div>Health Ping: <strong>{providerHealth.providers.groq.latency_ms} ms</strong></div>
                  )}
                </div>
              </div>

              {/* Latency Telemetry Card */}
              <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.9rem" }}>Live Turn Latency</span>
                  <span style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: 700 }}>p50 / p95</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div>First Interim: <strong>{sttMetrics?.latency_ms?.first_interim?.p50 || 0} ms</strong> / {sttMetrics?.latency_ms?.first_interim?.p95 || 0} ms</div>
                  <div>Final Transcript: <strong>{sttMetrics?.latency_ms?.final_transcript?.p50 || 0} ms</strong> / {sttMetrics?.latency_ms?.final_transcript?.p95 || 0} ms</div>
                  <div>Voice Turnaround: <strong>{sttMetrics?.latency_ms?.voice_turnaround?.p50 || 0} ms</strong> / {sttMetrics?.latency_ms?.voice_turnaround?.p95 || 0} ms</div>
                  <div style={{ color: "#94a3b8", fontSize: "0.72rem" }}>Total Turns Tracked: {sttMetrics?.total_turns || 0} (Errors: {sttMetrics?.total_errors || 0})</div>
                </div>
              </div>
            </div>

            {/* Benchmark Error Display */}
            {benchmarkError && (
              <div className="error-banner" style={{ marginTop: "1rem" }}>
                <span>{benchmarkError}</span>
              </div>
            )}

            {/* Benchmark Results Display */}
            {benchmarkResult && (
              <div style={{ marginTop: "1rem", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, color: "#38bdf8", fontSize: "0.9rem" }}>
                    Benchmark Comparison Results
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>
                    Fastest: {benchmarkResult.summary?.fastest_provider?.toUpperCase() || "N/A"}
                  </span>
                </div>

                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.75rem" }}>
                  Reference Ground Truth: <em style={{ color: "#e2e8f0" }}>"{benchmarkResult.reference_text}"</em>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  {/* Deepgram Benchmark Result */}
                  <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "0.75rem", borderRadius: "6px" }}>
                    <div style={{ fontWeight: 600, color: "#38bdf8", fontSize: "0.82rem" }}>Deepgram Nova-3 / Flux</div>
                    <div style={{ fontSize: "0.78rem", color: "#f8fafc", margin: "0.35rem 0" }}>
                      "{benchmarkResult.results?.deepgram?.transcript || "No transcript"}"
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                      Latency: <strong>{benchmarkResult.results?.deepgram?.latency_ms || 0} ms</strong> &bull; Accuracy: <strong>{benchmarkResult.results?.deepgram?.metrics?.accuracy_pct || 0}%</strong>
                    </div>
                  </div>

                  {/* Groq Benchmark Result */}
                  <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "0.75rem", borderRadius: "6px" }}>
                    <div style={{ fontWeight: 600, color: "#f59e0b", fontSize: "0.82rem" }}>Groq Whisper Turbo</div>
                    <div style={{ fontSize: "0.78rem", color: "#f8fafc", margin: "0.35rem 0" }}>
                      "{benchmarkResult.results?.groq?.transcript || "No transcript"}"
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                      Latency: <strong>{benchmarkResult.results?.groq?.latency_ms || 0} ms</strong> &bull; Accuracy: <strong>{benchmarkResult.results?.groq?.metrics?.accuracy_pct || 0}%</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default AdminPortal;
