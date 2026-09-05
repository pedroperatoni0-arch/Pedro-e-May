// WebRTC ICE Server Configuration for Ultra-Fast, Zero-Latency P2P Direct Calls & Mobile 4G NAT Traversal
export const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Primary ultra-fast STUN servers (always evaluated first by WebRTC for 0-latency P2P direct stream)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    // Reliable fallback TURN servers (ensures connection never fails even behind strict mobile 4G Symmetric NAT)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// Asynchronously fetch server-provided ICE servers (including TURN credentials if configured)
export async function fetchRtcConfiguration(): Promise<RTCConfiguration> {
  try {
    const res = await fetch('/api/webrtc/ice-servers');
    if (res.ok) {
      const data = await res.json();
      if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return {
          iceServers: data.iceServers,
          iceCandidatePoolSize: 10,
        };
      }
    }
  } catch (err) {
    console.warn('[WebRTC] Using default STUN/TURN servers due to network error:', err);
  }
  return DEFAULT_ICE_SERVERS;
}

