import React from 'react';
import { ArrowLeft, Globe, Cloud } from 'lucide-react';

interface CineminhaSourceChoiceViewProps {
  onSelectWeb: () => void;
  onSelectDrive: () => void;
  onBack: () => void;
}

export const CineminhaSourceChoiceView: React.FC<CineminhaSourceChoiceViewProps> = ({
  onSelectWeb,
  onSelectDrive,
  onBack,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 text-white relative">
      {/* Top back button */}
      <div className="p-4 flex items-center shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition flex items-center gap-1 text-xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>
      </div>

      {/* Centered Choice Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h3 className="text-lg font-bold text-white font-display mb-8">
          Escolha onde encontrar o filme
        </h3>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-xs">
          <button
            id="cineminha-btn-choice-web"
            onClick={onSelectWeb}
            className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/50 text-white font-bold text-base transition flex items-center justify-center gap-3 shadow-lg active:scale-95 cursor-pointer"
          >
            <Globe className="w-5 h-5 text-rose-500" />
            <span>Web</span>
          </button>

          <button
            id="cineminha-btn-choice-drive"
            onClick={onSelectDrive}
            className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/50 text-white font-bold text-base transition flex items-center justify-center gap-3 shadow-lg active:scale-95 cursor-pointer"
          >
            <Cloud className="w-5 h-5 text-rose-500" />
            <span>Drive</span>
          </button>
        </div>
      </div>
    </div>
  );
};
