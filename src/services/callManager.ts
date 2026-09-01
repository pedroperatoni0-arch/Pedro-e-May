import { RealCallSession, CallState, CallPartnerInfo, UserAccount } from '../types';
import { DEFAULT_ICE_SERVERS } from './webrtcConfig';
import { soundManager } from '../utils/audio';
import { FirebaseService } from './firebaseService';
import { Unsubscribe } from 'firebase/firestore';

type StateListener = (session: RealCallSession) => void;
type ErrorListener = (error: string) => void;
export type CoupleEventType = 'couple:linked' | 'couple:unlinked' | 'tasks:updated' | 'chat:message' | 'chat:read' | 'arena:updated' | 'user:updated';
export type CoupleEventListener = (event: { type: CoupleEventType; payload: any }) => void;

/**
 * Optimizes the SDP to configure Opus codec for crystal clear HD voice quality (WhatsApp/Discord grade)
 * - 32 kbps speech bitrate with 10ms packets for lower conversational latency
 * - Inband Forward Error Correction (FEC) for zero packet-loss stutter on 4G/5G/WiFi
 * - 48,000 Hz Wideband Sample Rate
 * - Mono Voice Pipeline to eliminate phase cancellation and acoustic artifacts
 * - 20ms frame delivery with zero artificial buffer accumulation
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

const HIGH_QUALITY_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    latency: { ideal: 0.01, max: 0.04 },
  } as MediaTrackConstraints,
  video: false,
};

class CallManager {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private durationInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private ringingTimeoutTimer: NodeJS.Timeout | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private wakeLock: any = null;

  // Firestore Realtime Unsubscribers
  private incomingCallsUnsub: Unsubscribe | null = null;
  private activeCallDocUnsub: Unsubscribe | null = null;
  private candidatesUnsub: Unsubscribe | null = null;

  private currentUser: { id: string; personalId: string; username: string; avatar?: string } | null = null;
  private currentPartnerId: string | null = null;
  private stateListeners: Set<StateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private coupleListeners: Set<CoupleEventListener> = new Set();

  private session: RealCallSession = {
    callId: null,
    state: 'IDLE',
    partner: null,
    isOutgoing: false,
    isMuted: false,
    isSpeakerOn: true,
    isPartnerMuted: false,
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
        // Re-verify Firestore subscription
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

  // Subscribe to real-time couple events (linking / unlinking)
  public onCoupleEvent(listener: CoupleEventListener): () => void {
    this.coupleListeners.add(listener);
    return () => this.coupleListeners.delete(listener);
  }

  // Register current authenticated user for real-time signaling
  public registerUser(userId: string, personalId: string, username: string, avatar?: string, partnerId?: string) {
    this.currentUser = { id: userId, personalId, username, avatar };
    this.currentPartnerId = partnerId || null;

    // 1. Setup Firestore incoming calls listener immediately (100% reliable across mobile devices)
    this.setupFirestoreIncomingListener();

    // 2. Connect WebSocket as fast secondary channel
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

          // If we are already in this call, ignore
          if (this.session.callId === callDoc.callId) {
            return;
          }

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

        // Flush any pending queued signals
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

        // Exponential backoff between 1s and 10s
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

  // Handle incoming signaling messages from backend
  private async handleSignalingMessage(type: string, payload: any) {
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
        console.log(`[CallManager] Received real-time sync event: ${type}`, payload);
        this.coupleListeners.forEach((listener) => {
          try {
            listener({ type: type as any, payload });
          } catch (err) {
            console.error('[CallManager] Real-time event listener execution error:', err);
          }
        });
        break;

      case 'call:incoming':
        console.log('[CALL] call:incoming received via WebSocket', payload);
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
        soundManager.playCallEnded();
        this.updateState({
          state: 'REJECTED',
          errorMessage: 'Chamada recusada pelo parceiro(a).',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:cancelled':
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({
          state: 'ENDED',
          errorMessage: 'Chamada cancelada pelo chamador.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:timeout':
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({
          state: 'MISSED',
          errorMessage: 'Sem resposta.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:ended':
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({
          state: 'ENDED',
          errorMessage: payload?.message || 'Chamada encerrada.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:partner_muted':
        this.updateState({ isPartnerMuted: !!payload.isMuted });
        break;

      case 'call:failed':
        // If it's a partner_busy message, show it
        if (payload?.reason === 'partner_busy') {
          soundManager.stopCallingTone();
          soundManager.playCallEnded();
          this.updateState({
            state: 'FAILED',
            errorMessage: payload.message || 'Parceiro ocupado em outra chamada.',
          });
          this.cleanupMediaAndPeer();
          this.scheduleAutoReset(3000);
        }
        break;
    }
  }

  // --- Public Call Control Methods ---

  // Start outgoing call to partner
  public async startCall(partner: UserAccount): Promise<boolean> {
    if (!this.currentUser) {
      this.notifyError('Usuário não autenticado.');
      return false;
    }

    if (!partner || !partner.id) {
      this.notifyError('Nenhum parceiro(a) vinculado.');
      return false;
    }

    const audioEl = this.initAudioElement();
    if (audioEl) {
      audioEl.play().catch(() => {});
    }
    console.log(`[CALL INITIATE]\ncaller=${this.currentUser.id}\nreceiver=${partner.id}`);

    // Acquire high quality microphone stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(HIGH_QUALITY_AUDIO_CONSTRAINTS);
    } catch (err: any) {
      console.error('[CallManager] Microphone permission denied:', err);
      this.updateState({
        state: 'FAILED',
        errorMessage: 'Permissão de microfone necessária para fazer a chamada.',
      });
      this.scheduleAutoReset(3000);
      return false;
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
      durationSeconds: 0,
    };
    this.notifyState();
    soundManager.startCallingTone();

    // 1. Create call document in Cloud Firestore (Guaranteed Real-Time Delivery to partner)
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

    // 4. Set 35-second ringing timeout
    if (this.ringingTimeoutTimer) clearTimeout(this.ringingTimeoutTimer);
    this.ringingTimeoutTimer = setTimeout(() => {
      if (this.session.callId === callId && this.session.state === 'CALLING') {
        console.log('[CallManager] Call ringing timeout (no answer after 35s)');
        soundManager.stopCallingTone();
        soundManager.playCallEnded();
        this.updateState({
          state: 'MISSED',
          errorMessage: 'Sem resposta.',
        });
        FirebaseService.updateCallDoc(callId, { status: 'timeout' }).catch(() => {});
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(3000);
      }
    }, 35000);

    return true;
  }

  // Accept incoming call
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

    // Acquire high quality microphone stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(HIGH_QUALITY_AUDIO_CONSTRAINTS);
    } catch (err) {
      console.error('[CallManager] Microphone access failed on accept:', err);
      this.updateState({
        state: 'FAILED',
        errorMessage: 'Permissão de microfone necessária para atender a chamada.',
      });
      this.sendSignal('call:reject', {
        callId,
        calleeId: this.currentUser?.id,
        reason: 'permission_denied',
      });
      FirebaseService.updateCallDoc(callId, { status: 'rejected', reason: 'permission_denied' }).catch(() => {});
      this.scheduleAutoReset(3000);
      return false;
    }

    this.updateState({ state: 'CONNECTING' });

    // Initialize peer connection with local audio stream
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

  // Reject incoming call
  public rejectCall() {
    const callId = this.session.callId;
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();

    if (callId) {
      this.sendSignal('call:reject', {
        callId,
        calleeId: this.currentUser?.id,
        reason: 'declined',
      });
      FirebaseService.updateCallDoc(callId, {
        status: 'rejected',
        reason: 'declined',
      }).catch(() => {});
    }

    this.cleanupMediaAndPeer();
    this.resetToIdle();
  }

  // Cancel outgoing call before answer
  public cancelCall() {
    const callId = this.session.callId;
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();

    if (callId && this.currentUser) {
      this.sendSignal('call:cancel', {
        callId,
        callerId: this.currentUser.id,
        userId: this.currentUser.id,
      });
      FirebaseService.updateCallDoc(callId, {
        status: 'cancelled',
      }).catch(() => {});
    }

    this.cleanupMediaAndPeer();
    this.resetToIdle();
  }

  // Hangup active call
  public endCall() {
    const callId = this.session.callId;
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();

    if (callId && this.currentUser) {
      this.sendSignal('call:end', {
        callId,
        userId: this.currentUser.id,
        reason: 'user_hangup',
      });
      FirebaseService.updateCallDoc(callId, {
        status: 'ended',
        reason: 'user_hangup',
      }).catch(() => {});
    }

    this.cleanupMediaAndPeer();
    this.updateState({ state: 'ENDED', errorMessage: 'Chamada encerrada.' });
    this.scheduleAutoReset(1200);
  }

  // Toggle microphone mute
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

  // Toggle speakerphone / audio output
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
        this.sendSignal('call:reject', {
          callId: payload.callId,
          calleeId: this.currentUser?.id,
          reason: 'busy',
        });
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
      durationSeconds: 0,
    };

    soundManager.startIncomingRing();
    this.notifyState();

    // Monitor Firestore call document in case caller cancels or call expires
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
        this.updateState({
          state: 'REJECTED',
          errorMessage: 'Chamada recusada pelo parceiro(a).',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 5. Call cancelled by caller
      if (callDoc.status === 'cancelled') {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({
          state: 'ENDED',
          errorMessage: 'Chamada cancelada.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 6. Call ended
      if (callDoc.status === 'ended') {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({
          state: 'ENDED',
          errorMessage: 'Chamada encerrada.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 7. Timeout (Sem resposta)
      if (callDoc.status === 'timeout' && (this.session.state === 'CALLING' || this.session.state === 'RINGING' || this.session.state === 'CONNECTING')) {
        soundManager.stopCallingTone();
        soundManager.stopIncomingRing();
        soundManager.playCallEnded();
        this.updateState({
          state: 'MISSED',
          errorMessage: 'Sem resposta.',
        });
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

    // Attach local audio track
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Bidirectional remote audio reception with the smallest supported playout buffer.
    pc.ontrack = (event) => {
      console.log('[CallManager] Remote audio track received:', event.track.id, 'readyState:', event.track.readyState);
      
      // Force instantaneous real-time playback (removes 4-5s buffer delay)
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
        audioEl.preload = 'none';
        audioEl.setAttribute('playsinline', '');

        const playAudioStream = () => {
          if (audioEl && audioEl.srcObject) {
            audioEl.play().catch((err) => {
              console.warn('[CallManager] AutoPlay blocked, attaching touch listener to unlock:', err);
              const oneTouchUnlock = () => {
                audioEl.play().catch(() => {});
                window.removeEventListener('touchstart', oneTouchUnlock);
                window.removeEventListener('click', oneTouchUnlock);
              };
              window.addEventListener('touchstart', oneTouchUnlock, { once: true, passive: true });
              window.addEventListener('click', oneTouchUnlock, { once: true, passive: true });
            });
          }
        };

        playAudioStream();

        event.track.onunmute = () => {
          console.log('[CallManager] Remote audio track unmuted!');
          playAudioStream();
        };
      }

      if (this.session.state !== 'CONNECTED') {
        this.handleCallConnected();
      }
    };

    // Candidate discovery (Trickle ICE Dual-Broadcasting)
    pc.onicecandidate = (event) => {
      if (event.candidate && this.session.callId && this.currentUser) {
        // Send via Firestore
        FirebaseService.addCallIceCandidate(this.session.callId, this.currentUser.id, event.candidate).catch(() => {});
        // Send via WebSocket
        this.sendSignal('call:ice_candidate', {
          callId: this.session.callId,
          candidate: event.candidate,
          targetUserId: this.session.partner?.id,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[CallManager] RTCPeerConnection connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.connectionRecoveryAttempts = 0;
        this.clearIceRestartTimer();
        this.handleCallConnected();
      } else if (pc.connectionState === 'disconnected') {
        console.log('[CallManager] Connection disconnected temporarily, scheduling ICE recovery...');
        this.scheduleIceRestart('connection_disconnected');
      } else if (pc.connectionState === 'failed') {
        console.log('[CallManager] Connection failed, renegotiating ICE...');
        this.scheduleIceRestart('connection_failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallManager] RTCPeerConnection iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.connectionRecoveryAttempts = 0;
        this.clearIceRestartTimer();
        this.handleCallConnected();
      } else if (pc.iceConnectionState === 'disconnected') {
        console.log('[CallManager] ICE disconnected temporarily, scheduling recovery...');
        this.scheduleIceRestart('ice_disconnected');
      } else if (pc.iceConnectionState === 'failed') {
        console.log('[CallManager] ICE failed, renegotiating ICE...');
        this.scheduleIceRestart('ice_failed');
      }
    };

    return pc;
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
        this.localStream.getAudioTracks().forEach((track) => {
          if (!senders.some((s) => s.track?.id === track.id)) {
            pc!.addTrack(track, this.localStream!);
          }
        });
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      // Enhance SDP with WhatsApp-grade HD Opus audio settings
      const enhancedSdp = optimizeOpusSdp(offer.sdp || '');
      const enhancedOffer: RTCSessionDescriptionInit = { type: offer.type, sdp: enhancedSdp };
      await pc.setLocalDescription(enhancedOffer);

      const sdpPayload = { type: enhancedOffer.type, sdp: enhancedOffer.sdp };

      if (this.session.callId) {
        // 1. Write offer to Firestore
        FirebaseService.updateCallDoc(this.session.callId, {
          offer: sdpPayload,
          status: 'connecting',
        }).catch(() => {});

        // 2. Send offer via WebSocket
        this.sendSignal('call:offer', {
          callId: this.session.callId,
          sdp: enhancedOffer,
          targetUserId: this.session.partner?.id,
        });
      }
    } catch (err) {
      console.error('[CallManager] Error creating SDP offer:', err);
      this.handleCallFailed('Erro ao negociar conexão de áudio.');
    }
  }

  /**
   * Recover a mobile call whose NAT route disappeared after being connected.
   * restartIce() alone only marks the next offer for an ICE restart; it does
   * not send that offer. Renegotiating here keeps both phones on the same
   * transport after a Wi-Fi/mobile handoff or a stale UDP mapping.
   */
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

      if (
        !this.session.callId ||
        this.session.callId !== callId ||
        this.session.state !== 'CONNECTED' ||
        !this.peerConnection
      ) {
        return;
      }

      const pc = this.peerConnection;
      if (pc.connectionState === 'connected' && (
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed'
      )) {
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
    if (
      this.isRestartingIce ||
      !this.peerConnection ||
      !this.session.callId ||
      !this.currentUser ||
      this.session.state !== 'CONNECTED'
    ) {
      return;
    }

    const pc = this.peerConnection;
    const callId = this.session.callId;
    this.isRestartingIce = true;

    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }

      const offer = await pc.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      const enhancedSdp = optimizeOpusSdp(offer.sdp || '');
      const enhancedOffer: RTCSessionDescriptionInit = {
        type: offer.type,
        sdp: enhancedSdp,
      };

      await pc.setLocalDescription(enhancedOffer);
      const sdpPayload = { type: enhancedOffer.type, sdp: enhancedOffer.sdp };

      // Both channels are intentional: WebSocket is immediate and Firestore
      // allows the repair to complete after a socket reconnection.
      FirebaseService.updateCallDoc(callId, {
        offer: sdpPayload,
        status: 'connecting',
        iceRestartedAt: new Date().toISOString(),
      }).catch(() => {});

      this.sendSignal('call:offer', {
        callId,
        sdp: enhancedOffer,
        targetUserId: this.session.partner?.id,
      });
    } catch (err) {
      console.warn('[CallManager] ICE renegotiation attempt failed:', err);
    } finally {
      this.isRestartingIce = false;
    }
  }

  private async handleReceivedOffer(sdp: RTCSessionDescriptionInit) {
    try {
      const offerSdp = sdp?.sdp || '';
      if (
        offerSdp &&
        (offerSdp === this.processedRemoteOfferSdp ||
          offerSdp === this.processingRemoteOfferSdp)
      ) {
        return;
      }
      this.processingRemoteOfferSdp = offerSdp || null;

      let pc = this.peerConnection;
      if (!pc || pc.signalingState === 'closed') {
        pc = this.createPeerConnection();
      } else if (this.localStream) {
        const senders = pc.getSenders();
        this.localStream.getAudioTracks().forEach((track) => {
          if (!senders.some((s) => s.track?.id === track.id)) {
            pc!.addTrack(track, this.localStream!);
          }
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.processedRemoteOfferSdp = offerSdp;
      await this.processPendingIceCandidates();

      const answer = await pc.createAnswer();
      // Enhance SDP with WhatsApp-grade HD Opus audio settings
      const enhancedSdp = optimizeOpusSdp(answer.sdp || '');
      const enhancedAnswer: RTCSessionDescriptionInit = { type: answer.type, sdp: enhancedSdp };
      await pc.setLocalDescription(enhancedAnswer);

      const answerPayload = { type: enhancedAnswer.type, sdp: enhancedAnswer.sdp };

      if (this.session.callId) {
        // 1. Write answer to Firestore
        FirebaseService.updateCallDoc(this.session.callId, {
          answer: answerPayload,
          status: 'connected',
        }).catch(() => {});

        // 2. Send answer via WebSocket
        this.sendSignal('call:answer', {
          callId: this.session.callId,
          sdp: enhancedAnswer,
          targetUserId: this.session.partner?.id,
        });

        setTimeout(() => {
          if (this.session.state === 'CONNECTING') {
            this.handleCallConnected();
          }
        }, 300);
      }
    } catch (err) {
      console.error('[CallManager] Error handling SDP offer:', err);
      this.handleCallFailed('Erro ao responder oferta de áudio.');
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
          }, 300);
        }
      }
    } catch (err) {
      console.error('[CallManager] Error handling SDP answer:', err);
    }
  }

  private async handleReceivedIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (
        this.peerConnection &&
        this.peerConnection.remoteDescription &&
        this.peerConnection.remoteDescription.type
      ) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingIceCandidates.push(candidate);
      }
    } catch (err) {
      console.error('[CallManager] Error adding ICE candidate:', err);
    }
  }

  private handleCallConnected() {
    if (this.session.state === 'CONNECTED') return;
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallConnected();
    this.updateState({ state: 'CONNECTED' });
    this.startDurationTimer();
  }

  private handleCallFailed(reason: string) {
    soundManager.stopCallingTone();
    soundManager.stopIncomingRing();
    soundManager.playCallEnded();
    this.updateState({
      state: 'FAILED',
      errorMessage: reason,
    });
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

  private cleanupMediaAndPeer() {
    this.stopDurationTimer();
    this.clearIceRestartTimer();
    this.connectionRecoveryAttempts = 0;
    this.isRestartingIce = false;
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

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
    }
  }

  private scheduleAutoReset(delayMs = 2000) {
    setTimeout(() => {
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

  private resetToIdle() {
    this.cleanupMediaAndPeer();
    this.session = {
      callId: null,
      state: 'IDLE',
      partner: null,
      isOutgoing: false,
      isMuted: false,
      isSpeakerOn: true,
      isPartnerMuted: false,
      durationSeconds: 0,
    };
    this.notifyState();
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
