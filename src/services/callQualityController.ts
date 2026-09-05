/**
 * Adaptive Call Quality Controller
 *
 * Monitors WebRTC getStats() periodically and adjusts RTCRtpSender
 * parameters (maxBitrate, maxFramerate, scaleResolutionDownBy)
 * to keep video fluid and low-latency. Uses degradationPreference
 * "maintain-framerate" so the encoder drops resolution before FPS.
 *
 * Hysteresis: 3 consecutive "bad" samples → step down.
 *             5 consecutive "good" samples → step up.
 * This avoids oscillation on minor network jitter.
 */

export interface QualityLevel {
  name: string;
  maxBitrate: number; // bits per second
  maxFramerate: number; // fps
  scaleResolutionDownBy: number; // divisor from capture resolution
}

// Stepwise quality ladder — highest to lowest.
// Captured video is 1280×720; scaleResolutionDownBy divides from that.
const QUALITY_LEVELS: QualityLevel[] = [
  { name: 'high',        maxBitrate: 1500000, maxFramerate: 30, scaleResolutionDownBy: 1.0  }, // 720p 30fps
  { name: 'medium-high', maxBitrate: 1000000, maxFramerate: 30, scaleResolutionDownBy: 1.33 }, // ~540p 30fps
  { name: 'medium',      maxBitrate: 700000,  maxFramerate: 30, scaleResolutionDownBy: 1.5  }, // 480p 30fps
  { name: 'low',         maxBitrate: 400000,  maxFramerate: 24, scaleResolutionDownBy: 2.0  }, // 360p 24fps
  { name: 'very-low',    maxBitrate: 200000,  maxFramerate: 15, scaleResolutionDownBy: 3.0  }, // 240p 15fps
];

const MONITOR_INTERVAL_MS = 3000;
const DEGRADE_THRESHOLD = 3; // consecutive bad samples to step down
const UPGRADE_THRESHOLD = 5; // consecutive good samples to step up

export class CallQualityController {
  private pc: RTCPeerConnection;
  private intervalId: number | null = null;
  private currentLevelIndex = 0;
  private badCount = 0;
  private goodCount = 0;
  private prevBytesSent = 0;
  private prevBytesReceived = 0;
  private prevTimestamp = 0;
  private supportsMaxFramerate = false;
  private supportsDegradationPreference = false;
  private active = false;

  constructor(pc: RTCPeerConnection) {
    this.pc = pc;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.detectBrowserSupport();
    this.applyLevel(0);
    this.intervalId = window.setInterval(() => this.monitor(), MONITOR_INTERVAL_MS);
    console.log(`[QualityController] Started — initial level: ${QUALITY_LEVELS[0].name}`);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.active = false;
    this.badCount = 0;
    this.goodCount = 0;
    this.prevBytesSent = 0;
    this.prevBytesReceived = 0;
    this.prevTimestamp = 0;
    this.currentLevelIndex = 0;
  }

  private detectBrowserSupport(): void {
    const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (videoSender) {
      try {
        const params = videoSender.getParameters();
        if (params.encodings?.[0]) {
          this.supportsMaxFramerate = 'maxFramerate' in params.encodings[0];
        }
        this.supportsDegradationPreference = 'degradationPreference' in params;
      } catch {
        // defaults remain false
      }
    }
    console.log(`[QualityController] Browser support — maxFramerate: ${this.supportsMaxFramerate}, degradationPreference: ${this.supportsDegradationPreference}`);
  }

  private async monitor(): Promise<void> {
    if (!this.active || this.pc.connectionState === 'closed') {
      return;
    }

    try {
      const stats = await this.pc.getStats();
      const metrics = this.extractMetrics(stats);
      this.evaluate(metrics);
    } catch (err) {
      console.warn('[QualityController] getStats() error:', err);
    }
  }

  private extractMetrics(stats: RTCStatsReport): QualityMetrics {
    let outboundFps = 0;
    let packetsLost = 0;
    let packetsReceived = 0;
    let fractionLost = 0;
    let roundTripTime = 0;
    let jitter = 0;
    let inboundFps = 0;
    let framesDropped = 0;
    let bytesSent = 0;
    let bytesReceived = 0;
    let frameWidth = 0;
    let frameHeight = 0;
    let timestamp = 0;

    stats.forEach((report: any) => {
      switch (report.type) {
        case 'outbound-rtp':
          if (report.kind === 'video' || report.mediaType === 'video') {
            outboundFps = report.framesPerSecond || 0;
            bytesSent = report.bytesSent || 0;
            frameWidth = report.frameWidth || 0;
            frameHeight = report.frameHeight || 0;
            timestamp = report.timestamp || 0;
          }
          break;
        case 'remote-inbound-rtp':
          if (report.kind === 'video' || report.mediaType === 'video') {
            packetsLost = report.packetsLost || 0;
            packetsReceived = report.packetsReceived || 0;
            fractionLost = report.fractionLost || 0;
            roundTripTime = report.roundTripTime || 0;
            jitter = report.jitter || 0;
          }
          break;
        case 'inbound-rtp':
          if (report.kind === 'video' || report.mediaType === 'video') {
            inboundFps = report.framesPerSecond || 0;
            framesDropped = report.framesDropped || 0;
            bytesReceived = report.bytesSent || report.bytesReceived || 0;
          }
          break;
        case 'candidate-pair':
          if (report.state === 'succeeded' && report.nominated) {
            if (report.currentRoundTripTime) {
              roundTripTime = Math.max(roundTripTime, report.currentRoundTripTime);
            }
          }
          break;
      }
    });

    // Compute effective outbound bitrate
    let outboundBitrate = 0;
    if (this.prevTimestamp > 0 && timestamp > this.prevTimestamp) {
      const deltaSec = (timestamp - this.prevTimestamp) / 1000;
      if (deltaSec > 0) {
        outboundBitrate = ((bytesSent - this.prevBytesSent) * 8) / deltaSec;
      }
    }
    this.prevBytesSent = bytesSent;
    this.prevBytesReceived = bytesReceived;
    this.prevTimestamp = timestamp;

    return {
      outboundFps,
      inboundFps,
      packetsLost,
      packetsReceived,
      fractionLost,
      roundTripTime,
      jitter,
      framesDropped,
      outboundBitrate,
      frameWidth,
      frameHeight,
    };
  }

  private evaluate(m: QualityMetrics): void {
    // "Bad" = any one of these thresholds breached
    const isBad =
      m.fractionLost > 0.05 ||
      m.roundTripTime > 0.5 ||
      (m.outboundFps > 0 && m.outboundFps < 20) ||
      (m.inboundFps > 0 && m.inboundFps < 15);

    // "Good" = ALL conditions satisfied
    const isGood =
      m.fractionLost < 0.02 &&
      m.roundTripTime < 0.25 &&
      (m.outboundFps === 0 || m.outboundFps > 27) &&
      (m.inboundFps === 0 || m.inboundFps > 25);

    if (isBad) {
      this.badCount++;
      this.goodCount = 0;
      console.log(`[QualityController] Bad sample #${this.badCount} — loss:${(m.fractionLost * 100).toFixed(1)}% rtt:${(m.roundTripTime * 1000).toFixed(0)}ms outFps:${m.outboundFps.toFixed(0)} inFps:${m.inboundFps.toFixed(0)}`);
      if (this.badCount >= DEGRADE_THRESHOLD && this.currentLevelIndex < QUALITY_LEVELS.length - 1) {
        this.currentLevelIndex++;
        this.badCount = 0;
        this.goodCount = 0;
        this.applyLevel(this.currentLevelIndex);
      }
    } else if (isGood) {
      this.goodCount++;
      this.badCount = 0;
      if (this.goodCount >= UPGRADE_THRESHOLD && this.currentLevelIndex > 0) {
        this.currentLevelIndex--;
        this.goodCount = 0;
        this.badCount = 0;
        this.applyLevel(this.currentLevelIndex);
      }
    } else {
      // Neutral — reset neither direction but don't accumulate
      this.badCount = Math.max(0, this.badCount - 1);
      this.goodCount = Math.max(0, this.goodCount - 1);
    }
  }

  private applyLevel(levelIndex: number): void {
    const level = QUALITY_LEVELS[levelIndex];
    const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!videoSender) return;

    try {
      const params = videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      params.encodings[0].maxBitrate = level.maxBitrate;
      if (this.supportsMaxFramerate) {
        (params.encodings[0] as any).maxFramerate = level.maxFramerate;
      }
      params.encodings[0].scaleResolutionDownBy = level.scaleResolutionDownBy;

      if (this.supportsDegradationPreference) {
        params.degradationPreference = 'maintain-framerate';
      }

      videoSender.setParameters(params).then(() => {
        console.log(`[QualityController] Applied level: ${level.name} — ${level.maxBitrate / 1000}kbps ${level.maxFramerate}fps scale=${level.scaleResolutionDownBy}`);
      }).catch((err) => {
        console.warn(`[QualityController] setParameters failed for ${level.name}:`, err);
      });
    } catch (err) {
      console.warn('[QualityController] Error applying level:', err);
    }
  }

  get currentLevel(): QualityLevel {
    return QUALITY_LEVELS[this.currentLevelIndex];
  }
}

interface QualityMetrics {
  outboundFps: number;
  inboundFps: number;
  packetsLost: number;
  packetsReceived: number;
  fractionLost: number;
  roundTripTime: number;
  jitter: number;
  framesDropped: number;
  outboundBitrate: number;
  frameWidth: number;
  frameHeight: number;
}
