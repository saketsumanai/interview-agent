import React, { useState } from "react";
import { loginWithEmail, registerWithEmail, loginDemoUser, type AuthUserProfile } from "../firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUserProfile) => void;
  initialRole?: "candidate" | "recruiter";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialRole = "candidate",
}) => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [role, setRole] = useState<"candidate" | "recruiter">(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Please provide both email and password.");
      return;
    }

    setIsLoading(true);
    try {
      let user: AuthUserProfile;
      if (mode === "signin") {
        user = await loginWithEmail(email, password, role);
      } else {
        user = await registerWithEmail(email, password, role);
        if (name.trim()) {
          user.displayName = name.trim();
        }
      }
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please verify credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemo = async (selectedRole: "candidate" | "recruiter") => {
    setIsLoading(true);
    try {
      const demoUser = await loginDemoUser(
        selectedRole,
        selectedRole === "candidate" ? "Saket Suman" : "Senior Technical Recruiter",
        selectedRole === "candidate" ? "saket.suman@talentpool.io" : "recruiter@hiringteam.io"
      );
      onSuccess(demoUser);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="hv-auth-backdrop" onClick={onClose}>
      <div className="hv-auth-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="hv-auth-close" onClick={onClose} aria-label="Close authentication modal">
          ✕
        </button>

        {/* Havu Kicker */}
        <div className="hv-auth-kicker">
          <span>00 — TALENTFLOW AUTHENTICATION</span>
          <span className="hv-auth-dot">●</span>
          <span>FIREBASE LINKED</span>
        </div>

        {/* Title */}
        <h2 className="hv-auth-title">
          {mode === "signin" ? "Sign In to TalentFlow" : "Create Candidate Account"}
        </h2>
        <p className="hv-auth-sub">
          Continuous AI session recording, real-time proctoring metrics, and candidate scorecard storage.
        </p>

        {/* Role Toggle */}
        <div className="hv-auth-role-tabs">
          <button
            type="button"
            className={`hv-auth-role-tab ${role === "candidate" ? "active" : ""}`}
            onClick={() => setRole("candidate")}
          >
            Candidate Profile
          </button>
          <button
            type="button"
            className={`hv-auth-role-tab ${role === "recruiter" ? "active" : ""}`}
            onClick={() => setRole("recruiter")}
          >
            Recruiter Console
          </button>
        </div>

        {error && <div className="hv-auth-error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="hv-auth-form">
          {mode === "register" && (
            <div className="hv-auth-field">
              <label className="hv-auth-label">FULL NAME</label>
              <input
                type="text"
                placeholder="e.g. Saket Suman"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="hv-auth-input"
                required={mode === "register"}
              />
            </div>
          )}

          <div className="hv-auth-field">
            <label className="hv-auth-label">EMAIL ADDRESS</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="hv-auth-input"
              required
            />
          </div>

          <div className="hv-auth-field">
            <label className="hv-auth-label">PASSWORD</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="hv-auth-input"
              required
            />
          </div>

          <button type="submit" className="hv-auth-submit-btn" disabled={isLoading}>
            {isLoading
              ? "Connecting to Firebase..."
              : mode === "signin"
              ? "Sign In to TalentFlow →"
              : "Register Account →"}
          </button>
        </form>

        {/* Quick Demo Access Bar */}
        <div className="hv-auth-divider">
          <span>OR QUICK PROTOTYPE ACCESS</span>
        </div>

        <div className="hv-auth-quick-actions">
          <button
            type="button"
            className="hv-auth-quick-btn"
            onClick={() => handleQuickDemo("candidate")}
            disabled={isLoading}
          >
            <span className="hv-quick-icon">⚡</span>
            <span>Sign in as Candidate (Saket Suman)</span>
          </button>
          <button
            type="button"
            className="hv-auth-quick-btn"
            onClick={() => handleQuickDemo("recruiter")}
            disabled={isLoading}
          >
            <span className="hv-quick-icon">⚡</span>
            <span>Sign in as Recruiter Console</span>
          </button>
        </div>

        {/* Toggle Mode */}
        <div className="hv-auth-toggle-mode">
          {mode === "signin" ? (
            <span>
              Don't have an account?{" "}
              <button
                type="button"
                className="hv-auth-link"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                Register here
              </button>
            </span>
          ) : (
            <span>
              Already registered?{" "}
              <button
                type="button"
                className="hv-auth-link"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
              >
                Sign In
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
