import React from 'react';
import { Sparkles } from 'lucide-react';
import cineminhaImg from '../../assets/images/cineminha_retro_card_1788667622953.jpg';
import leituraImg from '../../assets/images/leitura_retro_card_1788667607223.jpg';
import gamesImg from '../../assets/images/games_retro_card_1788667637833.jpg';
import disciplinaImg from '../../assets/images/disciplina_retro_card_1788667650984.jpg';

export interface CoupleActivity {
  id: 'movies' | 'reading' | 'games' | 'discipline';
  title: string;
  borderColor: string;
  imageSrc: string;
}

interface CoupleActivityShortcutsProps {
  onSelectActivity?: (activityId: string) => void;
  showToast?: (message: string) => void;
}

export const CoupleActivityShortcuts: React.FC<CoupleActivityShortcutsProps> = ({
  onSelectActivity,
  showToast,
}) => {
  const activities: CoupleActivity[] = [
    {
      id: 'movies',
      title: 'Cineminha',
      borderColor: 'border-amber-200/80 hover:border-amber-400',
      imageSrc: cineminhaImg,
    },
    {
      id: 'reading',
      title: 'Leitura',
      borderColor: 'border-amber-200/80 hover:border-amber-400',
      imageSrc: leituraImg,
    },
    {
      id: 'games',
      title: 'Games',
      borderColor: 'border-amber-200/80 hover:border-amber-400',
      imageSrc: gamesImg,
    },
    {
      id: 'discipline',
      title: 'Disciplina',
      borderColor: 'border-amber-200/80 hover:border-amber-400',
      imageSrc: disciplinaImg,
    },
  ];

  const handleCardClick = (activity: CoupleActivity) => {
    if (onSelectActivity) {
      onSelectActivity(activity.id);
    } else if (showToast) {
      if (activity.id === 'movies') {
        showToast('Cineminha • Em breve sessões a dois! 🎬🍿');
      } else if (activity.id === 'reading') {
        showToast('Leitura • Em breve leituras a dois! 📖✨');
      } else if (activity.id === 'games') {
        showToast('Games • Em breve jogatinas a dois! 🎮👾');
      } else if (activity.id === 'discipline') {
        showToast('Disciplina • Em breve rotina e hábitos a dois! 🎯📋');
      } else {
        showToast(`${activity.title} • Em breve! ✨`);
      }
    }
  };

  return (
    <div id="couple-activity-shortcuts-section" className="space-y-2">
      {/* Header da Seção */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-rose-50 border border-rose-100/80 flex items-center justify-center text-rose-500">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 font-display">
            Atividades do Casal
          </h3>
        </div>
        <span className="text-[10px] font-extrabold text-rose-500 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
          Atalhos
        </span>
      </div>

      {/* Os Quatro Cards Lado a Lado na Mesma Linha */}
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {activities.map((activity) => (
          <button
            key={activity.id}
            type="button"
            id={`couple-activity-btn-${activity.id}`}
            onClick={() => handleCardClick(activity)}
            className={`group relative bg-white/95 rounded-2xl py-2 px-1 sm:px-1.5 border ${activity.borderColor} shadow-2xs flex flex-col items-center text-center justify-between transition-all duration-150 hover:shadow-xs hover:border-rose-200 active:scale-95 cursor-pointer min-h-[96px] w-full`}
            title={activity.title}
          >
            {/* Imagem Real Ilustrada Temática */}
            <div
              className="w-full aspect-square max-w-[62px] rounded-xl flex items-center justify-center shadow-2xs mb-1.5 shrink-0 transition-transform duration-150 group-hover:scale-105 overflow-hidden bg-slate-900 border border-slate-700/20"
            >
              <img
                src={activity.imageSrc}
                alt={activity.title}
                className="w-full h-full object-cover rounded-xl"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </div>

            {/* Nome Curto e Elegante */}
            <span className="text-[11px] sm:text-xs font-extrabold font-display text-slate-700 tracking-tight block truncate max-w-full leading-tight group-hover:text-rose-600 transition-colors">
              {activity.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
