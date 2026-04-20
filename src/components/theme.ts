// apps/kickoff-clash/src/components/theme.ts
// Design system v2 — game-feel tokens for Kickoff Clash.

// ---- Rarity (v2 Balatro tier) ---------------------------------------------

export const RARITY_COLORS: Record<string, string> = {
  Common: '#b6a68a',
  Rare: '#3aa0ff',
  Epic: '#b06cff',
  Legendary: '#ff9a00',
};

export const RARITY_GLOW: Record<string, string> = {
  Common: 'none',
  Rare: '0 0 18px rgba(58,160,255,0.55)',
  Epic: '0 0 22px rgba(176,108,255,0.6)',
  Legendary: '0 0 28px rgba(255,154,0,0.7), 0 0 56px rgba(255,154,0,0.3)',
};

export const RARITY_FOIL: Record<string, boolean> = {
  Common: false,
  Rare: false,
  Epic: true,
  Legendary: true,
};

// ---- Position colour pills ------------------------------------------------

export const POSITION_COLORS: Record<string, string> = {
  GK: '#f97316',
  CD: '#3b82f6',
  WD: '#3b82f6',
  DM: '#22c55e',
  CM: '#22c55e',
  WM: '#22c55e',
  AM: '#a855f7',
  WF: '#ef4444',
  CF: '#ef4444',
};

// ---- Archetype monogram (3-char chip on Top Trumps face) ------------------

export const ARCHETYPE_MONOGRAM: Record<string, string> = {
  Target: 'TGT',
  Powerhouse: 'PWR',
  Engine: 'ENG',
  Destroyer: 'DST',
  Controller: 'CTR',
  Passer: 'PSR',
  Dribbler: 'DRB',
  Sprinter: 'SPT',
  Commander: 'CMD',
  Cover: 'CVR',
  Marker: 'MKR',
  Poacher: 'PCR',
  Catalyst: 'CAT',
};

// ---- Durability (geometric icons match v2 cards) --------------------------

export const DURABILITY_ICON: Record<string, { icon: string; label: string }> = {
  glass: { icon: '\u27E1', label: 'GLASS' },        // ⟡
  fragile: { icon: '\u25C8', label: 'FRAGILE' },    // ◈
  standard: { icon: '\u25CF', label: 'STANDARD' },  // ●
  iron: { icon: '\u25C6', label: 'IRON' },          // ◆
  titanium: { icon: '\u2605', label: 'TITANIUM' },  // ★
  phoenix: { icon: '\u2726', label: 'PHOENIX' },    // ✦
};

// ---- Personality theme -----------------------------------------------------

export const THEME_GRADIENTS: Record<string, string> = {
  General: 'linear-gradient(160deg, #1a1a2e, #101020)',
  Catalyst: 'linear-gradient(160deg, #2d1b35, #1a0f1f)',
  Maestro: 'linear-gradient(160deg, #2a2517, #1a180f)',
  Captain: 'linear-gradient(160deg, #2d1520, #1a0c12)',
  Professor: 'linear-gradient(160deg, #151f2e, #0c1420)',
};

export const THEME_ICONS: Record<string, string> = {
  General: '\u2694',          // ⚔
  Catalyst: '\u26A1',         // ⚡
  Maestro: '\u266B',          // ♫
  Captain: '\u2764',          // ❤
  Professor: '\uD83D\uDCDA',  // 📚
};

// ---- Tactic category styling ----------------------------------------------

export const TACTIC_CATEGORY: Record<string, { color: string; bg: string; icon: string }> = {
  attacking: {
    color: '#e63946',
    bg: 'linear-gradient(160deg, #3a1218 0%, #1a0608 100%)',
    icon: '\u2197', // ↗
  },
  defensive: {
    color: '#3aa0ff',
    bg: 'linear-gradient(160deg, #0f1e3a 0%, #060b1a 100%)',
    icon: '\u25D8', // ◘
  },
  specialist: {
    color: '#f5c542',
    bg: 'linear-gradient(160deg, #3a2e0f 0%, #1a1506 100%)',
    icon: '\u2726', // ✦
  },
};
