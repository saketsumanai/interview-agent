import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import type { AuthUserProfile } from "../firebase";

interface LandingPageProps {
  onStartInterview: () => void;
  onRecruiterPortal: () => void;
  onAdminConsole: () => void;
  currentUser?: AuthUserProfile | null;
  onLoginSuccess?: (user: AuthUserProfile) => void;
  onLogout?: () => void;
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

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("tf-theme", nextTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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

  return (
    <div className={`havu-container ${theme}`}>
      {/* Auth Modal linked with Firebase */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          onLoginSuccess?.(user);
          setIsAuthOpen(false);
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
          <a href="#problem" className="hv-nav-item">The Problem</a>
          <a href="#approach" className="hv-nav-item">Approach</a>
          <a href="#capabilities" className="hv-nav-item">Capabilities</a>
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
          <button className="hv-pill-cta" onClick={onStartInterview}>
            Start Interview →
          </button>
        </div>
      </header>

      {/* ─── Hero Section (Havu Exact Layout) ─── */}
      <section className="hv-hero">
        <div className="hv-hero-kicker-row">
          <p className="hv-kicker">AN AI-NATIVE INTERVIEW & EVALUATION PARTNER</p>
          <p className="hv-kicker hv-kicker-right">VOICE AI // PROCTORING ACTIVE // EST. 2026</p>
        </div>

        <div className="hv-hero-title-container">
          <h1 className="hv-hero-title">
            <span>We don't just ask questions.</span>
            <span>We design the interviews</span>
            <span>that reveal true talent.</span>
          </h1>
        </div>

        <div className="hv-hero-hairline">
          <div className="hv-pixel-accent">
            <span className="hv-pixel-dot"></span>
            <span className="hv-pixel-dot"></span>
            <span className="hv-pixel-dot"></span>
          </div>
        </div>

        <div className="hv-hero-bottom-row">
          <p className="hv-hero-desc">
            Come before the candidate is hired. Real-time voice dialogue, resume-grounded
            technical questioning, multi-dimensional rubrics, and non-invasive proctoring.
          </p>
          <div className="hv-hero-cta-group">
            <button className="hv-primary-btn" onClick={onStartInterview}>
              Start Mock Interview →
            </button>
            <button className="hv-secondary-btn" onClick={onRecruiterPortal}>
              Recruiter Console
            </button>
          </div>
        </div>
      </section>

      {/* ─── Infinite Marquee Ribbon (Havu Ticker) ─── */}
      <div className="hv-ticker-wrap">
        <div className="hv-ticker-track" style={{ transform: `translateX(${tickerOffset}px)` }}>
          <span className="hv-ticker-item">Natural Voice AI Dialogue (sub-3s latency)</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Resume & Project Document RAG</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Intelligent Non-Invasive Proctoring</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Structured Technical & Behavioral Rubrics</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Automated Integrity & Scorecard Reporting</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Natural Voice AI Dialogue (sub-3s latency)</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Resume & Project Document RAG</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Intelligent Non-Invasive Proctoring</span>
          <span className="hv-ticker-slash">/</span>
          <span className="hv-ticker-item">Structured Technical & Behavioral Rubrics</span>
          <span className="hv-ticker-slash">/</span>
        </div>
      </div>

      {/* ─── Section 01: The Problem (Havu 2-column numbered layout) ─── */}
      <section id="problem" className="hv-section">
        <div className="hv-grid-2col">
          <div className="hv-col-left">
            <div className="hv-section-tag">
              <span className="hv-tag-label">01 — THE PROBLEM</span>
              <span className="hv-tag-line"></span>
            </div>
            <h2 className="hv-section-title">
              The faster AI generates resumes, the more live voice dialogue matters.
            </h2>
            <p className="hv-section-body">
              Resumes and take-home tests have lost their signal. Engineering hiring teams
              spend 40+ hours every month filtering candidates who look immaculate on paper
              but falter under real-time architectural interrogation.
            </p>
          </div>

          <div className="hv-col-right">
            <div className="hv-numbered-list">
              <div className="hv-num-item">
                <span className="hv-num">01</span>
                <div className="hv-num-content">
                  <h3>Resumes declare claims, not problem-solving depth</h3>
                  <p>Keyword-optimized PDF documents cannot measure how an engineer actually deconstructs ambiguous system failures.</p>
                </div>
              </div>

              <div className="hv-num-item">
                <span className="hv-num">02</span>
                <div className="hv-num-content">
                  <h3>Engineering teams spend 40+ hours per month on screening</h3>
                  <p>Senior engineers waste valuable sprint cycles conducting repetitive round-one sanity screens.</p>
                </div>
              </div>

              <div className="hv-num-item">
                <span className="hv-num">03</span>
                <div className="hv-num-content">
                  <h3>Inconsistent interviewer rubrics introduce unconscious bias</h3>
                  <p>Every human interviewer grades with different standards, leading to disputed hiring outcomes and lost top-tier talent.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 02: Our Approach (Havu 2-column numbered layout) ─── */}
      <section id="approach" className="hv-section hv-section-alt">
        <div className="hv-grid-2col">
          <div className="hv-col-left">
            <div className="hv-section-tag">
              <span className="hv-tag-label">02 — OUR APPROACH</span>
              <span className="hv-tag-line"></span>
            </div>
            <h2 className="hv-section-title">
              Meet Zara: An adaptive interviewer that listens, probes, and evaluates.
            </h2>
            <p className="hv-section-body">
              Zara isn't a chatbot or a recorded video form. She conducts live, contextual
              voice conversations, asking grounded follow-ups tailored to each candidate's
              actual experience and code portfolio.
            </p>
          </div>

          <div className="hv-col-right">
            <div className="hv-numbered-list">
              <div className="hv-num-item">
                <span className="hv-num">01</span>
                <div className="hv-num-content">
                  <h3>Sub-3s Voice Intelligence</h3>
                  <p>Powered by Cartesia Sonic TTS, AssemblyAI STT, and GPT-4o for rapid, fluid dialogue without awkward latency pauses.</p>
                </div>
              </div>

              <div className="hv-num-item">
                <span className="hv-num">02</span>
                <div className="hv-num-content">
                  <h3>Contextual Resume RAG Ingestion</h3>
                  <p>Ingests the candidate's PDF resume and GitHub architectures to ask genuine follow-up questions instead of generic trivia.</p>
                </div>
              </div>

              <div className="hv-num-item">
                <span className="hv-num">03</span>
                <div className="hv-num-content">
                  <h3>Intelligent Proctoring & Integrity</h3>
                  <p>Non-invasive webcam monitoring, tab-switch detection, and continuous integrity scoring with zero third-party software.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 03: Capabilities Grid (Havu Editorial Cards) ─── */}
      <section id="capabilities" className="hv-section">
        <div className="hv-section-header-center">
          <div className="hv-section-tag center">
            <span className="hv-tag-label">03 — CAPABILITIES</span>
          </div>
          <h2 className="hv-section-title center">Engineered for technical rigor.</h2>
        </div>

        <div className="hv-cards-grid">
          <div className="hv-card">
            <div className="hv-card-index">01</div>
            <div className="hv-card-badge">LIVE VOICE</div>
            <h3 className="hv-card-title">Real-Time Conversational AI</h3>
            <p className="hv-card-text">
              Interruptible natural voice interaction. Zara pauses when you speak, clarifies questions, and keeps the conversation human and engaging.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">02</div>
            <div className="hv-card-badge">EVALUATION</div>
            <h3 className="hv-card-title">Objective Rubric Scorecards</h3>
            <p className="hv-card-text">
              Instant four-dimensional scoring across Technical Mastery, Problem-Solving, Communication, and Behavioral STAR frameworks.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">03</div>
            <div className="hv-card-badge">PROCTORING</div>
            <h3 className="hv-card-title">Zero-Install Integrity Tracking</h3>
            <p className="hv-card-text">
              Real-time tab deflection tracking, face position verification, and proctoring audit logs preserved directly for recruiters.
            </p>
          </div>

          <div className="hv-card">
            <div className="hv-card-index">04</div>
            <div className="hv-card-badge">ENTERPRISE</div>
            <h3 className="hv-card-title">Recruiter & Hiring Console</h3>
            <p className="hv-card-text">
              Define custom job descriptions, generate role-specific questions, and review timestamped candidate video recordings and full transcripts.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Section 04: Metrics (Havu Stat Counters) ─── */}
      <section className="hv-section hv-section-alt">
        <div className="hv-stats-grid">
          <div className="hv-stat-box">
            <div className="hv-stat-value">2,400<span className="hv-stat-plus">+</span></div>
            <div className="hv-stat-label">Interviews Completed</div>
          </div>
          <div className="hv-stat-box">
            <div className="hv-stat-value">97<span className="hv-stat-plus">%</span></div>
            <div className="hv-stat-label">Evaluation Accuracy</div>
          </div>
          <div className="hv-stat-box">
            <div className="hv-stat-value">2.8<span className="hv-stat-plus">s</span></div>
            <div className="hv-stat-label">Voice Latency</div>
          </div>
          <div className="hv-stat-box">
            <div className="hv-stat-value">40<span className="hv-stat-plus">h</span></div>
            <div className="hv-stat-label">Eng Hours Saved / Mo</div>
          </div>
        </div>
      </section>

      {/* ─── Section 05: Bottom CTA (Havu Style) ─── */}
      <section className="hv-cta-section">
        <div className="hv-cta-card">
          <div className="hv-kicker center">READY TO INTERVIEW WITH ZARA?</div>
          <h2 className="hv-cta-title">
            Test your skills in a live, realistic technical interview.
          </h2>
          <p className="hv-cta-sub">
            Experience the candidate interview flow now, or open the Recruiter Console to configure custom role criteria.
          </p>
          <div className="hv-cta-buttons">
            <button className="hv-primary-btn large" onClick={onStartInterview}>
              Launch Interview Session →
            </button>
            <button className="hv-secondary-btn large" onClick={onRecruiterPortal}>
              Recruiter Console
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer (Havu Style) ─── */}
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
              <button onClick={onStartInterview}>Live Interview</button>
              <button onClick={onRecruiterPortal}>Recruiter Console</button>
              <button onClick={onAdminConsole}>Admin Portal</button>
            </div>
            <div className="hv-footer-col">
              <h4>INTELLIGENCE</h4>
              <span>Zara Voice Agent</span>
              <span>Intelligent Proctoring</span>
              <span>Rubric Scorecards</span>
            </div>
            <div className="hv-footer-col">
              <h4>INFRASTRUCTURE</h4>
              <span>LiveKit WebRTC</span>
              <span>AssemblyAI STT</span>
              <span>Cartesia TTS</span>
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
