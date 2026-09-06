import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import { userStore } from './userStore';

export interface ClientConnection {
  ws: WebSocket;
  userId: string;
  personalId: string;
  username: string;
  partnerId?: string;
  currentCallId?: string | null;
  lastPing: number;
}

export interface ActiveCall {
  callId: string;
  callerId: string;
  callerPersonalId: string;
  callerName: string;
  callerAvatar: string;
  calleeId: string;
  calleePersonalId: string;
  calleeName?: string;
  callType?: 'voice' | 'video' | 'audio';
  status: 'calling' | 'connecting' | 'connected';
  createdAt: number;
  connectedAt?: number;
  timeoutTimer?: NodeJS.Timeout;
}

export class CallSignalingServer {
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map(); // userId -> ClientConnection
  private activeCalls: Map<string, ActiveCall> = new Map(); // callId -> ActiveCall
  private pingInterval: NodeJS.Timeout;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWss();

    // Explicit upgrade routing to prevent conflicts with Vite dev server
    server.on('upgrade', (request, socket, head) => {
      const url = request.url || '';
      if (url.startsWith('/ws/call')) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    // Application & WebSocket Heartbeat to keep connection alive through proxies
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, userId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.ping();
          } catch {
            this.handleDisconnect(userId, client.ws);
          }
        } else if (client.ws.readyState === WebSocket.CLOSED || client.ws.readyState === WebSocket.CLOSING) {
          this.handleDisconnect(userId, client.ws);
        } else if (now - client.lastPing > 90000) {
          console.warn(`[Signaling] Heartbeat timeout for user ${userId} (>90s). Closing stale connection.`);
          try {
            client.ws.close();
          } catch {}
          this.handleDisconnect(userId, client.ws);
        }
      });
    }, 15000);
  }

  private setupWss() {
    this.wss.on('connection', (ws: WebSocket) => {
      let registeredUserId: string | null = null;

      ws.on('pong', () => {
        if (registeredUserId && this.clients.has(registeredUserId)) {
          const client = this.clients.get(registeredUserId)!;
          if (client.ws === ws) {
            client.lastPing = Date.now();
          }
        }
      });

      ws.on('message', (rawData: string) => {
        try {
          const message = JSON.parse(rawData.toString());
          const { type, payload } = message;

          switch (type) {
            case 'register':
              registeredUserId = this.handleRegister(ws, payload);
              break;

            case 'heartbeat':
              this.handleHeartbeat(ws, payload, registeredUserId);
              break;

            case 'call:initiate':
              this.handleCallInitiate(ws, payload);
              break;

            case 'call:accept':
              this.handleCallAccept(ws, payload);
              break;

            case 'call:reject':
              this.handleCallReject(ws, payload);
              break;

            case 'call:cancel':
              this.handleCallCancel(ws, payload);
              break;

            case 'call:offer':
              this.handleCallOffer(ws, payload);
              break;

            case 'call:answer':
              this.handleCallAnswer(ws, payload);
              break;

            case 'call:ice_candidate':
              this.handleIceCandidate(ws, payload);
              break;

            case 'call:connected':
              this.handleCallConnected(ws, payload);
              break;

            case 'call:end':
              this.handleCallEnd(ws, payload);
              break;

            case 'call:mute_state':
              this.handleMuteState(ws, payload);
              break;

            case 'call:camera_state':
              this.handleCameraState(ws, payload);
              break;

            case 'call:request_keyframe':
              this.handleRequestKeyframe(ws, payload);
              break;

            case 'call:audio_data':
              this.handleAudioData(ws, payload);
              break;

            case 'cineminha:sync':
              this.handleCineminhaSync(ws, payload);
              break;

            default:
              console.warn('[Signaling] Unknown event type:', type);
          }
        } catch (err) {
          console.error('[Signaling] Message parse error:', err);
        }
      });

      ws.on('close', () => {
        if (registeredUserId) {
          this.handleDisconnect(registeredUserId, ws);
        }
      });

      ws.on('error', (err) => {
        console.error('[Signaling] Socket error:', err);
        if (registeredUserId) {
          this.handleDisconnect(registeredUserId, ws);
        }
      });
    });
  }

  private sendTo(userId: string, type: string, payload: any): boolean {
    const client = this.clients.get(userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }

  // Broadcast real-time couple lifecycle events (linking, unlinking, profile updates)
  public broadcastCoupleEvent(userAId: string, userBId: string, eventType: string, payload: any) {
    console.log(`[Signaling] Broadcasting couple event: ${eventType} to UserA (${userAId}) and UserB (${userBId})`);
    this.sendTo(userAId, eventType, payload);
    this.sendTo(userBId, eventType, payload);
  }

  private findClient(targetId: string, targetPersonalId?: string): ClientConnection | undefined {
    if (!targetId && !targetPersonalId) return undefined;

    // 1. Direct userId match
    if (targetId && this.clients.has(targetId)) {
      const client = this.clients.get(targetId)!;
      if (client.ws.readyState === WebSocket.OPEN) return client;
    }

    // 2. Search through registered clients by ID, personalId, or clean personalId
    const cleanTargetPersonal = targetPersonalId ? targetPersonalId.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';
    const cleanTargetId = targetId ? targetId.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';

    for (const [userId, client] of this.clients.entries()) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      if (userId === targetId || client.userId === targetId) return client;
      if (targetPersonalId && client.personalId === targetPersonalId) return client;

      const clientClean = client.personalId ? client.personalId.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';
      if (cleanTargetPersonal && clientClean === cleanTargetPersonal) return client;
      if (cleanTargetId && clientClean === cleanTargetId) return client;
    }

    return undefined;
  }

  private handleRegister(ws: WebSocket, payload: { userId: string; personalId: string; username: string; partnerId?: string }): string {
    const { userId, personalId, username, partnerId } = payload;
    if (!userId) return '';

    // If an existing socket exists for this user, safely disconnect the old socket
    const existing = this.clients.get(userId);
    if (existing && existing.ws !== ws) {
      console.log(`[Signaling] Replacing existing active socket for user ${userId}`);
      try {
        existing.ws.removeAllListeners('close');
        existing.ws.removeAllListeners('error');
        if (existing.ws.readyState === WebSocket.OPEN || existing.ws.readyState === WebSocket.CONNECTING) {
          existing.ws.close();
        }
      } catch (e) {
        // ignore close error
      }
    }

    this.clients.set(userId, {
      ws,
      userId,
      personalId: personalId || userId,
      username: username || 'User',
      partnerId: partnerId || undefined,
      currentCallId: null,
      lastPing: Date.now(),
    });

    console.log(`[WS CONNECT]\nuserId=${userId}\nsocket=CONNECTED`);
    console.log(`[WS REGISTER]\nuserId=${userId}\nregistered=true`);

    ws.send(JSON.stringify({ type: 'registered', payload: { userId, status: 'ok' } }));
    return userId;
  }

  private handleHeartbeat(ws: WebSocket, payload: { userId?: string; partnerId?: string; personalId?: string; username?: string } | undefined, registeredUserId: string | null) {
    const userId = payload?.userId || registeredUserId;
    if (userId) {
      if (!this.clients.has(userId) || this.clients.get(userId)?.ws !== ws) {
        this.handleRegister(ws, {
          userId,
          personalId: payload?.personalId || userId,
          username: payload?.username || 'User',
          partnerId: payload?.partnerId,
        });
        return;
      }
      const client = this.clients.get(userId)!;
      client.lastPing = Date.now();
      if (payload?.partnerId && !client.partnerId) {
        client.partnerId = payload.partnerId;
      }
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heartbeat_ack', payload: { timestamp: Date.now() } }));
    }
  }

  private handleCallInitiate(ws: WebSocket, payload: {
    callId?: string;
    callType?: 'voice' | 'video' | 'audio';
    callerId: string;
    callerPersonalId: string;
    callerName: string;
    callerAvatar: string;
    calleeId: string;
    calleePersonalId: string;
  }) {
    const { callerId, callerPersonalId, callerName, callerAvatar, calleeId, calleePersonalId, callType } = payload;
    const isVideo = callType === 'video';

    console.log(`[CALL INITIATE]\ncaller=${callerId}\nreceiver=${calleeId}\ntype=${isVideo ? 'video' : 'voice'}`);

    let caller = this.findClient(callerId, callerPersonalId);
    if (!caller) {
      // Find client that owns this active websocket
      for (const c of this.clients.values()) {
        if (c.ws === ws) {
          caller = c;
          caller.userId = callerId;
          caller.personalId = callerPersonalId || caller.personalId;
          break;
        }
      }
    }
    if (!caller) {
      // Register client entry for this active websocket on the fly
      caller = {
        userId: callerId,
        personalId: callerPersonalId,
        username: callerName,
        partnerId: calleeId,
        ws,
        lastPing: Date.now(),
      };
      this.clients.set(callerId, caller);
    }

    caller.partnerId = calleeId;
    const callee = this.findClient(calleeId, calleePersonalId);

    if (callee && callee.ws.readyState === WebSocket.OPEN) {
      console.log(`[CALL LOOKUP]\nreceiver=${calleeId}\nsocket=FOUND`);
    } else {
      console.log(`[CALL LOOKUP]\nreceiver=${calleeId}\nsocket=NOT_FOUND (will ring via Cloud Firestore Realtime)`);
    }

    // Check if callee is in another active call with someone else
    if (callee && callee.currentCallId && this.activeCalls.has(callee.currentCallId)) {
      const activeCall = this.activeCalls.get(callee.currentCallId);
      // If it is the same caller retrying or a finished call, clear the old call
      if (activeCall && (activeCall.callerId === caller.userId || activeCall.calleeId === caller.userId)) {
        this.cleanupCall(callee.currentCallId);
      } else if (
        activeCall &&
        (activeCall.status === 'calling' || activeCall.status === 'connecting' || activeCall.status === 'connected')
      ) {
        console.log(`[Signaling] Callee ${callee.userId} is in another active call with someone else`);
        ws.send(
          JSON.stringify({
            type: 'call:failed',
            payload: {
              reason: 'partner_busy',
              message: `${callee.username} está em outra chamada no momento.`,
            },
          })
        );
        return;
      } else {
        this.cleanupCall(callee.currentCallId);
      }
    }

    // Use client-provided callId to maintain 100% sync with Firestore document
    const callId = payload.callId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Set 35s call timeout if no one answers
    const timeoutTimer = setTimeout(() => {
      const call = this.activeCalls.get(callId);
      if (call && call.status === 'calling') {
        this.sendTo(caller.userId, 'call:timeout', { callId, reason: 'no_answer' });
        if (call.calleeId) {
          this.sendTo(call.calleeId, 'call:timeout', { callId, reason: 'no_answer' });
        }
        this.cleanupCall(callId);
      }
    }, 35000);

    const newCall: ActiveCall = {
      callId,
      callerId: caller.userId,
      callerPersonalId,
      callerName,
      callerAvatar,
      calleeId: callee?.userId || calleeId,
      calleePersonalId,
      calleeName: callee?.username || 'Parceiro(a)',
      callType: isVideo ? 'video' : 'voice',
      status: 'calling',
      createdAt: Date.now(),
      timeoutTimer,
    };

    this.activeCalls.set(callId, newCall);
    caller.currentCallId = callId;
    if (callee) {
      callee.currentCallId = callId;
    }

    // Notify caller that call was initiated
    caller.ws.send(JSON.stringify({
      type: 'call:initiated',
      payload: { callId, calleeId: newCall.calleeId, calleePersonalId, calleeName: newCall.calleeName, callType: newCall.callType }
    }));

    // Send incoming call alert to callee via WebSocket if connected
    if (callee && callee.ws.readyState === WebSocket.OPEN) {
      this.sendTo(callee.userId, 'call:incoming', {
        callId,
        callerId: caller.userId,
        callerPersonalId,
        callerName,
        callerAvatar,
        callType: isVideo ? 'video' : 'voice',
      });
    }
  }

  private handleCallAccept(ws: WebSocket, payload: { callId: string; calleeId: string; callerId?: string }) {
    const { callId, calleeId, callerId } = payload;
    const call = this.activeCalls.get(callId);
    const targetCallerId = callerId || call?.callerId;

    if (call) {
      if (call.timeoutTimer) {
        clearTimeout(call.timeoutTimer);
        call.timeoutTimer = undefined;
      }
      call.status = 'connecting';
      call.connectedAt = Date.now();
    }

    console.log(`[CALL] Call accepted for session: ${callId}, caller=${targetCallerId}, callee=${calleeId}`);
    if (targetCallerId) {
      this.sendTo(targetCallerId, 'call:accepted', { callId, calleeId, callType: call?.callType });
    }
    this.sendTo(calleeId, 'call:accepted', { callId, callerId: targetCallerId, callType: call?.callType });
  }

  private handleCallReject(ws: WebSocket, payload: { callId: string; calleeId?: string; callerId?: string; userId?: string; reason?: string }) {
    const { callId, reason } = payload;
    const call = this.activeCalls.get(callId);
    const callerId = payload.callerId || call?.callerId;
    const calleeId = payload.calleeId || call?.calleeId;

    if (callerId) this.sendTo(callerId, 'call:rejected', { callId, reason: reason || 'declined' });
    if (calleeId) this.sendTo(calleeId, 'call:rejected', { callId, reason: reason || 'declined' });
    this.cleanupCall(callId);
    console.log(`[CALL] Call rejected: ${callId}`);
  }

  private handleCallCancel(ws: WebSocket, payload: { callId: string; callerId?: string; calleeId?: string; userId?: string }) {
    const { callId } = payload;
    const userId = payload.callerId || payload.userId;
    const call = this.activeCalls.get(callId);
    const callerId = payload.callerId || call?.callerId;
    const calleeId = payload.calleeId || call?.calleeId;

    if (callerId) this.sendTo(callerId, 'call:cancelled', { callId });
    if (calleeId) this.sendTo(calleeId, 'call:cancelled', { callId });
    if (call) {
      const otherPeerId = call.callerId === userId ? call.calleeId : call.callerId;
      if (otherPeerId) this.sendTo(otherPeerId, 'call:cancelled', { callId });
    }
    this.cleanupCall(callId);
    console.log(`[CALL] Call cancelled: ${callId}`);
  }

  private handleCallOffer(ws: WebSocket, payload: { callId: string; sdp: any; targetUserId?: string }) {
    const { callId, sdp, targetUserId } = payload;
    const call = this.activeCalls.get(callId);
    if (call) {
      if (call.timeoutTimer) {
        clearTimeout(call.timeoutTimer);
        call.timeoutTimer = undefined;
      }
      if (call.status === 'calling') {
        call.status = 'connecting';
      }
    }
    const calleeId = targetUserId || call?.calleeId;

    if (calleeId) {
      this.sendTo(calleeId, 'call:offer', { callId, sdp });
    }
  }

  private handleCallAnswer(ws: WebSocket, payload: { callId: string; sdp: any; targetUserId?: string }) {
    const { callId, sdp, targetUserId } = payload;
    const call = this.activeCalls.get(callId);
    if (call) {
      if (call.timeoutTimer) {
        clearTimeout(call.timeoutTimer);
        call.timeoutTimer = undefined;
      }
      call.status = 'connected';
      call.connectedAt = Date.now();
    }
    const callerId = targetUserId || call?.callerId;

    if (callerId) {
      this.sendTo(callerId, 'call:answer', { callId, sdp });
    }
  }

  private handleIceCandidate(ws: WebSocket, payload: { callId: string; candidate: any; targetUserId?: string }) {
    const { callId, candidate, targetUserId } = payload;
    const call = this.activeCalls.get(callId);
    if (call && call.timeoutTimer) {
      clearTimeout(call.timeoutTimer);
      call.timeoutTimer = undefined;
    }
    const recipientId = targetUserId || (call ? (call.callerId === targetUserId ? call.calleeId : call.callerId) : undefined);
    
    if (recipientId) {
      this.sendTo(recipientId, 'call:ice_candidate', { callId, candidate });
    }
  }

  private handleCallConnected(ws: WebSocket, payload: { callId: string; userId?: string }) {
    const { callId, userId } = payload;
    const call = this.activeCalls.get(callId);
    if (call) {
      if (call.timeoutTimer) {
        clearTimeout(call.timeoutTimer);
        call.timeoutTimer = undefined;
      }
      call.status = 'connected';
      console.log(`[CALL] Call confirmed CONNECTED by ${userId || 'client'}: ${callId}`);
      
      // Notify both parties of confirmed connected state
      if (call.callerId) this.sendTo(call.callerId, 'call:connected', { callId });
      if (call.calleeId) this.sendTo(call.calleeId, 'call:connected', { callId });
    }
  }

  private handleAudioData(ws: WebSocket, payload: { callId: string; senderId: string; data: string }) {
    const { callId, senderId, data } = payload;
    const call = this.activeCalls.get(callId);
    if (!call) return;

    const recipientId = call.callerId === senderId ? call.calleeId : call.callerId;
    if (recipientId) {
      this.sendTo(recipientId, 'call:audio_data', { callId, senderId, data });
    }
  }

  private handleCallEnd(ws: WebSocket, payload: { callId: string; userId: string; reason?: string; targetUserId?: string }) {
    const { callId, userId, reason, targetUserId } = payload;
    const call = this.activeCalls.get(callId);
    
    let otherPeerId = targetUserId;
    if (call) {
      otherPeerId = call.callerId === userId ? call.calleeId : call.callerId;
    } else if (!otherPeerId) {
      const client = this.clients.get(userId);
      if (client && client.partnerId) {
        otherPeerId = client.partnerId;
      }
    }

    if (otherPeerId) {
      this.sendTo(otherPeerId, 'call:ended', { callId, reason: reason || 'hangup' });
    }
    this.sendTo(userId, 'call:ended', { callId, reason: reason || 'hangup' });

    this.cleanupCall(callId);
    console.log(`[CALL] Call ended: ${callId} by ${userId}`);
  }

  private handleMuteState(ws: WebSocket, payload: { callId: string; userId: string; isMuted: boolean }) {
    const { callId, userId, isMuted } = payload;
    const call = this.activeCalls.get(callId);
    if (!call) return;

    const otherPeerId = call.callerId === userId ? call.calleeId : call.callerId;
    this.sendTo(otherPeerId, 'call:partner_muted', { callId, isMuted });
  }

  private handleCameraState(ws: WebSocket, payload: { callId: string; userId: string; isCameraOff: boolean }) {
    const { callId, userId, isCameraOff } = payload;
    const call = this.activeCalls.get(callId);
    if (!call) return;

    const otherPeerId = call.callerId === userId ? call.calleeId : call.callerId;
    this.sendTo(otherPeerId, 'call:partner_camera_state', { callId, isCameraOff });
  }

  private handleRequestKeyframe(ws: WebSocket, payload: { callId: string; userId?: string; targetUserId?: string }) {
    const call = this.activeCalls.get(payload.callId);
    const target = payload.targetUserId
      || (call ? (call.callerId === payload.userId ? call.calleeId : call.callerId) : undefined);
    if (target) {
      this.sendTo(target, 'call:request_keyframe', { callId: payload.callId });
    }
  }

  private handleCineminhaSync(ws: WebSocket, payload: any) {
    if (!payload?.userId) return;
    const client = this.clients.get(payload.userId);
    let partnerId = client?.partnerId;
    if (!partnerId && payload.partnerId) {
      partnerId = payload.partnerId;
    }
    if (partnerId) {
      this.sendTo(partnerId, 'cineminha:sync', {
        ...payload,
        serverTimestamp: Date.now(),
      });
    }
  }

  private handleDisconnect(userId: string, ws?: WebSocket) {
    const client = this.clients.get(userId);
    if (!client) return;

    // Guard: Only remove if the socket triggering disconnect is the currently stored active socket
    if (ws && client.ws !== ws) {
      return;
    }

    // Note: Do NOT abruptly drop active WebRTC calls when a mobile socket blips or reconnects.
    // Direct P2P audio continues running on the mobile device.
    this.clients.delete(userId);
    console.log(`[Signaling] User disconnected from presence socket: ${userId}`);
  }

  private cleanupCall(callId: string) {
    const call = this.activeCalls.get(callId);
    if (call) {
      if (call.timeoutTimer) {
        clearTimeout(call.timeoutTimer);
      }
      const caller = this.clients.get(call.callerId);
      if (caller && caller.currentCallId === callId) {
        caller.currentCallId = null;
      }
      const callee = this.clients.get(call.calleeId);
      if (callee && callee.currentCallId === callId) {
        callee.currentCallId = null;
      }
      this.activeCalls.delete(callId);
    }
  }

  public getStatus() {
    return {
      connectedUsersCount: this.clients.size,
      activeCallsCount: this.activeCalls.size,
    };
  }

  public destroy() {
    clearInterval(this.pingInterval);
    this.wss.close();
  }
}
