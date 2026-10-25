import React from "react";

interface LegalDocsProps {
  type: "privacy" | "terms";
  onClose: () => void;
}

export const LegalDocs: React.FC<LegalDocsProps> = ({ type, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog legal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{type === "privacy" ? "Privacy & Recording Policy" : "Terms of Service"}</h3>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body legal-body">
          {type === "privacy" ? (
            <div className="legal-content">
              <h4>1. Recording Policy: Strictly OFF by Default</h4>
              <p>
                TalentFlow AI enforces a privacy-first posture. Video interviews are NOT recorded or permanently stored by default. 
                The candidate's camera and microphone streams are evaluated in real-time memory strictly for conversational turn-taking, 
                speech-to-text processing, and proctoring signal analysis. Temporary media buffers are discarded immediately after processing.
              </p>

              <h4>2. Optional Recording with Explicit Consent</h4>
              <p>
                Video recordings are stored ONLY when:
              </p>
              <ul>
                <li>The recruiting organization explicitly configures recording for the role; AND</li>
                <li>The candidate explicitly checks the consent checkbox prior to starting the interview.</li>
              </ul>
              <p>
                Where enabled, video is uploaded to encrypted private object storage (Google Cloud Storage) with restricted access limited to authorized hiring team members.
              </p>

              <h4>3. Intelligent Proctoring Telemetry</h4>
              <p>
                To preserve academic and professional integrity in remote recruitment, the platform monitors:
              </p>
              <ul>
                <li>Primary browser window focus changes (tab-switches, application minimization)</li>
                <li>Face presence, multi-person presence, and sustained gaze deviation</li>
                <li>Microphone or camera stream disconnection events</li>
              </ul>
              <p>
                Proctoring events are factual, timestamped observations. The system never automatically disqualifies a candidate; all scores and flags are subject to human recruiter review and override.
              </p>

              <h4>4. Data Retention and Erasure</h4>
              <p>
                Evaluation reports, finalized transcripts, and proctoring logs are retained according to the recruiting company's candidate data retention schedule. Candidates may request data erasure or export at any time.
              </p>
            </div>
          ) : (
            <div className="legal-content">
              <h4>1. Acceptance of Terms</h4>
              <p>
                By accessing TalentFlow AI as a candidate or recruiter, you agree to these Terms of Service. If you do not agree with any provision, you may not proceed with the assessment.
              </p>

              <h4>2. Candidate Obligations</h4>
              <p>
                Candidates must provide truthful information, complete interviews personally without unauthorized third-party assistance or external generative AI tools during the live session, and grant device permissions required for the interview.
              </p>

              <h4>3. Recruiter & Enterprise Responsibilities</h4>
              <p>
                Hiring organizations agree to use evaluation scorecards as advisory signals to support human hiring decisions. Decisions must comply with all applicable local, national, and international labor and non-discrimination laws.
              </p>

              <h4>4. AI System Disclaimers</h4>
              <p>
                The AI interviewer and automated scoring rubrics are designed to evaluate demonstrated competence and problem-solving rationale. Scores do not constitute an infallible determination of candidate capability and must be reviewed alongside portfolios and human interviews.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary-action" onClick={onClose}>Close Document</button>
        </div>
      </div>
    </div>
  );
};

export default LegalDocs;
