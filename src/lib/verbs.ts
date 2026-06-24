/**
 * Kickoff Clash — Verb Dispatcher + TraitRecord runtime (engine v1 spine)
 *
 * Canonical references: KICKOFF_CLASH_DESIGN §2/§9, ARCHETYPES_V1 §1/§5,
 * CARDS_V1 §2, MATCH_ENGINE_V1 §5/§7/§9 (see /docs).
 *
 * Load-bearing idea (DESIGN §2): every mechanical thing — player traits,
 * Tactical cards, the Manager, archetype "identities" — is a *record* over one
 * closed palette of ~10 verbs. The palette is implemented once, here;
 * everything else is data (`role-transforms.ts`). There is deliberately NO
 * archetype/identity object anywhere in the codebase.
 *
 * A verb is a pure function over field accumulators / state. The dispatcher is
 * side-agnostic over both XIs: it collects every applicable record, then
 * resolves phase by phase (MATCH_ENGINE §7) using a snapshot-read + delta-pool
 * rule:
 *
 *   - At the start of each (phase, priority) sub-pass the live field is
 *     snapshotted (frozen). Every record reads its source card's base-emit
 *     snapshot and writes its contribution into a separate delta pool; the pool
 *     is folded back into the field only after all records have run.
 *   - Because reads come from one immutable snapshot and writes are additive
 *     into a pool, record order within a sub-pass cannot change the result — the
 *     field math is commutative, hence deterministic (a False 9 and an inside
 *     forward both touching central zones commute).
 *   - `priority` is the escape hatch: a higher priority runs in a later sub-pass
 *     and therefore can observe the folded result of lower priorities, for the
 *     genuinely order-dependent case only.
 *
 * Determinism: stable iteration (cards sorted by id), RNG seeded from
 * `(seed, increment, cardId)`.
 */

import { seededRandom } from './scoring';
import type { Cell, Band, Lane } from './field';
import { CELLS, bandOf, laneOf } from './field';

// ---------------------------------------------------------------------------
// Palette (DESIGN §2, ARCHETYPES §1)
// ---------------------------------------------------------------------------

/** The closed verb palette. Nothing outside this list exists in the engine. */
export type VerbName =
  | 'relocate'                // move a card's emission between zones (conserves total)
  | 'amplify'                 // scale power in a cell (zone / self / a criterion card)
  | 'amplify-inverse-power'   // scale weighted by (1 − power/100): lifts weak cards
  | 'deny'                    // debuff the opposing side's power in a zone
  | 'drain-energy'            // StateEffect — reduce action energy (deferred: step 3)
  | 'restore-energy'          // StateEffect — raise own energy (deferred: step 3)
  | 'drain-fitness'           // StateEffect — chip a card's fitness (deferred: step 3)
  | 'generate'                // add flat value to a zone / resource
  | 'dampen-variance'         // compress Poisson dispersion (resolveIncrement xG step)
  | 'amplify-variance';       // fatten Poisson tails (resolveIncrement xG step)

/** Field verbs carry a resolve phase; resource/condition verbs are StateEffects. */
export type VerbPhase = 'relocate' | 'scale' | 'debuff-opponent' | 'variance' | 'state';

export const VERB_PHASE: Record<VerbName, VerbPhase> = {
  relocate: 'relocate',
  amplify: 'scale',
  'amplify-inverse-power': 'scale',
  generate: 'scale',
  deny: 'debuff-opponent',
  'dampen-variance': 'variance',
  'amplify-variance': 'variance',
  'drain-energy': 'state',
  'restore-energy': 'state',
  'drain-fitness': 'state',
};

/** Fixed phase order (MATCH_ENGINE §7). */
export const PHASE_ORDER: VerbPhase[] = ['relocate', 'scale', 'debuff-opponent', 'variance', 'state'];

// ---------------------------------------------------------------------------
// TraitRecord (CARDS §2)
// ---------------------------------------------------------------------------

/**
 * The four emission *kinds* a card contributes. Each of the 9 field cells
 * (MATCH_ENGINE §4) holds one accumulator per kind, so the field is a 9×4 grid.
 * Band intuition (§4): ATT≈finishing, MID≈creation — applied when the host
 * projects cells back onto the scalar chance model, not here.
 */
export type ZoneName = 'attack' | 'defence' | 'creation' | 'finishing';

export const ZONES: ZoneName[] = ['attack', 'defence', 'creation', 'finishing'];

export type CriterionName =
  | 'all-teammates'
  | 'lowest-power'
  | 'highest-power'
  | 'attackers'
  | 'defenders'
  | 'archetype';

export type TraitTarget =
  | { kind: 'zone'; zone: ZoneName }
  | { kind: 'self' }
  | { kind: 'criterion'; criterion: CriterionName; archetype?: string; zone?: ZoneName }
  | { kind: 'enemyCard'; criterion?: CriterionName; archetype?: string; zone?: ZoneName };

/** Conditions are data, not closures, so a record stays fully declarative. */
export type TraitCondition =
  | { kind: 'always' }
  | { kind: 'is-attacking' }
  | { kind: 'is-defending' }
  | { kind: 'in-wide-slot' }
  | { kind: 'in-position'; positions: string[] }
  | { kind: 'archetype'; archetype?: string; anyOf?: string[] };

export interface TraitRecord {
  name: string;
  verb: VerbName;
  params: Record<string, number>;
  /** Reach (CARDS §2): own cell / a lane-zone / the whole field. */
  scope: 'slot' | 'zone' | 'global';
  target: TraitTarget;
  condition?: TraitCondition;
  /**
   * Destination for `relocate`, relative to the owner's own cell. Each axis left
   * unset keeps the owner's: `{ lane: 'C' }` cuts inside (same band, central lane),
   * `{ band: 'MID' }` drops deep (same lane, one band back).
   */
  to?: { lane?: Lane; band?: Band };
  /** Escape hatch: a higher priority runs in a later sub-pass. Default 0. */
  priority?: number;
}

// ---------------------------------------------------------------------------
// Dispatch input / output
// ---------------------------------------------------------------------------

export interface DispatchCard {
  id: number;
  power: number;
  archetype: string;
  tacticalRole?: string;
  position: string;
  team: 'player' | 'opponent';
  side: 'attack' | 'defence';
  isWide: boolean;
  /** Which of the 9 field cells this card occupies (§4). */
  cell: Cell;
  /** Base emission into each kind (computed by the host before dispatch). */
  emit: Record<ZoneName, number>;
  traits: TraitRecord[];
  /**
   * Squad-wide effect emitters (Tactical cards, the Manager) ride a synthetic
   * source: their traits are collected and run, but the source never emits power
   * and is excluded from criterion targeting (so e.g. Anchor never shields it).
   */
  source?: boolean;
}

export interface FieldState {
  /** 9×4 grid: each cell holds one accumulator per emission kind (§4). */
  cells: Record<Cell, Record<ZoneName, number>>;
  /** Accumulated denial applied to the opponent (0..1-ish; capped downstream). */
  opponentDenial: number;
  /** Outcome-spread shaping for the xG step; >0 widens, <0 narrows. Neutral at 0. */
  variance: number;
  /** StateEffect sinks (inert until energy/slots land in step 3). */
  energy: Map<number, number>;
  fitness: Map<number, number>;
}

export interface TraitLogLine {
  cardId: number;
  trait: string;
  verb: VerbName;
  zone?: ZoneName;
  value: number;
  note: string;
}

export interface DispatchResult {
  /** The transformed 9×4 grid. */
  cells: Record<Cell, Record<ZoneName, number>>;
  /** Aggregate over all cells, per kind (drives the scalar attack/defence scores). */
  zones: Record<ZoneName, number>;
  /** Σ attack per lane (the coupled contest's push vector, §4). */
  lanePush: Record<Lane, number>;
  /** Σ defence per lane (the coupled contest's cover vector, §4). */
  laneCover: Record<Lane, number>;
  opponentDenial: number;
  variance: number;
  energy: Map<number, number>;
  fitness: Map<number, number>;
  log: TraitLogLine[];
}

// ---------------------------------------------------------------------------
// Seeded RNG keyed on (seed, increment, cardId) — MATCH_ENGINE §7
// ---------------------------------------------------------------------------

export function traitRng(seed: number, increment: number, cardId: number, salt = 0): number {
  const mixed =
    (((seed * 73856093) ^ (increment * 19349663) ^ (cardId * 83492791) ^ (salt * 2654435761)) >>> 0);
  return seededRandom(mixed);
}

/** Stable integer salt from a trait name (order-independent RNG keying). */
function nameSalt(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// FieldState helpers
// ---------------------------------------------------------------------------

function zeroZones(): Record<ZoneName, number> {
  return { attack: 0, defence: 0, creation: 0, finishing: 0 };
}

function emptyCells(): Record<Cell, Record<ZoneName, number>> {
  const cells = {} as Record<Cell, Record<ZoneName, number>>;
  for (const cell of CELLS) cells[cell] = zeroZones();
  return cells;
}

function emptyField(cells: Record<Cell, Record<ZoneName, number>>): FieldState {
  return { cells, opponentDenial: 0, variance: 0, energy: new Map(), fitness: new Map() };
}

/** Synthesize the non-emitting owner that carries a side's squad-wide records. */
function makeSquadSource(id: number, team: 'player' | 'opponent', traits: TraitRecord[]): DispatchCard {
  return {
    id, power: 0, archetype: '__squad__', position: '', team, side: 'attack',
    isWide: false, cell: 'MID_C', emit: zeroZones(), traits, source: true,
  };
}

/** Place each card's base emission into the cell it occupies (the pre-transform field). */
export function buildBaseCells(cards: DispatchCard[]): Record<Cell, Record<ZoneName, number>> {
  const cells = emptyCells();
  for (const card of cards) {
    for (const z of ZONES) cells[card.cell][z] += card.emit[z];
  }
  return cells;
}

function cloneCells(cells: Record<Cell, Record<ZoneName, number>>): Record<Cell, Record<ZoneName, number>> {
  const out = {} as Record<Cell, Record<ZoneName, number>>;
  for (const cell of CELLS) out[cell] = { ...cells[cell] };
  return out;
}

function cloneField(f: FieldState): FieldState {
  return {
    cells: cloneCells(f.cells),
    opponentDenial: f.opponentDenial,
    variance: f.variance,
    energy: new Map(f.energy),
    fitness: new Map(f.fitness),
  };
}

function addToMap(map: Map<number, number>, id: number, value: number): void {
  map.set(id, (map.get(id) ?? 0) + value);
}

/** Fold an additive delta pool into the live field. */
function foldDelta(field: FieldState, pool: FieldState): void {
  for (const cell of CELLS) {
    for (const z of ZONES) field.cells[cell][z] += pool.cells[cell][z];
  }
  field.opponentDenial += pool.opponentDenial;
  field.variance += pool.variance;
  for (const [id, v] of pool.energy) addToMap(field.energy, id, v);
  for (const [id, v] of pool.fitness) addToMap(field.fitness, id, v);
}

/** Sum a transformed grid back into per-kind totals. */
function aggregateZones(cells: Record<Cell, Record<ZoneName, number>>): Record<ZoneName, number> {
  const z = zeroZones();
  for (const cell of CELLS) {
    for (const k of ZONES) z[k] += cells[cell][k];
  }
  return z;
}

/** Collapse the grid into per-lane attack push and defensive cover (§4). */
function laneVectors(cells: Record<Cell, Record<ZoneName, number>>): {
  push: Record<Lane, number>;
  cover: Record<Lane, number>;
} {
  const push: Record<Lane, number> = { L: 0, C: 0, R: 0 };
  const cover: Record<Lane, number> = { L: 0, C: 0, R: 0 };
  for (const cell of CELLS) {
    const lane = laneOf(cell);
    push[lane] += cells[cell].attack;
    cover[lane] += cells[cell].defence;
  }
  return { push, cover };
}

// ---------------------------------------------------------------------------
// Conditions (declarative; evaluated against the owner card)
// ---------------------------------------------------------------------------

function conditionHolds(condition: TraitCondition | undefined, owner: DispatchCard): boolean {
  if (!condition) return true;
  switch (condition.kind) {
    case 'always': return true;
    case 'is-attacking': return owner.side === 'attack';
    case 'is-defending': return owner.side === 'defence';
    case 'in-wide-slot': return owner.isWide;
    case 'in-position': return condition.positions.includes(owner.position);
    case 'archetype':
      return condition.anyOf
        ? condition.anyOf.includes(owner.archetype)
        : owner.archetype === condition.archetype;
    default: return true;
  }
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

interface VerbContext {
  record: TraitRecord;
  owner: DispatchCard;
  team: DispatchCard[];
  enemies: DispatchCard[];
  snapshot: FieldState;
  pool: FieldState;
  log: TraitLogLine[];
}

function resolveTargetCards(ctx: VerbContext): DispatchCard[] {
  const { record, owner, team, enemies } = ctx;
  switch (record.target.kind) {
    case 'self':
      return [owner];
    case 'criterion':
      return pickByCriterion(team, record.target);
    case 'enemyCard':
      return pickByCriterion(enemies, record.target);
    case 'zone':
    default:
      return [];
  }
}

function pickByCriterion(
  cards: DispatchCard[],
  target: { criterion?: CriterionName; archetype?: string },
): DispatchCard[] {
  if (cards.length === 0) return [];
  switch (target.criterion) {
    case 'lowest-power':
      return [[...cards].sort((a, b) => a.power - b.power || a.id - b.id)[0]];
    case 'highest-power':
      return [[...cards].sort((a, b) => b.power - a.power || a.id - b.id)[0]];
    case 'attackers':
      return cards.filter((c) => c.side === 'attack');
    case 'defenders':
      return cards.filter((c) => c.side === 'defence');
    case 'archetype':
      return cards.filter((c) => c.archetype === target.archetype);
    case 'all-teammates':
    case undefined:
    default:
      return cards;
  }
}

/** Which zones a card-targeted scale touches: a named zone, else all the card emits into. */
function targetZones(target: TraitTarget, card: DispatchCard): ZoneName[] {
  const named = target.kind === 'criterion' || target.kind === 'enemyCard' ? target.zone : undefined;
  if (named) return [named];
  return ZONES.filter((z) => card.emit[z] !== 0);
}

// ---------------------------------------------------------------------------
// Verb implementations — pure functions over snapshot → delta pool
// ---------------------------------------------------------------------------

const VERBS: Record<VerbName, (ctx: VerbContext) => void> = {
  // Move a fraction of the owner's emission from its own cell to a neighbouring
  // cell (a real lane/band shift, §4). Conserves every kind's grand total
  // (ARCHETYPES §1; MATCH_ENGINE §9 inside-forward "cut inside" / False 9 "drop deep").
  relocate(ctx) {
    const { record, owner, pool } = ctx;
    const fraction = record.params.fraction ?? 0;
    if (fraction === 0) return;
    const destBand: Band = record.to?.band ?? bandOf(owner.cell);
    const destLane: Lane = record.to?.lane ?? laneOf(owner.cell);
    const dest = `${destBand}_${destLane}` as Cell;
    if (dest === owner.cell) return; // already there → no-op
    let moved = false;
    for (const z of ZONES) {
      const amt = owner.emit[z] * fraction;
      if (amt === 0) continue;
      pool.cells[owner.cell][z] -= amt;
      pool.cells[dest][z] += amt;
      moved = true;
    }
    if (moved) pushLog(ctx, 'attack', owner.emit.attack * fraction, `relocate ${owner.cell}→${dest}`);
  },

  // Scale power in a cell. scope 'global' + zone → whole zone; scope 'slot'/'self' →
  // the owner's own emission; criterion/enemyCard → the selected card's emission.
  amplify(ctx) {
    const { record, owner, snapshot, pool } = ctx;
    const amount = record.params.amount ?? 0;

    if (record.target.kind === 'zone') {
      const zone = record.target.zone;
      if (record.scope === 'global') {
        // Scale that kind across every cell, reading the frozen snapshot.
        let delta = 0;
        for (const cell of CELLS) {
          const d = snapshot.cells[cell][zone] * amount;
          if (d === 0) continue;
          pool.cells[cell][zone] += d;
          delta += d;
        }
        pushLog(ctx, zone, delta, `${Math.round(amount * 100)}% zone`);
      } else {
        // Own emission into that kind, landing in the owner's own cell.
        const delta = owner.emit[zone] * amount;
        pool.cells[owner.cell][zone] += delta;
        pushLog(ctx, zone, delta, `${Math.round(amount * 100)}% own`);
      }
      return;
    }

    const cards = record.target.kind === 'self' ? [owner] : resolveTargetCards(ctx);
    for (const card of cards) {
      for (const zone of targetZones(record.target, card)) {
        const delta = card.emit[zone] * amount;
        pool.cells[card.cell][zone] += delta;
        pushLog(ctx, zone, delta, `+${Math.round(amount * 100)}% (#${card.id})`);
      }
    }
  },

  // Scale a card set weighted inversely to power (ARCHETYPES §1: amount × (1 − power/100)),
  // lifting the weakest most. Generalises Anchor → "Strong Leader" (ARCHETYPES §5).
  'amplify-inverse-power'(ctx) {
    const { record, pool } = ctx;
    const amount = record.params.amount ?? 0;
    for (const card of resolveTargetCards(ctx)) {
      const weight = amount * (1 - card.power / 100);
      for (const zone of targetZones(record.target, card)) {
        const delta = card.emit[zone] * weight;
        pool.cells[card.cell][zone] += delta;
        pushLog(ctx, zone, delta, `+${(weight * 100).toFixed(1)}% (#${card.id})`);
      }
    }
  },

  // Debuff the opposing side's conversion (step 1: reduces opponent goal chance).
  deny(ctx) {
    const amount = ctx.record.params.amount ?? 0;
    ctx.pool.opponentDenial += amount;
    pushLog(ctx, undefined, amount, `deny opponent −${Math.round(amount * 100)}%`);
  },

  // Add flat value to a kind from nothing (e.g. set-piece xG), in the owner's cell.
  generate(ctx) {
    const { record, owner, pool } = ctx;
    if (record.target.kind !== 'zone') return;
    const amount = record.params.amount ?? 0;
    pool.cells[owner.cell][record.target.zone] += amount;
    pushLog(ctx, record.target.zone, amount, `generate +${Math.round(amount)}`);
  },

  'dampen-variance'(ctx) {
    const amount = ctx.record.params.amount ?? 0;
    ctx.pool.variance -= amount;
    pushLog(ctx, undefined, -amount, `dampen variance`);
  },

  'amplify-variance'(ctx) {
    const amount = ctx.record.params.amount ?? 0;
    ctx.pool.variance += amount;
    pushLog(ctx, undefined, amount, `amplify variance`);
  },

  // ---- StateEffects: per-card energy/fitness sinks (inert until step 3) ----
  'drain-energy'(ctx) {
    const amount = ctx.record.params.amount ?? 0;
    for (const card of resolveTargetCards(ctx)) addToMap(ctx.pool.energy, card.id, -amount);
  },
  'restore-energy'(ctx) {
    const amount = ctx.record.params.amount ?? 0;
    for (const card of resolveTargetCards(ctx)) addToMap(ctx.pool.energy, card.id, amount);
  },
  'drain-fitness'(ctx) {
    const amount = ctx.record.params.amount ?? 0;
    for (const card of resolveTargetCards(ctx)) addToMap(ctx.pool.fitness, card.id, -amount);
  },
};

function pushLog(ctx: VerbContext, zone: ZoneName | undefined, value: number, note: string): void {
  ctx.log.push({ cardId: ctx.owner.id, trait: ctx.record.name, verb: ctx.record.verb, zone, value, note });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

interface CollectedRecord {
  record: TraitRecord;
  owner: DispatchCard;
}

/**
 * Collect every applicable record from both XIs, then resolve phase by phase
 * with the snapshot-read + delta-pool commutativity rule and the `priority`
 * escape hatch. Deterministic for a fixed (cards, seed, increment).
 */
/** Squad-wide records (Tactical cards + Manager) applied per side, not tied to a card. */
export interface SquadTraits {
  playerSquadTraits?: TraitRecord[];
  opponentSquadTraits?: TraitRecord[];
}

export function dispatchTraits(
  cards: DispatchCard[],
  seed: number,
  increment: number,
  squad?: SquadTraits,
): DispatchResult {
  // The pre-transform field is just every card's emission placed in its cell.
  const field = emptyField(buildBaseCells(cards));
  const log: TraitLogLine[] = [];

  // Tactical cards and the Manager ride a synthetic source owner per side, so their
  // effects flow through the same palette as player traits.
  const sources: DispatchCard[] = [];
  if (squad?.playerSquadTraits?.length) sources.push(makeSquadSource(-1, 'player', squad.playerSquadTraits));
  if (squad?.opponentSquadTraits?.length) sources.push(makeSquadSource(-2, 'opponent', squad.opponentSquadTraits));

  // Stable iteration: cards by id, each card's trait order preserved. Sources are
  // collected (their traits run) but kept out of the targetable team pools.
  const ordered = [...cards, ...sources].sort((a, b) => a.id - b.id);
  const playerTeam = ordered.filter((c) => c.team === 'player' && !c.source);
  const opponentTeam = ordered.filter((c) => c.team === 'opponent' && !c.source);

  const collected: CollectedRecord[] = [];
  for (const owner of ordered) {
    for (const record of owner.traits) {
      if (conditionHolds(record.condition, owner)) collected.push({ record, owner });
    }
  }

  for (const phase of PHASE_ORDER) {
    const inPhase = collected.filter((c) => VERB_PHASE[c.record.verb] === phase);
    if (inPhase.length === 0) continue;

    const priorities = [...new Set(inPhase.map((c) => c.record.priority ?? 0))].sort((a, b) => a - b);

    for (const priority of priorities) {
      const snapshot = Object.freeze(cloneField(field));
      const pool = emptyField(emptyCells());

      for (const { record, owner } of inPhase) {
        if ((record.priority ?? 0) !== priority) continue;
        // Probabilistic records (e.g. Trequartista) roll a seeded gate. The salt
        // is name-derived so the roll is stable regardless of iteration order.
        if (record.params.chance !== undefined) {
          const roll = traitRng(seed, increment, owner.id, nameSalt(record.name));
          if (roll >= record.params.chance) continue;
        }
        const team = owner.team === 'player' ? playerTeam : opponentTeam;
        const enemies = owner.team === 'player' ? opponentTeam : playerTeam;
        VERBS[record.verb]({ record, owner, team, enemies, snapshot, pool, log });
      }

      foldDelta(field, pool);
    }
  }

  const { push, cover } = laneVectors(field.cells);
  return {
    cells: field.cells,
    zones: aggregateZones(field.cells),
    lanePush: push,
    laneCover: cover,
    opponentDenial: field.opponentDenial,
    variance: field.variance,
    energy: field.energy,
    fitness: field.fitness,
    log,
  };
}
