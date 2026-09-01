import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface StoredUser {
  id: string;
  personalId: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  avatar: string;
  level: number;
  xp: number;
  streakDays: number;
  arenaWins: number;
  partnerId: string | null;
  partnerStatus: 'none' | 'connected';
  customStatus: string;
  theme: 'rose' | 'lavender' | 'mint' | 'sunset';
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  routineXpClaimedDates: string[];
  createdAt: string;
}

export type PublicUser = Omit<StoredUser, 'passwordHash' | 'salt'>;

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const JWT_SECRET = process.env.SESSION_SECRET || 'duoquest_super_secret_session_key_2026';

// Helper to hash password securely with salt using PBKDF2
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

// Helper to verify password
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return check === hash;
}

// Generate unique public ID (e.g. 7K4M-92PX, 72QX-7KJ9)
const ID_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateUniquePublicId(existingIds: Set<string>): string {
  let id = '';
  let attempts = 0;
  do {
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
      part1 += ID_CHARSET[crypto.randomInt(0, ID_CHARSET.length)];
      part2 += ID_CHARSET[crypto.randomInt(0, ID_CHARSET.length)];
    }
    id = `${part1}-${part2}`;
    attempts++;
  } while (existingIds.has(id.toUpperCase()) && attempts < 1000);

  return id;
}

// Generate signed durable session token
export function createSessionToken(userId: string): string {
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days
  const data = `${userId}:${expiry}`;
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${hmac}`).toString('base64url');
}

// Validate signed session token
export function verifySessionToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = raw.split(':');
    if (parts.length !== 3) return null;
    const [userId, expiryStr, hmac] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) {
      return null;
    }
    const data = `${userId}:${expiry}`;
    const expectedHmac = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
    if (hmac === expectedHmac) {
      return userId;
    }
  } catch {
    return null;
  }
  return null;
}

class UserStore {
  private users: StoredUser[] = [];
  private sessions: Map<string, string> = new Map(); // token -> userId

  constructor() {
    this.ensureLoaded();
  }

  // Synchronous disk reload to ensure every request sees latest state from all devices
  public ensureLoaded() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        if (raw.trim()) {
          this.users = JSON.parse(raw);
        }
      } else {
        this.users = [];
        this.saveToDisk();
      }

      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          this.sessions = new Map(Object.entries(parsed));
        }
      }
    } catch (err) {
      console.error('[UserStore] Error loading database files:', err);
    }
  }

  // Atomic file write
  private saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${USERS_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.users, null, 2), 'utf-8');
      fs.renameSync(tmpFile, USERS_FILE);
    } catch (err) {
      console.error('[UserStore] Error saving users to disk:', err);
    }
  }

  private saveSessionsToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${SESSIONS_FILE}.tmp`;
      const obj = Object.fromEntries(this.sessions);
      fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2), 'utf-8');
      fs.renameSync(tmpFile, SESSIONS_FILE);
    } catch (err) {
      console.error('[UserStore] Error saving sessions to disk:', err);
    }
  }

  // Internal Finders (do NOT call ensureLoaded inside to preserve object identities)
  private findInternalById(id: string): StoredUser | undefined {
    return this.users.find(u => u.id === id);
  }

  private findInternalByEmail(email: string): StoredUser | undefined {
    if (!email) return undefined;
    const clean = email.trim().toLowerCase();
    return this.users.find(u => u.email && u.email.toLowerCase() === clean);
  }

  private findInternalByUsername(username: string): StoredUser | undefined {
    if (!username) return undefined;
    const clean = username.trim().toLowerCase();
    return this.users.find(u => u.username && u.username.toLowerCase() === clean);
  }

  private findInternalByPersonalId(personalId: string): StoredUser | undefined {
    if (!personalId) return undefined;
    const rawClean = personalId.trim().toUpperCase();
    const alphaNumClean = rawClean.replace(/[^A-Z0-9]/g, '');

    let found = this.users.find(u => u.personalId && u.personalId.trim().toUpperCase() === rawClean);
    if (found) return found;

    if (alphaNumClean.length >= 4) {
      found = this.users.find(
        u => u.personalId && u.personalId.replace(/[^A-Z0-9]/g, '').toUpperCase() === alphaNumClean
      );
    }
    return found;
  }

  public findInternalByAnyIdentifier(identifier: string): StoredUser | undefined {
    if (!identifier) return undefined;
    const clean = identifier.trim();
    if (!clean) return undefined;

    // 1. Try personalId (exact or alphanumeric)
    const byId = this.findInternalByPersonalId(clean);
    if (byId) return byId;

    // 2. Try email
    const byEmail = this.findInternalByEmail(clean);
    if (byEmail) return byEmail;

    // 3. Try username
    const byUser = this.findInternalByUsername(clean);
    if (byUser) return byUser;

    return undefined;
  }

  public toPublicUser(user: StoredUser): PublicUser {
    const { passwordHash, salt, ...publicData } = user;
    return publicData;
  }

  public getAllPublicUsers(): PublicUser[] {
    this.ensureLoaded();
    return this.users.map(u => this.toPublicUser(u));
  }

  public findById(id: string): StoredUser | undefined {
    this.ensureLoaded();
    return this.findInternalById(id);
  }

  public findByEmail(email: string): StoredUser | undefined {
    this.ensureLoaded();
    return this.findInternalByEmail(email);
  }

  public findByUsername(username: string): StoredUser | undefined {
    this.ensureLoaded();
    return this.findInternalByUsername(username);
  }

  public findByPersonalId(personalId: string): StoredUser | undefined {
    this.ensureLoaded();
    return this.findInternalByPersonalId(personalId);
  }

  // Register New User
  public register(params: {
    username: string;
    email: string;
    password: string;
    avatar?: string;
    customId?: string;
    personalId?: string;
  }): { success: boolean; message?: string; user?: PublicUser; token?: string } {
    this.ensureLoaded();

    const username = params.username.trim();
    const email = params.email.trim().toLowerCase();
    const password = params.password;

    // Validations
    if (!username) {
      return { success: false, message: 'Por favor, informe seu nome de usuário.' };
    }
    if (username.length < 2) {
      return { success: false, message: 'O nome de usuário deve ter pelo menos 2 caracteres.' };
    }
    if (username.length > 30) {
      return { success: false, message: 'O nome de usuário deve ter no máximo 30 caracteres.' };
    }

    if (!email) {
      return { success: false, message: 'Por favor, informe seu e-mail.' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, message: 'Por favor, insira um e-mail válido.' };
    }

    if (!password) {
      return { success: false, message: 'Por favor, digite sua senha.' };
    }
    if (password.length < 6) {
      return { success: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
    }

    // Email Uniqueness Check
    const existingByEmail = this.findInternalByEmail(email);
    if (existingByEmail) {
      if (params.customId && existingByEmail.id === params.customId) {
        // Same account being re-synced
        const token = createSessionToken(existingByEmail.id);
        return { success: true, user: this.toPublicUser(existingByEmail), token };
      }
      return { success: false, message: 'Este e-mail já está sendo utilizado por outra conta.' };
    }

    // Generate Guaranteed Unique Public ID or use provided
    const existingIds = new Set(this.users.map(u => u.personalId.toUpperCase()));
    const personalId = params.personalId || generateUniquePublicId(existingIds);

    // Hash Password
    const { hash, salt } = hashPassword(password);

    const newUserId = params.customId || ('user_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'));
    const newUser: StoredUser = {
      id: newUserId,
      personalId,
      username,
      email,
      passwordHash: hash,
      salt,
      avatar: params.avatar || '🌸',
      level: 1,
      xp: 0,
      streakDays: 1,
      arenaWins: 0,
      partnerId: null,
      partnerStatus: 'none',
      customStatus: 'Focado(a) na rotina a dois! ❤️',
      theme: 'rose',
      soundEnabled: true,
      vibrationEnabled: true,
      routineXpClaimedDates: [],
      createdAt: new Date().toISOString(),
    };

    this.users.push(newUser);
    this.saveToDisk();

    // Create durable session token
    const token = createSessionToken(newUser.id);
    this.sessions.set(token, newUser.id);
    this.saveSessionsToDisk();

    console.log(`[UserStore] New account registered: "${newUser.username}" (${newUser.id}) with Public ID: [${newUser.personalId}]`);

    return {
      success: true,
      user: this.toPublicUser(newUser),
      token,
    };
  }

  // Login
  public login(params: {
    login: string;
    password: string;
  }): { success: boolean; message?: string; user?: PublicUser; partner?: PublicUser | null; token?: string } {
    this.ensureLoaded();

    const login = (params.login || '').trim();
    const password = params.password;

    if (!login) {
      return { success: false, message: 'Informe seu e-mail, nome de usuário ou ID.' };
    }
    if (!password) {
      return { success: false, message: 'Informe sua senha.' };
    }

    const user = this.findInternalByAnyIdentifier(login);
    if (!user) {
      return { success: false, message: 'Nenhuma conta encontrada com este e-mail, usuário ou ID.' };
    }

    const isValid = verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) {
      return { success: false, message: 'Senha incorreta para esta conta.' };
    }

    const token = createSessionToken(user.id);
    this.sessions.set(token, user.id);
    this.saveSessionsToDisk();

    let partner: PublicUser | null = null;
    if (user.partnerId && user.partnerStatus === 'connected') {
      const p = this.findInternalById(user.partnerId);
      if (p && p.partnerId === user.id) {
        partner = this.toPublicUser(p);
      }
    }

    console.log(`[UserStore] Login successful: "${user.username}" (ID: ${user.personalId})`);

    return {
      success: true,
      user: this.toPublicUser(user),
      partner,
      token,
    };
  }

  // Get User by Session Token
  public getUserByToken(token: string): PublicUser | undefined {
    this.ensureLoaded();

    let userId = this.sessions.get(token);

    if (!userId) {
      const verifiedUserId = verifySessionToken(token);
      if (verifiedUserId) {
        userId = verifiedUserId;
        this.sessions.set(token, verifiedUserId);
      }
    }

    if (!userId) return undefined;
    const user = this.findInternalById(userId);
    return user ? this.toPublicUser(user) : undefined;
  }

  // Logout
  public logout(token: string) {
    this.sessions.delete(token);
    this.saveSessionsToDisk();
  }

  // Search / Lookup User by Public Personal ID (without linking yet)
  public searchByPersonalId(
    requesterUserId: string,
    targetPersonalId: string
  ): {
    success: boolean;
    message?: string;
    isSelf?: boolean;
    user?: PublicUser;
  } {
    this.ensureLoaded();

    const clean = (targetPersonalId || '').trim();
    if (!clean) {
      return { success: false, message: 'Por favor, digite o ID do parceiro(a).' };
    }

    const requester = this.findInternalById(requesterUserId);
    const targetUser = this.findInternalByAnyIdentifier(clean);

    if (!targetUser) {
      console.log(`[UserStore] Search ID [${clean}] NOT found in database.`);
      return { success: false, message: 'ID não encontrado no servidor.' };
    }

    if (requester && (targetUser.id === requester.id || targetUser.personalId.toUpperCase() === requester.personalId.toUpperCase())) {
      return {
        success: false,
        isSelf: true,
        message: 'Este é o seu próprio ID. Peça o ID da sua parceira ou parceiro. ❤️',
      };
    }

    console.log(`[UserStore] Search ID [${clean}] FOUND user: "${targetUser.username}" (${targetUser.personalId})`);

    return {
      success: true,
      user: this.toPublicUser(targetUser),
    };
  }

  // Link Partner by Public Personal ID (Atomic Bidirectional Operation: A <---> B)
  public linkPartner(
    userId: string,
    targetPersonalId: string
  ): {
    success: boolean;
    message: string;
    user?: PublicUser;
    partner?: PublicUser;
  } {
    this.ensureLoaded();

    const currentUser = this.findInternalById(userId);
    if (!currentUser) {
      return { success: false, message: 'Usuário não autenticado.' };
    }

    const cleanTargetId = (targetPersonalId || '').trim();
    if (!cleanTargetId) {
      return { success: false, message: 'Por favor, digite o ID do parceiro(a).' };
    }

    const targetUser = this.findInternalByAnyIdentifier(cleanTargetId);
    if (!targetUser) {
      console.log(`[UserStore] Link failed: Target ID [${cleanTargetId}] not found in database.`);
      return { success: false, message: 'ID não encontrado no servidor.' };
    }

    // Check self-link
    if (
      targetUser.id === currentUser.id ||
      targetUser.personalId.trim().toUpperCase() === currentUser.personalId.trim().toUpperCase()
    ) {
      return { success: false, message: 'Você não pode vincular sua própria conta. ❤️' };
    }

    // Check if already linked together (Idempotent success)
    if (
      currentUser.partnerId === targetUser.id &&
      targetUser.partnerId === currentUser.id &&
      currentUser.partnerStatus === 'connected' &&
      targetUser.partnerStatus === 'connected'
    ) {
      return {
        success: true,
        message: `Vínculo com ${targetUser.username} já está ativo! ❤️`,
        user: this.toPublicUser(currentUser),
        partner: this.toPublicUser(targetUser),
      };
    }

    // Check if current user is already linked with someone else
    if (currentUser.partnerId && currentUser.partnerId !== targetUser.id && currentUser.partnerStatus === 'connected') {
      const existingPartner = this.findInternalById(currentUser.partnerId);
      const name = existingPartner ? existingPartner.username : 'outro usuário';
      return { success: false, message: `Você já possui um vínculo ativo com ${name}. Desvincule primeiro.` };
    }

    // Check if target user is already linked with someone else
    if (targetUser.partnerId && targetUser.partnerId !== currentUser.id && targetUser.partnerStatus === 'connected') {
      return { success: false, message: 'Esta conta já possui um vínculo com outro parceiro(a).' };
    }

    // Atomic bidirectional relationship update on active in-memory array elements
    currentUser.partnerId = targetUser.id;
    currentUser.partnerStatus = 'connected';

    targetUser.partnerId = currentUser.id;
    targetUser.partnerStatus = 'connected';

    this.saveToDisk();

    console.log(`[UserStore] Couple link established: "${currentUser.username}" (${currentUser.id}) <---> "${targetUser.username}" (${targetUser.id})`);

    return {
      success: true,
      message: `Conectado com ${targetUser.username} ❤️`,
      user: this.toPublicUser(currentUser),
      partner: this.toPublicUser(targetUser),
    };
  }

  // Unlink Partner
  public unlinkPartner(userId: string): { success: boolean; message: string } {
    this.ensureLoaded();

    const currentUser = this.findInternalById(userId);
    if (!currentUser) {
      return { success: false, message: 'Usuário não encontrado.' };
    }

    if (currentUser.partnerId) {
      const partner = this.findInternalById(currentUser.partnerId);
      if (partner) {
        partner.partnerId = null;
        partner.partnerStatus = 'none';
      }
    }

    currentUser.partnerId = null;
    currentUser.partnerStatus = 'none';

    this.saveToDisk();

    console.log(`[UserStore] Partner unlinked for user "${currentUser.username}" (${currentUser.id})`);

    return { success: true, message: 'Vínculo desfeito com sucesso.' };
  }

  // Update user profile data
  public updateUser(userId: string, updates: Partial<StoredUser>): PublicUser | null {
    this.ensureLoaded();

    const user = this.findInternalById(userId);
    if (!user) return null;

    if (updates.username !== undefined) user.username = updates.username;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;
    if (updates.customStatus !== undefined) user.customStatus = updates.customStatus;
    if (updates.level !== undefined) user.level = updates.level;
    if (updates.xp !== undefined) user.xp = updates.xp;
    if (updates.streakDays !== undefined) user.streakDays = updates.streakDays;
    if (updates.arenaWins !== undefined) user.arenaWins = updates.arenaWins;
    if (updates.theme !== undefined) user.theme = updates.theme;
    if (updates.soundEnabled !== undefined) user.soundEnabled = updates.soundEnabled;
    if (updates.vibrationEnabled !== undefined) user.vibrationEnabled = updates.vibrationEnabled;
    if (updates.routineXpClaimedDates !== undefined) user.routineXpClaimedDates = updates.routineXpClaimedDates;

    this.saveToDisk();
    return this.toPublicUser(user);
  }
}

export const userStore = new UserStore();
