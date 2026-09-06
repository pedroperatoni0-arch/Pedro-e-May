import React, { useState, useRef, useEffect } from 'react';
import { UserAccount, ChatMessage } from '../../types';
import { soundManager } from '../../utils/audio';
import {
  Send,
  Heart,
  Smile,
  Check,
  CheckCheck,
  Film
} from 'lucide-react';

interface CineminhaChatProps {
  currentUser: UserAccount;
  partner: UserAccount | null;
  messages: ChatMessage[];
  onSendMessage: (msg: Omit<ChatMessage, 'id'>) => Promise<boolean | void>;
}

const CINEMINHA_QUICK_REACTIONS = ['❤️', '🍿', '🎬', '🥰', '😂', '🥺', '😱', '🍫'];

export const CineminhaChat: React.FC<CineminhaChatProps> = ({
  currentUser,
  partner,
  messages,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !partner) return;

    soundManager.playPop();
    setIsSending(true);

    const nowIso = new Date().toISOString();

    try {
      await onSendMessage({
        senderId: currentUser.id,
        receiverId: partner.id,
        senderName: currentUser.username,
        type: 'text',
        content: text,
        timestamp: nowIso,
        read: false,
      });

      if (!textToSend) {
        setInputText('');
      }
    } catch (err) {
      console.error('[CineminhaChat] Send error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900/95 border-t border-slate-800">
      {/* Messages Feed Area */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 text-xs no-scrollbar">
        {/* Welcome Cineminha Message */}
        <div className="flex justify-center my-2">
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl px-3 py-1.5 text-slate-300 text-[11px] flex items-center gap-1.5 shadow-sm">
            <Film className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Chat do Cineminha conectado em tempo real</span>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <Heart className="w-8 h-8 text-rose-500/30 animate-pulse" />
            <p className="text-xs font-medium">Nenhuma mensagem ainda.</p>
            <p className="text-[11px] text-slate-400">
              Comente as cenas do filme com seu amor aqui embaixo!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}
              >
                <div
                  className={`max-w-[82%] px-3.5 py-2 rounded-2xl shadow-xs text-xs break-words leading-relaxed ${
                    isMe
                      ? 'bg-gradient-to-tr from-rose-500 to-pink-500 text-white rounded-tr-xs'
                      : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Sender & Timestamp */}
                <div className="flex items-center gap-1 mt-0.5 px-1 text-[10px] text-slate-500">
                  <span>{isMe ? 'Você' : partner?.username || 'Amor'}</span>
                  <span>•</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isMe && (
                    <span className="ml-0.5">
                      {msg.read ? (
                        <CheckCheck className="w-3 h-3 text-rose-400" />
                      ) : (
                        <Check className="w-3 h-3 text-slate-400" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reaction Bar */}
      <div className="px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {CINEMINHA_QUICK_REACTIONS.map((emoji, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(emoji)}
            className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-lg text-sm transition hover:scale-110 active:scale-95 cursor-pointer shrink-0"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Bottom Input Field */}
      <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <div className="flex-1 bg-slate-900 border border-slate-800 focus-within:border-rose-500 rounded-full px-4 py-2 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Comente o filme..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 text-xs focus:outline-none"
          />
        </div>

        <button
          onClick={() => handleSend()}
          disabled={!inputText.trim() || isSending}
          className="w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:hover:bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20 transition cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </button>
      </div>
    </div>
  );
};
