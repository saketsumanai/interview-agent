import React, { useEffect, useRef, useState } from "react";
import ZaraOrb from "./ZaraOrb";
import SecondaryCamera from "./SecondaryCamera";

interface CandidateOnboardingProps {
  jobTitle?: string;
  candidateName?: string;
  topic?: string;
  interviewType?: "hr" | "technical" | "full";
  sttEngine?: string;
  onTopicChange?: (topic: string) => void;
  onInterviewTypeChange?: (type: "hr" | "technical" | "full") => void;
  onCandidateNameChange?: (name: string) => void;
  onSttEngineChange?: (engine: string) => void;
  onResumeUploaded?: (filename: string, chunks: number) => void;
  onStartInterview: (recordingConsent: boolean) => void;
  onBack: () => void;
}

const TOPIC_PRESETS = [
  "Python Backend Systems & Distributed Architecture",
  "Full-Stack Web & AI Development",
  "System Design, Microservices & High-Scale Cloud",
  "DevOps, Kubernetes & Infrastructure Engineering",
  "Machine Learning & Generative AI Systems",
];

export const CandidateOnboarding: React.FC<CandidateOnboardingProps> = ({
  jobTitle = "L3+ software engineering",
  candidateName = "Saket Suman",
  topic = "Python Backend Systems & Distributed Architecture",
  interviewType = "full",
  sttEngine = "deepgram:flux-general-en",
  onTopicChange,
  onInterviewTypeChange,
  onCandidateNameChange,
  onSttEngineChange,
  onResumeUploaded,
  onStartInterview,
  onBack,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);

  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");

  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number>(32);
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  // Resume status in onboarding
  const [resumeName, setResumeName] = useState<string>("Saket_Suman_Resume.pdf");
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeUploadedSuccess, setResumeUploadedSuccess] = useState(true);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Recording consent (OFF by default as per enterprise policy)
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [showSecondaryPairing, setShowSecondaryPairing] = useState(false);
  const [secondaryPaired, setSecondaryPaired] = useState(false);

  // Custom topic mode
  const [customTopic, setCustomTopic] = useState(topic);

  // Check initial resume status
  useEffect(() => {
    fetch("/resume-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.has_resume || data.is_ingested) {
          setResumeName(data.filename || "Saket_Suman_Resume.pdf");
          setResumeUploadedSuccess(true);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize media devices
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function initMedia() {
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: true,
        });
        activeStream = userStream;
        setStream(userStream);
        setCameraPermissionGranted(true);

        if (videoRef.current) {
          videoRef.current.srcObject = userStream;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter((d) => d.kind === "videoinput");
        const audioInDevs = devices.filter((d) => d.kind === "audioinput");
        const audioOutDevs = devices.filter((d) => d.kind === "audiooutput");

        setCameras(videoDevs);
        setMicrophones(audioInDevs);
        setSpeakers(audioOutDevs);

        if (videoDevs.length > 0) setSelectedCamera(videoDevs[0].deviceId);
        if (audioInDevs.length > 0) setSelectedMic(audioInDevs[0].deviceId);
        if (audioOutDevs.length > 0) setSelectedSpeaker(audioOutDevs[0].deviceId);
      } catch (err) {
        console.warn("Unable to access camera/microphone automatically:", err);
      }
    }

    initMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Switch camera when device changes
  const handleCameraChange = async (deviceId: string) => {
    setSelectedCamera(deviceId);
    if (!deviceId) return;
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (e) {
      console.error("Error switching camera:", e);
    }
  };

  // Upload resume handler
  const handleResumeFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setResumeError("Please select a PDF file.");
      return;
    }

    setIsUploadingResume(true);
    setResumeError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/upload-resume", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Upload failed");
      }
      const data = await res.json();
      setResumeName(file.name);
      setResumeUploadedSuccess(true);
      if (onResumeUploaded) {
        onResumeUploaded(file.name, data.chunks || 0);
      }
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to upload resume");
      setResumeUploadedSuccess(false);
    } finally {
      setIsUploadingResume(false);
    }
  };

  // Test sound with Web Audio API chime
  const playTestSound = () => {
    try {
      setIsPlayingSound(true);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

      gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.65);

      setTimeout(() => {
        setIsPlayingSound(false);
      }, 700);
    } catch (e) {
      console.warn("Web audio test sound error:", e);
      setIsPlayingSound(false);
    }
  };

  // Refresh connection test
  const refreshConnection = () => {
    setIsTestingPing(true);
    const start = performance.now();
    fetch("/capacity-check")
      .then(() => {
        const duration = Math.round(performance.now() - start);
        setLatencyMs(Math.max(16, duration));
      })
      .catch(() => {
        setLatencyMs(28);
      })
      .finally(() => {
        setTimeout(() => setIsTestingPing(false), 400);
      });
  };

  const handleSelectPresetTopic = (t: string) => {
    setCustomTopic(t);
    if (onTopicChange) onTopicChange(t);
  };

  const handleCustomTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomTopic(e.target.value);
    if (onTopicChange) onTopicChange(e.target.value);
  };

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-card">
        {/* Top Header Bar */}
        <header className="onboarding-top-bar">
          <button className="icon-btn-ghost" onClick={onBack} title="Close onboarding">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="onboarding-step-indicator">
            <span className="step-circle">1</span>
            <span className="step-label">{jobTitle}</span>
          </div>
        </header>

        {/* Section Heading */}
        <section className="onboarding-headline">
          <h1>Assessment with our AI, Zara</h1>
          <p>
            Welcome, {candidateName}. Zara will conduct an AI-powered interview to capture your unique skills and expertise.
            Your interview will be recorded and may be reviewed by a human expert.
          </p>
        </section>

        {/* Two-Column Grid */}
        <div className="onboarding-grid">
          {/* Left Column: Camera and Device Selection + Topic & Resume Setup */}
          <div className="onboarding-left-panel">
            <div className="panel-header">
              <h2>Check your camera</h2>
              <p>Please ensure you are in a well lit room and that your face is clearly visible in the center of the frame.</p>
            </div>

            {/* Video Preview Box */}
            <div className="camera-preview-box">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video-stream"
              />
              {!cameraPermissionGranted && (
                <div className="camera-placeholder">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                  <span>Camera permission requested...</span>
                </div>
              )}
              <div className="camera-badge-pill">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
                </svg>
              </div>
            </div>

            {/* Device Selector Dropdowns */}
            <div className="device-selectors-row">
              {/* Camera Picker */}
              <div className="device-select-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <select
                  value={selectedCamera}
                  onChange={(e) => handleCameraChange(e.target.value)}
                  className="device-select"
                >
                  {cameras.length > 0 ? (
                    cameras.map((c, i) => (
                      <option key={c.deviceId || i} value={c.deviceId}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))
                  ) : (
                    <option value="">Default - FaceTime HD Camera</option>
                  )}
                </select>
                <span className="chevron-down">&#9662;</span>
              </div>

              {/* Mic Picker */}
              <div className="device-select-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                <select
                  value={selectedMic}
                  onChange={(e) => setSelectedMic(e.target.value)}
                  className="device-select"
                >
                  {microphones.length > 0 ? (
                    microphones.map((m, i) => (
                      <option key={m.deviceId || i} value={m.deviceId}>
                        {m.label || `Microphone ${i + 1}`}
                      </option>
                    ))
                  ) : (
                    <option value="">Default - Built-in Microphone</option>
                  )}
                </select>
                <span className="chevron-down">&#9662;</span>
              </div>

              {/* Speaker Picker */}
              <div className="device-select-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
                <select
                  value={selectedSpeaker}
                  onChange={(e) => setSelectedSpeaker(e.target.value)}
                  className="device-select"
                >
                  {speakers.length > 0 ? (
                    speakers.map((s, i) => (
                      <option key={s.deviceId || i} value={s.deviceId}>
                        {s.label || `Speaker ${i + 1}`}
                      </option>
                    ))
                  ) : (
                    <option value="">Default - Built-in Speakers</option>
                  )}
                </select>
                <span className="chevron-down">&#9662;</span>
              </div>
            </div>

            {/* Resume Upload & Topic Controls */}
            <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Resume Card */}
              <div style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "0.85rem 1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", overflow: "hidden" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {resumeName || "No resume uploaded"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: resumeUploadedSuccess ? "#4ade80" : "#94a3b8" }}>
                      {isUploadingResume ? "Ingesting resume..." : resumeUploadedSuccess ? "Resume context loaded for Zara" : "Upload your resume (PDF)"}
                    </div>
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf"
                  style={{ display: "none" }}
                  onChange={handleResumeFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingResume}
                  style={{
                    background: "rgba(56, 189, 248, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    color: "#38bdf8",
                    padding: "0.4rem 0.75rem",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  {isUploadingResume ? "Uploading..." : resumeUploadedSuccess ? "Change Resume" : "Upload PDF"}
                </button>
              </div>

              {resumeError && (
                <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>{resumeError}</div>
              )}

              {/* Topic Selector */}
              <div style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "0.85rem 1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
              }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Interview Topic & Skill Focus
                </label>
                <input
                  type="text"
                  value={customTopic}
                  onChange={handleCustomTopicChange}
                  placeholder="e.g. Python Backend Systems, React, Distributed Systems"
                  style={{
                    width: "100%",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "6px",
                    padding: "0.45rem 0.65rem",
                    color: "#f8fafc",
                    fontSize: "0.82rem",
                    outline: "none"
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.2rem" }}>
                  {TOPIC_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSelectPresetTopic(p)}
                      style={{
                        background: customTopic === p ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.05)",
                        border: customTopic === p ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: customTopic === p ? "#38bdf8" : "#94a3b8",
                        borderRadius: "12px",
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                    >
                      {p.split(" ")[0]} {p.split(" ")[1]}
                    </button>
                  ))}
                </div>

                {/* Interview Type Selector */}
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                  {(["full", "technical", "hr"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onInterviewTypeChange && onInterviewTypeChange(t)}
                      style={{
                        flex: 1,
                        background: interviewType === t ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.04)",
                        border: interviewType === t ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: interviewType === t ? "#38bdf8" : "#94a3b8",
                        borderRadius: "6px",
                        padding: "0.32rem 0.4rem",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                    >
                      {t === "full" ? "Full (Tech + STAR)" : t === "technical" ? "Technical" : "Behavioral (HR)"}
                    </button>
                  ))}
                </div>

                {/* STT Speech Provider & Model Selection */}
                <div style={{ marginTop: "0.4rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Speech-to-Text Engine:</span>
                    <span style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 600 }}>Streaming WebSocket</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.35rem" }}>
                    {[
                      { id: "deepgram:flux-general-en", label: "Deepgram Flux", sub: "Conversational v2" },
                      { id: "deepgram:nova-3", label: "Deepgram Nova-3", sub: "Accurate v1" },
                      { id: "groq:whisper-large-v3-turbo", label: "Groq Whisper", sub: "Turbo Fallback" },
                    ].map((engine) => (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => onSttEngineChange && onSttEngineChange(engine.id)}
                        style={{
                          background: sttEngine === engine.id ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.04)",
                          border: sttEngine === engine.id ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                          color: sttEngine === engine.id ? "#38bdf8" : "#94a3b8",
                          borderRadius: "6px",
                          padding: "0.3rem 0.25rem",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          lineHeight: "1.15",
                          transition: "all 0.15s",
                        }}
                      >
                        <span>{engine.label}</span>
                        <span style={{ fontSize: "0.62rem", opacity: 0.75, fontWeight: 400 }}>{engine.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Candidate Name Input */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem" }}>
                  <label style={{ fontSize: "0.75rem", color: "#64748b", whiteSpace: "nowrap" }}>Candidate Name:</label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => onCandidateNameChange && onCandidateNameChange(e.target.value)}
                    placeholder="Candidate name"
                    style={{
                      flex: 1,
                      background: "rgba(15, 23, 42, 0.4)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "4px",
                      color: "#f8fafc",
                      fontSize: "0.78rem",
                      padding: "0.25rem 0.45rem",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Zara Preview, Tips, and Readiness */}
          <div className="onboarding-right-panel">
            <h2>Ready to interview with Zara?</h2>

            {/* AI Avatar Canvas */}
            <div className="zara-canvas-card">
              <ZaraOrb size={280} isSpeaking={isPlayingSound} />
            </div>

            {/* Interview Tips matching screenshot */}
            <div className="interview-tips-list">
              <span className="tips-title">Tips for the interview:</span>
              <div className="tip-item">
                <svg className="tip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                <span>Quiet room with no background noise</span>
              </div>
              <div className="tip-item">
                <svg className="tip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                <span>Good lighting conditions to see your face</span>
              </div>
              <div className="tip-item tip-danger">
                <svg className="tip-icon danger-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
                <span className="danger-text">AI use or outside human assistance will result in a ban</span>
              </div>
            </div>

            {/* Connection Test Bar */}
            <div className="connection-test-card">
              <div className="connection-header">
                <span className="connection-label">Connection Test</span>
                <button
                  className={`refresh-btn ${isTestingPing ? "rotating" : ""}`}
                  onClick={refreshConnection}
                  title="Retest connection"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                </button>
              </div>
              <div className="connection-bar-bg">
                <div className="connection-bar-fill" style={{ width: `${Math.max(25, 100 - latencyMs)}%` }}></div>
              </div>
            </div>

            {/* Recording Consent & Privacy Posture (Recording OFF by default) */}
            <div style={{
              marginTop: "0.85rem",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "8px",
              padding: "0.75rem 0.85rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem"
            }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.55rem", cursor: "pointer", fontSize: "0.75rem", color: "#cbd5e1" }}>
                <input
                  type="checkbox"
                  checked={recordingConsent}
                  onChange={(e) => setRecordingConsent(e.target.checked)}
                  style={{ marginTop: "2px", accentColor: "#0284c7" }}
                />
                <span>
                  <strong>Consent to Video Archival:</strong> Record full video session for hiring team review.
                  <br />
                  <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    Default mode is <strong>Recording OFF</strong> (live video is used strictly in-memory for proctoring; no video file is saved).
                  </span>
                </span>
              </label>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.45rem" }}>
                <span style={{ fontSize: "0.72rem", color: secondaryPaired ? "#4ade80" : "#94a3b8" }}>
                  {secondaryPaired ? "✓ Secondary phone camera paired" : "Optional: Desk & keyboard smartphone angle"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowSecondaryPairing(true)}
                  style={{
                    background: secondaryPaired ? "rgba(34, 197, 94, 0.15)" : "rgba(56, 189, 248, 0.1)",
                    border: secondaryPaired ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(56, 189, 248, 0.25)",
                    color: secondaryPaired ? "#4ade80" : "#38bdf8",
                    padding: "0.25rem 0.55rem",
                    borderRadius: "5px",
                    fontSize: "0.72rem",
                    cursor: "pointer"
                  }}
                >
                  {secondaryPaired ? "Pairing Active" : "Pair Phone (QR)"}
                </button>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="onboarding-actions">
              <button className="btn-secondary-dark" onClick={onBack}>
                Back
              </button>
              <button className="btn-test-sound" onClick={playTestSound}>
                {isPlayingSound ? "Testing..." : "Test sound"}
              </button>
              <button 
                className="btn-primary-start" 
                onClick={() => onStartInterview(recordingConsent)}
              >
                Start Interview
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSecondaryPairing && (
        <SecondaryCamera
          onPairingComplete={() => {
            setSecondaryPaired(true);
            setShowSecondaryPairing(false);
          }}
          onClose={() => setShowSecondaryPairing(false)}
        />
      )}
    </div>
  );
};

export default CandidateOnboarding;
