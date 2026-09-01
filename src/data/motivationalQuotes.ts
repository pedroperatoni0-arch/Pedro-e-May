/**
 * Frases motivacionais fofas para o card principal.
 * Curtas, delicadas, carinhosas e focadas em amor, vida, evolução e rotina.
 */
export const CUTE_MOTIVATIONAL_QUOTES: string[] = [
  'Vai dar tudo certo, meu docinho. 💗',
  'Um passinho de cada vez, amor. ✨',
  'Cuide de você hoje, minha vida. 🌷',
  'Seu esforço de hoje vira seu orgulho amanhã. 💕',
  'Bora deixar o dia mais bonito, meu bem. 🥰',
  'Você consegue, meu docinho! ✨',
  'Hoje é mais um dia para evoluir juntinhos. 💗',
  'Cada pequeno hábito constrói o nosso futuro. 🌟',
  'Orgulho imenso da sua dedicação, amor. 🌸',
  'Respira fundo e faz o seu melhor, vida. 💖',
  'Com carinho e constância, tudo floresce. 🌿',
  'Estou sempre torcendo por você, meu bem! 💕',
];

export function getDailyCuteQuote(dateStr?: string): string {
  if (!dateStr) {
    return CUTE_MOTIVATIONAL_QUOTES[0];
  }
  // Deterministic quote per date, so it stays consistent throughout the day
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CUTE_MOTIVATIONAL_QUOTES.length;
  return CUTE_MOTIVATIONAL_QUOTES[index];
}
