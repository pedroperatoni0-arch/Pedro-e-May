import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAccount, Task, ArenaDailyMatch, ArenaSeason, FlashChallenge } from '../../types';
import {
  calculateArenaScore,
  getArenaStatusMessage,
} from '../../utils/gamification';
import { AppStorage, getTodayDateString, getTodayDayOfWeek, formatDateToPortuguese } from '../../utils/storage';
import { ArenaEnergyDisputeBar } from '../arena/ArenaEnergyDisputeBar';
import { soundManager } from '../../utils/audio';
import confetti from 'canvas-confetti';
import {
  Swords,
  Trophy,
  Flame,
  Zap,
  Heart,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
  ChevronRight,
  Shield,
  MessageCircle,
  Crown,
  History,
  AlertCircle
} from 'lucide-react';

interface ChallengesTabProps {
  user: UserAccount;
  partner: UserAccount | null;
  tasks: Task[];
  partnerTasks: Task[];
  onNavigateToRoutine: () => void;
  onNavigateToChat: () => void;
}

export const ChallengesTab: React.FC<ChallengesTabProps> = ({
  user,
  partner,
  tasks,
  partnerTasks,
  onNavigateToRoutine,
  onNavigateToChat,
}) => {
  const todayStr = getTodayDateString();
  const todayDay = getTodayDayOfWeek();

  const [activeSubTab, setActiveSubTab] = useState<'today' | 'season' | 'history'>('today');

  // Load storage states
  const [historyMatches, setHistoryMatches] = useState<ArenaDailyMatch[]>([]);
  const [seasons, setSeasons] = useState<ArenaSeason[]>([]);
  const [flashChallenge, setFlashChallenge] = useState<FlashChallenge>(AppStorage.getFlashChallenge());

  useEffect(() => {
    setHistoryMatches(AppStorage.getArenaHistory());
    setSeasons(AppStorage.getArenaSeasons());
    setFlashChallenge(AppStorage.getFlashChallenge());
  }, [tasks, partnerTasks]);

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safePartnerTasks = Array.isArray(partnerTasks) ? partnerTasks : [];

  // User Routine Progress
  const userTodayTasks = safeTasks.filter(t => t && Array.isArray(t.days) && t.days.includes(todayDay));
  const userCompletedTasks = userTodayTasks.filter(t => t && Array.isArray(t.completedDates) && t.completedDates.includes(todayStr));
  const userScore = calculateArenaScore(userCompletedTasks.length, userTodayTasks.length);

  // Partner Routine Progress
  const partnerTodayTasks = partner ? safePartnerTasks.filter(t => t && Array.isArray(t.days) && t.days.includes(todayDay)) : [];
  const partnerCompletedTasks = partnerTodayTasks.filter(t => t && Array.isArray(t.completedDates) && t.completedDates.includes(todayStr));
  const partnerScore = partner
    ? calculateArenaScore(partnerCompletedTasks.length, partnerTodayTasks.length)
    : 75;

  const partnerName = partner ? partner.username : 'Ela';

  // Precision comparison for leader / tie determination
  const isUserLeading = userScore > partnerScore + 0.001;
  const isPartnerLeading = partnerScore > userScore + 0.001;
  const isScoreTie = Math.abs(userScore - partnerScore) <= 0.001;

  // Arena Live Status
  const arenaStatus = getArenaStatusMessage(userScore, partnerScore, partnerName, 'Você');

  // Dynamic bar split
  const totalScoreSum = userScore + partnerScore;
  const userRatio = totalScoreSum > 0 ? (userScore / totalScoreSum) * 100 : 50;

  // Couple joint goal
  const userDone100 = Math.abs(userScore - 100) < 0.001 && userTodayTasks.length > 0;
  const partnerDone100 = Math.abs(partnerScore - 100) < 0.001 && (partnerTodayTasks.length > 0 || !partner);
  const coupleGoalSuccess = userDone100 && partnerDone100;

  const currentSeason = seasons[0] || {
    id: 'season_1',
    weekNumber: 1,
    title: 'Semana 1',
    startDate: '2026-08-24',
    endDate: '2026-08-30',
    userWins: 4,
    partnerWins: 5,
    draws: 1,
    totalMatches: 10,
    championId: 'partner',
    isCompleted: false,
  };

  const handleSendCheer = (cheerText: string) => {
    soundManager.playPop();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    AppStorage.addMessage({
      senderId: user.id,
      receiverId: partner ? partner.id : 'partner_sim',
      senderName: user.username,
      type: 'encouragement',
      content: cheerText,
      timestamp: timeStr,
      read: true,
    });

    confetti({
      particleCount: 25,
      spread: 50,
      origin: { y: 0.6 },
      colors: ['#f43f5e', '#ec4899', '#ffd700'],
    });

    onNavigateToChat();
  };

  return (
    <div id="arena-tab-container" className="space-y-4 pb-28">
      {/* ⚔️ ARENA HEADER (Clean White + Rose Identity + Lilac Accent) */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 border border-rose-100 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 font-display tracking-wide">
                ARENA DO CASAL
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Disputa saudável de rotina & metas diárias
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200/70 rounded-2xl text-xs font-bold text-amber-800">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            <span>{currentSeason.title}</span>
          </div>
        </div>

        {/* Sub Navigation Pills */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 relative z-10">
          <button
            onClick={() => setActiveSubTab('today')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
              activeSubTab === 'today'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Disputa de Hoje</span>
          </button>

          <button
            onClick={() => setActiveSubTab('season')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
              activeSubTab === 'season'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-800'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Temporada</span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
              activeSubTab === 'history'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: DISPUTA DE HOJE */}
      {activeSubTab === 'today' && (
        <div className="space-y-4">
          {/* 1. DISPUTA DE HOJE - PLACAR COMPLETO */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 border border-rose-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-bold text-slate-800 font-display">Placar ao Vivo</h3>
              </div>
              <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                Máx: 100 pontos
              </span>
            </div>

            {/* Visual Head-to-Head Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Você */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isUserLeading
                  ? 'bg-rose-50/80 border-rose-200/90 shadow-xs ring-1 ring-rose-200'
                  : isScoreTie && userScore > 0
                  ? 'bg-rose-50/40 border-rose-100'
                  : 'bg-slate-50 border-slate-200/70'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{user.avatar}</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-800">Você</h4>
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {userCompletedTasks.length} de {userTodayTasks.length} tarefas
                      </span>
                    </div>
                  </div>
                  {isUserLeading && (
                    <Crown className="w-4 h-4 text-amber-500 animate-bounce" />
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between border-t border-rose-100 pt-2">
                  <span className="text-[11px] font-bold text-slate-500">Pontuação:</span>
                  <span className="text-2xl font-black text-rose-600 font-display">{Math.round(userScore)} pts</span>
                </div>
              </div>

              {/* Parceiro */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isPartnerLeading
                  ? 'bg-purple-50/80 border-purple-200/90 shadow-xs ring-1 ring-purple-200'
                  : isScoreTie && partnerScore > 0
                  ? 'bg-purple-50/40 border-purple-100'
                  : 'bg-slate-50 border-slate-200/70'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{partner ? partner.avatar : '🌸'}</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-800">{partnerName}</h4>
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {partnerCompletedTasks.length} de {partnerTodayTasks.length || 4} tarefas
                      </span>
                    </div>
                  </div>
                  {isPartnerLeading && (
                    <Crown className="w-4 h-4 text-amber-500 animate-bounce" />
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between border-t border-purple-100 pt-2">
                  <span className="text-[11px] font-bold text-slate-500">Pontuação:</span>
                  <span className="text-2xl font-black text-purple-600 font-display">{Math.round(partnerScore)} pts</span>
                </div>
              </div>
            </div>

            {/* Dynamic Animated Dispute Bar (Two Energy Beams Clashing into a Living Heart) */}
            <div className="py-1">
              <ArenaEnergyDisputeBar
                userScore={userScore}
                partnerScore={partnerScore}
                userName="Você"
                partnerName={partnerName}
                userAvatar={user.avatar}
                partnerAvatar={partner ? partner.avatar : '🌸'}
                size="lg"
                showLabels={true}
              />
            </div>

            {/* Affectionate Feedback Banner */}
            <div className="bg-rose-50/70 rounded-2xl p-3 border border-rose-100 flex items-center gap-2.5 text-xs text-rose-900 font-medium">
              <span className="text-lg">{arenaStatus.icon}</span>
              <span className="leading-snug">{arenaStatus.text}</span>
            </div>

            {/* Quick Cheer / Chat Buttons */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              <span className="w-full text-[11px] font-bold text-slate-400 block mb-0.5">
                Enviar Torcida Rápida no Chat:
              </span>
              <button
                onClick={() => handleSendCheer('Vai meu amor! Foco na rotina! 💕🔥')}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100/80 rounded-xl text-xs font-bold transition flex items-center gap-1"
              >
                <span>Vai amor! 💕</span>
              </button>
              <button
                onClick={() => handleSendCheer('Tô chegando perto hein! Hoje eu ganho! ⚔️😎')}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100/80 rounded-xl text-xs font-bold transition flex items-center gap-1"
              >
                <span>Tô chegando! 😎</span>
              </button>
              <button
                onClick={() => handleSendCheer('Parabéns pela dedicação hoje, meu bem! 🌸✨')}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70 rounded-xl text-xs font-bold transition flex items-center gap-1"
              >
                <span>Arrasou hoje! 🌸</span>
              </button>
            </div>
          </div>

          {/* 2. DESAFIO DO CASAL (Meta conjunta) */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 border border-rose-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                <h3 className="text-sm font-bold text-slate-800 font-display">Desafio do Casal</h3>
              </div>
              <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                Meta Conjunta
              </span>
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Ambos baterem 100% da rotina no mesmo dia para desbloquear a sinergia perfeita do casal!
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className={`p-3 rounded-2xl border flex items-center gap-2.5 ${
                userDone100 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                  userDone100 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {userDone100 ? <CheckCircle2 className="w-4 h-4" /> : '⏳'}
                </div>
                <div>
                  <span className="text-[11px] font-extrabold block">Você</span>
                  <span className="text-[10px]">{userDone100 ? '100% Concluído' : `${userScore}% Feito`}</span>
                </div>
              </div>

              <div className={`p-3 rounded-2xl border flex items-center gap-2.5 ${
                partnerDone100 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                  partnerDone100 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {partnerDone100 ? <CheckCircle2 className="w-4 h-4" /> : '⏳'}
                </div>
                <div>
                  <span className="text-[11px] font-extrabold block">{partnerName}</span>
                  <span className="text-[10px]">{partnerDone100 ? '100% Concluído' : `${partnerScore}% Feito`}</span>
                </div>
              </div>
            </div>

            {coupleGoalSuccess && (
              <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-2xl p-3 text-center shadow-xs">
                <span className="text-sm font-black block">🎉 PARABÉNS AO CASAL!</span>
                <p className="text-xs opacity-90">Vocês dois completaram 100% da rotina hoje!</p>
              </div>
            )}
          </div>

          {/* 3. DISPUTA RELÂMPAGO */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 border border-rose-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-800 font-display">Disputa Relâmpago</h3>
              </div>
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Velocidade
              </span>
            </div>

            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-3 border border-amber-100 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-extrabold text-amber-900">
                  {flashChallenge.title}
                </h4>
                <p className="text-[11px] text-amber-800">
                  {flashChallenge.description}
                </p>
              </div>
              <span className="px-2.5 py-1 bg-amber-500 text-white font-extrabold text-[10px] rounded-xl shadow-xs shrink-0">
                Ativo
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TEMPORADA SEMANAL */}
      {activeSubTab === 'season' && (
        <div className="space-y-4">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 border border-rose-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-800 font-display">
                  {currentSeason.title} (24 a 30 de Agosto)
                </h3>
              </div>
              <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                Em Andamento
              </span>
            </div>

            {/* Season Standings Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100">
                <span className="text-xs font-bold text-slate-500 block">Você</span>
                <span className="text-2xl font-black text-rose-600 font-display">{currentSeason.userWins}</span>
                <span className="text-[10px] text-slate-400 block font-medium">vitórias</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 block">Empates</span>
                <span className="text-2xl font-black text-slate-700 font-display">{currentSeason.draws}</span>
                <span className="text-[10px] text-slate-400 block font-medium">dias iguais</span>
              </div>

              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100">
                <span className="text-xs font-bold text-slate-500 block">{partnerName}</span>
                <span className="text-2xl font-black text-purple-600 font-display">{currentSeason.partnerWins}</span>
                <span className="text-[10px] text-slate-400 block font-medium">vitórias</span>
              </div>
            </div>

            {/* Leader Card */}
            <div className="bg-gradient-to-r from-amber-400/20 via-rose-300/20 to-purple-400/20 rounded-2xl p-3.5 border border-amber-200/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Crown className="w-5 h-5 text-amber-500" />
                <div>
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
                    Líder da Temporada
                  </span>
                  <h4 className="text-xs font-black text-slate-800">
                    {currentSeason.championId === 'user_mia_2' ? `${partnerName} 🌸 (5 vitórias)` : 'Você 🦁 (4 vitórias)'}
                  </h4>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-white/80 px-2.5 py-1 rounded-xl">
                Faltam 2 dias
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: HISTÓRICO DA ARENA */}
      {activeSubTab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Disputas Anteriores Fechadas
            </h3>
            <span className="text-[10px] font-bold text-slate-400">
              {historyMatches.length} registros
            </span>
          </div>

          {historyMatches.map(match => (
            <div
              key={match.id}
              className="bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-rose-100 shadow-xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-bold text-slate-800">{match.dateLabel}</span>
                </div>
                {match.coupleGoalCompleted ? (
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Meta Conjunta 100%
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Fechado
                  </span>
                )}
              </div>

              {/* Score comparison */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-slate-600">Você ({match.userCompletedTasks}/{match.userTotalTasks})</span>
                  <span className="font-black text-rose-600">{match.userScore} pts</span>
                </div>

                <div className="p-2 bg-slate-50 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-slate-600">{partnerName} ({match.partnerCompletedTasks}/{match.partnerTotalTasks})</span>
                  <span className="font-black text-purple-600">{match.partnerScore} pts</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 font-medium italic">
                {match.statusText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
