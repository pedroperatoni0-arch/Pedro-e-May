import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UserAccount } from '../../types';
import { calculateUserXpRequired } from '../../utils/gamification';
import { soundManager } from '../../utils/audio';
import { callManager } from '../../services/callManager';
import confetti from 'canvas-confetti';
import {
  Volume2,
  VolumeX,
  Settings,
  Trophy,
  Flame,
  Swords,
  LogOut,
} from 'lucide-react';
import { CoupleHeaderCard } from './CoupleHeaderCard';
import { CoupleLinkSection } from './CoupleLinkSection';

interface ProfileTabProps {
  user: UserAccount;
  partner: UserAccount | null;
  onLinkPartner?: (partnerPersonalId: string) => void;
  onLinkSuccess?: (partner: UserAccount) => void;
  onUpdateUser?: (updated: UserAccount) => void;
  onUnlinkPartner: () => void;
  onToggleSound: () => void;
  onLogout?: () => void;
  showToast?: (msg: string) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  user,
  partner,
  onLinkPartner,
  onLinkSuccess,
  onUnlinkPartner,
  onToggleSound,
  onLogout,
  showToast = (_msg: string) => {},
}) => {
  const [sentNudge, setSentNudge] = useState(false);

  const personLevel = user.level || 1;
  const personXp = user.xp || 0;
  const xpRequired = calculateUserXpRequired(personLevel);
  const xpPercent = Math.min(100, Math.max(0, Math.round((personXp / xpRequired) * 100)));

  // Voice Call
  const handleStartVoiceCall = async () => {
    if (!partner) return;
    const ok = await callManager.startCall(partner, 'audio');
    if (!ok) {
      showToast('Não foi possível iniciar a chamada de voz.');
    }
  };

  // Video Call
  const handleStartVideoCall = async () => {
    if (!partner) return;
    const ok = await callManager.startCall(partner, 'video');
    if (!ok) {
      showToast('Não foi possível iniciar a chamada de vídeo.');
    }
  };

  // Send Love Nudge
  const handleSendLoveNudge = () => {
    if (!partner) return;
    soundManager.playPop();
    setSentNudge(true);
    confetti({
      particleCount: 35,
      spread: 60,
      origin: { y: 0.65 },
      colors: ['#f43f5e', '#ec4899', '#ffd700'],
    });
    showToast(`Carinho enviado para ${partner.username}! ❤️✨`);
    setTimeout(() => setSentNudge(false), 3000);
  };

  const handleLinkSuccessInternal = (partnerAccount: UserAccount) => {
    if (onLinkSuccess) {
      onLinkSuccess(partnerAccount);
    } else if (onLinkPartner) {
      onLinkPartner(user.personalId);
    }
  };

  const scrollToLinkSection = () => {
    const el = document.getElementById('couple-link-section-wrapper');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div id="profile-tab-container" className="space-y-4 pb-28">
      {/* 1. Novo Cabeçalho do Casal (Fotos Lado a Lado + Anéis Entrelaçados + Animação de Corações + 3 Cards de Estatísticas) */}
      <CoupleHeaderCard
        user={user}
        partner={partner}
        onVoiceCall={handleStartVoiceCall}
        onVideoCall={handleStartVideoCall}
        onSendNudge={handleSendLoveNudge}
        sentNudge={sentNudge}
        onStartLinking={scrollToLinkSection}
      />

      {/* 2. Área de Vínculo de Contas / Gerenciamento (Sem badge verde, sem exibir ID do parceiro) */}
      <div id="couple-link-section-wrapper">
        <CoupleLinkSection
          user={user}
          partner={partner}
          onLinkSuccess={handleLinkSuccessInternal}
          onUnlinkPartner={onUnlinkPartner}
          showToast={showToast}
        />
      </div>

      {/* 3. Progresso Pessoal & Estatísticas da Arena */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-rose-100 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-800 font-display">Seu Progresso & Arena</h3>
          </div>
          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
            Nível {personLevel}
          </span>
        </div>

        {/* Level XP Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600">Experiência Pessoal</span>
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

        {/* Arena Wins & Active Streak */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <span className="text-lg font-black text-rose-700 font-display block leading-tight">
                {user.arenaWins}
              </span>
              <span className="text-[10px] font-bold text-slate-500">Vitórias na Arena</span>
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

      {/* 4. Preferências do Aplicativo & Conta */}
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
