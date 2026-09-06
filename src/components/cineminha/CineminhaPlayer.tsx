import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  CoupleWatchSession,
  CineminhaMedia,
  CineminhaQuality,
  CineminhaSyncPayload,
  UserAccount,
} from '../../types';
import { CineminhaApi } from '../../services/cineminhaApi';
import { soundManager } from '../../utils/audio';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Maximize,
  Minimize,
  MoreVertical,
  Film,
  RefreshCw,
  AlertCircle,
  Clock,
  Crown,
  Tv
} from 'lucide-react';

interface CineminhaPlayerProps {
  session: CoupleWatchSession;
  currentUser: UserAccount;
  partner: UserAccount | null;
  isHost: boolean;
  onOpenMediaSelector: () => void;
  onSessionUpdated: (updated: CoupleWatchSession) => void;
  showToast: (msg: string) => void;
  incomingSyncPayload?: CineminhaSyncPayload | null;
}

export const CineminhaPlayer: React.FC<CineminhaPlayerProps> = ({
  session,
  currentUser,
  partner,
  isHost,
  onOpenMediaSelector,
  onSessionUpdated,
  showToast,
  incomingSyncPayload,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(session.playback.playing);
  const [currentTime, setCurrentTime] = useState<number>(session.playback.position || 0);
  const [duration, setDuration] = useState<number>(session.media?.duration || 0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [selectedQuality, setSelectedQuality] = useState<CineminhaQuality>(session.quality || 'auto');
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);

  // Loop prevention flag
  const isRemoteSyncRef = useRef<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Reset controls hide timer on activity
  const handleUserActivity = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  };

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // --- 🎬 SYNCHRONIZATION: HANDLE INCOMING REMOTE EVENTS ---
  useEffect(() => {
    if (!incomingSyncPayload) return;

    console.log('[CineminhaPlayer] Processing incoming sync event:', incomingSyncPayload);
    const video = videoRef.current;
    isRemoteSyncRef.current = true;

    if (incomingSyncPayload.action === 'play') {
      setIsPlaying(true);
      if (video) {
        // Calculate timestamp drift
        const elapsed = (Date.now() - (incomingSyncPayload.clientTimestamp || Date.now())) / 1000;
        const targetPos = (incomingSyncPayload.position ?? 0) + Math.min(Math.max(elapsed, 0), 2.5);
        if (Math.abs(video.currentTime - targetPos) > 1.2) {
          video.currentTime = targetPos;
        }
        video.play().catch(() => {});
      }
      setSyncStatusText(`${incomingSyncPayload.username} deu Play ▶️`);
      setTimeout(() => setSyncStatusText(null), 2500);
    } else if (incomingSyncPayload.action === 'pause') {
      setIsPlaying(false);
      if (video) {
        if (incomingSyncPayload.position !== undefined && Math.abs(video.currentTime - incomingSyncPayload.position) > 1.2) {
          video.currentTime = incomingSyncPayload.position;
        }
        video.pause();
      }
      setSyncStatusText(`${incomingSyncPayload.username} pausou ⏸️`);
      setTimeout(() => setSyncStatusText(null), 2500);
    } else if (incomingSyncPayload.action === 'seek') {
      if (incomingSyncPayload.position !== undefined) {
        setCurrentTime(incomingSyncPayload.position);
        if (video) {
          video.currentTime = incomingSyncPayload.position;
        }
        setSyncStatusText(`${incomingSyncPayload.username} adiantou/voltou o vídeo ⏩`);
        setTimeout(() => setSyncStatusText(null), 2500);
      }
    } else if (incomingSyncPayload.action === 'qualityChanged') {
      if (incomingSyncPayload.quality) {
        setSelectedQuality(incomingSyncPayload.quality);
      }
    }

    // Release sync flag after DOM has updated
    setTimeout(() => {
      isRemoteSyncRef.current = false;
    }, 400);
  }, [incomingSyncPayload]);

  // --- 🎬 USER PLAYBACK ACTIONS (SYNCED WITH PARTNER) ---
  const handlePlayToggle = async () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);

    const video = videoRef.current;
    const currentPos = video ? video.currentTime : currentTime;

    if (video) {
      if (nextState) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }

    soundManager.playPop();

    // Broadcast sync event to partner
    await CineminhaApi.syncState({
      action: nextState ? 'play' : 'pause',
      position: currentPos,
      playing: nextState,
      clientTimestamp: Date.now(),
      partnerId: partner?.id,
    });
  };

  const handleSeekDelta = async (deltaSeconds: number) => {
    const video = videoRef.current;
    const current = video ? video.currentTime : currentTime;
    const target = Math.max(0, Math.min(current + deltaSeconds, duration || 99999));

    setCurrentTime(target);
    if (video) {
      video.currentTime = target;
    }

    soundManager.playPop();

    await CineminhaApi.syncState({
      action: 'seek',
      position: target,
      playing: isPlaying,
      clientTimestamp: Date.now(),
      partnerId: partner?.id,
    });
  };

  const handleProgressBarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);

    const video = videoRef.current;
    if (video) {
      video.currentTime = target;
    }

    await CineminhaApi.syncState({
      action: 'seek',
      position: target,
      playing: isPlaying,
      clientTimestamp: Date.now(),
      partnerId: partner?.id,
    });
  };

  const handleChangeQuality = async (q: CineminhaQuality) => {
    setSelectedQuality(q);
    setShowQualityMenu(false);
    showToast(`Qualidade alterada para: ${q.toUpperCase()}`);

    await CineminhaApi.syncState({
      action: 'qualityChanged',
      quality: q,
      clientTimestamp: Date.now(),
      partnerId: partner?.id,
    });
  };

  // Video element event listeners
  const onTimeUpdate = () => {
    if (videoRef.current && !isRemoteSyncRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || session.media?.duration || 0);
      setIsLoading(false);
      setHasError(false);
    }
  };

  const [iframeKey, setIframeKey] = useState<number>(0);

  const embedIframeSrc = React.useMemo(() => {
    if (!session.media) return '';
    if (session.media.sourceType === 'drive') {
      return session.media.url;
    }
    // Web source: use playerUrl if available (e.g. plenoflu, vaiquecol), otherwise page url
    const rawTarget = session.media.playerUrl || session.media.url;
    let target = rawTarget;
    if (!/^[a-z][a-z\d+.-]*:/i.test(rawTarget)) {
      try {
        target = new URL(rawTarget, session.media.url).toString();
      } catch {
        target = rawTarget;
      }
    }
    if (target.startsWith('/api/cineminha/web-proxy')) {
      return target;
    }
    let proxied = `/api/cineminha/web-proxy?url=${encodeURIComponent(target)}`;
    if (session.media.url && session.media.playerUrl && session.media.url !== session.media.playerUrl) {
      proxied += `&ref=${encodeURIComponent(session.media.url)}`;
    }
    return proxied;
  }, [session.media]);

  const handleReloadPlayer = () => {
    soundManager.playPop();
    setIframeKey((prev) => prev + 1);
    showToast('Recarregando player do filme...');
  };

  const isEmbedOrDrive =
    session.media?.sourceType === 'drive' ||
    session.media?.sourceType === 'site' ||
    Boolean(session.media?.url && !session.media.url.match(/\.(mp4|webm|ogg)(\?.*)?$/i));

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      className={`relative w-full bg-slate-950 select-none overflow-hidden group ${
        isFullscreen ? 'h-screen' : 'aspect-video max-h-[36vh] border-b border-slate-800'
      }`}
    >
      {/* 1. STATE: NO MEDIA SELECTED */}
      {!session.media && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-white">
          {isHost ? (
            <div className="space-y-4 max-w-xs">
              <p className="text-sm font-bold text-white font-display">
                Nenhum filme selecionado
              </p>
              <button
                onClick={onOpenMediaSelector}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-lg active:scale-95 flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Escolher Filme</span>
              </button>
            </div>
          ) : (
            <div className="max-w-xs animate-pulse">
              <p className="text-sm font-medium text-rose-200 font-display">
                Seu amor está sincronizando o filme ou série…
              </p>
            </div>
          )}
        </div>
      )}

      {/* 2. STATE: MEDIA PRESENT */}
      {session.media && (
        <>
          {/* Direct HTML5 Video Player */}
          {!isEmbedOrDrive ? (
            <video
              ref={videoRef}
              src={session.media.url}
              poster={session.media.poster}
              playsInline
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => setIsLoading(false)}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            /* Google Drive / Embed Iframe Player */
            <div className="w-full h-full relative bg-black flex items-center justify-center">
              <iframe
                key={`${embedIframeSrc}_${iframeKey}`}
                src={embedIframeSrc}
                title={session.media.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox allow-modals"
                allowFullScreen
                className="w-full h-full border-0 pointer-events-auto bg-black"
              />

              {/* Floating Top & Action Bar for Embedded Video */}
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-20">
                <div className="flex items-center gap-2 max-w-[65%]">
                  <div className="bg-slate-950/85 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-800 text-[10px] font-bold text-white truncate flex items-center gap-1.5 shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                    <span className="truncate">{session.media.title}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pointer-events-auto">
                  <button
                    onClick={handleReloadPlayer}
                    className="p-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] transition cursor-pointer shadow-md active:scale-95"
                    title="Recarregar player"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  {isHost && (
                    <button
                      onClick={onOpenMediaSelector}
                      className="px-2.5 py-1 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-[10px] transition cursor-pointer shadow-md active:scale-95 flex items-center gap-1"
                    >
                      <Film className="w-3 h-3" />
                      <span>Trocar</span>
                    </button>
                  )}

                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] transition cursor-pointer shadow-md active:scale-95"
                    title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  >
                    {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading Spinner Indicator */}
          {isLoading && !isEmbedOrDrive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
              <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error Notice */}
          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/90 text-center text-rose-300 gap-2">
              <AlertCircle className="w-8 h-8 text-rose-400" />
              <p className="text-xs font-bold">Não foi possível carregar este filme.</p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                A URL pode ter expirado ou o site não permite reprodução direta.
              </p>
              {isHost && (
                <button
                  onClick={onOpenMediaSelector}
                  className="mt-1 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Trocar Filme
                </button>
              )}
            </div>
          )}

          {/* Sync Status Banner */}
          {syncStatusText && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 border border-rose-500/40 text-rose-300 px-3 py-1 rounded-full text-[11px] font-bold shadow-lg backdrop-blur-md animate-fade-in flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>{syncStatusText}</span>
            </div>
          )}

          {/* Overlay Controls (For HTML5 Direct Video) */}
          {!isEmbedOrDrive && (
            <div
              className={`absolute inset-0 z-20 flex flex-col justify-between p-3 transition-opacity duration-300 ${
                showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
              } bg-gradient-to-t from-black/80 via-transparent to-black/70`}
            >
              {/* Top Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-extrabold uppercase shrink-0 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                    Sincronizado
                  </span>
                  <span className="text-xs font-bold text-white truncate drop-shadow-md">
                    {session.media.title}
                  </span>
                </div>

                {/* Three dots menu (⋮) */}
                <div className="relative">
                  <button
                    onClick={() => setShowQualityMenu(!showQualityMenu)}
                    className="p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Quality / Info Popover */}
                  {showQualityMenu && (
                    <div className="absolute right-0 top-8 z-40 w-44 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl space-y-1 text-xs text-white animate-fade-in">
                      <p className="text-[10px] font-extrabold text-slate-400 uppercase px-2 py-1">
                        Qualidade de Vídeo
                      </p>
                      {(['auto', '1080p', '720p', '480p'] as CineminhaQuality[]).map((q) => (
                        <button
                          key={q}
                          onClick={() => handleChangeQuality(q)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg transition flex items-center justify-between cursor-pointer ${
                            selectedQuality === q
                              ? 'bg-rose-500/20 text-rose-300 font-bold'
                              : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span>
                            {q === 'auto'
                              ? 'Automática'
                              : q === '1080p'
                              ? 'Alta (1080p)'
                              : q === '720p'
                              ? 'Média (720p)'
                              : 'Econômica (480p)'}
                          </span>
                          {selectedQuality === q && <span className="text-rose-400 text-xs">✓</span>}
                        </button>
                      ))}

                      {isHost && (
                        <div className="border-t border-slate-800 pt-1 mt-1">
                          <button
                            onClick={() => {
                              setShowQualityMenu(false);
                              onOpenMediaSelector();
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-slate-800 transition font-bold cursor-pointer flex items-center gap-1.5"
                          >
                            <Film className="w-3 h-3" />
                            <span>Trocar Filme</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Center Controls (Play, -10s, +10s) */}
              <div className="flex items-center justify-center gap-5">
                <button
                  onClick={() => handleSeekDelta(-10)}
                  className="p-2 rounded-full bg-black/50 text-white/90 hover:text-white hover:scale-110 active:scale-95 transition cursor-pointer flex items-center justify-center"
                  title="Voltar 10s"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span className="text-[9px] font-bold ml-0.5">-10s</span>
                </button>

                <button
                  onClick={handlePlayToggle}
                  className="w-13 h-13 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/40 hover:scale-105 active:scale-95 transition cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={() => handleSeekDelta(10)}
                  className="p-2 rounded-full bg-black/50 text-white/90 hover:text-white hover:scale-110 active:scale-95 transition cursor-pointer flex items-center justify-center"
                  title="Adiantar 10s"
                >
                  <span className="text-[9px] font-bold mr-0.5">+10s</span>
                  <RotateCw className="w-5 h-5" />
                </button>
              </div>

              {/* Bottom Bar (Progress Bar, Timers, Fullscreen) */}
              <div className="space-y-1.5">
                {/* Scrubbable Progress Bar */}
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.5}
                    value={currentTime}
                    onChange={handleProgressBarChange}
                    className="w-full accent-rose-500 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono font-bold text-white/90">
                  <div className="flex items-center gap-1.5">
                    <span>{formatTime(currentTime)}</span>
                    <span className="text-white/40">/</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isHost && (
                      <button
                        onClick={onOpenMediaSelector}
                        className="text-[10px] text-rose-300 hover:text-white bg-rose-500/20 px-2 py-0.5 rounded font-sans transition cursor-pointer"
                      >
                        Trocar
                      </button>
                    )}
                    <button
                      onClick={toggleFullscreen}
                      className="p-1 text-white/80 hover:text-white hover:scale-110 transition cursor-pointer"
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
