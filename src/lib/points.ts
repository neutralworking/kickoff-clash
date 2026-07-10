/**
 * Kickoff Clash — POINTS (SCORING_V2 §the-law): the one-currency core.
 *
 * Every effect in the game is a flat ±N in card points. This module builds a
 * side's EFFECTIVE cards for one round: printed ATK/DEF (deriveStats) plus a
 * ledger of flat modifiers — fitness bands, positional penalties (wrong flank /
 * out of position), defining-trait buffs, the manager, equipped tactics, the
 * pre-match intent, chemistry links, personality themes, opponent cohesion and
 * cross-side debuffs (Antagonist, Dark Arts). Every modifier lands as a
 * `PointMod` with a source name, so the pitch UI can colour a changed stat and
 * show the receipt on tap. NOTHING here multiplies.
 *
 * Determinism / commutativity: modifiers resolve in two passes. Pass A is the
 * card's own condition (base + fitness + position). Pass B (traits, manager,
 * tactics, chemistry, personality) reads the frozen PASS-A SNAPSHOT for every
 * threshold and "star" pick, then lands additively — so record order cannot
 * change the result.
 */

import type { Card } from './scoring';
import { seededRandom } from './scoring';
import { deriveStats } from './funnel';
import type { Formation } from './formations';
import type { Band, Lane } from './field';
import { cellOf, bandOf, laneOf } from './field';
import type { JokerCard } from './jokers';
import type { TacticCard } from './tactics';
import type { TeamIntent } from './run';
import type { PointTrait } from './defining-traits';
import { definingTraitsFor } from './defining-traits';
import type { CoAppearance } from './chem';
import { chemistryLinks } from './chem';
import { PERSONALITY_THEMES } from './chemistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModKind =
  | 'trait' | 'manager' | 'tactic' | 'intent' | 'chemistry' | 'personality'
  | 'fitness' | 'position' | 'opponent';

export interface PointMod {
  /** Receipt line: who/what did this ("Marshal — Roux", "Press High", "Tired"). */
  source: string;
  kind: ModKind;
  atk: number;
  def: number;
}

/** A card's live beat-layer actions this round (from its defining traits). */
export interface ChanceAction { name: string; quality: 'half' | 'big'; p: number; asShooter?: boolean }
export interface StopAction { name: string; p: number; save?: boolean }

export interface EffCard {
  id: number;
  name: string;
  archetype: string;
  position: string;
  band: Band;
  lane: Lane;
  gk: boolean;
  slotIndex: number;
  /** The printed card numbers (deriveStats). */
  baseAtk: number;
  baseDef: number;
  /** Effective = base + Σ mods. The numbers the match plays with. */
  atk: number;
  def: number;
  mods: PointMod[];
  fitness: number;
  card: Card;
  chanceTraits: ChanceAction[];
  stopTraits: StopAction[];
}

/** A flat effect this side applies to the OTHER side's cards. */
export interface EnemyEffect {
  source: string;
  who: 'backline' | 'star';
  atk: number;
  def: number;
}

/** A tactic-level manufactured chance (Set Piece Specialists, Route One). */
export interface TeamChance { name: string; quality: 'half' | 'big'; p: number }

export interface ChemLinkView { aId: number; bId: number; aName: string; bName: string; strength: number }

export interface SideInput {
  xi: Card[];
  formation: Formation;
  seed: number;
  increment: number;          // 0–4
  jokers?: JokerCard[];
  tactics?: TacticCard[];
  intent?: TeamIntent;
  chemistry?: CoAppearance;
  /** Apply personality-theme mods (player side). */
  personality?: boolean;
  /** Apply the defining-trait suite (player side; the faceless opponent opts out). */
  defining?: boolean;
  yourGoals?: number;         // this side's goals (situational tactic gates)
  theirGoals?: number;
  sentOffIds?: Set<number>;
  /** Opponent difficulty compensation: +K ATK/+K DEF per card (SCORING_V2). */
  cohesionPts?: number;
}

export interface SideBuild {
  /** On-pitch effective cards (sent-off excluded). */
  cards: EffCard[];
  /** Effects to fold into the OTHER side (Antagonist, Dark Arts' star knock). */
  enemyMods: EnemyEffect[];
  enemyDrains: { source: string; amount: number }[];  // fitness off their star
  /** Own fitness costs this round (Press High), cardId → negative delta. */
  ownDrains: Record<number, number>;
  teamChances: TeamChance[];
  /** Aura traits that applied to ≥1 card this round (for the animation layer). */
  auraTraits: { cardId: number; name: string }[];
  personalityLabel: string | null;
  perfectDressingRoom: boolean;
  links: ChemLinkView[];
}

// ---------------------------------------------------------------------------
// Pass A: the card's own condition
// ---------------------------------------------------------------------------

/** Fitness (0–100) → flat points off BOTH stats. Visible, never a multiplier. */
export function fitnessPenalty(fitness: number): number {
  if (fitness >= 90) return 0;
  if (fitness >= 70) return -1;
  if (fitness >= 50) return -2;
  return -3;
}

const WIDE_POSITIONS = new Set(['WD', 'WM', 'WF']);

/** A wide card's preferred flank — deterministic from its id (legacy saves and the
 *  whole 540-card pool get one for free). Central cards have no preference. */
export function preferredSide(card: Pick<Card, 'id' | 'position'>): Lane | null {
  if (!WIDE_POSITIONS.has(card.position)) return null;
  return seededRandom(((card.id * 97 + 13) * 2654435761) >>> 0) < 0.5 ? 'L' : 'R';
}

/** Penalty for a wide card played on its wrong flank. */
export const WRONG_FLANK_PENALTY = 2;
/** Penalty for a card in a slot that doesn't accept its position. */
export const OUT_OF_POSITION_PENALTY = 2;

// ---------------------------------------------------------------------------
// Pass B tables — manager / tactics / intent (flat, situational, ledgered)
// ---------------------------------------------------------------------------

interface Snap { id: number; atk: number; def: number }

type ModSink = (cardId: number, mod: PointMod) => void;

function managerMods(
  joker: JokerCard,
  cards: EffCard[],
  snap: Map<number, Snap>,
  linkedIds: Set<number>,
  add: ModSink,
): void {
  const src = joker.name;
  const each = (pred: (c: EffCard) => boolean, atk: number, def: number) => {
    for (const c of cards) if (pred(c)) add(c.id, { source: src, kind: 'manager', atk, def });
  };
  switch (joker.id) {
    case 'the_dinosaur':
      each((c) => c.archetype === 'Target' || c.archetype === 'Powerhouse', 2, 0);
      break;
    case 'the_professor':
      each((c) => c.archetype === 'Controller' || c.archetype === 'Passer', 2, 0);
      break;
    case 'the_mourinho':
      each((c) => c.archetype === 'Destroyer' || c.archetype === 'Cover', 0, 2);
      break;
    case 'the_gambler':
      each((c) => c.card.durability === 'glass' || c.card.durability === 'phoenix', 1, 1);
      break;
    case 'youth_developer':
      each((c) => c.card.rarity === 'Common', 1, 0);
      break;
    case 'hairdryer':
      if (cards.some((c) => c.card.personalityTheme === 'Captain')) each(() => true, 1, 1);
      break;
    case 'chemistry_set':
      each((c) => linkedIds.has(c.id), 1, 0);
      break;
    case 'scouts_eye':
      each((c) => c.band === 'DEF', 0, 1);
      break;
  }
}

interface TacticCtx { increment: number; yourGoals: number; theirGoals: number }

function tacticMods(
  tactic: TacticCard,
  ctx: TacticCtx,
  cards: EffCard[],
  add: ModSink,
  out: { chances: TeamChance[]; drains: Record<number, number>; enemyMods: EnemyEffect[]; enemyDrains: { source: string; amount: number }[] },
): void {
  const src = tactic.name;
  const each = (pred: (c: EffCard) => boolean, atk: number, def: number) => {
    for (const c of cards) if (pred(c)) add(c.id, { source: src, kind: 'tactic', atk, def });
  };
  const leading = ctx.yourGoals > ctx.theirGoals;
  const trailing = ctx.yourGoals < ctx.theirGoals;
  switch (tactic.id) {
    case 'high_line':
      each((c) => c.band !== 'DEF', 1, 0);
      each((c) => c.band === 'DEF', 0, -1);
      break;
    case 'press_high':
      each((c) => c.band === 'ATT', 0, 2);
      for (const c of cards) {
        if (c.archetype === 'Sprinter' || c.archetype === 'Engine') {
          // 0–100 fitness axis: the high press costs the runners ~9%/increment.
          out.drains[c.id] = (out.drains[c.id] ?? 0) - 9;
        }
      }
      break;
    case 'wing_play':
      each((c) => WIDE_POSITIONS.has(c.position), 2, 0);
      break;
    case 'narrow':
      each((c) => c.archetype === 'Controller' || c.archetype === 'Passer', 2, 0);
      break;
    case 'low_block':
      each((c) => c.band === 'DEF', 0, 2);
      if (leading) each((c) => c.archetype === 'Sprinter' || c.archetype === 'Dribbler', 2, 0);
      break;
    case 'sit_deep':
      each((c) => c.band === 'DEF', 0, 1);
      each((c) => c.archetype === 'Sprinter' || c.archetype === 'Dribbler', 2, 0);
      break;
    case 'fortress':
      each((c) => c.band === 'DEF', 0, 3);
      break;
    case 'man_marking':
      each((c) => c.band === 'MID', 0, 2);
      break;
    case 'counter_attack':
      if (trailing) each((c) => c.band === 'ATT', 3, 0);
      break;
    case 'possession':
      each((c) => ['Controller', 'Passer', 'Engine'].includes(c.archetype), 2, 0);
      break;
    case 'set_piece':
      out.chances.push({ name: src, quality: 'half', p: 0.3 });
      each((c) => c.archetype === 'Target' || c.archetype === 'Commander', 1, 0);
      break;
    case 'dark_arts':
      out.enemyMods.push({ source: src, who: 'star', atk: -1, def: -1 });
      // 0–100 fitness axis: a ~25% knock on their star's legs.
      out.enemyDrains.push({ source: src, amount: -25 });
      break;
    case 'youth_policy':
      if (ctx.increment >= 3) each(() => true, 1, 1);
      break;
    case 'overload_left':
      each((c) => c.lane === 'L', 2, 0);
      break;
    case 'overload_right':
      each((c) => c.lane === 'R', 2, 0);
      break;
    case 'route_one':
      out.chances.push({ name: src, quality: 'half', p: 0.25 });
      each((c) => c.archetype === 'Target', 1, 0);
      break;
  }
}

function intentMods(intent: TeamIntent | undefined, cards: EffCard[], add: ModSink): void {
  if (intent === 'attacking') {
    for (const c of cards) {
      if (c.band !== 'DEF') add(c.id, { source: 'Attacking intent', kind: 'intent', atk: 1, def: 0 });
      else add(c.id, { source: 'Attacking intent', kind: 'intent', atk: 0, def: -1 });
    }
  } else if (intent === 'defensive') {
    for (const c of cards) {
      if (c.band === 'ATT') add(c.id, { source: 'Defensive intent', kind: 'intent', atk: -1, def: 1 });
      else add(c.id, { source: 'Defensive intent', kind: 'intent', atk: 0, def: 1 });
    }
  }
}

// ---------------------------------------------------------------------------
// Pass B — defining traits (buffs/debuffs land; chances/stops are carried)
// ---------------------------------------------------------------------------

const BAND_RANK: Record<Band, number> = { DEF: 0, MID: 1, ATT: 2 };

function resolveBuffTargets(
  trait: Extract<PointTrait, { kind: 'buff' }>,
  owner: EffCard,
  cards: EffCard[],
  snap: Map<number, Snap>,
): EffCard[] {
  switch (trait.who) {
    case 'self':
      return [owner];
    case 'teammates':
      return cards.filter((c) => c.id !== owner.id);
    case 'backline':
      return cards.filter((c) => c.band === 'DEF');
    case 'lane-ahead': {
      // The nearest teammate AHEAD in the same pitch lane (the overlap target).
      const ahead = cards
        .filter((c) => c.id !== owner.id && c.lane === owner.lane
          && BAND_RANK[c.band] > BAND_RANK[owner.band])
        .sort((a, b) => (BAND_RANK[a.band] - BAND_RANK[b.band]) || (a.id - b.id));
      return ahead.length ? [ahead[0]] : [];
    }
    case 'band-behind': {
      const behind = BAND_RANK[owner.band] - 1;
      if (behind < 0) return [];
      return cards.filter((c) => c.id !== owner.id && BAND_RANK[c.band] === behind);
    }
    case 'atk-below':
      return cards.filter((c) => c.id !== owner.id && (snap.get(c.id)?.atk ?? 0) < (trait.value ?? 0));
    case 'atk-atLeast':
      return cards.filter((c) => c.id !== owner.id && (snap.get(c.id)?.atk ?? 0) >= (trait.value ?? 0));
    case 'def-below':
      return cards.filter((c) => c.id !== owner.id && (snap.get(c.id)?.def ?? 0) < (trait.value ?? 0));
    case 'def-atLeast':
      return cards.filter((c) => c.id !== owner.id && (snap.get(c.id)?.def ?? 0) >= (trait.value ?? 0));
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// buildSide — the whole pass
// ---------------------------------------------------------------------------

export function buildSide(input: SideInput): SideBuild {
  const {
    xi, formation, increment, seed,
    jokers = [], tactics = [], intent, chemistry = {},
    personality = false, defining = false,
    yourGoals = 0, theirGoals = 0,
    sentOffIds, cohesionPts = 0,
  } = input;

  // --- Pass A: place each card, apply its own condition -----------------------
  const cards: EffCard[] = [];
  xi.forEach((card, i) => {
    if (sentOffIds?.has(card.id)) return; // off the pitch: no stats, no traits
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    const cell = cellOf(slot.x, slot.y);
    const band = bandOf(cell);
    const lane = laneOf(cell);
    const base = deriveStats(card);
    const fitness = card.fitness ?? (card.injured ? 33 : 100);
    const mods: PointMod[] = [];

    const fp = fitnessPenalty(fitness);
    if (fp !== 0) {
      mods.push({
        source: 'Tired', kind: 'fitness',
        atk: base.atk > 0 ? fp : 0,
        def: base.def > 0 ? fp : 0,
      });
    }

    const pref = preferredSide(card);
    if (pref && lane !== 'C' && lane !== pref) {
      mods.push({ source: 'Wrong flank', kind: 'position', atk: -WRONG_FLANK_PENALTY, def: -WRONG_FLANK_PENALTY });
    }
    if (slot.accepts.length > 0 && !slot.accepts.includes(card.position)) {
      mods.push({ source: 'Out of position', kind: 'position', atk: -OUT_OF_POSITION_PENALTY, def: -OUT_OF_POSITION_PENALTY });
    }
    if (cohesionPts > 0) {
      mods.push({ source: 'Cohesion', kind: 'opponent', atk: cohesionPts, def: cohesionPts });
    }

    cards.push({
      id: card.id, name: card.name, archetype: card.archetype, position: card.position,
      band, lane, gk: card.position === 'GK' || slot.type === 'GK', slotIndex: i,
      baseAtk: base.atk, baseDef: base.def,
      atk: 0, def: 0, // finalized below
      mods, fitness, card,
      chanceTraits: [], stopTraits: [],
    });
  });

  // The frozen pass-A snapshot: what every threshold / star pick reads.
  const snap = new Map<number, Snap>(cards.map((c) => [c.id, {
    id: c.id,
    atk: c.baseAtk + c.mods.reduce((s, m) => s + m.atk, 0),
    def: c.baseDef + c.mods.reduce((s, m) => s + m.def, 0),
  }]));

  const add: ModSink = (cardId, mod) => {
    if (mod.atk === 0 && mod.def === 0) return;
    cards.find((c) => c.id === cardId)?.mods.push(mod);
  };

  const enemyMods: EnemyEffect[] = [];
  const enemyDrains: { source: string; amount: number }[] = [];
  const ownDrains: Record<number, number> = {};
  const teamChances: TeamChance[] = [];
  const auraTraits: { cardId: number; name: string }[] = [];

  // --- Pass B: defining traits (player side only) -----------------------------
  if (defining) {
    for (const owner of cards) {
      for (const trait of definingTraitsFor(owner.card)) {
        if (trait.late && increment < 3) continue;
        switch (trait.kind) {
          case 'buff': {
            const targets = resolveBuffTargets(trait, owner, cards, snap);
            for (const t of targets) {
              add(t.id, {
                source: t.id === owner.id ? trait.name : `${trait.name} — ${owner.name}`,
                kind: 'trait', atk: trait.atk ?? 0, def: trait.def ?? 0,
              });
            }
            if (targets.length) auraTraits.push({ cardId: owner.id, name: trait.name });
            break;
          }
          case 'debuff':
            enemyMods.push({
              source: `${trait.name} — ${owner.name}`,
              who: trait.who, atk: trait.atk ?? 0, def: trait.def ?? 0,
            });
            auraTraits.push({ cardId: owner.id, name: trait.name });
            break;
          case 'chance':
            owner.chanceTraits.push({ name: trait.name, quality: trait.quality, p: trait.p, asShooter: trait.asShooter });
            break;
          case 'stop':
            owner.stopTraits.push({ name: trait.name, p: trait.p, save: trait.save });
            break;
        }
      }
    }
  }

  // --- Pass B: chemistry links (flat, capped at 2 links per card) -------------
  const links = chemistryLinks(xi.filter((c) => !sentOffIds?.has(c.id)), formation, chemistry);
  const linkCount = new Map<number, number>();
  const linkedIds = new Set<number>();
  for (const link of links) {
    if (link.strength < 0.35) continue;
    for (const [id, otherName] of [[link.aId, link.bName], [link.bId, link.aName]] as [number, string][]) {
      const n = linkCount.get(id) ?? 0;
      if (n >= 2) continue;
      linkCount.set(id, n + 1);
      linkedIds.add(id);
      add(id, {
        source: `Link — ${otherName}`, kind: 'chemistry',
        atk: 1, def: link.strength >= 0.8 ? 1 : 0,
      });
    }
  }

  // --- Pass B: manager / tactics / intent -------------------------------------
  for (const joker of jokers) managerMods(joker, cards, snap, linkedIds, add);
  const tacticCtx: TacticCtx = { increment, yourGoals, theirGoals };
  for (const tactic of tactics) {
    tacticMods(tactic, tacticCtx, cards, add, { chances: teamChances, drains: ownDrains, enemyMods, enemyDrains });
  }
  intentMods(intent, cards, add);

  // --- Pass B: personality themes (flat trios + the Catalyst gamble) ----------
  let personalityLabel: string | null = null;
  let perfectDressingRoom = false;
  if (personality) {
    const labels: string[] = [];
    const themesPresent = new Set<string>();
    const byTheme = new Map<string, EffCard[]>();
    for (const c of cards) {
      const t = c.card.personalityTheme;
      if (!t) continue;
      themesPresent.add(t);
      byTheme.set(t, [...(byTheme.get(t) ?? []), c]);
    }
    for (const theme of PERSONALITY_THEMES) {
      const group = byTheme.get(theme) ?? [];
      if (group.length < 3) continue;
      if (theme === 'Catalyst') {
        // The gamble: a seeded match roll — the sparks either ignite or misfire.
        const hot = seededRandom(seed * 9301 + 49297) >= 0.5;
        for (const c of group) add(c.id, { source: `Catalyst ${hot ? 'spark' : 'misfire'}`, kind: 'personality', atk: hot ? 2 : -1, def: 0 });
        labels.push(`${hot ? 'Spark' : 'Misfire'} (${group.length}× Catalyst)`);
      } else {
        for (const c of group) add(c.id, { source: `${theme} resonance`, kind: 'personality', atk: 1, def: 1 });
        labels.push(`Resonance (${group.length}× ${theme})`);
      }
    }
    perfectDressingRoom = PERSONALITY_THEMES.every((t) => themesPresent.has(t));
    if (perfectDressingRoom) {
      for (const c of cards) add(c.id, { source: 'Perfect Dressing Room', kind: 'personality', atk: 1, def: 0 });
      labels.push('Perfect Dressing Room');
    }
    personalityLabel = labels.length ? labels.join(' + ') : null;
  }

  // --- Finalize: effective = base + Σ mods ------------------------------------
  finalize(cards);

  return {
    cards, enemyMods, enemyDrains, ownDrains, teamChances, auraTraits,
    personalityLabel, perfectDressingRoom, links,
  };
}

function finalize(cards: EffCard[]): void {
  for (const c of cards) {
    c.atk = c.baseAtk + c.mods.reduce((s, m) => s + m.atk, 0);
    c.def = c.baseDef + c.mods.reduce((s, m) => s + m.def, 0);
  }
}

/**
 * Fold the OTHER side's cross-effects into this side's cards (Antagonist's back-line
 * wind-up, Dark Arts' star knock). Reads this side's pre-fold stats for the star pick
 * (deterministic tiebreak by id). Mutates in place and re-finalizes.
 */
export function applyEnemyEffects(cards: EffCard[], effects: EnemyEffect[]): void {
  if (!effects.length) return;
  for (const eff of effects) {
    if (eff.who === 'backline') {
      for (const c of cards) {
        if (c.band === 'DEF') c.mods.push({ source: eff.source, kind: 'opponent', atk: eff.atk, def: eff.def });
      }
    } else {
      const star = [...cards].sort((a, b) => (b.atk - a.atk) || (a.id - b.id))[0];
      if (star) star.mods.push({ source: eff.source, kind: 'opponent', atk: eff.atk, def: eff.def });
    }
  }
  finalize(cards);
}
