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
 * Step-1 proto-zones. The full 3×3 cell field is step 2 (MATCH_ENGINE §4); for
 * the spine we project onto the four scoring axes `evaluateSplit` already
 * produces. Band intuition: ATT≈finishing, MID≈creation.
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
  /** Source zone for `relocate` (destination is `target.zone`). */
  from?: ZoneName;
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
  /** Base emission into each zone (computed by the host before dispatch). */
  emit: Record<ZoneName, number>;
  traits: TraitRecord[];
}

export interface FieldState {
  /** Absolute zone accumulators (seeded from base emission, transformed in place). */
  zones: Record<ZoneName, number>;
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
  zones: Record<ZoneName, number>;
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

function emptyField(zones: Record<ZoneName, number>): FieldState {
  return { zones, opponentDenial: 0, variance: 0, energy: new Map(), fitness: new Map() };
}

function cloneField(f: FieldState): FieldState {
  return {
    zones: { ...f.zones },
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
  for (const z of ZONES) field.zones[z] += pool.zones[z];
  field.opponentDenial += pool.opponentDenial;
  field.variance += pool.variance;
  for (const [id, v] of pool.energy) addToMap(field.energy, id, v);
  for (const [id, v] of pool.fitness) addToMap(field.fitness, id, v);
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
  // Move a fraction of the source card's emission from one zone to another.
  // Conserves total field power (ARCHETYPES §1, MATCH_ENGINE §9 inside-forward/False-9).
  relocate(ctx) {
    const { record, owner, pool } = ctx;
    if (record.target.kind !== 'zone' || !record.from) return;
    const fraction = record.params.fraction ?? 0;
    const moved = owner.emit[record.from] * fraction;
    if (moved === 0) return;
    pool.zones[record.from] -= moved;
    pool.zones[record.target.zone] += moved;
    pushLog(ctx, record.target.zone, moved, `relocate ${record.from}→${record.target.zone}`);
  },

  // Scale power in a cell. scope 'global' + zone → whole zone; scope 'slot'/'self' →
  // the owner's own emission; criterion/enemyCard → the selected card's emission.
  amplify(ctx) {
    const { record, owner, snapshot, pool } = ctx;
    const amount = record.params.amount ?? 0;

    if (record.target.kind === 'zone') {
      if (record.scope === 'global') {
        const delta = snapshot.zones[record.target.zone] * amount;
        pool.zones[record.target.zone] += delta;
        pushLog(ctx, record.target.zone, delta, `${Math.round(amount * 100)}% zone`);
      } else {
        // own emission into that zone
        const delta = owner.emit[record.target.zone] * amount;
        pool.zones[record.target.zone] += delta;
        pushLog(ctx, record.target.zone, delta, `${Math.round(amount * 100)}% own`);
      }
      return;
    }

    const cards = record.target.kind === 'self' ? [owner] : resolveTargetCards(ctx);
    for (const card of cards) {
      for (const zone of targetZones(record.target, card)) {
        const delta = card.emit[zone] * amount;
        pool.zones[zone] += delta;
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
        pool.zones[zone] += delta;
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

  // Add flat value to a zone from nothing (e.g. set-piece xG).
  generate(ctx) {
    const { record, pool } = ctx;
    if (record.target.kind !== 'zone') return;
    const amount = record.params.amount ?? 0;
    pool.zones[record.target.zone] += amount;
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
export function dispatchTraits(
  cards: DispatchCard[],
  baseZones: Record<ZoneName, number>,
  seed: number,
  increment: number,
): DispatchResult {
  const field = emptyField({ ...baseZones });
  const log: TraitLogLine[] = [];

  // Stable iteration: cards by id, each card's trait order preserved.
  const ordered = [...cards].sort((a, b) => a.id - b.id);
  const playerTeam = ordered.filter((c) => c.team === 'player');
  const opponentTeam = ordered.filter((c) => c.team === 'opponent');

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
      const pool = emptyField(zeroZones());

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

  return {
    zones: field.zones,
    opponentDenial: field.opponentDenial,
    variance: field.variance,
    energy: field.energy,
    fitness: field.fitness,
    log,
  };
}
