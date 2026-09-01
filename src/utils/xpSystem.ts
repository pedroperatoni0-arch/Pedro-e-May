import { Task, ArenaDailyMatch, UserAccount } from '../types';

/**
 * =======================================================================
 * SISTEMA CENTRAL DE XP & EVOLUÇÃO PESSOAL DO USUÁRIO
 * =======================================================================
 * O Level e XP representam exclusivamente a evolução da própria pessoa.
 * - Progressão infinita (sem level máximo).
 * - Curva dinâmica: quanto maior o nível, maior a quantidade necessária para
 *   avançar e maior a recompensa diária por cumprir a rotina.
 * - Concluir tarefas individuais avulsas NÃO causa level up automático.
 * - O XP principal é concedido pela conclusão e desempenho da rotina diária.
 */

/**
 * 1. XP NECESSÁRIO PARA O PRÓXIMO NÍVEL PESSOAL
 * Curva equilibrada e infinita:
 * Level 1: 150 + 1 * 50 = 200 XP
 * Level 2: 150 + 2 * 50 = 250 XP
 * Level 5: 150 + 5 * 50 = 400 XP
 * Level 7: 150 + 7 * 50 = 500 XP
 * Level 10: 150 + 10 * 50 = 650 XP
 * Level 20: 150 + 20 * 50 = 1150 XP
 */
export function calculateUserXpRequired(level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return 150 + lvl * 50;
}

/**
 * 2. XP RECOMPENSA PELA ROTINA DIÁRIA
 * A recompensa cresce gradualmente com o nível pessoal e com a taxa de conclusão:
 * - Recompensa base a 100% de conclusão: 100 + (level * 25) XP
 *   - Level 1: 125 XP
 *   - Level 2: 150 XP
 *   - Level 5: 225 XP
 *   - Level 7: 275 XP
 *   - Level 10: 350 XP
 */
export function calculateDailyRoutineUserXp(level: number, performancePercent: number = 100): number {
  const lvl = Math.max(1, Math.floor(level));
  const baseReward = 100 + lvl * 25;
  const ratio = Math.max(0, Math.min(100, performancePercent)) / 100;
  return Math.round(baseReward * ratio);
}

/**
 * XP indicativo de exibição para tarefas individuais
 */
export function getTaskXpForLevel(level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return Math.round(20 + (lvl - 1) * 3);
}

export interface UserXpGainResult {
  previousLevel: number;
  newLevel: number;
  previousXp: number;
  newXp: number;
  requiredXpForNextLevel: number;
  leveledUp: boolean;
  levelsGained: number;
  xpAdded: number;
}

/**
 * 3. PROCESSADOR DE GANHO DE XP PESSOAL E LEVEL UP
 * Processa múltiplos level ups contínuos sem desperdiçar XP excedente.
 */
export function processUserXpAddition(
  currentLevel: number,
  currentXp: number,
  xpToAdd: number
): UserXpGainResult {
  const previousLevel = Math.max(1, Math.floor(currentLevel));
  const previousXp = Math.max(0, currentXp);
  const safeXpToAdd = Math.max(0, Math.round(xpToAdd));

  let lvl = previousLevel;
  let xp = previousXp + safeXpToAdd;
  let levelsGained = 0;

  let reqXp = calculateUserXpRequired(lvl);

  while (xp >= reqXp) {
    xp -= reqXp;
    lvl += 1;
    levelsGained += 1;
    reqXp = calculateUserXpRequired(lvl);
  }

  return {
    previousLevel,
    newLevel: lvl,
    previousXp,
    newXp: xp,
    requiredXpForNextLevel: reqXp,
    leveledUp: levelsGained > 0,
    levelsGained,
    xpAdded: safeXpToAdd,
  };
}

/**
 * 4. VERIFICAÇÃO DE DISPONIBILIDADE DA OCORRÊNCIA DA TAREFA
 * Regra: Uma tarefa criada hoje só fica disponível para conclusão a partir de amanhã.
 */
export function isTaskAvailableForCompletion(task: Task, todayDateStr: string): {
  available: boolean;
  reason?: string;
} {
  if (task.createdAt && task.createdAt === todayDateStr) {
    return {
      available: false,
      reason: 'Tarefa criada hoje. Disponível a partir de amanhã!',
    };
  }

  if (task.completedDates.includes(todayDateStr)) {
    return {
      available: false,
      reason: 'Tarefa já concluída hoje.',
    };
  }

  return {
    available: true,
  };
}

/**
 * =======================================================================
 * 5. ESTRUTURA DE DESEMPENHO PROPORCIONAL DA ARENA (0 a 100 PONTOS / %)
 * =======================================================================
 * A pontuação representa estritamente o percentual de cumprimento da rotina
 * individual de cada participante para o dia atual.
 *
 * REGRA FUNDAMENTAL:
 * - Não compara quantidade bruta de tarefas (ex: 13 tarefas vs 10 tarefas).
 * - Mede apenas: quem cumpriu uma porcentagem maior da própria rotina.
 * - 13/13 = 100% e 10/10 = 100% -> Empate perfeito.
 * - 10/13 (76.92%) vs 9/10 (90%) -> Quem fez 9/10 está na frente.
 * - Adicionar nova tarefa aumenta o total do dia e recalcula a porcentagem.
 * - Preserva total precisão interna para evitar distorções de arredondamento.
 * - Estrutura limpa e desacoplada, pronta para alimentar futuras mecânicas de batalha.
 */

export interface ArenaPerformance {
  completedTasks: number;
  totalTasks: number;
  completionRate: number; // 0.0 a 1.0 (precisão real)
  percentage: number; // 0.0 a 100.0 (precisão real sem truncamento)
  displayScore: number; // Inteiro arredondado para exibição na interface (0 a 100)
  isPerfect: boolean; // 100% cumprido
}

/**
 * Calcula a performance proporcional detalhada da rotina
 */
export function calculateRoutinePerformance(completedTasks: number, totalTasks: number): ArenaPerformance {
  const safeCompleted = Math.max(0, completedTasks);
  const safeTotal = Math.max(0, totalTasks);

  if (safeTotal <= 0) {
    return {
      completedTasks: 0,
      totalTasks: 0,
      completionRate: 0,
      percentage: 0,
      displayScore: 0,
      isPerfect: false,
    };
  }

  const completionRate = Math.min(1, Math.max(0, safeCompleted / safeTotal));
  const percentage = completionRate * 100;
  const displayScore = Math.min(100, Math.max(0, Math.round(percentage)));

  return {
    completedTasks: safeCompleted,
    totalTasks: safeTotal,
    completionRate,
    percentage,
    displayScore,
    isPerfect: safeCompleted >= safeTotal && safeTotal > 0,
  };
}

/**
 * Retorna a pontuação proporcional da Arena (0 a 100) com precisão real em ponto flutuante.
 */
export function calculateArenaScore(completedTasks: number, totalTasks: number): number {
  return calculateRoutinePerformance(completedTasks, totalTasks).percentage;
}

/**
 * Mensagens carinhosas e incentivadoras da Arena baseadas em desempenho proporcional
 */
export function getArenaStatusMessage(
  userScore: number,
  partnerScore: number,
  partnerName: string = 'Ela',
  userName: string = 'Você'
): { text: string; icon: string; highlight: 'user' | 'partner' | 'tie' | 'both_done' } {
  const isBoth100 = Math.abs(userScore - 100) < 0.001 && Math.abs(partnerScore - 100) < 0.001;
  if (isBoth100) {
    return {
      text: 'Vocês dois completaram 100% da rotina hoje! Parabéns! 🌟',
      icon: '💖',
      highlight: 'both_done',
    };
  }

  const isTie = Math.abs(userScore - partnerScore) < 0.001;

  if (isTie) {
    if (userScore <= 0.001) {
      return {
        text: 'O desafio de hoje acabou de começar! Bora lá! ✨',
        icon: '☀️',
        highlight: 'tie',
      };
    }
    return {
      text: 'Empatados! Ambos cumprindo a mesma proporção da rotina! 💕',
      icon: '💕',
      highlight: 'tie',
    };
  }

  if (userScore > partnerScore) {
    const diff = userScore - partnerScore;
    if (diff <= 15) {
      return {
        text: `Você está na frente por pouco! ${partnerName} tá chegando perto! ✨`,
        icon: '🔥',
        highlight: 'user',
      };
    }
    return {
      text: 'Você está na frente! Mandando muito bem na rotina! 🔥',
      icon: '🔥',
      highlight: 'user',
    };
  } else {
    const diff = partnerScore - userScore;
    if (diff <= 15) {
      return {
        text: `${partnerName} está na frente, mas você tá pertinho de virar! ✨`,
        icon: '💗',
        highlight: 'partner',
      };
    }
    return {
      text: `${partnerName} está na frente! Você está recuperando! 💗`,
      icon: '💗',
      highlight: 'partner',
    };
  }
}
