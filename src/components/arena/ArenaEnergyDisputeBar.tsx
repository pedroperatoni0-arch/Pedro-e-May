import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface ArenaEnergyDisputeBarProps {
  userScore: number;
  partnerScore: number;
  userName?: string;
  partnerName?: string;
  userAvatar?: string;
  partnerAvatar?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxLife: number;
  life: number;
  color: string;
  type: 'left-beam' | 'right-beam' | 'clash-heart';
}

export const ArenaEnergyDisputeBar: React.FC<ArenaEnergyDisputeBarProps> = ({
  userScore,
  partnerScore,
  userName = 'Você',
  partnerName = 'Ela',
  userAvatar = '❤️',
  partnerAvatar = '🌸',
  size = 'md',
  showLabels = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalScore = userScore + partnerScore;
  const rawRatio = totalScore > 0 ? (userScore / totalScore) * 100 : 50;
  // Keep clash point safely within bounds [18%, 82%] so full heart and both beams are always visible
  const targetRatio = Math.min(Math.max(rawRatio, 18), 82);

  // Smooth lerping ratio
  const currentRatioRef = useRef(targetRatio);
  const prevUserScoreRef = useRef(userScore);
  const prevPartnerScoreRef = useRef(partnerScore);
  const [leadershipPulse, setLeadershipPulse] = useState(false);

  // Height configurations
  const heightPx = {
    sm: 52,
    md: 68,
    lg: 84,
  }[size];

  // Detect score changes & leadership overtakes
  useEffect(() => {
    const prevUser = prevUserScoreRef.current;
    const prevPartner = prevPartnerScoreRef.current;

    if (userScore > partnerScore + 0.001 && prevUser <= prevPartner + 0.001 && prevUser > 0) {
      setLeadershipPulse(true);
      const timer = setTimeout(() => setLeadershipPulse(false), 2000);
      return () => clearTimeout(timer);
    }

    prevUserScoreRef.current = userScore;
    prevPartnerScoreRef.current = partnerScore;
  }, [userScore, partnerScore]);

  const isCloseMatch = totalScore > 0 && Math.abs(userScore - partnerScore) <= 10;

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;
    const particles: Particle[] = [];
    let shockwaves: { radius: number; maxRadius: number; alpha: number; color: string }[] = [];
    let lastShockwaveTime = 0;

    // Handle canvas resolution & high-DPI scaling
    const updateCanvasSize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width > 0 ? rect.width : (canvas.clientWidth || 300);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(heightPx * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${heightPx}px`;
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(() => updateCanvasSize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Helper: parametric heart formula
    // u from 0 to 2*PI:
    // x = S * 16 * sin^3(u)
    // y = -S * (13*cos(u) - 5*cos(2u) - 2*cos(3u) - cos(4u))
    const getHeartPoint = (u: number, cx: number, cy: number, scale: number) => {
      const sinU = Math.sin(u);
      const hx = scale * 16 * Math.pow(sinU, 3);
      const hy = -scale * (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u));
      return { x: cx + hx, y: cy + hy };
    };

    const render = () => {
      time += 0.035;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || (canvas.width / dpr);
      const height = heightPx;

      // Guard against zero / invalid dimensions during mount or resize
      if (width <= 10 || height <= 10 || !Number.isFinite(width) || !Number.isFinite(height)) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Reset transform and scale accurately to DPR
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(canvas.width / width, canvas.height / height);

      // Smoothly interpolate current collision X position
      currentRatioRef.current += (targetRatio - currentRatioRef.current) * 0.08;
      const centerY = height / 2;
      const rawClashX = (currentRatioRef.current / 100) * width;
      const clashX = Math.max(width * 0.15, Math.min(width * 0.85, rawClashX));

      // Heart dimension & pulsing heartbeat rhythm
      const heartbeat = 1 + 0.09 * Math.pow(Math.sin(time * 3.2), 3) + (leadershipPulse ? 0.2 * Math.sin(time * 8) : 0);
      const baseScale = { sm: 0.72, md: 0.95, lg: 1.15 }[size];
      const heartScale = baseScale * heartbeat;
      const heartWidthRadius = Math.max(8, 16 * heartScale);
      const heartLeftX = Math.max(0, clashX - heartWidthRadius * 0.85);
      const heartRightX = Math.min(width, clashX + heartWidthRadius * 0.85);

      ctx.clearRect(0, 0, width, height);

      // ─────────────────────────────────────────────────────────────
      // 1. BACKGROUND TRACK GLOW & CLIPPED BEAMS
      // ─────────────────────────────────────────────────────────────
      ctx.save();
      const trackRadius = height * 0.28;
      const trackY = centerY - height * 0.28;
      const trackH = height * 0.56;

      // Draw Base Capsule Gradient
      const bgGrad = ctx.createLinearGradient(0, centerY, width, centerY);
      const clashRatio = Math.max(0.05, Math.min(0.95, clashX / width));
      bgGrad.addColorStop(0, 'rgba(255, 228, 230, 0.45)');
      bgGrad.addColorStop(clashRatio, 'rgba(254, 242, 242, 0.8)');
      bgGrad.addColorStop(1, 'rgba(243, 232, 255, 0.45)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.roundRect(0, trackY, width, trackH, trackRadius);
      ctx.fill();

      // Delicate subtle border track
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Clip inside track for smooth beam caps on both edges
      ctx.beginPath();
      ctx.roundRect(0, trackY, width, trackH, trackRadius);
      ctx.clip();

      // --- LEFT BEAM (USER - ROSE PLASMA) ---
      // Outer Glow Aura
      const safeLeftX = Math.max(1, heartLeftX);
      const leftAuraGrad = ctx.createLinearGradient(0, centerY, safeLeftX, centerY);
      leftAuraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
      leftAuraGrad.addColorStop(0.7, 'rgba(251, 113, 133, 0.7)');
      leftAuraGrad.addColorStop(1, 'rgba(244, 63, 94, 0.9)');
      ctx.strokeStyle = leftAuraGrad;
      ctx.lineWidth = height * 0.38;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(heartLeftX, centerY);
      ctx.stroke();

      // Dynamic Helical Filaments along Left Beam
      for (let f = -1; f <= 1; f += 2) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 0; x <= heartLeftX; x += 6) {
          const waveY = centerY + f * Math.sin(x * 0.08 - time * 6) * (height * 0.1);
          if (x === 0) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
      }

      // White-Hot Laser Core Left
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let x = 0; x <= heartLeftX; x += 4) {
        const jitterY = centerY + Math.sin(x * 0.12 - time * 8) * 1.2;
        if (x === 0) ctx.moveTo(x, jitterY);
        else ctx.lineTo(x, jitterY);
      }
      ctx.stroke();

      // --- RIGHT BEAM (PARTNER - LILAC PLASMA) ---
      // Outer Glow Aura
      const safeRightX = Math.min(width - 1, heartRightX);
      const rightAuraGrad = ctx.createLinearGradient(width, centerY, safeRightX, centerY);
      rightAuraGrad.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
      rightAuraGrad.addColorStop(0.7, 'rgba(192, 132, 252, 0.7)');
      rightAuraGrad.addColorStop(1, 'rgba(168, 85, 247, 0.9)');
      ctx.strokeStyle = rightAuraGrad;
      ctx.lineWidth = height * 0.38;
      ctx.beginPath();
      ctx.moveTo(width, centerY);
      ctx.lineTo(heartRightX, centerY);
      ctx.stroke();

      // Dynamic Helical Filaments along Right Beam
      for (let f = -1; f <= 1; f += 2) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = width; x >= heartRightX; x -= 6) {
          const waveY = centerY + f * Math.sin(x * 0.08 + time * 6) * (height * 0.1);
          if (x === width) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
      }

      // White-Hot Laser Core Right
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let x = width; x >= heartRightX; x -= 4) {
        const jitterY = centerY + Math.sin(x * 0.12 + time * 8) * 1.2;
        if (x === width) ctx.moveTo(x, jitterY);
        else ctx.lineTo(x, jitterY);
      }
      ctx.stroke();

      ctx.restore(); // Restore clip region

      // ─────────────────────────────────────────────────────────────
      // 2. SPAWN PARTICLES & SHOCKWAVE RINGS
      // ─────────────────────────────────────────────────────────────
      // Periodic shockwave from heart pulse
      if (time - lastShockwaveTime > 1.3) {
        lastShockwaveTime = time;
        shockwaves.push({
          radius: 4,
          maxRadius: { sm: 26, md: 36, lg: 46 }[size],
          alpha: 0.85,
          color: clashX < width * 0.5 ? '#a855f7' : '#f43f5e',
        });
      }

      // Left beam particles (Rose / Pink)
      if (Math.random() < 0.45) {
        particles.push({
          x: Math.random() * (heartLeftX - 10),
          y: centerY + (Math.random() - 0.5) * (height * 0.35),
          vx: 1.5 + Math.random() * 2.8,
          vy: (Math.random() - 0.5) * 0.8,
          size: 1 + Math.random() * 2.2,
          alpha: 0.85,
          maxLife: 35 + Math.random() * 25,
          life: 0,
          color: Math.random() > 0.3 ? '#fb7185' : '#ffffff',
          type: 'left-beam',
        });
      }

      // Right beam particles (Lilac / Purple)
      if (Math.random() < 0.45) {
        particles.push({
          x: heartRightX + 10 + Math.random() * (width - heartRightX - 10),
          y: centerY + (Math.random() - 0.5) * (height * 0.35),
          vx: -(1.5 + Math.random() * 2.8),
          vy: (Math.random() - 0.5) * 0.8,
          size: 1 + Math.random() * 2.2,
          alpha: 0.85,
          maxLife: 35 + Math.random() * 25,
          life: 0,
          color: Math.random() > 0.3 ? '#c084fc' : '#ffffff',
          type: 'right-beam',
        });
      }

      // Center heart sparks (Emanating from clash contour)
      if (Math.random() < 0.4) {
        const randU = Math.random() * Math.PI * 2;
        const pt = getHeartPoint(randU, clashX, centerY, heartScale);
        particles.push({
          x: pt.x,
          y: pt.y,
          vx: (Math.random() - 0.5) * 1.6,
          vy: (Math.random() - 0.5) * 1.6,
          size: 1.2 + Math.random() * 2,
          alpha: 0.95,
          maxLife: 25 + Math.random() * 20,
          life: 0,
          color: Math.random() > 0.5 ? '#f43f5e' : '#a855f7',
          type: 'clash-heart',
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 3. DRAW EXPANDING SHOCKWAVES
      // ─────────────────────────────────────────────────────────────
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += 0.85;
        sw.alpha -= 0.022;

        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = sw.alpha * 0.55;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Slightly heart-shaped shockwave pulse
        for (let u = 0; u <= Math.PI * 2; u += 0.1) {
          const pt = getHeartPoint(u, clashX, centerY, (sw.radius / 16));
          if (u === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // ─────────────────────────────────────────────────────────────
      // 4. DRAW THE ENERGY-FORMED HEART SILHOUETTE (Pure Flowing Energy)
      // ─────────────────────────────────────────────────────────────
      // Both beams curve into the parametric heart loop.
      // Left half (u from PI to 2*PI) is fed by the Rose beam.
      // Right half (u from 0 to PI) is fed by the Lilac beam.
      ctx.save();

      // --- Curving Bridging Filaments from Horizontal Beams to Heart ---
      // Left Beam -> Upper Left Lobe & Lower Left Apex
      const heartTopCleft = getHeartPoint(0, clashX, centerY, heartScale);
      const heartBottomApex = getHeartPoint(Math.PI, clashX, centerY, heartScale);
      const heartLeftPoint = getHeartPoint((3 * Math.PI) / 2, clashX, centerY, heartScale);
      const heartRightPoint = getHeartPoint(Math.PI / 2, clashX, centerY, heartScale);

      // Bridge Left
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(heartLeftX, centerY);
      ctx.quadraticCurveTo(heartLeftX + 4, centerY - 8, heartLeftPoint.x, heartLeftPoint.y);
      ctx.stroke();

      // Bridge Right
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(heartRightX, centerY);
      ctx.quadraticCurveTo(heartRightX - 4, centerY - 8, heartRightPoint.x, heartRightPoint.y);
      ctx.stroke();

      // --- Layer 1: Heart Radiant Outer Glow ---
      const heartGlowGrad = ctx.createRadialGradient(clashX, centerY, 2, clashX, centerY, heartWidthRadius * 1.5);
      heartGlowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      heartGlowGrad.addColorStop(0.5, 'rgba(244, 63, 94, 0.25)');
      heartGlowGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = heartGlowGrad;
      ctx.beginPath();
      ctx.arc(clashX, centerY, heartWidthRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // --- Layer 2: Heart Silhouette Energy Contour Strokes ---
      // Render Left Lobe of Heart (Rose Energy Stream)
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let u = Math.PI; u <= Math.PI * 2; u += 0.08) {
        // Small organic wave oscillation along the heart contour
        const waveOffset = Math.sin(u * 8 + time * 7) * 0.8;
        const pt = getHeartPoint(u, clashX, centerY, heartScale + waveOffset * 0.03);
        if (u === Math.PI) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Render Right Lobe of Heart (Lilac Energy Stream)
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 4.5;
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let u = 0; u <= Math.PI; u += 0.08) {
        const waveOffset = Math.sin(u * 8 - time * 7) * 0.8;
        const pt = getHeartPoint(u, clashX, centerY, heartScale + waveOffset * 0.03);
        if (u === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // --- Layer 3: White-Hot Concentrated Energy Filament on Heart ---
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let u = 0; u <= Math.PI * 2; u += 0.06) {
        const waveOffset = Math.sin(u * 12 + time * 10) * 0.5;
        const pt = getHeartPoint(u, clashX, centerY, heartScale + waveOffset * 0.02);
        if (u === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // --- Layer 4: Circulating Energy Pulses (Travelling dots around the heart perimeter) ---
      for (let p = 0; p < 3; p++) {
        const pulseAngle1 = (time * 2.5 + (p * Math.PI * 2) / 3) % (Math.PI * 2);
        const pulseAngle2 = (-time * 2.5 + (p * Math.PI * 2) / 3 + Math.PI) % (Math.PI * 2);

        const pt1 = getHeartPoint(pulseAngle1, clashX, centerY, heartScale);
        const pt2 = getHeartPoint(pulseAngle2, clashX, centerY, heartScale);

        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.shadowColor = pulseAngle1 > Math.PI ? '#f43f5e' : '#a855f7';
        ctx.beginPath();
        ctx.arc(pt1.x, pt1.y, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt2.x, pt2.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // 6. UPDATE & DRAW ACTIVE PARTICLES
      // ─────────────────────────────────────────────────────────────
      ctx.save();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;

        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio >= 1) {
          particles.splice(i, 1);
          continue;
        }

        const currentAlpha = (1 - lifeRatio) * p.alpha;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = currentAlpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - lifeRatio * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [targetRatio, size, heightPx, leadershipPulse]);

  return (
    <div ref={containerRef} className={`space-y-1.5 w-full select-none ${className}`}>
      {/* Optional Top Mini Header / Score Labels */}
      {showLabels && (
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
          <div className="flex items-center gap-1 text-rose-600">
            <span>{userAvatar}</span>
            <span>
              {userName} ({Math.round(userScore)}%)
            </span>
          </div>

          {isCloseMatch ? (
            <span className="text-[10px] font-extrabold uppercase text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/70 animate-pulse">
              ⚡ Disputa Acirrada
            </span>
          ) : null}

          <div className="flex items-center gap-1 text-purple-600">
            <span>
              {partnerName} ({Math.round(partnerScore)}%)
            </span>
            <span>{partnerAvatar}</span>
          </div>
        </div>
      )}

      {/* Main Dynamic Energy Clash Canvas */}
      <div className="relative w-full overflow-visible">
        <canvas
          ref={canvasRef}
          className="w-full block rounded-2xl cursor-default"
          style={{ height: `${heightPx}px` }}
        />

        {/* Leadership Overtake Toast Badge */}
        <AnimatePresence>
          {leadershipPulse && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.8 }}
              animate={{ opacity: 1, y: -24, scale: 1 }}
              exit={{ opacity: 0, y: -28, scale: 0.8 }}
              className="absolute left-1/2 -translate-x-1/2 top-0 whitespace-nowrap px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white font-black text-[10px] shadow-lg flex items-center gap-1 z-30 pointer-events-none border border-white/40"
            >
              <Sparkles className="w-3 h-3 text-yellow-200 animate-spin" />
              <span>Assumiu a Liderança! 👑</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
