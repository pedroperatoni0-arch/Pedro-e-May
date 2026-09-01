import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAccount } from '../../types';
import { calculateUserXpRequired } from '../../utils/gamification';
import { soundManager } from '../../utils/audio';
import { Sparkles, Trophy, X, Flame, Swords, Heart } from 'lucide-react';
import confetti from 'canvas-confetti';

interface LevelUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  newLevel: number;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({
  isOpen,
  onClose,
  user,
  newLevel,
}) => {
  useEffect(() => {
    if (isOpen) {
      soundManager.playLevelUp();
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.5 },
        colors: ['#f43f5e', '#ec4899', '#ffd700', '#6366f1'],
      });
      const timer = setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const nextXpRequired = calculateUserXpRequired(newLevel);

  return (
    <AnimatePresence>
      <div id="level-up-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="relative w-full max-w-sm bg-gradient-to-b from-white via-rose-50/60 to-pink-100 rounded-3xl p-6 shadow-2xl border-2 border-rose-200 text-center overflow-hidden"
        >
          {/* Decorative background lights */}
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-400/25 rounded-full blur-2xl pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/80 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold text-xs shadow-md mb-3 uppercase tracking-wider">
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>Evolução Pessoal! Level Up!</span>
          </div>

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-400 via-pink-500 to-rose-600 flex items-center justify-center text-4xl shadow-md border-2 border-white text-white mx-auto my-3">
            {user.avatar}
          </div>

          <h2 className="text-3xl font-black text-slate-800 font-display">
            NÍVEL {newLevel}
          </h2>

          <p className="text-xs text-slate-600 font-medium mt-1 mb-4 leading-relaxed">
            Parabéns, <strong className="text-slate-800">{user.username}</strong>! Sua consistência e dedicação na rotina fizeram você avançar para um novo nível pessoal!
          </p>

          {/* Highlights */}
          <div className="grid grid-cols-2 gap-2.5 my-3">
            <div className="bg-white/90 rounded-2xl p-3 border border-purple-100 shadow-xs text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Próximo Nível</span>
              <span className="text-sm font-black text-purple-600 font-mono">{nextXpRequired} XP</span>
            </div>

            <div className="bg-white/90 rounded-2xl p-3 border border-amber-100 shadow-xs text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Vitórias na Arena</span>
              <span className="text-sm font-black text-amber-600 font-mono">{user.arenaWins} vitórias</span>
            </div>
          </div>

          {/* Continue button */}
          <button
            id="level-up-continue-btn"
            onClick={onClose}
            className="w-full py-3.5 mt-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/30 active:scale-98 transition flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            <span>Continuar Minha Jornada</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
