import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { UserAccount } from '../../types';

interface CineminhaIntroViewProps {
  currentUser?: UserAccount;
  partner?: UserAccount | null;
  onStartSession: () => void;
  onBack: () => void;
}

export const CineminhaIntroView: React.FC<CineminhaIntroViewProps> = ({
  onStartSession,
  onBack,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 text-white relative">
      {/* Top back button */}
      <div className="p-4 flex items-center shrink-0">
        <button
          id="cineminha-btn-back-intro"
          onClick={onBack}
          className="p-2 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition flex items-center gap-1 text-xs cursor-pointer"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>
      </div>

      {/* Centered Iniciar Button */}
      <div className="flex-1 flex items-center justify-center p-6">
        <button
          id="cineminha-btn-iniciar"
          onClick={onStartSession}
          className="px-10 py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-lg shadow-lg active:scale-95 transition cursor-pointer"
        >
          Iniciar
        </button>
      </div>
    </div>
  );
};
