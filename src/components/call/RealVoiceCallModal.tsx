import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RealCallSession } from '../../types';
import { callManager } from '../../services/callManager';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Heart,
  Sparkles,
  AlertCircle,
  Radio,
} from 'lucide-react';

interface RealVoiceCallModalProps {
  session: RealCallSession;
  onEndCall?: () => void;
  onMuteToggle?: () => void;
  onSpeakerToggle?: () => void;
  onAcceptCall?: () => void;
  onRejectCall?: () => void;
}

export const RealVoiceCallModal: React.FC<RealVoiceCallModalProps> = ({
  session,
  onEndCall,
  onMuteToggle,
  onSpeakerToggle,
  onAcceptCall,
  onRejectCall,
}) => {
  if (session.state === 'IDLE') return null;

  const handleEnd = onEndCall || (() => callManager.endCall());
  const handleCancel = () => callManager.cancelCall();
  const handleMute = onMuteToggle || (() => callManager.toggleMute());
  const handleSpeaker = onSpeakerToggle || (() => callManager.toggleSpeaker());
  const handleAccept = onAcceptCall || (() => callManager.acceptCall());
  const handleReject = onRejectCall || (() => callManager.rejectCall());

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isIncoming = session.state === 'RINGING';
  const isCalling = session.state === 'CALLING';
  const isConnecting = session.state === 'CONNECTING';
  const isConnected = session.state === 'CONNECTED';
  const isEnded =
    session.state === 'ENDED' ||
    session.state === 'REJECTED' ||
    session.state === 'MISSED' ||
    session.state === 'FAILED';

  return (
    <AnimatePresence>
      <motion.div
        id="real-voice-call-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col justify-between text-white p-6 select-none overflow-hidden"
      >
        {/* Soft Background Glowing Orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Bar Header */}
        <div className="pt-4 flex flex-col items-center justify-center text-center z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md mb-2 shadow-xs">
            <Radio
              className={`w-3.5 h-3.5 ${
                isConnected
                  ? 'text-emerald-400 animate-pulse'
                  : isCalling || isIncoming
                  ? 'text-rose-400 animate-bounce'
                  : 'text-slate-400'
              }`}
            />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-200">
              {isConnected
                ? 'Chamada de Voz em Tempo Real'
                : isIncoming
                ? 'Chamada de Voz Recebida'
                : isCalling
                ? 'Ligando para o Parceiro(a)...'
                : isConnecting
                ? 'Negociando Conexão...'
                : 'Status da Chamada'}
            </span>
          </div>

          <h2 className="text-xl font-black text-white font-display tracking-tight mt-1">
            {session.partner?.username || 'Parceiro(a)'}
          </h2>
          <p className="text-xs font-mono font-bold text-rose-300/80">
            {session.partner?.personalId || ''}
          </p>

          {/* Connected Duration Timer */}
          {isConnected && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-2 text-2xl font-black font-mono tracking-wider text-white"
            >
              {formatDuration(session.durationSeconds)}
            </motion.div>
          )}

          {/* Partner muted indicator */}
          {isConnected && session.isPartnerMuted && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-[10px] font-bold text-amber-300"
            >
              Microfone do parceiro(a) está silenciado
            </motion.div>
          )}
        </div>

        {/* Center Main Stage (Avatar & Sound Waves) */}
        <div className="flex-1 flex flex-col items-center justify-center z-10 my-6">
          <div className="relative flex items-center justify-center">
            {/* Animated Pulsing Rings */}
            {(isIncoming || isCalling || isConnecting) && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.45, 1], opacity: [0.35, 0, 0.35] }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  className="absolute w-44 h-44 rounded-full border-2 border-rose-400/40"
                />
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2.2, delay: 0.4, ease: 'easeInOut' }}
                  className="absolute w-36 h-36 rounded-full bg-rose-500/20"
                />
              </>
            )}

            {/* Avatar Circle */}
            <div className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-tr from-rose-500 via-pink-500 to-purple-600 flex items-center justify-center text-5xl sm:text-6xl shadow-2xl border-4 border-white/25">
              {session.partner?.avatar || '❤️'}
            </div>
          </div>

          {/* Status Label or Audio Waveform */}
          <div className="mt-8 text-center min-h-[48px] flex flex-col items-center justify-center">
            {isCalling && (
              <p className="text-sm font-bold text-slate-300 animate-pulse">
                Chamando...
              </p>
            )}

            {isIncoming && (
              <p className="text-sm font-bold text-rose-300">
                Toque em Aceitar para iniciar a conversa por voz ❤️
              </p>
            )}

            {isConnecting && (
              <div className="flex items-center gap-2 text-sm font-bold text-purple-300">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                <span>Conectando áudio...</span>
              </div>
            )}

            {isConnected && (
              <div className="flex flex-col items-center gap-2">
                {/* Visual Audio Waveform */}
                <div className="flex items-center gap-1.5 h-8 px-5 py-2 bg-white/10 rounded-full backdrop-blur-md border border-white/10">
                  {[35, 65, 85, 55, 95, 70, 40, 80, 90, 45].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: session.isMuted ? 4 : [8, h * 0.3, 8],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.5 + (i % 4) * 0.15,
                        ease: 'easeInOut',
                      }}
                      className={`w-1 rounded-full ${
                        session.isMuted
                          ? 'bg-slate-500'
                          : 'bg-gradient-to-t from-rose-400 to-pink-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-bold text-slate-300">
                  {session.isMuted ? 'Seu microfone está mudo' : 'Microfone ativo'}
                </span>
              </div>
            )}

            {isEnded && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 px-4 py-2 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-xs font-bold text-rose-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>{session.errorMessage || 'Chamada encerrada.'}</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom Interactive Controls Bar */}
        <div className="pb-6 pt-2 z-10">
          {/* 1. INCOMING CALL ACTIONS */}
          {isIncoming && (
            <div className="flex items-center justify-around max-w-xs mx-auto">
              {/* Reject Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  id="reject-call-btn"
                  onClick={handleReject}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform cursor-pointer"
                  title="Recusar"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-xs font-bold text-rose-300">Recusar</span>
              </div>

              {/* Accept Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  id="accept-call-btn"
                  onClick={handleAccept}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 transition-transform animate-pulse cursor-pointer"
                  title="Aceitar"
                >
                  <Phone className="w-7 h-7" />
                </button>
                <span className="text-xs font-bold text-emerald-300">Aceitar</span>
              </div>
            </div>
          )}

          {/* 2. OUTGOING CALLING / CONNECTING ACTIONS */}
          {(isCalling || isConnecting) && (
            <div className="flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                id="cancel-call-btn"
                onClick={handleCancel}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform cursor-pointer"
                title="Cancelar"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs font-bold text-rose-300">Cancelar</span>
            </div>
          )}

          {/* 3. ACTIVE CONNECTED CALL ACTIONS */}
          {isConnected && (
            <div className="flex items-center justify-around max-w-sm mx-auto">
              {/* Mic Mute Button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  id="toggle-mic-btn"
                  onClick={handleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md ${
                    session.isMuted
                      ? 'bg-rose-500 text-white shadow-rose-500/30'
                      : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={session.isMuted ? 'Desmutar' : 'Silenciar'}
                >
                  {session.isMuted ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
                <span className="text-[11px] font-bold text-slate-300">
                  {session.isMuted ? 'Mudo' : 'Microfone'}
                </span>
              </div>

              {/* End Call Button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  id="end-real-call-btn"
                  onClick={handleEnd}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-rose-600/50 transition-transform cursor-pointer"
                  title="Encerrar"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-[11px] font-black text-rose-300">Encerrar</span>
              </div>

              {/* Speakerphone Button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  id="toggle-speaker-btn"
                  onClick={handleSpeaker}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md ${
                    !session.isSpeakerOn
                      ? 'bg-slate-700 text-slate-400'
                      : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={session.isSpeakerOn ? 'Silenciar Áudio' : 'Ativar Áudio'}
                >
                  {session.isSpeakerOn ? (
                    <Volume2 className="w-6 h-6" />
                  ) : (
                    <VolumeX className="w-6 h-6" />
                  )}
                </button>
                <span className="text-[11px] font-bold text-slate-300">
                  {session.isSpeakerOn ? 'Áudio' : 'Mudo'}
                </span>
              </div>
            </div>
          )}

          {/* 4. ENDED STATE (Auto closing) */}
          {isEnded && (
            <div className="text-center">
              <span className="text-xs text-slate-400 font-medium">
                Finalizando...
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
