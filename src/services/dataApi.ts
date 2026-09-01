import { Task, ChatMessage, TaskStatus } from '../types';
import { AuthApi } from './authApi';

export class DataApi {
  // 1. Fetch user and partner tasks from backend
  public static async getTasks(): Promise<{
    success: boolean;
    userTasks: Task[];
    partnerTasks: Task[];
  }> {
    const token = AuthApi.getToken();
    if (!token) {
      return { success: false, userTasks: [], partnerTasks: [] };
    }

    try {
      const res = await fetch('/api/tasks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false, userTasks: [], partnerTasks: [] };
    }
  }

  // 2. Create new task
  public static async createTask(task: Omit<Task, 'id' | 'userId' | 'completedDates' | 'failedDates'>): Promise<{
    success: boolean;
    task?: Task;
  }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false };

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false };
    }
  }

  // 3. Update existing task
  public static async updateTask(taskId: string, updates: Partial<Task>): Promise<{
    success: boolean;
    task?: Task;
  }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false };

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false };
    }
  }

  // 4. Delete task
  public static async deleteTask(taskId: string): Promise<{ success: boolean }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false };

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false };
    }
  }

  // 5. Toggle or set task status (complete/fail)
  public static async setTaskStatus(taskId: string, status: TaskStatus): Promise<{
    success: boolean;
    task?: Task;
    routineCompleted?: boolean;
    xpEarned?: number;
    newLevel?: number;
    leveledUp?: boolean;
    arenaScores?: any;
    user?: any;
  }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false };

    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false };
    }
  }

  // 6. Get Chat Messages
  public static async getMessages(): Promise<{ success: boolean; messages: ChatMessage[] }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false, messages: [] };

    try {
      const res = await fetch('/api/chat/messages', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false, messages: [] };
    }
  }

  // 7. Send Chat Message
  public static async sendMessage(msg: { content: string; receiverId?: string } | Omit<ChatMessage, 'id'>): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false, error: 'Usuário não autenticado' };

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(msg),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro de conexão ao enviar mensagem' };
    }
  }

  // 8. Mark Messages as Read
  public static async markMessagesAsRead(): Promise<{ success: boolean }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false };

    try {
      const res = await fetch('/api/chat/messages/read', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false };
    }
  }

  // 9. Get Arena Status
  public static async getArenaStatus(): Promise<{ success: boolean; scores?: any }> {
    const token = AuthApi.getToken();
    if (!token) return { success: false };

    try {
      const res = await fetch('/api/arena/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false };
    }
  }
}
