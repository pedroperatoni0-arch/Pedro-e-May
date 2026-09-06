import React from 'react';
import { motion } from 'motion/react';

export const MoviePopcornAnim: React.FC = () => {
  return (
    <div
      className="relative w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-400 to-rose-400 flex items-center justify-center shadow-xs overflow-hidden select-none"
      title="Filmes e Séries a dois"
    >
      {/* Subtle ambient light inside badge */}
      <div className="absolute inset-0 bg-white/10 pointer-events-none" />

      {/* STAGE 1: Play & Clapperboard transformation */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          opacity: [1, 1, 1, 0, 0, 0, 0, 1, 1],
          scale: [1, 1, 1.05, 0.7, 0.7, 0.7, 0.8, 1, 1],
        }}
        transition={{
          duration: 7.5,
          repeat: Infinity,
          times: [0, 0.2, 0.28, 0.36, 0.45, 0.65, 0.74, 0.84, 1],
          ease: 'easeInOut',
        }}
      >
        <div className="relative w-5 h-5 flex items-center justify-center">
          {/* Clapper Top Arm (opens up smoothly during transformation) */}
          <motion.div
            className="absolute top-0.5 left-0.5 w-4 h-1.5 bg-amber-100 rounded-xs origin-bottom-left shadow-2xs"
            animate={{
              rotate: [0, 0, -28, -32, 0, 0, 0, 0, 0],
            }}
            transition={{
              duration: 7.5,
              repeat: Infinity,
              times: [0, 0.16, 0.26, 0.34, 0.4, 0.7, 0.8, 0.9, 1],
              ease: 'easeInOut',
            }}
          >
            {/* Clapper stripes */}
            <div className="w-full h-full flex justify-between px-0.5 items-center">
              <span className="w-0.5 h-1 bg-amber-800/80 rounded-2xs" />
              <span className="w-0.5 h-1 bg-amber-800/80 rounded-2xs" />
              <span className="w-0.5 h-1 bg-amber-800/80 rounded-2xs" />
            </div>
          </motion.div>

          {/* Central Play Icon */}
          <motion.svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 fill-white text-white drop-shadow-2xs translate-x-0.5 mt-1"
            animate={{
              scale: [1, 1, 1.1, 0.8, 1],
            }}
            transition={{
              duration: 7.5,
              repeat: Infinity,
              times: [0, 0.15, 0.25, 0.35, 1],
              ease: 'easeInOut',
            }}
          >
            <polygon points="6,4 20,12 6,20" />
          </motion.svg>
        </div>
      </motion.div>

      {/* Lateral Ticket / Film Chips pushing outward during transformation */}
      {/* Left ticket chip */}
      <motion.div
        className="absolute w-2 h-3 bg-white rounded-2xs border border-amber-200/90 shadow-2xs pointer-events-none"
        animate={{
          opacity: [0, 0, 0.95, 0.9, 0, 0],
          x: [0, -1, -7, -11, -12, 0],
          y: [0, -1, -3, -4, -5, 0],
          rotate: [0, -5, -24, -38, -45, 0],
          scale: [0.4, 0.7, 1, 0.8, 0.4, 0],
        }}
        transition={{
          duration: 7.5,
          repeat: Infinity,
          times: [0, 0.2, 0.28, 0.34, 0.4, 1],
          ease: 'easeOut',
        }}
      >
        <div className="w-full h-full flex flex-col justify-around py-0.5 px-0.5 items-center">
          <span className="w-1 h-0.5 bg-rose-400 rounded-full" />
          <span className="w-1 h-0.5 bg-amber-400 rounded-full" />
        </div>
      </motion.div>

      {/* Right ticket chip */}
      <motion.div
        className="absolute w-2 h-3 bg-white rounded-2xs border border-amber-200/90 shadow-2xs pointer-events-none"
        animate={{
          opacity: [0, 0, 0.95, 0.9, 0, 0],
          x: [0, 1, 7, 11, 12, 0],
          y: [0, 0, 2, 4, 5, 0],
          rotate: [0, 8, 26, 42, 50, 0],
          scale: [0.4, 0.7, 1, 0.8, 0.4, 0],
        }}
        transition={{
          duration: 7.5,
          repeat: Infinity,
          times: [0, 0.22, 0.3, 0.36, 0.42, 1],
          ease: 'easeOut',
        }}
      >
        <div className="w-full h-full flex flex-col justify-around py-0.5 px-0.5 items-center">
          <span className="w-1 h-0.5 bg-amber-400 rounded-full" />
          <span className="w-1 h-0.5 bg-rose-400 rounded-full" />
        </div>
      </motion.div>

      {/* STAGE 2: Popcorn Bag with Jumping Popcorn */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        animate={{
          opacity: [0, 0, 0, 1, 1, 1, 0, 0],
          scale: [0.6, 0.6, 0.7, 1, 1, 1, 0.7, 0.6],
        }}
        transition={{
          duration: 7.5,
          repeat: Infinity,
          times: [0, 0.28, 0.34, 0.42, 0.64, 0.7, 0.78, 1],
          ease: 'easeInOut',
        }}
      >
        <div className="relative w-5 h-6 flex flex-col items-center justify-end pb-0.5">
          {/* Jumping Popcorn Kernels (Smooth micro-hops) */}
          {/* Popcorn 1 (Left puff) */}
          <motion.div
            className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-amber-100 rounded-full border border-amber-300/80 shadow-2xs z-10"
            animate={{
              y: [0, 0, 0, -4.5, 0, -3.5, 0, 0],
              x: [0, 0, 0, -1, 0, -0.5, 0, 0],
              rotate: [0, 0, 0, -25, 0, 15, 0, 0],
              scale: [1, 1, 1, 1.2, 1, 1.15, 1, 1],
            }}
            transition={{
              duration: 7.5,
              repeat: Infinity,
              times: [0, 0.42, 0.46, 0.52, 0.57, 0.62, 0.67, 1],
              ease: 'easeInOut',
            }}
          />

          {/* Popcorn 2 (Center puff - highest hop) */}
          <motion.div
            className="absolute top-0 left-1.5 w-1.5 h-1.5 bg-yellow-100 rounded-full border border-yellow-300 shadow-2xs z-20"
            animate={{
              y: [0, 0, 0, 0, -6, 0, -2, 0],
              rotate: [0, 0, 0, 0, 30, 0, -10, 0],
              scale: [1, 1, 1, 1, 1.3, 1, 1.1, 1],
            }}
            transition={{
              duration: 7.5,
              repeat: Infinity,
              times: [0, 0.44, 0.48, 0.52, 0.58, 0.63, 0.68, 1],
              ease: 'easeInOut',
            }}
          />

          {/* Popcorn 3 (Right puff) */}
          <motion.div
            className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-amber-50 rounded-full border border-amber-200/90 shadow-2xs z-10"
            animate={{
              y: [0, 0, 0, 0, 0, -5, 0, 0],
              x: [0, 0, 0, 0, 0, 1, 0, 0],
              rotate: [0, 0, 0, 0, 0, 20, 0, 0],
              scale: [1, 1, 1, 1, 1, 1.2, 1, 1],
            }}
            transition={{
              duration: 7.5,
              repeat: Infinity,
              times: [0, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 1],
              ease: 'easeInOut',
            }}
          />

          {/* Popcorn Bag (Cinema Red & Cream Striped Container) */}
          <div className="relative w-4 h-3.5 bg-white rounded-b-sm border border-rose-200 shadow-2xs overflow-hidden flex justify-between px-0.5 mt-1.5">
            <span className="w-0.5 h-full bg-rose-600" />
            <span className="w-0.5 h-full bg-rose-600" />
            {/* Popcorn bag badge heart */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/90 border border-white" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
