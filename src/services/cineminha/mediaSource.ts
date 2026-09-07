export type MediaSourceType = 'web' | 'drive';

export interface PlaybackCapabilities {
  canPlay: boolean;
  canPause: boolean;
  canSeek: boolean;
  canReportPosition: boolean;
  canControlRemotely: boolean;
}

export interface WebMediaReference {
  url: string;
  provider?: string;
}

export interface DriveMediaReference {
  fileId: string;
  authorized: boolean;
}

export interface CineminhaMediaSource {
  type: MediaSourceType;
  title: string;
  reference: WebMediaReference | DriveMediaReference;
  poster?: string;
  duration?: number;
  playback: PlaybackCapabilities;
}

export const DIRECT_VIDEO_CAPABILITIES: PlaybackCapabilities = {
  canPlay: true,
  canPause: true,
  canSeek: true,
  canReportPosition: true,
  canControlRemotely: true,
};

export const EXTERNAL_PLAYER_CAPABILITIES: PlaybackCapabilities = {
  canPlay: false,
  canPause: false,
  canSeek: false,
  canReportPosition: false,
  canControlRemotely: false,
};
