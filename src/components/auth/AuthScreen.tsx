import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAccount } from '../../types';
import { AuthApi } from '../../services/authApi';
import { soundManager } from '../../utils/audio';
import { Heart, Sparkles, Eye, EyeOff, ArrowRight, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';

interface AuthScreenProps {
  onAuthSuccess: (user: UserAccount, partner: UserAccount | null) => void;
}

const CUTE_AVATARS = ['🌸', '🦁', '🐱', '🐼', '🦊', '🐰', '🐻', '🥑', '✨', '👑'];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isRegister, setIsRegister] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('🌸');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Frontend quick preliminary validation
    if (isRegister) {
      if (!username.trim()) {
        setErrorMessage('Por favor, digite seu nome de usuário.');
        return;
      }
      if (username.trim().length < 2) {
        setErrorMessage('O nome de usuário deve ter pelo menos 2 caracteres.');
        return;
      }
      if (!email.trim()) {
        setErrorMessage('Por favor, digite seu e-mail.');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setErrorMessage('Por favor, digite um e-mail válido.');
        return;
      }
      if (!password) {
        setErrorMessage('Por favor, digite sua senha.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('A senha deve ter no mínimo 6 caracteres.');
        return;
      }
    } else {
      if (!email.trim()) {
        setErrorMessage('Por favor, informe seu e-mail ou nome de usuário.');
        return;
      }
      if (!password) {
        setErrorMessage('Por favor, digite sua senha.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isRegister) {
        const res = await AuthApi.register({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password,
          avatar: selectedAvatar,
        });

        if (res.success && res.user) {
          soundManager.playLevelUp();
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#f43f5e', '#ec4899', '#c084fc', '#ffd700'],
          });
          onAuthSuccess(res.user, null);
        } else {
          setErrorMessage(res.message || 'Erro ao criar a conta. Tente novamente.');
          soundManager.playPop();
        }
      } else {
        const res = await AuthApi.login({
          login: email.trim(),
          password,
        });

        if (res.success && res.user) {
          soundManager.playPop();
          onAuthSuccess(res.user, res.partner || null);
        } else {
          setErrorMessage(res.message || 'E-mail ou senha incorretos.');
          soundManager.playPop();
        }
      }
    } catch (err: any) {
      setErrorMessage('Erro ao conectar ao servidor. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50/70 via-white to-purple-50/50 flex flex-col justify-between items-center p-4 sm:p-6 overflow-y-auto">
      {/* Delicate background ambient glows */}
      <div className="fixed -top-16 -left-16 w-56 h-56 bg-rose-200/35 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-16 -right-16 w-56 h-56 bg-purple-200/35 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm mx-auto my-auto relative z-10 space-y-6 pt-4 pb-8">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-rose-400 via-pink-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-200/60 border-2 border-white"
          >
            <Heart className="w-8 h-8 fill-current animate-pulse" />
          </motion.div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight font-display">
              DuoQuest
            </h1>
            <p className="text-xs text-slate-500 font-medium px-4">
              Construam hábitos e conquistem a rotina a dois ❤️
            </p>
          </div>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white/95 backdrop-blur-md rounded-3xl p-6 border border-rose-100 shadow-xl shadow-rose-100/40 space-y-5"
        >
          {/* Mode Tabs */}
          <div className="flex bg-slate-100/90 rounded-2xl p-1 border border-slate-200/50">
            <button
              type="button"
              id="tab-criar-conta"
              onClick={() => {
                setIsRegister(true);
                setErrorMessage(null);
              }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                isRegister
                  ? 'bg-white text-rose-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Criar conta
            </button>
            <button
              type="button"
              id="tab-entrar"
              onClick={() => {
                setIsRegister(false);
                setErrorMessage(null);
              }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                !isRegister
                  ? 'bg-white text-rose-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Entrar
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {errorMessage && (
                <motion.div
                  key="error-box"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-medium leading-tight flex items-start gap-2"
                >
                  <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                  <span>{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Registration: Username */}
            {isRegister && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Nome de usuário
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="register-username-input"
                    type="text"
                    required
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Digite seu nome de usuário"
                    className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-rose-400 focus:outline-hidden transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email / Login Field */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                {isRegister ? 'E-mail' : 'E-mail, Usuário ou ID'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="auth-email-input"
                  type={isRegister ? 'email' : 'text'}
                  required
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={isRegister ? 'Digite seu e-mail' : 'Digite seu e-mail, usuário ou ID'}
                  className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-rose-400 focus:outline-hidden transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Digite sua senha"
                  className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-rose-400 focus:outline-hidden transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Avatar Selector (Only for Register) */}
            {isRegister && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Escolha seu Avatar
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {CUTE_AVATARS.map(av => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setSelectedAvatar(av)}
                      className={`text-xl p-2 rounded-2xl border transition-all cursor-pointer ${
                        selectedAvatar === av
                          ? 'border-rose-500 bg-rose-50/80 scale-105 shadow-xs'
                          : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              id="submit-auth-btn"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-700 active:scale-98 text-white rounded-2xl text-xs font-black shadow-md shadow-rose-200/50 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegister ? 'Criar conta' : 'Entrar'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Switcher Helper */}
          <div className="text-center pt-1 border-t border-slate-100">
            {isRegister ? (
              <p className="text-xs text-slate-500">
                Já possui uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setErrorMessage(null);
                  }}
                  className="font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  Entrar
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Não tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setErrorMessage(null);
                  }}
                  className="font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  Criar conta
                </button>
              </p>
            )}
          </div>
        </motion.div>

        {/* Security & Privacy note */}
        <div className="text-center flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Contas seguras com criptografia e ID único</span>
        </div>
      </div>
    </div>
  );
};
