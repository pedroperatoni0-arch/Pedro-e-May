import React from 'react';

interface HeartConfig {
  id: string;
  size: number; // medium to large (46px to 74px)
  startX: number; // percentage (0 to 100)
  startY: number; // percentage (0 to 100)
  deltaX: number; // horizontal diagonal drift in px
  deltaY: number; // vertical upward diagonal drift in px
  duration: number; // slow (28s to 45s)
  delay: number; // staggered delays
  opacity: number; // 0.08 to 0.13 (very soft and subtle)
  rotation: number; // gentle tilt in degrees
}

// 8 well-spaced, medium-to-large hearts across the canvas
const HEARTS_CONFIG: HeartConfig[] = [
  {
    id: 'heart-1',
    size: 64,
    startX: 4,
    startY: 82,
    deltaX: 240,
    deltaY: 580,
    duration: 34,
    delay: 0,
    opacity: 0.11,
    rotation: 12,
  },
  {
    id: 'heart-2',
    size: 52,
    startX: 68,
    startY: 92,
    deltaX: 210,
    deltaY: 550,
    duration: 38,
    delay: 9,
    opacity: 0.09,
    rotation: -14,
  },
  {
    id: 'heart-3',
    size: 72,
    startX: 28,
    startY: 55,
    deltaX: 260,
    deltaY: 620,
    duration: 42,
    delay: 17,
    opacity: 0.10,
    rotation: 8,
  },
  {
    id: 'heart-4',
    size: 48,
    startX: 78,
    startY: 42,
    deltaX: 190,
    deltaY: 520,
    duration: 30,
    delay: 24,
    opacity: 0.08,
    rotation: -10,
  },
  {
    id: 'heart-5',
    size: 58,
    startX: -2,
    startY: 32,
    deltaX: 230,
    deltaY: 560,
    duration: 36,
    delay: 11,
    opacity: 0.12,
    rotation: 16,
  },
  {
    id: 'heart-6',
    size: 66,
    startX: 46,
    startY: 104,
    deltaX: 250,
    deltaY: 600,
    duration: 37,
    delay: 29,
    opacity: 0.09,
    rotation: -8,
  },
  {
    id: 'heart-7',
    size: 54,
    startX: 12,
    startY: 8,
    deltaX: 220,
    deltaY: 540,
    duration: 32,
    delay: 19,
    opacity: 0.09,
    rotation: 15,
  },
  {
    id: 'heart-8',
    size: 60,
    startX: 82,
    startY: 118,
    deltaX: 200,
    deltaY: 570,
    duration: 40,
    delay: 5,
    opacity: 0.10,
    rotation: 6,
  },
];

export const FloatingHeartsBackground: React.FC = () => {
  return (
    <div
      id="floating-hearts-background"
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
    >
      {/* CAMADA 1: Fundo branco, limpo e claro */}
      <div className="absolute inset-0 bg-white" />

      {/* CAMADA 2: Corações decorativos animados (diagonal ↗ contínua e lenta) */}
      {HEARTS_CONFIG.map(heart => (
        <div
          key={heart.id}
          className="absolute text-rose-400 fill-rose-300 pointer-events-none select-none will-change-transform animate-float-diagonal"
          style={
            {
              width: `${heart.size}px`,
              height: `${heart.size}px`,
              left: `${heart.startX}%`,
              top: `${heart.startY}%`,
              opacity: heart.opacity,
              '--tx': `${heart.deltaX}px`,
              '--ty': `${-heart.deltaY}px`,
              '--dur': `${heart.duration}s`,
              '--rot': `${heart.rotation}deg`,
              animationDuration: `${heart.duration}s`,
              animationDelay: `${-heart.delay}s`,
            } as React.CSSProperties
          }
        >
          {/* Smooth vector heart */}
          <svg
            viewBox="0 0 24 24"
            className="w-full h-full"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      ))}
    </div>
  );
};
