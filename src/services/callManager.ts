import { RealCallSession, CallState, CallPartnerInfo, UserAccount, VideoQualityLevel } from '../types';
import { DEFAULT_ICE_SERVERS } from './webrtcConfig';
import { FirebaseService } from './firebaseService';
import { Unsubscribe } from 'firebase/firestore';

type StateListener = (session: RealCallSession) => void;
type ErrorListener = (error: string) => void;
export type CoupleEventType = 'couple:linked' | 'couple:unlinked' | 'tasks:updated' | 'chat:message' | 'chat:read' | 'arena:updated' | 'user:updated';
export type CoupleEventListener = (event: { type: CoupleEventType; payload: any }) => void;

/**
 * Optimizes the SDP to configure Opus audio and high-clarity, ultra-low latency, fluid HD video:
 * Audio:
 * - 32 kbps HD Speech Bitrate with VBR and inband FEC (WhatsApp voice standard)
 * - 20ms frame delivery (ptime=20)
 * Video:
 * - 4.5 Mbps transport bandwidth (b=AS:4500, b=TIAS:4500000)
 * - Guaranteed min 2.5 Mbps to eliminate pixelation and macroblocking during movement (x-google-min-bitrate=2500)
 * - Immediate HD startup at 3.5 Mbps (x-google-start-bitrate=3500)
 * - Peak 5.0 Mbps for sudden high-motion scenes (x-google-max-bitrate=5000)
 */
function optimizeWebRtcSdp(rawSdp: string, isVideo: boolean = false): string {
  if (!rawSdp) return rawSdp;
  let lines = rawSdp.split('\r\n');

  // 1. Optimize Opus Audio Codec (HD voice, low latency 20ms packets, inband FEC, VBR)
  let opusPt: string | null = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPt = match[1];
      break;
    }
  }

  if (opusPt) {
    const opusParams = `a=fmtp:${opusPt} minptime=10;ptime=20;maxaveragebitrate=32000;maxplaybackrate=48000;stereo=0;sprop-stereo=0;useinbandfec=1;cbr=0`;
    let hasFmtp = false;
    lines = lines.map((line) => {
      if (line.startsWith(`a=fmtp:${opusPt}`)) {
        hasFmtp = true;
        return opusParams;
      }
      return line;
    });

    if (!hasFmtp) {
      const rtpmapIdx = lines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt}`));
      if (rtpmapIdx !== -1) {
        lines.splice(rtpmapIdx + 1, 0, opusParams);
      }
    }
  }

  // 2. High-Definition 720p 30 FPS Video SDP Optimization (WhatsApp-grade, zero blur on motion)
  if (isVideo) {
    // Inject b=AS:4500 (4.5 Mbps) and b=TIAS:4500000 directly under m=video section
    const videoIdx = lines.findIndex((l) => l.startsWith('m=video'));
    if (videoIdx !== -1) {
      let insertIdx = videoIdx + 1;
      if (insertIdx < lines.length && lines[insertIdx].startsWith('c=')) {
        insertIdx++;
      }
      while (insertIdx < lines.length && lines[insertIdx].startsWith('b=')) {
        lines.splice(insertIdx, 1);
      }
      lines.splice(insertIdx, 0, 'b=AS:4500', 'b=TIAS:4500000');
    }

    // Enhance video codec fmtp lines with Google min/start/max bitrate params
    const videoPts: string[] = [];
    for (const line of lines) {
      const match = line.match(/^a=rtpmap:(\d+)\s+(VP8|VP9|H264)\/90000/i);
      if (match) {
        videoPts.push(match[1]);
      }
    }

    for (const pt of videoPts) {
      let foundFmtp = false;
      lines = lines.map((line) => {
        if (line.startsWith(`a=fmtp:${pt}`)) {
          foundFmtp = true;
          const cleaned = line
            .replace(/;?x-google-min-bitrate=\d+/g, '')
            .replace(/;?x-google-start-bitrate=\d+/g, '')
            .replace(/;?x-google-max-bitrate=\d+/g, '');
          return `${cleaned};x-google-min-bitrate=2500;x-google-start-bitrate=3500;x-google-max-bitrate=5000`;
        }
        return line;
      });

      if (!foundFmtp) {
        const rtpmapIdx = lines.findIndex((l) => l.startsWith(`a=rtpmap:${pt}`));
        if (rtpmapIdx !== -1) {
          lines.splice(
            rtpmapIdx + 1,
            0,
            `a=fmtp:${pt} x-google-min-bitrate=2500;x-google-start-bitrate=3500;x-google-max-bitrate=5000`
          );
        }
      }
    }
  }

  return lines.join('\r\n');
}

// WebRTC Audio Constraints for Crystal-Clear, Ultra-Low Latency, Zero-Echo Voice Calls
const OPTIMAL_VOIP_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  },
  video: false,
};

// WebRTC Video & Audio Constraints optimized for real-time mobile camera capture:
// - Native 720p HD (1280x720) without restrictive max/min limits that clash with portrait (vertical) mobile sensors
// - 30 FPS fluid real-time motion capture with natural exposure in darker rooms
const OPTIMAL_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  },
  video: {
    facingMode: 'user',
    width: { min: 640, ideal: 1280 },
    height: { min: 480, ideal: 720 },
    frameRate: { min: 24, ideal: 30, max: 30 },
  },
};

const FALLBACK_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  },
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
};

class CallManager {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteVideoStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private durationInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private ringingTimeoutTimer: NodeJS.Timeout | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private pendingOfferSdp: RTCSessionDescriptionInit | null = null;
  private wakeLock: any = null;
  private currentVideoQuality: VideoQualityLevel = 'auto';

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
    callType: 'audio',
    state: 'IDLE',
    partner: null,
    isOutgoing: false,
    isMuted: false,
    isSpeakerOn: true,
    isCameraOff: false,
    isPartnerMuted: false,
    isPartnerCameraOff: false,
    videoQuality: 'auto',
    durationSeconds: 0,
  };

  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private pendingSignals: Array<{ type: string; payload: any }> = [];

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

        // Re-acquire WakeLock if we are in an active call
        if (this.session.state === 'CALLING' || this.session.state === 'RINGING' || this.session.state === 'CONNECTING' || this.session.state === 'CONNECTED') {
          this.requestWakeLock();
        }
      }
    };

    window.addEventListener('focus', handleActiveState);
    window.addEventListener('online', handleActiveState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleActiveState();
      }
    });

    // Cleanly terminate call on both sides ONLY if a user closes or unloads the tab
    window.addEventListener('beforeunload', () => {
      if (this.session.callId && this.session.state !== 'IDLE' && this.session.state !== 'ENDED') {
        this.endCall();
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
        this.currentUser.personalId,
        (callDoc) => {
          if (!callDoc || !callDoc.callId) return;

          // If we are already in this call, ignore
          if (this.session.callId === callDoc.callId) {
            return;
          }

          // Check if truly in an active ongoing call
          const isBusy =
            this.session.state === 'CALLING' ||
            this.session.state === 'RINGING' ||
            this.session.state === 'CONNECTING' ||
            this.session.state === 'CONNECTED';

          if (isBusy) {
            console.log('[CallManager] Busy with another call, ignoring incoming call:', callDoc.callId);
            return;
          }

          // If state was in a finished state (ENDED, FAILED, MISSED, REJECTED), reset cleanly before accepting
          if (this.session.state !== 'IDLE') {
            this.resetToIdle();
          }

          console.log('[CallManager] Incoming call from Firestore snapshot:', callDoc);
          this.onIncomingCall({
            callId: callDoc.callId,
            callerId: callDoc.callerId,
            callerPersonalId: callDoc.callerPersonalId,
            callerName: callDoc.callerName,
            callerAvatar: callDoc.callerAvatar || '❤️',
            callType: callDoc.callType === 'video' ? 'video' : 'audio',
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
        break;

      case 'call:accepted':
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        this.updateState({ state: 'CONNECTING' });
        if (this.session.isOutgoing) {
          await this.createAndSendOffer();
          if (this.session.callId) {
            this.listenToIceCandidates(this.session.callId);
          }
        }
        break;

      case 'call:connected':
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        if (this.session.state === 'CONNECTING') {
          this.handleCallConnected();
        }
        break;

      case 'call:offer':
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        if (this.session.state === 'RINGING') {
          console.log('[CallManager] Offer received while ringing. Queuing offer until call is accepted.');
          this.pendingOfferSdp = payload.sdp;
        } else {
          await this.handleReceivedOffer(payload.sdp);
        }
        break;

      case 'call:request_keyframe':
        console.log('[CallManager] Partner requested immediate keyframe, triggering encoder update.');
        this.applySenderOptimizations();
        break;

      case 'call:answer':
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        await this.handleReceivedAnswer(payload.sdp);
        break;

      case 'call:ice_candidate':
        await this.handleReceivedIceCandidate(payload.candidate);
        break;

      case 'call:rejected':
        if (payload?.callId && this.session.callId && payload.callId !== this.session.callId) {
          break;
        }
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        this.updateState({
          state: 'REJECTED',
          errorMessage: 'Chamada recusada pelo parceiro(a).',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:cancelled':
        if (payload?.callId && this.session.callId && payload.callId !== this.session.callId) {
          break;
        }
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        this.updateState({
          state: 'ENDED',
          errorMessage: 'Chamada cancelada pelo chamador.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:timeout':
        // CRITICAL: NEVER terminate an active conversation on timeout!
        if (this.session.state === 'CONNECTED' || this.session.state === 'CONNECTING') {
          console.warn('[CallManager] Ignored call:timeout because call is already in progress/connected');
          break;
        }
        if (payload?.callId && this.session.callId && payload.callId !== this.session.callId) {
          break;
        }
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        this.updateState({
          state: 'MISSED',
          errorMessage: 'Sem resposta.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset();
        break;

      case 'call:ended':
        if (payload?.callId && this.session.callId && payload.callId !== this.session.callId) {
          console.log('[CallManager] Ignored call:ended for outdated callId:', payload.callId);
          break;
        }
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

      case 'call:partner_camera_state':
        this.updateState({ isPartnerCameraOff: !!payload.isCameraOff });
        break;

      case 'call:request_keyframe':
        if (this.peerConnection) {
          const senders = this.peerConnection.getSenders();
          for (const sender of senders) {
            if (sender.track && sender.track.kind === 'video' && typeof (sender as any).generateKeyFrame === 'function') {
              try {
                (sender as any).generateKeyFrame();
              } catch (e) {}
            }
          }
        }
        break;

      case 'call:failed':
        // If it's a partner_busy message, show it
        if (payload?.reason === 'partner_busy') {
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

  // Get local media stream (for video preview)
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Get remote media stream (for remote video rendering)
  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  // Get dedicated remote video stream (ensures immediate rendering with zero lag)
  public getRemoteVideoStream(): MediaStream | null {
    return this.remoteVideoStream;
  }

  // Start outgoing call to partner (audio or video)
  public async startCall(partner: UserAccount, callType: 'audio' | 'video' = 'audio'): Promise<boolean> {
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
    const isVideo = callType === 'video';
    console.log(`[CALL INITIATE]\ncaller=${this.currentUser.id}\nreceiver=${partner.id}\ntype=${callType}`);

    // Acquire stream (audio only for voice call, audio + video for video call)
    try {
      if (isVideo) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(OPTIMAL_VIDEO_CONSTRAINTS);
        } catch (constraintErr) {
          console.warn('[CallManager] High-res video constraints failed, trying fallback:', constraintErr);
          this.localStream = await navigator.mediaDevices.getUserMedia(FALLBACK_VIDEO_CONSTRAINTS);
        }
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia(OPTIMAL_VOIP_AUDIO_CONSTRAINTS);
      }
    } catch (err: any) {
      console.error('[CallManager] Media permission denied:', err);
      this.updateState({
        state: 'FAILED',
        errorMessage: isVideo
          ? 'Permissão de câmera e microfone necessária para chamada de vídeo.'
          : 'Permissão de microfone necessária para fazer a chamada.',
      });
      this.scheduleAutoReset(3000);
      return false;
    }

    this.requestWakeLock();

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    this.session = {
      callId,
      callType,
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
      isCameraOff: false,
      isPartnerMuted: false,
      isPartnerCameraOff: false,
      durationSeconds: 0,
    };
    this.notifyState();

    // 1. Create call document in Cloud Firestore (Guaranteed Real-Time Delivery to partner)
    try {
      await FirebaseService.createCallDoc({
        callId,
        callType,
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
      callType,
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

  // Convenience method for initiating video calls specifically
  public async startVideoCall(partner: UserAccount): Promise<boolean> {
    return this.startCall(partner, 'video');
  }

  // Accept incoming call
  public async acceptCall(): Promise<boolean> {
    if (!this.session.callId || this.session.state !== 'RINGING') {
      return false;
    }

    if (this.ringingTimeoutTimer) {
      clearTimeout(this.ringingTimeoutTimer);
      this.ringingTimeoutTimer = null;
    }

    const callId = this.session.callId;
    const isVideo = this.session.callType === 'video';
    const audioEl = this.initAudioElement();
    if (audioEl) {
      audioEl.play().catch(() => {});
    }

    // Acquire stream (mic only for audio call; camera + mic for video call)
    try {
      if (isVideo) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(OPTIMAL_VIDEO_CONSTRAINTS);
        } catch (constraintErr) {
          console.warn('[CallManager] High-res video constraints failed on accept, trying fallback:', constraintErr);
          this.localStream = await navigator.mediaDevices.getUserMedia(FALLBACK_VIDEO_CONSTRAINTS);
        }
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia(OPTIMAL_VOIP_AUDIO_CONSTRAINTS);
      }
    } catch (err) {
      console.error('[CallManager] Media access failed on accept:', err);
      this.updateState({
        state: 'FAILED',
        errorMessage: isVideo
          ? 'Permissão de câmera e microfone necessária para atender a chamada de vídeo.'
          : 'Permissão de microfone necessária para atender a chamada.',
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

    this.requestWakeLock();

    this.updateState({ state: 'CONNECTING' });

    // Initialize peer connection with local media stream
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

    // 4. If an offer arrived while ringing, answer it immediately with our initialized camera/mic
    if (this.pendingOfferSdp) {
      console.log('[CallManager] Processing stored SDP offer on accept with active media stream.');
      const queuedOffer = this.pendingOfferSdp;
      this.pendingOfferSdp = null;
      await this.handleReceivedOffer(queuedOffer);
    }

    return true;
  }

  // Reject incoming call
  public rejectCall() {
    const callId = this.session.callId;

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

    if (callId && this.currentUser) {
      this.sendSignal('call:end', {
        callId,
        userId: this.currentUser.id,
        targetUserId: this.session.partner?.id,
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

  // Toggle speakerphone / audio output (adjusts output volume without cutting off remote audio)
  public toggleSpeaker() {
    const nextSpeaker = !this.session.isSpeakerOn;
    if (this.remoteAudio) {
      this.remoteAudio.volume = nextSpeaker ? 1.0 : 0.7;
      this.remoteAudio.muted = false;
    }
    this.updateState({ isSpeakerOn: nextSpeaker });
  }

  // Toggle camera (video track enable/disable)
  public toggleCamera() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      const nextCameraOff = !this.session.isCameraOff;
      videoTrack.enabled = !nextCameraOff;
      this.updateState({ isCameraOff: nextCameraOff });

      if (this.session.callId && this.currentUser) {
        this.sendSignal('call:camera_state', {
          callId: this.session.callId,
          userId: this.currentUser.id,
          isCameraOff: nextCameraOff,
        });
      }
    }
  }

  // Switch between front and rear camera on mobile devices
  public async switchCamera(): Promise<boolean> {
    if (!this.localStream || this.session.callType !== 'video') return false;
    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    if (!currentVideoTrack) return false;

    try {
      const currentSettings = currentVideoTrack.getSettings();
      const currentFacingMode = currentSettings.facingMode || 'user';
      const targetFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      let newStream: MediaStream;
      const switchConstraints = {
        facingMode: targetFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      };
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { ...switchConstraints, facingMode: { exact: targetFacingMode } },
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: switchConstraints,
        });
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return false;

      // Replace track on RTCPeerConnection sender
      if (this.peerConnection) {
        const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
          await this.applySenderOptimizations();
        }
      }

      // Stop old video track and swap in localStream
      currentVideoTrack.stop();
      this.localStream.removeTrack(currentVideoTrack);
      this.localStream.addTrack(newVideoTrack);

      newVideoTrack.enabled = !this.session.isCameraOff;
      this.notifyState();
      return true;
    } catch (err) {
      console.warn('[CallManager] Error switching camera:', err);
      return false;
    }
  }

  // --- Real-time WebRTC & Firestore Synchronization ---

  private onIncomingCall(payload: {
    callId: string;
    callerId: string;
    callerPersonalId: string;
    callerName: string;
    callerAvatar: string;
    callType?: 'voice' | 'video' | 'audio';
  }) {
    const isVideo = payload.callType === 'video';
    console.log(`[CALL INCOMING]\ncaller=${payload.callerId} (${payload.callerName})\ncallId=${payload.callId}\ntype=${isVideo ? 'video' : 'voice'}`);

    const isBusy =
      this.session.state === 'CALLING' ||
      this.session.state === 'RINGING' ||
      this.session.state === 'CONNECTING' ||
      this.session.state === 'CONNECTED';

    if (isBusy) {
      if (this.session.callId !== payload.callId) {
        this.sendSignal('call:reject', {
          callId: payload.callId,
          calleeId: this.currentUser?.id,
          reason: 'busy',
        });
      }
      return;
    }

    // Clean up any stale media/state if previous call just ended
    if (this.session.state !== 'IDLE') {
      this.resetToIdle();
    }

    this.session = {
      callId: payload.callId,
      callType: isVideo ? 'video' : 'audio',
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
      isCameraOff: false,
      isPartnerMuted: false,
      isPartnerCameraOff: false,
      durationSeconds: 0,
    };

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
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        if (this.session.state === 'CALLING') {
          this.updateState({ state: 'CONNECTING' });
          await this.createAndSendOffer();
          this.listenToIceCandidates(callId);
        }
      }

      // 2. Call Offer received by callee
      if (callDoc.offer && !this.session.isOutgoing) {
        if (this.session.state === 'RINGING') {
          console.log('[CallManager] Firestore offer arrived during ringing, saved until accepted.');
          this.pendingOfferSdp = callDoc.offer;
        } else if (this.session.state === 'CONNECTING') {
          if (this.ringingTimeoutTimer) {
            clearTimeout(this.ringingTimeoutTimer);
            this.ringingTimeoutTimer = null;
          }
          if (!this.peerConnection || !this.peerConnection.remoteDescription) {
            await this.handleReceivedOffer(callDoc.offer);
          }
        }
      }

      // 3. Call Answer received by caller
      if (callDoc.answer && this.session.isOutgoing && (this.session.state === 'CONNECTING' || this.session.state === 'CALLING')) {
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        if (this.peerConnection && !this.peerConnection.remoteDescription) {
          await this.handleReceivedAnswer(callDoc.answer);
        }
      }

      // 4. Call rejected
      if (callDoc.status === 'rejected') {
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        this.updateState({
          state: 'REJECTED',
          errorMessage: 'Chamada recusada pelo parceiro(a).',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 5. Call cancelled by caller
      if (callDoc.status === 'cancelled') {
        if (this.ringingTimeoutTimer) {
          clearTimeout(this.ringingTimeoutTimer);
          this.ringingTimeoutTimer = null;
        }
        this.updateState({
          state: 'ENDED',
          errorMessage: 'Chamada cancelada.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 6. Call ended
      if (callDoc.status === 'ended') {
        this.updateState({
          state: 'ENDED',
          errorMessage: 'Chamada encerrada.',
        });
        this.cleanupMediaAndPeer();
        this.scheduleAutoReset(1500);
      }

      // 7. Timeout (Sem resposta) - ONLY trigger if strictly in CALLING or RINGING (nobody answered)
      if (callDoc.status === 'timeout') {
        if (this.session.state === 'CALLING' || this.session.state === 'RINGING') {
          if (this.ringingTimeoutTimer) {
            clearTimeout(this.ringingTimeoutTimer);
            this.ringingTimeoutTimer = null;
          }
          this.updateState({
            state: 'MISSED',
            errorMessage: 'Sem resposta.',
          });
          this.cleanupMediaAndPeer();
          this.scheduleAutoReset(2000);
        } else {
          console.warn('[CallManager] Ignored Firestore status timeout because call is already active/connecting');
        }
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

  // Video transmission is permanently set to high definition 720p 30 FPS fluid mode
  public async setVideoQuality(_quality?: VideoQualityLevel): Promise<void> {
    this.currentVideoQuality = 'max';
    this.updateState({ videoQuality: 'max' });
    await this.applySenderOptimizations();
  }

  public getVideoQuality(): VideoQualityLevel {
    return 'max';
  }

  // Configure high-definition, fluid, zero-latency sender parameters (WhatsApp/FaceTime quality)
  private async applySenderOptimizations() {
    if (!this.peerConnection) return;
    try {
      const senders = this.peerConnection.getSenders();
      for (const sender of senders) {
        if (!sender.track) continue;

        if (sender.track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }

          // Full 720p HD lock without downscaling
          // degradationPreference 'maintain-resolution' ensures that movements never cause blurry macroblocks/pixelation
          params.encodings[0].scaleResolutionDownBy = 1.0;
          params.encodings[0].maxBitrate = 4_500_000; // 4.5 Mbps
          params.encodings[0].maxFramerate = 30;
          params.encodings[0].networkPriority = 'high';
          params.degradationPreference = 'maintain-resolution';

          await sender.setParameters(params).catch((e) => {
            console.warn('[CallManager] Could not set video sender parameters:', e);
          });

          // Trigger immediate clean keyframe generation if browser supports it
          if (typeof (sender as any).generateKeyFrame === 'function') {
            try {
              (sender as any).generateKeyFrame();
            } catch (e) {}
          }
        } else if (sender.track.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 32_000; // 32 kbps HD voice

          await sender.setParameters(params).catch((e) => {
            console.warn('[CallManager] Could not set audio sender parameters:', e);
          });
        }
      }
    } catch (err) {
      console.warn('[CallManager] applySenderOptimizations error:', err);
    }
  }

  // Configure low-latency playback on audio receiver without disrupting video jitter buffer
  private applyReceiverOptimizations() {
    if (!this.peerConnection) return;
    try {
      const receivers = this.peerConnection.getReceivers();
      for (const receiver of receivers) {
        if (!receiver.track) continue;

        if (receiver.track.kind === 'audio') {
          if ('playoutDelayHint' in receiver) {
            try {
              (receiver as any).playoutDelayHint = 0;
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn('[CallManager] applyReceiverOptimizations error:', err);
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

    // Attach local media tracks under unified local stream for lip-sync and optimal RTCP multiplexing
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Prioritize VP8 (smooth motion, temporal layers) and H.264
    if (typeof RTCRtpReceiver !== 'undefined' && typeof RTCRtpReceiver.getCapabilities === 'function') {
      try {
        const capabilities = RTCRtpReceiver.getCapabilities('video');
        if (capabilities && capabilities.codecs) {
          const vp8Codecs = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/vp8');
          const h264Codecs = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
          const otherCodecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() !== 'video/vp8' && c.mimeType.toLowerCase() !== 'video/h264'
          );
          const preferredCodecs = [...vp8Codecs, ...h264Codecs, ...otherCodecs];

          pc.getTransceivers().forEach((transceiver) => {
            if (transceiver.receiver.track?.kind === 'video' || transceiver.sender.track?.kind === 'video') {
              try {
                transceiver.setCodecPreferences(preferredCodecs);
              } catch (e) {}
            }
          });
        }
      } catch (e) {
        console.warn('[CallManager] Could not set codec preferences:', e);
      }
    }

    // Bidirectional remote media reception with crystal-clear voice and video
    pc.ontrack = (event) => {
      console.log('[CallManager] Remote track received:', event.track.kind, event.track.id, 'readyState:', event.track.readyState);

      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      
      if (!this.remoteStream) {
        this.remoteStream = stream;
      } else if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }

      if (event.track.kind === 'video') {
        this.remoteVideoStream = new MediaStream([event.track]);
        // Ask sender to produce a clean keyframe immediately so decoding starts instantly in crisp HD
        if (this.session.callId && this.session.partner?.id) {
          this.sendSignal('call:request_keyframe', {
            callId: this.session.callId,
            targetUserId: this.session.partner.id,
          });
        }
      }

      // Apply receiver optimizations (minimal jitter buffer target and 0-delay playout)
      this.applyReceiverOptimizations();

      // Audio is played with full volume and crystal clarity
      if (event.track.kind === 'audio') {
        const audioEl = this.initAudioElement();
        if (audioEl) {
          const pureAudioStream = new MediaStream([event.track]);
          audioEl.srcObject = pureAudioStream;
          audioEl.volume = 1.0;
          audioEl.muted = false;

          const playAudioStream = () => {
            if (audioEl && audioEl.srcObject) {
              audioEl.play().catch((err) => {
                console.warn('[CallManager] AutoPlay blocked, attaching touch listener to unlock:', err);
                const oneTouchUnlock = () => {
                  if (audioEl && audioEl.srcObject) {
                    audioEl.play().catch(() => {});
                  }
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
      }

      this.notifyState();

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
        this.applySenderOptimizations();
        this.applyReceiverOptimizations();
        this.handleCallConnected();
      } else if (pc.connectionState === 'disconnected') {
        console.log('[CallManager] Connection disconnected temporarily, waiting for self-recovery...');
      } else if (pc.connectionState === 'failed') {
        console.log('[CallManager] Connection failed, attempting ICE restart...');
        if (typeof pc.restartIce === 'function') {
          try {
            pc.restartIce();
          } catch (e) {}
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallManager] RTCPeerConnection iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.applySenderOptimizations();
        this.applyReceiverOptimizations();
        this.handleCallConnected();
      } else if (pc.iceConnectionState === 'disconnected') {
        console.log('[CallManager] ICE disconnected temporarily, maintaining call...');
      } else if (pc.iceConnectionState === 'failed') {
        if (typeof pc.restartIce === 'function') {
          try {
            pc.restartIce();
          } catch (e) {}
        }
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
        this.localStream.getTracks().forEach((track) => {
          if (!senders.some((s) => s.track?.id === track.id)) {
            pc!.addTrack(track, this.localStream!);
          }
        });
      }

      const isVideo = this.session.callType === 'video';
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });

      // Enhance SDP with WhatsApp-grade HD Opus audio settings and low-latency video settings
      const enhancedSdp = optimizeWebRtcSdp(offer.sdp || '', isVideo);
      const enhancedOffer: RTCSessionDescriptionInit = { type: offer.type, sdp: enhancedSdp };
      await pc.setLocalDescription(enhancedOffer);
      await this.applySenderOptimizations();

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

  private async handleReceivedOffer(sdp: RTCSessionDescriptionInit) {
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

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.processPendingIceCandidates();

      const isVideo = this.session.callType === 'video';
      const answer = await pc.createAnswer();
      // Enhance SDP with WhatsApp-grade HD Opus audio settings and low-latency video settings
      const enhancedSdp = optimizeWebRtcSdp(answer.sdp || '', isVideo);
      const enhancedAnswer: RTCSessionDescriptionInit = { type: answer.type, sdp: enhancedSdp };
      await pc.setLocalDescription(enhancedAnswer);
      await this.applySenderOptimizations();

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
    }
  }

  private async handleReceivedAnswer(sdp: RTCSessionDescriptionInit) {
    try {
      if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
        if (this.peerConnection.signalingState === 'have-local-offer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
          await this.processPendingIceCandidates();
          await this.applySenderOptimizations();
          this.applyReceiverOptimizations();

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
    if (this.ringingTimeoutTimer) {
      clearTimeout(this.ringingTimeoutTimer);
      this.ringingTimeoutTimer = null;
    }
    this.requestWakeLock();
    this.applySenderOptimizations();
    this.applyReceiverOptimizations();
    this.updateState({ state: 'CONNECTED' });
    this.startDurationTimer();

    // Confirm connected state on server and Firestore
    if (this.session.callId) {
      this.sendSignal('call:connected', {
        callId: this.session.callId,
        userId: this.currentUser?.id,
      });
      FirebaseService.updateCallDoc(this.session.callId, {
        status: 'connected',
        connectedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  private handleCallFailed(reason: string) {
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
    this.releaseWakeLock();

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

    this.pendingOfferSdp = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.remoteVideoStream = null;

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    if (this.remoteAudio) {
      try {
        this.remoteAudio.pause();
      } catch (e) {}
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
      callType: 'audio',
      state: 'IDLE',
      partner: null,
      isOutgoing: false,
      isMuted: false,
      isSpeakerOn: true,
      isCameraOff: false,
      isPartnerMuted: false,
      isPartnerCameraOff: false,
      videoQuality: this.currentVideoQuality,
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
