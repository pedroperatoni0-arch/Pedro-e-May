import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Task, DayOfWeek, TaskCategory, TaskStatus, DailyHistoryRecord } from '../../types';
import { getTodayDateString, getTodayDayOfWeek, AppStorage, formatDateToPortuguese } from '../../utils/storage';
import { getTaskXpForLevel, isTaskAvailableForCompletion } from '../../utils/gamification';
import { TaskHeartCheckButton } from './TaskHeartCheckButton';
import {
  Clock,
  Plus,
  Check,
  Calendar,
  History,
  Trash2,
  Edit3,
  X,
  Repeat,
  Sparkles,
  Info,
  ChevronRight,
  Coffee,
  Dumbbell,
  BookOpen,
  Heart,
  Smile,
  Home,
  CheckCircle2,
  XCircle,
  ListTodo,
  AlertCircle
} from 'lucide-react';

interface RoutineTabProps {
  tasks: Task[];
  userId?: string;
  userLevel?: number;
  onAddTask: (newTask: Omit<Task, 'id' | 'completedDates' | 'failedDates'>) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTaskToday?: (taskId: string) => void;
  onSetTaskStatus: (taskId: string, status: TaskStatus) => void;
}

const DAYS_META: { day: DayOfWeek; label: string; short: string }[] = [
  { day: 1, label: 'Segunda-feira', short: 'Seg' },
  { day: 2, label: 'Terça-feira', short: 'Ter' },
  { day: 3, label: 'Quarta-feira', short: 'Qua' },
  { day: 4, label: 'Quinta-feira', short: 'Qui' },
  { day: 5, label: 'Sexta-feira', short: 'Sex' },
  { day: 6, label: 'Sábado', short: 'Sáb' },
  { day: 0, label: 'Domingo', short: 'Dom' },
];

const CATEGORY_META: Record<TaskCategory, { label: string; icon: React.ReactNode; color: string }> = {
  routine: { label: 'Rotina', icon: <Coffee className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border border-slate-200/60' },
  fitness: { label: 'Treino', icon: <Dumbbell className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border border-slate-200/60' },
  study: { label: 'Estudo', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border border-slate-200/60' },
  love: { label: 'Casal', icon: <Heart className="w-3.5 h-3.5" />, color: 'bg-rose-50 text-rose-700 border border-rose-100' },
  health: { label: 'Saúde', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border border-slate-200/60' },
  mindfulness: { label: 'Mente', icon: <Smile className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border border-slate-200/60' },
  home: { label: 'Casa', icon: <Home className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border border-slate-200/60' },
};

export const RoutineTab: React.FC<RoutineTabProps> = ({
  tasks,
  userId = 'user_leo_1',
  userLevel = 1,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onToggleTaskToday,
  onSetTaskStatus,
}) => {
  const todayDay = getTodayDayOfWeek();
  const todayStr = getTodayDateString();
  const dynamicTaskXp = getTaskXpForLevel(userLevel);

  // Active view: 'routine' or 'history'
  const [currentView, setCurrentView] = useState<'routine' | 'history'>('routine');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todayDay);

  // History state
  const [historyRecords, setHistoryRecords] = useState<DailyHistoryRecord[]>([]);

  // Task Details Modal State
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);

  // Form (Add / Edit) Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formTime, setFormTime] = useState('08:00');
  const [formCategory, setFormCategory] = useState<TaskCategory>('routine');
  const [formDays, setFormDays] = useState<DayOfWeek[]>([1, 2, 3, 4, 5]);
  const [formRecurring, setFormRecurring] = useState(true);
  const [formNotes, setFormNotes] = useState('');

  // Load history & run 00:00 closing check
  useEffect(() => {
    AppStorage.processDayClosing(userId);
    setHistoryRecords(AppStorage.getDailyHistory(userId));
  }, [userId, tasks]);

  const safeTasks = Array.isArray(tasks) ? tasks : [];

  // Tasks for selected day
  const dayTasks = safeTasks
    .filter(t => t && Array.isArray(t.days) && t.days.includes(selectedDay))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const completedCount = dayTasks.filter(t => t && Array.isArray(t.completedDates) && t.completedDates.includes(todayStr)).length;
  const totalCount = dayTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const isTodaySelected = selectedDay === todayDay;
  const selectedDayMeta = DAYS_META.find(d => d.day === selectedDay);

  // Open modal to add new task
  const handleOpenAddModal = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormTime('08:00');
    setFormCategory('routine');
    setFormDays([selectedDay]);
    setFormRecurring(true);
    setFormNotes('');
    setIsFormModalOpen(true);
  };

  // Open modal to edit existing task
  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormTime(task.time);
    setFormCategory(task.category);
    setFormDays(task.days);
    setFormRecurring(task.isRecurring);
    setFormNotes(task.notes || '');
    setSelectedTaskForDetails(null);
    setIsFormModalOpen(true);
  };

  // Save form
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingTask) {
      onUpdateTask({
        ...editingTask,
        title: formTitle.trim(),
        time: formTime,
        category: formCategory,
        xpReward: dynamicTaskXp,
        days: formDays.length > 0 ? formDays : [selectedDay],
        isRecurring: formRecurring,
        notes: formNotes.trim(),
      });
    } else {
      onAddTask({
        userId,
        title: formTitle.trim(),
        time: formTime,
        category: formCategory,
        xpReward: dynamicTaskXp,
        days: formDays.length > 0 ? formDays : [selectedDay],
        isRecurring: formRecurring,
        createdAt: todayStr, // Marked created today -> available tomorrow rule!
        notes: formNotes.trim(),
      });
    }

    setIsFormModalOpen(false);
    setEditingTask(null);
  };

  const handleToggleDayInForm = (day: DayOfWeek) => {
    if (formDays.includes(day)) {
      if (formDays.length > 1) {
        setFormDays(formDays.filter(d => d !== day));
      }
    } else {
      setFormDays([...formDays, day]);
    }
  };

  return (
    <div id="routine-tab-container" className="space-y-4 pb-28">
      {/* 1. TOP HEADER & VIEW TOGGLE */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-rose-100 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-rose-500" />
          <h2 className="text-base font-black text-slate-800 font-display">Rotina Semanal</h2>
        </div>

        {/* View Switcher: Routine vs History */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setCurrentView('routine')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              currentView === 'routine'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Rotina</span>
          </button>
          <button
            onClick={() => setCurrentView('history')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              currentView === 'history'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW: ROTINA ATIVA (SEGUNDA A DOMINGO) */}
      {/* ========================================================================= */}
      {currentView === 'routine' && (
        <div className="space-y-4">
          {/* Day Selector Chips (Segunda a Domingo) */}
          <div className="flex items-center justify-between gap-1.5 bg-white/90 backdrop-blur-md p-2 rounded-2xl border border-rose-100 shadow-xs overflow-x-auto">
            {DAYS_META.map(d => {
              const isSelected = selectedDay === d.day;
              const isToday = d.day === todayDay;

              return (
                <button
                  key={d.day}
                  onClick={() => setSelectedDay(d.day)}
                  className={`flex-1 min-w-[42px] py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-all ${
                    isSelected
                      ? 'bg-rose-500 text-white shadow-xs font-black'
                      : isToday
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 font-bold'
                      : 'text-slate-600 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider">{d.short}</span>
                  {isToday && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-rose-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Day Overview Card */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-rose-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  {selectedDayMeta?.label}
                  {isTodaySelected && <span className="ml-2 text-rose-500 text-xs font-bold">(Hoje)</span>}
                </h3>
                <p className="text-xs text-slate-500">
                  {dayTasks.length} {dayTasks.length === 1 ? 'tarefa agendada' : 'tarefas agendadas'}
                </p>
              </div>

              {/* Add Task Button */}
              <button
                onClick={handleOpenAddModal}
                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Tarefa</span>
              </button>
            </div>

            {/* Daily Progress Bar (If today) */}
            {isTodaySelected && totalCount > 0 && (
              <div className="pt-2 border-t border-rose-100/70 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-600">Progresso do Dia</span>
                  <span className="font-black text-rose-600 font-display">
                    {progressPercent}% ({completedCount}/{totalCount})
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <motion.div
                    className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tasks List */}
          {dayTasks.length === 0 ? (
            <div className="bg-white/95 backdrop-blur-md rounded-3xl p-8 border border-rose-100 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-500 mx-auto flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Nenhuma tarefa para este dia</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Adicione hábitos e tarefas para manter a rotina organizada e pontuar na Arena!
              </p>
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Tarefa para {selectedDayMeta?.short}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {dayTasks.map(task => {
                const isCompleted = task.completedDates.includes(todayStr);
                const categoryInfo = CATEGORY_META[task.category] || CATEGORY_META.routine;
                const availability = isTaskAvailableForCompletion(task, todayStr);

                return (
                  <div
                    key={task.id}
                    className={`bg-white/95 backdrop-blur-md rounded-2xl p-3.5 border transition-all flex items-center justify-between gap-3 ${
                      isCompleted
                        ? 'bg-rose-50/40 border-rose-200/60 shadow-xs'
                        : 'border-slate-200/80 hover:border-rose-300 shadow-xs'
                    }`}
                  >
                    {/* Left: Time + Details */}
                    <div
                      onClick={() => setSelectedTaskForDetails(task)}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="text-center shrink-0 w-12 py-1 px-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-xs font-mono font-black text-slate-700">{task.time}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold flex items-center gap-1 ${categoryInfo.color}`}>
                            {categoryInfo.icon}
                            {categoryInfo.label}
                          </span>
                          {!availability.available && !isCompleted && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-amber-100 text-amber-800 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Amanhã
                            </span>
                          )}
                        </div>

                        <h4 className={`text-xs font-bold truncate ${isCompleted ? 'line-through text-slate-400 font-normal' : 'text-slate-800'}`}>
                          {task.title}
                        </h4>

                        {task.notes && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {task.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isTodaySelected ? (
                        <div title={availability.reason || (isCompleted ? 'Tarefa concluída hoje' : 'Concluir tarefa')}>
                          <TaskHeartCheckButton
                            isCompleted={isCompleted}
                            onComplete={() => {
                              if (availability.available || isCompleted) {
                                onToggleTaskToday?.(task.id);
                              }
                            }}
                            onClick={() => {
                              if (availability.available || isCompleted) {
                                onToggleTaskToday?.(task.id);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedTaskForDetails(task)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 transition"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW: HISTÓRICO DIÁRIO & DIAS FECHADOS */}
      {/* ========================================================================= */}
      {currentView === 'history' && (
        <div className="space-y-3">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-rose-100 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Histórico de Fechamento Diário</h3>
              <p className="text-xs text-slate-500">Dias anteriores são arquivados automaticamente às 00:00.</p>
            </div>
            <History className="w-5 h-5 text-rose-500" />
          </div>

          {historyRecords.length === 0 ? (
            <div className="p-8 text-center bg-white/90 rounded-3xl border border-rose-100 text-slate-500 text-xs">
              Nenhum registro de histórico anterior disponível.
            </div>
          ) : (
            historyRecords.map(record => {
              const recordPercent = record.totalTasks > 0 ? Math.round((record.completedTasks / record.totalTasks) * 100) : 0;

              return (
                <div
                  key={record.id}
                  className="bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-rose-100 shadow-xs space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-rose-500" />
                      <span className="text-xs font-bold text-slate-800">{record.dateLabel}</span>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      recordPercent === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {recordPercent}% Concluído ({record.completedTasks}/{record.totalTasks})
                    </span>
                  </div>

                  {/* Task list summary */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    {record.tasks.map(t => (
                      <div key={t.taskId} className="flex items-center justify-between text-xs py-0.5">
                        <span className={`truncate max-w-[200px] ${t.status === 'completed' ? 'text-slate-700 font-medium' : 'text-slate-400 line-through'}`}>
                          {t.title}
                        </span>
                        <span className="text-[10px] font-bold shrink-0">
                          {t.status === 'completed' ? (
                            <span className="text-emerald-600 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Feito
                            </span>
                          ) : (
                            <span className="text-rose-500 flex items-center gap-0.5">
                              <X className="w-3 h-3" /> Não Feito
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR / EDITAR TAREFA */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isFormModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-rose-100 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-800 font-display">
                  {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
                </h3>
                <button
                  onClick={() => setIsFormModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveForm} className="space-y-3.5">
                {/* Title */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Título da Tarefa</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Ex: Treino de musculação"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-hidden focus:border-rose-400 focus:bg-white transition"
                  />
                </div>

                {/* Time & Category */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Horário</label>
                    <input
                      type="time"
                      required
                      value={formTime}
                      onChange={e => setFormTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold focus:outline-hidden focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Categoria</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value as TaskCategory)}
                      className="w-full px-2.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-hidden focus:border-rose-400"
                    >
                      <option value="routine">Rotina</option>
                      <option value="fitness">Treino</option>
                      <option value="study">Estudo</option>
                      <option value="love">Casal</option>
                      <option value="health">Saúde</option>
                      <option value="mindfulness">Mente</option>
                      <option value="home">Casa</option>
                    </select>
                  </div>
                </div>

                {/* Days of Week selection */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Dias da Semana</label>
                  <div className="flex gap-1 justify-between">
                    {DAYS_META.map(d => {
                      const isSelected = formDays.includes(d.day);
                      return (
                        <button
                          type="button"
                          key={d.day}
                          onClick={() => handleToggleDayInForm(d.day)}
                          className={`w-9 h-9 rounded-xl text-xs font-extrabold transition flex items-center justify-center ${
                            isSelected
                              ? 'bg-rose-500 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {d.short.slice(0, 1)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Observações (Opcional)</label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Instruções ou lembrete para você..."
                    className="w-full px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-hidden focus:border-rose-400 resize-none"
                  />
                </div>

                {/* Anti-tampering reminder */}
                <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100 text-[10px] text-rose-800 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    Tarefas novas criadas hoje ficam disponíveis para execução a partir de amanhã para manter o equilíbrio da Arena!
                  </span>
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-xs font-bold shadow-md transition"
                  >
                    {editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: DETALHES DA TAREFA */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {selectedTaskForDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-rose-100 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`p-2 rounded-xl ${CATEGORY_META[selectedTaskForDetails.category]?.color}`}>
                    {CATEGORY_META[selectedTaskForDetails.category]?.icon}
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 font-display">
                      {selectedTaskForDetails.title}
                    </h3>
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      Horário: {selectedTaskForDetails.time}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTaskForDetails(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {selectedTaskForDetails.notes && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700">
                    <span className="font-bold block text-[10px] text-slate-400 uppercase mb-0.5">Notas:</span>
                    {selectedTaskForDetails.notes}
                  </div>
                )}

                <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100 flex items-center justify-between">
                  <span className="text-slate-600 font-bold">Dias Ativos:</span>
                  <div className="flex gap-1">
                    {selectedTaskForDetails.days.map(d => {
                      const meta = DAYS_META.find(m => m.day === d);
                      return (
                        <span key={d} className="px-1.5 py-0.5 bg-rose-500 text-white rounded-md text-[10px] font-extrabold">
                          {meta?.short.slice(0, 1)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Actions: Edit or Delete */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleOpenEditModal(selectedTaskForDetails)}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Editar</span>
                </button>

                <button
                  onClick={() => {
                    onDeleteTask(selectedTaskForDetails.id);
                    setSelectedTaskForDetails(null);
                  }}
                  className="py-2.5 px-3 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Excluir</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
