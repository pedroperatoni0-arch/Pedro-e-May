import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check } from 'lucide-react';
import { soundManager } from '../../utils/audio';

interface AnimatedCopyButtonProps {
  textToCopy: string;
  className?: string;
  label?: string;
  onCopied?: () => void;
}

export const AnimatedCopyButton: React.FC<AnimatedCopyButtonProps> = ({
  textToCopy,
  className = '',
  label = 'Copiar ID',
  onCopied,
}) => {
  const [animating, setAnimating] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleCopy = async () => {
    if (animating) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch {
      // Fallback
    }

    soundManager.playPop();
    setAnimating(true);
    setCopiedText(true);
    onCopied?.();

    // Reset after full satisfying animation sequence
    setTimeout(() => {
      setAnimating(false);
      setCopiedText(false);
    }, 1800);
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      id="copy-account-id-btn"
      className={`relative overflow-hidden group flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all duration-300 active:scale-95 shadow-xs border ${
        copiedText
          ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-rose-100'
          : 'bg-white hover:bg-rose-50/60 border-slate-200/80 hover:border-rose-200 text-slate-700 hover:text-rose-600'
      } ${className}`}
      title="Copiar ID Pessoal"
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {!animating ? (
            <motion.div
              key="idle-icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-slate-400 group-hover:text-rose-500 transition-colors"
            >
              <Copy className="w-4 h-4" />
            </motion.div>
          ) : (
            <motion.div
              key="heart-draw-animation"
              className="relative w-5 h-5 flex items-center justify-center"
              initial={{ scale: 0.9 }}
              animate={{
                scale: [1, 1, 1.3, 1],
              }}
              transition={{
                times: [0, 0.45, 0.65, 1],
                duration: 0.7,
                ease: 'easeInOut',
              }}
            >
              {/* Stroke Drawn Heart via SVG Motion Path */}
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 overflow-visible drop-shadow-xs"
                fill="none"
              >
                {/* Drawn Heart Contour */}
                <motion.path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  stroke="#f43f5e"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, fill: 'rgba(244, 63, 94, 0)' }}
                  animate={{
                    pathLength: [0, 1, 1],
                    fill: [
                      'rgba(244, 63, 94, 0)',
                      'rgba(244, 63, 94, 0.15)',
                      'rgba(244, 63, 94, 0.85)',
                    ],
                  }}
                  transition={{
                    pathLength: { duration: 0.42, ease: 'easeInOut' },
                    fill: { delay: 0.4, duration: 0.25 },
                  }}
                />

                {/* Delicate Burst / Radiance Rays radiating outward after heart completes */}
                {/* Top Left */}
                <motion.line
                  x1="6"
                  y1="2"
                  x2="3"
                  y2="-1"
                  stroke="#fb7185"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ delay: 0.5, duration: 0.45 }}
                />
                {/* Top Right */}
                <motion.line
                  x1="18"
                  y1="2"
                  x2="21"
                  y2="-1"
                  stroke="#fb7185"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ delay: 0.5, duration: 0.45 }}
                />
                {/* Center Top Star */}
                <motion.circle
                  cx="12"
                  cy="-1.5"
                  r="1.2"
                  fill="#f43f5e"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
                  transition={{ delay: 0.52, duration: 0.4 }}
                />
                {/* Bottom Left */}
                <motion.line
                  x1="5"
                  y1="19"
                  x2="2"
                  y2="22"
                  stroke="#fb7185"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ delay: 0.52, duration: 0.45 }}
                />
                {/* Bottom Right */}
                <motion.line
                  x1="19"
                  y1="19"
                  x2="22"
                  y2="22"
                  stroke="#fb7185"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ delay: 0.52, duration: 0.45 }}
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span className="whitespace-nowrap transition-colors duration-300">
        {copiedText ? 'ID Copiado!' : label}
      </span>
    </button>
  );
};
