import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export type BrowserOpenMode = 'system' | 'custom-tab';

export interface BrowserCapabilities {
  canOpenSystemBrowser: boolean;
  canOpenCustomTab: boolean;
  canReturnNavigationResult: boolean;
}

export interface BrowserOpenResult {
  opened: boolean;
  mode: BrowserOpenMode;
  reason?: string;
}

export interface BrowserAdapter {
  getCapabilities(): BrowserCapabilities;
  open(url: string): Promise<BrowserOpenResult>;
}

class WebBrowserAdapter implements BrowserAdapter {
  getCapabilities(): BrowserCapabilities {
    return {
      canOpenSystemBrowser: typeof window !== 'undefined',
      canOpenCustomTab: Capacitor.getPlatform() === 'android',
      canReturnNavigationResult: false,
    };
  }

  async open(url: string): Promise<BrowserOpenResult> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url, toolbarColor: '#020617' });
        return {
          opened: true,
          mode: Capacitor.getPlatform() === 'android' ? 'custom-tab' : 'system',
        };
      } catch (error) {
        return {
          opened: false,
          mode: Capacitor.getPlatform() === 'android' ? 'custom-tab' : 'system',
          reason: error instanceof Error ? error.message : 'Não foi possível abrir o navegador.',
        };
      }
    }

    if (typeof window === 'undefined') {
      return { opened: false, mode: 'system', reason: 'Browser indisponível neste ambiente.' };
    }

    try {
      await Browser.open({ url, windowName: '_blank' });
      return { opened: true, mode: 'system' };
    } catch (error) {
      return {
        opened: false,
        mode: 'system',
        reason: error instanceof Error ? error.message : 'O navegador bloqueou a abertura da página.',
      };
    }
  }
}

export function getBrowserAdapter(): BrowserAdapter {
  return new WebBrowserAdapter();
}
