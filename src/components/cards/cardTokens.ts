/**
 * Kickoff Clash — Card system shared tokens.
 *
 * Single source of truth for the reusable GameCard / CardModal family. Every
 * screen that renders a card (PackReveal, TeamSelect, Match) imports these maps
 * so the look stays one family. Colours map onto DESIGN.md tokens; raw hexes
 * here are the position/rarity ring palette already used across the app —
 * centralised so we change them once.
 */

export const PIXEL = 'var(--font-pixel, monospace)';

// Rarity rings the card; ratings stay --line-white for legibility (contrast law).
// HARD CONSTRAINT: this is a flat Record<string,string> consumed across the app
// as RARITY_COLOR[x] → string. Do NOT change its shape. The glass/sheen/glow
// companions below are ADDITIVE.
export const RARITY_COLOR: Record<string, string> = {
  Common: '#9aa0a8',
  Rare: '#3d7bd6',
  Epic: '#a855f7',
  Legendary: '#e8a23a',
};

// -- Glass-frame companions (additive; do not consume in place of RARITY_COLOR) --

/**
 * Per-rarity glass treatment for the GameCard frame. Common is matte/quiet;
 * higher tiers escalate the sheen strength and (Epic/Legendary) add a glow halo.
 * `glow` references the canonical `--glow-*` tokens from globals.css; `null`
 * means no glow ring (matte). `sheen` keys the diagonal gloss strength.
 */
export interface RarityGlass {
  /** A 3-value rim-light ramp [shadow, base, highlight] used on the inner frame edges. */
  ramp: [string, string, string];
  /** The `.glow-edge` colour token, or null for no glow (Common/Rare). */
  glow: string | null;
  /** Diagonal sheen opacity multiplier applied to the frame sweep. 0 = none. */
  sheen: number;
  /** Whether this tier earns the animated foil sheen (Legendary only). */
  foil: boolean;
}

export const RARITY_GLASS: Record<string, RarityGlass> = {
  Common: { ramp: ['#5e646c', '#9aa0a8', '#c4c9cf'], glow: null, sheen: 0, foil: false },
  Rare: { ramp: ['#1f4f93', '#3d7bd6', '#7fb0ee'], glow: null, sheen: 0.5, foil: false },
  Epic: { ramp: ['#6d2fb0', '#a855f7', '#d3a8ff'], glow: 'var(--glow-epic)', sheen: 0.85, foil: false },
  Legendary: { ramp: ['#a9711a', '#e8a23a', '#ffd97a'], glow: 'var(--glow-legendary)', sheen: 1, foil: true },
};

/** Quick lookup: the outer glow token for a rarity (null = no glow ring). */
export const RARITY_GLOW: Record<string, string | null> = {
  Common: null,
  Rare: null,
  Epic: 'var(--glow-epic)',
  Legendary: 'var(--glow-legendary)',
};

/** Quick lookup: the diagonal-sheen strength (0–1) for a rarity. */
export const RARITY_SHEEN: Record<string, number> = {
  Common: 0,
  Rare: 0.5,
  Epic: 0.85,
  Legendary: 1,
};

// Position family → accent colour, shared by every card surface.
export const POSITION_COLOR: Record<string, string> = {
  GK: '#e8621a',
  CD: '#3d7bd6',
  WD: '#3d7bd6',
  DM: '#22c55e',
  CM: '#22c55e',
  WM: '#22c55e',
  AM: '#a855f7',
  WF: '#f59e0b',
  CF: '#e23b35',
};

// Long-form position labels for the expanded card.
export const POSITION_LABEL: Record<string, string> = {
  GK: 'Goalkeeper',
  CD: 'Centre-Back',
  WD: 'Full-Back',
  DM: 'Defensive Mid',
  CM: 'Central Mid',
  WM: 'Wide Mid',
  AM: 'Attacking Mid',
  WF: 'Winger',
  CF: 'Forward',
};

// Durability → readable label + colour. Backed by scoring.ts Durability union.
export const DURABILITY_META: Record<string, { label: string; color: string }> = {
  glass: { label: 'Glass', color: '#fca5a5' },
  fragile: { label: 'Fragile', color: '#f6b765' },
  standard: { label: 'Standard', color: 'var(--cream-soft)' },
  iron: { label: 'Iron', color: '#9fc7e8' },
  titanium: { label: 'Titanium', color: '#cfe3f5' },
  phoenix: { label: 'Phoenix', color: '#f6a25a' },
};

// Tactic category → accent, matching PackReveal's existing palette.
export const TACTIC_CAT_COLOR: Record<string, string> = {
  attacking: 'var(--kit-red)',
  defensive: 'var(--kit-blue)',
  specialist: 'var(--gold)',
};

/**
 * Investment ladder → Boardroom identity. One gold-family frame; each ladder is
 * distinguished by its tab label, a secondary accent, and a one-line summary of
 * what unlocking it buys. All three share the Boardroom crest (gold) on the card.
 */
export const INVESTMENT_META: Record<
  string,
  { tab: string; accent: string; kicker: string }
> = {
  stadium: { tab: 'STADIUM', accent: 'var(--gold)', kicker: 'Gate revenue' },
  academy: { tab: 'ACADEMY', accent: 'var(--success)', kicker: 'Youth intake' },
  boxoffice: { tab: 'BOX OFFICE', accent: 'var(--amber)', kicker: 'Goals → cash' },
};

/** Compact money label, e.g. 22000 → "£22k", 1500 → "£1.5k", 500 → "£500". */
export function formatCash(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    const s = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
    return `£${s}k`;
  }
  return `£${n}`;
}

/**
 * Nation → flag emoji. The full pool spans 60+ nations; we map the well-known
 * ones and otherwise fall back to a short nation code chip (rendered by the
 * card), which is cleaner and more pixel-consistent than a generic globe.
 */
const NATION_FLAG: Record<string, string> = {
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  Wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
  France: '\u{1F1EB}\u{1F1F7}',
  Sweden: '\u{1F1F8}\u{1F1EA}',
  Portugal: '\u{1F1F5}\u{1F1F9}',
  Brazil: '\u{1F1E7}\u{1F1F7}',
  Germany: '\u{1F1E9}\u{1F1EA}',
  Spain: '\u{1F1EA}\u{1F1F8}',
  Italy: '\u{1F1EE}\u{1F1F9}',
  Argentina: '\u{1F1E6}\u{1F1F7}',
  Netherlands: '\u{1F1F3}\u{1F1F1}',
  Belgium: '\u{1F1E7}\u{1F1EA}',
  Croatia: '\u{1F1ED}\u{1F1F7}',
  Denmark: '\u{1F1E9}\u{1F1F0}',
  Norway: '\u{1F1F3}\u{1F1F4}',
  Poland: '\u{1F1F5}\u{1F1F1}',
  Japan: '\u{1F1EF}\u{1F1F5}',
  'South Korea': '\u{1F1F0}\u{1F1F7}',
  USA: '\u{1F1FA}\u{1F1F8}',
  Mexico: '\u{1F1F2}\u{1F1FD}',
  Uruguay: '\u{1F1FA}\u{1F1FE}',
  Colombia: '\u{1F1E8}\u{1F1F4}',
  Chile: '\u{1F1E8}\u{1F1F1}',
  Nigeria: '\u{1F1F3}\u{1F1EC}',
  Senegal: '\u{1F1F8}\u{1F1F3}',
  Morocco: '\u{1F1F2}\u{1F1E6}',
  Egypt: '\u{1F1EA}\u{1F1EC}',
  Ghana: '\u{1F1EC}\u{1F1ED}',
  Cameroon: '\u{1F1E8}\u{1F1F2}',
  Ireland: '\u{1F1EE}\u{1F1EA}',
  Irish: '\u{1F1EE}\u{1F1EA}',
  Austria: '\u{1F1E6}\u{1F1F9}',
  Serbia: '\u{1F1F7}\u{1F1F8}',
  Turkey: '\u{1F1F9}\u{1F1F7}',
  Russia: '\u{1F1F7}\u{1F1FA}',
  Iceland: '\u{1F1EE}\u{1F1F8}',
  Finland: '\u{1F1EB}\u{1F1EE}',
  'Czech Republic': '\u{1F1E8}\u{1F1FF}',
  Slovakia: '\u{1F1F8}\u{1F1F0}',
  Bulgaria: '\u{1F1E7}\u{1F1EC}',
  Australia: '\u{1F1E6}\u{1F1FA}',
  Canada: '\u{1F1E8}\u{1F1E6}',
  Peru: '\u{1F1F5}\u{1F1EA}',
  Ecuador: '\u{1F1EA}\u{1F1E8}',
  Paraguay: '\u{1F1F5}\u{1F1FE}',
  'Ivory Coast': '\u{1F1E8}\u{1F1EE}',
  Mali: '\u{1F1F2}\u{1F1F1}',
  Algeria: '\u{1F1E9}\u{1F1FF}',
  'South Africa': '\u{1F1FF}\u{1F1E6}',
  Jamaica: '\u{1F1EF}\u{1F1F2}',
  Georgia: '\u{1F1EC}\u{1F1EA}',
  Israel: '\u{1F1EE}\u{1F1F1}',
  'New Zealand': '\u{1F1F3}\u{1F1FF}',
  Estonia: '\u{1F1EA}\u{1F1EA}',
  Latvia: '\u{1F1F1}\u{1F1FB}',
  Benin: '\u{1F1E7}\u{1F1EF}',
  'DR Congo': '\u{1F1E8}\u{1F1E9}',
  'Costa Rica': '\u{1F1E8}\u{1F1F7}',
  'Northern Ireland': '\u{1F3F4}\u{E0067}\u{E0062}\u{E006E}\u{E0069}\u{E0072}\u{E007F}',
  'Trinidad & Tobago': '\u{1F1F9}\u{1F1F9}',
  Bermuda: '\u{1F1E7}\u{1F1F2}',
};

/** Returns a flag emoji for the nation, or null if we should fall back to a code. */
export function nationFlag(nation?: string): string | null {
  if (!nation) return null;
  return NATION_FLAG[nation] ?? null;
}

/** Short uppercase code for nations without a mapped flag (e.g. "SPA/BRA" → "SPA"). */
export function nationCode(nation?: string): string {
  if (!nation) return '';
  const first = nation.split('/')[0].trim();
  const letters = first.replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 3).toUpperCase();
}

/** Display surname (last token of the name). */
export function lastName(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1];
}

/**
 * "Where a player can operate" — the set of pitch positions whose formation slots
 * accept a card of position P. This is the inverse of run.ts's
 * SLOT_ELIGIBLE_POSITIONS, collapsed onto pitch-position labels and frozen here so
 * the card layer stays self-contained (no import of run/economy logic). Used by
 * CardModal to show eligible positions as small chips. The card's own position is
 * always first.
 */
export const ELIGIBLE_POSITIONS: Record<string, string[]> = {
  GK: ['GK'],
  CD: ['CD', 'DM', 'CM'],
  WD: ['WD', 'WM'],
  DM: ['DM', 'CM', 'CD'],
  CM: ['CM', 'DM', 'AM'],
  WM: ['WM', 'WD', 'WF'],
  AM: ['AM', 'CM', 'WF', 'CF'],
  WF: ['WF', 'WM', 'AM', 'CF'],
  CF: ['CF', 'AM', 'WF'],
};

/** Eligible operating positions for a card, own position first, de-duplicated. */
export function eligiblePositions(position: string): string[] {
  const list = ELIGIBLE_POSITIONS[position] ?? [position];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [position, ...list]) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/**
 * Fitness pip model. `fitness` is 1–6 (MATCH_ENGINE §3.1); we render it as a small
 * crisp pixel meter. Returns the filled-pip count, total, and a band colour.
 */
export function fitnessMeter(fitness: number): { filled: number; total: number; color: string } {
  const total = 6;
  const filled = Math.max(0, Math.min(total, Math.round(fitness)));
  const color =
    filled >= 5 ? 'var(--success)' : filled >= 3 ? 'var(--gold)' : filled >= 1 ? '#f6b765' : 'var(--danger)';
  return { filled, total, color };
}
