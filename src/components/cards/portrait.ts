/**
 * Kickoff Clash — "Pixel Hero" procedural portrait generator + rarity foil tokens.
 *
 * A direct port of the owner's v3 design-handoff logic (`pix5c`, `FR`, `fc`,
 * `CONDS`, `THEME`, `PITCH` from `Player Card Art Directions.dc.html`, the
 * locked Turn-7 section). Everything here is code-generated — there are NO image
 * assets. A card's stable id seeds a unique face-first pixel bust, drawn on a
 * 40×50 grid and emitted as an SVG of `<rect>`s (`shape-rendering="crispEdges"`)
 * delivered as a `data:image/svg+xml` URI.
 *
 * `pix5c(seedStr, opts)` is a close-up bust: the kit/attire is minimal so all the
 * variation lives in the FACE (5 complexions, 3 face widths, 3 jaw shapes, 9
 * hairstyles × 3 hairlines, 6 beard styles, 3 eye/nose/brow shapes, iris colour,
 * plus low-probability freckles/scar/monobrow/age-lines/grey). `opts.suit` swaps
 * the football kit for a blazer + shirt + tie (manager portraits); `opts.kit` is
 * the shared club colour so a squad reads as one team.
 *
 * Same seed (+opts) ⇒ same portrait forever. Portraits are memoized.
 *
 * Reconciliation stays intact: the FRAME is glass/foil (gradients + glow live on
 * the outer frame), the INTERIOR is crisp pixel art (the portrait renders with
 * `image-rendering: pixelated`, no blur, no soft shadow).
 */

import type { CSSProperties } from 'react';
import portraitManifest from '../../../public/portraits/manifest.json';
import portraitPool from '../../../public/portraits/pool.json';

// ---------------------------------------------------------------------------
// REAL-PORTRAIT resolver (design_handoff_player_cards). The card chassis is
// portrait-READY. Faces come from two layers, manifest wins:
//
//  1. MANIFEST override (`public/portraits/manifest.json`) — a flat `{key:file}`
//     map to PIN a specific face to a specific card. Player keys are the slug
//     (lower-cased surname, punctuation stripped); manager keys are `mgr-{id}`.
//     Ships EMPTY — it's the curation hook.
//  2. POOL assignment (`public/portraits/pool.json`) — the sliced sheet faces
//     (players[] / managers[]). The card art has no authored name→face mapping,
//     so each card is assigned a STABLE face from the pool by its id (a card
//     always shows the same face; faces repeat across the 540-card deck). To
//     re-point one card, add a manifest entry.
//
// If both layers are empty/missing, the portrait window falls back — cleanly —
// to the procedural pixel bust below (and again on <img> onError). Regenerate
// the pool with scripts/slice-portraits.mjs after dropping new sheets.
// ---------------------------------------------------------------------------

const PORTRAIT_MANIFEST = portraitManifest as Record<string, string>;
const PLAYER_POOL = (portraitPool as { players: string[]; managers: string[] }).players ?? [];
const MANAGER_POOL = (portraitPool as { players: string[]; managers: string[] }).managers ?? [];

// Assets are served under the deploy basePath (see next.config.ts). A raw <img>
// src is NOT auto-prefixed (only next/image is), so we prefix it here.
const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '/kickoff-clash';

/** A card's portrait slug — the lower-cased surname, punctuation stripped. */
export function portraitSlug(name: string): string {
  const parts = name.trim().split(/\s+/);
  const surname = parts[parts.length - 1] || name;
  return surname.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Deterministic string → 32-bit hash (FNV-1a), for stable pool assignment. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Resolve a player's real-portrait URL: manifest override, else a stable pool
 *  face keyed off the card id, else null (→ procedural fallback). */
export function portraitSrc(card: { id?: number | string; name: string }): string | null {
  const pinned = PORTRAIT_MANIFEST[portraitSlug(card.name)];
  if (pinned) return `${ASSET_BASE}/portraits/players/${pinned}`;
  if (!PLAYER_POOL.length) return null;
  const key = card.id != null ? String(card.id) : card.name;
  const file = PLAYER_POOL[hashString(key) % PLAYER_POOL.length];
  return `${ASSET_BASE}/portraits/players/${file}`;
}

/** Resolve a manager's real-portrait URL: manifest override, else a stable pool
 *  face keyed off the manager id, else null (→ procedural fallback). */
export function managerPortraitSrc(id: string): string | null {
  const pinned = PORTRAIT_MANIFEST[`mgr-${id}`] ?? PORTRAIT_MANIFEST[id];
  if (pinned) return `${ASSET_BASE}/portraits/managers/${pinned}`;
  if (!MANAGER_POOL.length) return null;
  const file = MANAGER_POOL[hashString(id) % MANAGER_POOL.length];
  return `${ASSET_BASE}/portraits/managers/${file}`;
}

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

// Rolled-trait palettes (ported from the v3 handoff `pix5c`).
const SKINS: readonly [string, string, string][] = [
  ['#f6e0c0', '#e6bd8e', '#c09066'],
  ['#eccba0', '#d3a06b', '#a97a4b'],
  ['#c89468', '#a9713f', '#7d4f28'],
  ['#9c6b42', '#7a4e2b', '#54331a'],
  ['#6e4a30', '#4e3220', '#33200f'],
];
const HAIRC: readonly string[] = ['#1c150f', '#43342a', '#6b4a2a', '#c09a3e', '#8a2f22', '#d8d3c8'];
const IRIS5: readonly string[] = ['#3a2a1c', '#5b3a1e', '#2b74e0', '#4a7bb5', '#3f7a4a', '#6b6f52', '#1c150f'];
const PORTRAIT_INK = '#14100a';

/** The default shared club colour for player kits (a squad reads as one team). */
export const DEFAULT_KIT = '#e0332d';

export interface PortraitOpts {
  /** Draw a blazer + shirt + tie instead of a football kit (manager portraits). */
  suit?: boolean;
  /** Shared club colour for the kit (players only). Defaults to DEFAULT_KIT. */
  kit?: string;
}

// ---------------------------------------------------------------------------
// pix5c — seeded 40×50 face-first pixel bust (ported 1:1 from the v3 handoff).
// The kit/attire is deliberately minimal so all the variation lives in the face.
// ---------------------------------------------------------------------------

function pix5c(seedStr: string, opts?: PortraitOpts): string {
  const r = lcg(fnv1a(seedStr));
  const F = Math.floor;
  const suit = !!opts?.suit;
  const kitClub = opts?.kit ?? DEFAULT_KIT;
  const INK = PORTRAIT_INK;

  const SK = pick(r, SKINS);
  const skinHi = mix(SK[0], '#ffffff', 0.05);
  const skin = SK[1];
  const skinSh = SK[2];
  const skinDk = mix(skinSh, '#000000', 0.28);
  const skinRim = mix(skin, '#f5d97a', 0.42);
  const hairC0 = pick(r, HAIRC);
  const kit = kitClub;
  const kl = hexBytes(kit);
  const lum = kl[0] * 0.3 + kl[1] * 0.6 + kl[2] * 0.1;
  const kitHi = mix(kit, '#ffffff', 0.26);
  const kitSh = mix(kit, '#000000', 0.3);
  const collar = lum > 150 ? INK : '#fbf7ec';

  // face variation axes (all seeded)
  const faceW = F(r() * 3);
  const halfW = [9, 10, 11][faceW];
  const jaw = F(r() * 3);
  const hs = F(r() * 9);
  const hl = F(r() * 3);
  const fh = F(r() * 6);
  const mo = F(r() * 4);
  const eyeShape = F(r() * 3);
  const noseW = F(r() * 3);
  const browT = F(r() * 3);
  const iris = pick(r, IRIS5);
  const age = r();
  const grey = age > 0.82;
  const freckles = r() < 0.22;
  const scar = r() < 0.14;
  const monobrow = r() < 0.08;
  const HC = grey ? mix(hairC0, '#d8d3c8', 0.55) : hairC0;
  const HH = mix(HC, '#ffffff', 0.26);
  const HS = mix(HC, '#000000', 0.34);

  const Q: string[] = [];
  const px = (x: number, y: number, w: number, h: number, c: string) =>
    Q.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>');
  const dot = (x: number, y: number, c: string) => px(x, y, 1, 1, c);
  const dith = (x: number, y: number, w: number, h: number, c: string) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) if (((xx + yy) & 1) === 0) px(xx, yy, 1, 1, c);
  };
  const cx = 20; // face centre

  // ---- shoulders: football kit, or a tailored suit for managers ----
  if (suit) {
    const suitC = '#26272e';
    const suitHi = mix(suitC, '#ffffff', 0.16);
    const suitSh = mix(suitC, '#000000', 0.45);
    const shirt = '#ece9e0';
    const shirtSh = mix(shirt, '#000000', 0.14);
    const tie = ['#7a1f2b', '#1f3a6b', '#4a1f5b', '#20222a', '#5a4a1f'][fnv1a(seedStr) % 5];
    px(0, 44, 40, 6, suitC);
    px(3, 42, 34, 2, suitC);
    px(8, 41, 24, 1, suitC);
    px(0, 44, 40, 1, suitHi);
    px(0, 48, 40, 2, suitSh);
    px(0, 44, 2, 6, suitHi);
    px(38, 44, 2, 6, suitSh);
    dith(4, 47, 32, 3, suitSh);
    px(cx - 4, 41, 8, 9, shirt);
    px(cx - 4, 41, 8, 1, shirtSh);
    px(cx - 6, 41, 3, 9, suitC);
    px(cx + 3, 41, 3, 9, suitC);
    px(cx - 3, 43, 2, 7, suitC);
    px(cx + 1, 43, 2, 7, suitC);
    px(cx - 6, 41, 1, 9, suitHi);
    px(cx + 5, 41, 1, 9, suitSh);
    px(cx - 4, 40, 3, 2, shirt);
    px(cx + 1, 40, 3, 2, shirt);
    px(cx - 4, 40, 1, 2, shirtSh);
    px(cx - 1, 41, 2, 1, mix(tie, '#000000', 0.22));
    px(cx - 1, 42, 2, 8, tie);
    px(cx - 1, 42, 1, 8, mix(tie, '#ffffff', 0.22));
    px(cx, 42, 1, 8, mix(tie, '#000000', 0.16));
  } else {
    px(0, 44, 40, 6, kit);
    px(3, 42, 34, 2, kit);
    px(8, 41, 24, 1, kit);
    px(0, 44, 40, 1, kitHi);
    px(0, 48, 40, 2, kitSh);
    px(0, 44, 2, 6, kitHi);
    px(38, 44, 2, 6, kitSh);
    dith(4, 47, 32, 3, kitSh);
    px(cx - 5, 41, 10, 2, collar);
    px(cx - 4, 43, 3, 2, collar);
    px(cx + 1, 43, 3, 2, collar);
  }

  // ---- neck ----
  px(cx - 4, 34, 8, 8, skin);
  px(cx - 4, 34, 2, 8, skinHi);
  px(cx + 2, 34, 2, 8, skinSh);
  px(cx - 4, 40, 8, 2, skinDk);
  dith(cx - 3, 37, 6, 3, skinSh);

  // ---- head base: oval built from row spans ----
  const L = cx - halfW;
  const Rr = cx + halfW;
  px(L + 2, 4, Rr - L - 4, 2, skin);
  px(L + 1, 6, Rr - L - 2, 2, skin);
  px(L, 8, Rr - L, 18, skin);
  if (jaw === 0) {
    px(L + 1, 26, Rr - L - 2, 3, skin);
    px(L + 3, 29, Rr - L - 6, 2, skin);
    px(cx - 2, 31, 4, 2, skin);
  }
  if (jaw === 1) {
    px(L + 1, 26, Rr - L - 2, 3, skin);
    px(L + 2, 29, Rr - L - 4, 2, skin);
    px(cx - 3, 31, 6, 2, skin);
  }
  if (jaw === 2) {
    px(L, 26, Rr - L, 4, skin);
    px(L + 1, 30, Rr - L - 2, 2, skin);
  }
  // shading: rim light left, shade right, cheekbone dither
  px(L, 8, 2, 18, skinRim);
  px(L + 2, 8, 2, 14, skinHi);
  px(Rr - 2, 8, 2, 18, skinSh);
  dith(Rr - 5, 10, 3, 16, skinSh);
  px(Rr - 1, 10, 1, 14, skinDk);
  dith(L + 3, 22, 4, 4, skinHi);
  px(L + 2, 30, Rr - L - 4, 1, skinSh);
  dith(L + 3, 28, Rr - L - 6, 2, skinSh);

  // ---- ears ----
  px(L - 2, 16, 2, 6, skin);
  px(L - 2, 18, 1, 3, skinSh);
  dot(L - 1, 19, skinDk);
  px(Rr, 16, 2, 6, skinSh);
  px(Rr + 1, 18, 1, 3, skinDk);

  // ---- eyebrows ----
  const bY = 14;
  const blX = L + 2;
  const brX = Rr - 8;
  const brow = (bx: number) => {
    if (browT === 0) px(bx, bY, 6, 1, HS);
    if (browT === 1) {
      px(bx, bY, 6, 2, HS);
      px(bx, bY - 1, 3, 1, HS);
    }
    if (browT === 2) {
      px(bx, bY + 1, 6, 1, HS);
      px(bx + 4, bY, 2, 1, HS);
    }
  };
  brow(blX);
  brow(brX);
  if (monobrow) px(blX + 6, bY, brX - blX - 6, 1, HS);

  // ---- eyes ----
  const eY = 16;
  const elX = L + 2;
  const erX = Rr - 8;
  const eye = (ex: number) => {
    px(ex, eY, 6, 3, '#fbf7ec');
    if (eyeShape === 1) {
      px(ex, eY, 1, 3, skinSh);
      px(ex + 5, eY, 1, 3, skinSh);
    }
    if (eyeShape === 2) {
      px(ex, eY - 1, 6, 1, skin);
      px(ex + 1, eY, 4, 3, '#fbf7ec');
    }
    px(ex + 2, eY, 2, 3, iris);
    px(ex + 2, eY, 1, 3, mix(iris, '#000000', 0.3));
    px(ex + 2, eY, 1, 1, mix(iris, '#ffffff', 0.5));
    px(ex + 3, eY + 1, 1, 1, INK);
    px(ex, eY + 3, 6, 1, skinSh);
    px(ex - 1, eY - 1, 1, 1, skinDk);
  };
  eye(elX);
  eye(erX);

  // ---- nose ----
  const nTop = 15;
  const nw = [0, 1, 1][noseW];
  px(cx - 1, nTop, 1, 6, mix(skin, '#ffffff', 0.16));
  px(cx, nTop, 1, 7, skinSh);
  px(cx, nTop + 6, 1, 1, skinDk);
  px(cx - 2 - nw, 21, 4 + nw * 2, 1, skinSh);
  px(cx - 2 - nw, 21, 1, 1, skinDk);
  px(cx + 1 + nw, 21, 1, 1, skinDk);
  dot(cx - 1, 22, mix(skin, '#ffffff', 0.14));

  // ---- cheeks / freckles / scar ----
  dith(L + 2, 21, 3, 3, mix(skin, '#e0332d', 0.13));
  dith(Rr - 5, 21, 3, 3, mix(skin, '#e0332d', 0.1));
  if (freckles) {
    const fk = mix(skin, '#7d4f28', 0.5);
    dot(L + 3, 22, fk);
    dot(L + 5, 23, fk);
    dot(Rr - 5, 22, fk);
    dot(Rr - 4, 24, fk);
    dot(cx - 3, 23, fk);
    dot(cx + 3, 23, fk);
  }
  if (scar) px(Rr - 6, 11, 1, 4, mix(skin, '#a9713f', 0.6));

  // ---- age lines ----
  if (age > 0.6) {
    px(L + 3, 12, 4, 1, skinSh);
    px(Rr - 7, 12, 4, 1, skinSh);
    px(cx - 3, 25, 2, 1, skinSh);
    px(cx + 2, 25, 2, 1, skinSh);
  }

  // ---- mouth ----
  const mY = 26;
  const mL = cx - 4;
  const mW = 8;
  if (mo === 0) {
    px(mL, mY, mW, 1, '#5a2a1c');
    px(mL + 1, mY + 1, mW - 2, 1, mix(skin, '#5a2a1c', 0.4));
  }
  if (mo === 1) {
    dot(mL - 1, mY - 1, '#5a2a1c');
    dot(mL + mW, mY - 1, '#5a2a1c');
    px(mL, mY, mW, 1, '#5a2a1c');
    px(mL + 1, mY + 1, mW - 2, 1, mix(skin, '#5a2a1c', 0.4));
  }
  if (mo === 2) {
    px(mL, mY, mW, 2, '#3a1a12');
    px(mL + 1, mY, mW - 2, 1, '#fbf7ec');
  }
  if (mo === 3) {
    dot(mL - 1, mY, '#5a2a1c');
    dot(mL + mW, mY, '#5a2a1c');
    px(mL, mY + 1, mW, 1, '#5a2a1c');
  }

  // ---- facial hair ----
  const stub = mix(skin, HC, 0.42);
  if (fh === 1) {
    dith(L, 23, 3, 9, stub);
    dith(Rr - 3, 23, 3, 9, stub);
    dith(L + 2, 29, Rr - L - 4, 3, stub);
    dith(mL, mY - 1, mW, 1, stub);
  }
  if (fh === 2) {
    px(L, 21, 3, 12, HC);
    px(Rr - 3, 21, 3, 12, HC);
    px(L + 2, 30, Rr - L - 4, 3, HC);
    px(mL, mY - 1, mW, 1, HC);
    px(L, 21, 1, 6, HS);
    dith(L + 1, 22, 2, 4, HH);
  }
  if (fh === 3) {
    px(cx - 4, 24, 8, 2, HC);
    px(cx - 3, 23, 6, 1, HC);
  }
  if (fh === 4) {
    px(mL - 1, mY - 1, mW + 2, 2, HC);
    px(cx - 2, 30, 4, 3, HC);
  }
  if (fh === 5) {
    px(L, 20, 2, 13, HC);
    px(Rr - 2, 20, 2, 13, HC);
    px(L + 2, 31, Rr - L - 4, 2, HC);
  }

  // ---- hair + hairline ----
  const top = 2 + hl;
  if (hs === 0) {
    px(L, top, Rr - L, 5 - hl, HC);
    px(L, top, F((Rr - L) / 2), 1, HH);
    px(L, top + 4, 2, 4, HC);
    px(Rr - 2, top + 4, 2, 4, HC);
    dith(L + 2, top + 1, Rr - L - 4, 2, HS);
  }
  if (hs === 1) px(L + 1, top + 1, Rr - L - 2, 3 - hl, mix(skin, HC, 0.5));
  if (hs === 2) {
    px(L - 1, 1, Rr - L + 2, 7, HC);
    px(L - 1, 1, F((Rr - L) / 2), 1, HH);
    px(L - 1, 8, 2, 5, HC);
    px(Rr - 1, 8, 2, 5, HC);
    dith(L, 2, Rr - L, 4, HS);
  }
  if (hs === 3) {
    px(L, top, Rr - L, 4, HC);
    px(L - 1, top, 2, 22, HC);
    px(Rr - 1, top, 2, 22, HC);
    px(L, top, F((Rr - L) / 2), 1, HH);
  }
  if (hs === 4) {
    px(cx - 3, 0, 6, 5, HC);
    px(cx - 3, 0, 3, 1, HH);
    px(L, top + 1, Rr - L, 2, mix(skin, HC, 0.5));
  }
  if (hs === 5) {
    px(L - 1, 0, Rr - L + 2, 8, HC);
    px(L - 1, 8, 3, 6, HC);
    px(Rr - 2, 8, 3, 6, HC);
    px(L, 1, F((Rr - L) / 2), 1, HH);
    dith(L, 2, Rr - L, 5, HS);
  }
  if (hs === 6) {
    px(L + 2, top, Rr - L - 4, 1, HC);
    px(L + 1, top, 3, 3, HC);
    px(Rr - 4, top, 3, 3, HC);
  }
  if (hs === 7) {
    px(L, top + 1, Rr - L, 2, mix(skin, HC, 0.6));
    px(L, top, 3, 1, HC);
    px(Rr - 3, top, 3, 1, HC);
  }
  if (hs === 8) {
    px(L, top, Rr - L, 3, HC);
    for (let x = L; x < Rr; x += 2) px(x, top + 3, 1, 2, HC);
    px(L, top, F((Rr - L) / 2), 1, HH);
  }

  return svgUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50" shape-rendering="crispEdges">' +
      Q.join('') +
      '</svg>',
  );
}

// ---------------------------------------------------------------------------
// Public portrait API — memoized per (seed, opts)
// ---------------------------------------------------------------------------

const _portraitCache = new Map<string, string>();

/** The seeded pixel portrait for a card, as a `data:image/svg+xml` URI. Memoized
 *  by seed + attire (suit) + kit colour, so the same inputs always agree. */
export function portraitDataUri(seed: string | number, opts?: PortraitOpts): string {
  const key = `${seed}|${opts?.suit ? 's' : 'p'}|${opts?.kit ?? DEFAULT_KIT}`;
  let uri = _portraitCache.get(key);
  if (uri === undefined) {
    uri = pix5c(String(seed), opts);
    _portraitCache.set(key, uri);
  }
  return uri;
}

/** Ready-to-spread background style for a portrait window div. Crisp / pixelated.
 *  Legacy call sites (match pitch, lineup) use `contain`; the v3 card face uses
 *  `portraitArtStyle` below for the inset:0, full-bleed close-up bust. */
export function portraitBackgroundStyle(seed: string | number, opts?: PortraitOpts): CSSProperties {
  return {
    backgroundImage: `url("${portraitDataUri(seed, opts)}")`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center bottom',
    imageRendering: 'pixelated',
  };
}

/** The v3 card-face art layer: the bust sits `inset:0`, bottom-anchored, sized to
 *  ~98% of the region height (a close-up that fills the art window). Pixelated. */
export function portraitArtStyle(seed: string | number, opts?: PortraitOpts): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url("${portraitDataUri(seed, opts)}")`,
    backgroundSize: 'auto 98%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center bottom',
    imageRendering: 'pixelated',
  };
}

// ---------------------------------------------------------------------------
// Card-face backgrounds (ported from the v3 handoff PITCH map + class surfaces).
// The pitch is PLAYER-ONLY — the at-a-glance class tell. Managers sit on aged
// leather, tactics on a dark tactical board.
// ---------------------------------------------------------------------------

/** Player art background — the LOCKED "stadium horizon": grass across the lower
 *  half, a dark stand + amber floodlight glow above so the head reads on the sky. */
export const PLAYER_PITCH_BG =
  'radial-gradient(78% 58% at 50% 2%, rgba(232,178,60,0.55), transparent 44%), ' +
  'linear-gradient(180deg, #15231a 0%, #21472d 40%, #3f9a58 62%, #49ae65 100%)';

/** Manager art background — aged leather. */
export const MANAGER_LEATHER_BG =
  'radial-gradient(100% 80% at 50% 22%, rgba(232,178,60,0.22), transparent 66%), ' +
  'linear-gradient(165deg, #3a2c19, #201810)';

/** Tactic art background — a dark tactical board (blue-tinted glow). */
export const TACTIC_BOARD_BG =
  'radial-gradient(90% 80% at 50% 34%, rgba(61,123,214,0.28), transparent 64%), ' +
  'linear-gradient(165deg, #24303f, #14100a)';

/** The soft ground-shadow ellipse the bust stands on. */
export const GROUND_SHADOW_BG =
  'radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.42), transparent 72%)';

/** Name band + meta strip + effect-block surfaces (ported tokens). */
export const NAME_BAND_BG = 'linear-gradient(180deg, #241c10, #171207)';
export const META_STRIP_BG = 'linear-gradient(180deg, #1c1610, #120d07)';
export const EFFECT_BLOCK_BG = '#120d07';
export const INNER_INK = '#0b0703';

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
