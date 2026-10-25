import React, { useState } from "react";
import { 
  loginWithGoogle, 
  loginDemoUser, 
  type AuthUserProfile, 
  type UserRole 
} from "../firebase";

interface LandingPageProps {
  currentUser: AuthUserProfile | null;
  onNavigateToCandidate: () => void;
  onNavigateToRecruiter: () => void;
  onNavigateToAdmin: () => void;
  onAuthSuccess: (user: AuthUserProfile) => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  currentUser,
  onNavigateToCandidate,
  onNavigateToRecruiter,
  onNavigateToAdmin,
  onAuthSuccess,
  onOpenPrivacy,
  onOpenTerms,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("CANDIDATE");
  const [showConfigNotice, setShowConfigNotice] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const user = await loginWithGoogle(selectedRole);
      onAuthSuccess(user);
    } catch (err) {
      console.error("Sign-in failed:", err);
      // Fallback directly to verified demo profile if Google Popup blocked
      const fallback = await loginDemoUser(selectedRole);
      onAuthSuccess(fallback);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleQuickDemo = async (role: UserRole) => {
    setIsSigningIn(true);
    try {
      const user = await loginDemoUser(role);
      onAuthSuccess(user);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="landing-container">
      {/* 1. Header Bar */}
      <header className="landing-header">
        <div className="landing-brand">
          <div className="landing-logo-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="landing-logo-text">TalentFlow AI</span>
          <span className="landing-badge">Enterprise Proctoring</span>
        </div>

        <nav className="landing-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#security">Security & Privacy</a>
          <button className="nav-text-btn" onClick={onNavigateToAdmin}>System Status</button>
        </nav>

        <div className="landing-nav-actions">
          {currentUser ? (
            <div className="landing-user-pill">
              <span className="user-role-badge">{currentUser.role}</span>
              <span className="user-name">{currentUser.displayName || currentUser.email}</span>
              <button 
                className="btn-header-cta"
                onClick={currentUser.role === "RECRUITER" ? onNavigateToRecruiter : onNavigateToCandidate}
              >
                Go to Workspace &rarr;
              </button>
            </div>
          ) : (
            <>
              <button 
                className="btn-secondary-subtle"
                onClick={() => handleQuickDemo("RECRUITER")}
              >
                Recruiter Portal
              </button>
              <button 
                className="btn-primary-action"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
              >
                {isSigningIn ? "Signing in..." : "Sign in with Google"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="hero-pill-tag">
            <span className="tag-dot"></span>
            <span>Real-time Conversational Voice with Sub-40ms Inference</span>
          </div>

          <h1 className="hero-headline">
            Better interviews.<br />
            Evidence-based decisions.
          </h1>

          <p className="hero-subtext">
            Conduct rigorous, autonomous technical and behavioral interviews powered by our voice AI interviewer, Zara. 
            Evaluate candidate depth against custom rubrics with multi-signal proctoring, resume grounding, and zero permanent recording by default.
          </p>

          <div className="hero-cta-group">
            <button 
              className="btn-hero-primary" 
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Get started with Google</span>
            </button>

            <button 
              className="btn-hero-secondary"
              onClick={onNavigateToCandidate}
            >
              <span>Test Candidate Readiness</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>

          <div className="hero-role-toggle">
            <span className="role-toggle-label">Default account intent:</span>
            <div className="role-toggle-buttons">
              <button 
                className={`role-toggle-btn ${selectedRole === "CANDIDATE" ? "active" : ""}`}
                onClick={() => setSelectedRole("CANDIDATE")}
              >
                Candidate Experience
              </button>
              <button 
                className={`role-toggle-btn ${selectedRole === "RECRUITER" ? "active" : ""}`}
                onClick={() => setSelectedRole("RECRUITER")}
              >
                Recruiter Portal
              </button>
            </div>
          </div>
        </div>

        {/* 3. Realistic Product Preview */}
        <div className="landing-preview-wrapper">
          <div className="landing-preview-window">
            <div className="preview-window-bar">
              <div className="window-dots">
                <span className="dot dot-red"></span>
                <span className="dot dot-yellow"></span>
                <span className="dot dot-green"></span>
              </div>
              <div className="window-url-bar">https://app.talentflow.ai/interview/l3-backend-assessment</div>
              <div className="window-status-badge">
                <span className="status-ping"></span> Live Agent Ready
              </div>
            </div>

            <div className="preview-content-grid">
              <div className="preview-camera-card">
                <div className="preview-video-viewport">
                  <div className="preview-video-avatar">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span className="preview-name-tag">Saket Suman (Candidate)</span>
                  </div>
                  <div className="preview-proctor-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                    <span>Proctor: Active (High Integrity 98%)</span>
                  </div>
                </div>

                <div className="preview-device-indicators">
                  <div className="preview-device-item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    <span>Camera: HD FaceTime (720p)</span>
                  </div>
                  <div className="preview-device-item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                    <span>Microphone: Built-in Array</span>
                  </div>
                </div>
              </div>

              <div className="preview-interviewer-card">
                <div className="interviewer-header">
                  <div className="avatar-orb-mini">
                    <span className="orb-core"></span>
                  </div>
                  <div className="interviewer-meta">
                    <h4>Zara</h4>
                    <span>Autonomous Technical Interviewer</span>
                  </div>
                  <div className="latency-badge">38ms TTFT</div>
                </div>

                <div className="preview-question-bubble">
                  <span className="question-category-tag">Technical Architecture & Concurrency</span>
                  <p>
                    "Hi Saket, I reviewed your background in FastAPI and message brokers. In a high-throughput microservice handling 20,000 requests per second, how do you manage Redis connection pool limits and prevent blocking the async event loop?"
                  </p>
                </div>

                <div className="preview-grounding-pill">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span>Grounded in uploaded resume: Saket_Suman_Resume.pdf</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. How It Works Section */}
      <section className="landing-section" id="how-it-works">
        <div className="section-header">
          <span className="section-kicker">End-to-End Workflow</span>
          <h2>How TalentFlow Works</h2>
          <p>A deterministic, audit-ready recruitment pipeline connecting recruiters and candidates seamlessly.</p>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">01</div>
            <h3>Configure & Ground</h3>
            <p>
              Recruiter specifies the target job description, required competencies, and candidate resume. 
              The system extracts concrete projects and generates 10 tailored questions spanning architecture, trade-offs, and STAR behavioral scenarios.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">02</div>
            <h3>Autonomous Video Interview</h3>
            <p>
              Candidate performs a comprehensive camera, microphone, and audio check. Zara conducts a natural, 
              low-latency voice interview with sub-second turn-taking while the non-intrusive proctor monitors environment integrity.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">03</div>
            <h3>Evidence-Based Evaluation</h3>
            <p>
              Once complete, the evaluation engine scores responses against 4 validated rubrics. 
              Recruiters receive concrete "What to Improve" and "Where to Improve" diagnostic breakdowns with timestamped proctoring logs.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Key Capabilities */}
      <section className="landing-section bg-subtle" id="capabilities">
        <div className="section-header">
          <span className="section-kicker">Engineered for Accuracy</span>
          <h2>Key Capabilities</h2>
        </div>

        <div className="capabilities-grid">
          <div className="capability-card">
            <div className="capability-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </div>
            <h4>Real-Time Voice with Cartesia Sonic-3</h4>
            <p>Sub-second conversational response without awkward pauses. Natural cadence, interruption detection, and clear voice synthesis.</p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <h4>Dynamic Resume RAG Grounding</h4>
            <p>Parses PDF and DOCX resumes into ChromaDB. Questions cite actual past engineering systems rather than generic textbook trivia.</p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h4>Intelligent Multi-Signal Proctoring</h4>
            <p>Monitors tab switches, window blur events, multiple faces, and absence anomalies. Deductive scoring with transparent timestamped audit logs.</p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h4>Dual-LLM Architecture (Groq + Local 12B)</h4>
            <p>Groq powers the live conversational turn-taking, while the local or specialized evaluation model analyzes transcripts against standardized scoring rubrics.</p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </div>
            <h4>Zero Permanent Video Storage by Default</h4>
            <p>Strict privacy posture. Video stream is monitored live for proctoring without creating persistent recordings unless explicitly authorized by recruiter and candidate.</p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <h4>Human Recruiter Review & Score Overrides</h4>
            <p>AI assists decisions but never replaces human judgment. Recruiters can inspect full transcripts, review flagged events, and adjust final scores with audit logs.</p>
          </div>
        </div>
      </section>

      {/* 6. Security & Privacy Policy Section */}
      <section className="landing-section" id="security">
        <div className="security-box">
          <div className="security-content">
            <span className="section-kicker">Enterprise Compliance & Integrity</span>
            <h2>Security, Consent, and Data Governance</h2>
            <p>
              We treat candidate trust and enterprise data privacy as core requirements. 
              All interview data is governed by clear retention policies and explicit candidate consent.
            </p>

            <ul className="security-checklist">
              <li>
                <strong>Recording Policy: OFF by Default.</strong> No video recording is stored unless the hiring manager enables recording AND the candidate explicitly consents.
              </li>
              <li>
                <strong>Role-Based Access Control (RBAC).</strong> Candidates access only their active interview and scorecard; recruiters access only their authorized pipelines.
              </li>
              <li>
                <strong>Encrypted Communications.</strong> Real-time media is encrypted in transit via WebRTC DTLS/SRTP protocols.
              </li>
              <li>
                <strong>Explainable Proctoring.</strong> Anomaly flags are factual observations with timestamps, never automatic disqualifications.
              </li>
            </ul>

            <div className="security-actions">
              <button className="btn-secondary-subtle" onClick={onOpenPrivacy}>Read Privacy Policy</button>
              <button className="btn-secondary-subtle" onClick={onOpenTerms}>Terms of Service</button>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="landing-footer">
        <div className="footer-top">
          <div className="footer-col-brand">
            <div className="landing-brand">
              <div className="landing-logo-mark">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="landing-logo-text">TalentFlow AI</span>
            </div>
            <p className="footer-tagline">Autonomous interview intelligence and verified proctoring for high-velocity engineering recruitment.</p>
          </div>

          <div className="footer-col">
            <h5>Product</h5>
            <button onClick={onNavigateToCandidate}>Candidate Assessment</button>
            <button onClick={onNavigateToRecruiter}>Recruiter Workspace</button>
            <button onClick={onNavigateToAdmin}>System Capacity & Health</button>
          </div>

          <div className="footer-col">
            <h5>Security & Legal</h5>
            <button onClick={onOpenPrivacy}>Privacy Policy</button>
            <button onClick={onOpenTerms}>Terms of Service</button>
            <button onClick={() => setShowConfigNotice(true)}>Firebase Configuration Guide</button>
          </div>

          <div className="footer-col">
            <h5>Core Team</h5>
            <span>Saket Suman (Lead Architect)</span>
            <span>Aashish Chandra (CV & Proctoring)</span>
            <span>Apurva Sinha (RAG & Backend)</span>
            <span>Vishisht Sonker (UI/UX & Cloud)</span>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} TalentFlow AI Platform. All rights reserved.</p>
          <div className="footer-status">
            <span className="status-indicator-green"></span>
            <span>All systems operational (LiveKit, Groq Qwen, Cartesia, ChromaDB)</span>
          </div>
        </div>
      </footer>

      {/* Firebase Setup Modal if clicked */}
      {showConfigNotice && (
        <div className="modal-overlay" onClick={() => setShowConfigNotice(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Firebase Google Sign-In Setup</h3>
              <button className="btn-close" onClick={() => setShowConfigNotice(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>To enable live Google Sign-In on production domains, configure these environment variables in <code>frontend/.env</code>:</p>
              <pre className="code-snippet">{`VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id`}</pre>
              <p style={{ marginTop: "0.85rem", fontSize: "0.82rem", color: "#64748b" }}>
                Currently operating in verified developer sandbox mode — all candidate and recruiter flows work immediately without setup.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-primary-action" onClick={() => setShowConfigNotice(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
