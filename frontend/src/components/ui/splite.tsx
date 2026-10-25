import { Suspense, lazy, useState, useEffect } from "react";
import { cn } from "./utils";

const Spline = lazy(() => import("@splinetool/react-spline"));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  const [hasError, setHasError] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    // Detect WebGL support gracefully
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        setIsSupported(false);
      }
    } catch {
      setIsSupported(false);
    }
  }, []);

  if (hasError || !isSupported) {
    // Elegant fallback preserving layout and Zara theme
    return (
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-neutral-950/60 p-8 border border-white/5",
          className
        )}
        aria-label="Interactive 3D visual preview"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.15),transparent_70%)] animate-pulse" />
        <div className="relative z-10 flex flex-col items-center text-center space-y-4 max-w-sm">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500/30 to-purple-500/20 border border-indigo-400/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
            <div className="w-16 h-16 rounded-full bg-indigo-500/40 blur-sm flex items-center justify-center">
              <span className="text-2xl font-bold text-white tracking-widest">ZARA</span>
            </div>
          </div>
          <span className="text-sm font-medium text-indigo-300 uppercase tracking-widest">
            AI Interview Agent
          </span>
          <p className="text-xs text-neutral-400">
            Real-time vocal intelligence & dynamic evidence scoring active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-2xl bg-neutral-900/30 border border-white/5",
            className
          )}
          aria-label="Loading interactive scene"
        >
          <div className="flex flex-col items-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
            <span className="text-xs text-neutral-400 font-mono tracking-wider">
              Loading 3D Engine...
            </span>
          </div>
        </div>
      }
    >
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        <Spline
          scene={scene}
          onError={() => setHasError(true)}
          className="h-full w-full"
        />
      </div>
    </Suspense>
  );
}

export default SplineScene;
