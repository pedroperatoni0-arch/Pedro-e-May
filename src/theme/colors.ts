/**
 * Centralized Design Color Tokens for the application.
 * 
 * Rules:
 * - Base: Pure White + Graphite / Soft Neutrals
 * - Primary: Soft Modern Rose (Identity, Main Actions, Selection, Couple Highlights)
 * - Secondary: Soft Lilac (User Personal Level, XP Progress, Evolution)
 * - Success: Emerald Green (Task Completion, Positive Progress, Checks)
 * - Warning/Highlight: Soft Amber/Gold (Trophy, Streaks, 1st Place)
 * - Danger: Soft Red (Destructive Actions like Unlink/Delete)
 */

export const THEME_COLORS = {
  // Base & Surfaces
  background: 'bg-white',
  surface: 'bg-white',
  surfaceSubtle: 'bg-slate-50',
  surfaceRoseSubtle: 'bg-rose-50/50',
  surfaceLilacSubtle: 'bg-purple-50/50',
  
  // Borders
  borderSubtle: 'border-slate-100',
  borderDefault: 'border-slate-200/70',
  borderRose: 'border-rose-100',
  borderRoseHover: 'hover:border-rose-200',
  borderLilac: 'border-purple-100',
  borderEmerald: 'border-emerald-200',

  // Typography
  textPrimary: 'text-slate-800',
  textSecondary: 'text-slate-500',
  textMuted: 'text-slate-400',
  textRose: 'text-rose-600',
  textLilac: 'text-purple-600',
  textSuccess: 'text-emerald-600',
  textWarning: 'text-amber-600',

  // Badges & Accents
  primaryAccent: {
    solid: 'bg-rose-500 text-white',
    subtle: 'bg-rose-50 text-rose-700 border border-rose-100',
    hover: 'hover:bg-rose-600',
  },
  secondaryLilacAccent: {
    solid: 'bg-purple-500 text-white',
    subtle: 'bg-purple-50 text-purple-700 border border-purple-100',
    bar: 'bg-gradient-to-r from-purple-400 to-indigo-500',
  },
  successAccent: {
    solid: 'bg-emerald-500 text-white',
    subtle: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  warningAccent: {
    solid: 'bg-amber-500 text-white',
    subtle: 'bg-amber-50 text-amber-800 border border-amber-200/70',
  },
  dangerAccent: {
    solid: 'bg-rose-600 text-white hover:bg-rose-700',
    subtle: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
} as const;
