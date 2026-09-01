import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Heart } from 'lucide-react';
import confetti from 'canvas-confetti';
import { soundManager } from '../../utils/audio';

interface CoupleLinkAnimationProps {
  userAvatar: string;
  userName: string;
  partnerAvatar: string;
  partnerName: string;
  onAnimationComplete: () => void;
}

export const CoupleLinkAnimation: React.FC<CoupleLinkAnimationProps> = ({
  userAvatar,
  userName,
  partnerAvatar,
  partnerName,
  onAnimationComplete,
}) => {
  const [phase, setPhase] = useState<'approaching' | 'drawing' | 'pulse' | 'radiating' | 'done'>('approaching');

  useEffect(() => {
    soundManager.playPop();

    // Stage 1 -> 2: Particles & Approach (0ms - 400ms)
    const t1 = setTimeout(() => {
      setPhase('drawing');
    }, 400);

    // Stage 3 -> 4: Drawing heart contour (400ms - 1400ms)
    const t2 = setTimeout(() => {
      setPhase('pulse');
      soundManager.playLevelUp();
    }, 1400);

    // Stage 5: Pulse & Radiate (1400ms - 2200ms)
    const t3 = setTimeout(() => {
      setPhase('radiating');
      confetti({
        particleCount: 45,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f43f5e', '#ec4899', '#c084fc', '#ffd700'],
      });
    }, 1700);

    // Stage 6: Completion
    const t4 = setTimeout(() => {
      setPhase('done');
      onAnimationComplete();
    }, 2800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onAnimationComplete]);

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-rose-50/90 via-white to-purple-50/90 rounded-3xl p-6 border-2 border-rose-200 shadow-lg text-center min-h-[280px] flex flex-col items-center justify-center">
      {/* Delicate floating background starlight particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-rose-400/60"
            style={{
              left: `${15 + (i * 7) % 75}%`,
              top: `${20 + (i * 11) % 65}%`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.8, 0],
              scale: [0, 1.4, 0],
              y: [-10, 10],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              delay: (i * 0.15) % 1.2,
            }}
          />
        ))}
      </div>

      {/* Avatars Converging */}
      <div className="relative z-10 flex items-center justify-between w-full max-w-[240px] mb-3">
        {/* User Left Avatar */}
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: phase === 'radiating' || phase === 'pulse' ? 8 : 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-400 to-pink-500 text-white text-2xl flex items-center justify-center shadow-md border-2 border-white">
            {userAvatar}
          </div>
          <span className="text-[11px] font-bold text-slate-700 mt-1">{userName}</span>
        </motion.div>

        {/* Dynamic Center Heart Drawing via SVG Beams */}
        <div className="relative w-28 h-28 flex items-center justify-center">
          <svg
            viewBox="0 0 120 120"
            className="w-full h-full overflow-visible drop-shadow-md"
            fill="none"
          >
            <defs>
              <linearGradient id="leftBeamGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#fb7185" />
              </linearGradient>
              <linearGradient id="rightBeamGrad" x1="100%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
              <radialGradient id="heartFillGrad" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#fda4af" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.15" />
              </radialGradient>
            </defs>

            {/* Left Beam Path -> Traces Left Half of Heart */}
            <motion.path
              d="M 60,95 C 25,68 5,45 5,25 C 5,10 20,2 36,2 C 48,2 56,8 60,18"
              stroke="url(#leftBeamGrad)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: phase !== 'approaching' ? 1 : 0,
              }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />

            {/* Right Beam Path -> Traces Right Half of Heart */}
            <motion.path
              d="M 60,95 C 95,68 115,45 115,25 C 115,10 100,2 84,2 C 72,2 64,8 60,18"
              stroke="url(#rightBeamGrad)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: phase !== 'approaching' ? 1 : 0,
              }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />

            {/* Heart Solid Pulsing Fill */}
            {(phase === 'pulse' || phase === 'radiating' || phase === 'done') && (
              <motion.path
                d="M 60,95 C 25,68 5,45 5,25 C 5,10 20,2 36,2 C 48,2 56,8 60,18 C 64,8 72,2 84,2 C 100,2 115,10 115,25 C 115,45 95,68 60,95 Z"
                fill="url(#heartFillGrad)"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: [0, 0.9, 0.6],
                  scale: [0.8, 1.25, 1],
                }}
                transition={{ duration: 0.5, times: [0, 0.6, 1] }}
              />
            )}

            {/* Radiant Shockwave / Sparkle Starburst Rays */}
            {(phase === 'pulse' || phase === 'radiating') && (
              <>
                {/* Expanding Shockwave Ring */}
                <motion.circle
                  cx="60"
                  cy="45"
                  r="20"
                  stroke="#fb7185"
                  strokeWidth="2"
                  fill="none"
                  initial={{ r: 15, opacity: 0.9 }}
                  animate={{ r: 55, opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />

                {/* Delicate Ray Ticks */}
                <motion.line
                  x1="60"
                  y1="-6"
                  x2="60"
                  y2="-16"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6 }}
                />
                <motion.line
                  x1="12"
                  y1="12"
                  x2="3"
                  y2="3"
                  stroke="#c084fc"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6 }}
                />
                <motion.line
                  x1="108"
                  y1="12"
                  x2="117"
                  y2="3"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6 }}
                />
              </>
            )}
          </svg>
        </div>

        {/* Partner Right Avatar */}
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: phase === 'radiating' || phase === 'pulse' ? -8 : 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-400 to-pink-500 text-white text-2xl flex items-center justify-center shadow-md border-2 border-white">
            {partnerAvatar}
          </div>
          <span className="text-[11px] font-bold text-slate-700 mt-1">{partnerName}</span>
        </motion.div>
      </div>

      {/* Progress Status Message */}
      <motion.div
        key={phase}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2"
      >
        <span className="text-xs font-black text-rose-600 font-display block">
          {phase === 'approaching' && 'Verificando conexão... ✨'}
          {phase === 'drawing' && 'Cruzando laços luminosos... 💫'}
          {phase === 'pulse' && 'Corações conectados! ❤️'}
          {phase === 'radiating' && 'Vínculo Estabelecido com Sucesso! 🌟'}
          {phase === 'done' && 'Prontos para a Arena! ⚔️'}
        </span>
        <span className="text-[10px] text-slate-500 font-medium">
          Compartilhando a jornada e a rotina a dois
        </span>
      </motion.div>
    </div>
  );
};
