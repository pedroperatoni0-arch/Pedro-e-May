import React from 'react';
import { motion } from 'motion/react';

export const HeartFlameAnim: React.FC = () => {
  return (
    <div
      className="relative w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-pink-500 flex items-center justify-center shadow-xs overflow-visible select-none"
      title="Disciplina do casal em chamas"
    >
      {/* Background subtle warm glow */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-orange-500/20 to-transparent pointer-events-none" />

      {/* Floating Embers (Discretas, poucas e com movimento natural durante a pulsação) */}
      {/* Ember 1 */}
      <motion.span
        className="absolute top-1 left-2.5 w-1 h-1 rounded-full bg-amber-200 shadow-[0_0_4px_rgba(251,191,36,0.9)] pointer-events-none z-20"
        animate={{
          y: [0, 0, -4, -8, -10, 0],
          x: [0, 0, -1, -2, -2.5, 0],
          opacity: [0, 0, 0.9, 0.7, 0, 0],
          scale: [0.4, 0.4, 1, 0.8, 0.2, 0],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          times: [0, 0.18, 0.3, 0.45, 0.6, 1],
          ease: 'easeOut',
        }}
      />

      {/* Ember 2 (Center higher rise) */}
      <motion.span
        className="absolute top-1 left-3.5 w-1 h-1 rounded-full bg-yellow-100 shadow-[0_0_5px_rgba(254,240,138,0.9)] pointer-events-none z-20"
        animate={{
          y: [0, 0, -5, -9, -12, 0],
          x: [0, 0, 0.5, 1.2, 1.5, 0],
          opacity: [0, 0, 1, 0.8, 0, 0],
          scale: [0.5, 0.5, 1.1, 0.9, 0.3, 0],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          times: [0, 0.22, 0.34, 0.48, 0.64, 1],
          ease: 'easeOut',
        }}
      />

      {/* Ember 3 */}
      <motion.span
        className="absolute top-1.5 right-2 w-0.75 h-0.75 rounded-full bg-orange-200 shadow-[0_0_3px_rgba(251,146,60,0.8)] pointer-events-none z-20"
        animate={{
          y: [0, 0, -3, -6, -8, 0],
          x: [0, 0, 1, 1.8, 2, 0],
          opacity: [0, 0, 0.8, 0.6, 0, 0],
          scale: [0.4, 0.4, 1, 0.7, 0.2, 0],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          times: [0, 0.25, 0.38, 0.5, 0.62, 1],
          ease: 'easeOut',
        }}
      />

      {/* Pulsing Living Heart Container */}
      <motion.div
        className="relative w-5 h-5 flex items-center justify-center z-10"
        animate={{
          scale: [1, 1, 1.13, 0.98, 1.07, 1, 1],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          times: [0, 0.16, 0.28, 0.38, 0.48, 0.62, 1],
          ease: 'easeInOut',
        }}
      >
        <svg viewBox="0 0 24 24" className="w-full h-full drop-shadow-xs">
          <defs>
            {/* Mask strictly in the shape of the Heart */}
            <clipPath id="heart-discipline-clip">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </clipPath>

            {/* Fire linear gradient */}
            <linearGradient id="flame-grad-outer" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="45%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>

            <linearGradient id="flame-grad-inner" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>

          {/* Heart Base Background (Deep warm ruby inside) */}
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="#9f1239"
          />

          {/* Masked Fluid Flames Dancing Inside the Heart */}
          <g clipPath="url(#heart-discipline-clip)">
            {/* Outer Organic Flame Wave */}
            <motion.path
              d="M 4,24 C 6,17 7,13 10,12 C 12,11 11,8 12,5 C 13,8 13,11 15,12 C 18,13 18,17 20,24 Z"
              fill="url(#flame-grad-outer)"
              animate={{
                d: [
                  'M 4,24 C 6,17 7,13 10,12 C 12,11 11,8 12,5 C 13,8 13,11 15,12 C 18,13 18,17 20,24 Z',
                  'M 4,24 C 5,16 8,12 9,10 C 11,9 12,6 12.5,4 C 13.5,7 14,10 16,11 C 18,12 19,16 20,24 Z',
                  'M 4,24 C 7,17 6,12 11,11 C 12.5,10 12,7 11.5,4.5 C 12.5,7 14,9 15,11 C 17,13 18,17 20,24 Z',
                  'M 4,24 C 6,17 7,13 10,12 C 12,11 11,8 12,5 C 13,8 13,11 15,12 C 18,13 18,17 20,24 Z',
                ],
                scaleY: [1, 1.08, 0.96, 1],
                scaleX: [1, 0.95, 1.04, 1],
              }}
              style={{ transformOrigin: 'bottom center' }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Inner Glowing Core Flame (Offset frequency for natural fluid lick) */}
            <motion.path
              d="M 7,24 C 8,19 9,16 11,15 C 11.5,14 11.5,11 12,8 C 12.5,11 12.5,14 13.5,15 C 15,16 16,19 17,24 Z"
              fill="url(#flame-grad-inner)"
              animate={{
                d: [
                  'M 7,24 C 8,19 9,16 11,15 C 11.5,14 11.5,11 12,8 C 12.5,11 12.5,14 13.5,15 C 15,16 16,19 17,24 Z',
                  'M 7,24 C 7.5,18 9.5,15 10.5,13 C 11,12 11.8,9 12.2,7 C 12.8,9 13.2,12 14,13 C 15,15 16.5,18 17,24 Z',
                  'M 7,24 C 8.5,18 9,14 11.5,14 C 12,13 11.5,9.5 11.8,7.5 C 12.2,9.5 13,13 13.5,14 C 15,15 16,18 17,24 Z',
                  'M 7,24 C 8,19 9,16 11,15 C 11.5,14 11.5,11 12,8 C 12.5,11 12.5,14 13.5,15 C 15,16 16,19 17,24 Z',
                ],
                scaleY: [0.95, 1.12, 1, 0.95],
                scaleX: [1, 0.92, 1.05, 1],
              }}
              style={{ transformOrigin: 'bottom center' }}
              transition={{
                duration: 1.05,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </g>

          {/* Heart Outer Rim / Crisp Contour */}
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="none"
            stroke="#fda4af"
            strokeWidth="1.2"
            className="drop-shadow-2xs"
          />
        </svg>
      </motion.div>
    </div>
  );
};
