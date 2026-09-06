import React from 'react';
import { motion } from 'motion/react';
import { Phone, Video, Heart, UserPlus } from 'lucide-react';
import { UserAccount } from '../../types';
import { IntertwinedRings } from './IntertwinedRings';
import { CoupleStatsCards } from './CoupleStatsCards';

interface CoupleHeaderCardProps {
  user: UserAccount;
  partner: UserAccount | null;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onSendNudge: () => void;
  sentNudge: boolean;
  onStartLinking?: () => void;
}

export const CoupleHeaderCard: React.FC<CoupleHeaderCardProps> = ({
  user,
  partner,
  onVoiceCall,
  onVideoCall,
  onSendNudge,
  sentNudge,
  onStartLinking,
}) => {
  const isLinked = !!partner;

  return (
    <div
      id="couple-header-card"
      className="relative overflow-hidden bg-gradient-to-b from-white via-rose-50/30 to-pink-50/20 rounded-3xl p-4 sm:p-5 border border-rose-100/90 shadow-xs space-y-4"
    >
      {/* Decorative ambient blurred backgrounds */}
      <div className="absolute -top-10 -left-10 w-36 h-36 bg-rose-200/25 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -top-10 -right-10 w-36 h-36 bg-purple-200/25 rounded-full blur-2xl pointer-events-none" />

      {/* Couple Avatars & Central Intertwined Rings */}
      <div className="relative z-10 flex items-center justify-between px-1 sm:px-3 pt-1">
        {/* Person 1 (Current User) */}
        <div className="flex flex-col items-center text-center flex-1 max-w-[110px]">
          <div className="relative mb-2">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-rose-400 via-pink-500 to-rose-600 flex items-center justify-center text-3xl sm:text-4xl shadow-sm border-2 border-white text-white"
            >
              {user.avatar || '👑'}
            </motion.div>
            <span className="absolute -bottom-1.5 inset-x-0 mx-auto w-fit px-2 py-0.5 bg-rose-100 text-rose-700 font-extrabold text-[9px] sm:text-[10px] rounded-full shadow-2xs border border-white">
              Nv. {user.level || 1}
            </span>
          </div>
          <span className="text-xs sm:text-sm font-black text-slate-800 font-display truncate max-w-full block leading-tight mt-1">
            {user.username}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">Você</span>
        </div>

        {/* Central Union Element: Intertwined Rings with continuous hearts */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-2 shrink-0">
          <IntertwinedRings isLinked={isLinked} />
        </div>

        {/* Person 2 (Partner or Waiting State) */}
        <div className="flex flex-col items-center text-center flex-1 max-w-[110px]">
          {partner ? (
            <>
              <div className="relative mb-2">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-purple-400 via-pink-400 to-rose-400 flex items-center justify-center text-3xl sm:text-4xl shadow-sm border-2 border-white text-white"
                >
                  {partner.avatar || '💖'}
                </motion.div>
                <span className="absolute -bottom-1.5 inset-x-0 mx-auto w-fit px-2 py-0.5 bg-purple-100 text-purple-700 font-extrabold text-[9px] sm:text-[10px] rounded-full shadow-2xs border border-white">
                  Nv. {partner.level || 1}
                </span>
              </div>
              <span className="text-xs sm:text-sm font-black text-slate-800 font-display truncate max-w-full block leading-tight mt-1">
                {partner.username}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Amor</span>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartLinking}
              className="flex flex-col items-center group cursor-pointer focus:outline-hidden"
            >
              <div className="relative mb-2">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl sm:rounded-3xl border-2 border-dashed border-rose-300 bg-rose-50/60 hover:bg-rose-100/60 text-rose-400 flex flex-col items-center justify-center transition active:scale-95 shadow-2xs">
                  <UserPlus className="w-6 h-6 stroke-[1.75]" />
                </div>
                <span className="absolute -bottom-1.5 inset-x-0 mx-auto w-fit px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[9px] sm:text-[10px] rounded-full shadow-2xs border border-white">
                  Vincular
                </span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-rose-500 group-hover:text-rose-600 font-display truncate max-w-full block leading-tight mt-1">
                Conectar Amor
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Aguardando</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Interactive Actions when Linked (Calling & Love Nudge) */}
      {partner && (
        <div className="flex items-center justify-center gap-2 pt-1 border-t border-rose-100/70">
          <button
            type="button"
            id="couple-voice-call-btn"
            onClick={onVoiceCall}
            className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 active:scale-98 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border border-emerald-200/80 cursor-pointer shadow-2xs"
            title="Ligar para seu parceiro(a)"
          >
            <Phone className="w-3.5 h-3.5 fill-current" />
            <span>Voz</span>
          </button>

          <button
            type="button"
            id="couple-video-call-btn"
            onClick={onVideoCall}
            className="flex-1 py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 active:scale-98 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border border-purple-200/80 cursor-pointer shadow-2xs"
            title="Vídeo com seu parceiro(a)"
          >
            <Video className="w-3.5 h-3.5 fill-current" />
            <span>Vídeo</span>
          </button>

          <button
            type="button"
            id="couple-send-nudge-btn"
            onClick={onSendNudge}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border active:scale-98 cursor-pointer shadow-2xs ${
              sentNudge
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white border-rose-400'
            }`}
            title="Enviar carinho com chuva de corações"
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>Carinho</span>
          </button>
        </div>
      )}

      {/* Couple Statistics Cards */}
      <CoupleStatsCards user={user} partner={partner} />
    </div>
  );
};
