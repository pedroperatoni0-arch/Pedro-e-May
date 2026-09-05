import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  AlertCircle,
  Radio,
  Video,
  VideoOff,
  SwitchCamera,
  CameraOff,
} from 'lucide-react';

interface RealVoiceCallModalProps {
  session: RealCallSession;
  onEndCall?: () => void;
  onMuteToggle?: () => void;
  onSpeakerToggle?: () => void;
  onCameraToggle?: () => void;
  onSwitchCamera?: () => void;
  onAcceptCall?: () => void;
  onRejectCall?: () => void;
}

export const RealVoiceCallModal: React.FC<RealVoiceCallModalProps> = ({
  session,
  onEndCall,
  onMuteToggle,
  onSpeakerToggle,
  onCameraToggle,
  onSwitchCamera,
  onAcceptCall,
  onRejectCall,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isVideo = session.callType === 'video';

  const resetHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setControlsVisible(true);
    hideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
  }, []);

  const toggleControls = () => {
    if (controlsVisible) {
      setControlsVisible(false);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    } else {
      resetHideTimer();
    }
  };

  useEffect(() => {
    if (isVideo && (session.state === 'CONNECTED' || session.state === 'CONNECTING')) {
      resetHideTimer();
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [isVideo, session.state, resetHideTimer]);

  // Synchronize WebRTC MediaStreams into HTMLVideoElements
  useEffect(() => {
    if (!isVideo || session.state === 'IDLE') return;

    const bindStreams = () => {
      const localStream = callManager.getLocalStream();
      const remoteStream = callManager.getRemoteVideoStream() || callManager.getRemoteStream();

      if (localVideoRef.current && localStream && localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(() => {});
      }

      if (remoteVideoRef.current && remoteStream && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    bindStreams();
    const interval = setInterval(bindStreams, 500);
    return () => clearInterval(interval);
  }, [isVideo, session.state, session.isCameraOff]);

  if (session.state === 'IDLE') return null;

  const handleEnd = onEndCall || (() => callManager.endCall());
  const handleCancel = () => callManager.cancelCall();
  const handleMute = onMuteToggle || (() => callManager.toggleMute());
  const handleSpeaker = onSpeakerToggle || (() => callManager.toggleSpeaker());
  const handleCameraToggle = onCameraToggle || (() => callManager.toggleCamera());
  const handleSwitchCamera = onSwitchCamera || (() => callManager.switchCamera());
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

  // ==========================================
  // 1. VIDEO CALL INTERFACE (CONNECTED / ACTIVE)
  // ==========================================
  if (isVideo && (isConnected || isConnecting)) {
    return (
      <AnimatePresence>
        <motion.div
          id="real-video-call-overlay"
          ref={stageRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={toggleControls}
          className="fixed inset-0 z-50 bg-black flex flex-col justify-between text-white select-none overflow-hidden cursor-pointer"
        >
          {/* Main Stage: Remote Partner Video Stream */}
          <div className="relative w-full h-full flex-1 min-h-0 bg-slate-950 flex items-center justify-center overflow-hidden">
            {/* The Remote Video Element - Muted locally to avoid double audio since callManager remoteAudio plays crystal-clear Opus sound */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
              onLoadedMetadata={() => remoteVideoRef.current?.play().catch(() => {})}
              onCanPlay={() => remoteVideoRef.current?.play().catch(() => {})}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                session.isPartnerCameraOff ? 'opacity-0' : 'opacity-100'
              }`}
            />

            {/* Remote Partner Camera Off or Connecting Placeholder */}
            {(session.isPartnerCameraOff || (isConnecting && !callManager.getRemoteVideoStream())) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md p-6 text-center z-10 pointer-events-none">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-purple-500 via-pink-500 to-rose-500 flex items-center justify-center text-5xl shadow-2xl border-4 border-white/20 mb-4 animate-pulse">
                  {session.partner?.avatar || '❤️'}
                </div>
                <p className="text-xs text-rose-300/90 font-medium max-w-xs">
                  {isConnecting
                    ? 'Conectando sinal em tempo real...'
                    : 'A câmera do seu amor está temporariamente desligada.'}
                </p>
                {isConnecting && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] text-purple-200">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    <span>Otimizando áudio e vídeo...</span>
                  </div>
                )}
              </div>
            )}

            {/* Top Bar Floating Header: Duration & Info only (NO name or ID display as requested) */}
            <div className="absolute top-0 left-0 right-0 p-4 pt-6 bg-gradient-to-b from-black/60 via-black/20 to-transparent flex items-center justify-between z-20 pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold tracking-wider">
                    {isConnected ? formatDuration(session.durationSeconds) : 'Conectando...'}
                  </span>
                </div>
              </div>

              {/* Partner Muted Badge */}
              {session.isPartnerMuted && (
                <div className="px-2.5 py-1 rounded-full bg-amber-500/80 backdrop-blur-md text-[10px] font-black text-white flex items-center gap-1">
                  <MicOff className="w-3 h-3" />
                  <span>Parceiro mudo</span>
                </div>
              )}
            </div>

            {/* Floating Picture-in-Picture (PIP) for Local User Video:
                - Initial Position: Bottom-Right corner
                - Smooth transition when controls show/hide: moves up and enlarges when controls visible, moves down and shrinks when hidden
                - Fully draggable with safe boundary constraints */}
            <motion.div
              layout
              drag
              dragConstraints={stageRef}
              dragElastic={0.08}
              dragMomentum={false}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              onClick={(e) => {
                e.stopPropagation();
                resetHideTimer();
              }}
              className={`absolute right-4 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/40 bg-slate-900 z-30 flex items-center justify-center cursor-grab active:cursor-grabbing transition-[bottom,width,height] duration-300 ${
                controlsVisible
                  ? 'bottom-20 w-28 h-40 sm:w-32 sm:h-44'
                  : 'bottom-4 w-24 h-34 sm:w-26 sm:h-38'
              }`}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ transform: 'scaleX(-1) translateZ(0)', WebkitTransform: 'scaleX(-1) translateZ(0)' }}
                onLoadedMetadata={() => localVideoRef.current?.play().catch(() => {})}
                onCanPlay={() => localVideoRef.current?.play().catch(() => {})}
                className={`w-full h-full object-cover pointer-events-none ${
                  session.isCameraOff ? 'hidden' : 'block'
                }`}
              />

              {/* Local Camera Off Overlay */}
              {session.isCameraOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/95 text-slate-300 p-2 text-center pointer-events-none">
                  <CameraOff className="w-6 h-6 text-rose-400 mb-1" />
                  <span className="text-[9px] font-bold">Câmera desligada</span>
                </div>
              )}

              {/* Quick Flip Camera Icon on PIP */}
              {!session.isCameraOff && (
                <button
                  type="button"
                  id="pip-switch-camera-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSwitchCamera();
                    resetHideTimer();
                  }}
                  className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border border-white/20 transition active:scale-95 cursor-pointer"
                  title="Inverter Câmera (Frontal / Traseira)"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </motion.div>
          </div>

          {/* Minimalist Control Bar with Auto-Hide:
              - Compact horizontal balloon container [ 🎤 ] [ 📹 ] [ 🔄 ] [ 🔊 ]
              - Separated circular hangup button [ 📞 ]
              - Automatically disappears after 5 seconds of inactivity */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-5 left-0 right-0 px-4 flex items-center justify-center gap-3 z-30 pointer-events-auto"
              >
                {/* Horizontal Control Balloon */}
                <div className="bg-slate-900/85 backdrop-blur-xl border border-white/15 px-3 py-2 rounded-full flex items-center gap-2.5 shadow-2xl">
                  {/* Mic Toggle */}
                  <button
                    type="button"
                    id="toggle-mic-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMute();
                      resetHideTimer();
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer ${
                      session.isMuted
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                    title={session.isMuted ? 'Desmutar Microfone' : 'Silenciar Microfone'}
                  >
                    {session.isMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
                  </button>

                  {/* Camera Toggle */}
                  <button
                    type="button"
                    id="toggle-cam-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCameraToggle();
                      resetHideTimer();
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer ${
                      session.isCameraOff
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                    title={session.isCameraOff ? 'Ligar Câmera' : 'Desligar Câmera'}
                  >
                    {session.isCameraOff ? <VideoOff className="w-4.5 h-4.5" /> : <Video className="w-4.5 h-4.5" />}
                  </button>

                  {/* Switch Camera (Front/Rear) */}
                  <button
                    type="button"
                    id="switch-cam-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSwitchCamera();
                      resetHideTimer();
                    }}
                    className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
                    title="Inverter Câmera (Frontal / Traseira)"
                  >
                    <SwitchCamera className="w-4.5 h-4.5" />
                  </button>

                  {/* Speaker Toggle */}
                  <button
                    type="button"
                    id="toggle-speaker-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeaker();
                      resetHideTimer();
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer ${
                      !session.isSpeakerOn
                        ? 'bg-amber-600/80 text-white'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                    title={session.isSpeakerOn ? 'Silenciar Áudio' : 'Ativar Áudio'}
                  >
                    {session.isSpeakerOn ? <Volume2 className="w-4.5 h-4.5" /> : <VolumeX className="w-4.5 h-4.5" />}
                  </button>
                </div>

                {/* Separated Circular Hangup Button */}
                <button
                  type="button"
                  id="end-real-call-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEnd();
                  }}
                  className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 transition cursor-pointer"
                  title="Encerrar Chamada"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    );
  }

  // =========================================================================
  // 2. STANDARD OVERLAY (VOICE CALLS OR RINGING/CALLING STAGE FOR ALL CALLS)
  // =========================================================================
  return (
    <AnimatePresence>
      <motion.div
        id="real-voice-call-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between text-white p-6 select-none overflow-hidden"
      >
        {/* Soft Background Glowing Orbs */}
        <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
          isVideo ? 'bg-purple-500/20' : 'bg-rose-500/15'
        }`} />
        <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Bar Header */}
        <div className="pt-4 flex flex-col items-center justify-center text-center z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md mb-2 shadow-xs">
            {isVideo ? (
              <Video
                className={`w-3.5 h-3.5 ${
                  isConnected
                    ? 'text-purple-400 animate-pulse'
                    : isCalling || isIncoming
                    ? 'text-purple-400 animate-bounce'
                    : 'text-slate-400'
                }`}
              />
            ) : (
              <Radio
                className={`w-3.5 h-3.5 ${
                  isConnected
                    ? 'text-emerald-400 animate-pulse'
                    : isCalling || isIncoming
                    ? 'text-rose-400 animate-bounce'
                    : 'text-slate-400'
                }`}
              />
            )}
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-200">
              {isConnected
                ? isVideo
                  ? 'Chamada de Vídeo em Tempo Real'
                  : 'Chamada de Voz em Tempo Real'
                : isIncoming
                ? isVideo
                  ? 'Chamada de Vídeo Recebida'
                  : 'Chamada de Voz Recebida'
                : isCalling
                ? isVideo
                  ? 'Iniciando Chamada de Vídeo...'
                  : 'Ligando para o Parceiro(a)...'
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

        {/* Center Main Stage (Avatar & Pulsing Rings) */}
        <div className="flex-1 flex flex-col items-center justify-center z-10 my-6">
          <div className="relative flex items-center justify-center">
            {/* Animated Pulsing Rings */}
            {(isIncoming || isCalling || isConnecting) && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.45, 1], opacity: [0.35, 0, 0.35] }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  className={`absolute w-44 h-44 rounded-full border-2 ${
                    isVideo ? 'border-purple-400/40' : 'border-rose-400/40'
                  }`}
                />
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2.2, delay: 0.4, ease: 'easeInOut' }}
                  className={`absolute w-36 h-36 rounded-full ${
                    isVideo ? 'bg-purple-500/20' : 'bg-rose-500/20'
                  }`}
                />
              </>
            )}

            {/* Avatar Circle */}
            <div className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-3xl flex items-center justify-center text-5xl sm:text-6xl shadow-2xl border-4 border-white/25 ${
              isVideo
                ? 'bg-gradient-to-tr from-purple-600 via-pink-600 to-rose-500'
                : 'bg-gradient-to-tr from-rose-500 via-pink-500 to-purple-600'
            }`}>
              {session.partner?.avatar || '❤️'}
            </div>
          </div>

          {/* Status Label or Audio Waveform */}
          <div className="mt-8 text-center min-h-[48px] flex flex-col items-center justify-center">
            {isCalling && (
              <p className="text-sm font-bold text-slate-300 animate-pulse">
                {isVideo ? 'Chamando com vídeo...' : 'Chamando...'}
              </p>
            )}

            {isIncoming && (
              <p className={`text-sm font-bold ${isVideo ? 'text-purple-300' : 'text-rose-300'}`}>
                {isVideo
                  ? 'Toque em Aceitar para iniciar a conversa com vídeo 📹'
                  : 'Toque em Aceitar para iniciar a conversa por voz ❤️'}
              </p>
            )}

            {isConnecting && (
              <div className="flex items-center gap-2 text-sm font-bold text-purple-300">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                <span>Conectando canal de comunicação...</span>
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
                  title="Recusar Chamada"
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
                  className={`w-16 h-16 rounded-full active:scale-95 text-white flex items-center justify-center shadow-lg transition-transform animate-pulse cursor-pointer ${
                    isVideo
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/40'
                      : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/40'
                  }`}
                  title="Aceitar Chamada"
                >
                  {isVideo ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
                </button>
                <span className={`text-xs font-bold ${isVideo ? 'text-purple-300' : 'text-emerald-300'}`}>
                  Aceitar
                </span>
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
                title="Cancelar Chamada"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs font-bold text-rose-300">Cancelar</span>
            </div>
          )}

          {/* 3. ACTIVE CONNECTED VOICE CALL ACTIONS */}
          {isConnected && !isVideo && (
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
