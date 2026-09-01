import {
  UserAccount,
  Task,
  ChatMessage,
  DayOfWeek,
  DailyHistoryRecord,
  PersonXpHistoryRecord,
  ArenaDailyMatch,
  ArenaSeason,
  FlashChallenge,
} from '../types';
import {
  calculateUserXpRequired,
  calculateDailyRoutineUserXp,
  processUserXpAddition,
  calculateArenaScore,
  getArenaStatusMessage,
  UserXpGainResult,
} from './xpSystem';

const STORAGE_USERS_KEY = 'duoquest_users_v3';
const STORAGE_TASKS_KEY = 'duoquest_tasks_v3';
const STORAGE_MESSAGES_KEY = 'duoquest_messages_v3';
const STORAGE_CURRENT_USER_ID_KEY = 'duoquest_current_user_id_v3';
const STORAGE_HISTORY_KEY = 'duoquest_history_v3';
const STORAGE_ARENA_HISTORY_KEY = 'duoquest_arena_history_v3';
const STORAGE_ARENA_SEASONS_KEY = 'duoquest_arena_seasons_v3';
const STORAGE_FLASH_CHALLENGE_KEY = 'duoquest_flash_challenge_v3';

export const getTodayDateString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getTodayDayOfWeek = (): DayOfWeek => {
  return new Date().getDay() as DayOfWeek;
};

export const formatDateToPortuguese = (dateStr: string): string => {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${day} de ${months[month - 1]}`;
  } catch {
    return dateStr;
  }
};

// Initial Seed Users (Clean Person Level & XP)
const INITIAL_USERS: UserAccount[] = [
  {
    id: 'user_leo_1',
    username: 'Leo',
    avatar: '🦁',
    personalId: 'DQ-LEO-9201',
    level: 7,
    xp: 248,
    streakDays: 6,
    arenaWins: 4,
    partnerId: 'user_mia_2',
    partnerStatus: 'connected',
    customStatus: 'Focado na rotina e nas disputas da Arena! ⚔️',
    theme: 'rose',
    soundEnabled: true,
    vibrationEnabled: true,
    routineXpClaimedDates: [],
    personXpHistory: [
      {
        id: 'pxp_1',
        date: '2026-08-28',
        source: 'daily_routine',
        description: 'Rotina de 28 de Agosto cumprida com louvor',
        xpEarned: 275,
        levelAtMoment: 7,
        timestamp: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'user_mia_2',
    username: 'Mia',
    avatar: '🌸',
    personalId: 'DQ-MIA-4418',
    level: 7,
    xp: 310,
    streakDays: 7,
    arenaWins: 5,
    partnerId: 'user_leo_1',
    partnerStatus: 'connected',
    customStatus: 'Rotina em dia = Vitória na Arena! ⚔️✨',
    theme: 'lavender',
    soundEnabled: true,
    vibrationEnabled: true,
    routineXpClaimedDates: [],
    personXpHistory: [
      {
        id: 'pxp_2',
        date: '2026-08-28',
        source: 'daily_routine',
        description: 'Rotina de 28 de Agosto cumprida com louvor',
        xpEarned: 275,
        levelAtMoment: 7,
        timestamp: new Date().toISOString(),
      },
    ],
  },
];

// Initial Tasks for Leo and Mia
const INITIAL_TASKS: Task[] = [
  // Leo's Tasks (5 tasks)
  {
    id: 'task_1',
    userId: 'user_leo_1',
    title: 'Acordar cedo e beber 500ml de água',
    time: '07:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    category: 'health',
    xpReward: 25,
    completedDates: [getTodayDateString()],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
    notes: 'Hidratação matinal para despertar a mente e o corpo!',
  },
  {
    id: 'task_2',
    userId: 'user_leo_1',
    title: 'Café da manhã nutritivo com frutas',
    time: '07:45',
    days: [1, 2, 3, 4, 5],
    category: 'routine',
    xpReward: 30,
    completedDates: [getTodayDateString()],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'task_3',
    userId: 'user_leo_1',
    title: 'Estudar programação / novos projetos',
    time: '09:00',
    days: [1, 2, 3, 4, 5],
    category: 'study',
    xpReward: 50,
    completedDates: [getTodayDateString()],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'task_4',
    userId: 'user_leo_1',
    title: 'Treino de musculação ou corrida de 35m',
    time: '18:00',
    days: [1, 2, 3, 4, 5, 6],
    category: 'fitness',
    xpReward: 60,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'task_5',
    userId: 'user_leo_1',
    title: 'Mandar mensagem fofa / foto do dia para Mia',
    time: '20:30',
    days: [0, 1, 2, 3, 4, 5, 6],
    category: 'love',
    xpReward: 40,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },

  // Mia's Tasks (4 tasks)
  {
    id: 'task_mia_1',
    userId: 'user_mia_2',
    title: 'Alongamento matinal & Ioga',
    time: '07:15',
    days: [0, 1, 2, 3, 4, 5, 6],
    category: 'fitness',
    xpReward: 30,
    completedDates: [getTodayDateString()],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'task_mia_2',
    userId: 'user_mia_2',
    title: 'Planejamento do dia de trabalho',
    time: '08:30',
    days: [1, 2, 3, 4, 5],
    category: 'routine',
    xpReward: 35,
    completedDates: [getTodayDateString()],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'task_mia_3',
    userId: 'user_mia_2',
    title: 'Curso de Design e Criatividade',
    time: '14:00',
    days: [1, 2, 3, 4, 5],
    category: 'study',
    xpReward: 50,
    completedDates: [getTodayDateString()],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'task_mia_4',
    userId: 'user_mia_2',
    title: 'Skincare e chá relaxante à noite',
    time: '21:30',
    days: [0, 1, 2, 3, 4, 5, 6],
    category: 'health',
    xpReward: 35,
    completedDates: [],
    failedDates: [],
    isRecurring: true,
    createdAt: '2026-08-01',
  },
];

// Initial Messages
const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg_1',
    senderId: 'user_mia_2',
    receiverId: 'user_leo_1',
    senderName: 'Mia',
    type: 'text',
    content: 'Bom dia meu amor! Já fiz meu alongamento e planejei o dia! Tô com 75% na Arena hoje hein! 🔥⚔️',
    timestamp: '08:45',
    read: true,
  },
  {
    id: 'msg_2',
    senderId: 'user_leo_1',
    receiverId: 'user_mia_2',
    senderName: 'Leo',
    type: 'text',
    content: 'Bom dia linda! Já tomei café e estudei, tô com 60%! Vou te alcançar no treino mais tarde! 💪❤️',
    timestamp: '09:15',
    read: true,
  },
];

export class AppStorage {
  static getUsers(): UserAccount[] {
    try {
      const data = localStorage.getItem(STORAGE_USERS_KEY);
      if (data) {
        const parsed: UserAccount[] = JSON.parse(data);
        return parsed.map(user => ({
          ...user,
          level: typeof user.level === 'number' && user.level >= 1 ? user.level : 1,
          xp: typeof user.xp === 'number' ? user.xp : 0,
          arenaWins: typeof user.arenaWins === 'number' ? user.arenaWins : 0,
          streakDays: typeof user.streakDays === 'number' ? user.streakDays : 1,
          routineXpClaimedDates: Array.isArray(user.routineXpClaimedDates) ? user.routineXpClaimedDates : [],
          personXpHistory: Array.isArray(user.personXpHistory) ? user.personXpHistory : [],
        }));
      }
    } catch {
      // fallback
    }
    return [];
  }

  static saveUsers(users: UserAccount[]) {
    try {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }
  }

  static getCurrentUserId(): string | null {
    try {
      const id = localStorage.getItem(STORAGE_CURRENT_USER_ID_KEY);
      if (id) return id;
    } catch {
      // fallback
    }
    return null;
  }

  static setCurrentUserId(id: string) {
    try {
      localStorage.setItem(STORAGE_CURRENT_USER_ID_KEY, id);
    } catch (e) {
      console.error(e);
    }
  }

  static syncCurrentUser(user: UserAccount) {
    try {
      const users = this.getUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...user };
      } else {
        users.push(user);
      }
      this.saveUsers(users);
      this.setCurrentUserId(user.id);
    } catch (e) {
      console.error(e);
    }
  }

  static syncPartner(partner: UserAccount | null) {
    if (!partner) return;
    try {
      const users = this.getUsers();
      const idx = users.findIndex(u => u.id === partner.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...partner };
      } else {
        users.push(partner);
      }
      this.saveUsers(users);
      // NOTE: Never set currentUserId to partner's id!
    } catch (e) {
      console.error(e);
    }
  }

  static syncUser(user: UserAccount, isCurrent: boolean = false) {
    if (isCurrent) {
      this.syncCurrentUser(user);
    } else {
      this.syncPartner(user);
    }
  }

  static getCurrentUser(): UserAccount | null {
    const users = this.getUsers();
    const currentId = this.getCurrentUserId();
    if (!currentId) return users[0] || null;
    const found = users.find(u => u.id === currentId);
    return found || users[0] || null;
  }

  static getPartner(user: UserAccount | null): UserAccount | null {
    if (!user || !user.partnerId || user.partnerStatus !== 'connected') return null;
    const users = this.getUsers();
    return users.find(u => u.id === user.partnerId) || null;
  }

  static getTasks(userId?: string): Task[] {
    try {
      const data = localStorage.getItem(STORAGE_TASKS_KEY);
      let all: Task[] = data ? JSON.parse(data) : INITIAL_TASKS;
      if (!Array.isArray(all)) {
        all = INITIAL_TASKS;
      }
      if (!data) this.saveTasks(INITIAL_TASKS);
      
      const normalized = all.map(t => ({
        ...t,
        days: Array.isArray(t.days) ? t.days : [],
        completedDates: Array.isArray(t.completedDates) ? t.completedDates : [],
        failedDates: Array.isArray(t.failedDates) ? t.failedDates : [],
      }));

      if (userId) return normalized.filter(t => t && t.userId === userId);
      return normalized;
    } catch {
      return INITIAL_TASKS;
    }
  }

  static saveTasks(tasks: Task[]) {
    try {
      const safeList = Array.isArray(tasks) ? tasks : [];
      localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(safeList));
    } catch (e) {
      console.error(e);
    }
  }

  static getMessages(userId1: string, userId2: string): ChatMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_MESSAGES_KEY);
      let all: ChatMessage[] = data ? JSON.parse(data) : INITIAL_MESSAGES;
      if (!Array.isArray(all)) {
        all = INITIAL_MESSAGES;
      }
      if (!data) this.saveMessages(INITIAL_MESSAGES);
      return all.filter(
        m => m && ((m.senderId === userId1 && m.receiverId === userId2) ||
             (m.senderId === userId2 && m.receiverId === userId1))
      );
    } catch {
      return INITIAL_MESSAGES;
    }
  }

  static saveMessages(messages: ChatMessage[]) {
    try {
      const safeList = Array.isArray(messages) ? messages : [];
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(safeList));
    } catch (e) {
      console.error(e);
    }
  }

  static addMessage(msg: Omit<ChatMessage, 'id'>): ChatMessage {
    const all = this.getAllMessages();
    const newMsg: ChatMessage = {
      ...msg,
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    };
    all.push(newMsg);
    this.saveMessages(all);
    return newMsg;
  }

  static getAllMessages(): ChatMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    this.saveMessages(INITIAL_MESSAGES);
    return INITIAL_MESSAGES;
  }

  // --- XP & Progression ---
  static addPersonXpToUser(
    userId: string,
    xpGain: number,
    source: 'daily_routine' | 'arena_victory' | 'couple_goal' = 'daily_routine',
    description: string = 'Rotina diária concluída'
  ): UserXpGainResult & { success: boolean } {
    const users = this.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return {
        success: false,
        previousLevel: 1,
        newLevel: 1,
        previousXp: 0,
        newXp: 0,
        requiredXpForNextLevel: calculateUserXpRequired(1),
        leveledUp: false,
        levelsGained: 0,
        xpAdded: 0,
      };
    }

    const user = { ...users[userIndex] };
    const currentPersonLevel = user.level || 1;
    const currentPersonXp = user.xp || 0;

    const userXpResult = processUserXpAddition(currentPersonLevel, currentPersonXp, xpGain);

    user.level = userXpResult.newLevel;
    user.xp = userXpResult.newXp;

    const historyItem: PersonXpHistoryRecord = {
      id: 'pxp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      date: getTodayDateString(),
      source,
      description,
      xpEarned: xpGain,
      levelAtMoment: userXpResult.newLevel,
      timestamp: new Date().toISOString(),
    };

    user.personXpHistory = Array.isArray(user.personXpHistory)
      ? [historyItem, ...user.personXpHistory]
      : [historyItem];

    users[userIndex] = user;
    this.saveUsers(users);

    return {
      success: true,
      ...userXpResult,
    };
  }

  // Check and grant Person XP for 100% Daily Routine completion (Strictly ONCE per date)
  static checkAndAwardDailyRoutineXp(
    userId: string,
    targetDateStr: string = getTodayDateString()
  ): {
    awarded: boolean;
    alreadyClaimed: boolean;
    routineComplete: boolean;
    xpEarned: number;
    userResult?: UserXpGainResult;
  } {
    const users = this.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return { awarded: false, alreadyClaimed: false, routineComplete: false, xpEarned: 0 };
    }

    const user = users[userIndex];
    const claimedDates = Array.isArray(user.routineXpClaimedDates) ? user.routineXpClaimedDates : [];

    if (claimedDates.includes(targetDateStr)) {
      return { awarded: false, alreadyClaimed: true, routineComplete: true, xpEarned: 0 };
    }

    const dayOfWeek = getTodayDayOfWeek();
    const allUserTasks = this.getTasks(userId);
    const scheduledTasks = allUserTasks.filter(t => t.days.includes(dayOfWeek));

    if (scheduledTasks.length === 0) {
      return { awarded: false, alreadyClaimed: false, routineComplete: false, xpEarned: 0 };
    }

    const completedTasks = scheduledTasks.filter(t => t.completedDates.includes(targetDateStr));
    const is100Percent = completedTasks.length === scheduledTasks.length;

    if (!is100Percent) {
      return { awarded: false, alreadyClaimed: false, routineComplete: false, xpEarned: 0 };
    }

    const routineXpReward = calculateDailyRoutineUserXp(user.level || 1, 100);

    const personResult = this.addPersonXpToUser(
      userId,
      routineXpReward,
      'daily_routine',
      `Rotina de ${formatDateToPortuguese(targetDateStr)} 100% concluída`
    );

    const updatedUsers = this.getUsers();
    const updatedIdx = updatedUsers.findIndex(u => u.id === userId);
    if (updatedIdx !== -1) {
      const u = updatedUsers[updatedIdx];
      const dates = Array.isArray(u.routineXpClaimedDates) ? [...u.routineXpClaimedDates] : [];
      if (!dates.includes(targetDateStr)) {
        dates.push(targetDateStr);
      }
      u.routineXpClaimedDates = dates;
      updatedUsers[updatedIdx] = u;
      this.saveUsers(updatedUsers);
    }

    return {
      awarded: true,
      alreadyClaimed: false,
      routineComplete: true,
      xpEarned: routineXpReward,
      userResult: personResult,
    };
  }

  // --- Partner Linking ---
  static generatePersonalId(name: string): string {
    const clean = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'USER';
    const users = this.getUsers();
    let rand = Math.floor(1000 + Math.random() * 9000);
    let id = `DQ-${clean}-${rand}`;
    
    // Ensure strict uniqueness across all stored accounts
    while (users.some(u => u.personalId === id)) {
      rand = Math.floor(1000 + Math.random() * 9000);
      id = `DQ-${clean}-${rand}`;
    }
    return id;
  }

  static linkPartnerByPersonalId(currentUserId: string, targetPersonalId: string): {
    success: boolean;
    message: string;
    partner?: UserAccount;
  } {
    const users = this.getUsers();
    const currentUser = users.find(u => u.id === currentUserId);
    if (!currentUser) {
      return { success: false, message: 'Usuário atual não encontrado.' };
    }

    const cleanTargetId = targetPersonalId.trim().toUpperCase();
    if (!cleanTargetId) {
      return { success: false, message: 'Por favor, digite o ID do parceiro(a).' };
    }

    if (currentUser.partnerId && currentUser.partnerStatus === 'connected') {
      return { success: false, message: 'Você já possui um vínculo ativo. Desvincule antes de conectar outra conta.' };
    }

    const targetUser = users.find(u => u.personalId.trim().toUpperCase() === cleanTargetId);
    if (!targetUser) {
      return { success: false, message: 'Esse ID não foi encontrado.' };
    }

    if (targetUser.id === currentUser.id || targetUser.personalId.trim().toUpperCase() === currentUser.personalId.trim().toUpperCase()) {
      return { success: false, message: 'Você não pode vincular sua própria conta.' };
    }

    if (targetUser.partnerId && targetUser.partnerId !== currentUser.id && targetUser.partnerStatus === 'connected') {
      return { success: false, message: 'Esta conta já possui um vínculo.' };
    }

    // Establish bidirectional persistent link
    currentUser.partnerId = targetUser.id;
    currentUser.partnerStatus = 'connected';

    targetUser.partnerId = currentUser.id;
    targetUser.partnerStatus = 'connected';

    this.saveUsers(users);
    return {
      success: true,
      message: `Vínculo com ${targetUser.username} realizado com sucesso! ❤️`,
      partner: targetUser
    };
  }

  static unlinkPartner(currentUserId: string) {
    const users = this.getUsers();
    const currentUser = users.find(u => u.id === currentUserId);
    if (!currentUser) return;

    if (currentUser.partnerId) {
      const partner = users.find(u => u.id === currentUser.partnerId);
      if (partner) {
        partner.partnerId = null;
        partner.partnerStatus = 'none';
      }
    }

    currentUser.partnerId = null;
    currentUser.partnerStatus = 'none';
    this.saveUsers(users);
  }

  // --- ⚔️ ARENA: Live State, Matches, Seasons & Flash Challenges ---

  /**
   * Retorna os dados da disputa da Arena de HOJE calculados em tempo real
   */
  static getTodayArenaMatch(userId: string, partnerId: string | null): ArenaDailyMatch {
    const todayStr = getTodayDateString();
    const todayDay = getTodayDayOfWeek();

    const userTasks = this.getTasks(userId).filter(t => t.days.includes(todayDay));
    const userCompleted = userTasks.filter(t => t.completedDates.includes(todayStr)).length;
    const userScore = calculateArenaScore(userCompleted, userTasks.length);

    let partnerScore = 0;
    let partnerCompleted = 0;
    let partnerTotal = 0;

    if (partnerId) {
      const partnerTasks = this.getTasks(partnerId).filter(t => t.days.includes(todayDay));
      partnerCompleted = partnerTasks.filter(t => t.completedDates.includes(todayStr)).length;
      partnerTotal = partnerTasks.length;
      partnerScore = calculateArenaScore(partnerCompleted, partnerTotal);
    } else {
      partnerScore = 75; // Simulation default if no partner yet
      partnerCompleted = 3;
      partnerTotal = 4;
    }

    let winnerId: string | 'draw' | null = null;
    if (userScore > partnerScore + 0.001) {
      winnerId = userId;
    } else if (partnerScore > userScore + 0.001) {
      winnerId = partnerId || 'partner_sim';
    } else {
      winnerId = 'draw';
    }

    const statusObj = getArenaStatusMessage(userScore, partnerScore, 'Ela', 'Você');

    return {
      id: `arena_match_${todayStr}`,
      date: todayStr,
      dateLabel: formatDateToPortuguese(todayStr),
      userScore,
      partnerScore,
      userCompletedTasks: userCompleted,
      userTotalTasks: userTasks.length,
      partnerCompletedTasks: partnerCompleted,
      partnerTotalTasks: partnerTotal,
      winnerId,
      statusText: statusObj.text,
      isClosed: false,
      coupleGoalCompleted: Math.abs(userScore - 100) < 0.001 && Math.abs(partnerScore - 100) < 0.001,
    };
  }

  /**
   * Histórico de disputas da Arena dos dias anteriores (preservado e imutável)
   */
  static getArenaHistory(): ArenaDailyMatch[] {
    try {
      const data = localStorage.getItem(STORAGE_ARENA_HISTORY_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    const initial = this.getInitialArenaHistory();
    this.saveArenaHistory(initial);
    return initial;
  }

  static saveArenaHistory(matches: ArenaDailyMatch[]) {
    try {
      const safeList = Array.isArray(matches) ? matches : [];
      localStorage.setItem(STORAGE_ARENA_HISTORY_KEY, JSON.stringify(safeList));
    } catch (e) {
      console.error(e);
    }
  }

  static getInitialArenaHistory(): ArenaDailyMatch[] {
    return [
      {
        id: 'match_2026-08-28',
        date: '2026-08-28',
        dateLabel: '28 de Agosto',
        userScore: 80,
        partnerScore: 100,
        userCompletedTasks: 4,
        userTotalTasks: 5,
        partnerCompletedTasks: 4,
        partnerTotalTasks: 4,
        winnerId: 'user_mia_2',
        statusText: '💕 Mia venceu o desafio de ontem por 20 pontos!',
        isClosed: true,
        coupleGoalCompleted: false,
      },
      {
        id: 'match_2026-08-27',
        date: '2026-08-27',
        dateLabel: '27 de Agosto',
        userScore: 100,
        partnerScore: 75,
        userCompletedTasks: 6,
        userTotalTasks: 6,
        partnerCompletedTasks: 3,
        partnerTotalTasks: 4,
        winnerId: 'user_leo_1',
        statusText: '🏆 Você venceu com 100% da rotina!',
        isClosed: true,
        coupleGoalCompleted: false,
      },
      {
        id: 'match_2026-08-26',
        date: '2026-08-26',
        dateLabel: '26 de Agosto',
        userScore: 100,
        partnerScore: 100,
        userCompletedTasks: 5,
        userTotalTasks: 5,
        partnerCompletedTasks: 4,
        partnerTotalTasks: 4,
        winnerId: 'draw',
        statusText: '💖 Empate perfeito! Ambos completaram 100% da rotina!',
        isClosed: true,
        coupleGoalCompleted: true,
      },
    ];
  }

  /**
   * Temporada Semanal da Arena
   */
  static getArenaSeasons(): ArenaSeason[] {
    try {
      const data = localStorage.getItem(STORAGE_ARENA_SEASONS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    const initial: ArenaSeason[] = [
      {
        id: 'season_1',
        weekNumber: 1,
        title: 'Semana 1',
        startDate: '2026-08-24',
        endDate: '2026-08-30',
        userWins: 4,
        partnerWins: 5,
        draws: 1,
        totalMatches: 10,
        championId: 'user_mia_2',
        isCompleted: false,
      },
    ];
    this.saveArenaSeasons(initial);
    return initial;
  }

  static saveArenaSeasons(seasons: ArenaSeason[]) {
    try {
      const safeList = Array.isArray(seasons) ? seasons : [];
      localStorage.setItem(STORAGE_ARENA_SEASONS_KEY, JSON.stringify(safeList));
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Disputa Relâmpago (Flash Challenge)
   */
  static getFlashChallenge(): FlashChallenge {
    try {
      const data = localStorage.getItem(STORAGE_FLASH_CHALLENGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    const initial: FlashChallenge = {
      id: 'flash_1',
      title: 'Disputa Relâmpago',
      description: 'Quem completar primeiro a próxima tarefa da rotina?',
      targetDescription: 'Concluir a próxima tarefa agendada',
      userCompletedFirst: null,
      winnerId: null,
      active: true,
    };
    this.saveFlashChallenge(initial);
    return initial;
  }

  static saveFlashChallenge(fc: FlashChallenge) {
    try {
      localStorage.setItem(STORAGE_FLASH_CHALLENGE_KEY, JSON.stringify(fc));
    } catch (e) {
      console.error(e);
    }
  }

  static triggerFlashChallengeCompletion(winnerId: string, winnerName: string) {
    const fc = this.getFlashChallenge();
    fc.winnerId = winnerId;
    fc.active = false;
    fc.completedAt = new Date().toISOString();
    this.saveFlashChallenge(fc);

    // Also send an automated cheerful announcement to chat
    const current = this.getCurrentUser();
    const partner = this.getPartner(current);
    if (partner) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      this.addMessage({
        senderId: winnerId,
        receiverId: winnerId === current.id ? partner.id : current.id,
        senderName: winnerName,
        type: 'encouragement',
        content: `⚡ ${winnerName} completou primeiro a tarefa na Disputa Relâmpago! 🔥`,
        timestamp: timeStr,
        read: true,
      });
    }
  }

  // --- Routine Daily History & 00:00 Auto Day-Closing ---
  static getDailyHistory(userId?: string): DailyHistoryRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_HISTORY_KEY);
      let records: DailyHistoryRecord[] = data ? JSON.parse(data) : [];
      if (!Array.isArray(records) || records.length === 0) {
        records = this.getInitialHistory();
        this.saveDailyHistory(records);
      }
      if (userId) return records.filter(r => r && r.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
      return records.sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return this.getInitialHistory();
    }
  }

  static saveDailyHistory(records: DailyHistoryRecord[]) {
    try {
      const safeList = Array.isArray(records) ? records : [];
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(safeList));
    } catch (e) {
      console.error(e);
    }
  }

  static getInitialHistory(): DailyHistoryRecord[] {
    return [
      {
        id: 'hist_leo_2026-08-28',
        userId: 'user_leo_1',
        date: '2026-08-28',
        dateLabel: '28 de Agosto',
        dayOfWeek: 5,
        totalTasks: 5,
        completedTasks: 4,
        xpEarned: 145,
        tasks: [
          { taskId: 't1', title: 'Acordar cedo e beber 500ml de água', time: '07:00', category: 'health', xpReward: 25, status: 'completed' },
          { taskId: 't2', title: 'Café da manhã nutritivo com frutas', time: '07:45', category: 'routine', xpReward: 30, status: 'completed' },
          { taskId: 't3', title: 'Estudar programação / novos projetos', time: '09:00', category: 'study', xpReward: 50, status: 'completed' },
          { taskId: 't4', title: 'Treino de musculação ou corrida de 35m', time: '18:00', category: 'fitness', xpReward: 60, status: 'not_completed' },
          { taskId: 't5', title: 'Mandar mensagem fofa / foto do dia', time: '20:30', category: 'love', xpReward: 40, status: 'completed' },
        ],
      },
    ];
  }

  // Automatic Day Closing logic at midnight or when opening app on a new day
  static processDayClosing(userId: string) {
    const todayStr = getTodayDateString();
    const tasks = this.getTasks(userId);
    const history = this.getDailyHistory();

    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      const pastDate = new Date(d);
      pastDate.setDate(d.getDate() - i);
      const pastDateStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;
      const pastDayOfWeek = pastDate.getDay() as DayOfWeek;

      const alreadyArchived = history.some(h => h.userId === userId && h.date === pastDateStr);
      if (!alreadyArchived) {
        const scheduledTasks = tasks.filter(t => t.days.includes(pastDayOfWeek));
        if (scheduledTasks.length > 0) {
          let completedCount = 0;
          let earnedXp = 0;

          const historyTasks = scheduledTasks.map(t => {
            const wasCompleted = t.completedDates.includes(pastDateStr);
            if (wasCompleted) {
              completedCount++;
              earnedXp += t.xpReward;
              return {
                taskId: t.id,
                title: t.title,
                time: t.time,
                category: t.category,
                xpReward: t.xpReward,
                status: 'completed' as const,
              };
            } else {
              if (!t.failedDates.includes(pastDateStr)) {
                t.failedDates.push(pastDateStr);
              }
              return {
                taskId: t.id,
                title: t.title,
                time: t.time,
                category: t.category,
                xpReward: t.xpReward,
                status: 'not_completed' as const,
              };
            }
          });

          history.push({
            id: `hist_${userId}_${pastDateStr}`,
            userId,
            date: pastDateStr,
            dateLabel: formatDateToPortuguese(pastDateStr),
            dayOfWeek: pastDayOfWeek,
            tasks: historyTasks,
            totalTasks: scheduledTasks.length,
            completedTasks: completedCount,
            xpEarned: earnedXp,
          });
        }
      }
    }

    this.saveDailyHistory(history);
    this.saveTasks(this.getTasks());
  }
}
