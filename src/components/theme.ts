// apps/kickoff-clash/src/components/theme.ts

// Rarity colors + glows
export const RARITY_COLORS: Record<string, string> = {
  Common: '#71717a',
  Rare: '#4a9eff',
  Epic: '#a855f7',
  Legendary: '#f59e0b',
};

export const RARITY_GLOW: Record<string, string> = {
  Common: '0 0 6px rgba(113,113,122,0.3)',
  Rare: '0 0 10px rgba(74,158,255,0.4)',
  Epic: '0 0 14px rgba(168,85,247,0.5)',
  Legendary: '0 0 18px rgba(245,158,11,0.6), 0 0 36px rgba(245,158,11,0.2)',
};

// Personality theme card backgrounds
export const THEME_GRADIENTS: Record<string, string> = {
  General: 'linear-gradient(160deg, #1a1a2e, #101020)',
  Catalyst: 'linear-gradient(160deg, #2d1b35, #1a0f1f)',
  Maestro: 'linear-gradient(160deg, #2a2517, #1a180f)',
  Captain: 'linear-gradient(160deg, #2d1520, #1a0c12)',
  Professor: 'linear-gradient(160deg, #151f2e, #0c1420)',
};

export const THEME_ICONS: Record<string, string> = {
  General: '\u2694',
  Catalyst: '\u26a1',
  Maestro: '\u266b',
  Captain: '\u2764',
  Professor: '\ud83d\udcda',
};
