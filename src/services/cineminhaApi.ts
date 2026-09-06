import { CoupleWatchSession, CineminhaSyncPayload, CineminhaMedia, CineminhaQuality, CineminhaSyncAction } from '../types';
import { callManager } from './callManager';
import { AuthApi } from './authApi';

export class CineminhaApi {
  private static getAuthHeader(): Record<string, string> {
    const token = AuthApi.getToken() || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  // Get current session for the couple
  public static async getSession(): Promise<{ success: boolean; session?: CoupleWatchSession; message?: string }> {
    const token = AuthApi.getToken();
    if (!token) {
      return { success: false, message: 'Usuário não autenticado' };
    }

    try {
      const res = await fetch('/api/cineminha/session', {
        headers: this.getAuthHeader(),
      });
      if (!res.ok) {
        return { success: false, message: `Status ${res.status}` };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro de conexão' };
    }
  }

  // Start new Cineminha session (caller becomes host)
  public static async startSession(): Promise<{ success: boolean; session?: CoupleWatchSession; message?: string }> {
    const token = AuthApi.getToken();
    if (!token) {
      return { success: false, message: 'Usuário não autenticado' };
    }

    try {
      const res = await fetch('/api/cineminha/start', {
        method: 'POST',
        headers: this.getAuthHeader(),
      });
      if (!res.ok) {
        return { success: false, message: `Status ${res.status}` };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro de conexão' };
    }
  }

  // Sync playback state (play, pause, seek, mediaChanged, qualityChanged)
  public static async syncState(payload: {
    action: CineminhaSyncAction;
    position?: number;
    playing?: boolean;
    media?: CineminhaMedia | null;
    quality?: CineminhaQuality;
    clientTimestamp?: number;
    partnerId?: string;
  }): Promise<{ success: boolean; session?: CoupleWatchSession; syncPayload?: CineminhaSyncPayload }> {
    const clientTimestamp = payload.clientTimestamp || Date.now();

    // 1. Immediately send fast WebSocket signal for ultra-low latency playback sync
    callManager.sendCineminhaSync({
      ...payload,
      clientTimestamp,
    });

    // 2. Persist state to server store
    const token = AuthApi.getToken();
    if (!token) {
      return { success: false };
    }

    try {
      const res = await fetch('/api/cineminha/sync', {
        method: 'POST',
        headers: this.getAuthHeader(),
        body: JSON.stringify({
          ...payload,
          clientTimestamp,
        }),
      });
      if (!res.ok) {
        return { success: false };
      }
      return await res.json();
    } catch {
      return { success: false };
    }
  }

  // End session
  public static async endSession(): Promise<{ success: boolean; session?: CoupleWatchSession }> {
    const token = AuthApi.getToken();
    if (!token) {
      return { success: false };
    }

    try {
      const res = await fetch('/api/cineminha/end', {
        method: 'POST',
        headers: this.getAuthHeader(),
      });
      if (!res.ok) {
        return { success: false };
      }
      return await res.json();
    } catch {
      return { success: false };
    }
  }
}
