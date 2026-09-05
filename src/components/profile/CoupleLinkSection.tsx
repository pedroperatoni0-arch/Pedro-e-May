import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAccount } from '../../types';
import { AuthApi } from '../../services/authApi';
import { soundManager } from '../../utils/audio';
import { callManager } from '../../services/callManager';
import {
  Heart,
  Link2,
  Unlink,
  AlertCircle,
  Phone,
  Video,
  Loader2,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CoupleLinkAnimation } from './CoupleLinkAnimation';

interface CoupleLinkSectionProps {
  user: UserAccount;
  partner: UserAccount | null;
  onLinkSuccess: (partner: UserAccount) => void;
  onUnlinkPartner: () => void;
  showToast: (msg: string) => void;
}

export const CoupleLinkSection: React.FC<CoupleLinkSectionProps> = ({
  user,
  partner,
  onLinkSuccess,
  onUnlinkPartner,
  showToast,
}) => {
  const [partnerIdInput, setPartnerIdInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentNudge, setSentNudge] = useState(false);
  const [pendingPartnerData, setPendingPartnerData] = useState<UserAccount | null>(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [copiedMyId, setCopiedMyId] = useState(false);

  // Copy current user's ID
  const handleCopyMyId = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(user.personalId);
      }
      setCopiedMyId(true);
      soundManager.playPop();
      showToast('Seu ID foi copiado com sucesso! 📋');
      setTimeout(() => setCopiedMyId(false), 2500);
    } catch {
      showToast(`Seu ID: ${user.personalId}`);
    }
  };

  // Perform Link
  const handleConfirmLink = async (targetId?: string) => {
    setErrorMessage(null);
    const idToLink = (targetId || partnerIdInput).trim().toUpperCase();

    if (!idToLink) {
      setErrorMessage('Por favor, digite o ID do parceiro(a).');
      return;
    }

    if (idToLink === user.personalId.trim().toUpperCase()) {
      setErrorMessage('Você não pode vincular sua própria conta. ❤️');
      soundManager.playPop();
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await AuthApi.linkPartner(idToLink);

      if (!result.success || !result.partner) {
        setErrorMessage(result.message || 'Erro ao vincular. Verifique o ID digitado.');
        soundManager.playPop();
        return;
      }

      // Success -> Trigger animation sequence
      setPendingPartnerData(result.partner);
      setIsLinking(true);
    } catch {
      setErrorMessage('Erro de conexão ao vincular parceiro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConfirmLink();
  };

  const handleAnimationComplete = () => {
    if (pendingPartnerData) {
      onLinkSuccess(pendingPartnerData);
      showToast(`Vínculo com ${pendingPartnerData.username} estabelecido! ❤️`);
    }
    setIsLinking(false);
    setPendingPartnerData(null);
    setPartnerIdInput('');
    setErrorMessage(null);
  };

  const handleSendLoveNudge = () => {
    soundManager.playPop();
    setSentNudge(true);
    confetti({
      particleCount: 35,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#f43f5e', '#ec4899', '#ffd700'],
    });
    showToast(`Carinho enviado para ${partner?.username}! ❤️✨`);
    setTimeout(() => setSentNudge(false), 3000);
  };

  const handleStartVoiceCall = async () => {
    if (!partner) return;
    const ok = await callManager.startCall(partner, 'audio');
    if (!ok) {
      // Handled inside callManager / error listener
    }
  };

  const handleStartVideoCall = async () => {
    if (!partner) return;
    const ok = await callManager.startCall(partner, 'video');
    if (!ok) {
      // Handled inside callManager / error listener
    }
  };

  const handleConfirmUnlink = async () => {
    soundManager.playPop();
    setShowUnlinkConfirm(false);
    try {
      await AuthApi.unlinkPartner();
      onUnlinkPartner();
      showToast('Vínculo desfeito com sucesso.');
    } catch {
      showToast('Erro ao desvincular.');
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
      {/* Dynamic Couple Link Fullscreen Animation Overlay */}
      {isLinking && pendingPartnerData && (
        <CoupleLinkAnimation
          user={user}
          partner={pendingPartnerData}
          onComplete={handleAnimationComplete}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
            <Heart className="w-4 h-4 fill-pink-500 text-pink-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 font-display">Vínculo de Casal</h3>
            <p className="text-[10px] text-slate-500">Conecte sua conta para sincronizar rotina e arena</p>
          </div>
        </div>

        {partner && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Conectado Online
          </span>
        )}
      </div>

      {/* Your Personal ID Card */}
      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Seu ID Público (DuoQuest)
          </span>
          <span className="text-sm font-black font-mono tracking-wider text-slate-800">
            {user.personalId}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyMyId}
            id="copy-my-id-btn"
            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Copiar meu ID"
          >
            {copiedMyId ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copiar ID</span>
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {partner ? (
          /* STATE: CONNECTED PARTNER VIEW */
          <motion.div
            key="connected-partner-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <div className="p-3.5 bg-gradient-to-br from-pink-50/70 via-rose-50/40 to-purple-50/60 rounded-2xl border border-pink-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-400 to-rose-400 text-white flex items-center justify-center text-2xl shadow-xs border-2 border-white">
                    {partner.avatar}
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800 font-display">
                      {partner.username}
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-pink-200/80 text-pink-800">
                      Nível {partner.level}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono font-medium block">
                    ID: {partner.personalId}
                  </span>
                </div>
              </div>

              {/* Quick Actions: Voice, Video, Love Nudge */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="profile-voice-call-btn"
                  onClick={handleStartVoiceCall}
                  className="p-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl transition shadow-xs cursor-pointer"
                  title="Fazer chamada de voz"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  id="profile-video-call-btn"
                  onClick={handleStartVideoCall}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl transition shadow-xs cursor-pointer"
                  title="Fazer chamada de vídeo"
                >
                  <Video className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleSendLoveNudge}
                  className={`p-2.5 rounded-xl transition active:scale-95 cursor-pointer shadow-xs ${
                    sentNudge
                      ? 'bg-pink-600 text-white'
                      : 'bg-gradient-to-tr from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600'
                  }`}
                  title="Enviar carinho"
                >
                  <Heart className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>

            {/* Unlink Action Trigger */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowUnlinkConfirm(true)}
                className="text-[11px] text-slate-400 hover:text-rose-600 transition flex items-center gap-1 cursor-pointer"
              >
                <Unlink className="w-3 h-3" />
                <span>Desvincular conta</span>
              </button>
            </div>

            {/* Unlink Confirmation Dialogue */}
            {showUnlinkConfirm && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-center"
              >
                <p className="text-xs font-bold text-slate-700">
                  Tem certeza que deseja desvincular de {partner.username}?
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={handleConfirmUnlink}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 cursor-pointer"
                  >
                    Sim, desvincular
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnlinkConfirm(false)}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : (
          /* STATE: UNLINKED / FORM VIEW */
          <motion.div
            key="unlinked-partner-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3.5"
          >
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="partner-id-input"
                  className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5"
                >
                  ID do parceiro(a)
                </label>
                <input
                  id="partner-id-input"
                  type="text"
                  value={partnerIdInput}
                  onChange={e => {
                    setPartnerIdInput(e.target.value.toUpperCase());
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Ex: 72QX-7KJ9"
                  className={`w-full px-4 py-3 rounded-2xl bg-slate-50/80 border text-xs font-mono font-bold uppercase tracking-wider placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-hidden transition-all ${
                    errorMessage
                      ? 'border-rose-400 bg-rose-50/30 text-rose-800'
                      : 'border-slate-200 focus:border-rose-400 focus:bg-white text-slate-800'
                  }`}
                />
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-rose-50 border border-rose-200/90 rounded-2xl flex items-start gap-2.5 text-rose-700 text-xs font-bold"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div className="space-y-1">
                    <p>{errorMessage}</p>
                    <p className="text-[10px] font-normal text-rose-600">
                      Dica: Para conectar dois celulares, o parceiro(a) precisa ter criado uma conta no app primeiro.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Direct Link Button */}
              <button
                type="submit"
                disabled={isSubmitting || !partnerIdInput.trim()}
                id="submit-link-partner-btn"
                className="w-full py-3 px-4 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-700 active:scale-98 text-white rounded-2xl text-xs font-black shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    <span>Vincular Contas de Casal</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
