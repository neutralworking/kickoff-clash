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

// ---------------------------------------------------------------------------
// PLAYER CLASS — the v4 squad-screen "class gem" taxonomy (Creator / Finisher /
// Destroyer / Controller / Engine / Wall), grounded in the real `archetype`
// field (13 archetypes → 6 classes) and each tied 1:1 to the contest it most
// directly serves, so the class badge and the six-contest system agree —
// FINISHER *is* the card that feeds FINISH, not a separate, invented taxonomy.
// ---------------------------------------------------------------------------

export type PlayerClass = 'Creator' | 'Finisher' | 'Destroyer' | 'Controller' | 'Engine' | 'Wall';

const ARCHETYPE_TO_CLASS: Record<string, PlayerClass> = {
  // creation lane — the chance-makers/carriers
  Creator: 'Creator', Dribbler: 'Creator', Sprinter: 'Creator',
  // finishing lane — pure goal threat
  Striker: 'Finisher', Target: 'Finisher',
  // ball-winning aggression
  Destroyer: 'Destroyer', Powerhouse: 'Destroyer',
  // possession orchestration + leadership
  Passer: 'Controller', Controller: 'Controller', Commander: 'Controller',
  // box-to-box — its own distinct identity
  Engine: 'Engine',
  // the last line
  Cover: 'Wall', Shotstopper: 'Wall',
  GK: 'Wall', // the opponent generator's bare keeper archetype
};

export interface PlayerClassMeta {
  key: PlayerClass;
  label: string;
  /** The handoff's exact class colour. */
  color: string;
  /** The Turn-9 class glyph (emoji). Falls outside the Silkscreen set, so it is
   *  rendered in the card's Unicode-fallback font stack (see ClassGem). This is
   *  the single at-a-glance tell for a player's class (top-left corner gem). */
  glyph: string;
  /** The Turn-9 one-liner shown beside the class in the legend / inspector. */
  blurb: string;
  /** The contest this class most directly serves — retained so the class badge
   *  and the six-contest system still agree (used for the gem's aria/title). */
  contest: ContestKey;
}

export const PLAYER_CLASS_META: Record<PlayerClass, PlayerClassMeta> = {
  Creator:    { key: 'Creator',    label: 'CREATOR',    color: '#a855f7', glyph: '\u{1FA84}',       blurb: 'Makes the chances',    contest: 'create' },
  Finisher:   { key: 'Finisher',   label: 'FINISHER',   color: '#f2c14e', glyph: '\u{1F3AF}',       blurb: 'Puts them away',       contest: 'finish' },
  Destroyer:  { key: 'Destroyer',  label: 'DESTROYER',  color: '#e23b35', glyph: '\u{1F5E1}\u{FE0F}', blurb: 'Wins the ball back',  contest: 'break' },
  Controller: { key: 'Controller', label: 'CONTROLLER', color: '#4a9eff', glyph: '\u{1F39B}\u{FE0F}', blurb: 'Dictates the tempo',  contest: 'keep' },
  Engine:     { key: 'Engine',     label: 'ENGINE',     color: '#e8621a', glyph: '\u{2699}\u{FE0F}',  blurb: 'Covers every blade',  contest: 'press' },
  Wall:       { key: 'Wall',       label: 'WALL',       color: '#4a8f6b', glyph: '\u{1F9F1}',       blurb: 'Nothing gets through', contest: 'stop' },
};

/** A card's class — every real archetype is covered; Controller is the sane
 *  fallback for anything unmapped (a generalist, matching its own class). */
export function classOfCard(card: Pick<Card, 'archetype'>): PlayerClass {
  return ARCHETYPE_TO_CLASS[card.archetype] ?? 'Controller';
}
