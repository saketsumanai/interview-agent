import React, { useState } from "react";

interface RecruiterPortalProps {
  onLaunchCandidateInterview: (config: {
    jobTitle: string;
    jobDescription: string;
    experienceLevel: string;
    numQuestions: number;
    durationMinutes: number;
    candidateName: string;
    questions: Array<{ category: string; question: string; difficulty: string }>;
  }) => void;
  onViewReports: () => void;
}

export const RecruiterPortal: React.FC<RecruiterPortalProps> = ({
  onLaunchCandidateInterview,
  onViewReports,
}) => {
  const [jobTitle, setJobTitle] = useState("L3+ Software Engineer");
  const [jobDescription, setJobDescription] = useState(
    "Seeking a Senior Backend / Full-stack Software Engineer proficient in Python, distributed microservices, cloud systems, and REST/gRPC APIs. Responsibilities include building scalable services, optimizing database latency, and collaborating in an agile team."
  );
  const [requiredSkills, setRequiredSkills] = useState("Python, FastAPI, Docker, PostgreSQL, Redis, Cloud Architecture");
  const [experienceLevel, setExperienceLevel] = useState("Senior (3-5+ years)");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [numQuestions, setNumQuestions] = useState(10);
  const [candidateName, setCandidateName] = useState("Saket Suman");
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [customQuestions, setCustomQuestions] = useState<string[]>([
    "Walk me through how you handled a production incident involving database contention or latency spikes.",
  ]);

  const [, setResumeFile] = useState<File | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeParsedInfo, setResumeParsedInfo] = useState<{
    candidate_name?: string;
    char_count?: number;
    filename?: string;
  } | null>({
    candidate_name: "Saket Suman",
    char_count: 5714,
    filename: "Saket_Suman_Resume.pdf",
  });

  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<
    Array<{ category: string; question: string; difficulty: string }>
  >([
    {
      category: "Technical Architecture",
      question: "How do you structure microservices in Python or Go to ensure high concurrency and resilience during peak traffic?",
      difficulty: "Advanced",
    },
    {
      category: "Database & Caching",
      question: "Can you explain your strategy for cache invalidation when working with Redis in a distributed write-heavy environment?",
      difficulty: "Intermediate",
    },
    {
      category: "Resume & Projects",
      question: "In your resume, you highlighted building high-throughput services. What were the specific bottlenecks you encountered and how did you resolve them?",
      difficulty: "Advanced",
    },
    {
      category: "System Design",
      question: "Design a rate limiter for a public REST API that handles 50,000 requests per second across multiple regional clusters.",
      difficulty: "Advanced",
    },
    {
      category: "Behavioral & STAR",
      question: "Describe a situation where you had a strong technical disagreement with a team member about system design. How did you reach a consensus?",
      difficulty: "Intermediate",
    },
  ]);

  // Handle resume upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setIsUploadingResume(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/upload-resume", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setResumeParsedInfo({
          candidate_name: data.candidate_name || file.name.replace(/\.[^/.]+$/, ""),
          char_count: data.characters_extracted,
          filename: file.name,
        });
        if (data.candidate_name) {
          setCandidateName(data.candidate_name);
        }
      }
    } catch (err) {
      console.warn("Upload resume error:", err);
    } finally {
      setIsUploadingResume(false);
    }
  };

  // Add custom recruiter question
  const handleAddCustomQuestion = () => {
    if (!customQuestionInput.trim()) return;
    setCustomQuestions([...customQuestions, customQuestionInput.trim()]);
    setCustomQuestionInput("");
  };

  // Remove custom question
  const handleRemoveCustomQuestion = (index: number) => {
    setCustomQuestions(customQuestions.filter((_, i) => i !== index));
  };

  // Generate Questions via Backend AI
  const handleGenerateQuestions = async () => {
    setIsGeneratingQuestions(true);
    try {
      const res = await fetch("/api/recruiter/configure-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: jobTitle,
          job_description: jobDescription,
          required_skills: requiredSkills.split(",").map((s) => s.trim()),
          experience_level: experienceLevel,
          duration_minutes: durationMinutes,
          num_questions: numQuestions || 10,
          custom_questions: customQuestions,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.questions && data.questions.length > 0) {
          setGeneratedQuestions(data.questions);
        }
      }
    } catch (err) {
      console.warn("Question generation error:", err);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const handleLaunch = () => {
    onLaunchCandidateInterview({
      jobTitle,
      jobDescription,
      experienceLevel,
      numQuestions: numQuestions || 10,
      durationMinutes,
      candidateName,
      questions: generatedQuestions,
    });
  };

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-card">
        {/* Top Header matching Screenshot */}
        <header className="onboarding-top-bar">
          <button className="icon-btn-ghost" onClick={handleLaunch} title="Close recruiter console">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="onboarding-step-indicator">
            <span className="step-circle">R</span>
            <span className="step-label">Recruiter Console &bull; {jobTitle}</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button className="btn-secondary-dark" onClick={onViewReports}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Candidate Reports & Scores
            </button>
            <button className="btn-primary-start" onClick={handleLaunch}>
              Launch Candidate Session
            </button>
          </div>
        </header>

        {/* Section Headline */}
        <section className="onboarding-headline">
          <h1>Interview Configuration & Candidate Onboarding</h1>
          <p>
            Configure role criteria, specify target technical competencies, and ingest candidate resumes (PDF or DOCX) to generate tailored questions.
          </p>
        </section>

        {/* Two-Column Grid matching Screenshot */}
        <div className="onboarding-grid">
          {/* Left Column: Job Spec & Resume Ingestion */}
          <div className="onboarding-left-panel">
          {/* Job Requirements Card */}
          <div className="portal-card">
            <div className="card-header-row">
              <div className="title-with-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
                <h3>Job Specifications & Requirements</h3>
              </div>
            </div>

            <div className="field-group">
              <label>Job Title / Position</label>
              <input
                type="text"
                className="input-field"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
              />
            </div>

            <div className="field-row">
              <div className="field-group half">
                <label>Experience Level</label>
                <select
                  className="input-field"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                >
                  <option value="Junior (0-2 years)">Junior (0-2 years)</option>
                  <option value="Mid-Level (2-4 years)">Mid-Level (2-4 years)</option>
                  <option value="Senior (3-5+ years)">Senior (3-5+ years)</option>
                  <option value="Staff / Principal (7+ years)">Staff / Principal (7+ years)</option>
                </select>
              </div>

              <div className="field-group half">
                <label>Interview Duration</label>
                <select
                  className="input-field"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                >
                  <option value={15}>15 Minutes (Screening)</option>
                  <option value={30}>30 Minutes (Standard)</option>
                  <option value={45}>45 Minutes (In-depth)</option>
                  <option value={60}>60 Minutes (Comprehensive)</option>
                </select>
              </div>
            </div>

            <div className="field-group">
              <label>Required Skills & Competencies (comma separated)</label>
              <input
                type="text"
                className="input-field"
                value={requiredSkills}
                onChange={(e) => setRequiredSkills(e.target.value)}
                placeholder="e.g. Python, Docker, Kubernetes, System Design"
              />
            </div>

            <div className="field-group">
              <label>Full Job Description</label>
              <textarea
                className="input-field textarea-field"
                rows={4}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste key responsibilities, requirements, and day-to-day focus..."
              />
            </div>
          </div>

          {/* Candidate Resume Parsing Card */}
          <div className="portal-card">
            <div className="card-header-row">
              <div className="title-with-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <h3>Candidate Resume Ingestion (PDF or DOCX)</h3>
              </div>
            </div>

            <div className="file-drop-area">
              <input
                type="file"
                id="resume-upload"
                accept=".pdf,.docx"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <label htmlFor="resume-upload" className="drop-label">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span className="drop-title">
                  {isUploadingResume ? "Extracting skills and experience..." : "Upload Candidate Resume (PDF / DOCX)"}
                </span>
                <span className="drop-sub">Drag & drop or browse from local filesystem</span>
              </label>
            </div>

            {resumeParsedInfo && (
              <div className="parsed-resume-banner">
                <div className="parsed-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="parsed-details">
                  <div className="parsed-title">Candidate: {resumeParsedInfo.candidate_name || candidateName}</div>
                  <div className="parsed-meta">
                    {resumeParsedInfo.filename} &bull; {resumeParsedInfo.char_count} characters extracted for AI RAG context
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Question Generation & Recruiter Questions */}
        <div className="onboarding-right-panel">
          <div className="portal-card" style={{ background: "transparent", border: "none", padding: 0 }}>
            <div className="card-header-row">
              <div className="title-with-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h3>Interview Question Blueprint</h3>
              </div>
              <div className="question-count-badge">
                Default: <strong>{numQuestions || 10} Questions</strong>
              </div>
            </div>

            <div className="field-row">
              <div className="field-group half">
                <label>Number of Questions</label>
                <input
                  type="number"
                  min={3}
                  max={25}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="input-field"
                  placeholder="10"
                />
              </div>

              <div className="field-group half" style={{ alignSelf: "flex-end" }}>
                <button
                  className="btn-accent-generate"
                  onClick={handleGenerateQuestions}
                  disabled={isGeneratingQuestions}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                  {isGeneratingQuestions ? "Generating with Gemini..." : "Generate AI Questions"}
                </button>
              </div>
            </div>

            {/* Recruiter Custom Questions Input */}
            <div className="field-group custom-q-section">
              <label>Add Recruiter-Specific Questions</label>
              <div className="custom-input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Ask about experience with migrating from monolith to Kubernetes..."
                  value={customQuestionInput}
                  onChange={(e) => setCustomQuestionInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustomQuestion()}
                />
                <button className="btn-secondary-dark" onClick={handleAddCustomQuestion}>
                  Add
                </button>
              </div>

              {customQuestions.length > 0 && (
                <div className="custom-q-chips">
                  {customQuestions.map((q, idx) => (
                    <div key={idx} className="custom-q-chip">
                      <span>{q}</span>
                      <button onClick={() => handleRemoveCustomQuestion(idx)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generated / Structured Questions List */}
            <div className="questions-preview-list">
              <span className="list-heading">Configured Question Set ({generatedQuestions.length} Questions):</span>
              {generatedQuestions.map((q, idx) => (
                <div key={idx} className="question-item-card">
                  <div className="question-item-top">
                    <span className="q-badge-num">Q{idx + 1}</span>
                    <span className="q-category">{q.category}</span>
                    <span className="q-difficulty">{q.difficulty}</span>
                  </div>
                  <p className="q-text">{q.question}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
};
export default RecruiterPortal;
