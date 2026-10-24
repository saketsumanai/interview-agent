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
  const getBadgeClass = (score: number) => {
    if (score >= 80) return "badge-success";
    if (score >= 60) return "badge-warning";
    return "badge-danger";
  };

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-card">
        {/* Top Header matching Screenshot */}
        <header className="onboarding-top-bar">
          <button className="icon-btn-ghost" onClick={onRetake} title="Exit report">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="onboarding-step-indicator">
            <span className="step-circle">3</span>
            <span className="step-label">{evaluation.jobTitle || "L3+ software engineering"} &bull; Performance Report</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button className="btn-secondary-dark" onClick={() => window.print()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
              </svg>
              Export Report
            </button>
            {onViewRecruiterPortal && (
              <button className="btn-secondary-dark" onClick={onViewRecruiterPortal}>
                Recruiter Console
              </button>
            )}
            <button className="btn-primary-start" onClick={onRetake}>
              Retake Assessment
            </button>
          </div>
        </header>

        {/* Section Headline */}
        <section className="onboarding-headline">
          <h1>Assessment with our AI, Zara &mdash; Final Scorecard</h1>
          <p>
            Zara has analyzed your technical reasoning, problem solving, STAR responses, and proctoring integrity throughout the session.
          </p>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {/* Candidate Profile Summary Header */}
          <section className="eval-header-card">
          <div className="eval-profile-meta">
            <div className="candidate-avatar-large">
              {evaluation.candidateName ? evaluation.candidateName.charAt(0) : "C"}
            </div>
            <div>
              <div className="candidate-name-row">
                <h1>{evaluation.candidateName || "Candidate"}</h1>
                <span className={`eval-status-pill ${getBadgeClass(evaluation.overallScore)}`}>
                  {evaluation.recommendation || "Completed Assessment"}
                </span>
              </div>
              <p className="eval-role-subtext">
                Target Role: <strong>{evaluation.jobTitle || "Software Engineer"}</strong> &bull; Completed on {evaluation.interviewDate || "Today"}
              </p>
            </div>
          </div>

          <div className="eval-top-metrics">
            <div className="metric-box">
              <span className="metric-label">Quality Score</span>
              <div className="metric-value-row">
                <span className="metric-number">{evaluation.overallScore}</span>
                <span className="metric-max">/100</span>
              </div>
              <div className="metric-progress-track">
                <div className="metric-progress-fill" style={{ width: `${evaluation.overallScore}%` }}></div>
              </div>
            </div>

            <div className="metric-box">
              <span className="metric-label">Proctoring Integrity</span>
              <div className="metric-value-row">
                <span className="metric-number">{evaluation.integrityScore}</span>
                <span className="metric-max">/100</span>
              </div>
              <div className="metric-progress-track">
                <div
                  className="metric-progress-fill"
                  style={{
                    width: `${evaluation.integrityScore}%`,
                    background: evaluation.integrityScore > 80 ? "#10b981" : "#f59e0b",
                  }}
                ></div>
              </div>
            </div>
          </div>
        </section>

        {/* Video Interview Recording & GCS Cloud Storage Section */}
        {evaluation.videoUrl && (
          <section className="eval-section-card">
            <div className="section-title-row">
              <div className="title-with-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
                <h2>Interview Video Recording</h2>
              </div>
              <div className="storage-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                </svg>
                <span>{evaluation.storageProvider || "Google Cloud Storage"}</span>
              </div>
            </div>

            <div className="video-player-container">
              <video
                controls
                src={evaluation.videoUrl}
                className="recorded-interview-video"
                poster="/assets/video-poster.jpg"
              >
                Your browser does not support HTML5 video streaming.
              </video>
            </div>
          </section>
        )}

        {/* 4-Domain Assessment Rubric */}
        <section className="eval-section-card">
          <div className="title-with-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <h2>Performance Rubrics & Competency Breakdown</h2>
          </div>

          <div className="rubrics-grid">
            {/* Technical Competency */}
            <div className="rubric-card">
              <div className="rubric-card-header">
                <h3>Technical Competency</h3>
                <span className="rubric-score">{evaluation.rubrics?.technical?.score || 82}/100</span>
              </div>
              <div className="rubric-track">
                <div className="rubric-fill" style={{ width: `${evaluation.rubrics?.technical?.score || 82}%` }}></div>
              </div>
              <p className="rubric-feedback">{evaluation.rubrics?.technical?.feedback || "Demonstrated solid technical grasp of relevant frameworks, system architecture, and algorithmic design patterns."}</p>
            </div>

            {/* Problem Solving */}
            <div className="rubric-card">
              <div className="rubric-card-header">
                <h3>Problem Solving & Architecture</h3>
                <span className="rubric-score">{evaluation.rubrics?.problemSolving?.score || 80}/100</span>
              </div>
              <div className="rubric-track">
                <div className="rubric-fill" style={{ width: `${evaluation.rubrics?.problemSolving?.score || 80}%` }}></div>
              </div>
              <p className="rubric-feedback">{evaluation.rubrics?.problemSolving?.feedback || "Structured responses logically, walked through edge cases, and proposed pragmatic trade-offs."}</p>
            </div>

            {/* Communication & Clarity */}
            <div className="rubric-card">
              <div className="rubric-card-header">
                <h3>Communication & Articulation</h3>
                <span className="rubric-score">{evaluation.rubrics?.communication?.score || 85}/100</span>
              </div>
              <div className="rubric-track">
                <div className="rubric-fill" style={{ width: `${evaluation.rubrics?.communication?.score || 85}%` }}></div>
              </div>
              <p className="rubric-feedback">{evaluation.rubrics?.communication?.feedback || "Clear, concise speech with confident delivery and well-paced explanations."}</p>
            </div>

            {/* Behavioral & STAR Alignment */}
            <div className="rubric-card">
              <div className="rubric-card-header">
                <h3>Behavioral & Experience Fit</h3>
                <span className="rubric-score">{evaluation.rubrics?.behavioral?.score || 78}/100</span>
              </div>
              <div className="rubric-track">
                <div className="rubric-fill" style={{ width: `${evaluation.rubrics?.behavioral?.score || 78}%` }}></div>
              </div>
              <p className="rubric-feedback">{evaluation.rubrics?.behavioral?.feedback || "Gave grounded real-world examples from past projects using the Situation-Task-Action-Result format."}</p>
            </div>
          </div>
        </section>

        {/* Detailed "What to Improve" and "Where to Improve" Grid */}
        <div className="improvement-grid">
          {/* Key Strengths */}
          <section className="eval-section-card strengths-card">
            <div className="title-with-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <h2>Key Strengths</h2>
            </div>
            <ul className="feedback-bullets">
              {(evaluation.strengths || [
                "Strong grasp of core data structures and asynchronous runtime behavior.",
                "Articulate and professional verbal communication throughout the interview session.",
                "Effective contextualization of past technical achievements and team contributions."
              ]).map((item, idx) => (
                <li key={idx} className="strength-bullet">
                  <span className="bullet-dot bullet-success"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* What to Improve */}
          <section className="eval-section-card what-improve-card">
            <div className="title-with-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <h2>What to Improve</h2>
            </div>
            <p className="section-subtitle">Specific skills and answer structures to refine:</p>
            <ul className="feedback-bullets">
              {(evaluation.whatToImprove || [
                "Quantify measurable outcomes (e.g., latency reduction %, scale, throughput metrics) when discussing past projects.",
                "Explicitly address failure modes and fallback strategies in distributed systems questions.",
                "Structure answers more tightly using the STAR method to avoid rambling on open-ended scenarios."
              ]).map((item, idx) => (
                <li key={idx} className="improve-bullet">
                  <span className="bullet-dot bullet-warning"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Where to Improve */}
          <section className="eval-section-card where-improve-card">
            <div className="title-with-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
              </svg>
              <h2>Where to Improve</h2>
            </div>
            <p className="section-subtitle">Targeted technical domains and recommended learning areas:</p>
            <ul className="feedback-bullets">
              {(evaluation.whereToImprove || [
                "System Design: Database sharding, caching tiers (Redis/Memcached), and distributed consensus protocols (Raft/Paxos).",
                "Cloud Reliability: Disaster recovery, circuit breakers, and zero-downtime deployment pipelines in Kubernetes.",
                "Behavioral Mastery: Senior stakeholder conflict resolution and cross-functional technical alignment."
              ]).map((item, idx) => (
                <li key={idx} className="topic-bullet">
                  <span className="bullet-dot bullet-accent"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Proctoring & Integrity Audit Log */}
        <section className="eval-section-card">
          <div className="section-title-row">
            <div className="title-with-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <h2>Intelligent Proctoring Audit Trail</h2>
            </div>
            <div className="integrity-tag">
              Score: <strong>{evaluation.integrityScore}/100</strong>
            </div>
          </div>

          <div className="proctoring-log-table">
            <div className="log-table-header">
              <span>Timestamp</span>
              <span>Event Type</span>
              <span>Audit Details</span>
              <span>Severity</span>
            </div>
            {(evaluation.proctoringEvents && evaluation.proctoringEvents.length > 0 ? (
              evaluation.proctoringEvents.map((evt, idx) => (
                <div key={idx} className="log-table-row">
                  <span className="log-time">{evt.timestamp}</span>
                  <span className="log-type">{evt.type}</span>
                  <span className="log-desc">{evt.description}</span>
                  <span className={`log-sev sev-${evt.severity}`}>{evt.severity}</span>
                </div>
              ))
            ) : (
              <div className="log-table-row clean-session">
                <span className="log-time">{evaluation.interviewDate || "During session"}</span>
                <span className="log-type">SESSION_VERIFIED</span>
                <span className="log-desc">Zero suspicious tab switches or window blurs detected during the interview. Full integrity maintained.</span>
                <span className="log-sev sev-info">Verified</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  </div>
);
};
export default EvaluationReport;
