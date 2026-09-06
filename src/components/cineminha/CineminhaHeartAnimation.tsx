import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Heart } from 'lucide-react';

interface CineminhaHeartAnimationProps {
  userAAvatar?: string;
  userBAvatar?: string;
  userAName: string;
  userBName: string;
  onAnimationComplete: () => void;
}

export const CineminhaHeartAnimation: React.FC<CineminhaHeartAnimationProps> = ({
  userAAvatar,
  userBAvatar,
  userAName,
  userBName,
  onAnimationComplete,
}) => {
  const completedRef = useRef(false);

  const handleComplete = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      onAnimationComplete();
    }
  };

  // Reliable fallback timer to guarantee transition
  useEffect(() => {
    const timer = setTimeout(() => {
      handleComplete();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Cinematic Ambient Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-rose-950/40 via-purple-950/30 to-slate-950 pointer-events-none" />
      <div className="absolute w-96 h-96 rounded-full bg-rose-600/15 blur-3xl animate-pulse pointer-events-none" />

      {/* Two Circles Approaching Each Other & Merging into a Heart */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* User A Circle (Gliding from Left) */}
        <motion.div
          initial={{ x: -100, opacity: 0, scale: 0.6 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute w-18 h-18 rounded-full bg-gradient-to-tr from-rose-500 to-pink-500 p-1 shadow-xl shadow-rose-500/40 flex items-center justify-center border-2 border-white/60"
        >
          <span className="text-2xl select-none">{userAAvatar || '👑'}</span>
        </motion.div>

        {/* User B Circle (Gliding from Right) */}
        <motion.div
          initial={{ x: 100, opacity: 0, scale: 0.6 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute w-18 h-18 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 p-1 shadow-xl shadow-purple-500/40 flex items-center justify-center border-2 border-white/60"
        >
          <span className="text-2xl select-none">{userBAvatar || '💖'}</span>
        </motion.div>

        {/* Center Heart Burst & Expansion */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.25, 1.1],
            opacity: [0, 1, 1],
          }}
          transition={{
            delay: 0.65,
            duration: 0.6,
            ease: 'easeOut',
          }}
          onAnimationComplete={handleComplete}
          className="absolute flex flex-col items-center justify-center"
        >
          <div className="relative">
            <Heart className="w-24 h-24 text-rose-500 fill-rose-500 drop-shadow-[0_0_30px_rgba(244,63,94,0.8)]" />
          </div>
        </motion.div>
      </div>

      {/* Synchronizing Text */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-6 text-center relative z-10 space-y-1.5"
      >
        <h3 className="text-lg font-black text-white tracking-tight font-display flex items-center justify-center gap-2">
          <span>{userAName}</span>
          <span className="text-rose-400">&</span>
          <span>{userBName}</span>
        </h3>
        <p className="text-xs font-medium text-rose-200/80 tracking-wide uppercase flex items-center justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
          Conectando...
        </p>
      </motion.div>
    </div>
  );
};
