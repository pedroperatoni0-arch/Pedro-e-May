import React from 'react';
import { UserAccount } from '../../types';
import { MoviePopcornAnim } from './MoviePopcornAnim';
import { DayNightCycleAnim } from './DayNightCycleAnim';
import { HeartFlameAnim } from './HeartFlameAnim';

interface CoupleStatsCardsProps {
  user: UserAccount;
  partner: UserAccount | null;
}

export const CoupleStatsCards: React.FC<CoupleStatsCardsProps> = ({ user, partner }) => {
  const isLinked = !!partner;

  // Métricas calculadas ou demonstrativas de casal
  const movieCount = isLinked ? 18 : 0;
  const daysCount = isLinked ? Math.max((user.streakDays || 1) * 3 + 12, 28) : 1;
  const disciplinePercent = isLinked ? 94 : 0;

  const stats = [
    {
      id: 'movies',
      label: 'Filmes a dois',
      value: `${movieCount}`,
      borderColor: 'border-amber-100/90 hover:border-amber-200',
      icon: <MoviePopcornAnim />,
    },
    {
      id: 'days',
      label: 'Tempo juntos',
      value: `${daysCount}d`,
      borderColor: 'border-indigo-100/90 hover:border-indigo-200',
      icon: <DayNightCycleAnim />,
    },
    {
      id: 'discipline',
      label: 'Disciplina duo',
      value: `${disciplinePercent}%`,
      borderColor: 'border-rose-100/90 hover:border-rose-200',
      icon: <HeartFlameAnim />,
    },
  ];

  return (
    <div id="couple-stats-cards-container" className="w-full">
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {stats.map((stat) => (
          <div
            key={stat.id}
            id={`couple-stat-card-${stat.id}`}
            className={`relative bg-white/95 rounded-2xl py-2.5 px-1.5 sm:px-2 border ${stat.borderColor} shadow-2xs flex flex-col items-center text-center justify-between transition-all duration-200 hover:shadow-xs min-h-[92px]`}
          >
            {/* Elemento / Ícone Animado Vivo (O quadrinho permanece parado, apenas o elemento interno anima) */}
            <div className="mb-1.5 shrink-0 flex items-center justify-center">
              {stat.icon}
            </div>

            {/* Valor / Métrica com Maior Destaque */}
            <span className="text-base sm:text-lg font-black font-display text-slate-800 tracking-tight block leading-tight">
              {stat.value}
            </span>

            {/* Rótulo Curto e Conciso */}
            <span className="text-[10px] font-bold text-slate-400 block truncate max-w-full mt-0.5 leading-tight">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
