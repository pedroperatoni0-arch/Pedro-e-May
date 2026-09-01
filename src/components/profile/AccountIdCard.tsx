import React from 'react';
import { KeyRound, HeartHandshake } from 'lucide-react';
import { AnimatedCopyButton } from './AnimatedCopyButton';

interface AccountIdCardProps {
  personalId: string;
  username: string;
}

export const AccountIdCard: React.FC<AccountIdCardProps> = ({ personalId, username }) => {
  return (
    <div
      id="account-id-card"
      className="relative overflow-hidden bg-gradient-to-br from-white via-rose-50/40 to-purple-50/30 rounded-3xl p-5 border border-rose-100/90 shadow-xs"
    >
      {/* Delicate background ambient glows */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-rose-200/25 rounded-full blur-xl pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-purple-200/25 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 space-y-3.5">
        {/* Card Header Tag */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center shadow-xs">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500 block leading-tight">
                Identificador Único
              </span>
              <h3 className="text-sm font-black text-slate-800 font-display leading-tight">
                Seu ID da Conta
              </h3>
            </div>
          </div>
        </div>

        {/* Highlighted ID Display Frame */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-white/90 backdrop-blur-xs rounded-2xl border border-rose-100/80 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2 h-8 rounded-full bg-gradient-to-b from-rose-400 to-purple-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                Código Pessoal
              </span>
              <span className="text-lg sm:text-xl font-mono font-black text-slate-800 tracking-wider block truncate">
                {personalId}
              </span>
            </div>
          </div>

          {/* Animated Copy Button with Drawn Heart */}
          <div className="shrink-0 flex items-center">
            <AnimatedCopyButton
              textToCopy={personalId}
              label="Copiar ID"
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        {/* Friendly explanation note */}
        <p className="text-[11px] text-slate-500 font-medium leading-relaxed flex items-center gap-1.5">
          <HeartHandshake className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>
            Envie este código para o seu amor conectar as contas no aplicativo e disputarem a rotina juntos!
          </span>
        </p>
      </div>
    </div>
  );
};
