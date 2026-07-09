/**
 * Kickoff Clash — "Pixel Hero" procedural portrait generator + rarity foil tokens.
 *
 * A direct port of the owner's design-handoff logic (`pixA`, `FR`, `fc`, `CONDS`
 * from `Player Card Art Directions.dc.html`, sections 2a/3a). Everything here is
 * code-generated — there are NO image assets. A card's stable id seeds a unique
 * 16-bit half-body portrait, emitted as an SVG of `<rect>`s
 * (`shape-rendering="crispEdges"`) delivered as a `data:image/svg+xml` URI.
 *
 * Same seed ⇒ same portrait forever. Portraits are memoized per seed.
 *
 * Reconciliation stays intact: the FRAME is glass/foil (gradients + glow live on
 * the outer frame), the INTERIOR is crisp pixel art (the portrait renders with
 * `image-rendering: pixelated`, no blur, no soft shadow).
 */

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Hash + PRNG + colour helpers (ported 1:1 from the handoff logic script)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash over a seed string. */
function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** LCG PRNG seeded by a 32-bit int → () => [0,1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function hexBytes(h: string): [number, number, number] {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix hex a→b by t (0–1), returns hex. */
function mix(a: string, b: string, t: number): string {
  const A = hexBytes(a);
  const B = hexBytes(b);
  return '#' + A.map((c, i) => Math.round(c + (B[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

/** Encode an SVG string as a data-URI (escaping the glyphs that break inline styles). */
function svgUri(svg: string): string {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27')
  );
}

function pick<T>(r: () => number, a: readonly T[]): T {
  return a[Math.floor(r() * a.length)];
}

// Rolled-trait palettes (ported).
const SKINS: readonly [string, string, string][] = [
  ['#f6e0c0', '#e6bd8e', '#c09066'],
  ['#eccba0', '#d3a06b', '#a97a4b'],
  ['#c89468', '#a9713f', '#7d4f28'],
  ['#9c6b42', '#7a4e2b', '#54331a'],
  ['#6e4a30', '#4e3220', '#33200f'],
];
const HAIRC: readonly string[] = ['#1c150f', '#43342a', '#6b4a2a', '#c09a3e', '#8a2f22', '#d8d3c8'];
const KITS: readonly [string, string][] = [
  ['#e0332d', '#fbf7ec'],
  ['#2b74e0', '#fbf7ec'],
  ['#7a1f3d', '#8fd0ff'],
  ['#1f9d4f', '#f5d97a'],
  ['#f5a623', '#171310'],
  ['#f2ead6', '#171310'],
  ['#5b2d8a', '#f2ead6'],
  ['#171310', '#e8b23a'],
];

// ---------------------------------------------------------------------------
// pixA — seeded 20×26 half-body pixel bust (ported 1:1 from the handoff)
// ---------------------------------------------------------------------------

function pixA(seedStr: string): string {
  const r = lcg(fnv1a(seedStr));
  const [skinHi, skin, skinSh] = pick(r, SKINS);
  const hairC = pick(r, HAIRC);
  const hairHi = mix(hairC, '#ffffff', 0.18);
  const [kit, kit2] = pick(r, KITS);
  const kitHi = mix(kit, '#ffffff', 0.25);
  const kitSh = mix(kit, '#000000', 0.3);
  const pat = Math.floor(r() * 5);
  const hs = Math.floor(r() * 6);
  const pose = Math.floor(r() * 3);
  const beard = r() < 0.28;

  const R: string[] = [];
  const px = (x: number, y: number, w: number, h: number, c: string) =>
    R.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>');

  // torso + shoulders
  px(3, 15, 14, 11, kit);
  px(2, 16, 1, 7, kit);
  px(17, 16, 1, 7, kitSh);
  if (pat === 1) for (let x = 5; x <= 15; x += 3) px(x, 15, 1, 11, kit2);
  if (pat === 2) for (let y = 17; y <= 25; y += 3) px(3, y, 14, 1, kit2);
  if (pat === 3) for (let i = 0; i < 6; i++) px(3 + i * 2, 14 + i * 2, 2, 2, kit2);
  if (pat === 4) px(3, 15, 7, 11, kit2);
  px(3, 15, 14, 1, kitHi);
  px(3, 25, 14, 1, kitSh);
  px(3, 16, 1, 9, kitHi);
  px(16, 16, 1, 9, kitSh);

  // pose
  if (pose === 0) {
    px(4, 19, 12, 2, kitSh);
    px(4, 19, 12, 1, mix(kit, '#000000', 0.12));
    px(5, 20, 2, 1, skin);
    px(13, 20, 2, 1, skinSh);
  }
  if (pose === 1) {
    px(1, 17, 1, 4, kit);
    px(18, 17, 1, 4, kitSh);
    px(1, 21, 2, 2, skin);
    px(17, 21, 2, 2, skinSh);
  }
  if (pose === 2) {
    px(17, 9, 2, 5, kitSh);
    px(17, 7, 2, 2, skin);
    px(17, 7, 2, 1, skinHi);
  }

  // collar + neck
  px(8, 14, 4, 1, '#fbf7ec');
  px(9, 12, 2, 2, skinSh);

  // head
  px(7, 4, 6, 7, skin);
  px(7, 4, 3, 3, skinHi);
  px(12, 7, 1, 4, skinSh);
  px(8, 10, 4, 1, skinSh);
  px(6, 7, 1, 2, skin);
  px(13, 7, 1, 2, skinSh);

  // face
  px(8, 7, 1, 1, '#14100a');
  px(11, 7, 1, 1, '#14100a');
  px(8, 6, 2, 1, skinSh);
  px(11, 6, 2, 1, skinSh);
  if (beard) px(7, 9, 6, 2, hairC);
  px(9, 9, 2, 1, beard ? '#14100a' : skinSh);

  // hair
  if (hs === 0) {
    px(7, 3, 6, 2, hairC);
    px(7, 3, 3, 1, hairHi);
  }
  if (hs === 1) {
    px(7, 2, 6, 3, hairC);
    px(7, 2, 3, 1, hairHi);
    px(7, 5, 1, 1, hairC);
    px(12, 5, 1, 1, hairC);
  }
  if (hs === 2) {
    px(6, 1, 8, 4, hairC);
    px(6, 1, 4, 1, hairHi);
    px(6, 4, 1, 3, hairC);
    px(13, 4, 1, 3, hairC);
  }
  if (hs === 3) {
    px(7, 3, 6, 2, hairC);
    px(6, 4, 1, 7, hairC);
    px(13, 4, 1, 7, hairC);
    px(7, 3, 3, 1, hairHi);
  }
  if (hs === 4) {
    px(9, 1, 2, 3, hairC);
    px(9, 1, 1, 1, hairHi);
    px(7, 3, 6, 1, hairC);
  }
  if (hs === 5) px(7, 4, 6, 1, kit2);

  return svgUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 26" shape-rendering="crispEdges">' +
      R.join('') +
      '</svg>',
  );
}

// ---------------------------------------------------------------------------
// Public portrait API — memoized per seed
// ---------------------------------------------------------------------------

const _portraitCache = new Map<string, string>();

/** The seeded 16-bit portrait for a card, as a `data:image/svg+xml` URI. Memoized. */
export function portraitDataUri(seed: string | number): string {
  const key = String(seed);
  let uri = _portraitCache.get(key);
  if (uri === undefined) {
    uri = pixA(key);
    _portraitCache.set(key, uri);
  }
  return uri;
}

/** Ready-to-spread background style for a portrait window div. Crisp / pixelated. */
export function portraitBackgroundStyle(seed: string | number): CSSProperties {
  return {
    backgroundImage: `url("${portraitDataUri(seed)}")`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center bottom',
    imageRendering: 'pixelated',
  };
}

// ---------------------------------------------------------------------------
// Rarity foil frames (FR) — the frame material IS the rarity axis on card faces.
// Replaces the border-colour rarity system for these surfaces; the old rarity
// hues (RARITY_COLOR in cardTokens) stay for non-card chrome.
// ---------------------------------------------------------------------------

export interface RarityFrame {
  /** The foil gradient painted on the outer frame (the padding = the border). */
  frame: string;
  /** Stacked box-shadow: card-stock drop + soft ambient + (Epic/Legendary) glow halo. */
  glow: string;
  /** The footer rarity label, e.g. "EPIC · GOLD FOIL". */
  label: string;
  /** Label colour. */
  lc: string;
  /** Legendary earns the animated foil sweep. */
  foil: boolean;
}

const DOT = '·';

export const RARITY_FRAME: Record<string, RarityFrame> = {
  Common: {
    frame: 'linear-gradient(160deg, #3a332a, #26211a)',
    glow: '0 3px 0 0 #0b0703, 0 8px 18px rgba(0,0,0,0.55)',
    label: `COMMON ${DOT} MATTE`,
    lc: '#9aa0a8',
    foil: false,
  },
  Rare: {
    frame: 'linear-gradient(135deg, #f4f6f8, #9ba1ab 25%, #e8ebef 48%, #767c86 72%, #cfd4da)',
    glow: '0 3px 0 0 #0b0703, 0 8px 18px rgba(0,0,0,0.55)',
    label: `RARE ${DOT} SILVER FOIL`,
    lc: '#c8cdd4',
    foil: false,
  },
  Epic: {
    frame: 'linear-gradient(135deg, #ffe9a8, #c08c2c 26%, #f5d97a 50%, #8a5f1a 74%, #e8b23a)',
    glow: '0 3px 0 0 #0b0703, 0 8px 20px rgba(0,0,0,0.6), 0 0 18px rgba(232,178,60,0.35)',
    label: `EPIC ${DOT} GOLD FOIL`,
    lc: '#e8b23a',
    foil: false,
  },
  Legendary: {
    frame:
      'linear-gradient(120deg, #ff9a9a, #ffd36e 18%, #b0ff8a 36%, #7acfff 54%, #c68aff 72%, #ff8acf 88%, #ffd36e)',
    glow: '0 3px 0 0 #0b0703, 0 10px 24px rgba(0,0,0,0.65), 0 0 26px rgba(232,178,60,0.5)',
    label: `LEGENDARY ${DOT} HOLO FOIL`,
    lc: '#ffd36e',
    foil: true,
  },
};

/** Resolve the foil frame for a rarity, defaulting to Common. */
export function rarityFrame(rarity: string | undefined): RarityFrame {
  return RARITY_FRAME[rarity ?? 'Common'] ?? RARITY_FRAME.Common;
}

// The shared inner-face gradient + card-stock ink (ported design tokens).
export const CARD_INK = '#0b0703';
export const CARD_FACE_GRADIENT = 'linear-gradient(165deg, #2f2415, #221a0f 55%, #120d07)';

// Design-token palette used across the Pixel Hero face (single source of truth).
export const HERO = {
  ink: '#0b0703',
  faceGradient: CARD_FACE_GRADIENT,
  gold: '#e8b23a',
  goldHi: '#f5d97a',
  goldLo: '#c08c2c',
  goldDeep: '#8a5f1a',
  cream: '#f2ead6',
  creamBody: '#c9bb95',
  creamMuted: '#9a8b6a',
  badgeText: '#fbf7ec',
  atk: '#e0332d',
  def: '#2b74e0',
  defLight: '#6fa3ef',
  roleBand: 'linear-gradient(90deg, #c08c2c, #e8b23a 30%, #f5d97a 50%, #e8b23a 70%, #c08c2c)',
  roleBandMini: 'linear-gradient(90deg, #c08c2c, #e8b23a 50%, #c08c2c)',
} as const;

// ---------------------------------------------------------------------------
// Fitness colour band (fc) + condition/wear system (CONDS) — ported.
// ---------------------------------------------------------------------------

/** Fitness (0–100) → band colour: green ≥75, amber ≥50, else red. */
export function fitnessColor(f: number): string {
  return f >= 75 ? '#1f9d4f' : f >= 50 ? '#e8b23a' : '#e0332d';
}

function cornerWear(s1: number, s2: number): string {
  return (
    'radial-gradient(' + s1 + 'px ' + s1 + 'px at 100% 100%, rgba(242,234,214,0.22), transparent 70%), ' +
    'radial-gradient(' + s2 + 'px ' + s2 + 'px at 0% 100%, rgba(242,234,214,0.16), transparent 70%), ' +
    'radial-gradient(' + s2 + 'px ' + s2 + 'px at 100% 0%, rgba(242,234,214,0.12), transparent 70%)'
  );
}

function crease(pos: number): string {
  return (
    'linear-gradient(115deg, transparent ' +
    (pos - 1.5) +
    '%, rgba(242,234,214,0.18) ' +
    pos +
    '%, transparent ' +
    (pos + 1.5) +
    '%)'
  );
}

export type ConditionGrade = 'MINT' | 'PLAYED' | 'WORN' | 'CREASED' | 'TORN';

export interface ConditionRecipe {
  label: ConditionGrade;
  /** Chip / label colour. */
  cc: string;
  /** Start-of-match fitness penalty copy, e.g. "-15 FIT". */
  pen: string;
  /** The wear overlay `background` (drawn on the face, pointer-events none). */
  wearBg: string;
  /** clip-path for a torn corner ("none" otherwise). */
  clip: string;
  /** face filter ("none" otherwise). */
  filt: string;
  /** "flex" to draw the DESTROYED stamp; "none" otherwise. */
  stampDisp: string;
}

export const CONDITIONS: ConditionRecipe[] = [
  { label: 'MINT', cc: '#1f9d4f', pen: 'FULL FIT', wearBg: 'none', clip: 'none', filt: 'none', stampDisp: 'none' },
  { label: 'PLAYED', cc: '#c9bb95', pen: '-5 FIT', wearBg: cornerWear(18, 12), clip: 'none', filt: 'none', stampDisp: 'none' },
  {
    label: 'WORN',
    cc: '#e8b23a',
    pen: '-15 FIT',
    wearBg: cornerWear(26, 18) + ', ' + crease(60),
    clip: 'none',
    filt: 'none',
    stampDisp: 'none',
  },
  {
    label: 'CREASED',
    cc: '#e0332d',
    pen: '-30 FIT',
    wearBg: cornerWear(34, 24) + ', ' + crease(38) + ', ' + crease(72),
    clip: 'none',
    filt: 'brightness(0.92)',
    stampDisp: 'none',
  },
  {
    label: 'TORN',
    cc: '#e0332d',
    pen: 'DESTROYED',
    wearBg: cornerWear(40, 30) + ', ' + crease(30) + ', ' + crease(55) + ', ' + crease(80),
    clip: 'polygon(0 0, 80% 0, 100% 12%, 100% 100%, 0 100%)',
    filt: 'grayscale(0.75) brightness(0.75)',
    stampDisp: 'flex',
  },
];

const CONDITION_BY_LABEL: Record<string, ConditionRecipe> = Object.fromEntries(
  CONDITIONS.map((c) => [c.label, c]),
);

/** Resolve a condition recipe by grade, defaulting to MINT. */
export function conditionRecipe(grade: string | undefined): ConditionRecipe {
  return CONDITION_BY_LABEL[grade ?? 'MINT'] ?? CONDITION_BY_LABEL.MINT;
}

/** The wear glyph prefix on the condition chip. */
export const WEAR_GLYPH = '◢'; // ◢
