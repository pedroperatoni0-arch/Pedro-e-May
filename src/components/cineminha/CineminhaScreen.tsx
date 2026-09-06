import React, { useState, useEffect, useCallback } from 'react';
import {
  UserAccount,
  ChatMessage,
  CoupleWatchSession,
  CineminhaMedia,
  CineminhaSyncPayload,
} from '../../types';
import { CineminhaApi } from '../../services/cineminhaApi';
import { callManager } from '../../services/callManager';
import { soundManager } from '../../utils/audio';
import { CineminhaIntroView } from './CineminhaIntroView';
import { CineminhaHeartAnimation } from './CineminhaHeartAnimation';
import { CineminhaSourceChoiceView } from './CineminhaSourceChoiceView';
import { CineminhaWebBrowser } from './CineminhaWebBrowser';
import { CineminhaDrivePicker } from './CineminhaDrivePicker';
import { CineminhaPlayer } from './CineminhaPlayer';
import { CineminhaChat } from './CineminhaChat';
import {
  ChevronLeft,
  Crown,
  Power,
  Film,
  AlertTriangle
} from 'lucide-react';

interface CineminhaScreenProps {
  currentUser: UserAccount;
  partner: UserAccount | null;
  messages: ChatMessage[];
  onSendMessage: (msg: Omit<ChatMessage, 'id'>) => Promise<boolean | void>;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const CineminhaScreen: React.FC<CineminhaScreenProps> = ({
  currentUser,
  partner,
  messages,
  onSendMessage,
  onClose,
  showToast,
}) => {
  const [session, setSession] = useState<CoupleWatchSession | null>(null);
  const [isStartingAnimation, setIsStartingAnimation] = useState<boolean>(false);
  const [isChoosingSource, setIsChoosingSource] = useState<boolean>(false);
  const [isWebBrowserOpen, setIsWebBrowserOpen] = useState<boolean>(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState<boolean>(false);
  const [showEndConfirm, setShowEndConfirm] = useState<boolean>(false);
  const [incomingSync, setIncomingSync] = useState<CineminhaSyncPayload | null>(null);

  // Helper to fetch current session from server
  const loadSession = useCallback(async () => {
    try {
      const res = await CineminhaApi.getSession();
      if (res.success && res.session) {
        setSession((prev) => {
          // If we locally started a session less than 6s ago, don't let a stale inactive response reset it
          if (prev?.active && !res.session?.active && Date.now() - (prev.updatedAt || 0) < 6000) {
            return prev;
          }
          return res.session || prev;
        });
      }
    } catch (err) {
      console.error('[CineminhaScreen] Error loading session:', err);
    }
  }, []);

  // Initial session load & polling recovery
  useEffect(() => {
    loadSession();
    const interval = setInterval(() => {
      loadSession();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadSession]);

  // Real-time couple event listeners
  useEffect(() => {
    const unsub = callManager.onCoupleEvent((event) => {
      console.log('[CineminhaScreen] Couple event:', event.type, event.payload);

      if (event.type === 'cineminha:started') {
        soundManager.playLevelUp();
        if (event.payload?.session) {
          setSession(event.payload.session);
        }
        showToast(`${event.payload?.starterName || 'Seu amor'} iniciou o Cineminha!`);
      } else if (event.type === 'cineminha:ended') {
        if (event.payload?.session) {
          setSession(event.payload.session);
        } else {
          setSession((prev) => (prev ? { ...prev, active: false } : null));
        }
        showToast('A sessão de Cineminha foi encerrada.');
      } else if (event.type === 'cineminha:sync') {
        const payload: CineminhaSyncPayload = event.payload;
        setIncomingSync(payload);

        // If media changed, update local session state
        if (payload.action === 'mediaChanged' && payload.media !== undefined) {
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  media: payload.media || null,
                  playback: {
                    ...prev.playback,
                    playing: false,
                    position: 0,
                  },
                }
              : null
          );
        }
      }
    });

    return () => {
      unsub();
    };
  }, [showToast]);

  // Handle "Iniciar" button clicked by current user
  const handleStartSession = async () => {
    soundManager.playPop();

    // Immediately create active session state so the view transition is 100% reliable
    const coupleId = partner ? [currentUser.id, partner.id].sort().join('_') : currentUser.id;
    const activeSession: CoupleWatchSession = {
      coupleId,
      active: true,
      hostUserId: currentUser.id,
      hostUsername: currentUser.username,
      media: session?.media || null,
      playback: session?.playback || {
        playing: false,
        position: 0,
        updatedAt: Date.now(),
      },
      quality: session?.quality || 'auto',
      updatedAt: Date.now(),
    };
    setSession(activeSession);
    setIsStartingAnimation(true);

    try {
      const res = await CineminhaApi.startSession();
      if (res.success && res.session) {
        setSession(res.session);
      }
    } catch (err) {
      console.error('[CineminhaScreen] Start session error:', err);
    }
  };

  // Called once heart animation finishes
  const handleHeartAnimationComplete = () => {
    setIsStartingAnimation(false);
  };

  // Handle media selection (Web or Google Drive)
  const handleSelectMedia = async (media: CineminhaMedia) => {
    soundManager.playPop();
    showToast(`Filme sincronizado: ${media.title}`);

    // Update locally
    setSession((prev) =>
      prev
        ? {
            ...prev,
            media,
            playback: {
              ...prev.playback,
              playing: false,
              position: 0,
            },
          }
        : null
    );

    // Sync to backend and partner
    await CineminhaApi.syncState({
      action: 'mediaChanged',
      media,
      position: 0,
      playing: false,
      clientTimestamp: Date.now(),
      partnerId: partner?.id,
    });
  };

  // End session for both partners
  const handleConfirmEndSession = async () => {
    setShowEndConfirm(false);
    soundManager.playPop();

    try {
      const res = await CineminhaApi.endSession();
      if (res.success && res.session) {
        setSession(res.session);
      } else {
        setSession((prev) => (prev ? { ...prev, active: false } : null));
      }
      showToast('Sessão encerrada com sucesso.');
    } catch (err) {
      console.error('[CineminhaScreen] End session error:', err);
    }
  };

  // Determine role
  const isHost = session?.hostUserId === currentUser.id || !session?.hostUserId;

  // 1. Show Heart Merging Animation
  if (isStartingAnimation) {
    return (
      <CineminhaHeartAnimation
        userAAvatar={currentUser.avatar}
        userBAvatar={partner?.avatar}
        userAName={currentUser.username}
        userBName={partner?.username || 'Amor'}
        onAnimationComplete={handleHeartAnimationComplete}
      />
    );
  }

  // 2. Show Intro View if session is not active
  if (!session?.active) {
    return (
      <CineminhaIntroView
        currentUser={currentUser}
        partner={partner}
        onStartSession={handleStartSession}
        onBack={onClose}
      />
    );
  }

  // 3. Choice screen: If host and (no media selected yet OR user requested to change source)
  if (isHost && (!session.media || isChoosingSource)) {
    return (
      <>
        <CineminhaSourceChoiceView
          onSelectWeb={() => setIsWebBrowserOpen(true)}
          onSelectDrive={() => setIsDrivePickerOpen(true)}
          onBack={() => {
            if (session.media) {
              setIsChoosingSource(false);
            } else {
              onClose();
            }
          }}
        />

        {/* Embedded Web Browser */}
        <CineminhaWebBrowser
          isOpen={isWebBrowserOpen}
          onClose={() => setIsWebBrowserOpen(false)}
          onSelectMedia={(m) => {
            handleSelectMedia(m);
            setIsWebBrowserOpen(false);
            setIsChoosingSource(false);
          }}
        />

        {/* Google Drive File Picker */}
        <CineminhaDrivePicker
          isOpen={isDrivePickerOpen}
          onClose={() => setIsDrivePickerOpen(false)}
          onSelectMedia={(m) => {
            handleSelectMedia(m);
            setIsDrivePickerOpen(false);
            setIsChoosingSource(false);
          }}
        />
      </>
    );
  }

  // 4. Active Cineminha Screen (YouTube Style: Player at Top + Chat Below)
  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-slate-950 text-white overflow-hidden">
      {/* Cineminha Header */}
      <div className="h-12 px-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Voltar para a tela inicial"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight font-display text-white truncate">
                Cineminha
              </span>
              {isHost ? (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0">
                  <Crown className="w-2.5 h-2.5" />
                  <span>Anfitrião</span>
                </span>
              ) : (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md shrink-0">
                  Sincronizado
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {partner ? `Com ${partner.username}` : 'Sessão privada'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {isHost && (
            <button
              onClick={() => setIsChoosingSource(true)}
              className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-sm shadow-rose-500/20"
            >
              <Film className="w-3 h-3" />
              <span>{session.media ? 'Trocar' : 'Escolher'}</span>
            </button>
          )}

          {isHost && (
            <button
              onClick={() => setShowEndConfirm(true)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition cursor-pointer"
              title="Encerrar sessão para o casal"
            >
              <Power className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Video Player (Pinned at Top) */}
      <CineminhaPlayer
        session={session}
        currentUser={currentUser}
        partner={partner}
        isHost={isHost}
        onOpenMediaSelector={() => setIsChoosingSource(true)}
        onSessionUpdated={setSession}
        showToast={showToast}
        incomingSyncPayload={incomingSync}
      />

      {/* Chat Area (Pinned Below Player) */}
      <CineminhaChat
        currentUser={currentUser}
        partner={partner}
        messages={messages}
        onSendMessage={onSendMessage}
      />

      {/* Embedded Web Browser Modal */}
      <CineminhaWebBrowser
        isOpen={isWebBrowserOpen}
        onClose={() => setIsWebBrowserOpen(false)}
        onSelectMedia={(m) => {
          handleSelectMedia(m);
          setIsWebBrowserOpen(false);
          setIsChoosingSource(false);
        }}
      />

      {/* Google Drive File Picker Modal */}
      <CineminhaDrivePicker
        isOpen={isDrivePickerOpen}
        onClose={() => setIsDrivePickerOpen(false)}
        onSelectMedia={(m) => {
          handleSelectMedia(m);
          setIsDrivePickerOpen(false);
          setIsChoosingSource(false);
        }}
      />

      {/* End Session Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h4 className="text-sm font-black text-white font-display">
              Encerrar Sessão do Cineminha?
            </h4>
            <p className="text-xs text-slate-400">
              A transmissão será pausada e finalizada para você e para {partner?.username || 'seu amor'}.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmEndSession}
                className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-rose-500/20"
              >
                Encerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
