/**
 * Kickoff Clash — CONTEST MAP (display legibility layer).
 *
 * The six-contest partition, but answered for a card OUT of a formation slot —
 * so a card face in the collection, the shop, or a manager/tactic tile can show
 * which of the six contests it helps with. This mirrors `contestTotals` /
 * the `feedsX` predicates in contests.ts, but derives a card's band from its
 * POSITION (there is no slot here) rather than the live formation cell.
 *
 * It is a DISPLAY approximation — the live engine still scores off the real
 * slot band. Kept deliberately close to the predicates so the icons never lie
 * about the direction of a card's contribution.
 */

import type { Card } from './scoring';
import { laneOfCard } from './funnel';

export type ContestKey = 'keep' | 'create' | 'finish' | 'press' | 'break' | 'stop';

/** Canonical render order: the attacking three, then the defensive three. */
export const CONTEST_ORDER: ContestKey[] = ['keep', 'create', 'finish', 'press', 'break', 'stop'];

export interface ContestMeta {
  key: ContestKey;
  label: string;              // KEEP / CREATE / …
  glyph: string;              // single-letter pixel token
  blurb: string;              // one-line "what this contest is"
  side: 'attack' | 'defence'; // colour family
}

/** The six contests as display data. Colours are owned by the card surfaces
 *  (cardTokens `CONTEST_ICON`); this is the neutral source of truth for the
 *  label / glyph / blurb so every surface agrees. */
export const CONTEST_META: Record<ContestKey, ContestMeta> = {
  keep:   { key: 'keep',   label: 'KEEP',   glyph: 'K', side: 'attack',  blurb: 'Keeps the ball — wins possession.' },
  create: { key: 'create', label: 'CREATE', glyph: 'C', side: 'attack',  blurb: 'Makes chances.' },
  finish: { key: 'finish', label: 'FINISH', glyph: 'F', side: 'attack',  blurb: 'Puts chances away.' },
  press:  { key: 'press',  label: 'PRESS',  glyph: 'P', side: 'defence', blurb: 'Wins the ball back high.' },
  break:  { key: 'break',  label: 'BREAK',  glyph: 'B', side: 'defence', blurb: 'Breaks up play in midfield.' },
  stop:   { key: 'stop',   label: 'STOP',   glyph: 'S', side: 'defence', blurb: 'Stops the shot — the last line.' },
};

// ---------------------------------------------------------------------------
// Player card → contests
// ---------------------------------------------------------------------------

/** A card's natural band from its position code (no formation slot here). The
 *  live engine uses the slot cell (field.ts cellOf); this is the collection-view
 *  stand-in and lines up with where each position sits on the pitch. */
const POSITION_BAND: Record<string, 'ATT' | 'MID' | 'DEF'> = {
  GK: 'DEF', CD: 'DEF', WD: 'DEF',
  DM: 'MID', CM: 'MID', WM: 'MID',
  AM: 'ATT', WF: 'ATT', CF: 'ATT',
};

const KEEP_ARCH = new Set(['Controller', 'Passer', 'Engine']);
const CREATE_ARCH = new Set(['Creator', 'Dribbler', 'Sprinter']);

function bandOfCard(card: Pick<Card, 'position'>): 'ATT' | 'MID' | 'DEF' {
  return POSITION_BAND[card.position] ?? 'MID';
}

/** Which contests a player card feeds — mirrors the `feedsX` predicates, band
 *  taken from position. Returned in CONTEST_ORDER. */
export function contestsForCard(card: Pick<Card, 'archetype' | 'position'>): ContestKey[] {
  const band = bandOfCard(card);
  const set = new Set<ContestKey>();
  if (KEEP_ARCH.has(card.archetype)) set.add('keep');
  if (band === 'ATT' || card.archetype === 'Engine') set.add('press');
  if (CREATE_ARCH.has(card.archetype) || band === 'ATT') set.add('create');
  if (band === 'MID') set.add('break');
  if (band === 'DEF') set.add('stop');
  if (laneOfCard(card) === 'finishing') set.add('finish');
  return CONTEST_ORDER.filter((k) => set.has(k));
}

// ---------------------------------------------------------------------------
// Manager card → contests  (only the reworked, contest-targeted managers name a
// contest; the identity managers — Gambler / Youth Dev / Hairdryer / Chemistry
// Set — return none, so their tiles simply omit the contest row.)
// ---------------------------------------------------------------------------

export const MANAGER_CONTESTS: Record<string, ContestKey[]> = {
  the_professor: ['keep'],   // Émile Roux  → +KEEP
  the_dinosaur: ['finish'],  // Roy Tanner  → +FINISH
  the_mourinho: ['stop'],    // Aurélio Sá  → +STOP
  scouts_eye: ['press'],     // Dieter Falk → +PRESS
};

export function contestsForManager(jokerId: string): ContestKey[] {
  return MANAGER_CONTESTS[jokerId] ?? [];
}

// ---------------------------------------------------------------------------
// Tactic card → contests  (only the contests a call RAISES; a downside like a
// High Line's −STOP is not listed — the icons say what the play helps.)
// ---------------------------------------------------------------------------

export const TACTIC_CONTESTS: Record<string, ContestKey[]> = {
  high_line: ['create'],
  wing_play: ['create'],
  possession: ['keep'],
  counter_attack: ['finish'],
  overload_left: ['create'],
  overload_right: ['create'],
  fortress: ['stop'],
  low_block: ['stop', 'finish'],
  sit_deep: ['stop', 'finish'],
  man_marking: ['break'],
  narrow: ['break'],
  press_high: ['press'],
  gegenpress: ['press'],
  set_piece: ['finish'],
  route_one: ['finish'],
  // dark_arts (debuffs the enemy) and youth_policy (whole XI +1/+1) touch no
  // single contest — no icons.
};

export function contestsForTactic(tacticId: string): ContestKey[] {
  const raw = TACTIC_CONTESTS[tacticId] ?? [];
  return CONTEST_ORDER.filter((k) => raw.includes(k));
}
