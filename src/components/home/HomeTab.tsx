import React from 'react';
import { motion } from 'motion/react';
import { UserAccount, Task } from '../../types';
import { calculateUserXpRequired, calculateArenaScore } from '../../utils/gamification';
import { getDailyCuteQuote } from '../../data/motivationalQuotes';
import { TaskHeartCheckButton } from '../routine/TaskHeartCheckButton';
import { CoupleActivityShortcuts } from './CoupleActivityShortcuts';
import {
  Flame,
  Sparkles,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { getTodayDateString, getTodayDayOfWeek } from '../../utils/storage';

interface HomeTabProps {
  user: UserAccount;
  partner: UserAccount | null;
  tasks: Task[];
  partnerTasks: Task[];
  onNavigateToRoutine: () => void;
  onNavigateToArena?: () => void;
  onNavigateToChallenges?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToChat?: () => void;
  onOpenCineminha?: () => void;
  onToggleTask?: (taskId: string) => void;
  onToggleTaskToday?: (taskId: string) => void;
  showToast?: (message: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  user,
  partner,
  tasks,
  partnerTasks: _partnerTasks,
  onNavigateToRoutine,
  onNavigateToArena: _onNavigateToArena,
  onNavigateToChallenges: _onNavigateToChallenges,
  onNavigateToProfile: _onNavigateToProfile,
  onNavigateToChat: _onNavigateToChat,
  onOpenCineminha,
  onToggleTask,
  onToggleTaskToday,
  showToast,
}) => {
  const todayStr = getTodayDateString();
  const todayDay = getTodayDayOfWeek();
  const cuteQuote = getDailyCuteQuote(todayStr);

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const handleToggle = onToggleTask || onToggleTaskToday || (() => {});

  // User Today's Tasks & Routine Percentage
  const todayUserTasks = safeTasks.filter(t => t && Array.isArray(t.days) && t.days.includes(todayDay));
  const completedUserTasks = todayUserTasks.filter(t => t && Array.isArray(t.completedDates) && t.completedDates.includes(todayStr));
  const userScore = calculateArenaScore(completedUserTasks.length, todayUserTasks.length);

  // Person / User Progression
  const personLevel = user.level || 1;
  const personXp = user.xp || 0;
  const personXpRequired = calculateUserXpRequired(personLevel);
  const personXpPercent = Math.min(100, Math.max(0, Math.round((personXp / personXpRequired) * 100)));

  return (
    <div id="home-tab-container" className="space-y-4 pb-24">
      {/* 1. SINGLE UNIFIED USER OVERVIEW CARD */}
      <div
        id="main-user-overview-card"
        className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-rose-100 shadow-xs relative overflow-hidden space-y-3.5"
      >
        {/* Subtle Decorative Background Light */}
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-rose-200/25 rounded-full blur-2xl pointer-events-none" />

        {/* Header: User Profile + Streak */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-xl shadow-xs border border-white text-white">
              {user.avatar}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-slate-800 text-base">{user.username}</h2>
                <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                  Nível {personLevel}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium line-clamp-1">
                {user.customStatus || 'Focado na rotina e evolução pessoal'}
              </p>
            </div>
          </div>

          {/* Streak Counter (Highlight / Warning Accent) */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-800 shrink-0">
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
            <span className="text-xs font-bold">{user.streakDays} dias</span>
          </div>
        </div>

        {/* Cute Motivational Phrase Area */}
        <div className="bg-rose-50/70 border border-rose-100/90 rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-rose-800 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="italic leading-relaxed">{cuteQuote}</span>
        </div>

        {/* Subtle Divider */}
        <div className="border-t border-rose-100/70" />

        {/* Routine & Person Level Progress Section */}
        <div className="space-y-3 pt-0.5">
          {/* Rotina de Hoje (Primary Rose) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px]">
                Rotina de Hoje
              </span>
              <span className="font-black text-rose-600 font-display text-sm">
                {userScore}% ({completedUserTasks.length}/{todayUserTasks.length})
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
              <motion.div
                className="h-full bg-gradient-to-r from-rose-400 via-pink-500 to-rose-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${userScore}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Level Pessoal (Secondary Lilac 💜) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px]">
                Nível Pessoal {personLevel}
              </span>
              <span className="font-bold text-purple-700 text-[11px]">
                {personXp} / {personXpRequired} XP
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${personXpPercent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. 🎬 NOVA ÁREA NA TELA INICIAL: ATALHOS DE ATIVIDADES DO CASAL (Cineminha, Leitura, Games, Disciplina) */}
      <CoupleActivityShortcuts
        onSelectActivity={(id) => {
          if (id === 'movies' && onOpenCineminha) {
            onOpenCineminha();
          } else if (showToast) {
            if (id === 'reading') showToast('Leitura • Em breve leituras a dois! 📖✨');
            else if (id === 'games') showToast('Games • Em breve jogatinas a dois! 🎮👾');
            else if (id === 'discipline') showToast('Disciplina • Em breve rotina a dois! 🎯📋');
          }
        }}
        showToast={showToast}
      />

      {/* 3. TODAY'S PENDING TASKS QUICK LIST */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-rose-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-800 font-display">Tarefas de Hoje</h3>
          </div>
          <button
            onClick={onNavigateToRoutine}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-0.5 cursor-pointer"
          >
            <span>Ver Todas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {todayUserTasks.length === 0 ? (
          <div className="p-4 text-center bg-rose-50/50 rounded-2xl border border-dashed border-rose-200">
            <p className="text-xs text-slate-600 mb-2">Nenhuma tarefa agendada para hoje.</p>
            <button
              onClick={onNavigateToRoutine}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Organizar Rotina
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {todayUserTasks.slice(0, 4).map(task => {
              const isDone = task.completedDates.includes(todayStr);
              return (
                <div
                  key={task.id}
                  id={`home-task-item-${task.id}`}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isDone
                      ? 'bg-rose-50/50 border-rose-200/70 text-slate-500'
                      : 'bg-white border-slate-100 hover:border-rose-200 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono font-bold text-slate-400 shrink-0">{task.time}</span>
                    <span className={`text-xs font-medium truncate ${isDone ? 'line-through text-slate-400 font-normal' : 'text-slate-800'}`}>
                      {task.title}
                    </span>
                  </div>

                  <div className="shrink-0">
                    <TaskHeartCheckButton
                      isCompleted={isDone}
                      onComplete={() => handleToggle(task.id)}
                      onClick={() => handleToggle(task.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
