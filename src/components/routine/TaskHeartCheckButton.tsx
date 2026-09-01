import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TaskHeartCheckButtonProps {
  id?: string;
  isCompleted: boolean;
  onComplete?: () => void;
  onClick?: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export const TaskHeartCheckButton: React.FC<TaskHeartCheckButtonProps> = ({
  id,
  isCompleted,
  onComplete,
  onClick,
  size = 'md',
  disabled = false,
}) => {
  // Local state to track animation lifecycle
  const [animating, setAnimating] = useState(false);
  const [showSparks, setShowSparks] = useState(false);
  const [heartbeat, setHeartbeat] = useState(false);

  // If task is already completed when mounting, stay in completed state
  const isDone = isCompleted || animating;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // STRICT LOCK: If already completed or animating or disabled, completely ignore!
    if (isCompleted || animating || disabled) {
      return;
    }

    // Start 0.8s - 1.0s choreographed sequence
    setAnimating(true);

    // Call completion/click handlers (grants XP and saves state)
    if (onComplete) {
      onComplete();
    }
    if (onClick) {
      onClick();
    }

    // 450ms: Heartbeat "tum" / "tuc"
    setTimeout(() => {
      setHeartbeat(true);
    }, 450);

    // 550ms: Sparkles appear (green on left, red on right)
    setTimeout(() => {
      setShowSparks(true);
    }, 520);

    // 850ms: Heartbeat reset
    setTimeout(() => {
      setHeartbeat(false);
    }, 700);

    // 950ms: Sparkles fade out, animation settles into locked completed state
    setTimeout(() => {
      setShowSparks(false);
      setAnimating(false);
    }, 950);
  };

  const containerSizeClass = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  const svgSize = size === 'sm' ? 24 : 28;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      {/* Side Sparks / Rays during animation (Green left = success, Red right = love) */}
      <AnimatePresence>
        {showSparks && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Left Green Sparks (Success / Completion) */}
            <motion.div
              initial={{ opacity: 0, x: 0, scale: 0.5 }}
              animate={{ opacity: 1, x: -16, scale: 1.15 }}
              exit={{ opacity: 0, scale: 0.2 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="absolute -left-1 flex flex-col gap-1.5 items-end"
            >
              <div className="w-2.5 h-0.5 bg-emerald-500 rounded-full rotate-[-25deg] shadow-2xs" />
              <div className="w-3.5 h-0.5 bg-emerald-400 rounded-full shadow-2xs" />
              <div className="w-2.5 h-0.5 bg-emerald-500 rounded-full rotate-[25deg] shadow-2xs" />
            </motion.div>

            {/* Right Red/Pink Sparks (Affection / Love) */}
            <motion.div
              initial={{ opacity: 0, x: 0, scale: 0.5 }}
              animate={{ opacity: 1, x: 16, scale: 1.15 }}
              exit={{ opacity: 0, scale: 0.2 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="absolute -right-1 flex flex-col gap-1.5 items-start"
            >
              <div className="w-2.5 h-0.5 bg-rose-500 rounded-full rotate-[25deg] shadow-2xs" />
              <div className="w-3.5 h-0.5 bg-pink-500 rounded-full shadow-2xs" />
              <div className="w-2.5 h-0.5 bg-rose-500 rounded-full rotate-[-25deg] shadow-2xs" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* The Main Button */}
      <button
        id={id}
        type="button"
        onClick={handleClick}
        disabled={isCompleted || animating || disabled}
        className={`relative ${containerSizeClass} rounded-full flex items-center justify-center transition-all select-none ${
          isDone
            ? 'cursor-default'
            : 'cursor-pointer hover:border-rose-400 active:scale-90'
        }`}
        title={isDone ? 'Tarefa concluída com sucesso!' : 'Marcar como concluída'}
      >
        {!isDone ? (
          /* Initial Pending Circle (○) */
          <div className="w-full h-full rounded-full border-2 border-slate-300 bg-white hover:border-rose-400 hover:bg-rose-50/40 transition-colors shadow-2xs" />
        ) : (
          /* Animated or Settled Heart + Checkmark Composite */
          <motion.div
            className="w-full h-full flex items-center justify-center relative"
            animate={
              heartbeat
                ? { scale: [1, 1.34, 1] }
                : animating
                ? { scale: [0.85, 1.1, 1] }
                : { scale: 1 }
            }
            transition={{
              duration: heartbeat ? 0.25 : 0.3,
              ease: 'easeInOut',
            }}
          >
            <svg
              width={svgSize}
              height={svgSize}
              viewBox="0 0 24 24"
              className="overflow-visible drop-shadow-xs"
            >
              {/* Progressive Red Heart in Background */}
              <motion.path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                initial={animating ? { pathLength: 0, fill: 'rgba(239, 68, 68, 0)', stroke: '#ef4444', strokeWidth: 1.5 } : { pathLength: 1, fill: '#ef4444', stroke: '#ef4444', strokeWidth: 0 }}
                animate={{
                  pathLength: 1,
                  fill: '#ef4444',
                  stroke: '#ef4444',
                  strokeWidth: 0,
                }}
                transition={{
                  pathLength: { duration: 0.3, ease: 'easeOut' },
                  fill: { duration: 0.35, delay: 0.1, ease: 'easeIn' },
                }}
              />

              {/* Delicate Checkmark in Foreground (Drawn progressively) */}
              <motion.path
                d="M7 12.2l3.2 3.3 7.2-7.2"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={animating ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
                animate={{
                  pathLength: 1,
                  opacity: 1,
                }}
                transition={{
                  pathLength: { duration: 0.3, delay: animating ? 0.15 : 0, ease: 'easeInOut' },
                  opacity: { duration: 0.15, delay: animating ? 0.12 : 0 },
                }}
              />
            </svg>
          </motion.div>
        )}
      </button>
    </div>
  );
};
