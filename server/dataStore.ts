import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Task, ChatMessage, DailyHistoryRecord, ArenaDailyMatch, ArenaSeason, FlashChallenge, TaskStatus, CoupleWatchSession, CineminhaMedia, CineminhaPlayback, CineminhaQuality } from '../src/types';
import { userStore } from './userStore';

const DATA_DIR = path.join(process.cwd(), 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ARENA_HISTORY_FILE = path.join(DATA_DIR, 'arena_history.json');

// Helper to get Brazilian Date String (YYYY-MM-DD)
export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTodayDayOfWeek(): number {
  return new Date().getDay();
}

// Initial Starter Tasks for new users
export const DEFAULT_STARTER_TASKS: Omit<Task, 'id' | 'userId'>[] = [
  {
    title: 'Acordar cedo e beber 500ml de água',
    time: '07:30',
    days: [0, 1, 2, 3, 4, 5, 6],
    category: 'health',
    xpReward: 35,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    notes: 'Hidratação logo ao despertar! 💧',
  },
  {
    title: 'Treino ou caminhada do dia',
    time: '09:00',
    days: [1, 2, 3, 4, 5],
    category: 'fitness',
    xpReward: 50,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    notes: 'Manter a constância nos treinos! 💪',
  },
  {
    title: 'Estudo ou foco profissional (45 min)',
    time: '14:00',
    days: [1, 2, 3, 4, 5],
    category: 'study',
    xpReward: 45,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    notes: 'Sem distrações no celular 📚',
  },
  {
    title: 'Mensagem de carinho ou momento a dois',
    time: '19:30',
    days: [0, 1, 2, 3, 4, 5, 6],
    category: 'love',
    xpReward: 40,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    notes: 'Cuidar do nosso amor todos os dias ❤️',
  },
];

class DataStore {
  private tasks: Task[] = [];
  private messages: ChatMessage[] = [];
  private arenaHistory: ArenaDailyMatch[] = [];

  constructor() {
    this.ensureLoaded();
  }

  public ensureLoaded() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(TASKS_FILE)) {
        const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
        if (raw.trim()) {
          this.tasks = JSON.parse(raw);
        }
      } else {
        this.tasks = [];
        this.saveTasksToDisk();
      }

      if (fs.existsSync(MESSAGES_FILE)) {
        const raw = fs.readFileSync(MESSAGES_FILE, 'utf-8');
        if (raw.trim()) {
          this.messages = JSON.parse(raw);
        }
      } else {
        this.messages = [];
        this.saveMessagesToDisk();
      }

      if (fs.existsSync(ARENA_HISTORY_FILE)) {
        const raw = fs.readFileSync(ARENA_HISTORY_FILE, 'utf-8');
        if (raw.trim()) {
          this.arenaHistory = JSON.parse(raw);
        }
      } else {
        this.arenaHistory = [];
        this.saveArenaToDisk();
      }
    } catch (err) {
      console.error('[DataStore] Error loading data files:', err);
    }
  }

  private saveTasksToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${TASKS_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.tasks, null, 2), 'utf-8');
      fs.renameSync(tmp, TASKS_FILE);
    } catch (err) {
      console.error('[DataStore] Error saving tasks:', err);
    }
  }

  private saveMessagesToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${MESSAGES_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.messages, null, 2), 'utf-8');
      fs.renameSync(tmp, MESSAGES_FILE);
    } catch (err) {
      console.error('[DataStore] Error saving messages:', err);
    }
  }

  private saveArenaToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${ARENA_HISTORY_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.arenaHistory, null, 2), 'utf-8');
      fs.renameSync(tmp, ARENA_HISTORY_FILE);
    } catch (err) {
      console.error('[DataStore] Error saving arena:', err);
    }
  }

  // --- TASKS API ---

  public getTasksForUser(userId: string): Task[] {
    this.ensureLoaded();
    const userTasks = this.tasks.filter(t => t.userId === userId);
    
    // Auto seed if user has 0 tasks
    if (userTasks.length === 0) {
      const todayStr = getTodayDateString();
      const seeded: Task[] = DEFAULT_STARTER_TASKS.map((def, idx) => ({
        ...def,
        id: `task_${userId}_${idx}_${Date.now()}`,
        userId,
        createdAt: todayStr,
      }));
      this.tasks.push(...seeded);
      this.saveTasksToDisk();
      return seeded;
    }

    return userTasks;
  }

  public getTasksForCouple(userId: string, partnerId?: string | null): { userTasks: Task[]; partnerTasks: Task[] } {
    this.ensureLoaded();
    const userTasks = this.getTasksForUser(userId);
    const partnerTasks = partnerId ? this.getTasksForUser(partnerId) : [];
    return { userTasks, partnerTasks };
  }

  public createTask(userId: string, taskData: Omit<Task, 'id' | 'userId' | 'completedDates' | 'failedDates'>): Task {
    this.ensureLoaded();
    const todayStr = getTodayDateString();
    const newTask: Task = {
      ...taskData,
      id: `task_${userId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      userId,
      completedDates: [],
      failedDates: [],
      createdAt: taskData.createdAt || todayStr,
    };

    this.tasks.push(newTask);
    this.saveTasksToDisk();
    console.log(`[DataStore] Created task "${newTask.title}" for user ${userId}`);
    return newTask;
  }

  public updateTask(userId: string, taskId: string, updates: Partial<Task>): Task | null {
    this.ensureLoaded();
    const idx = this.tasks.findIndex(t => t.id === taskId && t.userId === userId);
    if (idx === -1) return null;

    const current = this.tasks[idx];
    const updated: Task = {
      ...current,
      ...updates,
      id: current.id,
      userId: current.userId,
    };

    this.tasks[idx] = updated;
    this.saveTasksToDisk();
    return updated;
  }

  public deleteTask(userId: string, taskId: string): boolean {
    this.ensureLoaded();
    const initialLen = this.tasks.length;
    this.tasks = this.tasks.filter(t => !(t.id === taskId && t.userId === userId));
    if (this.tasks.length !== initialLen) {
      this.saveTasksToDisk();
      return true;
    }
    return false;
  }

  public setTaskStatus(
    userId: string,
    taskId: string,
    status: TaskStatus
  ): {
    success: boolean;
    task?: Task;
    routineCompleted?: boolean;
    xpEarned?: number;
    newLevel?: number;
    leveledUp?: boolean;
  } {
    this.ensureLoaded();
    const todayStr = getTodayDateString();
    const todayDay = getTodayDayOfWeek();

    const idx = this.tasks.findIndex(t => t.id === taskId && t.userId === userId);
    if (idx === -1) {
      return { success: false };
    }

    const task = { ...this.tasks[idx] };
    const wasCompleted = task.completedDates.includes(todayStr);

    if (status === 'completed') {
      if (!wasCompleted) {
        task.completedDates.push(todayStr);
        task.failedDates = task.failedDates.filter(d => d !== todayStr);
        this.tasks[idx] = task;
        this.saveTasksToDisk();

        // Check if 100% of today's tasks are now completed for this user
        const todayTasks = this.tasks.filter(t => t.userId === userId && t.days.includes(todayDay as any));
        const allDone = todayTasks.length > 0 && todayTasks.every(t => t.completedDates.includes(todayStr));

        let routineCompleted = false;
        let xpEarned = 0;
        let leveledUp = false;
        let newLevel = 1;

        if (allDone) {
          const user = userStore.findById(userId);
          if (user && !user.routineXpClaimedDates.includes(todayStr)) {
            routineCompleted = true;
            // Award Level XP based on formula
            const xpReward = Math.round(180 + user.level * 25);
            xpEarned = xpReward;
            
            let currentXp = user.xp + xpReward;
            let currentLevel = user.level;
            const xpRequired = Math.round(100 * Math.pow(currentLevel, 1.35));

            if (currentXp >= xpRequired) {
              currentLevel += 1;
              currentXp -= xpRequired;
              leveledUp = true;
            }

            user.routineXpClaimedDates.push(todayStr);
            user.xp = currentXp;
            user.level = currentLevel;
            user.streakDays += 1;
            newLevel = currentLevel;

            userStore.updateUser(userId, {
              xp: currentXp,
              level: currentLevel,
              streakDays: user.streakDays,
              routineXpClaimedDates: user.routineXpClaimedDates,
            });

            console.log(`[DataStore] User ${user.username} completed 100% daily routine! Earned ${xpEarned} XP.`);
          }
        }

        return {
          success: true,
          task,
          routineCompleted,
          xpEarned,
          newLevel,
          leveledUp,
        };
      }
    } else if (status === 'failed') {
      if (!wasCompleted) {
        if (!task.failedDates.includes(todayStr)) {
          task.failedDates.push(todayStr);
        }
        this.tasks[idx] = task;
        this.saveTasksToDisk();
      }
    }

    return { success: true, task };
  }

  // --- CHAT MESSAGES API ---

  public getMessages(userIdA: string, userIdB: string): ChatMessage[] {
    this.ensureLoaded();
    const conversationId = [userIdA, userIdB].sort().join('_');
    return this.messages.filter(
      m => m.conversationId === conversationId ||
           (m.senderId === userIdA && m.receiverId === userIdB) ||
           (m.senderId === userIdB && m.receiverId === userIdA)
    ).sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  }

  public addMessage(msg: Omit<ChatMessage, 'id'>): ChatMessage {
    this.ensureLoaded();
    const conversationId = msg.conversationId || [msg.senderId, msg.receiverId].sort().join('_');
    const created: ChatMessage = {
      ...msg,
      id: `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      conversationId,
      type: 'text',
      read: msg.read ?? false,
    };
    this.messages.push(created);
    this.saveMessagesToDisk();
    return created;
  }

  public markMessagesAsRead(userId: string, partnerId: string): boolean {
    this.ensureLoaded();
    let changed = false;
    this.messages.forEach(m => {
      if (m.receiverId === userId && m.senderId === partnerId && !m.read) {
        m.read = true;
        changed = true;
      }
    });
    if (changed) {
      this.saveMessagesToDisk();
    }
    return changed;
  }

  // --- ARENA / DAILY MATCH API ---

  public calculateArenaScores(userId: string, partnerId?: string | null): {
    userScore: number;
    partnerScore: number;
    userCompleted: number;
    userTotal: number;
    partnerCompleted: number;
    partnerTotal: number;
    coupleGoalCompleted: boolean;
  } {
    this.ensureLoaded();
    const todayStr = getTodayDateString();
    const todayDay = getTodayDayOfWeek();

    const userTasks = this.getTasksForUser(userId).filter(t => t.days.includes(todayDay as any));
    const userCompleted = userTasks.filter(t => t.completedDates.includes(todayStr)).length;
    const userScore = userTasks.length > 0 ? Math.round((userCompleted / userTasks.length) * 100) : 0;

    let partnerScore = 0;
    let partnerCompleted = 0;
    let partnerTotal = 0;

    if (partnerId) {
      const partnerTasks = this.getTasksForUser(partnerId).filter(t => t.days.includes(todayDay as any));
      partnerTotal = partnerTasks.length;
      partnerCompleted = partnerTasks.filter(t => t.completedDates.includes(todayStr)).length;
      partnerScore = partnerTotal > 0 ? Math.round((partnerCompleted / partnerTotal) * 100) : 0;
    }

    const coupleGoalCompleted = userScore === 100 && (partnerId ? partnerScore === 100 : true) && userTasks.length > 0;

    return {
      userScore,
      partnerScore,
      userCompleted,
      userTotal: userTasks.length,
      partnerCompleted,
      partnerTotal,
      coupleGoalCompleted,
    };
  }

  public getArenaHistory(userId: string): ArenaDailyMatch[] {
    this.ensureLoaded();
    return this.arenaHistory.filter(m => m.id.includes(userId) || true).slice(-14);
  }

  // --- 🎬 CINEMINHA / WATCH PARTY METHODS ---
  private watchSessions: Map<string, CoupleWatchSession> = new Map();

  public getWatchSession(coupleId: string): CoupleWatchSession {
    let session = this.watchSessions.get(coupleId);
    if (!session) {
      session = {
        active: false,
        coupleId,
        hostUserId: '',
        hostUsername: '',
        media: null,
        playback: {
          playing: false,
          position: 0,
          updatedAt: Date.now(),
          serverTimestamp: Date.now(),
        },
        quality: 'auto',
        updatedAt: Date.now(),
      };
      this.watchSessions.set(coupleId, session);
    }
    return session;
  }

  public startWatchSession(coupleId: string, hostUserId: string, hostUsername: string): CoupleWatchSession {
    const existing = this.getWatchSession(coupleId);
    const updated: CoupleWatchSession = {
      ...existing,
      active: true,
      hostUserId,
      hostUsername,
      updatedAt: Date.now(),
      playback: {
        ...existing.playback,
        serverTimestamp: Date.now(),
        updatedAt: Date.now(),
      },
    };
    this.watchSessions.set(coupleId, updated);
    return updated;
  }

  public updateWatchSession(coupleId: string, updates: Partial<CoupleWatchSession>): CoupleWatchSession {
    const existing = this.getWatchSession(coupleId);
    const updated: CoupleWatchSession = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
      playback: updates.playback
        ? {
            ...existing.playback,
            ...updates.playback,
            serverTimestamp: Date.now(),
          }
        : existing.playback,
    };
    this.watchSessions.set(coupleId, updated);
    return updated;
  }

  public endWatchSession(coupleId: string): CoupleWatchSession {
    const existing = this.getWatchSession(coupleId);
    const updated: CoupleWatchSession = {
      ...existing,
      active: false,
      playback: {
        ...existing.playback,
        playing: false,
        serverTimestamp: Date.now(),
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    this.watchSessions.set(coupleId, updated);
    return updated;
  }
}

export const dataStore = new DataStore();
