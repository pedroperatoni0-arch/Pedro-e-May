import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { CallSignalingServer } from './server/callSignaling';
import { userStore } from './server/userStore';
import { dataStore } from './server/dataStore';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // Attach WebSocket Signaling Server for WebRTC Voice Calling & Real-Time Sync
  const signalingServer = new CallSignalingServer(server);

  // Helper middleware to extract user from Authorization header Bearer token
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Não autorizado.' });
    }
    const token = authHeader.split(' ')[1];
    const user = userStore.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
    }
    (req as any).user = user;
    (req as any).token = token;
    next();
  };

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'DuoQuest Real-Time Voice & Gamification Engine',
      signaling: signalingServer.getStatus(),
    });
  });

  // --- AUTHENTICATION & ACCOUNT ENDPOINTS ---

  // 1. Register new persistent user with unique Public ID and hashed password
  app.post('/api/auth/register', (req, res) => {
    const { username, email, password, avatar, customId, personalId } = req.body;
    const result = userStore.register({ username, email, password, avatar, customId, personalId });
    if (!result.success) {
      return res.status(400).json(result);
    }
    // Auto-seed initial starter tasks for the newly registered user
    if (result.user?.id) {
      dataStore.getTasksForUser(result.user.id);
    }
    res.status(201).json(result);
  });

  // 2. Login existing user
  app.post('/api/auth/login', (req, res) => {
    const { login, password } = req.body;
    const result = userStore.login({ login, password });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  // 3. Get current authenticated user details and partner directly from database
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const rawUser = (req as any).user;
    const freshUser = userStore.findById(rawUser.id);
    if (!freshUser) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const publicUser = userStore.toPublicUser(freshUser);
    let partner = null;

    if (freshUser.partnerId && freshUser.partnerStatus === 'connected') {
      const partnerStored = userStore.findById(freshUser.partnerId);
      if (partnerStored && partnerStored.partnerId === freshUser.id) {
        partner = userStore.toPublicUser(partnerStored);
      }
    }

    res.json({ success: true, user: publicUser, partner });
  });

  // 4. Logout
  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const token = (req as any).token;
    userStore.logout(token);
    res.json({ success: true, message: 'Desconectado com sucesso.' });
  });

  // --- PARTNER LINKING & SEARCH ENDPOINTS ---

  // 5. Search user by Public Personal ID (e.g. 7K4M-92PX or username/email)
  app.post('/api/partner/search', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const { partnerPersonalId } = req.body;
    const result = userStore.searchByPersonalId(user.id, partnerPersonalId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  });

  // 6. Link partner by Public Personal ID (e.g. 7K4M-92PX) - Atomic Bidirectional
  app.post('/api/partner/link', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const { partnerPersonalId } = req.body;
    const result = userStore.linkPartner(user.id, partnerPersonalId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast real-time couple link event to both connected sockets immediately
    if (result.user && result.partner) {
      signalingServer.broadcastCoupleEvent(result.user.id, result.partner.id, 'couple:linked', {
        userA: result.user,
        userB: result.partner,
      });
      // Also broadcast tasks sync
      const { userTasks, partnerTasks } = dataStore.getTasksForCouple(result.user.id, result.partner.id);
      signalingServer.broadcastCoupleEvent(result.user.id, result.partner.id, 'tasks:updated', {
        userTasks,
        partnerTasks,
      });
    }

    res.json(result);
  });

  // 7. Unlink partner
  app.post('/api/partner/unlink', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const oldPartnerId = user.partnerId;
    const result = userStore.unlinkPartner(user.id);
    
    if (oldPartnerId) {
      signalingServer.broadcastCoupleEvent(user.id, oldPartnerId, 'couple:unlinked', {
        userId: user.id,
        partnerId: oldPartnerId,
      });
    }

    res.json(result);
  });

  // 8. Get all public accounts (for debug / listing if needed)
  app.get('/api/users', (req, res) => {
    res.json({ success: true, users: userStore.getAllPublicUsers() });
  });

  // --- TASKS & ROUTINE ENDPOINTS (ONLINE SYNCHRONIZATION) ---

  // 9. Get Tasks for Current User and Partner
  app.get('/api/tasks', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;
    const coupleTasks = dataStore.getTasksForCouple(user.id, partnerId);
    res.json({ success: true, ...coupleTasks });
  });

  // 10. Create New Task
  app.post('/api/tasks', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const taskData = req.body;
    const createdTask = dataStore.createTask(user.id, taskData);

    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    if (partnerId) {
      signalingServer.broadcastCoupleEvent(user.id, partnerId, 'tasks:updated', {
        action: 'created',
        task: createdTask,
      });
    }

    res.status(201).json({ success: true, task: createdTask });
  });

  // 11. Update Task
  app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const taskId = req.params.id;
    const updates = req.body;

    const updatedTask = dataStore.updateTask(user.id, taskId, updates);
    if (!updatedTask) {
      return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
    }

    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    if (partnerId) {
      signalingServer.broadcastCoupleEvent(user.id, partnerId, 'tasks:updated', {
        action: 'updated',
        task: updatedTask,
      });
    }

    res.json({ success: true, task: updatedTask });
  });

  // 12. Delete Task
  app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const taskId = req.params.id;

    const deleted = dataStore.deleteTask(user.id, taskId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
    }

    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    if (partnerId) {
      signalingServer.broadcastCoupleEvent(user.id, partnerId, 'tasks:updated', {
        action: 'deleted',
        taskId,
      });
    }

    res.json({ success: true, message: 'Tarefa excluída.' });
  });

  // 13. Set Task Status (Complete/Fail today) with XP and Arena Broadcast
  app.post('/api/tasks/:id/status', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const taskId = req.params.id;
    const { status } = req.body;

    const result = dataStore.setTaskStatus(user.id, taskId, status);
    if (!result.success) {
      return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
    }

    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    // Calculate updated Arena scores
    const arenaScores = dataStore.calculateArenaScores(user.id, partnerId);

    // Broadcast real-time update to both partners
    if (partnerId) {
      signalingServer.broadcastCoupleEvent(user.id, partnerId, 'tasks:updated', {
        action: 'status_changed',
        taskId,
        status,
        arenaScores,
      });
    }

    res.json({
      success: true,
      ...result,
      user: freshUser ? userStore.toPublicUser(freshUser) : user,
      arenaScores,
    });
  });

  // --- CHAT MESSAGES ENDPOINTS (REAL-TIME TEXT CHAT BETWEEN COUPLE) ---

  // 14. Get Messages for the linked couple conversation
  app.get('/api/chat/messages', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    if (!partnerId) {
      return res.json({ success: true, messages: [], linked: false });
    }

    // Verify bidirectional link
    const partnerDoc = userStore.findById(partnerId);
    if (!partnerDoc || partnerDoc.partnerId !== user.id) {
      return res.json({ success: true, messages: [], linked: false });
    }

    const messages = dataStore.getMessages(user.id, partnerId);
    res.json({ success: true, messages, linked: true });
  });

  // 15. Send Text Message to linked partner
  app.post('/api/chat/messages', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    if (!partnerId) {
      return res.status(400).json({ success: false, message: 'Nenhum parceiro vinculado para receber mensagens de texto.' });
    }

    // Verify bidirectional link
    const partnerDoc = userStore.findById(partnerId);
    if (!partnerDoc || partnerDoc.partnerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Vínculo do casal não está ativo em ambas as contas.' });
    }

    const { content, text } = req.body;
    const messageContent = (content || text || '').trim();

    if (!messageContent) {
      return res.status(400).json({ success: false, message: 'O conteúdo da mensagem de texto não pode estar vazio.' });
    }

    const conversationId = [user.id, partnerId].sort().join('_');

    const created = dataStore.addMessage({
      senderId: user.id,
      receiverId: partnerId,
      senderName: user.username,
      conversationId,
      type: 'text',
      content: messageContent,
      timestamp: new Date().toISOString(),
      read: false,
    });

    // Push real-time to both sockets immediately (User A and User B)
    signalingServer.broadcastCoupleEvent(user.id, partnerId, 'chat:message', {
      message: created,
    });

    console.log(`[Chat] Message sent from ${user.username} (${user.id}) to ${partnerDoc.username} (${partnerId}): "${messageContent.substring(0, 30)}"`);
    res.status(201).json({ success: true, message: created });
  });

  // 16. Mark all messages from partner as read
  app.post('/api/chat/messages/read', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;

    if (!partnerId) {
      return res.json({ success: true });
    }

    const changed = dataStore.markMessagesAsRead(user.id, partnerId);
    if (changed) {
      // Notify partner that messages have been read
      signalingServer.broadcastCoupleEvent(user.id, partnerId, 'chat:read', {
        readerId: user.id,
        partnerId,
      });
    }

    res.json({ success: true, changed });
  });

  // --- ARENA STATUS ENDPOINT ---
  app.get('/api/arena/status', authMiddleware, (req, res) => {
    const user = (req as any).user;
    const freshUser = userStore.findById(user.id);
    const partnerId = freshUser?.partnerId && freshUser.partnerStatus === 'connected' ? freshUser.partnerId : null;
    const scores = dataStore.calculateArenaScores(user.id, partnerId);
    res.json({ success: true, scores });
  });

  // ICE / STUN & TURN Servers Configuration
  app.get('/api/webrtc/ice-servers', (req, res) => {
    const iceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turns:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ];

    if (process.env.TURN_SERVER_URL) {
      const turnConfig: any = {
        urls: process.env.TURN_SERVER_URL,
      };
      if (process.env.TURN_USERNAME) turnConfig.username = process.env.TURN_USERNAME;
      if (process.env.TURN_CREDENTIAL) turnConfig.credential = process.env.TURN_CREDENTIAL;
      iceServers.push(turnConfig);
    }

    res.json({ iceServers });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DuoQuest] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

