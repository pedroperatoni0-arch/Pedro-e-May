import { UserAccount } from '../types';
import { FirebaseService, PublicUserProfile, StoredUserDoc, generatePublicId } from './firebaseService';

const SESSION_STORAGE_KEY = 'duoquest_current_session_uid_v1';
const TOKEN_STORAGE_KEY = 'duoquest_auth_token_v1';

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: UserAccount;
  partner?: UserAccount | null;
  token?: string;
}

function docToUserAccount(doc: StoredUserDoc): UserAccount {
  return {
    id: doc.id,
    username: doc.username,
    avatar: doc.avatar || 'sakura',
    personalId: doc.personalId,
    level: doc.level || 1,
    xp: doc.xp || 0,
    streakDays: doc.streakDays || 1,
    arenaWins: doc.arenaWins || 0,
    routineXpClaimedDates: doc.routineXpClaimedDates || [],
    partnerId: doc.partnerId || null,
    partnerStatus: doc.partnerStatus || 'none',
    pendingPartnerId: doc.pendingPartnerId || null,
    customStatus: doc.partnerName ? `Conectado com ${doc.partnerName} ❤️` : 'Focado(a) na rotina a dois! ❤️',
    theme: doc.theme || 'rose',
    soundEnabled: doc.soundEnabled ?? true,
    vibrationEnabled: doc.vibrationEnabled ?? true,
  };
}

export class AuthApi {
  public static getCurrentUid(): string | null {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public static setCurrentUid(uid: string) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, uid);
    } catch (e) {
      console.error(e);
    }
  }

  public static clearSession() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  }

  public static getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public static setToken(token: string) {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Register a new account globally in Cloud Firestore
   */
  public static async register(params: {
    username: string;
    email: string;
    password: string;
    avatar?: string;
  }): Promise<AuthResponse> {
    try {
      const cleanUsername = params.username.trim();
      const cleanEmail = params.email.trim().toLowerCase();
      
      // Generate a new clean Public ID (e.g. 72QX-7KJ9)
      const generatedId = generatePublicId(cleanUsername);
      const uid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newUserDoc: StoredUserDoc = {
        id: uid,
        username: cleanUsername,
        email: cleanEmail,
        personalId: generatedId,
        personalIdClean: generatedId.replace(/[^A-Z0-9]/g, '').toUpperCase(),
        avatar: params.avatar || 'sakura',
        level: 1,
        xp: 0,
        streakDays: 1,
        arenaWins: 0,
        routineXpClaimedDates: [],
        partnerId: null,
        partnerStatus: 'none',
        theme: 'rose',
        soundEnabled: true,
        vibrationEnabled: true,
        createdAt: new Date().toISOString(),
      };

      // 1. Save directly to Cloud Firestore
      await FirebaseService.saveUser(newUserDoc);

      // 2. Set local session
      this.setCurrentUid(uid);
      const userAccount = docToUserAccount(newUserDoc);

      // 3. Also notify local backend to establish session token if available
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...params,
            customId: uid,
            personalId: generatedId,
          }),
        });
        const data = await res.json();
        if (data.token) {
          this.setToken(data.token);
        }
      } catch (err) {
        console.warn('[AuthApi] Backend proxy sync note:', err);
      }

      return {
        success: true,
        user: userAccount,
        partner: null,
      };
    } catch (err: any) {
      console.error('[AuthApi] Registration error:', err);
      return {
        success: false,
        message: 'Erro ao criar conta no servidor. Tente novamente.',
      };
    }
  }

  /**
   * Login an existing account using Cloud Firestore
   */
  public static async login(params: {
    login: string;
    password: string;
  }): Promise<AuthResponse> {
    try {
      const cleanLogin = params.login.trim();
      if (!cleanLogin) {
        return { success: false, message: 'Digite seu e-mail, nome ou ID de usuário.' };
      }

      // 1. Find user in Cloud Firestore
      const foundProfile = await FirebaseService.searchUser(cleanLogin);
      if (!foundProfile) {
        return {
          success: false,
          message: 'Conta não encontrada. Verifique os dados ou crie uma nova conta.',
        };
      }

      // Fetch full document
      const fullDoc = await FirebaseService.getUserById(foundProfile.id);
      if (!fullDoc) {
        return { success: false, message: 'Não foi possível carregar os dados da conta.' };
      }

      this.setCurrentUid(fullDoc.id);
      const userAccount = docToUserAccount(fullDoc);

      // Load partner if linked
      let partnerAccount: UserAccount | null = null;
      if (fullDoc.partnerId && fullDoc.partnerStatus === 'connected') {
        const partnerDoc = await FirebaseService.getUserById(fullDoc.partnerId);
        if (partnerDoc) {
          partnerAccount = docToUserAccount(partnerDoc);
        }
      }

      // Sync backend session token
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: cleanLogin, password: params.password }),
        });
        const data = await res.json();
        if (data.token) {
          this.setToken(data.token);
        }
      } catch (err) {
        console.warn('[AuthApi] Backend proxy login note:', err);
      }

      return {
        success: true,
        user: userAccount,
        partner: partnerAccount,
      };
    } catch (err) {
      console.error('[AuthApi] Login error:', err);
      return {
        success: false,
        message: 'Erro ao entrar na conta. Verifique sua conexão.',
      };
    }
  }

  /**
   * Get current authenticated user details from Cloud Firestore
   */
  public static async getMe(): Promise<AuthResponse> {
    const uid = this.getCurrentUid();
    if (!uid) {
      return { success: false, message: 'Nenhuma sessão ativa.' };
    }

    try {
      const userDoc = await FirebaseService.getUserById(uid);
      if (!userDoc) {
        this.clearSession();
        return { success: false, message: 'Sessão expirada.' };
      }

      const userAccount = docToUserAccount(userDoc);
      let partnerAccount: UserAccount | null = null;

      if (userDoc.partnerId && userDoc.partnerStatus === 'connected') {
        const partnerDoc = await FirebaseService.getUserById(userDoc.partnerId);
        if (partnerDoc && partnerDoc.partnerId === userDoc.id) {
          partnerAccount = docToUserAccount(partnerDoc);
        }
      }

      return {
        success: true,
        user: userAccount,
        partner: partnerAccount,
      };
    } catch (err) {
      console.error('[AuthApi] getMe error:', err);
      return {
        success: false,
        message: 'Erro ao carregar dados do usuário.',
      };
    }
  }

  /**
   * Logout user
   */
  public static async logout(): Promise<void> {
    this.clearSession();
  }

  /**
   * Search for a partner account by Public ID in Cloud Firestore
   */
  public static async searchPartner(partnerPersonalId: string): Promise<{
    success: boolean;
    message?: string;
    isSelf?: boolean;
    user?: UserAccount;
  }> {
    const currentUid = this.getCurrentUid();
    const queryClean = (partnerPersonalId || '').trim();

    if (!queryClean) {
      return { success: false, message: 'Por favor, digite o ID do parceiro(a).' };
    }

    try {
      // Direct Cloud Firestore query across all users in all devices
      const foundProfile = await FirebaseService.searchUser(queryClean);
      
      if (!foundProfile) {
        return {
          success: false,
          message: 'ID não encontrado no servidor. Verifique se o parceiro já criou a conta.',
        };
      }

      if (currentUid && foundProfile.id === currentUid) {
        return {
          success: false,
          isSelf: true,
          message: 'Este é o seu próprio ID. Peça o ID da sua parceira ou parceiro. ❤️',
        };
      }

      const userAccount: UserAccount = {
        id: foundProfile.id,
        username: foundProfile.username,
        avatar: foundProfile.avatar || 'sakura',
        personalId: foundProfile.personalId,
        level: foundProfile.level || 1,
        xp: foundProfile.xp || 0,
        streakDays: foundProfile.streakDays || 1,
        arenaWins: 0,
        routineXpClaimedDates: [],
        partnerId: foundProfile.partnerId || null,
        partnerStatus: foundProfile.partnerStatus || 'none',
        theme: 'rose',
        soundEnabled: true,
        vibrationEnabled: true,
      };

      return {
        success: true,
        user: userAccount,
      };
    } catch (err) {
      console.error('[AuthApi] Search partner error:', err);
      return {
        success: false,
        message: 'Erro ao buscar ID no servidor. Verifique sua conexão.',
      };
    }
  }

  /**
   * Link two partner accounts bidirectionally in Cloud Firestore
   */
  public static async linkPartner(partnerPersonalId: string): Promise<{
    success: boolean;
    message: string;
    partner?: UserAccount;
  }> {
    const currentUid = this.getCurrentUid();
    if (!currentUid) {
      return { success: false, message: 'Você precisa estar conectado a uma conta.' };
    }

    try {
      const currentUserDoc = await FirebaseService.getUserById(currentUid);
      if (!currentUserDoc) {
        return { success: false, message: 'Usuário atual não encontrado.' };
      }

      const currentUserAccount = docToUserAccount(currentUserDoc);

      // Search target partner in Firestore
      const targetProfile = await FirebaseService.searchUser(partnerPersonalId);
      if (!targetProfile) {
        return { success: false, message: 'ID do parceiro não encontrado no servidor.' };
      }

      if (targetProfile.id === currentUid) {
        return { success: false, message: 'Você não pode vincular sua própria conta.' };
      }

      // Check if target is already linked with someone else
      if (targetProfile.partnerId && targetProfile.partnerId !== currentUid && targetProfile.partnerStatus === 'connected') {
        return { success: false, message: 'Esta conta já está vinculada com outro parceiro(a).' };
      }

      // Atomic Bidirectional Link in Cloud Firestore
      const ok = await FirebaseService.linkCouple(currentUserAccount, targetProfile);
      if (!ok) {
        return { success: false, message: 'Falha ao gravar o vínculo no servidor. Tente novamente.' };
      }

      // Fetch fresh partner data
      const freshPartnerDoc = await FirebaseService.getUserById(targetProfile.id);
      const partnerAccount = freshPartnerDoc ? docToUserAccount(freshPartnerDoc) : null;

      // Also trigger backend notification if available
      try {
        const token = this.getToken();
        if (token) {
          await fetch('/api/partner/link', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ partnerPersonalId }),
          });
        }
      } catch {
        // Backend notification non-blocking
      }

      return {
        success: true,
        message: `Vínculo com ${targetProfile.username} realizado com sucesso! ❤️`,
        partner: partnerAccount || undefined,
      };
    } catch (err) {
      console.error('[AuthApi] Link partner error:', err);
      return {
        success: false,
        message: 'Erro ao vincular contas no servidor.',
      };
    }
  }

  /**
   * Unlink accounts bidirectionally in Cloud Firestore
   */
  public static async unlinkPartner(): Promise<{
    success: boolean;
    message: string;
  }> {
    const currentUid = this.getCurrentUid();
    if (!currentUid) {
      return { success: false, message: 'Você precisa estar conectado a uma conta.' };
    }

    try {
      const currentUserDoc = await FirebaseService.getUserById(currentUid);
      const partnerId = currentUserDoc?.partnerId;

      await FirebaseService.unlinkCouple(currentUid, partnerId);

      // Notify backend if token available
      try {
        const token = this.getToken();
        if (token) {
          await fetch('/api/partner/unlink', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        // Non-blocking
      }

      return {
        success: true,
        message: 'Vínculo desfeito com sucesso.',
      };
    } catch (err) {
      console.error('[AuthApi] Unlink partner error:', err);
      return {
        success: false,
        message: 'Erro ao desvincular contas no servidor.',
      };
    }
  }
}
