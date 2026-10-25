import React, { useEffect, useRef, useState } from "react";

interface SecondaryCameraProps {
  pairingToken?: string;
  isMobileView?: boolean;
  onPairingComplete?: () => void;
  onClose?: () => void;
}

export const SecondaryCamera: React.FC<SecondaryCameraProps> = ({
  pairingToken: propToken,
  isMobileView = false,
  onPairingComplete,
  onClose,
}) => {
  const [token, setToken] = useState<string>(propToken || "");
  const [isPaired, setIsPaired] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Generate pairing token on desktop
  useEffect(() => {
    if (!isMobileView && !token) {
      const generated = `sec-${Math.random().toString(36).substring(2, 9)}-${Date.now().toString(36)}`;
      setToken(generated);
    }
  }, [isMobileView, token]);

  // Mobile mode: request camera immediately
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isMobileView) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
          setCameraActive(true);
          setIsPaired(true);
          if (onPairingComplete) onPairingComplete();
        })
        .catch((err) => {
          console.error("Secondary camera access error:", err);
          setError("Please grant camera permission to use this phone as a secondary angle.");
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isMobileView, onPairingComplete]);

  // Direct pairing link
  const pairingUrl = `${window.location.origin}?view=secondary-camera&token=${token}`;
  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pairingUrl)}&color=0284c7&bgcolor=0f172a`;

  if (isMobileView) {
    return (
      <div className="mobile-secondary-container">
        <header className="mobile-camera-header">
          <div className="status-indicator">
            <span className="dot-live"></span>
            <span>Secondary Phone Camera Feed</span>
          </div>
          <span className="token-tag">Token: {token.substring(0, 8)}...</span>
        </header>

        <div className="mobile-video-viewport">
          <video ref={videoRef} autoPlay playsInline muted className="mobile-video-stream" />
          {!cameraActive && (
            <div className="camera-loading-overlay">
              <span className="spinner"></span>
              <p>{error || "Connecting smartphone camera..."}</p>
            </div>
          )}
        </div>

        <div className="mobile-camera-footer">
          <p>Position your phone at a 45-degree angle showing your desk and keyboard.</p>
          <button className="btn-secondary-subtle" onClick={onClose}>Exit Mobile Camera</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog secondary-camera-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
            <h3>Pair Secondary Smartphone Camera</h3>
          </div>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body secondary-body">
          <p className="secondary-intro">
            Scan this QR code with your mobile phone to provide an optional secondary desk angle during your assessment.
          </p>

          <div className="qr-code-box">
            <img 
              src={qrSvgUrl} 
              alt="Scan to pair mobile camera" 
              className="qr-image" 
              onError={(e) => {
                // Fallback SVG if external QR API is unreachable
                (e.target as HTMLElement).style.display = "none";
              }} 
            />
            <div className="pairing-status-pill">
              <span className={`status-dot ${isPaired ? "connected" : "waiting"}`}></span>
              <span>{isPaired ? "Secondary Device Connected" : "Waiting for phone to scan QR..."}</span>
            </div>
          </div>

          <div className="manual-pair-box">
            <span className="manual-label">Or open this link on your phone:</span>
            <input 
              type="text" 
              readOnly 
              value={pairingUrl} 
              className="pairing-url-input" 
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>

          <div className="secondary-tips">
            <strong>Placement recommendation:</strong>
            <span>Prop your smartphone on a mug or stand to the side of your laptop, facing your keyboard and hands.</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary-subtle" onClick={onClose}>Skip / Close</button>
          <button 
            className="btn-primary-action" 
            onClick={() => {
              setIsPaired(true);
              if (onPairingComplete) onPairingComplete();
              if (onClose) onClose();
            }}
          >
            I've Scanned the QR Code
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecondaryCamera;
