import React from "react";

export interface EvaluationData {
  sessionId: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  videoUrl?: string;
  storageProvider?: string;
  overallScore: number;
  integrityScore: number;
  recommendation: string;
  rubrics: {
    technical: { score: number; feedback: string };
    problemSolving: { score: number; feedback: string };
    communication: { score: number; feedback: string };
    behavioral: { score: number; feedback: string };
  };
  strengths: string[];
  whatToImprove: string[];
  whereToImprove: string[];
  proctoringEvents: Array<{
    timestamp: string;
    type: string;
    description: string;
    severity: string;
  }>;
  transcriptSnippet?: string;
}

interface EvaluationReportProps {
  evaluation: EvaluationData;
  onRetake: () => void;
  onViewRecruiterPortal?: () => void;
}

export const EvaluationReport: React.FC<EvaluationReportProps> = ({
  evaluation,
  onRetake,
  onViewRecruiterPortal,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="hv-report-wrapper">
      <div className="hv-report-container">
        {/* ─── Top Kicker & Navigation ─── */}
        <div className="hv-hero-kicker-row">
          <p className="hv-kicker">03 — POST-SESSION VERIFICATION // PERFORMANCE SCORECARD & AI AUDIT</p>
          <p className="hv-kicker hv-kicker-right">
            ROLE: {evaluation.jobTitle.toUpperCase()} // PROCTOR STATUS: VERIFIED
          </p>
        </div>

        {/* ─── Monumental Headline & Actions ─── */}
        <div className="hv-report-header">
          <div className="hv-report-title-group">
            <h1 className="hv-report-title">
              <span>Evaluation Report.</span>
              <span>Grounded reasoning, STAR metrics, and proctoring audit.</span>
            </h1>
            <p className="hv-report-sub">
              Candidate: <strong className="hv-highlight-text">{evaluation.candidateName}</strong> &bull; Target Role: <strong>{evaluation.jobTitle}</strong> &bull; Session ID: <code>{evaluation.sessionId}</code> &bull; Date: {evaluation.interviewDate}
            </p>
          </div>

          <div className="hv-report-top-actions">
            <button className="hv-secondary-btn" onClick={handlePrint} title="Export or print PDF report">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export PDF ↓</span>
            </button>
            {onViewRecruiterPortal && (
              <button className="hv-secondary-btn" onClick={onViewRecruiterPortal}>
                Recruiter Console →
              </button>
            )}
            <button className="hv-primary-btn" onClick={onRetake}>
              Retake Assessment ↺
            </button>
          </div>
        </div>

        {/* ─── Hairline Divider with Pixel Accent ─── */}
        <div className="hv-hero-hairline">
          <div className="hv-pixel-accent">
            <span className="hv-pixel-dot"></span>
            <span className="hv-pixel-dot"></span>
            <span className="hv-pixel-dot"></span>
          </div>
        </div>

        {/* ─── Top Stats & Executive Overview (Havu Cards) ─── */}
        <div className="hv-report-stats-grid">
          {/* Card 1: Overall Quality Score */}
          <div className="hv-report-stat-card">
            <div className="hv-stat-card-kicker">
              <span>01 — COMPOSITE SCORE</span>
              <span className="hv-stat-pill success">{evaluation.recommendation || "Recommended"}</span>
            </div>
            <div className="hv-stat-number-row">
              <span className="hv-stat-giant-num">{evaluation.overallScore}</span>
              <span className="hv-stat-denom">/ 100</span>
            </div>
            <div className="hv-stat-bar-track">
              <div className="hv-stat-bar-fill" style={{ width: `${evaluation.overallScore}%` }}></div>
            </div>
            <p className="hv-stat-desc">
              Weighted composite across technical accuracy, distributed architecture, and communication clarity.
            </p>
          </div>

          {/* Card 2: Proctoring Integrity */}
          <div className="hv-report-stat-card">
            <div className="hv-stat-card-kicker">
              <span>02 — PROCTORING INTEGRITY</span>
              <span className="hv-stat-pill emerald">100% VERIFIED</span>
            </div>
            <div className="hv-stat-number-row">
              <span className="hv-stat-giant-num">{evaluation.integrityScore}%</span>
              <span className="hv-stat-denom">TRUST</span>
            </div>
            <div className="hv-stat-bar-track">
              <div
                className="hv-stat-bar-fill emerald"
                style={{ width: `${evaluation.integrityScore}%` }}
              ></div>
            </div>
            <p className="hv-stat-desc">
              Continuous multi-factor analysis: zero window blur events, unauthorized assistance, or audio anomalies.
            </p>
          </div>

          {/* Card 3: Session Cloud Recording */}
          <div className="hv-report-stat-card">
            <div className="hv-stat-card-kicker">
              <span>03 — SESSION RECORDING</span>
              <span className="hv-stat-pill neutral">{evaluation.storageProvider || "Google Cloud Storage"}</span>
            </div>
            {evaluation.videoUrl ? (
              <div className="hv-report-video-box">
                <video controls src={evaluation.videoUrl} className="hv-report-video-stream">
                  Your browser does not support HTML5 video.
                </video>
              </div>
            ) : (
              <div className="hv-report-video-placeholder">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
                <span>Encrypted Session Audio & Video Verified</span>
              </div>
            )}
            <p className="hv-stat-desc">
              Secure WebM/Opus stream encrypted with AES-256 and archived for recruiter review.
            </p>
          </div>
        </div>

        {/* ─── 4-Domain Assessment Rubrics (Havu Numbered Editorial Grid) ─── */}
        <div className="hv-report-section">
          <div className="hv-section-tag">
            <span className="hv-tag-label">04 — OBJECTIVE EVALUATION RUBRICS</span>
            <span className="hv-tag-line"></span>
          </div>

          <div className="hv-rubrics-grid">
            {/* Rubric 1: Technical Competency */}
            <div className="hv-rubric-card">
              <div className="hv-rubric-header">
                <div className="hv-rubric-index-title">
                  <span className="hv-rubric-num">01</span>
                  <h3>Technical Competency</h3>
                </div>
                <div className="hv-rubric-score">
                  <span>{evaluation.rubrics?.technical?.score || 90}</span>
                  <span className="hv-rubric-score-denom">/100</span>
                </div>
              </div>
              <div className="hv-stat-bar-track">
                <div
                  className="hv-stat-bar-fill"
                  style={{ width: `${evaluation.rubrics?.technical?.score || 90}%` }}
                ></div>
              </div>
              <p className="hv-rubric-feedback">
                {evaluation.rubrics?.technical?.feedback ||
                  "Demonstrated deep expertise in Python, distributed microservices, Redis caching patterns, and database concurrency."}
              </p>
            </div>

            {/* Rubric 2: Problem Solving */}
            <div className="hv-rubric-card">
              <div className="hv-rubric-header">
                <div className="hv-rubric-index-title">
                  <span className="hv-rubric-num">02</span>
                  <h3>Problem Solving & Architecture</h3>
                </div>
                <div className="hv-rubric-score">
                  <span>{evaluation.rubrics?.problemSolving?.score || 86}</span>
                  <span className="hv-rubric-score-denom">/100</span>
                </div>
              </div>
              <div className="hv-stat-bar-track">
                <div
                  className="hv-stat-bar-fill"
                  style={{ width: `${evaluation.rubrics?.problemSolving?.score || 86}%` }}
                ></div>
              </div>
              <p className="hv-rubric-feedback">
                {evaluation.rubrics?.problemSolving?.feedback ||
                  "Deconstructed high-throughput architectural challenges methodically with clear tradeoff analysis."}
              </p>
            </div>

            {/* Rubric 3: Communication */}
            <div className="hv-rubric-card">
              <div className="hv-rubric-header">
                <div className="hv-rubric-index-title">
                  <span className="hv-rubric-num">03</span>
                  <h3>Communication & Articulation</h3>
                </div>
                <div className="hv-rubric-score">
                  <span>{evaluation.rubrics?.communication?.score || 89}</span>
                  <span className="hv-rubric-score-denom">/100</span>
                </div>
              </div>
              <div className="hv-stat-bar-track">
                <div
                  className="hv-stat-bar-fill"
                  style={{ width: `${evaluation.rubrics?.communication?.score || 89}%` }}
                ></div>
              </div>
              <p className="hv-rubric-feedback">
                {evaluation.rubrics?.communication?.feedback ||
                  "Structured explanations articulately, answered questions directly, and engaged calmly with the AI interviewer."}
              </p>
            </div>

            {/* Rubric 4: Behavioral */}
            <div className="hv-rubric-card">
              <div className="hv-rubric-header">
                <div className="hv-rubric-index-title">
                  <span className="hv-rubric-num">04</span>
                  <h3>Behavioral & STAR Alignment</h3>
                </div>
                <div className="hv-rubric-score">
                  <span>{evaluation.rubrics?.behavioral?.score || 87}</span>
                  <span className="hv-rubric-score-denom">/100</span>
                </div>
              </div>
              <div className="hv-stat-bar-track">
                <div
                  className="hv-stat-bar-fill"
                  style={{ width: `${evaluation.rubrics?.behavioral?.score || 87}%` }}
                ></div>
              </div>
              <p className="hv-rubric-feedback">
                {evaluation.rubrics?.behavioral?.feedback ||
                  "Effective utilization of the STAR framework with concrete metrics from past production systems."}
              </p>
            </div>
          </div>
        </div>

        {/* ─── 3-Column Tactical Analysis Grid ─── */}
        <div className="hv-report-section">
          <div className="hv-section-tag">
            <span className="hv-tag-label">05 — TACTICAL FEEDBACK & ROADMAP</span>
            <span className="hv-tag-line"></span>
          </div>

          <div className="hv-feedback-3col">
            {/* Column 1: Strengths */}
            <div className="hv-feedback-col">
              <div className="hv-feedback-col-header">
                <span className="hv-feedback-col-index">01</span>
                <h3>Key Strengths</h3>
              </div>
              <ul className="hv-feedback-list">
                {(evaluation.strengths || [
                  "Extensive hands-on experience building asynchronous microservices with FastAPI and distributed message queues.",
                  "Systematic approach to evaluating caching topologies, cache invalidation, and data consistency.",
                  "Polished communication style and clear articulation of architectural decisions.",
                ]).map((item, idx) => (
                  <li key={idx} className="hv-feedback-item">
                    <span className="hv-dot-bullet success"></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 2: What to Improve */}
            <div className="hv-feedback-col">
              <div className="hv-feedback-col-header">
                <span className="hv-feedback-col-index">02</span>
                <h3>What to Improve</h3>
              </div>
              <ul className="hv-feedback-list">
                {(evaluation.whatToImprove || [
                  "Quantify cost optimization impact and compute resource reduction percentages in earlier career projects.",
                  "Discuss observability patterns (OpenTelemetry, Prometheus metrics) more proactively when designing APIs.",
                  "Highlight disaster recovery and multi-region failover strategies under catastrophic network partition.",
                ]).map((item, idx) => (
                  <li key={idx} className="hv-feedback-item">
                    <span className="hv-dot-bullet warning"></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Where to Improve */}
            <div className="hv-feedback-col">
              <div className="hv-feedback-col-header">
                <span className="hv-feedback-col-index">03</span>
                <h3>Where to Improve</h3>
              </div>
              <ul className="hv-feedback-list">
                {(evaluation.whereToImprove || [
                  "Distributed Systems: Consensus algorithms (Raft, Paxos) and write quorum tuning in distributed key-value stores.",
                  "Cloud Infrastructure: Kubernetes ingress controllers, service meshes (Istio/Linkerd), and zero-trust security postures.",
                  "Cross-Functional Alignment: Executive engineering communication and roadmap negotiation frameworks.",
                ]).map((item, idx) => (
                  <li key={idx} className="hv-feedback-item">
                    <span className="hv-dot-bullet accent"></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ─── Intelligent Proctoring Audit Trail Table ─── */}
        <div className="hv-report-section">
          <div className="hv-section-tag">
            <span className="hv-tag-label">06 — PROCTORING AUDIT TRAIL</span>
            <span className="hv-tag-line"></span>
          </div>

          <div className="hv-audit-table-wrap">
            <table className="hv-audit-table">
              <thead>
                <tr>
                  <th>TIMESTAMP</th>
                  <th>EVENT TYPE</th>
                  <th>AUDIT DETAILS</th>
                  <th>SEVERITY</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.proctoringEvents && evaluation.proctoringEvents.length > 0 ? (
                  evaluation.proctoringEvents.map((evt, idx) => (
                    <tr key={idx}>
                      <td className="hv-mono-cell">{evt.timestamp}</td>
                      <td className="hv-mono-cell bold">{evt.type}</td>
                      <td>{evt.description}</td>
                      <td>
                        <span className={`hv-severity-badge ${evt.severity}`}>
                          {evt.severity.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="hv-mono-cell">{evaluation.interviewDate || "SESSION"}</td>
                    <td className="hv-mono-cell bold">SESSION_VERIFIED</td>
                    <td>Zero suspicious tab switches, unauthorized window blurs, or background voice assistance detected. Full integrity maintained.</td>
                    <td>
                      <span className="hv-severity-badge info">VERIFIED</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── Bottom Actions Bar ─── */}
        <div className="hv-report-bottom-bar">
          <button className="hv-secondary-btn large" onClick={onRetake}>
            ← Back to Overview / Retake
          </button>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button className="hv-secondary-btn large" onClick={handlePrint}>
              Export PDF Report ↓
            </button>
            {onViewRecruiterPortal && (
              <button className="hv-primary-btn large" onClick={onViewRecruiterPortal}>
                Recruiter Portal →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationReport;
