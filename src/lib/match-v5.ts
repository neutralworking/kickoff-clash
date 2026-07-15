/**
 * Kickoff Clash — Match Engine v5 (SCORING_V2: one currency, three contests, two dice)
 *
 * The round shape (docs/SCORING_V2.md): each 15' increment the two XIs are built
 * as EFFECTIVE cards (points.ts — printed ATK/DEF plus a flat, ledgered modifier
 * stack), then the round resolves as three contests (contests.ts):
 *
 *   1. THE BALL   — controllers v pressers/engines split 6 possessions (no dice)
 *   2. THE OUTCOME — d100 per possession: turnover / half / big / corner / foul
 *   3. THE SHOT   — d100 roll-under: GOAL if d100 ≤ BASE + 3×(shooter ATK − STOP)
 *
 * Fouls feed bookings; a second yellow is a red (max 1/side/match) whose points
 * leave every contest immediately and whose suspension carries to the next
 * fixture. Every number the player sees is a sum of card points plus flat
 * modifiers — the forecast header (ATTACK v DEFENCE, +/-, NET) is honest because
 * the whole engine is those sums.
 */

import type { Card, SlottedCard, Durability } from './scoring';
import { seededRandom, FITNESS_MAX, LOW_FITNESS } from './scoring';
import type { Connection, CrossSynergy } from './chemistry';
import { findPositionalConnections } from './chemistry';
import type { Formation, FormationSlot } from './formations';
import type { JokerCard } from './jokers';
import { getExtraDiscards } from './jokers';
import type { TacticCard } from './tactics';
import { getTacticById } from './tactics';
import type { TeamIntent } from './run';
import { INCREMENT_MINUTES, generateGoalText, generateChanceText } from './hand';
import type { MatchEvent } from './hand';
import { laneOfCard } from './funnel';
import type { Lane, Cell, Band } from './field';
import { CELLS, BANDS, LANES, cellOf, bandOf } from './field';
import { generateOpponentXI } from './opponent';
import type { CoAppearance } from './chem';
import { buildSide, applyEnemyEffects } from './points';
import type { EffCard, PointMod, TeamChance } from './points';
import { contestTotals, resolveRound } from './contests';
import type { ContestTotals, RoundBeat, RoundBooking } from './contests';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Personality readout for the match surfaces. SCORING_V2: the effect itself is
 *  flat points on cards (points.ts); this carries only the label. */
export interface PersonalityBonus {
  label: string | null;       // e.g. "Resonance (3× Maestro)"
  perfectDressingRoom: boolean;
}

export interface MatchV5State {
  xi: Card[];
  bench: Card[];
  remainingDeck: Card[];
  attackerIds: Set<number>;   // legacy play-order selection (display flavour only)
  attackerOrder: number[];
  subsRemaining: number;
  discardsRemaining: number;
  subsUsed: { outId: number; inId: number; minute: number }[];
  currentIncrement: number;   // 0–4 index
  isFirstHalf: boolean;
  scores: IncrementResult[];
  yourGoals: number;
  opponentGoals: number;
  formation: Formation;
  playingStyle: string;
  intent: TeamIntent;
  personalityBonus: PersonalityBonus;
  opponentRound: number;      // 1–5 (cup — difficulty key)
  opponentStyle: string;
  opponentWeakness: string;
  opponentXI: Card[];
  opponentFormation: Formation;
  chemistry: CoAppearance;
  /** Joga Bonito's stretch-conversion trigger: set once a CREATOR scores. */
  jogaFired: boolean;
  /** TACTICS BY CARDS (per-call): the tactic ids CALLED for the current period.
   *  Set at a planning break, cleared when the period resolves — a called play's
   *  flat effect applies for that period only. Calling one spent a charge. */
  activeTactics: string[];
  /** Remaining tactic charges THIS match (tacticId → charges left). Seeded from
   *  the run's persistent charges at kick-off; a call spends one, an un-call
   *  before the period resolves refunds it. Refills to capacity between fixtures. */
  tacticCharges: Record<string, number>;
  /** Match discipline: cardId → yellow cards so far (both sides' ids). */
  bookings: Record<number, number>;
  /** Sent off this match (red cards, both sides). Their points are out of every
   *  contest and — for your cards — the suspension carries to the next fixture. */
  sentOffIds: number[];
  seed: number;
}

export interface CascadeLine {
  label: string;
  value: number;
  type: 'base' | 'synergy' | 'style' | 'dual-role' | 'personality' | 'manager' | 'tactic' | 'ability' | 'fitness' | 'position' | 'opponent';
}

/** A defining trait that FIRED this increment — the hook the match screen animates. */
export interface TraitEvent {
  cardId: number;
  traitName: string;
  animation: 'moment' | 'aura';
}

/** The forecast header (SCORING_V2): sums of effective points, nothing else. */
export interface MatchForecast {
  yourAttack: number;
  yourDefence: number;
  oppAttack: number;
  oppDefence: number;
  /** yourAttack − their defence: your attacking edge. */
  attackEdge: number;
  /** yourDefence − their attack: your defensive edge. */
  defendEdge: number;
  /** attackEdge + defendEdge — the single best "who wins" number. */
  net: number;
}

export interface AttackDefenceSplit {
  /** Your six contest sums (SCORING_V2 §contests). */
  contest: ContestTotals;
  /** Theirs. */
  oppContest: ContestTotals;
  forecast: MatchForecast;
  /** Legacy-named scalars (map straight onto the contests). */
  possession: number;     // = contest.keep   (ball-keeping craft)
  pressing: number;       // = contest.press
  defenceScore: number;   // = contest.stop
  chanceCreation: number; // = contest.create
  shotQuality: number;    // = contest.finish
  playName: string;
  playSummary: string;
  finisherId: number | null;
  attackBreakdown: CascadeLine[];
  defenceBreakdown: CascadeLine[];
  attackSynergies: Connection[];
  defenceSynergies: Connection[];
  crossSynergies: CrossSynergy[];
  attackerCount: number;
  maxAttackers: number;
  attackingOrder: number[];
  /** LIVE per-card effective stats: base printed numbers + every flat modifier.
   *  The player-facing feedback surface (green buffed / red drained). */
  cardStats: Record<number, { atk: number; def: number; baseAtk: number; baseDef: number }>;
  /** The receipt: every flat modifier on each of your cards, by source. */
  cardMods: Record<number, PointMod[]>;
  /** Aura traits active this round (+ moment firings appended at resolve). */
  traitEvents: TraitEvent[];
  /** Fitness deltas from tactics (Press High's cost, Dark Arts' knock) — applied
   *  in advanceIncrement; may include opponent card ids. */
  fitnessDelta: Record<number, number>;
  /** The built effective sides (carried so resolveIncrement never recomputes). */
  youEff: EffCard[];
  oppEff: EffCard[];
  teamChances: TeamChance[];
  oppTeamChances: TeamChance[];
  /** Your manager's shot-quality bonuses (POMO / Set Pieces FC). */
  needBonus: { all: number; corner: number };
}

/** One commentary beat of the round playout (contests.ts). */
export type MatchBeat = RoundBeat;

/** A resolved shot (legacy display shape, derived from the beats). */
export interface Shot {
  lane: Lane;
  xg: number;
  goal: boolean;
}

export interface IncrementResult {
  minute: number;
  split: AttackDefenceSplit;
  opponentAttack: number;   // Σ their effective ATK (the header's other side)
  opponentDefence: number;  // Σ their effective DEF
  yourChanceVolume: number;
  yourChanceQuality: number;
  yourGoalChance: number;
  opponentChanceVolume: number;
  opponentChanceQuality: number;
  opponentGoalChance: number;
  yourScored: boolean;
  opponentScored: boolean;
  yourGoalCount: number;
  opponentGoalCount: number;
  yourXG: number;
  opponentXG: number;
  yourPossessions: number;
  opponentPossessions: number;
  yourShots: Shot[];
  opponentShots: Shot[];
  event: MatchEvent;
  /** The round playout: possessions, chances with d100 receipts, corners,
   *  bookings, reds, trait stops — sorted by clock. Pure display. */
  beats: MatchBeat[];
  stats: MatchStats;
  /** Discipline this round (folded into state by advanceIncrement). */
  bookings: RoundBooking[];
}

/**
 * Per-side, per-contest metric ledger (SCORING_V2 six-contest readout). Twelve
 * counters — two per contest — aggregated from the round's typed `RoundBeat[]`
 * log plus the raw `RoundOutcome` counts. Pure display: NONE of these feeds the
 * match math (scores, xG, shot law). Each formula is documented at its build site
 * in `resolveIncrement`. Some metrics are strict SUBSETS of others by design
 * (shotsOnTarget ⊂ shots; tackles ⊂ turnoversWon; interceptions ⊂ turnoversWon).
 */
export interface ContestStats {
  // KEEP — ball retention
  possessionPct: number;   // this side's share of the 6 possessions (0–100)
  possessions: number;     // this side's possession count this round
  // CREATE — chance manufacture
  shots: number;           // shots taken (all resolved shots)
  bigChances: number;      // resolved BIG-quality chances (goal/save/miss)
  // FINISH — conversion
  shotsOnTarget: number;   // shots on target (goals + saves) — subset of shots
  goals: number;           // goals scored
  // BREAK — ball-winning by destruction
  turnoversWon: number;    // opponent moves that broke down (you regained the ball)
  interceptions: number;   // subset of turnoversWon attributed to the BREAK dial
  // PRESS — ball-winning by pressure
  pressures: number;       // opponent possessions you contested (their poss count)
  tackles: number;         // subset of turnoversWon attributed to the PRESS dial
  // STOP — the last line
  saves: number;           // shots your keeper kept out
  blocks: number;          // stop-trait cancellations of an opposing chance
}

export interface MatchStats {
  yourXG: number;
  opponentXG: number;
  yourPossessionPct: number;
  opponentPossessionPct: number;
  yourShots: number;
  opponentShots: number;
  yourShotsOnTarget: number;
  opponentShotsOnTarget: number;
  yourZonesWon: Record<Lane, boolean>;
  opponentZonesWon: Record<Lane, boolean>;
  yourZoneGrid: Record<Cell, boolean>;
  opponentZoneGrid: Record<Cell, boolean>;
  zoneMargin: Record<Cell, number>;
  /** The six-contest metric ledger, per side (SCORING_V2 stats overlay). */
  yourContest: ContestStats;
  opponentContest: ContestStats;
}

export interface MatchV5Result {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  scores: IncrementResult[];
  matchState: MatchV5State;
  verdict: MatchVerdict;
}

export interface VerdictFactor {
  key: 'points' | 'chances' | 'conversion' | 'control' | 'plan';
  label: string;
  detail: string;
  swing: number;
}

export interface MatchVerdict {
  headline: string;
  factors: VerdictFactor[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Opponent difficulty compensation (SCORING_V2): flat +K ATK/+K DEF per opponent
 *  card by cup, standing in for the trait/manager/tactic/chemistry stack the
 *  faceless side doesn't run. The balance-sweep's difficulty dial. */
export const OPP_COHESION_PTS = [0, 0, 1, 1, 2];

// --- Fitness (0–100 axis; the PENALTY is flat points in points.ts) ---
// Per-increment drain by durability: a standard MID card loses ~7 × 0.9 ≈ 6.3/increment,
// so ~31 over a 5-increment match (~31% of full) — the same ~30% shape as the old 1–6 scale.
const FITNESS_DRAIN: Record<Durability, number> = {
  glass: 12, fragile: 9, phoenix: 10, standard: 7, iron: 5, titanium: 1,
};
const BAND_INVOLVEMENT: Record<Band, number> = { ATT: 1.2, MID: 0.9, DEF: 0.5 };

export function fitnessFactor(fitness: number): number {
  return 0.6 + 0.004 * clamp(fitness, 0, FITNESS_MAX); // 100 → 1.0, 0 → 0.6
}

export function fitnessOf(card: Card): number {
  return card.fitness ?? (card.injured ? 33 : FITNESS_MAX);
}

/** Base power scaled by live fitness — the shop/scale readout (never match math). */
export function effectivePower(card: Card): number {
  return Math.round(card.power * fitnessFactor(fitnessOf(card)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function mirrorBand(band: Band): Band {
  return band === 'ATT' ? 'DEF' : band === 'DEF' ? 'ATT' : 'MID';
}

function cardToSlotted(card: Card, formation: Formation): SlottedCard {
  const slot = formation.slots.find((s: FormationSlot) => s.accepts.includes(card.position));
  return { card, slot: slot?.type ?? card.position };
}

function isWideCard(card: Card): boolean {
  return ['WF', 'WM', 'WD'].includes(card.position)
    || ['Winger', 'Inverted Winger', 'Extremo', 'Lateral', 'Fluidificante', 'Tornante'].includes(card.tacticalRole ?? '');
}

function isPlaymaker(card: Card): boolean {
  return ['Creator', 'Controller', 'Passer'].includes(card.archetype)
    || ['Regista', 'Enganche', 'Trequartista', 'Fantasista', 'Metodista'].includes(card.tacticalRole ?? '');
}

function isFinisher(card: Card): boolean {
  return ['Striker', 'Target', 'Dribbler', 'Powerhouse'].includes(card.archetype)
    || ['Poacher', 'Prima Punta', 'Seconda Punta'].includes(card.tacticalRole ?? '');
}

function inferPlayPattern(
  orderedAttackers: Card[],
  defenders: Card[],
  equippedTacticIds: string[],
  playingStyle: string,
): { name: string; summary: string } {
  if (orderedAttackers.length === 0) {
    return { name: 'Hold Shape', summary: 'Protect the structure and wait for the next opening.' };
  }
  const finisher = orderedAttackers[orderedAttackers.length - 1];
  const opener = orderedAttackers[0];
  const playmakers = orderedAttackers.filter(isPlaymaker).length;
  const wideCount = orderedAttackers.filter(isWideCard).length;
  const finishers = orderedAttackers.filter(isFinisher).length;
  const defendersHolding = defenders.length;

  if (wideCount >= 2 && playmakers >= 1 && finishers >= 1) {
    return { name: 'Wing Overload', summary: `Stretch them wide, feed the flanks, and finish through ${finisher.name}.` };
  }
  if ((playingStyle === 'Tiki-Taka' || equippedTacticIds.includes('possession') || equippedTacticIds.includes('narrow')) && orderedAttackers.length >= 5 && playmakers >= 2) {
    return { name: 'Tiki-Taka', summary: `Short combinations pull them apart before ${finisher.name} gets the final touch.` };
  }
  if (orderedAttackers.length >= 6 && defendersHolding >= 4) {
    return { name: 'Death by a Thousand Cuts', summary: 'Sustain pressure with runners everywhere while the rest hold the counter shape.' };
  }
  if (equippedTacticIds.includes('counter_attack') && defendersHolding >= 5 && finishers >= 1) {
    return { name: 'Counter Trap', summary: `Absorb, spring out, and release ${finisher.name} into the break.` };
  }
  return { name: 'Pattern Play', summary: `${opener.name} starts the move and ${finisher.name} is the intended end point.` };
}

// ---------------------------------------------------------------------------
// 1. initMatch
// ---------------------------------------------------------------------------

export function initMatch(
  xi: Card[],
  bench: Card[],
  remainingDeck: Card[],
  formation: Formation,
  playingStyle: string,
  jokers: JokerCard[],
  seed: number,
  opponentRound: number,
  opponentStyle: string,
  opponentWeakness: string,
  chemistry: CoAppearance = {},
  intent: TeamIntent = 'balanced',
  opponentPower?: number,
  tacticCharges: Record<string, number> = {},
): MatchV5State {
  const { xi: opponentXI, formation: opponentFormation } = generateOpponentXI(
    opponentRound,
    opponentStyle,
    seed,
    opponentPower,
  );
  // Personality label (the effect itself is flat card points, applied per round).
  const probe = buildSide({
    xi, formation, seed, increment: 0, personality: true,
  });
  return {
    xi: xi.map((c) => ({ ...c, fitness: fitnessOf(c) })),
    bench,
    remainingDeck,
    attackerIds: new Set(),
    attackerOrder: [],
    subsRemaining: bench.length,
    discardsRemaining: 3 + getExtraDiscards(jokers),
    subsUsed: [],
    currentIncrement: 0,
    isFirstHalf: true,
    scores: [],
    yourGoals: 0,
    opponentGoals: 0,
    formation,
    playingStyle,
    intent,
    personalityBonus: {
      label: probe.personalityLabel,
      perfectDressingRoom: probe.perfectDressingRoom,
    },
    opponentRound,
    opponentStyle,
    opponentWeakness,
    opponentXI,
    opponentFormation,
    chemistry,
    activeTactics: [],
    tacticCharges,
    bookings: {},
    sentOffIds: [],
    jogaFired: false,
    seed,
  };
}

// ---------------------------------------------------------------------------
// 1b. callTactic — call (or un-call) a tactic for the coming period
// ---------------------------------------------------------------------------

/** Toggle a tactic call for the upcoming period. Calling spends one charge;
 *  un-calling it (before the period resolves) refunds the charge. A play with no
 *  charges left can't be called. `capacity` is the card's full charge capacity
 *  (tacticCapacity) — the refund clamp. Charges are a per-match resource: they
 *  carry across periods within the match and refill between fixtures. */
export function callTactic(
  state: MatchV5State,
  tacticId: string,
  capacity: number,
): MatchV5State {
  if (!getTacticById(tacticId)) return state;
  const charges = { ...state.tacticCharges };
  if (state.activeTactics.includes(tacticId)) {
    return {
      ...state,
      activeTactics: state.activeTactics.filter((id) => id !== tacticId),
      tacticCharges: { ...charges, [tacticId]: Math.min(capacity, (charges[tacticId] ?? 0) + 1) },
    };
  }
  if ((charges[tacticId] ?? 0) <= 0) return state;
  return {
    ...state,
    activeTactics: [...state.activeTactics, tacticId],
    tacticCharges: { ...charges, [tacticId]: (charges[tacticId] ?? 0) - 1 },
  };
}

// ---------------------------------------------------------------------------
// 2. commitAttackers (legacy play-order flavour; no longer feeds the contests)
// ---------------------------------------------------------------------------

export function commitAttackers(state: MatchV5State, cardIds: number[]): MatchV5State {
  const xiIds = new Set(state.xi.map((c) => c.id));
  const validOrder: number[] = [];
  for (const id of cardIds) {
    if (!xiIds.has(id)) continue;
    const card = state.xi.find((c) => c.id === id);
    if (card?.injured) continue;
    if (!validOrder.includes(id)) validOrder.push(id);
  }
  return { ...state, attackerIds: new Set(validOrder), attackerOrder: validOrder };
}

// ---------------------------------------------------------------------------
// 3. evaluateSplit — build both effective sides + the forecast
// ---------------------------------------------------------------------------

export function evaluateSplit(
  state: MatchV5State,
  jokers: JokerCard[],
): AttackDefenceSplit {
  const equipped = state.activeTactics
    .map((id) => getTacticById(id))
    .filter((t): t is TacticCard => !!t);
  const { xi, formation } = state;
  const sentOff = new Set(state.sentOffIds);

  // --- Build both sides in the one currency (points.ts) -----------------------
  const you = buildSide({
    xi, formation,
    seed: state.seed, increment: state.currentIncrement,
    jokers, tactics: equipped, intent: state.intent,
    chemistry: state.chemistry ?? {},
    personality: true, defining: true,
    yourGoals: state.yourGoals, theirGoals: state.opponentGoals,
    sentOffIds: sentOff,
    subbedInIds: new Set(state.subsUsed.map((s) => s.inId)),
    jogaFired: state.jogaFired,
  });
  const opp = buildSide({
    xi: state.opponentXI, formation: state.opponentFormation,
    seed: state.seed + 7777, increment: state.currentIncrement,
    yourGoals: state.opponentGoals, theirGoals: state.yourGoals,
    sentOffIds: sentOff,
    cohesionPts: OPP_COHESION_PTS[clamp(state.opponentRound - 1, 0, OPP_COHESION_PTS.length - 1)],
  });

  // Cross-side effects: your Antagonists/Dark Arts land on them (and theirs on
  // you, if they ever grow any). Applied after both builds so order can't matter.
  applyEnemyEffects(opp.cards, you.enemyMods);
  applyEnemyEffects(you.cards, opp.enemyMods);

  const contest = contestTotals(you.cards);
  const oppContest = contestTotals(opp.cards);
  const forecast: MatchForecast = {
    yourAttack: contest.attack,
    yourDefence: contest.defence,
    oppAttack: oppContest.attack,
    oppDefence: oppContest.defence,
    attackEdge: contest.attack - oppContest.defence,
    defendEdge: contest.defence - oppContest.attack,
    net: (contest.attack - oppContest.defence) + (contest.defence - oppContest.attack),
  };

  // --- Per-card feedback surface ----------------------------------------------
  const cardStats: AttackDefenceSplit['cardStats'] = {};
  const cardMods: Record<number, PointMod[]> = {};
  for (const c of you.cards) {
    cardStats[c.id] = { atk: c.atk, def: c.def, baseAtk: c.baseAtk, baseDef: c.baseDef };
    cardMods[c.id] = c.mods;
  }
  // Sent-off cards still exist in the XI list — show them zeroed.
  for (const card of xi) {
    if (!cardStats[card.id]) {
      cardStats[card.id] = { atk: 0, def: 0, baseAtk: 0, baseDef: 0 };
      cardMods[card.id] = [{ source: 'Sent off', kind: 'position', atk: 0, def: 0 }];
    }
  }

  // --- The receipt lines (flat sums by source group) ---------------------------
  const attackBreakdown: CascadeLine[] = [];
  const defenceBreakdown: CascadeLine[] = [];
  const baseAtk = you.cards.reduce((s, c) => s + c.baseAtk, 0);
  const baseDef = you.cards.reduce((s, c) => s + c.baseDef, 0);
  attackBreakdown.push({ label: 'Printed ATK', value: baseAtk, type: 'base' });
  defenceBreakdown.push({ label: 'Printed DEF', value: baseDef, type: 'base' });

  const groups = new Map<string, { type: CascadeLine['type']; atk: number; def: number }>();
  const groupKey = (m: PointMod): { label: string; type: CascadeLine['type'] } => {
    switch (m.kind) {
      case 'fitness': return { label: 'Condition', type: 'fitness' };
      case 'position': return { label: 'Positioning', type: 'position' };
      case 'trait': return { label: 'Card abilities', type: 'ability' };
      case 'chemistry': return { label: 'Chemistry links', type: 'synergy' };
      case 'personality': return { label: 'Dressing room', type: 'personality' };
      case 'opponent': return { label: m.source, type: 'opponent' };
      case 'manager': return { label: m.source, type: 'manager' };
      case 'tactic': return { label: m.source, type: 'tactic' };
      case 'intent': return { label: m.source, type: 'tactic' };
      default: return { label: m.source, type: 'ability' };
    }
  };
  for (const c of you.cards) {
    for (const m of c.mods) {
      const { label, type } = groupKey(m);
      const g = groups.get(label) ?? { type, atk: 0, def: 0 };
      g.atk += m.atk;
      g.def += m.def;
      groups.set(label, g);
    }
  }
  for (const [label, g] of groups) {
    if (g.atk !== 0) attackBreakdown.push({ label, value: g.atk, type: g.type });
    if (g.def !== 0) defenceBreakdown.push({ label, value: g.def, type: g.type });
  }

  // --- Display flavour: synergy chips + the play pattern ------------------------
  const attackers: Card[] = [];
  const defenders: Card[] = [];
  const cardY = new Map<number, number>();
  xi.forEach((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    const band = bandOf(cellOf(slot.x, slot.y));
    cardY.set(card.id, slot.y);
    if (band === 'ATT' || band === 'MID') attackers.push(card);
    if (band === 'DEF' || band === 'MID') defenders.push(card);
  });
  const orderedAttackers = [...attackers].sort((a, b) => (cardY.get(b.id) ?? 0) - (cardY.get(a.id) ?? 0));
  const playPattern = inferPlayPattern(orderedAttackers, defenders, state.activeTactics, state.playingStyle);
  const { attackSynergies, defenceSynergies, crossSynergies } = findPositionalConnections(
    attackers.map((c) => cardToSlotted(c, formation)),
    defenders.map((c) => cardToSlotted(c, formation)),
  );

  // Aura traits active this round; moment firings are appended at resolve.
  const seen = new Set<string>();
  const traitEvents: TraitEvent[] = [];
  for (const a of you.auraTraits) {
    const key = `${a.cardId}:${a.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    traitEvents.push({ cardId: a.cardId, traitName: a.name, animation: 'aura' });
  }

  // Fitness deltas: own tactic costs + your knocks on their star (by THEIR id).
  const fitnessDelta: Record<number, number> = { ...you.ownDrains };
  if (you.enemyDrains.length && opp.cards.length) {
    const star = [...opp.cards].sort((a, b) => (b.atk - a.atk) || (a.id - b.id))[0];
    for (const d of you.enemyDrains) {
      fitnessDelta[star.id] = (fitnessDelta[star.id] ?? 0) + d.amount;
    }
  }

  return {
    contest,
    oppContest,
    forecast,
    possession: contest.keep,
    pressing: contest.press,
    defenceScore: contest.stop,
    chanceCreation: contest.create,
    shotQuality: contest.finish,
    playName: playPattern.name,
    playSummary: playPattern.summary,
    finisherId: orderedAttackers.at(-1)?.id ?? null,
    attackBreakdown,
    defenceBreakdown,
    attackSynergies,
    defenceSynergies,
    crossSynergies,
    attackerCount: attackers.length,
    maxAttackers: formation.maxAttackers,
    attackingOrder: orderedAttackers.map((c) => c.id),
    cardStats,
    cardMods,
    traitEvents,
    fitnessDelta,
    youEff: you.cards,
    oppEff: opp.cards,
    teamChances: you.teamChances,
    oppTeamChances: opp.teamChances,
    needBonus: you.needBonus,
  };
}

// ---------------------------------------------------------------------------
// 4. resolveIncrement — play the round out (contests.ts)
// ---------------------------------------------------------------------------

export function resolveIncrement(
  state: MatchV5State,
  split: AttackDefenceSplit,
  seed: number,
): IncrementResult {
  const minute = INCREMENT_MINUTES[state.currentIncrement];
  const windowStart = minute - 15;

  const yourIds = new Set(state.xi.map((c) => c.id));
  const redUsed = {
    you: state.sentOffIds.some((id) => yourIds.has(id)),
    opp: state.sentOffIds.some((id) => !yourIds.has(id)),
  };

  const outcome = resolveRound(
    { cards: split.youEff, teamChances: split.teamChances, needBonus: split.needBonus },
    { cards: split.oppEff, teamChances: split.oppTeamChances },
    {
      seed,
      increment: state.currentIncrement,
      minute,
      windowStart,
      bookings: state.bookings,
      redUsed,
    },
  );

  // Moment trait firings join the aura events (deduped) for the animation layer.
  const seen = new Set(split.traitEvents.map((e) => `${e.cardId}:${e.traitName}`));
  const traitEvents = [...split.traitEvents];
  for (const f of outcome.firedTraits) {
    const key = `${f.cardId}:${f.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    traitEvents.push({ cardId: f.cardId, traitName: f.name, animation: 'moment' });
  }
  split = { ...split, traitEvents };

  const yourGoalCount = outcome.yourGoals;
  const opponentGoalCount = outcome.oppGoals;
  const yourScored = yourGoalCount > 0;
  const opponentScored = opponentGoalCount > 0;

  const yourGoalChance = clamp(1 - Math.exp(-outcome.yourXG), 0, 1);
  const opponentGoalChance = clamp(1 - Math.exp(-outcome.oppXG), 0, 1);
  const yourChanceVolume = clamp(outcome.yourShots / 4, 0, 1);
  const opponentChanceVolume = clamp(outcome.oppShots / 4, 0, 1);
  const yourChanceQuality = outcome.yourShots ? clamp(outcome.yourXG / outcome.yourShots, 0, 1) : 0;
  const opponentChanceQuality = outcome.oppShots ? clamp(outcome.oppXG / outcome.oppShots, 0, 1) : 0;

  // Legacy shot lists for the cumulative stats (derived from the beats).
  const shotsFor = (side: 'you' | 'opp'): Shot[] =>
    outcome.beats
      .filter((b) => b.side === side && (b.outcome === 'goal' || b.outcome === 'save' || b.outcome === 'miss'))
      .map((b) => ({ lane: b.lane, xg: b.xg, goal: b.outcome === 'goal' }));

  // Event text (the increment headline).
  const allConnections = [...split.attackSynergies, ...split.defenceSynergies, ...split.crossSynergies];
  let eventText: string;
  let eventType: MatchEvent['type'];
  if (yourScored && opponentScored) {
    eventText = `${minute}' — GOAL! ${generateGoalText(allConnections, seed + state.currentIncrement)} But the opponent strikes back!`;
    eventType = 'goal-yours';
  } else if (yourScored) {
    eventText = `${minute}' — GOAL! ${generateGoalText(allConnections, seed + state.currentIncrement)}`;
    eventType = 'goal-yours';
  } else if (opponentScored) {
    eventText = `${minute}' — Opponent scores. ${generateChanceText(seed + state.currentIncrement + 100)}`;
    eventType = 'goal-opponent';
  } else {
    eventText = `${minute}' — ${generateChanceText(seed + state.currentIncrement + 200)}`;
    eventType = 'chance';
  }

  // Zone control (display): effective presence (ATK+DEF) per cell vs the mirrored cell.
  const yourCellSum = new Map<Cell, number>();
  const oppCellSum = new Map<Cell, number>();
  for (const cell of CELLS) { yourCellSum.set(cell, 0); oppCellSum.set(cell, 0); }
  for (const c of split.youEff) {
    const cell = `${c.band}_${c.lane}` as Cell;
    yourCellSum.set(cell, (yourCellSum.get(cell) ?? 0) + c.atk + c.def);
  }
  for (const c of split.oppEff) {
    const cell = `${c.band}_${c.lane}` as Cell;
    oppCellSum.set(cell, (oppCellSum.get(cell) ?? 0) + c.atk + c.def);
  }
  const yourZoneGrid = {} as Record<Cell, boolean>;
  const opponentZoneGrid = {} as Record<Cell, boolean>;
  const zoneMargin = {} as Record<Cell, number>;
  for (const band of BANDS) {
    for (const lane of LANES) {
      const cell = `${band}_${lane}` as Cell;
      const oppCell = `${mirrorBand(band)}_${lane}` as Cell;
      const yours = yourCellSum.get(cell) ?? 0;
      const theirs = oppCellSum.get(oppCell) ?? 0;
      yourZoneGrid[cell] = yours > theirs;
      opponentZoneGrid[cell] = theirs > yours;
      zoneMargin[cell] = Math.round(yours - theirs);
    }
  }
  const laneAtk = (cards: EffCard[], lane: Lane) => cards.filter((c) => c.lane === lane).reduce((s, c) => s + c.atk, 0);
  const laneDef = (cards: EffCard[], lane: Lane) => cards.filter((c) => c.lane === lane).reduce((s, c) => s + c.def, 0);

  const possTotal = (outcome.yourPossessions + outcome.oppPossessions) || 1;
  const yourPossessionPct = Math.round((outcome.yourPossessions / possTotal) * 100);

  // --- The six-contest metric ledger (SCORING_V2 stats overlay) ---------------
  // Purely additive read-side counters aggregated from the round's beats + the
  // raw outcome counts. NONE of this feeds the match math. Formulae per contest:
  const beats = outcome.beats;
  const nBeats = (pred: (b: MatchBeat) => boolean) => beats.reduce((n, b) => n + (pred(b) ? 1 : 0), 0);
  const shotOutcome = (o: MatchBeat['outcome']) => o === 'goal' || o === 'save' || o === 'miss';

  // CREATE · Big Chances — resolved BIG-quality chances for that side (a stopped
  // big chance never became a shot, so only goal/save/miss count).
  const yourBig = nBeats((b) => b.side === 'you' && b.quality === 'big' && shotOutcome(b.outcome));
  const oppBig = nBeats((b) => b.side === 'opp' && b.quality === 'big' && shotOutcome(b.outcome));

  // BREAK · Turnovers Won — the OPPONENT's move broke down (a `turnover` beat is
  // tagged with the side that LOST the ball), so YOU won it back, and vice-versa.
  const yourTurnoversWon = nBeats((b) => b.outcome === 'turnover' && b.side === 'opp');
  const oppTurnoversWon = nBeats((b) => b.outcome === 'turnover' && b.side === 'you');

  // Attribution — each forced turnover is credited to whichever of that side's two
  // ball-winning dials was higher this increment: BREAK dial ≥ PRESS dial →
  // Interception, else Tackle. Interceptions + Tackles = Turnovers Won (a clean
  // partition). Dials are the increment's build totals (split.contest / oppContest).
  const yourViaBreak = split.contest.brk >= split.contest.press;
  const yourInterceptions = yourViaBreak ? yourTurnoversWon : 0;
  const yourTackles = yourTurnoversWon - yourInterceptions;
  const oppViaBreak = split.oppContest.brk >= split.oppContest.press;
  const oppInterceptions = oppViaBreak ? oppTurnoversWon : 0;
  const oppTackles = oppTurnoversWon - oppInterceptions;

  // STOP · Saves — a `save` beat is tagged with the SHOOTER's side, so YOUR keeper's
  // save is a shot by THEM (side === 'opp') that stayed on target but didn't score.
  const yourSaves = nBeats((b) => b.outcome === 'save' && b.side === 'opp');
  const oppSaves = nBeats((b) => b.outcome === 'save' && b.side === 'you');
  // STOP · Blocks — a `stop` beat (stop-trait cancelled a chance) is tagged with the
  // DEFENDING side, so YOUR block is side === 'you'.
  const yourBlocks = nBeats((b) => b.outcome === 'stop' && b.side === 'you');
  const oppBlocks = nBeats((b) => b.outcome === 'stop' && b.side === 'opp');

  const yourContest: ContestStats = {
    // KEEP
    possessionPct: yourPossessionPct,
    possessions: outcome.yourPossessions,
    // CREATE
    shots: outcome.yourShots,
    bigChances: yourBig,
    // FINISH
    shotsOnTarget: outcome.yourOnTarget,
    goals: outcome.yourGoals,
    // BREAK
    turnoversWon: yourTurnoversWon,
    interceptions: yourInterceptions,
    // PRESS — you press whenever THEY hold the ball, so pressures = their poss count.
    pressures: outcome.oppPossessions,
    tackles: yourTackles,
    // STOP
    saves: yourSaves,
    blocks: yourBlocks,
  };
  const opponentContest: ContestStats = {
    possessionPct: 100 - yourPossessionPct,
    possessions: outcome.oppPossessions,
    shots: outcome.oppShots,
    bigChances: oppBig,
    shotsOnTarget: outcome.oppOnTarget,
    goals: outcome.oppGoals,
    turnoversWon: oppTurnoversWon,
    interceptions: oppInterceptions,
    pressures: outcome.yourPossessions,
    tackles: oppTackles,
    saves: oppSaves,
    blocks: oppBlocks,
  };

  const stats: MatchStats = {
    yourXG: outcome.yourXG,
    opponentXG: outcome.oppXG,
    yourPossessionPct,
    opponentPossessionPct: 100 - yourPossessionPct,
    yourShots: outcome.yourShots,
    opponentShots: outcome.oppShots,
    yourShotsOnTarget: outcome.yourOnTarget,
    opponentShotsOnTarget: outcome.oppOnTarget,
    yourZonesWon: {
      L: laneAtk(split.youEff, 'L') > laneDef(split.oppEff, 'L'),
      C: laneAtk(split.youEff, 'C') > laneDef(split.oppEff, 'C'),
      R: laneAtk(split.youEff, 'R') > laneDef(split.oppEff, 'R'),
    },
    opponentZonesWon: {
      L: laneAtk(split.oppEff, 'L') > laneDef(split.youEff, 'L'),
      C: laneAtk(split.oppEff, 'C') > laneDef(split.youEff, 'C'),
      R: laneAtk(split.oppEff, 'R') > laneDef(split.youEff, 'R'),
    },
    yourZoneGrid,
    opponentZoneGrid,
    zoneMargin,
    yourContest,
    opponentContest,
  };

  return {
    minute,
    split,
    opponentAttack: split.oppContest.attack,
    opponentDefence: split.oppContest.defence,
    yourChanceVolume,
    yourChanceQuality,
    yourGoalChance,
    opponentChanceVolume,
    opponentChanceQuality,
    opponentGoalChance,
    yourScored,
    opponentScored,
    yourGoalCount,
    opponentGoalCount,
    yourXG: outcome.yourXG,
    opponentXG: outcome.oppXG,
    yourPossessions: outcome.yourPossessions,
    opponentPossessions: outcome.oppPossessions,
    yourShots: shotsFor('you'),
    opponentShots: shotsFor('opp'),
    event: { minute, text: eventText, type: eventType },
    beats: outcome.beats,
    stats,
    bookings: outcome.bookings,
  };
}

// ---------------------------------------------------------------------------
// 5. advanceIncrement
// ---------------------------------------------------------------------------

export function advanceIncrement(state: MatchV5State, result: IncrementResult): MatchV5State {
  const newScores = [...state.scores, result];
  const newYourGoals = state.yourGoals + result.yourGoalCount;
  const newOpponentGoals = state.opponentGoals + result.opponentGoalCount;
  const nextIncrement = state.currentIncrement + 1;
  const isFirstHalf = nextIncrement <= 1;

  // Joga Bonito's stretch-conversion trigger: the FIRST goal scored by one of
  // your CREATION-lane cards unlocks the flair buff for the rest of the match.
  const byId = new Map(state.xi.map((c) => [c.id, c]));
  const jogaFired =
    state.jogaFired ||
    result.beats.some((b) => {
      if (b.outcome !== 'goal' || b.side !== 'you' || b.scorerId == null) return false;
      const scorer = byId.get(b.scorerId);
      return !!scorer && laneOfCard(scorer) === 'creation';
    });

  // Discipline: fold this round's cards into the match ledger.
  const newBookings = { ...state.bookings };
  const newSentOff = [...state.sentOffIds];
  for (const b of result.bookings) {
    if (b.red) newSentOff.push(b.cardId);
    else newBookings[b.cardId] = (newBookings[b.cardId] ?? 0) + 1;
  }

  // Tactic-driven fitness deltas this round (Press High's cost; Dark Arts' knock).
  const traitDrain = result.split.fitnessDelta ?? {};

  // Fitness drain: every starter loses condition each increment — base by
  // durability × involvement by band. Spent, fragile cards risk injury.
  const newXi = [...state.xi];
  const fatigueSeed = state.seed * 97 + state.currentIncrement * 31;
  const lastSlot = state.formation.slots[state.formation.slots.length - 1];

  for (let i = 0; i < newXi.length; i++) {
    const card = newXi[i];
    const slot = state.formation.slots[i] ?? lastSlot;
    const band = bandOf(cellOf(slot.x, slot.y));
    const drain = (FITNESS_DRAIN[card.durability] ?? 7) * BAND_INVOLVEMENT[band];
    const fitness = clamp((card.fitness ?? FITNESS_MAX) - drain + (traitDrain[card.id] ?? 0), 0, FITNESS_MAX);

    let injured = card.injured;
    if (!injured && fitness < LOW_FITNESS) {
      let risk = 0;
      if (card.durability === 'glass') risk = 0.15;
      else if (card.durability === 'phoenix') risk = 0.12;
      else if (card.durability === 'fragile') risk = 0.10;
      if (risk > 0 && seededRandom(fatigueSeed + card.id) < risk) injured = true;
    }

    newXi[i] = { ...card, fitness, injured };
  }

  // Enemy-targeted drains (Dark Arts) land on the opponent XI.
  let newOpponentXI = state.opponentXI;
  if (state.opponentXI.some((c) => traitDrain[c.id])) {
    newOpponentXI = state.opponentXI.map((c) =>
      traitDrain[c.id] ? { ...c, fitness: clamp(fitnessOf(c) + traitDrain[c.id], 0, FITNESS_MAX) } : c,
    );
  }

  return {
    ...state,
    xi: newXi,
    opponentXI: newOpponentXI,
    scores: newScores,
    yourGoals: newYourGoals,
    opponentGoals: newOpponentGoals,
    currentIncrement: nextIncrement,
    isFirstHalf,
    bookings: newBookings,
    sentOffIds: newSentOff,
    jogaFired,
    attackerIds: new Set(),
    attackerOrder: [],
    // Called plays last one period — clear them so the next break is a fresh
    // decision. Spent charges (tacticCharges) stay spent for the rest of the match.
    activeTactics: [],
  };
}

// ---------------------------------------------------------------------------
// 6. makeSub / discardFromBench
// ---------------------------------------------------------------------------

export function subBlockReason(
  state: MatchV5State,
  xiCardId: number,
  benchCardId: number,
): string | null {
  if (state.subsRemaining <= 0) return 'No substitutions left';
  if (!state.xi.some((c) => c.id === xiCardId)) return 'That player is not on the pitch';
  if (!state.bench.some((c) => c.id === benchCardId)) return 'That player is not on the bench';
  if (state.sentOffIds.includes(xiCardId)) return 'A sent-off player cannot be replaced';
  return null;
}

export function makeSub(state: MatchV5State, xiCardId: number, benchCardId: number): MatchV5State {
  if (subBlockReason(state, xiCardId, benchCardId) !== null) return state;

  const benchCard = state.bench.find((c) => c.id === benchCardId)!;
  const minute = INCREMENT_MINUTES[state.currentIncrement] ?? 90;
  const newXi = state.xi.map((c) => (c.id === xiCardId ? benchCard : c));
  const newBench = state.bench.filter((c) => c.id !== benchCardId);
  const newAttackerOrder = state.attackerOrder.filter((id) => id !== xiCardId);

  return {
    ...state,
    xi: newXi,
    bench: newBench,
    attackerIds: new Set(newAttackerOrder),
    attackerOrder: newAttackerOrder,
    subsRemaining: state.subsRemaining - 1,
    subsUsed: [...state.subsUsed, { outId: xiCardId, inId: benchCardId, minute }],
  };
}

export function discardFromBench(state: MatchV5State, benchCardIds: number[]): MatchV5State {
  if (state.discardsRemaining <= 0) return state;
  if (benchCardIds.length === 0) return state;

  const discardSet = new Set(benchCardIds);
  const keptBench = state.bench.filter((c) => !discardSet.has(c.id));
  const discardCount = state.bench.length - keptBench.length;
  if (discardCount === 0) return state;

  const drawCount = Math.min(discardCount, state.remainingDeck.length);
  const drawn = state.remainingDeck.slice(0, drawCount);
  const newRemainingDeck = state.remainingDeck.slice(drawCount);

  return {
    ...state,
    bench: [...keptBench, ...drawn],
    remainingDeck: newRemainingDeck,
    discardsRemaining: state.discardsRemaining - 1,
  };
}

// ---------------------------------------------------------------------------
// 7. getMatchResult + the match verdict (why you won/lost)
// ---------------------------------------------------------------------------

const nf1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * The legible "why" from the played increments. Every number quoted is a sum of
 * card points (the forecast) or a match stat — read-side and deterministic.
 */
export function computeMatchVerdict(state: MatchV5State): MatchVerdict {
  const inc = Math.max(1, state.scores.length);
  const { yourGoals, opponentGoals } = state;
  const result: 'win' | 'draw' | 'loss' =
    yourGoals > opponentGoals ? 'win' : yourGoals < opponentGoals ? 'loss' : 'draw';

  let yourXG = 0, oppXG = 0, poss = 0, yourLanes = 0, oppLanes = 0;
  let net = 0, yourPts = 0, oppPts = 0, planPts = 0;
  for (const r of state.scores) {
    yourXG += r.yourXG;
    oppXG += r.opponentXG;
    poss += r.stats.yourPossessionPct;
    yourLanes += (['L', 'C', 'R'] as Lane[]).filter((l) => r.stats.yourZonesWon[l]).length;
    oppLanes += (['L', 'C', 'R'] as Lane[]).filter((l) => r.stats.opponentZonesWon[l]).length;
    net += r.split.forecast.net;
    yourPts += r.split.forecast.yourAttack + r.split.forecast.yourDefence;
    oppPts += r.split.forecast.oppAttack + r.split.forecast.oppDefence;
    for (const line of r.split.attackBreakdown) {
      if (line.type === 'tactic' || line.type === 'manager' || line.type === 'synergy' || line.type === 'ability') {
        planPts += line.value;
      }
    }
  }
  poss /= inc;
  net /= inc;
  const ptsGap = (yourPts - oppPts) / inc;
  const laneShare = yourLanes + oppLanes > 0 ? yourLanes / (yourLanes + oppLanes) : 0.5;
  const planPerSpell = planPts / inc;
  const convSwing = (yourGoals - yourXG) - (opponentGoals - oppXG);

  const rawFactors: VerdictFactor[] = [
    {
      key: 'points',
      label: 'Points on the pitch',
      detail: `Your XI totalled ${Math.round(yourPts / inc)} points to their ${Math.round(oppPts / inc)} (net ${net >= 0 ? '+' : ''}${Math.round(net)}).`,
      swing: Math.max(-1, Math.min(1, ptsGap / 30)),
    },
    {
      key: 'chances',
      label: 'Chances created',
      detail: `Expected goals ${nf1(yourXG)} to ${nf1(oppXG)}.`,
      swing: Math.max(-1, Math.min(1, (yourXG - oppXG) / 2.5)),
    },
    {
      key: 'conversion',
      label: 'Finishing',
      detail: `You scored ${yourGoals} from ${nf1(yourXG)} xG; they scored ${opponentGoals} from ${nf1(oppXG)}.`,
      swing: Math.max(-1, Math.min(1, convSwing / 2)),
    },
    {
      key: 'control',
      label: 'Control',
      detail: `${Math.round(poss)}% of the ball; lane contests won ${yourLanes} to ${oppLanes}.`,
      swing: Math.max(-1, Math.min(1, ((poss - 50) / 25 + (laneShare - 0.5) * 2) / 2)),
    },
    {
      key: 'plan',
      label: 'Your plan',
      detail: `Abilities, tactics, manager and chemistry added ${planPerSpell >= 0 ? '+' : ''}${Math.round(planPerSpell)} points per spell.`,
      swing: Math.max(0, Math.min(1, planPerSpell / 25)),
    },
  ];
  const factors = rawFactors.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing));

  let headline: string;
  const xgGap = yourXG - oppXG;
  if (Math.abs(ptsGap) >= 25) {
    headline = ptsGap < 0
      ? `Outgunned: they carried ${Math.round(oppPts / inc)} points to your ${Math.round(yourPts / inc)}.`
      : `Overpowered them: ${Math.round(yourPts / inc)} points to their ${Math.round(oppPts / inc)}.`;
  } else if (result === 'loss' && xgGap >= 0.8) {
    headline = `Created enough — xG ${nf1(yourXG)} to ${nf1(oppXG)} — but they took their chances and you didn't.`;
  } else if (result === 'win' && xgGap <= -0.8) {
    headline = `Won on finishing: ${yourGoals} goal${yourGoals === 1 ? '' : 's'} from ${nf1(yourXG)} xG against the run of play.`;
  } else if (Math.abs(xgGap) >= 0.8) {
    headline = xgGap > 0
      ? `Out-created them: xG ${nf1(yourXG)} to ${nf1(oppXG)}.`
      : `Out-created: they made xG ${nf1(oppXG)} to your ${nf1(yourXG)}.`;
  } else if (Math.abs(poss - 50) >= 8 || Math.abs(laneShare - 0.5) >= 0.2) {
    const yours = poss >= 50;
    headline = yours
      ? `Controlled it: ${Math.round(poss)}% of the ball and ${yourLanes}–${oppLanes} on the lanes.`
      : `Control lost: ${Math.round(poss)}% of the ball and ${yourLanes}–${oppLanes} on the lanes.`;
  } else if (result !== 'draw' && planPerSpell >= 15) {
    headline = `Your plan made the difference: abilities, tactics and chemistry added +${Math.round(planPerSpell)} points per spell.`;
  } else {
    headline = `Fine margins: xG ${nf1(yourXG)} to ${nf1(oppXG)}.`;
  }

  return { headline, factors };
}

export function getMatchResult(state: MatchV5State): MatchV5Result {
  const { yourGoals, opponentGoals } = state;
  let result: 'win' | 'draw' | 'loss';
  if (yourGoals > opponentGoals) result = 'win';
  else if (yourGoals < opponentGoals) result = 'loss';
  else result = 'draw';

  return {
    yourGoals,
    opponentGoals,
    result,
    scores: state.scores,
    matchState: state,
    verdict: computeMatchVerdict(state),
  };
}

// ---------------------------------------------------------------------------
// Cumulative match stats — running totals across all played increments.
// ---------------------------------------------------------------------------

export interface CumulativeStats {
  periodsPlayed: number;
  yourGoals: number;
  opponentGoals: number;
  yourXG: number;
  opponentXG: number;
  yourShots: number;
  opponentShots: number;
  yourShotsOnTarget: number;
  opponentShotsOnTarget: number;
  yourPossessionPct: number;
  opponentPossessionPct: number;
  yourZonesWon: number;
  opponentZonesWon: number;
  zoneMargin: Record<Cell, number>;
  /** Match-to-date six-contest ledger (running totals across played increments). */
  yourContest: ContestStats;
  opponentContest: ContestStats;
}

/** A zeroed ContestStats — the accumulator seed / empty-match default. */
function emptyContestStats(): ContestStats {
  return {
    possessionPct: 50, possessions: 0,
    shots: 0, bigChances: 0,
    shotsOnTarget: 0, goals: 0,
    turnoversWon: 0, interceptions: 0,
    pressures: 0, tackles: 0,
    saves: 0, blocks: 0,
  };
}

export function cumulativeStats(scores: IncrementResult[]): CumulativeStats {
  const zoneMargin = Object.fromEntries(CELLS.map((c) => [c, 0])) as Record<Cell, number>;
  let yX = 0, oX = 0, yS = 0, oS = 0, ySoT = 0, oSoT = 0, yPoss = 0, oPoss = 0;
  let yGoals = 0, oGoals = 0, yZW = 0, oZW = 0;

  // Running six-contest ledger — sum every counting metric; possessionPct is
  // recomputed from the summed possession counts below (so it stays a true share).
  const yC = emptyContestStats();
  const oC = emptyContestStats();
  const addContest = (acc: ContestStats, s: ContestStats) => {
    acc.possessions += s.possessions;
    acc.shots += s.shots; acc.bigChances += s.bigChances;
    acc.shotsOnTarget += s.shotsOnTarget; acc.goals += s.goals;
    acc.turnoversWon += s.turnoversWon; acc.interceptions += s.interceptions;
    acc.pressures += s.pressures; acc.tackles += s.tackles;
    acc.saves += s.saves; acc.blocks += s.blocks;
  };

  for (const s of scores) {
    yGoals += s.yourGoalCount; oGoals += s.opponentGoalCount;
    yX += s.yourXG; oX += s.opponentXG;
    yS += s.yourShots.length; oS += s.opponentShots.length;
    ySoT += s.stats.yourShotsOnTarget; oSoT += s.stats.opponentShotsOnTarget;
    yPoss += s.yourPossessions; oPoss += s.opponentPossessions;
    for (const lane of LANES) {
      if (s.stats.yourZonesWon[lane]) yZW++;
      if (s.stats.opponentZonesWon[lane]) oZW++;
    }
    for (const cell of CELLS) zoneMargin[cell] += s.stats.zoneMargin[cell] ?? 0;
    addContest(yC, s.stats.yourContest);
    addContest(oC, s.stats.opponentContest);
  }

  const totPoss = yPoss + oPoss;
  const posPct = totPoss ? Math.round((yPoss / totPoss) * 100) : 50;
  yC.possessionPct = posPct;
  oC.possessionPct = 100 - posPct;
  return {
    periodsPlayed: scores.length,
    yourGoals: yGoals,
    opponentGoals: oGoals,
    yourXG: Math.round(yX * 100) / 100,
    opponentXG: Math.round(oX * 100) / 100,
    yourShots: yS,
    opponentShots: oS,
    yourShotsOnTarget: ySoT,
    opponentShotsOnTarget: oSoT,
    yourPossessionPct: posPct,
    opponentPossessionPct: totPoss ? Math.round((oPoss / totPoss) * 100) : 50,
    yourZonesWon: yZW,
    opponentZonesWon: oZW,
    zoneMargin,
    yourContest: yC,
    opponentContest: oC,
  };
}

// ---------------------------------------------------------------------------
// Per-player match stats + rating — read-side only.
// ---------------------------------------------------------------------------

export interface PlayerMatchStat {
  cardId: number;
  name: string;
  position: string;
  goals: number;
  assists: number;
  effectivePower: number;
  fitness: number;
  posFit: boolean;
  rating: number;
}

/**
 * Aggregate per-player in-match stats + a 0–10 rating over the played increments.
 * Contribution = the card's effective ATK+DEF points vs the XI average (SCORING_V2:
 * points are the only currency, so the rating reads the same numbers the match does).
 */
export function playerMatchStats(
  scores: IncrementResult[],
  xi: Card[],
  formation: Formation,
): Record<number, PlayerMatchStat> {
  const out: Record<number, PlayerMatchStat> = {};
  xi.forEach((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    out[card.id] = {
      cardId: card.id,
      name: card.name,
      position: card.position,
      goals: 0,
      assists: 0,
      effectivePower: effectivePower(card),
      fitness: fitnessOf(card),
      posFit: slot ? slot.accepts.includes(card.position) : true,
      rating: 6.0,
    };
  });

  const contrib: Record<number, number> = {};
  for (const s of scores) {
    for (const idStr of Object.keys(s.split.cardStats)) {
      const id = Number(idStr);
      const st = s.split.cardStats[id];
      contrib[id] = (contrib[id] ?? 0) + st.atk + st.def;
    }
    for (const b of s.beats) {
      if (b.side !== 'you' || b.outcome !== 'goal') continue;
      if (b.scorerId != null && out[b.scorerId]) out[b.scorerId].goals += 1;
      if (b.assisterId != null && out[b.assisterId]) out[b.assisterId].assists += 1;
    }
  }

  const ids = Object.keys(out).map(Number);
  const n = ids.length || 1;
  let sumContrib = 0;
  for (const id of ids) sumContrib += contrib[id] ?? 0;
  const avgContrib = sumContrib / n;

  for (const id of ids) {
    const st = out[id];
    const rel = avgContrib > 0 ? ((contrib[id] ?? 0) - avgContrib) / avgContrib : 0;
    let rating = 6.0 + clamp(rel, -1, 2) * 0.8;
    rating += st.goals * 1.0 + st.assists * 0.7;
    rating += (fitnessFactor(st.fitness) - 0.9) * 1.5;
    if (!st.posFit) rating -= 0.5;
    st.rating = Math.round(clamp(rating, 0, 10) * 10) / 10;
  }

  return out;
}
