export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Domingo, 1=Segunda ... 6=Sábado

export type TaskStatus = 'pending' | 'completed' | 'failed';
export type TaskCategory = 'routine' | 'fitness' | 'study' | 'love' | 'health' | 'mindfulness' | 'home';

export interface Task {
  id: string;
  userId: string;
  title: string;
  time: string; // "07:30"
  days: DayOfWeek[];
  category: TaskCategory;
  xpReward: number; // Historical/indicative value
  completedDates: string[]; // "YYYY-MM-DD"
  failedDates: string[]; // "YYYY-MM-DD"
  isRecurring: boolean;
  createdAt?: string; // "YYYY-MM-DD" creation date for new tasks
  notes?: string;
}

export interface DailyHistoryRecord {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  dateLabel: string; // e.g. "28 de Agosto"
  dayOfWeek: DayOfWeek;
  tasks: {
    taskId: string;
    title: string;
    time: string;
    category: TaskCategory;
    xpReward: number;
    status: 'completed' | 'not_completed';
  }[];
  totalTasks: number;
  completedTasks: number;
  xpEarned: number;
}

// ⚔️ ARENA: Daily Match Model (Percentage-based, max 100 points)
export interface ArenaDailyMatch {
  id: string;
  date: string; // "YYYY-MM-DD"
  dateLabel: string; // e.g. "28 de Agosto"
  userScore: number; // 0 - 100 (% of routine completed)
  partnerScore: number; // 0 - 100 (% of routine completed)
  userCompletedTasks: number;
  userTotalTasks: number;
  partnerCompletedTasks: number;
  partnerTotalTasks: number;
  winnerId: string | 'draw' | null;
  statusText: string;
  isClosed: boolean;
  coupleGoalCompleted: boolean;
}

// 🌸 ARENA: Weekly Season Model
export interface ArenaSeason {
  id: string;
  weekNumber: number;
  title: string; // e.g. "Semana 1"
  startDate: string;
  endDate: string;
  userWins: number;
  partnerWins: number;
  draws: number;
  totalMatches: number;
  championId: string | 'tie' | null;
  isCompleted: boolean;
}

// ⚡ ARENA: Flash Challenge Model (Disputa Relâmpago)
export interface FlashChallenge {
  id: string;
  title: string;
  description: string;
  targetDescription: string;
  userCompletedFirst: boolean | null;
  winnerId: string | null;
  active: boolean;
  timestamp?: string;
  completedAt?: string;
}

// 💬 Chat Message Model
export type MessageType = 'text' | 'photo' | 'video' | 'sticker' | 'audio' | 'system' | 'encouragement';

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  conversationId?: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  stickerId?: string;
  audioDuration?: number;
  timestamp: string; // ISO string or HH:MM
  read: boolean;
  reaction?: string;
}

export type PartnerLinkStatus = 'none' | 'pending' | 'connected';

export interface PersonXpHistoryRecord {
  id: string;
  date: string; // "YYYY-MM-DD"
  source: 'daily_routine' | 'arena_victory' | 'couple_goal';
  description: string;
  xpEarned: number;
  levelAtMoment: number;
  timestamp: string; // ISO string
}

// 👤 User Account Model (Pure Person Level & XP - Infinite & Dynamic)
export interface UserAccount {
  id: string;
  username: string;
  avatar: string;
  personalId: string; // e.g. "DQ-LEO-9201"
  level: number; // User's personal level
  xp: number; // User's personal XP within current level
  streakDays: number;
  arenaWins: number; // Total Arena daily match wins
  routineXpClaimedDates?: string[]; // Dates ("YYYY-MM-DD") where routine XP was claimed
  personXpHistory?: PersonXpHistoryRecord[];
  partnerId: string | null;
  partnerStatus: PartnerLinkStatus;
  pendingPartnerId?: string | null;
  customStatus?: string;
  theme: 'rose' | 'lavender' | 'mint' | 'sunset';
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

// 📞 Real-Time WebRTC Voice Call Models
export type CallState =
  | 'IDLE'
  | 'CALLING' // Outgoing: waiting for partner to answer
  | 'RINGING' // Incoming: partner is calling you
  | 'CONNECTING' // Negotiating WebRTC handshake & ICE
  | 'CONNECTED' // Real voice audio stream active
  | 'REJECTED' // Partner declined call
  | 'MISSED' // Timeout or no answer
  | 'ENDED' // Call hung up normally
  | 'FAILED'; // Connection or microphone permission error

export type CallType = 'audio' | 'video';

export interface CallPartnerInfo {
  id: string;
  personalId: string;
  username: string;
  avatar: string;
}

export type VideoQualityLevel = 'auto' | 'max' | 'very-high' | 'high' | 'medium' | 'low' | 'min';

export interface RealCallSession {
  callId: string | null;
  callType: CallType;
  state: CallState;
  partner: CallPartnerInfo | null;
  isOutgoing: boolean;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOff?: boolean;
  isPartnerMuted: boolean;
  isPartnerCameraOff?: boolean;
  videoQuality?: VideoQualityLevel;
  durationSeconds: number;
  errorMessage?: string;
}

// 🎬 CINEMINHA / WATCH PARTY TYPES
export type CineminhaSourceType = 'site' | 'drive';

export interface CineminhaMedia {
  sourceType: CineminhaSourceType;
  title: string;
  url: string;
  playerUrl?: string;
  driveFileId?: string;
  poster?: string;
  duration?: number;
}

export interface CineminhaPlayback {
  playing: boolean;
  position: number; // in seconds
  updatedAt: number; // ms timestamp
  serverTimestamp?: number;
}

export type CineminhaQuality = 'auto' | '1080p' | '720p' | '480p';

export interface CoupleWatchSession {
  active: boolean;
  coupleId: string;
  hostUserId: string;
  hostUsername: string;
  media: CineminhaMedia | null;
  playback: CineminhaPlayback;
  quality: CineminhaQuality;
  updatedAt: number;
}

export type CineminhaSyncAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'mediaChanged'
  | 'qualityChanged'
  | 'sessionStarted'
  | 'sessionEnded'
  | 'syncPing';

export interface CineminhaSyncPayload {
  coupleId: string;
  action: CineminhaSyncAction;
  userId: string;
  username: string;
  position?: number;
  playing?: boolean;
  media?: CineminhaMedia | null;
  quality?: CineminhaQuality;
  clientTimestamp: number;
  serverTimestamp?: number;
}

