import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { FloatingHeartsBackground } from '../background/FloatingHeartsBackground';

interface MobileShellProps {
  children: React.ReactNode;
  activeNotification?: string | null;
  onDismissNotification?: () => void;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  activeNotification,
  onDismissNotification,
}) => {
  return (
    <div className="h-full w-full bg-white flex items-center justify-center p-0 sm:p-4 select-none relative overflow-hidden">
      {/* Outer ambient subtle background for larger desktop screens */}
      <div className="hidden sm:block absolute inset-0 bg-[#fafbfe] -z-10" />

      {/* Main Mobile App Container with Clean Light Design */}
      <div className="w-full max-w-md h-full sm:h-[880px] bg-white sm:rounded-[40px] shadow-[0_10px_40px_-10px_rgba(244,63,94,0.08)] border-0 sm:border border-rose-100 flex flex-col relative overflow-hidden">
        {/* Layer 1 & 2: Clean White Background + Animated Floating Hearts */}
        <FloatingHeartsBackground />

        {/* Global In-App Toast Notification (Layer 4 - z-50) */}
        <AnimatePresence>
          {activeNotification && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-4 inset-x-4 z-50 bg-slate-900/95 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between border border-rose-500/30 backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400 shrink-0 animate-spin" />
                <p className="text-xs font-medium">{activeNotification}</p>
              </div>
              {onDismissNotification && (
                <button
                  onClick={onDismissNotification}
                  className="text-xs text-rose-300 font-bold px-2 py-0.5 hover:bg-white/10 rounded-lg cursor-pointer"
                >
                  OK
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main App Content View Container (Layer 3 - Child views manage their own scroll state) */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
};

