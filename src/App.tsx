import React, { useState, useEffect, useCallback } from 'react';
import { UserAccount, Task, ChatMessage, TaskStatus, RealCallSession } from './types';
import { AppStorage, getTodayDateString } from './utils/storage';
import { soundManager } from './utils/audio';
import { callManager } from './services/callManager';
import { AuthApi } from './services/authApi';
import { DataApi } from './services/dataApi';
import { FirebaseService } from './services/firebaseService';
import { MobileShell } from './components/layout/MobileShell';
import { BottomNavigation, TabType } from './components/layout/BottomNavigation';
import { HomeTab } from './components/home/HomeTab';
import { RoutineTab } from './components/routine/RoutineTab';
import { ChallengesTab } from './components/challenges/ChallengesTab';
import { ChatTab } from './components/chat/ChatTab';
import { ProfileTab } from './components/profile/ProfileTab';
import { LevelUpModal } from './components/modals/LevelUpModal';
import { AuthScreen } from './components/auth/AuthScreen';
import { RealVoiceCallModal } from './components/call/RealVoiceCallModal';
import { Heart } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(AppStorage.getCurrentUser());
  const [partner, setPartner] = useState<UserAccount | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [partnerTasks, setPartnerTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [realCallSession, setRealCallSession] = useState<RealCallSession>(callManager.getSession());

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(prev => (prev === msg ? null : prev));
    }, 3800);
  };

  // Helper to sync tasks and chat directly from backend
  const syncTasksAndData = useCallback(async () => {
    try {
      const taskRes = await DataApi.getTasks();
      if (taskRes.success) {
        setTasks(taskRes.userTasks || []);
        setPartnerTasks(taskRes.partnerTasks || []);
        // Also save to local storage cache for offline resilience
        AppStorage.saveTasks([...(taskRes.userTasks || []), ...(taskRes.partnerTasks || [])]);
      }

      const msgRes = await DataApi.getMessages();
      if (msgRes.success && msgRes.messages) {
        setMessages(msgRes.messages);
      }
    } catch (err) {
      console.error('[App] Sync tasks and data error:', err);
    }
  }, []);

  // Helper to sync user & partner session state directly with backend database
  const syncSessionWithBackend = useCallback(async (silent: boolean = true) => {
    try {
      const res = await AuthApi.getMe();
      if (res.success && res.user) {
        setCurrentUser(res.user);
        AppStorage.syncCurrentUser(res.user);

        if (res.partner) {
          setPartner(res.partner);
          AppStorage.syncPartner(res.partner);
        } else {
          setPartner(null);
          setPartnerTasks([]);
        }

        setIsAuthenticated(true);
        await syncTasksAndData();
        return res;
      } else {
        if (!silent) {
          setIsAuthenticated(false);
          setPartner(null);
        }
      }
    } catch (err) {
      console.error('[App] Sync session error:', err);
    }
    return null;
  }, [syncTasksAndData]);

  // 1. Initial backend session verification on mount
  useEffect(() => {
    let isMounted = true;

    async function checkAuthSession() {
      try {
        const res = await AuthApi.getMe();
        if (!isMounted) return;

        if (res.success && res.user) {
          setCurrentUser(res.user);
          AppStorage.syncCurrentUser(res.user);
          if (res.partner) {
            setPartner(res.partner);
            AppStorage.syncPartner(res.partner);
          } else {
            setPartner(null);
          }
          setIsAuthenticated(true);
          await syncTasksAndData();
        } else {
          setIsAuthenticated(false);
          setPartner(null);
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false);
          setPartner(null);
        }
      } finally {
        if (isMounted) setAuthChecking(false);
      }
    }

    checkAuthSession();

    return () => {
      isMounted = false;
    };
  }, [syncTasksAndData]);

  // 2. Real-Time Couple and Data Events (WebSocket push from backend)
  useEffect(() => {
    const unsubCouple = callManager.onCoupleEvent(async (event) => {
      console.log('[App] Received real-time event:', event.type, event.payload);
      
      if (event.type === 'couple:linked') {
        soundManager.playLevelUp();
        confetti({ particleCount: 55, spread: 65, origin: { y: 0.6 } });
        await syncSessionWithBackend(true);
        showToast('Vínculo com parceiro(a) estabelecido! ❤️');
      } else if (event.type === 'couple:unlinked') {
        await syncSessionWithBackend(true);
        showToast('Vínculo com parceiro desfeito.');
      } else if (event.type === 'tasks:updated') {
        await syncTasksAndData();
        if (event.payload?.action === 'status_changed') {
          soundManager.playPop();
        }
      } else if (event.type === 'chat:message') {
        if (event.payload?.message) {
          const incomingMsg: ChatMessage = event.payload.message;
          setMessages(prev => {
            const exists = prev.some(m => m.id === incomingMsg.id);
            if (exists) return prev;
            return [...prev, incomingMsg];
          });
          soundManager.playPop();

          if (activeTab === 'chat' && incomingMsg.senderId !== currentUser?.id) {
            // Automatically acknowledge read status if user is currently inside the chat tab
            DataApi.markMessagesAsRead();
          } else if (activeTab !== 'chat' && incomingMsg.senderId !== currentUser?.id) {
            showToast(`💬 ${incomingMsg.senderName}: ${incomingMsg.content}`);
          }
        }
      } else if (event.type === 'chat:read') {
        // Partner has read our messages -> update delivery checks to double blue/pink check
        setMessages(prev =>
          prev.map(m => (m.senderId === currentUser?.id ? { ...m, read: true } : m))
        );
      }
    });

    return () => {
      unsubCouple();
    };
  }, [syncSessionWithBackend, syncTasksAndData, activeTab, currentUser?.id]);

  // 5. Real-Time Cloud Firestore subscription for Couple Chat Messages
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !partner?.id) return;

    console.log(`[App] Subscribing to Cloud Firestore chat between ${currentUser.id} and ${partner.id}`);
    const unsubChat = FirebaseService.subscribeToChat(currentUser.id, partner.id, (freshMsgs) => {
      setMessages(freshMsgs);
      // If there are unread messages for current user and user is in the chat tab, acknowledge them
      if (activeTab === 'chat') {
        const hasUnread = freshMsgs.some(m => m.receiverId === currentUser.id && !m.read);
        if (hasUnread) {
          FirebaseService.markMessagesAsRead(currentUser.id, partner.id);
        }
      }
    });

    return () => {
      unsubChat();
    };
  }, [isAuthenticated, currentUser?.id, partner?.id, activeTab]);

  // Mark messages as read whenever entering Chat tab
  useEffect(() => {
    if (activeTab === 'chat' && partner?.id && currentUser?.id) {
      FirebaseService.markMessagesAsRead(currentUser.id, partner.id);
      DataApi.markMessagesAsRead().catch(() => {});
      setMessages(prev =>
        prev.map(m => (m.receiverId === currentUser.id ? { ...m, read: true } : m))
      );
    }
  }, [activeTab, partner?.id, currentUser?.id]);

  // 3. Resilient Polling & Foreground/Focus Sync (every 3.5s)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      syncSessionWithBackend(true);
    }, 3500);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncSessionWithBackend(true);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isAuthenticated, syncSessionWithBackend]);

  // 4. Real-time Cloud Firestore subscription for User Profile and Partner Status
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;

    const unsubUser = FirebaseService.subscribeToUser(currentUser.id, async (freshDoc) => {
      if (!freshDoc) return;

      // Sync current user state if changed in Firestore
      setCurrentUser(prev => {
        if (!prev) return prev;
        const updatedUser: UserAccount = {
          ...prev,
          partnerId: freshDoc.partnerId || null,
          partnerStatus: freshDoc.partnerStatus || 'none',
          customStatus: freshDoc.partnerName ? `Conectado com ${freshDoc.partnerName} ❤️` : prev.customStatus,
          level: freshDoc.level || prev.level,
          xp: freshDoc.xp || prev.xp,
          streakDays: freshDoc.streakDays || prev.streakDays,
          arenaWins: freshDoc.arenaWins || prev.arenaWins,
        };
        AppStorage.syncCurrentUser(updatedUser);
        return updatedUser;
      });

      // Sync partner state if linked or unlinked in Firestore
      if (freshDoc.partnerId && freshDoc.partnerStatus === 'connected') {
        if (!partner || partner.id !== freshDoc.partnerId) {
          const partnerDoc = await FirebaseService.getUserById(freshDoc.partnerId);
          if (partnerDoc) {
            const partnerAccount: UserAccount = {
              id: partnerDoc.id,
              username: partnerDoc.username,
              avatar: partnerDoc.avatar || 'sakura',
              personalId: partnerDoc.personalId,
              level: partnerDoc.level || 1,
              xp: partnerDoc.xp || 0,
              streakDays: partnerDoc.streakDays || 1,
              arenaWins: partnerDoc.arenaWins || 0,
              routineXpClaimedDates: partnerDoc.routineXpClaimedDates || [],
              partnerId: partnerDoc.partnerId || null,
              partnerStatus: partnerDoc.partnerStatus || 'none',
              theme: partnerDoc.theme || 'rose',
              soundEnabled: partnerDoc.soundEnabled ?? true,
              vibrationEnabled: partnerDoc.vibrationEnabled ?? true,
            };
            setPartner(partnerAccount);
            AppStorage.syncPartner(partnerAccount);
            soundManager.playLevelUp();
            confetti({ particleCount: 50, spread: 60 });
            showToast(`Conectado em tempo real com ${partnerAccount.username}! ❤️`);
            await syncTasksAndData();
          }
        }
      } else if (!freshDoc.partnerId && partner) {
        setPartner(null);
        setPartnerTasks([]);
        showToast('Vínculo com parceiro foi desfeito.');
      }
    });

    return () => {
      unsubUser();
    };
  }, [isAuthenticated, currentUser?.id, partner, syncTasksAndData]);

  // Subscribe to Call Manager Events
  useEffect(() => {
    const unsubscribe = callManager.subscribe((session) => {
      setRealCallSession(session);
    });
    const unsubscribeErr = callManager.subscribeError((err) => {
      showToast(err);
    });
    return () => {
      unsubscribe();
      unsubscribeErr();
    };
  }, []);

  // Register user for Real-Time Calling and Signaling
  useEffect(() => {
    if (isAuthenticated && currentUser?.id) {
      callManager.registerUser(
        currentUser.id,
        currentUser.personalId,
        currentUser.username,
        currentUser.avatar,
        currentUser.partnerId || partner?.id || undefined
      );
    }
  }, [isAuthenticated, currentUser?.id, currentUser?.personalId, currentUser?.partnerId, partner?.id, currentUser?.avatar]);

  // Level Up Modal State (Personal User Level)
  const [levelUpState, setLevelUpState] = useState<{
    isOpen: boolean;
    newLevel: number;
  }>({
    isOpen: false,
    newLevel: currentUser?.level || 1,
  });

  const handleAuthSuccess = async (user: UserAccount, partnerData: UserAccount | null) => {
    setCurrentUser(user);
    setPartner(partnerData);
    AppStorage.syncCurrentUser(user);
    if (partnerData) {
      AppStorage.syncPartner(partnerData);
    }
    setIsAuthenticated(true);
    await syncTasksAndData();
    showToast(`Bem-vindo(a), ${user.username}! ❤️`);
  };

  const handleLogout = async () => {
    await AuthApi.logout();
    setIsAuthenticated(false);
    setPartner(null);
    setTasks([]);
    setPartnerTasks([]);
    setMessages([]);
    showToast('Você saiu da sua conta.');
  };

  // Task Status Toggle & Daily Routine XP Processing
  const handleSetTaskStatus = async (taskId: string, status: TaskStatus) => {
    if (!currentUser) return;
    const todayStr = getTodayDateString();

    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    const wasCompleted = targetTask.completedDates.includes(todayStr);

    // Strict Rule: Once completed today, it cannot be undone or reverted!
    if (wasCompleted && status !== 'completed') {
      return;
    }

    if (status === 'completed') {
      if (!wasCompleted) {
        soundManager.playTaskComplete();
        confetti({
          particleCount: 25,
          spread: 45,
          origin: { y: 0.6 },
          colors: ['#f43f5e', '#10b981', '#fbbf24'],
        });
      }
    }

    // Call backend API for persistent multi-user sync
    const res = await DataApi.setTaskStatus(taskId, status);

    if (res.success) {
      if (res.user) {
        setCurrentUser(res.user);
        AppStorage.syncCurrentUser(res.user);
      }

      if (res.routineCompleted) {
        confetti({
          particleCount: 65,
          spread: 75,
          origin: { y: 0.5 },
          colors: ['#f43f5e', '#ec4899', '#ffd700', '#10b981'],
        });
        showToast(`✨ Rotina 100% concluída! +${res.xpEarned || 200} XP Pessoal ganho! 🌟`);

        if (res.leveledUp) {
          setTimeout(() => {
            setLevelUpState({
              isOpen: true,
              newLevel: res.newLevel || (currentUser.level + 1),
            });
          }, 800);
        }
      } else {
        showToast(`Tarefa concluída! Pontuando na Arena! ⚔️`);
      }

      await syncTasksAndData();
    } else {
      // Fallback local processing
      const allTasks = AppStorage.getTasks();
      const idx = allTasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        const t = { ...allTasks[idx] };
        if (status === 'completed' && !t.completedDates.includes(todayStr)) {
          t.completedDates.push(todayStr);
        }
        allTasks[idx] = t;
        AppStorage.saveTasks(allTasks);
        setTasks(AppStorage.getTasks(currentUser.id));
      }
    }
  };

  const handleToggleTaskToday = (taskId: string) => {
    const todayStr = getTodayDateString();
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    if (targetTask.completedDates.includes(todayStr)) {
      return;
    }

    handleSetTaskStatus(taskId, 'completed');
  };

  // Add Task
  const handleAddTask = async (newTask: Omit<Task, 'id' | 'completedDates' | 'failedDates'>) => {
    if (!currentUser) return;
    soundManager.playPop();

    const res = await DataApi.createTask(newTask);
    if (res.success && res.task) {
      setTasks(prev => [...prev, res.task!]);
      showToast('Nova tarefa adicionada à sua rotina!');
    } else {
      // Fallback local
      const allTasks = AppStorage.getTasks();
      const created: Task = {
        ...newTask,
        id: 'task_' + Date.now(),
        userId: currentUser.id,
        completedDates: [],
        failedDates: [],
      };
      allTasks.push(created);
      AppStorage.saveTasks(allTasks);
      setTasks(AppStorage.getTasks(currentUser.id));
      showToast('Nova tarefa adicionada à sua rotina!');
    }
  };

  // Update Task
  const handleUpdateTask = async (updatedTask: Task) => {
    if (!currentUser) return;
    const res = await DataApi.updateTask(updatedTask.id, updatedTask);
    if (res.success) {
      setTasks(prev => prev.map(t => (t.id === updatedTask.id ? updatedTask : t)));
      showToast('Tarefa atualizada com sucesso!');
    } else {
      const allTasks = AppStorage.getTasks();
      const idx = allTasks.findIndex(t => t.id === updatedTask.id);
      if (idx !== -1) {
        allTasks[idx] = updatedTask;
        AppStorage.saveTasks(allTasks);
        setTasks(AppStorage.getTasks(currentUser.id));
        showToast('Tarefa atualizada com sucesso!');
      }
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!currentUser) return;
    const res = await DataApi.deleteTask(taskId);
    if (res.success) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      showToast('Tarefa removida da rotina.');
    } else {
      const allTasks = AppStorage.getTasks().filter(t => t.id !== taskId);
      AppStorage.saveTasks(allTasks);
      setTasks(AppStorage.getTasks(currentUser.id));
      showToast('Tarefa removida da rotina.');
    }
  };

  // Send Chat Message
  const handleSendMessage = async (msg: Omit<ChatMessage, 'id'>) => {
    if (!currentUser) return;
    if (!partner || partner.partnerStatus !== 'connected') {
      showToast('Vincule seu parceiro(a) para enviar mensagens.');
      return;
    }

    try {
      // 1. Send directly to Cloud Firestore (guarantees cross-phone synchronization)
      const firestoreMsg = await FirebaseService.sendMessage(msg);

      // 2. Optimistic local state update
      setMessages(prev => {
        const exists = prev.some(m => m.id === firestoreMsg.id);
        if (exists) return prev;
        return [...prev, firestoreMsg];
      });

      // 3. Asynchronously notify backend WebSocket for callManager push
      DataApi.sendMessage(firestoreMsg).catch((err) => {
        console.warn('[App] Backend websocket notification note:', err);
      });
    } catch (err: any) {
      console.error('[App] handleSendMessage error:', err);
      // Fallback local persistence
      const fallbackMsg = AppStorage.addMessage(msg);
      setMessages(prev => [...prev, fallbackMsg]);
      showToast('Erro ao sincronizar com servidor, mensagem salva localmente.');
    }
  };

  // Link Partner by Personal ID
  const handleLinkPartner = async (partnerData?: UserAccount) => {
    soundManager.playLevelUp();
    confetti({ particleCount: 50, spread: 60 });
    if (partnerData) {
      setPartner(partnerData);
      AppStorage.syncPartner(partnerData);
    }
    // Reload from backend to guarantee complete sync
    await syncSessionWithBackend(true);
  };

  // Unlink Partner
  const handleUnlinkPartner = async () => {
    const updatedUser = { ...currentUser, partnerId: null, partnerStatus: 'none' as const };
    setCurrentUser(updatedUser);
    setPartner(null);
    AppStorage.syncCurrentUser(updatedUser);
    setPartnerTasks([]);
    setMessages([]);
    showToast('Vínculo com parceiro removido.');
  };

  // Toggle Sound
  const handleToggleSound = () => {
    if (!currentUser) return;
    const updated = { ...currentUser, soundEnabled: !currentUser.soundEnabled };
    soundManager.enabled = updated.soundEnabled;
    AppStorage.syncCurrentUser(updated);
    setCurrentUser(updated);
  };

  // Loading Splash
  if (authChecking) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-rose-50/80 via-white to-purple-50/50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-400 via-pink-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-200/50 border-2 border-white animate-pulse">
          <Heart className="w-8 h-8 fill-current" />
        </div>
        <h1 className="text-xl font-black text-slate-800 tracking-tight font-display mt-4">
          DuoQuest
        </h1>
        <p className="text-xs text-slate-400 font-medium mt-1">Carregando seus hábitos...</p>
      </div>
    );
  }

  // Not Authenticated -> Show Registration / Login Initial Screen
  if (!isAuthenticated || !currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <MobileShell>
      {/* Real Voice Call Modal / Screen (WebRTC Audio Stream) */}
      <RealVoiceCallModal
        session={realCallSession}
        onEndCall={() => callManager.endCall()}
        onMuteToggle={() => callManager.toggleMute()}
        onSpeakerToggle={() => callManager.toggleSpeaker()}
        onAcceptCall={() => callManager.acceptCall()}
        onRejectCall={() => callManager.rejectCall()}
      />

      {/* Level Up Celebration Modal */}
      <LevelUpModal
        isOpen={levelUpState.isOpen}
        onClose={() => setLevelUpState(prev => ({ ...prev, isOpen: false }))}
        newLevel={levelUpState.newLevel}
        username={currentUser.username}
      />

      {/* Global In-App Toast Notification */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-full text-xs font-semibold shadow-xl border border-slate-700/50 flex items-center gap-2 max-w-[90vw] text-center backdrop-blur-md animate-fade-in">
          <span>{notification}</span>
        </div>
      )}

      {/* Main Tab Views */}
      <div
        className={`flex-1 min-h-0 flex flex-col ${
          activeTab === 'chat'
            ? 'h-full overflow-hidden p-0'
            : 'overflow-y-auto px-3.5 pt-3 pb-24 no-scrollbar'
        }`}
      >
        {activeTab === 'home' && (
          <HomeTab
            user={currentUser}
            partner={partner}
            tasks={tasks}
            partnerTasks={partnerTasks}
            onToggleTask={handleToggleTaskToday}
            onNavigateToRoutine={() => setActiveTab('routine')}
            onNavigateToChallenges={() => setActiveTab('challenges')}
            onNavigateToProfile={() => setActiveTab('profile')}
            onNavigateToChat={() => setActiveTab('chat')}
          />
        )}

        {activeTab === 'routine' && (
          <RoutineTab
            user={currentUser}
            tasks={tasks}
            onToggleTask={handleToggleTaskToday}
            onSetTaskStatus={handleSetTaskStatus}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        )}

        {activeTab === 'challenges' && (
          <ChallengesTab
            user={currentUser}
            partner={partner}
            userTasks={tasks}
            partnerTasks={partnerTasks}
          />
        )}

        {activeTab === 'chat' && (
          <ChatTab
            currentUser={currentUser}
            partner={partner}
            messages={messages}
            onSendMessage={handleSendMessage}
            onLinkPartner={() => setActiveTab('profile')}
            onBack={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            user={currentUser}
            partner={partner}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              AppStorage.syncCurrentUser(updated);
            }}
            onLinkSuccess={handleLinkPartner}
            onUnlinkPartner={handleUnlinkPartner}
            onToggleSound={handleToggleSound}
            onLogout={handleLogout}
            showToast={showToast}
          />
        )}
      </div>

      {/* Floating Bottom Navigation (Hidden inside private dedicated conversation screen) */}
      {activeTab !== 'chat' && (
        <BottomNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          unreadMessagesCount={(messages || []).filter(m => m && !m.read && currentUser && m.senderId !== currentUser.id).length}
        />
      )}
    </MobileShell>
  );
}
