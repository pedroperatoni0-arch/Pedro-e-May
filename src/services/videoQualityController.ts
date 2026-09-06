/**
 * Adaptive Video Quality Controller for Real-Time WebRTC Calls
 *
 * Implements a 5-step quality ladder prioritizing motion fluidity (maintain-framerate)
 * over static resolution. Starts at ~480p/30fps and automatically adapts:
 * - Drops a step immediately when packet loss, high RTT, or bandwidth limitations are detected.
 * - Climbs up only after ~8 seconds (4 consecutive stable iterations) of good network conditions.
 * - Guards against outdated calls by self-terminating when callId changes.
 */

export interface QualityStep {
  name: string;
  scale: number;
  maxBitrate: number;
  maxFramerate: number;
}

export const QUALITY_STEPS: QualityStep[] = [
  // Step 0: Emergency low-bandwidth (~180p, 150 kbps, 20 fps)
  { name: '180p-fluid', scale: 3.5, maxBitrate: 150_000, maxFramerate: 20 },
  // Step 1: Low mobile signal (~270p, 350 kbps, 24 fps)
  { name: '270p-fluid', scale: 2.5, maxBitrate: 350_000, maxFramerate: 24 },
  // Step 2: Intermediate mobile (~360p, 600 kbps, 30 fps)
  { name: '360p-fluid', scale: 1.8, maxBitrate: 600_000, maxFramerate: 30 },
  // Step 3: Default start step (~480p, 900 kbps, 30 fps)
  { name: '480p-fluid', scale: 1.33, maxBitrate: 900_000, maxFramerate: 30 },
  // Step 4: Full HD on stable Wi-Fi (~720p, 1400 kbps, 30 fps)
  { name: '720p-fluid', scale: 1.0, maxBitrate: 1_400_000, maxFramerate: 30 },
];

export const START_STEP = 3; // Start in ~480p 30fps fluid

export class VideoQualityController {
  private pc: RTCPeerConnection;
  private getCallId: () => string | null;
  private activeCallId: string | null = null;
  private currentStepIndex: number = START_STEP;
  private timer: NodeJS.Timeout | null = null;
  private stableIterations: number = 0;
  private isApplying: boolean = false;

  // Previous metrics for delta calculation
  private lastPacketsLost: number = 0;
  private lastPacketsReceived: number = 0;
  private lastPacketsSent: number = 0;

  constructor(pc: RTCPeerConnection, getCallId: () => string | null) {
    this.pc = pc;
    this.getCallId = getCallId;
    this.activeCallId = getCallId();
    this.currentStepIndex = START_STEP;
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public getCurrentStep(): QualityStep {
    return QUALITY_STEPS[this.currentStepIndex];
  }

  public start() {
    this.stop();
    this.activeCallId = this.getCallId();
    if (!this.activeCallId) return;

    this.currentStepIndex = START_STEP;
    this.stableIterations = 0;
    this.lastPacketsLost = 0;
    this.lastPacketsReceived = 0;
    this.lastPacketsSent = 0;

    console.log(`[VideoQualityController] Started adaptive monitoring for call: ${this.activeCallId}, startStep=${START_STEP} (${QUALITY_STEPS[START_STEP].name})`);

    // Sample WebRTC stats every 2 seconds
    this.timer = setInterval(() => {
      this.evaluateStats().catch((err) => {
        console.warn('[VideoQualityController] Stats evaluation error:', err);
      });
    }, 2000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isApplying = false;
  }

  private async evaluateStats() {
    // 1. Guard against outdated call or closed connection
    const currentCallId = this.getCallId();
    if (
      !currentCallId ||
      currentCallId !== this.activeCallId ||
      this.pc.signalingState === 'closed' ||
      this.pc.connectionState === 'closed'
    ) {
      console.log('[VideoQualityController] Auto-terminating controller (call changed or closed)');
      this.stop();
      return;
    }

    if (this.pc.connectionState !== 'connected') {
      return;
    }

    try {
      const stats = await this.pc.getStats();
      let rttMs: number | null = null;
      let packetsLost = 0;
      let packetsReceived = 0;
      let packetsSent = 0;
      let qualityLimitationReason: string | null = null;
      let availableOutgoingBitrate: number | null = null;

      stats.forEach((report) => {
        // Active candidate pair metrics (RTT & estimated bandwidth)
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime !== undefined) {
            rttMs = report.currentRoundTripTime * 1000;
          }
          if (report.availableOutgoingBitrate !== undefined) {
            availableOutgoingBitrate = report.availableOutgoingBitrate;
          }
        }

        // Outbound video RTP metrics
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          packetsSent += report.packetsSent || 0;
          if (report.qualityLimitationReason) {
            qualityLimitationReason = report.qualityLimitationReason;
          }
        }

        // Remote inbound video RTP metrics (actual packet loss observed by receiver)
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
          packetsLost += report.packetsLost || 0;
          if (report.roundTripTime !== undefined && rttMs === null) {
            rttMs = report.roundTripTime * 1000;
          }
        }

        // Local inbound video RTP (as fallback metric)
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          packetsReceived += report.packetsReceived || 0;
          if (!packetsLost) {
            packetsLost += report.packetsLost || 0;
          }
        }
      });

      // Calculate deltas
      const deltaLost = Math.max(0, packetsLost - this.lastPacketsLost);
      const deltaRecv = Math.max(0, packetsReceived - this.lastPacketsReceived);
      const deltaSent = Math.max(0, packetsSent - this.lastPacketsSent);
      this.lastPacketsLost = packetsLost;
      this.lastPacketsReceived = packetsReceived;
      this.lastPacketsSent = packetsSent;

      const totalMeasured = Math.max(deltaSent, deltaRecv) + deltaLost;
      const lossRate = totalMeasured > 10 ? deltaLost / totalMeasured : 0;

      const currentStep = QUALITY_STEPS[this.currentStepIndex];

      // Network degradation indicators (poor connection -> immediate step down)
      const hasHighLoss = lossRate > 0.04; // > 4% packet loss
      const hasHighRtt = rttMs !== null && rttMs > 320; // > 320ms latency
      const isBandwidthThrottled = qualityLimitationReason === 'bandwidth';
      const isCpuThrottled = qualityLimitationReason === 'cpu';
      const isBitrateConstrained =
        availableOutgoingBitrate !== null &&
        availableOutgoingBitrate < currentStep.maxBitrate * 0.75;

      const isDegraded = hasHighLoss || hasHighRtt || isBandwidthThrottled || isCpuThrottled || isBitrateConstrained;

      if (isDegraded) {
        // Immediate step down
        this.stableIterations = 0;
        if (this.currentStepIndex > 0) {
          const prevIndex = this.currentStepIndex;
          this.currentStepIndex -= 1;
          console.log(
            `[VideoQualityController] Network degraded (loss=${(lossRate * 100).toFixed(1)}%, RTT=${rttMs ? rttMs.toFixed(0) : 'n/a'}ms, reason=${qualityLimitationReason || 'none'}). Downgrading step ${prevIndex} -> ${this.currentStepIndex} (${QUALITY_STEPS[this.currentStepIndex].name})`
          );
          await this.applyCurrentStep();
        }
      } else {
        // Network is stable
        const isVeryClean =
          lossRate < 0.01 &&
          (!rttMs || rttMs < 160) &&
          qualityLimitationReason !== 'bandwidth' &&
          qualityLimitationReason !== 'cpu';

        if (isVeryClean) {
          this.stableIterations += 1;
          // Upgrade after ~8s (4 consecutive stable iterations of 2s)
          if (this.stableIterations >= 4) {
            this.stableIterations = 0;
            if (this.currentStepIndex < QUALITY_STEPS.length - 1) {
              const prevIndex = this.currentStepIndex;
              this.currentStepIndex += 1;
              console.log(
                `[VideoQualityController] Network stable for ~8s. Upgrading step ${prevIndex} -> ${this.currentStepIndex} (${QUALITY_STEPS[this.currentStepIndex].name})`
              );
              await this.applyCurrentStep();
            }
          }
        } else {
          // Moderately good, hold current step without resetting stable iterations entirely
          this.stableIterations = Math.max(0, this.stableIterations - 1);
        }
      }
    } catch (e) {
      console.warn('[VideoQualityController] Failed reading RTC stats:', e);
    }
  }

  public async applyCurrentStep() {
    if (this.isApplying) return;
    this.isApplying = true;

    try {
      const step = QUALITY_STEPS[this.currentStepIndex];
      const senders = this.pc.getSenders();

      for (const sender of senders) {
        if (!sender.track) continue;

        if (sender.track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }

          params.encodings[0].scaleResolutionDownBy = step.scale;
          params.encodings[0].maxBitrate = step.maxBitrate;
          params.encodings[0].maxFramerate = step.maxFramerate;
          params.encodings[0].networkPriority = 'low'; // Audio always has top priority
          params.degradationPreference = 'maintain-framerate'; // Smooth fluid video, zero stutter

          await sender.setParameters(params).catch(() => {});

          // Request clean keyframe on encoder if browser supports it
          if (typeof (sender as any).generateKeyFrame === 'function') {
            try {
              (sender as any).generateKeyFrame();
            } catch (e) {}
          }
        } else if (sender.track.kind === 'audio') {
          // Guaranteed 32 kbps voice with top priority
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 32_000;
          params.encodings[0].networkPriority = 'high';
          await sender.setParameters(params).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[VideoQualityController] applyCurrentStep error:', err);
    } finally {
      this.isApplying = false;
    }
  }
}
