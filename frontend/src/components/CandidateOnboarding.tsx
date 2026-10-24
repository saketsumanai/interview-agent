import React, { useEffect, useRef, useState } from "react";
import ZaraOrb from "./ZaraOrb";

interface CandidateOnboardingProps {
  jobTitle?: string;
  candidateName?: string;
  topic?: string;
  interviewType?: "hr" | "technical" | "full";
  onTopicChange?: (topic: string) => void;
  onInterviewTypeChange?: (type: "hr" | "technical" | "full") => void;
  onCandidateNameChange?: (name: string) => void;
  onResumeUploaded?: (filename: string, chunks: number) => void;
  onStartInterview: () => void;
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
  onTopicChange,
  onInterviewTypeChange,
  onCandidateNameChange,
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
  const [latencyMs, setLatencyMs] = useState<number>(28);
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  // Resume status in onboarding
  const [resumeName, setResumeName] = useState<string>("Saket_Suman_Resume.pdf");
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeUploadedSuccess, setResumeUploadedSuccess] = useState(true);
  const [resumeError, setResumeError] = useState<string | null>(null);

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
    <div className="hv-onboarding-wrapper">
      <div className="hv-onboarding-container">
        {/* ─── Top Kicker & Navigation ─── */}
        <div className="hv-hero-kicker-row">
          <p className="hv-kicker">01 — PRE-FLIGHT VERIFICATION // CANDIDATE ONBOARDING</p>
          <p className="hv-kicker hv-kicker-right">ROLE: {jobTitle.toUpperCase()} // PROCTORING ACTIVE</p>
        </div>

        {/* ─── Monumental Headline ─── */}
        <div className="hv-onboarding-header">
          <h1 className="hv-onboarding-title">
            <span>Prepare for your session with Zara.</span>
            <span>Camera, voice, and topic verification.</span>
          </h1>
          <p className="hv-onboarding-sub">
            Welcome, <strong className="hv-highlight-text">{candidateName}</strong>. Zara conducts natural voice interviews grounded in your actual project experience. Your session is monitored by intelligent proctoring and scored across four objective rubrics.
          </p>
        </div>

        {/* ─── Hairline Divider with Pixel Accent ─── */}
        <div className="hv-hero-hairline">
          <div className="hv-pixel-accent">
            <span className="hv-pixel-dot"></span>
            <span className="hv-pixel-dot"></span>
            <span className="hv-pixel-dot"></span>
          </div>
        </div>

        {/* ─── 2-Column Grid (Havu Style) ─── */}
        <div className="hv-onboarding-grid">
          {/* LEFT COLUMN: Camera & Device Checks */}
          <div className="hv-onboarding-col">
            <div className="hv-section-tag">
              <span className="hv-tag-label">01 — CAMERA & SENSORS</span>
              <span className="hv-tag-line"></span>
            </div>

            {/* Video Preview Frame */}
            <div className="hv-camera-frame">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="hv-camera-stream"
              />
              {!cameraPermissionGranted && (
                <div className="hv-camera-empty">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Awaiting webcam feed...</span>
                </div>
              )}
              <div className="hv-camera-status-pill">
                <span className="hv-rec-dot"></span>
                <span>{cameraPermissionGranted ? "FEED READY // 720P" : "STANDBY"}</span>
              </div>
            </div>

            {/* Device Selector Controls */}
            <div className="hv-device-grid">
              {/* Camera Select */}
              <div className="hv-device-select-box">
                <label className="hv-device-label">CAMERA</label>
                <div className="hv-select-wrapper">
                  <select
                    value={selectedCamera}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="hv-select"
                  >
                    {cameras.length > 0 ? (
                      cameras.map((c, i) => (
                        <option key={c.deviceId || i} value={c.deviceId}>
                          {c.label || `Camera ${i + 1}`}
                        </option>
                      ))
                    ) : (
                      <option value="">Default - FaceTime / USB Camera</option>
                    )}
                  </select>
                  <span className="hv-select-arrow">↓</span>
                </div>
              </div>

              {/* Mic Select */}
              <div className="hv-device-select-box">
                <label className="hv-device-label">MICROPHONE</label>
                <div className="hv-select-wrapper">
                  <select
                    value={selectedMic}
                    onChange={(e) => setSelectedMic(e.target.value)}
                    className="hv-select"
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
                  <span className="hv-select-arrow">↓</span>
                </div>
              </div>

              {/* Speaker Select */}
              <div className="hv-device-select-box">
                <label className="hv-device-label">AUDIO OUTPUT</label>
                <div className="hv-select-wrapper">
                  <select
                    value={selectedSpeaker}
                    onChange={(e) => setSelectedSpeaker(e.target.value)}
                    className="hv-select"
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
                  <span className="hv-select-arrow">↓</span>
                </div>
              </div>
            </div>

            {/* Connection Latency & Audio Chime Check */}
            <div className="hv-hardware-test-row">
              <div className="hv-ping-card">
                <div className="hv-ping-header">
                  <span className="hv-ping-status">
                    <span className="hv-status-indicator"></span>
                    <span>{latencyMs}ms WebRTC Latency</span>
                  </span>
                  <button
                    className={`hv-retest-btn ${isTestingPing ? "spinning" : ""}`}
                    onClick={refreshConnection}
                    title="Retest connection ping"
                  >
                    Retest ↺
                  </button>
                </div>
                <div className="hv-ping-bar-track">
                  <div className="hv-ping-bar-fill" style={{ width: `${Math.max(25, 100 - latencyMs)}%` }}></div>
                </div>
              </div>

              <button
                type="button"
                className={`hv-chime-btn ${isPlayingSound ? "playing" : ""}`}
                onClick={playTestSound}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                <span>{isPlayingSound ? "Playing Chime..." : "Test Audio Chime"}</span>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: Resume RAG, Focus Topic, Format, Tips */}
          <div className="hv-onboarding-col">
            <div className="hv-section-tag">
              <span className="hv-tag-label">02 — RESUME & FOCUS TOPIC</span>
              <span className="hv-tag-line"></span>
            </div>

            {/* Resume Upload Pill Card */}
            <div className="hv-resume-card">
              <div className="hv-resume-info">
                <div className="hv-file-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div className="hv-resume-details">
                  <span className="hv-resume-filename">{resumeName || "No resume uploaded"}</span>
                  <span className="hv-resume-status-text">
                    {isUploadingResume
                      ? "Ingesting document..."
                      : resumeUploadedSuccess
                      ? "Indexed for Zara contextual follow-ups"
                      : "Upload PDF for grounded questions"}
                  </span>
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
                className="hv-resume-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingResume}
              >
                {isUploadingResume ? "Uploading..." : resumeUploadedSuccess ? "Replace PDF →" : "Upload Resume →"}
              </button>
            </div>

            {resumeError && <p className="hv-resume-error">{resumeError}</p>}

            {/* Target Skill Focus / Topic */}
            <div className="hv-focus-card">
              <label className="hv-field-label">TARGET TECHNICAL COMPETENCY</label>
              <input
                type="text"
                value={customTopic}
                onChange={handleCustomTopicChange}
                placeholder="e.g. Python Backend Systems, Distributed Systems, Microservices"
                className="hv-text-input"
              />

              <div className="hv-preset-chips">
                {TOPIC_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelectPresetTopic(p)}
                    className={`hv-preset-chip ${customTopic === p ? "active" : ""}`}
                  >
                    {p.split(" ")[0]} {p.split(" ")[1]}
                  </button>
                ))}
              </div>

              {/* Interview Format Selector */}
              <label className="hv-field-label" style={{ marginTop: "1.25rem" }}>EVALUATION FORMAT</label>
              <div className="hv-format-switch">
                {(["full", "technical", "hr"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onInterviewTypeChange && onInterviewTypeChange(t)}
                    className={`hv-format-btn ${interviewType === t ? "active" : ""}`}
                  >
                    {t === "full" ? "Full (Tech + STAR)" : t === "technical" ? "Deep Technical" : "Behavioral & Culture"}
                  </button>
                ))}
              </div>

              {/* Candidate Name Input */}
              <div className="hv-name-row">
                <label className="hv-field-label">CANDIDATE NAME</label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => onCandidateNameChange && onCandidateNameChange(e.target.value)}
                  placeholder="Your Name"
                  className="hv-text-input"
                />
              </div>
            </div>

            {/* Zara Avatar Card & Proctoring Guidelines */}
            <div className="hv-zara-preview-box">
              <div className="hv-orb-wrapper">
                <ZaraOrb size={170} isSpeaking={isPlayingSound} />
              </div>
              <div className="hv-guidelines">
                <span className="hv-guidelines-title">EXAMINATION PROTOCOLS</span>
                <div className="hv-rule-item">
                  <span className="hv-rule-index">01</span>
                  <span>Quiet room with zero background voices or noise</span>
                </div>
                <div className="hv-rule-item">
                  <span className="hv-rule-index">02</span>
                  <span>Good front-facing lighting with webcam centered</span>
                </div>
                <div className="hv-rule-item hv-rule-warning">
                  <span className="hv-rule-index">03</span>
                  <span>AI assistance or tab deflections trigger immediate proctor flag</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Bottom Actions (Havu Style) ─── */}
        <div className="hv-onboarding-actions">
          <button className="hv-secondary-btn large" onClick={onBack}>
            ← Back to Overview
          </button>
          <button className="hv-primary-btn large" onClick={onStartInterview}>
            Start Interview with Zara →
          </button>
        </div>
      </div>
    </div>
  );
};

export default CandidateOnboarding;
