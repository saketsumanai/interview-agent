import { useRef, useState, useEffect, useCallback } from "react";
import { motion, useSpring, useTransform, useMotionValue } from "framer-motion";
import { cn } from "./utils";

interface SpotlightProps {
  className?: string;
  fill?: string;
  size?: number;
}

export function Spotlight({
  className = "",
  fill = "rgba(120, 119, 198, 0.15)",
  size = 400,
}: SpotlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const mouseX = useMotionValue(-size);
  const mouseY = useMotionValue(-size);

  const springConfig = { damping: 25, stiffness: 200 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseX.set(x);
      mouseY.set(y);
    },
    [mouseX, mouseY]
  );

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    mouseX.set(-size);
    mouseY.set(-size);
  }, [mouseX, mouseY, size]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (event: MediaQueryListEvent) => {
        setPrefersReducedMotion(event.matches);
      };
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, []);

  useEffect(() => {
    const node = containerRef.current?.parentElement;
    if (!node) return;

    node.addEventListener("mousemove", handleMouseMove);
    node.addEventListener("mouseenter", handleMouseEnter);
    node.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      node.removeEventListener("mousemove", handleMouseMove);
      node.removeEventListener("mouseenter", handleMouseEnter);
      node.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseEnter, handleMouseLeave]);

  if (prefersReducedMotion) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-30",
          className
        )}
        style={{
          background: `radial-gradient(${size}px circle at 50% 50%, ${fill}, transparent 80%)`,
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl"
        style={{
          opacity: isHovered ? 1 : 0.35,
          transition: "opacity 0.4s ease-out",
          background: useTransform(
            [smoothX, smoothY],
            ([x, y]) =>
              `radial-gradient(${size}px circle at ${x}px ${y}px, ${fill}, transparent 80%)`
          ),
        }}
      />
    </div>
  );
}

export default Spotlight;
