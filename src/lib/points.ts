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
import { type JokerCard, adherenceBand, ADHERENCE_MULT } from './jokers';
import { contestTotals } from './contests';
import type { TacticCard } from './tactics';
import type { TeamIntent } from './run';
import type { PointTrait } from './defining-traits';
import { definingTraitsFor } from './defining-traits';
import type { CoAppearance } from './chem';
import { chemistryLinks } from './chem';
import { PERSONALITY_THEMES } from './chemistry';
import { feedsKeep, feedsPress, feedsCreate, feedsBreak, feedsStop, feedsFinish } from './contests';

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
  /** Cards brought on as substitutes this match (Tinkerman's fresh legs). */
  subbedInIds?: Set<number>;
  /** Joga Bonito's stretch-conversion trigger fired (a creator scored). */
  jogaFired?: boolean;
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
  /** Manager shot-quality bonuses (POMO / Set Pieces FC): flat additions to the
   *  shot need, routed INSIDE the resolver's clamp via the commitment slot. */
  needBonus: { all: number; corner: number };
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

interface ManagerCtx {
  increment: number;
  formationId: string;
  subbedInIds?: Set<number>;
  jogaFired?: boolean;
}

interface ManagerOut {
  drains: Record<number, number>;
  needBonus: { all: number; corner: number };
}

const AERIAL = (c: EffCard) => c.archetype === 'Target' || c.archetype === 'Powerhouse';
const MURDERBALL_DRAIN = 6; // squad fitness per period (the attrition downside)

/**
 * MANAGER_ROSTER_V2 (design/handoff/manager-roster-v2.md): every buff is a
 * flat, ledgered PointMod applied to the cards that FEED the named contest
 * (the contestTotals partition), so a "+2 KEEP" manager genuinely moves KEEP.
 * THE LAW: buffs pay only behind the gate — contest commitment T1 for most
 * (the engine's own thresholds via contestTotals().commit), buildCount(aerial)
 * for Set Pieces FC, results (economy only) for Wheeler-Dealer. ADHERENCE
 * throttles the whole package by formation band (×1 / ×0.5 / ×0.25, rounded —
 * ±1 pieces die in foreign shapes, downsides included).
 */
function managerMods(
  joker: JokerCard,
  cards: EffCard[],
  snap: Map<number, Snap>,
  linkedIds: Set<number>,
  add: ModSink,
  ctx: ManagerCtx,
  out: ManagerOut,
): void {
  // ---- the gate (no-unconditional law) ----
  if (joker.gate.kind === 'results') return; // economy-only manager (Wheeler-Dealer)
  if (joker.gate.kind === 'commit') {
    // Feeder COUNTS are mod-independent, so the engine's own commitment step
    // (T1 thresholds inside contestTotals) is the gate: bonus > 0 ⇔ committed.
    if (contestTotals(cards).commit[joker.gate.key] <= 0) return;
  } else if (joker.gate.kind === 'buildCount') {
    if (cards.filter(AERIAL).length < joker.gate.n) return;
  }

  // ---- adherence throttle (band vs the manager's preferred formation) ----
  const mult = ADHERENCE_MULT[adherenceBand(joker, ctx.formationId)];
  const S = (v: number) => Math.round(v * mult);
  const src = `${joker.archetype} — ${joker.name}`;
  const each = (pred: (c: EffCard) => boolean, atk: number, def: number, label = src) => {
    const a = S(atk);
    const d = S(def);
    if (a === 0 && d === 0) return;
    for (const c of cards) if (pred(c)) add(c.id, { source: label, kind: 'manager', atk: a, def: d });
  };

  switch (joker.id) {
    case 'pomo': // all +1 DEF; fewer, better chances → +3 shot need
      each(() => true, 0, 1);
      out.needBonus.all += S(3);
      break;
    case 'anti_football': // all +1 DEF; back line a further +1 DEF (STOP)
      each(() => true, 0, 1);
      each(feedsStop, 0, 1);
      break;
    case 'tiki_taka': // ball-players +2 KEEP
      each(feedsKeep, 2, 0);
      break;
    case 'gegenpress': // forwards +1 PRESS +1 CREATE; finishing forwards +1 FINISH
      each((c) => c.band === 'ATT', 1, 1);
      each((c) => c.band === 'ATT' && feedsFinish(c), 1, 0);
      break;
    case 'box_office': // finishers +1 FINISH (the payout mult lives in economy)
      each(feedsFinish, 1, 0);
      break;
    case 'tinkerman': // every incoming substitute plays at +2/+2
      if (ctx.subbedInIds?.size) each((c) => ctx.subbedInIds!.has(c.id), 2, 2);
      break;
    case 'cholismo': // midfield +1 BREAK; back line +1 STOP
      each(feedsBreak, 0, 1);
      each(feedsStop, 0, 1);
      break;
    case 'murderball': { // pressers +1 PRESS, creators +1 CREATE; own squad burns
      each(feedsPress, 0, 1);
      each(feedsCreate, 1, 0);
      const burn = S(MURDERBALL_DRAIN);
      if (burn > 0) for (const c of cards) out.drains[c.id] = (out.drains[c.id] ?? 0) - burn;
      break;
    }
    case 'fergie_time': { // finishers +1 FINISH, doubled in the final periods
      const late = ctx.increment >= 3 ? 2 : 1;
      each(feedsFinish, 1 * late, 0, late === 2 ? `${src} (Fergie Time!)` : src);
      break;
    }
    case 'entertainers': // attackers +2 FINISH; back line −1 STOP (the price)
      each((c) => c.band === 'ATT', 2, 0);
      each(feedsStop, 0, -1);
      break;
    case 'total_football': { // ball-players + creators +1; position penalties waived
      each(feedsKeep, 1, 0);
      each(feedsCreate, 1, 0);
      for (const c of cards) {
        let atkPen = 0;
        let defPen = 0;
        for (const m of c.mods) {
          if (m.kind === 'position') {
            atkPen += Math.min(0, m.atk);
            defPen += Math.min(0, m.def);
          }
        }
        const a = S(-atkPen);
        const d = S(-defPen);
        if (a || d) add(c.id, { source: `${src} (total football)`, kind: 'manager', atk: a, def: d });
      }
      break;
    }
    case 'set_pieces_fc': // aerial threats +1 CREATE; corners convert far better
      each(AERIAL, 1, 0);
      out.needBonus.corner += S(8);
      break;
    case 'joga_bonito': // MID+ATT creators +1 CREATE; flair goal unlocks the squad
      each((c) => (c.band === 'MID' || c.band === 'ATT') && feedsCreate(c), 1, 0);
      if (ctx.jogaFired) each(feedsCreate, 1, 0, `${src} (flair unlocked)`);
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
  // Every lever targets the SAME cards contestTotals scores, via the feedsX
  // predicates — so the mod moves the contest the copy names.
  switch (tactic.id) {
    case 'high_line':
      each(feedsCreate, 1, 0);          // +CREATE (push up)
      each(feedsStop, 0, -1);           // −STOP (the risk of a high line)
      break;
    case 'press_high':
      each(feedsPress, 0, 2);           // +PRESS
      for (const c of cards) {
        if (c.archetype === 'Sprinter' || c.archetype === 'Engine') {
          // 0–100 fitness axis: the high press costs the runners ~9%/increment.
          out.drains[c.id] = (out.drains[c.id] ?? 0) - 9;
        }
      }
      break;
    case 'gegenpress':
      if (trailing) {
        each(feedsPress, 0, 2);         // +PRESS while chasing the game
        for (const c of cards) {
          if (feedsPress(c)) out.drains[c.id] = (out.drains[c.id] ?? 0) - 6;
        }
      }
      break;
    case 'wing_play':
      each(feedsCreate, 2, 0);          // +CREATE (was WIDE_POSITIONS — a wide DEFENDER got useless ATK)
      break;
    case 'narrow':
      each(feedsBreak, 0, 2);           // +BREAK (a compact midfield)
      break;
    case 'low_block':
      each(feedsStop, 0, 2);            // +STOP
      if (leading) each(feedsFinish, 2, 0);  // counter threat while parking → +FINISH
      break;
    case 'sit_deep':
      each(feedsStop, 0, 1);            // +STOP
      each(feedsFinish, 2, 0);          // the space behind → +FINISH
      break;
    case 'fortress':
      each(feedsStop, 0, 3);            // +STOP
      break;
    case 'man_marking':
      each(feedsBreak, 0, 2);           // +BREAK
      break;
    case 'counter_attack':
      if (trailing) each(feedsFinish, 3, 0);  // +FINISH on the break
      break;
    case 'possession':
      each(feedsKeep, 2, 0);            // +KEEP
      break;
    case 'set_piece':
      out.chances.push({ name: src, quality: 'half', p: 0.3 });
      each(feedsFinish, 1, 0);          // +FINISH from dead balls
      break;
    case 'dark_arts':
      // GATED (Card Shark #2): the leveller. The dark arts only come out when
      // you're NOT ahead — level or chasing — so it's a situational play, not a
      // free universal debuff you auto-include every match.
      if (!leading) {
        out.enemyMods.push({ source: src, who: 'star', atk: -1, def: -1 });
        // 0–100 fitness axis: a ~25% knock on their star's legs.
        out.enemyDrains.push({ source: src, amount: -25 });
      }
      break;
    case 'youth_policy':
      // GATED (Card Shark #2): "fresh legs" now lifts only the TIRED — a late-game
      // (60'+) +2/+2 to any starter under 70% fitness, not a blanket whole-XI buff.
      // A rested XI gets little; a jaded one gets rescued — its real identity.
      if (ctx.increment >= 3) each((c) => c.fitness < 70, 2, 2);
      break;
    case 'overload_left':
      each((c) => c.lane === 'L' && feedsCreate(c), 2, 0);  // attackers in the L lane → +CREATE
      break;
    case 'overload_right':
      each((c) => c.lane === 'R' && feedsCreate(c), 2, 0);  // attackers in the R lane → +CREATE
      break;
    case 'route_one':
      out.chances.push({ name: src, quality: 'half', p: 0.25 });
      each(feedsFinish, 1, 0);          // +FINISH aerial
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
  const needBonus = { all: 0, corner: 0 };
  const managerCtx: ManagerCtx = {
    increment,
    formationId: formation.id,
    subbedInIds: input.subbedInIds,
    jogaFired: input.jogaFired,
  };
  for (const joker of jokers) managerMods(joker, cards, snap, linkedIds, add, managerCtx, { drains: ownDrains, needBonus });
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
    personalityLabel, perfectDressingRoom, links, needBonus,
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
