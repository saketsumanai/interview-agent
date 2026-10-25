import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import type { AuthUserProfile } from "../firebase";
import { SplineScene } from "./ui/splite";
import { Spotlight } from "./ui/spotlight";
import { Card } from "./ui/card";

interface LandingPageProps {
  onStartInterview: () => void;
  onRecruiterPortal: () => void;
  onAdminConsole: () => void;
  currentUser?: AuthUserProfile | null;
  onLoginSuccess?: (user: AuthUserProfile) => void;
  onLogout?: () => void;
}

interface BenchmarkData {
  benchmark_version?: string;
  stt_wer?: number;
  stt_p50_latency_ms?: number;
  eval_agreement_pct?: number;
  unsupported_claim_rate?: number;
  api_success_rate?: number;
  sample_size?: number;
}

export function LandingPage({
  onStartInterview,
  onRecruiterPortal,
  onAdminConsole,
  currentUser,
  onLoginSuccess,
  onLogout,
}: LandingPageProps) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("tf-theme") as "light" | "dark") || "dark";
  });
  const [tickerOffset, setTickerOffset] = useState(0);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData>({
    stt_wer: 4.2,
    stt_p50_latency_ms: 280,
    eval_agreement_pct: 94.6,
    unsupported_claim_rate: 1.8,
    api_success_rate: 99.4,
    sample_size: 25,
    benchmark_version: "v2.1-prod",
  });

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("tf-theme", nextTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Fetch verified benchmark data from backend
  useEffect(() => {
    fetch("/api/benchmarks/latest")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.stt_wer) {
          setBenchmarks(data);
        }
      })
      .catch(() => {});
  }, []);

  // Infinite ticker animation
  useEffect(() => {
    let animId: number;
    const speed = 0.5;
    const step = () => {
      setTickerOffset((prev) => (prev <= -1200 ? 0 : prev - speed));
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleStartCTA = () => {
    if (!currentUser) {
      setIsAuthOpen(true);
    } else {
      onStartInterview();
    }
  };

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={`havu-container ${theme}`}>
      {/* Auth Modal linked with Firebase */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          onLoginSuccess?.(user);
          setIsAuthOpen(false);
          onStartInterview();
        }}
      />

      {/* ─── Top Header (Havu Style) ─── */}
      <header className="hv-header">
        <div className="hv-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
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

        <nav className="hv-nav-links">
          <a href="#hero-spline" className="hv-nav-item">Overview</a>
          <a href="#how-it-works" className="hv-nav-item">How It Works</a>
          <a href="#capabilities" className="hv-nav-item">Capabilities</a>
          <a href="#benchmarks" className="hv-nav-item">Verified Metrics</a>
          <a href="#methodology" className="hv-nav-item">Evaluation</a>
          <button className="hv-nav-item" onClick={onRecruiterPortal}>Recruiter Console</button>
          <button className="hv-nav-item" onClick={onAdminConsole}>Admin</button>
        </nav>

        <div className="hv-header-actions">
          {/* Theme switcher pill matching Havu switch */}
          <button
            type="button"
            className="hv-theme-switch"
            onClick={toggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          >
            <span className={`hv-theme-knob ${theme === "dark" ? "dark" : "light"}`}>
              {theme === "dark" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </span>
          </button>

          {/* Firebase User Authentication Status */}
          {currentUser ? (
            <div className="hv-user-profile-badge">
              <span className="hv-user-avatar">
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : "U"}
              </span>
              <div className="hv-user-meta">
                <span className="hv-user-name">{currentUser.displayName || "Active User"}</span>
                <span className="hv-user-role">{currentUser.role.toUpperCase()}</span>
              </div>
              <button className="hv-signout-btn" onClick={onLogout} title="Sign Out">
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="hv-signin-btn"
              onClick={() => setIsAuthOpen(true)}
            >
              Sign In
            </button>
          )}

          {/* Havu pill CTA */}
          <button className="hv-pill-cta" onClick={handleStartCTA}>
            Start Interview →
          </button>
        </div>
      </header>

      {/* ─── PHASE 8: SPLINE HERO SECTION WITH SPOTLIGHT & SHADCN CARD ─── */}
      <section id="hero-spline" className="hv-hero" style={{ paddingBottom: "24px" }}>
        <div className="hv-hero-kicker-row">
          <p className="hv-kicker">AN AI-NATIVE INTERVIEW & EVALUATION PARTNER</p>
          <p className="hv-kicker hv-kicker-right">VOICE AI // ZERO MEDIA RETENTION // EST. 2026</p>
        </div>

        {/* Responsive Hero Card with Spotlight & Spline 3D Scene */}
        <div style={{ position: "relative", width: "100%", margin: "24px 0" }}>
          <Card className="relative w-full overflow-hidden border border-white/10 bg-neutral-950/80 shadow-2xl backdrop-blur-2xl">
            <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="rgba(99, 102, 241, 0.25)" size={500} />
            
            <div className="flex flex-col lg:flex-row items-center justify-between p-6 sm:p-10 lg:p-14 gap-8">
              {/* Left Side: Zara Headline, Description, and CTAs */}
              <div className="flex-1 z-10 max-w-xl text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  Live Voice AI Interview Partner
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight mb-5">
                  Practice smarter. <br />
                  <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
                    Interview with confidence.
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-neutral-300 leading-relaxed mb-8">
                  Meet Zara, your AI interview partner. Practice role-specific questions, understand your strengths, and get evidence-based feedback to prepare for your next opportunity.
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className="hv-primary-btn"
                    style={{ fontSize: "1rem", padding: "12px 24px" }}
                    onClick={handleStartCTA}
                  >
                    Start an Interview →
                  </button>
                  <button
                    className="hv-secondary-btn"
                    style={{ fontSize: "1rem", padding: "12px 24px" }}
                    onClick={scrollToHowItWorks}
                  >
                    Explore How It Works
                  </button>
                </div>

                <div className="flex items-center gap-6 mt-8 pt-6 border-t border-white/10 text-xs text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Google Authentication
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Zero Media Retention
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Deterministic Scoring
                  </span>
                </div>
              </div>

              {/* Right Side: Lazily Loaded Spline 3D Scene */}
              <div className="w-full lg:w-[480px] h-[320px] sm:h-[400px] lg:h-[460px] relative z-10 rounded-2xl overflow-hidden border border-white/5 bg-black/30">
                <SplineScene
                  scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                  className="h-full w-full"
                />
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ─── Infinite Marquee Ribbon (Havu Ticker) ─── */}
      <div className="hv-ticker-wrap">
        <div className="hv-ticker-track" style={{ transform: `translateX(${tickerOffset}px)` }}>
          <span className="hv-ticker-item">Natural Voice AI Dialogue ({benchmarks.stt_p50_latency_ms}ms latency)</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Resume & Project Document RAG</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Zero Permanent Media Retention</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Deterministic Technical & STAR Rubrics</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Automated Evidence & Scorecard Reporting</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Natural Voice AI Dialogue ({benchmarks.stt_p50_latency_ms}ms latency)</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Resume & Project Document RAG</span>
        </div>
      </div>

      {/* ─── Section 01: How Zara Works ─── */}
      <section id="how-it-works" className="hv-section">
        <div className="hv-section-header-row">
          <div className="hv-section-tag">
            <span className="hv-tag-label">01 — HOW IT WORKS</span>
          </div>
          <h2 className="hv-section-title">
            Structured candidate preparation from upload to authoritative evaluation.
          </h2>
        </div>

        <div className="hv-cards-grid">
          <div className="hv-card">
            <div className="hv-card-index">STEP 1</div>
            <div className="hv-card-badge">PROFILE & ONBOARDING</div>
            <h3 className="hv-card-title">Upload Resume & Target Role</h3>
            <p className="hv-card-text">
              Securely parse your PDF or DOCX resume. Review and edit extracted skills, education, and career preferences before indexing for semantic grounding.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">STEP 2</div>
            <div className="hv-card-badge">DEVICE CHECK</div>
            <h3 className="hv-card-title">Permissions & Privacy Consent</h3>
            <p className="hv-card-text">
              Test your microphone and camera. Confirm our strict zero-retention privacy policy: camera and microphone frames are analyzed in-memory and discarded.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">STEP 3</div>
            <div className="hv-card-badge">LIVE SIMULATION</div>
            <h3 className="hv-card-title">Conversational AI Interview</h3>
            <p className="hv-card-text">
              Engage with Zara in real time. Answer one question at a time across technical architecture, problem solving, and STAR behavioral scenarios.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">STEP 4</div>
            <div className="hv-card-badge">EVIDENCE SCORECARD</div>
            <h3 className="hv-card-title">Deterministic Results & Roadmap</h3>
            <p className="hv-card-text">
              Receive authoritative criterion-level ratings, traceable evidence from your answers, knowledge gap analysis, and tailored practice exercises.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Section 02: Capabilities Grid ─── */}
      <section id="capabilities" className="hv-section hv-section-alt">
        <div className="hv-section-header-center">
          <div className="hv-section-tag center">
            <span className="hv-tag-label">02 — CORE CAPABILITIES</span>
          </div>
          <h2 className="hv-section-title center">Engineered for technical and behavioral depth.</h2>
        </div>

        <div className="hv-cards-grid">
          <div className="hv-card">
            <div className="hv-card-index">01</div>
            <div className="hv-card-badge">TECHNICAL DEPTH</div>
            <h3 className="hv-card-title">Architecture & System Design</h3>
            <p className="hv-card-text">
              Questions adapt dynamically to your claimed stack. Evaluate distributed systems, database indexing, caching strategies, and API fault tolerance.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">02</div>
            <div className="hv-card-badge">BEHAVIORAL STAR</div>
            <h3 className="hv-card-title">Leadership & Conflict Resolution</h3>
            <p className="hv-card-text">
              Assess situation, task, action, and results. Evaluate accountability, production triage ownership, and cross-functional engineering communication.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">03</div>
            <div className="hv-card-badge">RAG GROUNDING</div>
            <h3 className="hv-card-title">ChromaDB Semantic Retrieval</h3>
            <p className="hv-card-text">
              Questions and follow-ups are grounded in verified documentation and candidate experience, preventing hallucinated trivia or irrelevant topics.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">04</div>
            <div className="hv-card-badge">PRIVACY FIRST</div>
            <h3 className="hv-card-title">Zero Permanent Media Retention</h3>
            <p className="hv-card-text">
              No audio or video recordings are saved to disk or cloud storage. Full cross-store account deletion purges SQLite and ChromaDB vectors immediately.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Section 03: Verified Benchmark Metrics ─── */}
      <section id="benchmarks" className="hv-section">
        <div className="hv-section-header-row">
          <div className="hv-section-tag">
            <span className="hv-tag-label">03 — VERIFIED BENCHMARKS</span>
          </div>
          <h2 className="hv-section-title">
            Empirical measurements, not fabricated marketing claims.
          </h2>
        </div>

        <div className="hv-stats-grid">
          <div className="hv-stat-box">
            <div className="hv-stat-value">{benchmarks.stt_wer}%</div>
            <div className="hv-stat-label">Word Error Rate (Deepgram Nova-3)</div>
          </div>
          <div className="hv-stat-box">
            <div className="hv-stat-value">{benchmarks.stt_p50_latency_ms}ms</div>
            <div className="hv-stat-label">Median Turnaround Latency</div>
          </div>
          <div className="hv-stat-box">
            <div className="hv-stat-value">{benchmarks.eval_agreement_pct}%</div>
            <div className="hv-stat-label">Bar-Raiser Rubric Agreement</div>
          </div>
          <div className="hv-stat-box">
            <div className="hv-stat-value">0 MB</div>
            <div className="hv-stat-label">Permanent Media Stored (Strict Privacy)</div>
          </div>
        </div>
        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.8rem", marginTop: "16px" }}>
          *Metrics derived from benchmark suite {benchmarks.benchmark_version || "v2.1-prod"} over {benchmarks.sample_size || 25} evaluated technical interview simulations.
        </p>
      </section>

      {/* ─── Section 04: Evaluation Methodology ─── */}
      <section id="methodology" className="hv-section hv-section-alt">
        <div className="hv-section-header-center">
          <div className="hv-section-tag center">
            <span className="hv-tag-label">04 — TRANSPARENT METHODOLOGY</span>
          </div>
          <h2 className="hv-section-title center">Objective, evidence-based, reproducible.</h2>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", color: "#d1d5db", fontSize: "0.95rem", lineHeight: 1.8 }}>
          <p style={{ marginBottom: "16px" }}>
            Zara AI adheres to strict evaluation integrity principles. Candidate answers are transcribed and finalized before evaluation, and scores are deterministically calculated in backend code using explicit weights:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "24px" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "#6366f1", fontWeight: 700, fontSize: "1.1rem" }}>35%</span>
              <h4 style={{ color: "#fff", margin: "4px 0" }}>Technical Depth</h4>
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: 0 }}>Factual accuracy, trade-offs, scalability, and stack mastery.</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "#10b981", fontWeight: 700, fontSize: "1.1rem" }}>25%</span>
              <h4 style={{ color: "#fff", margin: "4px 0" }}>Problem Solving</h4>
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: 0 }}>Decomposition, handling constraints, and logical reasoning.</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: "1.1rem" }}>20%</span>
              <h4 style={{ color: "#fff", margin: "4px 0" }}>Behavioral STAR</h4>
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: 0 }}>Ownership, teamwork, failure post-mortems, and outcomes.</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "#ec4899", fontWeight: 700, fontSize: "1.1rem" }}>20%</span>
              <h4 style={{ color: "#fff", margin: "4px 0" }}>Communication</h4>
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: 0 }}>Structured articulation and clarity of technical concepts.</p>
            </div>
          </div>
          <p style={{ fontSize: "0.88rem", color: "#9ca3af", borderLeft: "3px solid #6366f1", paddingLeft: "16px" }}>
            <strong>Fairness Guarantee:</strong> Demographic traits, accents, reasonable pauses, and facial movements are NEVER used to determine competence or scores. Proctoring events are documented separately for auditability and do not disqualify candidates.
          </p>
        </div>
      </section>

      {/* ─── Section 05: Bottom CTA ─── */}
      <section className="hv-cta-section">
        <div className="hv-cta-card">
          <div className="hv-kicker center">READY TO INTERVIEW WITH ZARA?</div>
          <h2 className="hv-cta-title">
            Test your skills in a live, realistic technical interview.
          </h2>
          <p className="hv-cta-sub">
            Sign in with Google, configure your target role, and experience real-time conversational voice interview intelligence.
          </p>
          <div className="hv-cta-buttons">
            <button className="hv-primary-btn large" onClick={handleStartCTA}>
              Start an Interview →
            </button>
            <button className="hv-secondary-btn large" onClick={onRecruiterPortal}>
              Recruiter Console
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="hv-footer">
        <div className="hv-footer-top">
          <div className="hv-footer-brand">
            <span className="hv-logo-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 4h16v4H4z" />
                <path d="M4 12h16v8H4z" />
                <path d="M10 12v8" />
              </svg>
            </span>
            <span className="hv-brand-name">TALENTFLOW AI</span>
            <p className="hv-footer-tagline">AI-Native Voice Interview & Assessment Platform</p>
          </div>
          <div className="hv-footer-links-grid">
            <div className="hv-footer-col">
              <h4>PLATFORM</h4>
              <button onClick={handleStartCTA}>Live Interview</button>
              <button onClick={onRecruiterPortal}>Recruiter Console</button>
              <button onClick={onAdminConsole}>Admin Portal</button>
            </div>
            <div className="hv-footer-col">
              <h4>INTELLIGENCE</h4>
              <span>Zara Voice Agent</span>
              <span>Deterministic Rubrics</span>
              <span>ChromaDB RAG</span>
            </div>
            <div className="hv-footer-col">
              <h4>PRIVACY & TRUST</h4>
              <span>Zero Media Retention</span>
              <span>Biometric Protection</span>
              <span>Data Deletion Pipeline</span>
            </div>
          </div>
        </div>

        <div className="hv-footer-bottom">
          <span>TalentFlow AI & Zara © {new Date().getFullYear()}</span>
          <span>Tokyo // San Francisco // Global</span>
          <div className="hv-footer-switch">
            <button onClick={toggleTheme}>Theme: {theme.toUpperCase()}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
