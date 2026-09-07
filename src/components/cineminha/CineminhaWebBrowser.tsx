import React, { useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, X, Search, RotateCw, Film } from 'lucide-react';
import { CineminhaMedia } from '../../types';
import { getBrowserAdapter } from '../../services/cineminha/browserAdapter';
import { EXTERNAL_PLAYER_CAPABILITIES } from '../../services/cineminha/mediaSource';

interface CineminhaWebBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (media: CineminhaMedia) => void;
}

export const CineminhaWebBrowser: React.FC<CineminhaWebBrowserProps> = ({
  isOpen,
  onClose,
  onSelectMedia,
}) => {
  const [hasNavigated, setHasNavigated] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>('');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [browserStatus, setBrowserStatus] = useState<string | null>(null);
  const [mediaReferenceUrl, setMediaReferenceUrl] = useState<string>('');

  // History stack with pointer for Back and Forward navigation
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const navigateTo = useCallback((destinationUrl: string, addToHistory = true) => {
    setCurrentUrl(destinationUrl);
    setSearchInput(destinationUrl);
    setIsLoading(true);
    setHasNavigated(true);
    if (addToHistory) {
      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        next.push(destinationUrl);
        return next;
      });
      setHistoryIndex((prev) => prev + 1);
    }
  }, [historyIndex]);

  const handleGoToUrl = useCallback(async (target: string) => {
    const raw = target.trim();
    if (!raw) return;

    let destinationUrl = '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      destinationUrl = raw;
    } else if (raw.includes('.') && !raw.includes(' ')) {
      destinationUrl = `https://${raw}`;
    } else {
      // Search on Google
      destinationUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
    }

    setPageTitle(raw);
    navigateTo(destinationUrl, true);
    const result = await getBrowserAdapter().open(destinationUrl);
    setBrowserStatus(
      result.opened
        ? result.mode === 'custom-tab'
          ? 'Página aberta no navegador do Android. Volte ao Cineminha para informar uma referência autorizada de mídia.'
          : 'Página aberta no navegador. Volte ao Cineminha para informar uma referência autorizada de mídia.'
        : result.reason || 'Não foi possível abrir a página.',
    );
  }, [navigateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGoToUrl(searchInput);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const prevUrl = history[prevIdx];
      setHistoryIndex(prevIdx);
      navigateTo(prevUrl, false);
    } else {
      // Return to initial Google view
      setHasNavigated(false);
      setSearchInput('');
      setCurrentUrl('');
      setHistory([]);
      setHistoryIndex(-1);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const nextUrl = history[nextIdx];
      setHistoryIndex(nextIdx);
      navigateTo(nextUrl, false);
    }
  };

  const handleReload = () => {
    if (currentUrl) {
      setIsLoading(true);
      void getBrowserAdapter().open(currentUrl).then((result) => {
        setIsLoading(false);
        if (!result.opened) setBrowserStatus(result.reason || 'Não foi possível reabrir a página.');
      });
    }
  };

  const handleConfirmMedia = () => {
    const referenceUrl = mediaReferenceUrl.trim();
    if (!referenceUrl) return;

    onSelectMedia({
      sourceType: 'site',
      title: pageTitle || 'Filme Web',
      url: referenceUrl,
      playerUrl: undefined,
      playbackCapabilities: EXTERNAL_PLAYER_CAPABILITIES,
    });
    onClose();
  };

  if (!isOpen) return null;

  const canGoBack = hasNavigated;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden text-white animate-fade-in">
      {/* 1. TOP BAR */}
      <div className="h-14 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        {/* Navigation Buttons: Back, Forward, Reload */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className={`p-2 rounded-xl transition flex items-center gap-1 text-xs font-bold cursor-pointer ${
              canGoBack
                ? 'text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95'
                : 'text-slate-600 cursor-not-allowed opacity-50'
            }`}
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {hasNavigated && (
            <>
              <button
                onClick={handleForward}
                disabled={!canGoForward}
                className={`p-2 rounded-xl transition flex items-center gap-1 text-xs font-bold ${
                  canGoForward
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer active:scale-95'
                    : 'text-slate-600 cursor-not-allowed opacity-40'
                }`}
                title="Avançar"
              >
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleReload}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Recarregar"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
              </button>
            </>
          )}
        </div>

        {/* Top Address / Search Input when in navigation mode */}
        {hasNavigated && (
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-lg mx-2 flex items-center relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Pesquisar ou endereço..."
              className="w-full pl-3 pr-8 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
            />
            <button
              type="submit"
              className="absolute right-2 p-1 text-slate-400 hover:text-white transition cursor-pointer"
              title="Ir"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. MAIN BODY */}
      {!hasNavigated ? (
        /* INITIAL SCREEN: Exactly as requested */
        /*
          ┌──────────────────────────────┐
          │                              │
          │            Google            │
          │                              │
          │   [ Pesquisar ou endereço ]  │
          │                              │
          │                              │
          └──────────────────────────────┘
        */
        <div className="flex-1 flex flex-col items-center justify-center p-6 -mt-10">
          <div className="w-full max-w-md flex flex-col items-center">
            {/* Google Logo / Name */}
            <div className="text-4xl font-bold tracking-tight mb-8 select-none font-sans">
              <span className="text-[#4285F4]">G</span>
              <span className="text-[#EA4335]">o</span>
              <span className="text-[#FBBC05]">o</span>
              <span className="text-[#4285F4]">g</span>
              <span className="text-[#34A853]">l</span>
              <span className="text-[#EA4335]">e</span>
            </div>

            {/* Search or Address Input */}
            <form onSubmit={handleSearchSubmit} className="w-full relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                id="cineminha-web-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Pesquisar ou endereço"
                autoFocus
                className="w-full pl-11 pr-4 py-3.5 rounded-full bg-slate-900 hover:bg-slate-850 border border-slate-800 focus:border-slate-600 text-sm text-white placeholder-slate-500 focus:outline-none shadow-xl transition"
              />
            </form>
          </div>
        </div>
      ) : (
        /* ACTIVE IN-APP WEB NAVIGATION AREA */
        <div className="flex-1 flex flex-col overflow-hidden relative bg-black">
          {isLoading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-rose-500 animate-pulse z-20" />
          )}

          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center bg-slate-950">
            <div className="max-w-md space-y-2">
              <p className="text-sm font-bold text-white">Navegação Web aberta</p>
              <p className="text-xs text-slate-400">
                O site está sendo executado pelo navegador da plataforma. Para adicionar uma mídia à sala, informe uma referência autorizada do player.
              </p>
              {browserStatus && <p className="text-[11px] text-emerald-300">{browserStatus}</p>}
            </div>
            <input
              type="url"
              value={mediaReferenceUrl}
              onChange={(event) => setMediaReferenceUrl(event.target.value)}
              placeholder="Cole aqui a URL autorizada da mídia ou player"
              className="w-full max-w-md px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Bottom Bar: Action to Select and Return to Cineminha */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-white truncate">{pageTitle || 'Página Web'}</p>
              </div>
              <p className="text-[10px] text-slate-400 truncate">{currentUrl}</p>
            </div>

            <button
              onClick={handleConfirmMedia}
              disabled={!mediaReferenceUrl.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-rose-600/25 active:scale-95 cursor-pointer shrink-0"
            >
              <Film className="w-4 h-4" />
              <span>Incorporar ao Cineminha</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
