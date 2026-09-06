import React from 'react';
import { motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

export const DayNightCycleAnim: React.FC = () => {
  return (
    <div
      className="relative w-8 h-8 rounded-xl flex items-center justify-center [perspective:600px] select-none shadow-xs"
      title="Dias e noites juntos"
    >
      {/* 3D Rotating Flipper (Only this internal element rotates on its Y-axis; the card stays still) */}
      <motion.div
        className="w-full h-full relative [transform-style:preserve-3d] rounded-xl"
        animate={{
          rotateY: [0, 0, 180, 180, 360, 360],
        }}
        transition={{
          duration: 7.5,
          repeat: Infinity,
          times: [0, 0.24, 0.44, 0.68, 0.88, 1],
          ease: 'easeInOut',
        }}
      >
        {/* FACE 1: MOON / NIGHT (Facing 0deg) */}
        <div className="absolute inset-0 w-full h-full rounded-xl bg-gradient-to-tr from-indigo-700 via-purple-700 to-indigo-900 flex items-center justify-center [backface-visibility:hidden] shadow-xs overflow-hidden border border-indigo-400/20">
          {/* Subtle star speckles */}
          <motion.span
            animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-1 right-1.5 w-1 h-1 bg-indigo-100 rounded-full shadow-2xs"
          />
          <motion.span
            animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.7, 1.1, 0.7] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: 0.5, ease: 'easeInOut' }}
            className="absolute bottom-1.5 left-1.5 w-0.5 h-0.5 bg-indigo-200 rounded-full"
          />

          {/* Crescent Moon */}
          <motion.div
            animate={{ scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Moon className="w-4 h-4 text-indigo-100 fill-indigo-100/40 drop-shadow-2xs" />
          </motion.div>
        </div>

        {/* FACE 2: SUN / DAY (Facing 180deg, visible when rotated) */}
        <div
          className="absolute inset-0 w-full h-full rounded-xl bg-gradient-to-tr from-amber-400 via-orange-400 to-yellow-400 flex items-center justify-center [backface-visibility:hidden] shadow-xs overflow-hidden border border-yellow-200/40"
          style={{ transform: 'rotateY(180deg)' }}
        >
          {/* Radiant morning pulse */}
          <motion.div
            className="absolute inset-0 bg-yellow-300/30 rounded-xl"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Golden Sun */}
          <motion.div
            animate={{
              rotate: [0, 45, 90],
              scale: [0.95, 1.06, 0.95],
            }}
            transition={{
              rotate: { duration: 6, repeat: Infinity, ease: 'linear' },
              scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <Sun className="w-4 h-4 text-white fill-yellow-100/90 drop-shadow-2xs" />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};
