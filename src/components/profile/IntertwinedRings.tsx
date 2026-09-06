import React from 'react';
import { motion } from 'motion/react';
import { Heart } from 'lucide-react';

interface IntertwinedRingsProps {
  className?: string;
  isLinked?: boolean;
}

export const IntertwinedRings: React.FC<IntertwinedRingsProps> = ({ className = '', isLinked = true }) => {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Soft ambient romantic glow */}
      <div className="absolute w-16 h-16 bg-gradient-to-tr from-rose-300/30 via-pink-200/35 to-amber-200/30 rounded-full blur-md -z-10 pointer-events-none" />

      {/* Floating and pulsing hearts animation (💞 sensation) */}
      <div className="absolute -top-3.5 inset-x-0 flex justify-center pointer-events-none z-10">
        {/* Central main floating heart */}
        <motion.div
          animate={{
            y: [-1, -7, -1],
            scale: [0.9, 1.12, 0.9],
            opacity: [0.75, 1, 0.75],
          }}
          transition={{
            duration: 2.6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="relative"
        >
          <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500 drop-shadow-xs" />
        </motion.div>
      </div>

      {/* Secondary gentle floating heart (left side) */}
      <motion.div
        animate={{
          y: [0, -6, 0],
          x: [0, -3, 0],
          scale: [0.75, 0.95, 0.75],
          opacity: [0.4, 0.85, 0.4],
        }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          delay: 0.5,
          ease: 'easeInOut',
        }}
        className="absolute -top-1 left-0 pointer-events-none z-10"
      >
        <Heart className="w-2.5 h-2.5 fill-pink-400 text-pink-400 drop-shadow-xs" />
      </motion.div>

      {/* Tertiary gentle floating heart (right side) */}
      <motion.div
        animate={{
          y: [0, -5, 0],
          x: [0, 3, 0],
          scale: [0.7, 0.9, 0.7],
          opacity: [0.35, 0.8, 0.35],
        }}
        transition={{
          duration: 3.0,
          repeat: Infinity,
          delay: 1.1,
          ease: 'easeInOut',
        }}
        className="absolute -top-1.5 right-0 pointer-events-none z-10"
      >
        <Heart className="w-2.5 h-2.5 fill-rose-400 text-rose-400 drop-shadow-xs" />
      </motion.div>

      {/* Two intertwined rings (golden & rose-gold) */}
      <svg
        width="56"
        height="44"
        viewBox="0 0 56 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-xs transition-transform hover:scale-105 duration-300"
      >
        <defs>
          {/* Gold Ring Gradient */}
          <linearGradient id="goldRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="35%" stopColor="#fef08a" />
            <stop offset="70%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>

          {/* Rose Gold Ring Gradient */}
          <linearGradient id="roseGoldRingGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="40%" stopColor="#fecdd3" />
            <stop offset="75%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>

          {/* Ring Sheen Filter */}
          <filter id="ringGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#f43f5e" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Left Ring (Gold) - tilted slightly */}
        <g transform="rotate(-10 22 24)">
          <ellipse
            cx="22"
            cy="24"
            rx="12"
            ry="13.5"
            stroke="url(#goldRingGrad)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
            filter="url(#ringGlow)"
          />
        </g>

        {/* Right Ring (Rose Gold) - tilted slightly the other way */}
        <g transform="rotate(10 34 24)">
          <ellipse
            cx="34"
            cy="24"
            rx="12"
            ry="13.5"
            stroke="url(#roseGoldRingGrad)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
            filter="url(#ringGlow)"
          />
        </g>

        {/* Interlocking Arc: Left Ring segment drawn over Right Ring at the top intersection */}
        <g transform="rotate(-10 22 24)">
          <path
            d="M 22 10.5 A 12 13.5 0 0 1 34 24"
            stroke="url(#goldRingGrad)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Diamond / Sparkle Accent in center of left ring when linked */}
        {isLinked && (
          <circle cx="22" cy="11" r="1.5" fill="#ffffff" className="animate-pulse" />
        )}
      </svg>
    </div>
  );
};
