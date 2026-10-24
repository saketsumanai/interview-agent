import { useState, useEffect, useCallback } from "react";

export interface ProctoringEvent {
  id: string;
  timestamp: string;
  type: "TAB_SWITCH" | "WINDOW_BLUR" | "FULLSCREEN_EXIT" | "DEVICE_DISCONNECTED" | "AUDIO_ANOMALY";
  description: string;
  severity: "info" | "warning" | "violation";
}

export function useProctoring(isActive: boolean = true) {
  const [events, setEvents] = useState<ProctoringEvent[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);

  const logEvent = useCallback((type: ProctoringEvent["type"], description: string, severity: ProctoringEvent["severity"] = "warning") => {
    const newEvent: ProctoringEvent = {
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      description,
      severity
    };

    setEvents((prev) => [...prev, newEvent]);

    if (severity === "violation" || severity === "warning") {
      setWarningMessage(description);
      const timer = setTimeout(() => {
        setWarningMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount((c) => c + 1);
        logEvent(
          "TAB_SWITCH",
          "Candidate switched browser tab or minimized the interview window.",
          "violation"
        );
      } else {
        logEvent("TAB_SWITCH", "Candidate returned to interview screen.", "info");
      }
    };

    const handleWindowBlur = () => {
      if (!document.hidden) {
        logEvent(
          "WINDOW_BLUR",
          "Interview window lost focus. Candidate may be interacting with another application or monitor.",
          "warning"
        );
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logEvent(
          "FULLSCREEN_EXIT",
          "Candidate exited full-screen proctoring mode.",
          "warning"
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isActive, logEvent]);

  // Compute calculated integrity score (100 base)
  const integrityScore = Math.max(
    30,
    100 - tabSwitchCount * 15 - events.filter((e) => e.severity === "warning").length * 5
  );

  return {
    events,
    warningMessage,
    tabSwitchCount,
    integrityScore,
    logEvent,
    clearWarning: () => setWarningMessage(null)
  };
}
