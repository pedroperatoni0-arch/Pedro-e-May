import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  orderBy,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserAccount, Task, ChatMessage, TaskStatus, DayOfWeek } from '../types';

export interface PublicUserProfile {
  id: string;
  username: string;
  personalId: string;
  avatar: string;
  level: number;
  xp: number;
  streakDays: number;
  partnerId: string | null;
  partnerStatus: 'none' | 'pending' | 'connected';
}

export interface StoredUserDoc {
  id: string;
  username: string;
  email: string;
  passwordHash?: string;
  salt?: string;
  personalId: string;
  personalIdClean: string;
  avatar: string;
  level: number;
  xp: number;
  streakDays: number;
  arenaWins: number;
  routineXpClaimedDates: string[];
  partnerId: string | null;
  partnerStatus: 'none' | 'pending' | 'connected';
  pendingPartnerId?: string | null;
  partnerPersonalId?: string | null;
  partnerName?: string | null;
  theme: 'rose' | 'lavender' | 'mint' | 'sunset';
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Generate consistent unique personal ID (e.g. 72QX-7KJ9)
export function generatePublicId(seed?: string): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 characters, no confusing 0/O/1/I
  let result = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) result += '-';
    const rand = Math.floor(Math.random() * chars.length);
    result += chars[rand];
  }
  return result;
}

// Normalize ID for searching (uppercase, alphanumeric only)
export function cleanIdForSearch(id: string): string {
  return (id || '').trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

export const FirebaseService = {
  // --- USERS ---

  /**
   * Save or update a full user profile in Firestore
   */
  async saveUser(user: Partial<StoredUserDoc> & { id: string; username: string; personalId: string }): Promise<void> {
    try {
      const userRef = doc(db, 'users', user.id);
      const cleanId = cleanIdForSearch(user.personalId);
      
      const payload: Record<string, any> = {
        ...user,
        personalIdClean: cleanId,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(userRef, payload, { merge: true });
      console.log(`[Firebase] User ${user.username} (${user.id}) saved to Firestore.`);
    } catch (err) {
      console.error('[Firebase] Error saving user:', err);
      throw err;
    }
  },

  /**
   * Fetch a user profile by User ID (Firestore doc id)
   */
  async getUserById(userId: string): Promise<StoredUserDoc | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        return snap.data() as StoredUserDoc;
      }
      return null;
    } catch (err) {
      console.error('[Firebase] Error getting user by ID:', err);
      return null;
    }
  },

  /**
   * Search for a user across the entire Firestore database by:
   * 1. Public ID (e.g. ARQN-8TS6 or ARQN8TS6)
   * 2. Username
   * 3. Email
   */
  async searchUser(queryStr: string): Promise<PublicUserProfile | null> {
    try {
      const raw = (queryStr || '').trim();
      if (!raw) return null;

      const clean = cleanIdForSearch(raw);
      const rawUpper = raw.toUpperCase();
      const usersRef = collection(db, 'users');

      // 1. Search by exact personalId (e.g. "ARQN-8TS6")
      let q = query(usersRef, where('personalId', '==', rawUpper));
      let querySnap = await getDocs(q);

      if (querySnap.empty && clean.length >= 3) {
        // 2. Search by cleaned alphanumeric personalIdClean (e.g. "ARQN8TS6")
        q = query(usersRef, where('personalIdClean', '==', clean));
        querySnap = await getDocs(q);
      }

      if (querySnap.empty) {
        // 3. Search by username
        q = query(usersRef, where('username', '==', raw));
        querySnap = await getDocs(q);
      }

      if (querySnap.empty) {
        // 4. Search by email
        q = query(usersRef, where('email', '==', raw.toLowerCase()));
        querySnap = await getDocs(q);
      }

      // If still not found, do a fallback scan of all users in Firestore to match normalized strings
      if (querySnap.empty) {
        const allUsersSnap = await getDocs(usersRef);
        for (const docSnap of allUsersSnap.docs) {
          const u = docSnap.data() as StoredUserDoc;
          const uPersonalId = (u.personalId || '').toUpperCase();
          const uClean = cleanIdForSearch(u.personalId || '');
          const uUsername = (u.username || '').toLowerCase();
          const uEmail = (u.email || '').toLowerCase();

          if (
            uPersonalId === rawUpper ||
            (clean.length >= 4 && uClean === clean) ||
            uUsername === raw.toLowerCase() ||
            uEmail === raw.toLowerCase()
          ) {
            return {
              id: u.id,
              username: u.username,
              personalId: u.personalId,
              avatar: u.avatar || 'sakura',
              level: u.level || 1,
              xp: u.xp || 0,
              streakDays: u.streakDays || 1,
              partnerId: u.partnerId || null,
              partnerStatus: u.partnerStatus || 'none',
            };
          }
        }
      }

      if (!querySnap.empty) {
        const docData = querySnap.docs[0].data() as StoredUserDoc;
        return {
          id: docData.id,
          username: docData.username,
          personalId: docData.personalId,
          avatar: docData.avatar || 'sakura',
          level: docData.level || 1,
          xp: docData.xp || 0,
          streakDays: docData.streakDays || 1,
          partnerId: docData.partnerId || null,
          partnerStatus: docData.partnerStatus || 'none',
        };
      }

      return null;
    } catch (err) {
      console.error('[Firebase] Error searching user:', err);
      return null;
    }
  },

  /**
   * Subscribe to real-time updates for a user profile
   */
  subscribeToUser(userId: string, onUpdate: (user: StoredUserDoc | null) => void): Unsubscribe {
    const userRef = doc(db, 'users', userId);
    return onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          onUpdate(docSnap.data() as StoredUserDoc);
        } else {
          onUpdate(null);
        }
      },
      (err) => {
        console.error('[Firebase] User subscription error:', err);
      }
    );
  },

  // --- COUPLE LINKING (BIDIRECTIONAL ATOMIC WRITES) ---

  /**
   * Links two user accounts bidirectionally in Firestore.
   * Both User A and User B documents are updated in a single atomic batch.
   */
  async linkCouple(userA: UserAccount, partnerProfile: PublicUserProfile): Promise<boolean> {
    try {
      const batch = writeBatch(db);

      const userARef = doc(db, 'users', userA.id);
      const userBRef = doc(db, 'users', partnerProfile.id);

      const updateTime = new Date().toISOString();

      // Update User A document with merge
      batch.set(
        userARef,
        {
          id: userA.id,
          username: userA.username,
          personalId: userA.personalId,
          personalIdClean: cleanIdForSearch(userA.personalId),
          avatar: userA.avatar,
          partnerId: partnerProfile.id,
          partnerStatus: 'connected',
          partnerPersonalId: partnerProfile.personalId,
          partnerName: partnerProfile.username,
          updatedAt: updateTime,
        },
        { merge: true }
      );

      // Update User B document with merge
      batch.set(
        userBRef,
        {
          id: partnerProfile.id,
          username: partnerProfile.username,
          personalId: partnerProfile.personalId,
          personalIdClean: cleanIdForSearch(partnerProfile.personalId),
          avatar: partnerProfile.avatar,
          partnerId: userA.id,
          partnerStatus: 'connected',
          partnerPersonalId: userA.personalId,
          partnerName: userA.username,
          updatedAt: updateTime,
        },
        { merge: true }
      );

      await batch.commit();
      console.log(`[Firebase] Couple linked atomically: ${userA.username} <-> ${partnerProfile.username}`);
      return true;
    } catch (err) {
      console.error('[Firebase] Error linking couple:', err);
      return false;
    }
  },

  /**
   * Unlinks two user accounts bidirectionally in Firestore.
   */
  async unlinkCouple(userIdA: string, userIdB?: string | null): Promise<boolean> {
    try {
      const batch = writeBatch(db);
      const userARef = doc(db, 'users', userIdA);
      const updateTime = new Date().toISOString();

      batch.set(
        userARef,
        {
          partnerId: null,
          partnerStatus: 'none',
          partnerPersonalId: null,
          partnerName: null,
          updatedAt: updateTime,
        },
        { merge: true }
      );

      if (userIdB) {
        const userBRef = doc(db, 'users', userIdB);
        batch.set(
          userBRef,
          {
            partnerId: null,
            partnerStatus: 'none',
            partnerPersonalId: null,
            partnerName: null,
            updatedAt: updateTime,
          },
          { merge: true }
        );
      }

      await batch.commit();
      console.log(`[Firebase] Couple unlinked: ${userIdA} & ${userIdB}`);
      return true;
    } catch (err) {
      console.error('[Firebase] Error unlinking couple:', err);
      return false;
    }
  },

  // --- TASKS API WITH FIRESTORE REALTIME SYNC ---

  /**
   * Subscribe to tasks for a given user in Firestore
   */
  subscribeToUserTasks(userId: string, onUpdate: (tasks: Task[]) => void): Unsubscribe {
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, where('userId', '==', userId));
    return onSnapshot(
      q,
      (snapshot) => {
        const taskList: Task[] = [];
        snapshot.forEach((docSnap) => {
          taskList.push(docSnap.data() as Task);
        });
        onUpdate(taskList);
      },
      (err) => {
        console.error('[Firebase] Tasks subscription error:', err);
      }
    );
  },

  /**
   * Save or update a task in Firestore
   */
  async saveTask(task: Task): Promise<void> {
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await setDoc(taskRef, task, { merge: true });
    } catch (err) {
      console.error('[Firebase] Error saving task:', err);
    }
  },

  /**
   * Delete a task from Firestore
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await deleteDoc(taskRef);
    } catch (err) {
      console.error('[Firebase] Error deleting task:', err);
    }
  },

  // --- CHAT MESSAGES WITH FIRESTORE REALTIME SYNC ---

  /**
   * Subscribe to real-time chat messages between two users in Cloud Firestore
   */
  subscribeToChat(userIdA: string, userIdB: string, onUpdate: (messages: ChatMessage[]) => void): Unsubscribe {
    const conversationId = [userIdA, userIdB].sort().join('_');
    const messagesRef = collection(db, 'messages');
    const q = query(messagesRef, where('conversationId', '==', conversationId));

    return onSnapshot(
      q,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((docSnap) => {
          msgs.push(docSnap.data() as ChatMessage);
        });
        // Sort chronologically
        msgs.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
        console.log(`[Firebase] Chat sync: ${msgs.length} messages for conversation ${conversationId}`);
        onUpdate(msgs);
      },
      (err) => {
        console.error('[Firebase] Chat subscription error:', err);
      }
    );
  },

  /**
   * Send a chat message to Cloud Firestore
   */
  async sendMessage(msg: Omit<ChatMessage, 'id'> & { id?: string }): Promise<ChatMessage> {
    try {
      const id = msg.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const conversationId = msg.conversationId || [msg.senderId, msg.receiverId].sort().join('_');
      const payload: ChatMessage = {
        ...msg,
        id,
        conversationId,
        type: 'text',
        read: msg.read ?? false,
        timestamp: msg.timestamp || new Date().toISOString(),
      };

      const msgRef = doc(db, 'messages', id);
      await setDoc(msgRef, payload);
      console.log(`[Firebase] Message saved to Cloud Firestore: ${id} ("${payload.content.substring(0, 25)}")`);
      return payload;
    } catch (err) {
      console.error('[Firebase] Error sending message to Firestore:', err);
      throw err;
    }
  },

  /**
   * Mark all unread messages from partner as read in Cloud Firestore
   */
  async markMessagesAsRead(currentUserId: string, partnerId: string): Promise<void> {
    try {
      const conversationId = [currentUserId, partnerId].sort().join('_');
      const messagesRef = collection(db, 'messages');
      const q = query(
        messagesRef,
        where('conversationId', '==', conversationId),
        where('receiverId', '==', currentUserId),
        where('read', '==', false)
      );

      const snap = await getDocs(q);
      if (snap.empty) return;

      const batch = writeBatch(db);
      snap.forEach((docSnap) => {
        batch.update(docSnap.ref, { read: true });
      });
      await batch.commit();
      console.log(`[Firebase] Marked ${snap.size} messages as read for user ${currentUserId}`);
    } catch (err) {
      console.error('[Firebase] Error marking messages as read in Firestore:', err);
    }
  },

  // --- REAL-TIME VOICE CALLS VIA CLOUD FIRESTORE ---

  /**
   * Create an active call session in Firestore
   */
  async createCallDoc(call: {
    callId: string;
    callerId: string;
    callerPersonalId: string;
    callerName: string;
    callerAvatar: string;
    calleeId: string;
    calleePersonalId: string;
    calleeName: string;
  }): Promise<void> {
    try {
      const callRef = doc(db, 'calls', call.callId);
      const payload = {
        ...call,
        status: 'calling',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(callRef, payload);
      console.log(`[Firebase] Call doc created: ${call.callId} (${call.callerName} -> ${call.calleeName})`);
    } catch (err) {
      console.error('[Firebase] Error creating call document in Firestore:', err);
      throw err;
    }
  },

  /**
   * Update active call state in Firestore (accepted, rejected, ended, cancelled, sdp offer, sdp answer)
   */
  async updateCallDoc(callId: string, updates: Record<string, any>): Promise<void> {
    try {
      const callRef = doc(db, 'calls', callId);
      await setDoc(
        callRef,
        {
          ...updates,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      console.log(`[Firebase] Call doc ${callId} updated with:`, Object.keys(updates));
    } catch (err) {
      console.error(`[Firebase] Error updating call doc ${callId}:`, err);
    }
  },

  /**
   * Subscribe to incoming calls targeting the current user
   */
  subscribeToIncomingCalls(
    userId: string,
    onCall: (callDoc: any) => void
  ): Unsubscribe {
    const callsRef = collection(db, 'calls');
    const q = query(
      callsRef,
      where('calleeId', '==', userId),
      where('status', '==', 'calling'),
      limit(5)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            if (data.status === 'calling') {
              // Ensure the call is fresh (within last 40 seconds)
              const createdAt = data.createdAt ? new Date(data.createdAt).getTime() : 0;
              const isRecent = Date.now() - createdAt < 40000;
              if (isRecent) {
                console.log(`[Firebase] Incoming call detected on Firestore:`, data.callId);
                onCall(data);
              }
            }
          }
        });
      },
      (err) => {
        console.error('[Firebase] Incoming calls subscription error:', err);
      }
    );
  },

  /**
   * Subscribe to updates for a specific active call document
   */
  subscribeToCallDoc(callId: string, onUpdate: (callDoc: any) => void): Unsubscribe {
    const callRef = doc(db, 'calls', callId);
    return onSnapshot(
      callRef,
      (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.data());
        }
      },
      (err) => {
        console.error(`[Firebase] Call doc ${callId} subscription error:`, err);
      }
    );
  },

  /**
   * Store an ICE candidate for peer negotiation in Firestore
   */
  async addCallIceCandidate(callId: string, senderId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const candidatesRef = collection(db, 'calls', callId, 'candidates');
      const candDoc = doc(candidatesRef);
      await setDoc(candDoc, {
        senderId,
        candidate: JSON.parse(JSON.stringify(candidate)),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Firebase] Error adding ICE candidate to Firestore:', err);
    }
  },

  /**
   * Listen for remote ICE candidates for an active call
   */
  subscribeToCallIceCandidates(
    callId: string,
    currentUserId: string,
    onCandidate: (candidate: RTCIceCandidateInit) => void
  ): Unsubscribe {
    const candidatesRef = collection(db, 'calls', callId, 'candidates');
    return onSnapshot(
      candidatesRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.senderId !== currentUserId && data.candidate) {
              onCandidate(data.candidate);
            }
          }
        });
      },
      (err) => {
        console.warn(`[Firebase] ICE candidates subscription error for ${callId}:`, err);
      }
    );
  },
};

