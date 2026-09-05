import { RealCallSession, CallState, CallPartnerInfo, UserAccount } from '../types';
import { DEFAULT_ICE_SERVERS } from './webrtcConfig';
import { soundManager } from '../utils/audio';
import { FirebaseService } from './firebaseService';
import { Unsubscribe } from 'firebase/firestore';
import { CallQualityController } from './callQualityController';

type StateListener = (session: RealCallSession) => void;
type ErrorListener = (error: string) => void;
type StreamListener = (local: MediaStream | null, remote: MediaStream | null) => void;
export type CoupleEventType = 'couple:linked' | 'couple:unlinked' | 'tasks:updated' | 'chat:message' | 'chat:read' | 'arena:updated' | 'user:updated';
export type CoupleEventListener = (event: { type: CoupleEventType; payload: any }) => void;

/**
 * Optimizes the SDP to configure Opus codec for crystal clear HD voice quality.
 * - 32 kbps speech bitrate with 10ms packets for lower conversational latency
 * - Inband FEC for packet-loss resilience on 4G/5G/WiFi
 * - 48 kHz Wideband Sample Rate, mono to eliminate phase cancellation
 */
function optimizeOpusSdp(rawSdp: string): string {
  if (!rawSdp) return rawSdp;
  const lines = rawSdp.split('\r\n');
  let opusPt: string | null = null;

  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPt = match[1];
      break;
    }
  }

  if (!opusPt) return rawSdp;

  const opusParams = `a=fmtp:${opusPt} minptime=10;ptime=10;maxaveragebitrate=32000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=1;maxplaybackrate=48000;sprop-maxcapturerate=48000;cbr=1`;

  let hasFmtp = false;
  const newLines = lines.map((line) => {
    if (line.startsWith(`a=fmtp:${opusPt}`)) {
      hasFmtp = true;
      return opusParams;
    }
    return line;
  });

  if (!hasFmtp) {
    const rtpmapIdx = newLines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt}`));
    if (rtpmapIdx !== -1) {
      newLines.splice(rtpmapIdx + 1, 0, opusParams);
    }
  }

  return newLines.join('\r\n');
}

/**
 * Media constraints for video call — adaptive resolution with audio priority.
 * Camera captures at 720p 30fps; the quality controller scales this down as needed.
 */
const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    latency: { ideal: 0.01, max: 0.04 },
  } as MediaTrackConstraints,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user',
    aspectRatio: { ideal: 1.7777777778 },
  } as MediaTrackConstraints,
};

/** Fallback audio-only constraints when camera permission is denied. */
const AUDIO_ONLY_CONSTRAINTS: MediaStreamConstraints = {
  audio: MEDIA_CONSTRAINTS.audio,
  video: false,
};

/** Maximum time to stay in CONNECTING before declaring failure (ms). */
const CONNECTING_TIMEOUT_MS = 20000;
/** Ringing timeout before declaring no answer (ms). */
const RINGING_TIMEOUT_MS = 35000;

class CallManager {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private durationInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private ringingTimeoutTimer: NodeJS.Timeout | null = null;
  private connectingTimeoutTimer: NodeJS.Timeout | null = null;
  private autoResetTimer: NodeJS.Timeout | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private wakeLock: any = null;
  private qualityController: CallQualityController | null = null;

  // Perfect Negotiation state
  private makingOffer = false;
  private ignoreOffer = false;
  private isPolite = false;

  // Firestore Realtime Unsubscribers
  private incomingCallsUnsub: Unsubscribe | null = null;
  private activeCallDocUnsub: Unsubscribe | null = null;
  private candidatesUnsub: Unsubscribe | null = null;

  private currentUser: { id: string; personalId: string; username: string; avatar?: string } | null = null;
  private currentPartnerId: string | null = null;
  private stateListeners: Set<StateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private coupleListeners: Set<CoupleEventListener> = new Set();
  private streamListeners: Set<StreamListener> = new Set();

  private session: RealCallSession = {
    callId: null,
    state: 'IDLE',
    partner: null,
    isOutgoing: false,
    isMuted: false,
    isSpeakerOn: true,
    isPartnerMuted: false,
    isCameraOn: false,
    isRemoteCameraOn: false,
    durationSeconds: 0,
  };

  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private pendingSignals: Array<{ type: string; payload: any }> = [];
  private iceRestartTimer: NodeJS.Timeout | null = null;
  private connectionRecoveryAttempts = 0;
  private isRestartingIce = false;
  private processedRemoteOfferSdp: string | null = null;
  private processingRemoteOfferSdp: string | null = null;

  constructor() {
    this.initAudioElement();
    this.setupWindowListeners();
    this.startHeartbeatLoop();
  }

  private setupWindowListeners() {
    if (typeof window === 'undefined') return;

    const handleActiveState = () => {
      if (this.currentUser) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          console.log('[CallManager] Window active/online - verifying signaling connection...');
          this.connectSignaling();
        }
        this.setupFirestoreIncomingListener();
      }
    };

    window.addEventListener('focus', handleActiveState);
    window.addEventListener('online', handleActiveState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleActiveState();
      }
    });
  }

  private startHeartbeatLoop() {
    if (typeof window === 'undefined') return;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(() => {
      if (this.currentUser) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.sendSignal('heartbeat', {
            userId: this.currentUser.id,
            partnerId: this.currentPartnerId || undefined,
          });
        } else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          console.log('[CallManager] Heartbeat noticed closed socket, reconnecting...');
          this.connectSignaling();
        }
      }
    }, 10000);
  }

  private initAudioElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    let el = document.getElementById('duo-remote-call-audio') as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'duo-remote-call-audio';
      el.autoplay = true;
      (el as any).playsInline = true;
      el.style.position = 'fixed';
      el.style.top = '-9999px';
      el.style.left = '-9999px';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.opacity = '0.01';
      document.body.appendChild(el);
    }
    el.volume = 1.0;
    el.muted = false;
    this.remoteAudio = el;
    return el;
  }

  // --- Couple event subscription ---

  public onCoupleEvent(listener: CoupleEventListener): () => void {
    this.coupleListeners.add(listener);
    return () => this.coupleListeners.delete(listener);
  }

  // --- Stream subscription (for video elements in the UI) ---

  public subscribeStreams(listener: StreamListener): () => void {
    this.streamListeners.add(listener);
    listener(this.localStream, this.remoteStream);
    return () => this.streamListeners.delete(listener);
  }

  private notifyStreams() {
    this.streamListeners.forEach((l) => l(this.localStream, this.remoteStream));
  }

  // --- User registration ---

  public registerUser(userId: string, personalId: string, username: string, avatar?: string, partnerId?: string) {
    this.currentUser = { id: userId, personalId, username, avatar };
    this.currentPartnerId = partnerId || null;

    this.setupFirestoreIncomingListener();

    const registerPayload = {
      userId: this.currentUser.id,
      personalId: this.currentUser.personalId,
      username: this.currentUser.username,
      partnerId: this.currentPartnerId || undefined,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSignal('register', registerPayload);
    } else {
      this.sendSignal('register', registerPayload);
      this.connectSignaling();
    }
  }

  private setupFirestoreIncomingListener() {
    if (!this.currentUser) return;
    if (this.incomingCallsUnsub) {
      this.incomingCallsUnsub();
      this.incomingCallsUnsub = null;
    }

    try {
      this.incomingCallsUnsub = FirebaseService.subscribeToIncomingCalls(
        this.currentUser.id,
        (callDoc) => {
          if (!callDoc || !callDoc.callId) return;

          if (this.session.callId === callDoc.callId) return;

          if (this.session.state !== 'IDLE') {
            console.log('[CallManager] Busy with another call, ignoring incoming call:', callDoc.callId);
            return;
          }

          console.log('[CallManager] Incoming call from Firestore snapshot:', callDoc);
          this.onIncomingCall({
            callId: callDoc.callId,
            callerId: callDoc.callerId,
            callerPersonalId: callDoc.callerPersonalId,
            callerName: callDoc.callerName,
            callerAvatar: callDoc.callerAvatar || '❤️',
          });
        }
      );
    } catch (err) {
      console.warn('[CallManager] Error setting up Firestore incoming calls listener:', err);
    }
  }

  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws/call';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/call`;
  }

  private connectSignaling() {
    if (typeof window === 'undefined') return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.currentUser && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignal('register', {
          userId: this.currentUser.id,
          personalId: this.currentUser.personalId,
          username: this.currentUser.username,
          partnerId: this.currentPartnerId || undefined,
        });
      }
      return;
    }

    try {
      const url = this.getWebSocketUrl();
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        console.log(`[WS CONNECT]\nuserId=${this.currentUser?.id || 'pending'}\nsocket=CONNECTED`);
        this.reconnectAttempts = 0;

        if (this.currentUser) {
          this.sendSignal('register', {
            userId: this.currentUser.id,
            personalId: this.currentUser.personalId,
            username: this.currentUser.username,
            partnerId: this.currentPartnerId || undefined,
          });
        }

        while (this.pendingSignals.length > 0) {
          const pending = this.pendingSignals.shift();
          if (pending && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(pending));
          }
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSignalingMessage(data.type, data.payload);
        } catch (err) {
          console.warn('[CallManager] Error parsing signal message:', err);
        }
      };

      socket.onclose = () => {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
        this.reconnectAttempts++;

        this.reconnectTimeout = setTimeout(() => {
          if (this.currentUser) {
            this.connectSignaling();
          }
        }, delay);
      };

      socket.onerror = () => {
        console.warn('[CallManager] Signaling socket disconnected, retrying in background...');
      };
    } catch (err) {
      console.warn('[CallManager] Failed to initialize WebSocket connection:', err);
    }
  }

  private sendSignal(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      if (type === 'register') {
        this.pendingSignals = this.pendingSignals.filter((s) => s.type !== 'register');
      }
      this.pendingSignals.push({ type, payload });
    }
  }

  // --- Signaling message handler with callId isolation ---

  private async handleSignalingMessage(type: string, payload: any) {
    // Reject signals that belong to a different call
    const signalCallId = payload?.callId;
    const isCallEvent = type.startsWith('call:');
    if (isCallEvent && signalCallId && this.session.callId && signalCallId !== this.session.callId) {
      console.log(`[CallManager] Ignoring stale signal "${type}" for call ${signalCallId} (current: ${this.session.callId})`);
      return;
    }

    switch (type) {
      case 'registered':
        console.log(`[WS REGISTER]\nuserId=${this.currentUser?.id}\nregistered=true`);
        break;

      case 'heartbeat_ack':
        break;

      case 'couple:linked':
      case 'couple:unlinked':
      case 'tasks:updated':
      case 'chat:message':
      case 'arena:updated':
      case 'user:updated':
      case 'chat:read':
        this.coupleListeners.forEach((listener) => {
          try {
            listener({ type: type as any, payload });
          } catch (err) {
            console.error('[CallManager] Real-time event listener execution error:', err);
          }
        });
        break;

      case 'call:incoming':
        if (this.session.state !== 'IDLE') return;
        this.onIncomingCall(payload);
        break;

      case 'call:initiated':
        if (!this.session.callId) {
          this.session.callId = payload.callId;
        }
        this.updateState({ state: 'CALLING' });
        soundManager.startCallingTone();
        break;

      case 'call:accepted':
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        this.updateState({ state: 'CONNECTING' });
        this.startConnectingTimeout();
        if (this.session.isOutgoing) {
          await this.createAndSendOffer();
          if (this.session.callId) {
            this.listenToIceCandidates(this.session.callId);
          }
        }
        break;

      case 'call:offer':
        await this.handleReceivedOffer(payload.sdp);
        break;

      case 'call:answer':
        await this.handleReceivedAnswer(payload.sdp);
        break;

      case 'call:ice_candidate':
        await this.handleReceivedIceCandidate(payload.candidate);
        break;

      case 'call:rejected':
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'REJECTED', errorMessage: 'Chamada recusada pelo parceiro(a).' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:cancelled':
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'ENDED', errorMessage: 'Chamada cancelada pelo chamador.' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:timeout':
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'MISSED', errorMessage: 'Sem resposta.' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:ended':
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'ENDED', errorMessage: payload?.message || 'Chamada encerrada.' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:partner_muted':
        this.updateState({ isPartnerMuted: !!payload.isMuted });
        break;

      case 'call:partner_camera_state':
        this.updateState({ isRemoteCameraOn: !!payload.isCameraOn });
        break;

      case 'call:failed':
        if (payload?.reason === 'partner_busy') {
          soundManager.stopCallingTone();
          soundManager.playCallEnded();
          this.updateState({ state: 'FAILED', errorMessage: payload.message || 'Parceiro ocupado em outra chamada.' });
          this.cleanupMediaAndPeer();
          this.scheduleAutoReset(3000);
        }
        break;
    }
  }

  // --- Public Call Control Methods ---

  public async startCall(partner: UserAccount): Promise<boolean> {
    if (!this.currentUser) {
      this.notifyError('Usuário não autenticado.');
      return false;
    }

    if (!partner || !partner.id) {
      this.notifyError('Nenhum parceiro(a) vinculado.');
      return false;
    }

    if (this.session.state !== 'IDLE') {
      this.notifyError('Já existe uma chamada em andamento.');
      return false;
    }

    const audioEl = this.initAudioElement();
    if (audioEl) {
      audioEl.play().catch(() => {});
    }
    console.log(`[CALL INITIATE]\ncaller=${this.currentUser.id}\nreceiver=${partner.id}`);

    // Acquire camera + microphone; fall back to audio-only on camera denial
    let hasVideo = true;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        // Camera denied — try audio-only so the call can still proceed
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(AUDIO_ONLY_CONSTRAINTS);
          hasVideo = false;
          console.log('[CallManager] Camera denied, proceeding audio-only');
        } catch (audioErr: any) {
          console.error('[CallManager] Microphone permission denied:', audioErr);
          this.updateState({ state: 'FAILED', errorMessage: 'Permissão de microfone necessária para fazer a chamada.' });
          this.scheduleAutoReset(3000);
          return false;
        }
      } else {
        console.error('[CallManager] getUserMedia error:', err);
        this.updateState({ state: 'FAILED', errorMessage: 'Erro ao acessar câmera/microfone.' });
        this.scheduleAutoReset(3000);
        return false;
      }
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    this.session = {
      callId,
      state: 'CALLING',
      partner: {
        id: partner.id,
        personalId: partner.personalId,
        username: partner.username,
        avatar: partner.avatar,
      },
      isOutgoing: true,
      isMuted: false,
      isSpeakerOn: true,
      isPartnerMuted: false,
      isCameraOn: hasVideo,
      isRemoteCameraOn: false,
      durationSeconds: 0,
    };
    this.notifyState();
    this.notifyStreams();
    soundManager.startCallingTone();

    // Perfect Negotiation: caller is impolite
    this.isPolite = false;
    this.makingOffer = false;
    this.ignoreOffer = false;

    // 1. Create call document in Cloud Firestore
    try {
      await FirebaseService.createCallDoc({
        callId,
        callerId: this.currentUser.id,
        callerPersonalId: this.currentUser.personalId,
        callerName: this.currentUser.username,
        callerAvatar: this.currentUser.avatar || '🦁',
        calleeId: partner.id,
        calleePersonalId: partner.personalId,
        calleeName: partner.username,
      });
    } catch (err) {
      console.error('[CallManager] Failed to create call document in Firestore:', err);
    }

    // 2. Send initiate signal via WebSocket
    this.sendSignal('call:initiate', {
      callId,
      callerId: this.currentUser.id,
      callerPersonalId: this.currentUser.personalId,
      callerName: this.currentUser.username,
      callerAvatar: this.currentUser.avatar || '🦁',
      calleeId: partner.id,
      calleePersonalId: partner.personalId,
    });

    // 3. Monitor active call document in Firestore
    this.monitorActiveCall(callId);

    // 4. Set ringing timeout
    if (this.ringingTimeoutTimer) clearTimeout(this.ringingTimeoutTimer);
    this.ringingTimeoutTimer = setTimeout(() => {
      if (this.session.callId === callId && this.session.state === 'CALLING') {
        console.log('[CallManager] Call ringing timeout (no answer after 35s)');
        soundManager.stopCallingTone();
        soundManager.playCallEnded();
        this.updateState({ state: 'MISSED', errorMessage: 'Sem resposta.' });
        FirebaseService.updateCallDoc(callId, { status: 'timeout' }).catch(() => {});
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(3000);
      }
    }, RINGING_TIMEOUT_MS);

    return true;
  }

  public async acceptCall(): Promise<boolean> {
    if (!this.session.callId || this.session.state !== 'RINGING') {
      return false;
    }

    const callId = this.session.callId;
    const audioEl = this.initAudioElement();
    if (audioEl) {
      audioEl.play().catch(() => {});
    }
    soundManager.stopIncomingRing();

    // Acquire camera + microphone; fall back to audio-only
    let hasVideo = true;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(AUDIO_ONLY_CONSTRAINTS);
          hasVideo = false;
          console.log('[CallManager] Camera denied on accept, proceeding audio-only');
        } catch (audioErr: any) {
          console.error('[CallManager] Microphone access failed on accept:', audioErr);
          this.updateState({ state: 'FAILED', errorMessage: 'Permissão de microfone necessária para atender a chamada.' });
          this.sendSignal('call:reject', { callId, calleeId: this.currentUser?.id, reason: 'permission_denied' });
          FirebaseService.updateCallDoc(callId, { status: 'rejected', reason: 'permission_denied' }).catch(() => {});
          this.scheduleAutoReset(3000);
          return false;
        }
      } else {
        console.error('[CallManager] getUserMedia error on accept:', err);
        this.updateState({ state: 'FAILED', errorMessage: 'Erro ao acessar câmera/microfone.' });
        this.scheduleAutoReset(3000);
        return false;
      }
    }

    this.updateState({ state: 'CONNECTING', isCameraOn: hasVideo });
    this.notifyStreams();
    this.startConnectingTimeout();

    // Perfect Negotiation: callee is polite
    this.isPolite = true;
    this.makingOffer = false;
    this.ignoreOffer = false;

    // Initialize peer connection with local tracks
    this.createPeerConnection();

    // 1. Update Firestore call doc
    FirebaseService.updateCallDoc(callId, {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
    }).catch(() => {});

    // 2. Send accept signal via WebSocket
    this.sendSignal('call:accept', {
      callId,
      calleeId: this.currentUser?.id,
      callerId: this.session.partner?.id,
    });

    // 3. Listen to ICE candidates in Firestore
    this.listenToIceCandidates(callId);

    return true;
  }

  public rejectCall() {
    const callId = this.session.callId;
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();

    if (callId) {
      this.sendSignal('call:reject', { callId, calleeId: this.currentUser?.id, reason: 'declined' });
      FirebaseService.updateCallDoc(callId, { status: 'rejected', reason: 'declined' }).catch(() => {});
    }

    this.cleanupMediaAndPeer();
    this.resetToIdle();
  }

  public cancelCall() {
    const callId = this.session.callId;
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();

    if (callId && this.currentUser) {
      this.sendSignal('call:cancel', { callId, callerId: this.currentUser.id, userId: this.currentUser.id });
      FirebaseService.updateCallDoc(callId, { status: 'cancelled' }).catch(() => {});
    }

    this.cleanupMediaAndPeer();
    this.resetToIdle();
  }

  public endCall() {
    const callId = this.session.callId;
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();

    this.updateState({ state: 'ENDING' });

    if (callId && this.currentUser) {
      this.sendSignal('call:end', { callId, userId: this.currentUser.id, reason: 'user_hangup' });
      FirebaseService.updateCallDoc(callId, { status: 'ended', reason: 'user_hangup' }).catch(() => {});
    }

    this.cleanupMediaAndPeer();
    this.updateState({ state: 'ENDED', errorMessage: 'Chamada encerrada.' });
    this.scheduleAutoReset(1200);
  }

  public toggleMute() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = !this.session.isMuted;
      audioTrack.enabled = !nextMuted;
      this.updateState({ isMuted: nextMuted });

      if (this.session.callId && this.currentUser) {
        this.sendSignal('call:mute_state', {
          callId: this.session.callId,
          userId: this.currentUser.id,
          isMuted: nextMuted,
        });
      }
    }
  }

  public toggleCamera() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const nextCameraOn = !this.session.isCameraOn;
    videoTrack.enabled = nextCameraOn;
    this.updateState({ isCameraOn: nextCameraOn });
    this.notifyStreams();

    if (this.session.callId && this.currentUser) {
      this.sendSignal('call:camera_state', {
        callId: this.session.callId,
        userId: this.currentUser.id,
        isCameraOn: nextCameraOn,
      });
    }
  }

  public toggleSpeaker() {
    const nextSpeaker = !this.session.isSpeakerOn;
    if (this.remoteAudio) {
      this.remoteAudio.muted = !nextSpeaker;
    }
    this.updateState({ isSpeakerOn: nextSpeaker });
  }

  // --- Real-time WebRTC & Firestore Synchronization ---

  private onIncomingCall(payload: {
    callId: string;
    callerId: string;
    callerPersonalId: string;
    callerName: string;
    callerAvatar: string;
  }) {
    console.log(`[CALL INCOMING]\ncaller=${payload.callerId} (${payload.callerName})\ncallId=${payload.callId}`);

    if (this.session.state !== 'IDLE') {
      if (this.session.callId !== payload.callId) {
        this.sendSignal('call:reject', { callId: payload.callId, calleeId: this.currentUser?.id, reason: 'busy' });
      }
      return;
    }

    this.session = {
      callId: payload.callId,
      state: 'RINGING',
      partner: {
        id: payload.callerId,
        personalId: payload.callerPersonalId,
        username: payload.callerName,
        avatar: payload.callerAvatar || '❤️',
      },
      isOutgoing: false,
      isMuted: false,
      isSpeakerOn: true,
      isPartnerMuted: false,
      isCameraOn: false,
      isRemoteCameraOn: false,
      durationSeconds: 0,
    };

    soundManager.startIncomingRing();
    this.notifyState();

    this.monitorActiveCall(payload.callId);
  }

  private monitorActiveCall(callId: string) {
    if (this.activeCallDocUnsub) {
      this.activeCallDocUnsub();
      this.activeCallDocUnsub = null;
    }

    this.activeCallDocUnsub = FirebaseService.subscribeToCallDoc(callId, async (callDoc) => {
      if (!callDoc || this.session.callId !== callId) return;

      console.log(`[CallManager] Call doc snapshot update for ${callId}: status=${callDoc.status}`);

      // 1. Call accepted by partner
      if (
        (callDoc.status === 'accepted' || callDoc.status === 'connecting' || callDoc.status === 'connected') &&
        this.session.isOutgoing &&
        (this.session.state === 'CALLING' || this.session.state === 'CONNECTING')
      ) {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        if (this.session.state === 'CALLING') {
          this.updateState({ state: 'CONNECTING' });
          this.startConnectingTimeout();
          await this.createAndSendOffer();
          this.listenToIceCandidates(callId);
        }
      }

      // 2. Call Offer received by callee
      if (callDoc.offer && !this.session.isOutgoing && (
        this.session.state === 'CONNECTING' ||
        this.session.state === 'CONNECTED' ||
        this.session.state === 'RINGING'
      )) {
        const offerSdp = callDoc.offer.sdp || '';
        const isNewOffer = offerSdp && offerSdp !== this.processedRemoteOfferSdp;
        if (isNewOffer) {
          if (this.session.state === 'RINGING') {
            soundManager.stopIncomingRing();
            this.updateState({ state: 'CONNECTING' });
            this.startConnectingTimeout();
          }
          await this.handleReceivedOffer(callDoc.offer);
        }
      }

      // 3. Call Answer received by caller
      if (callDoc.answer && this.session.isOutgoing && (this.session.state === 'CONNECTING' || this.session.state === 'CALLING')) {
        if (this.peerConnection && !this.peerConnection.remoteDescription) {
          await this.handleReceivedAnswer(callDoc.answer);
        }
      }

      // 4. Call rejected
      if (callDoc.status === 'rejected') {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'REJECTED', errorMessage: 'Chamada recusada pelo parceiro(a).' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 5. Call cancelled by caller
      if (callDoc.status === 'cancelled') {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'ENDED', errorMessage: 'Chamada cancelada.' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 6. Call ended
      if (callDoc.status === 'ended') {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'ENDED', errorMessage: 'Chamada encerrada.' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 7. Timeout (Sem resposta)
      if (callDoc.status === 'timeout' && (this.session.state === 'CALLING' || this.session.state === 'RINGING' || this.session.state === 'CONNECTING')) {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({ state: 'MISSED', errorMessage: 'Sem resposta.' });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(2000);
      }
    });
  }

  private listenToIceCandidates(callId: string) {
    if (this.candidatesUnsub) {
      this.candidatesUnsub();
      this.candidatesUnsub = null;
    }

    if (!this.currentUser) return;

    this.candidatesUnsub = FirebaseService.subscribeToCallIceCandidates(
      callId,
      this.currentUser.id,
      (candidate) => {
        this.handleReceivedIceCandidate(candidate);
      }
    );
  }

  private async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        console.log('[CallManager] WakeLock acquired - keeping phone CPU and screen active');
      } catch (err) {
        console.warn('[CallManager] WakeLock error:', err);
      }
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
    }
  }

  // --- Connecting timeout (fires only if stuck in CONNECTING) ---

  private startConnectingTimeout() {
    this.clearConnectingTimeout();
    this.connectingTimeoutTimer = setTimeout(() => {
      if (this.session.state === 'CONNECTING') {
        console.warn('[CallManager] Connecting timeout (20s) — call failed to establish');
        this.handleCallFailed('Tempo esgotado ao conectar. Tente novamente.');
      }
    }, CONNECTING_TIMEOUT_MS);
  }

  private clearConnectingTimeout() {
    if (this.connectingTimeoutTimer) {
      clearTimeout(this.connectingTimeoutTimer);
      this.connectingTimeoutTimer = null;
    }
  }

  // --- Peer Connection Setup ---

  private createPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        console.warn('[CallManager] Error closing previous peer connection:', e);
      }
      this.peerConnection = null;
    }

    this.pendingIceCandidates = [];
    const pc = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
    this.peerConnection = pc;

    // Attach local audio + video tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Configure sender parameters for audio priority and video adaptation
    this.configureSenders(pc);

    // Perfect Negotiation: onnegotiationneeded
    pc.onnegotiationneeded = async () => {
      if (!this.peerConnection || this.peerConnection !== pc) return;
      try {
        this.makingOffer = true;
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        const enhancedSdp = optimizeOpusSdp(offer.sdp || '');
        const enhancedOffer: RTCSessionDescriptionInit = { type: offer.type, sdp: enhancedSdp };
        await pc.setLocalDescription(enhancedOffer);

        if (this.session.callId) {
          const sdpPayload = { type: enhancedOffer.type, sdp: enhancedOffer.sdp };
          FirebaseService.updateCallDoc(this.session.callId, { offer: sdpPayload }).catch(() => {});
          this.sendSignal('call:offer', { callId: this.session.callId, sdp: enhancedOffer, targetUserId: this.session.partner?.id });
        }
      } catch (err) {
        console.error('[CallManager] onnegotiationneeded error:', err);
      } finally {
        this.makingOffer = false;
      }
    };

    // Remote track reception — audio + video
    pc.ontrack = (event) => {
      console.log(`[CallManager] Remote ${event.track.kind} track received: ${event.track.id} readyState: ${event.track.readyState}`);

      if (event.track.kind === 'audio') {
        // Force lowest playout delay for real-time audio
        if (event.receiver) {
          try {
            if ('playoutDelayHint' in event.receiver) {
              (event.receiver as any).playoutDelayHint = 0;
            }
            if ('jitterBufferTarget' in event.receiver) {
              (event.receiver as any).jitterBufferTarget = 0;
            }
          } catch (e) {}
        }

        const audioEl = this.initAudioElement();
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

        if (audioEl) {
          audioEl.srcObject = stream;
          audioEl.volume = 1.0;
          audioEl.muted = !this.session.isSpeakerOn;
          audioEl.playbackRate = 1.0;
          audioEl.autoplay = true;
          audioEl.setAttribute('playsinline', '');

          const playAudioStream = () => {
            if (audioEl && audioEl.srcObject) {
              audioEl.play().catch((err) => {
                console.warn('[CallManager] AutoPlay blocked, attaching touch listener:', err);
                const oneTouchUnlock = () => {
                  audioEl.play().catch(() => {});
                  window.removeEventListener('touchstart', oneTouchUnlock);
                };
                window.addEventListener('touchstart', oneTouchUnlock, { once: true, passive: true });
              });
            }
          };
          playAudioStream();
          event.track.onunmute = () => playAudioStream();
        }
      } else if (event.track.kind === 'video') {
        // Collect remote video tracks into a dedicated stream
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        // Avoid duplicate tracks
        if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
        this.updateState({ isRemoteCameraOn: event.track.enabled });
        this.notifyStreams();

        event.track.onunmute = () => {
          this.updateState({ isRemoteCameraOn: true });
          this.notifyStreams();
        };
        event.track.onmute = () => {
          this.updateState({ isRemoteCameraOn: false });
          this.notifyStreams();
        };
        event.track.onended = () => {
          this.updateState({ isRemoteCameraOn: false });
          this.notifyStreams();
        };
      }

      if (this.session.state !== 'CONNECTED' && this.session.state !== 'ENDING') {
        this.handleCallConnected();
      }
    };

    // ICE candidate discovery (Trickle ICE — dual broadcast via WS + Firestore)
    pc.onicecandidate = (event) => {
      if (event.candidate && this.session.callId && this.currentUser) {
        FirebaseService.addCallIceCandidate(this.session.callId, this.currentUser.id, event.candidate).catch(() => {});
        this.sendSignal('call:ice_candidate', {
          callId: this.session.callId,
          candidate: event.candidate,
          targetUserId: this.session.partner?.id,
        });
      }
    };

    // Connection state monitoring — don't drop on transient disconnect
    pc.onconnectionstatechange = () => {
      console.log('[CallManager] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.connectionRecoveryAttempts = 0;
        this.clearIceRestartTimer();
        this.handleCallConnected();
      } else if (pc.connectionState === 'disconnected') {
        console.log('[CallManager] Connection disconnected — scheduling ICE recovery...');
        this.scheduleIceRestart('connection_disconnected');
      } else if (pc.connectionState === 'failed') {
        console.log('[CallManager] Connection failed — renegotiating ICE...');
        this.scheduleIceRestart('connection_failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallManager] iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.connectionRecoveryAttempts = 0;
        this.clearIceRestartTimer();
        this.handleCallConnected();
      } else if (pc.iceConnectionState === 'disconnected') {
        console.log('[CallManager] ICE disconnected — scheduling recovery...');
        this.scheduleIceRestart('ice_disconnected');
      } else if (pc.iceConnectionState === 'failed') {
        console.log('[CallManager] ICE failed — renegotiating...');
        this.scheduleIceRestart('ice_failed');
      }
    };

    return pc;
  }

  /**
   * Configures RTCRtpSender parameters:
   * - Audio: high priority, 32kbps Opus
   * - Video: degradationPreference = "maintain-framerate" (drop resolution before FPS)
   */
  private configureSenders(pc: RTCPeerConnection) {
    const senders = pc.getSenders();

    for (const sender of senders) {
      if (!sender.track) continue;

      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }

        if (sender.track.kind === 'audio') {
          // Audio gets high priority — never sacrifice audio for video
          (params.encodings[0] as any).priority = 'high';
          params.encodings[0].maxBitrate = 32000;
        } else if (sender.track.kind === 'video') {
          // Video starts at top quality; controller will adapt
          (params.encodings[0] as any).priority = 'medium';
          params.encodings[0].maxBitrate = 1500000;
          if ('maxFramerate' in params.encodings[0]) {
            (params.encodings[0] as any).maxFramerate = 30;
          }
          params.encodings[0].scaleResolutionDownBy = 1.0;
          // Prefer maintaining framerate over resolution during bandwidth drops
          if ('degradationPreference' in params) {
            params.degradationPreference = 'maintain-framerate';
          }
        }

        sender.setParameters(params).catch((err) => {
          console.warn(`[CallManager] setParameters failed for ${sender.track?.kind}:`, err);
        });
      } catch (err) {
        console.warn('[CallManager] Error configuring sender:', err);
      }
    }
  }

  private async processPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    const candidates = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];
    for (const cand of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn('[CallManager] Error processing queued ICE candidate:', err);
      }
    }
  }

  private async createAndSendOffer() {
    try {
      let pc = this.peerConnection;
      if (!pc || pc.signalingState === 'closed') {
        pc = this.createPeerConnection();
      } else if (this.localStream) {
        const senders = pc.getSenders();
        this.localStream.getTracks().forEach((track) => {
          if (!senders.some((s) => s.track?.id === track.id)) {
            pc!.addTrack(track, this.localStream!);
          }
        });
      }

      // If onnegotiationalready hasn't fired (or we need an explicit offer):
      this.makingOffer = true;
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      const enhancedSdp = optimizeOpusSdp(offer.sdp || '');
      const enhancedOffer: RTCSessionDescriptionInit = { type: offer.type, sdp: enhancedSdp };
      await pc.setLocalDescription(enhancedOffer);
      this.makingOffer = false;

      const sdpPayload = { type: enhancedOffer.type, sdp: enhancedOffer.sdp };

      if (this.session.callId) {
        FirebaseService.updateCallDoc(this.session.callId, { offer: sdpPayload, status: 'connecting' }).catch(() => {});
        this.sendSignal('call:offer', { callId: this.session.callId, sdp: enhancedOffer, targetUserId: this.session.partner?.id });
      }
    } catch (err) {
      this.makingOffer = false;
      console.error('[CallManager] Error creating SDP offer:', err);
      this.handleCallFailed('Erro ao negociar conexão.');
    }
  }

  // --- ICE Restart / Recovery ---

  private scheduleIceRestart(reason: string) {
    if (
      !this.session.callId ||
      !this.peerConnection ||
      this.session.state !== 'CONNECTED' ||
      this.iceRestartTimer ||
      this.isRestartingIce
    ) {
      return;
    }

    const callId = this.session.callId;
    const retryDelay = Math.min(1500 * Math.pow(1.5, this.connectionRecoveryAttempts), 10000);
    this.iceRestartTimer = setTimeout(async () => {
      this.iceRestartTimer = null;

      if (!this.session.callId || this.session.callId !== callId || this.session.state !== 'CONNECTED' || !this.peerConnection) {
        return;
      }

      const pc = this.peerConnection;
      if (pc.connectionState === 'connected' && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
        this.connectionRecoveryAttempts = 0;
        return;
      }

      this.connectionRecoveryAttempts += 1;
      console.log(`[CallManager] ICE recovery attempt ${this.connectionRecoveryAttempts} (${reason})`);
      await this.restartIceAndRenegotiate();

      if (
        this.session.callId === callId &&
        this.session.state === 'CONNECTED' &&
        this.peerConnection &&
        this.peerConnection.iceConnectionState !== 'connected' &&
        this.peerConnection.iceConnectionState !== 'completed'
      ) {
        this.scheduleIceRestart('retry');
      }
    }, retryDelay);
  }

  private clearIceRestartTimer() {
    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = null;
    }
  }

  private async restartIceAndRenegotiate() {
    if (this.isRestartingIce || !this.peerConnection || !this.session.callId || !this.currentUser || this.session.state !== 'CONNECTED') {
      return;
    }

    const pc = this.peerConnection;
    const callId = this.session.callId;
    this.isRestartingIce = true;

    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }

      this.makingOffer = true;
      const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: true });
      const enhancedSdp = optimizeOpusSdp(offer.sdp || '');
      const enhancedOffer: RTCSessionDescriptionInit = { type: offer.type, sdp: enhancedSdp };
      await pc.setLocalDescription(enhancedOffer);
      this.makingOffer = false;

      const sdpPayload = { type: enhancedOffer.type, sdp: enhancedOffer.sdp };

      FirebaseService.updateCallDoc(callId, { offer: sdpPayload, status: 'connecting', iceRestartedAt: new Date().toISOString() }).catch(() => {});
      this.sendSignal('call:offer', { callId, sdp: enhancedOffer, targetUserId: this.session.partner?.id });
    } catch (err) {
      this.makingOffer = false;
      console.warn('[CallManager] ICE renegotiation attempt failed:', err);
    } finally {
      this.isRestartingIce = false;
    }
  }

  // --- Offer / Answer handling with Perfect Negotiation ---

  private async handleReceivedOffer(sdp: RTCSessionDescriptionInit) {
    try {
      const offerSdp = sdp?.sdp || '';
      if (offerSdp && (offerSdp === this.processedRemoteOfferSdp || offerSdp === this.processingRemoteOfferSdp)) {
        return;
      }
      this.processingRemoteOfferSdp = offerSdp || null;

      const pc = this.peerConnection;
      if (!pc || pc.signalingState === 'closed') {
        this.createPeerConnection();
      } else if (this.localStream) {
        const senders = pc.getSenders();
        this.localStream.getTracks().forEach((track) => {
          if (!senders.some((s) => s.track?.id === track.id)) {
            pc!.addTrack(track, this.localStream!);
          }
        });
      }

      const ready = this.peerConnection!;
      // Perfect Negotiation: glare handling
      const offerCollision = this.makingOffer || ready.signalingState !== 'stable';
      this.ignoreOffer = !this.isPolite && offerCollision;
      if (this.ignoreOffer) {
        console.log('[CallManager] Perfect Negotiation: ignoring offer (impolite glare)');
        return;
      }

      await ready.setRemoteDescription(new RTCSessionDescription(sdp));
      this.processedRemoteOfferSdp = offerSdp;
      await this.processPendingIceCandidates();

      this.makingOffer = true;
      const answer = await ready.createAnswer();
      const enhancedSdp = optimizeOpusSdp(answer.sdp || '');
      const enhancedAnswer: RTCSessionDescriptionInit = { type: answer.type, sdp: enhancedSdp };
      await ready.setLocalDescription(enhancedAnswer);
      this.makingOffer = false;

      const answerPayload = { type: enhancedAnswer.type, sdp: enhancedAnswer.sdp };

      if (this.session.callId) {
        FirebaseService.updateCallDoc(this.session.callId, { answer: answerPayload, status: 'connected' }).catch(() => {});
        this.sendSignal('call:answer', { callId: this.session.callId, sdp: enhancedAnswer, targetUserId: this.session.partner?.id });

        // Fallback: if ontrack hasn't fired yet, mark connected after a short delay
        setTimeout(() => {
          if (this.session.state === 'CONNECTING') {
            this.handleCallConnected();
          }
        }, 500);
      }
    } catch (err) {
      this.makingOffer = false;
      console.error('[CallManager] Error handling SDP offer:', err);
      this.handleCallFailed('Erro ao responder oferta.');
    } finally {
      this.processingRemoteOfferSdp = null;
    }
  }

  private async handleReceivedAnswer(sdp: RTCSessionDescriptionInit) {
    try {
      if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
        if (this.peerConnection.signalingState === 'have-local-offer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
          await this.processPendingIceCandidates();

          setTimeout(() => {
            if (this.session.state === 'CONNECTING') {
              this.handleCallConnected();
            }
          }, 500);
        }
      }
    } catch (err) {
      console.error('[CallManager] Error handling SDP answer:', err);
    }
  }

  private async handleReceivedIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingIceCandidates.push(candidate);
      }
    } catch (err) {
      console.error('[CallManager] Error adding ICE candidate:', err);
    }
  }

  // --- Call lifecycle ---

  private handleCallConnected() {
    if (this.session.state === 'CONNECTED' || this.session.state === 'ENDING') return;
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallConnected();
    this.clearConnectingTimeout();
    this.updateState({ state: 'CONNECTED' });
    this.startDurationTimer();
    this.requestWakeLock();

    // Start adaptive quality monitoring
    if (this.peerConnection && !this.qualityController) {
      this.qualityController = new CallQualityController(this.peerConnection);
      this.qualityController.start();
    }

    // Notify partner of our camera state
    if (this.session.callId && this.currentUser) {
      this.sendSignal('call:camera_state', {
        callId: this.session.callId,
        userId: this.currentUser.id,
        isCameraOn: this.session.isCameraOn,
      });
    }
  }

  private handleCallFailed(reason: string) {
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();
    this.updateState({ state: 'FAILED', errorMessage: reason });
    this.cleanupMediaAndPeer();
    this.scheduleAutoReset(3000);
  }

  private startDurationTimer() {
    if (this.durationInterval) clearInterval(this.durationInterval);
    this.session.durationSeconds = 0;
    this.durationInterval = setInterval(() => {
      this.session.durationSeconds += 1;
      this.notifyState();
    }, 1000);
  }

  private stopDurationTimer() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  // --- Cleanup — releases ALL resources and prevents stale state ---

  private cleanupMediaAndPeer() {
    this.stopDurationTimer();
    this.clearIceRestartTimer();
    this.clearConnectingTimeout();
    this.connectionRecoveryAttempts = 0;
    this.isRestartingIce = false;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.processedRemoteOfferSdp = null;
    this.processingRemoteOfferSdp = null;

    if (this.ringingTimeoutTimer) {
      clearTimeout(this.ringingTimeoutTimer);
      this.ringingTimeoutTimer = null;
    }

    if (this.activeCallDocUnsub) {
      this.activeCallDocUnsub();
      this.activeCallDocUnsub = null;
    }

    if (this.candidatesUnsub) {
      this.candidatesUnsub();
      this.candidatesUnsub = null;
    }

    // Stop quality controller
    if (this.qualityController) {
      this.qualityController.stop();
      this.qualityController = null;
    }

    // Release wake lock
    this.releaseWakeLock();

    // Stop all local tracks (camera + microphone)
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onnegotiationneeded = null;
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    // Clear remote stream
    this.remoteStream = null;
    this.notifyStreams();

    // Clear audio element
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
    }
  }

  private scheduleAutoReset(delayMs = 2000) {
    this.clearAutoReset();
    this.autoResetTimer = setTimeout(() => {
      this.autoResetTimer = null;
      if (
        this.session.state === 'ENDED' ||
        this.session.state === 'REJECTED' ||
        this.session.state === 'MISSED' ||
        this.session.state === 'FAILED'
      ) {
        this.resetToIdle();
      }
    }, delayMs);
  }

  private clearAutoReset() {
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
    }
  }

  private resetToIdle() {
    this.cleanupMediaAndPeer();
    this.clearAutoReset();
    this.session = {
      callId: null,
      state: 'IDLE',
      partner: null,
      isOutgoing: false,
      isMuted: false,
      isSpeakerOn: true,
      isPartnerMuted: false,
      isCameraOn: false,
      isRemoteCameraOn: false,
      durationSeconds: 0,
    };
    this.notifyState();
    this.notifyStreams();
  }

  private updateState(partial: Partial<RealCallSession>) {
    this.session = { ...this.session, ...partial };
    this.notifyState();
  }

  // --- Subscriptions ---

  public subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.session);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private notifyState() {
    this.stateListeners.forEach((l) => l({ ...this.session }));
  }

  private notifyError(err: string) {
    this.errorListeners.forEach((l) => l(err));
  }

  public getSession(): RealCallSession {
    return { ...this.session };
  }
}

export const callManager = new CallManager();
