import React from 'react';
import { motion } from 'motion/react';
import { UserAccount } from '../../types';
import { calculateUserXpRequired } from '../../utils/gamification';
import {
  Volume2,
  VolumeX,
  Settings,
  Trophy,
  Flame,
  Swords,
  LogOut,
} from 'lucide-react';
import { CoupleLinkSection } from './CoupleLinkSection';

interface ProfileTabProps {
  user: UserAccount;
  partner: UserAccount | null;
  onLinkPartner: (partnerPersonalId: string) => void;
  onUnlinkPartner: () => void;
  onToggleSound: () => void;
  onLogout?: () => void;
  showToast?: (msg: string) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  user,
  partner,
  onLinkPartner,
  onUnlinkPartner,
  onToggleSound,
  onLogout,
  showToast = () => {},
}) => {
  const personLevel = user.level || 1;
  const personXp = user.xp || 0;
  const xpRequired = calculateUserXpRequired(personLevel);
  const xpPercent = Math.min(100, Math.max(0, Math.round((personXp / xpRequired) * 100)));

  return (
    <div id="profile-tab-container" className="space-y-4 pb-28">
      {/* 1. User Header Profile Card */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 border border-rose-100 shadow-xs text-center relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-rose-200/30 rounded-full blur-xl pointer-events-none" />

        {/* User Avatar */}
        <div className="relative inline-block mx-auto mb-2">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-400 via-pink-500 to-rose-600 flex items-center justify-center text-4xl shadow-md border-2 border-white text-white">
            {user.avatar}
          </div>
          <span className="absolute -bottom-2 -right-1 px-2.5 py-0.5 bg-purple-50 text-purple-700 font-extrabold text-[10px] rounded-full shadow-xs border border-purple-100">
            Nível {personLevel}
          </span>
        </div>

        <h2 className="text-lg font-black text-slate-800 font-display">{user.username}</h2>
        <p className="text-xs text-slate-500 font-medium">
          {user.customStatus || 'Focado na rotina e nas disputas da Arena! ⚔️'}
        </p>

        {/* Level XP Progress Bar (Lilac 💜) */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-left space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-slate-700">Nível Pessoal {personLevel}</span>
            <span className="font-bold text-purple-700">{personXp} / {xpRequired} XP</span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${xpPercent}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        </div>
      </div>

      {/* 2. Couple Link Section (Interactive & Real-time) */}
      <CoupleLinkSection
        user={user}
        partner={partner}
        onLinkSuccess={() => {
          onLinkPartner(user.personalId);
        }}
        onUnlinkPartner={onUnlinkPartner}
        showToast={showToast}
      />

      {/* 3. Arena Stats Card */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-rose-100 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-bold text-slate-800 font-display">Estatísticas da Arena</h3>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <span className="text-lg font-black text-rose-700 font-display block leading-tight">
                {user.arenaWins}
              </span>
              <span className="text-[10px] font-bold text-slate-500">Vitórias em Disputas</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <span className="text-lg font-black text-amber-700 font-display block leading-tight">
                {user.streakDays} dias
              </span>
              <span className="text-[10px] font-bold text-slate-500">Sequência Ativa</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. App Preferences & Account */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-rose-100 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-800 font-display">Preferências</h3>
        </div>

        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2.5">
            {user.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-rose-500" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <span className="text-xs font-bold text-slate-700">Efeitos Sonoros</span>
          </div>

          <button
            type="button"
            onClick={onToggleSound}
            className={`w-11 h-6 rounded-full transition-colors relative p-1 cursor-pointer ${
              user.soundEnabled ? 'bg-rose-500' : 'bg-slate-300'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                user.soundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 p-3 bg-rose-50/70 hover:bg-rose-100/80 text-rose-600 font-bold text-xs rounded-2xl border border-rose-100 transition active:scale-98 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Conta</span>
          </button>
        )}
      </div>
    </div>
  );
};
