import React, { useEffect, useRef } from "react";

interface ZaraOrbProps {
  size?: number;
  isSpeaking?: boolean;
}

export const ZaraOrb: React.FC<ZaraOrbProps> = ({ size = 260, isSpeaking = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let rotationY = 0;
    let rotationX = 0.2;

    // Generate 3D points on a sphere using Fibonacci lattice
    const numPoints = 850;
    const points: Array<{ x: number; y: number; z: number; colorRatio: number }> = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    const radius = size * 0.38;

    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2; // y goes from 1 to -1
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      points.push({
        x: x * radius,
        y: y * radius,
        z: z * radius,
        colorRatio: (y + 1) / 2 // 0 at bottom, 1 at top
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Speed up slightly when speaking
      const rotSpeed = isSpeaking ? 0.015 : 0.006;
      rotationY += rotSpeed;
      rotationX += rotSpeed * 0.25;

      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);

      // Sort points back-to-front for proper depth perception
      const projectedPoints = points.map((pt) => {
        // Rotate around Y
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.z * cosY + pt.x * sinY;

        // Rotate around X
        const y2 = pt.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + pt.y * sinX;

        // Perspective projection
        const fov = 400;
        const scale = fov / (fov + z2);
        const px = centerX + x1 * scale;
        const py = centerY + y2 * scale;
        const alpha = Math.max(0.12, Math.min(0.95, (z2 + radius) / (2 * radius)));

        return { px, py, scale, alpha, z: z2, colorRatio: pt.colorRatio };
      });

      projectedPoints.sort((a, b) => a.z - b.z);

      for (const p of projectedPoints) {
        ctx.beginPath();
        const ptRadius = Math.max(0.7, p.scale * 1.3);
        ctx.arc(p.px, p.py, ptRadius, 0, Math.PI * 2);

        // Gradient from Coral Red/Orange to Cyan/Teal (matching the screenshot)
        // Screenshot shows warm coral/orange on left/top and cyan/electric-blue on right/bottom
        const r = Math.round(245 * p.colorRatio + 40 * (1 - p.colorRatio));
        const g = Math.round(95 * p.colorRatio + 190 * (1 - p.colorRatio));
        const b = Math.round(110 * p.colorRatio + 250 * (1 - p.colorRatio));

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.4})`;
        ctx.shadowBlur = isSpeaking ? 6 : 2;
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [size, isSpeaking]);

  return (
    <div className="zara-orb-container" style={{ width: size, height: size * 0.75, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size * 0.75}
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 0 16px rgba(56, 189, 248, 0.15))" }}
      />
    </div>
  );
};
export default ZaraOrb;
