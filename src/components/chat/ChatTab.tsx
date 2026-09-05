import React, { useState, useRef, useEffect } from 'react';
import { UserAccount, ChatMessage } from '../../types';
import { soundManager } from '../../utils/audio';
import { callManager } from '../../services/callManager';
import {
  Send,
  Check,
  CheckCheck,
  Heart,
  ChevronLeft,
  MessageCircle,
  UserPlus,
  ShieldCheck,
  Phone,
  Sparkles,
  Smile,
  X
} from 'lucide-react';

interface ChatTabProps {
  currentUser: UserAccount;
  partner: UserAccount | null;
  messages: ChatMessage[];
  onSendMessage: (msg: Omit<ChatMessage, 'id'>) => Promise<boolean | void>;
  onLinkPartner?: () => void;
  onBack?: () => void;
}

const QUICK_EMOJIS = [
  '❤️', '💖', '🥰', '😘', '💕', '😍', '💌', '🌹',
  '🥺', '✨', '🤍', '💍', '💐', '💏', '😴', '☕'
];

export const ChatTab: React.FC<ChatTabProps> = ({
  currentUser,
  partner,
  messages,
  onSendMessage,
  onLinkPartner,
  onBack,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLinked = !!partner && partner.partnerStatus === 'connected';

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  // Handle mobile visualViewport keyboard opening adjustments
  useEffect(() => {
    const handleViewportChange = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  const handleSendText = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !isLinked || !partner) return;

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
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    } catch (err) {
      console.error('[ChatTab] Error sending text message:', err);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 60);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    // Auto-expand textarea height up to a max
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim() && !isSending) {
        handleSendText();
      }
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    soundManager.playPop();
    setInputText((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const formatMessageTime = (rawTimestamp: string) => {
    if (!rawTimestamp) return '';
    if (/^\d{2}:\d{2}$/.test(rawTimestamp)) return rawTimestamp;
    try {
      const date = new Date(rawTimestamp);
      if (!isNaN(date.getTime())) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
    } catch {
      // fallback
    }
    return rawTimestamp;
  };

  return (
    <div
      id="chat-tab-container"
      className="flex-1 min-h-0 flex flex-col h-full w-full overflow-hidden bg-white relative"
    >
      {/* 1. PINNED TOP HEADER */}
      <div className="bg-white/95 backdrop-blur-md px-3.5 py-2.5 sm:py-3 border-b border-rose-100/90 shadow-2xs flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              id="chat-back-btn"
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 text-slate-700 hover:text-rose-600 hover:bg-rose-50 rounded-full transition active:scale-95 flex items-center justify-center cursor-pointer"
              title="Voltar para tela inicial"
            >
              <ChevronLeft className="w-6 h-6 text-slate-700" />
            </button>
          )}

          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-400 to-pink-500 flex items-center justify-center text-xl shadow-xs text-white">
              {partner ? partner.avatar : '💌'}
            </div>
            {isLinked && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-300 animate-pulse" />
            )}
          </div>

          <div className="leading-tight">
            <h3 className="font-extrabold text-sm text-slate-800 tracking-tight">
              {partner ? partner.username : 'Chat do Casal'}
            </h3>
            <p className="text-[11px] font-medium flex items-center gap-1.5 mt-0.5">
              {isLinked ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  Conectado em tempo real
                </span>
              ) : (
                <span className="text-slate-400">Aguardando vínculo</span>
              )}
            </p>
          </div>
        </div>

        {/* Header Voice Call Action */}
        <div className="flex items-center gap-1.5">
          {isLinked && partner && (
            <button
              type="button"
              onClick={() => {
                soundManager.playPop();
                callManager.startCall(partner);
              }}
              className="p-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 transition active:scale-95 flex items-center justify-center cursor-pointer shadow-2xs"
              title="Iniciar Chamada de Vídeo"
            >
              <Phone className="w-4 h-4 text-rose-500" />
            </button>
          )}
        </div>
      </div>

      {/* 2. CHAT STREAM VIEW */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative bg-[#fdfafb]/60">
        {!isLinked ? (
          <div className="flex-1 min-h-0 p-6 flex flex-col items-center justify-center text-center space-y-4 my-auto">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-100 to-pink-100 text-rose-500 flex items-center justify-center shadow-inner">
              <MessageCircle className="w-8 h-8" />
            </div>

            <div className="max-w-xs space-y-1.5">
              <h4 className="font-extrabold text-slate-800 text-base">Conversa Exclusiva do Casal</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                As mensagens são sincronizadas instantaneamente em tempo real entre você e seu amor.
              </p>
            </div>

            <div className="bg-white border border-rose-100 rounded-2xl p-3 max-w-xs text-left text-xs text-rose-700 flex items-start gap-2 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>Conexão criptografada e restrita estritamente aos dois parceiros vinculados.</span>
            </div>

            {onLinkPartner && (
              <button
                id="link-partner-from-chat-btn"
                type="button"
                onClick={onLinkPartner}
                className="mt-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold text-xs shadow-md shadow-rose-200/50 hover:from-rose-600 hover:to-pink-700 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Vincular Parceiro(a) Agora</span>
              </button>
            )}
          </div>
        ) : (
          /* SCROLLABLE MESSAGES */
          <div
            id="chat-messages-scroll"
            className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-2.5 no-scrollbar flex flex-col"
          >
            {/* Top Tag */}
            <div className="text-center my-1 shrink-0">
              <span className="inline-flex items-center gap-1.5 bg-rose-50/90 text-rose-600 border border-rose-100/90 text-[11px] font-medium px-3.5 py-1 rounded-full shadow-2xs">
                <Heart className="w-3 h-3 fill-rose-500 text-rose-500 shrink-0" />
                <span>Conversa protegida entre você e {partner?.username}</span>
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="my-auto text-center py-8 px-4 text-slate-400 text-xs flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-400 mb-2">
                  <Sparkles className="w-6 h-6 text-rose-400 animate-pulse" />
                </div>
                <p className="font-bold text-slate-700">Nenhuma mensagem ainda</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  Digite sua mensagem abaixo para mandar um "Oi, amor!".
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === currentUser.id;
                const formattedTime = formatMessageTime(msg.timestamp);

                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 shadow-xs ${
                        isMe
                          ? 'bg-gradient-to-r from-rose-500 via-rose-500 to-pink-600 text-white rounded-2xl rounded-tr-xs'
                          : 'bg-white text-slate-800 border border-rose-100/90 rounded-2xl rounded-tl-xs shadow-xs'
                      }`}
                    >
                      {/* Message Content */}
                      <p className="text-[13px] sm:text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal">
                        {msg.content}
                      </p>

                      {/* Timestamp & Status */}
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-medium ${
                          isMe ? 'text-rose-100' : 'text-slate-400'
                        }`}
                      >
                        <span>{formattedTime}</span>
                        {isMe && (
                          <span>
                            {msg.read ? (
                              <CheckCheck className="w-3.5 h-3.5 text-pink-200 inline" title="Lida" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-rose-200 inline" title="Enviada" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* 3. QUICK EMOJI DRAWER */}
        {isLinked && showEmojiPicker && (
          <div className="bg-white border-t border-rose-100 px-3 py-2 shrink-0 z-30 shadow-sm animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-rose-50">
              <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                Reações rápidas
              </span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {QUICK_EMOJIS.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => handleInsertEmoji(emoji)}
                  className="text-2xl p-1 hover:scale-125 active:scale-95 transition-transform cursor-pointer shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4. NATIVE TEXT INPUT BAR (USES NATIVE ANDROID / IOS KEYBOARD) */}
        {isLinked && (
          <div className="shrink-0 bg-white/95 backdrop-blur-md border-t border-rose-100/80 px-3 py-2 pb-safe z-30">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendText();
              }}
              className="flex items-end gap-2"
            >
              {/* Native Input Capsule */}
              <div className="flex-1 min-h-[44px] flex items-center bg-slate-50/95 rounded-2xl sm:rounded-3xl px-3 py-1.5 border border-rose-200/80 focus-within:border-rose-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-rose-100 transition shadow-2xs">
                {/* Emoji toggle */}
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    setShowEmojiPicker((prev) => !prev);
                  }}
                  className={`p-1.5 rounded-full transition active:scale-95 cursor-pointer shrink-0 self-end mb-0.5 ${
                    showEmojiPicker
                      ? 'text-rose-600 bg-rose-100'
                      : 'text-slate-400 hover:text-rose-500'
                  }`}
                  title="Emojis"
                >
                  <Smile className="w-5 h-5" />
                </button>

                {/* Quick love reaction */}
                <button
                  type="button"
                  onClick={() => {
                    handleSendText('❤️');
                  }}
                  className="p-1 text-rose-400 hover:text-rose-600 hover:scale-110 active:scale-95 transition cursor-pointer shrink-0 self-end mb-0.5 mr-1"
                  title="Enviar coração rápido"
                >
                  <Heart className="w-4 h-4 fill-rose-400 text-rose-400" />
                </button>

                {/* Native Textarea for Native Android / iOS Keyboard */}
                <textarea
                  ref={textareaRef}
                  id="chat-native-input"
                  value={inputText}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem para ${partner?.username || 'amor'}...`}
                  rows={1}
                  autoComplete="on"
                  autoCorrect="on"
                  spellCheck={true}
                  enterKeyHint="send"
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-[14px] sm:text-[15px] text-slate-800 placeholder-slate-400 px-1 py-1 leading-snug max-h-28 overflow-y-auto no-scrollbar font-normal"
                />

                {/* Clear button */}
                {inputText && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputText('');
                      if (textareaRef.current) {
                        textareaRef.current.style.height = 'auto';
                        textareaRef.current.focus();
                      }
                    }}
                    className="text-xs text-slate-400 hover:text-rose-500 font-bold px-1.5 py-0.5 rounded-full self-center cursor-pointer"
                    title="Limpar texto"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Send Button */}
              <button
                id="chat-send-btn"
                type="submit"
                disabled={!inputText.trim() || isSending}
                className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md transition active:scale-95 shrink-0 self-end mb-0.5 ${
                  inputText.trim() && !isSending
                    ? 'bg-gradient-to-tr from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700 cursor-pointer shadow-rose-200/80'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
                }`}
                title="Enviar mensagem"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
