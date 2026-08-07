import type {
  ActionEffect,
  BreakIndex,
  ChanceSelector,
  ChanceType,
  EffectDuration,
  PeriodNumber,
  Sector,
  TeamSide,
} from '../../lib/match-v7/types';
import type { ResolvedTarget } from './targets';

// The effect ledger is the ONLY thing an action produces about the match world.
// Actions never reach into V7MatchState and mutate scores, stats or chances —
// they append declarative LedgerEffect records that a later resolver reads and
// applies. Every record is deterministic: same source + coordinates ⇒ same id.

/** Where a ledger effect was born. Drives rebuild + expiry policy. */
export type EffectOrigin =
  | 'game_start'
  | 'ongoing'
  | 'activated'
  | 'end_of_period'
  | 'subbed_on'
  | 'subbed_off';

/**
 * How long a ledger effect lives, expressed independently of match state so
 * `expiry.ts` can decide survival from a boundary alone.
 *  - `immediate`: consumed within the resolution that produced it.
 *  - `break`: lasts to the end of the named break.
 *  - `period`: lasts to the end of `untilPeriod` (inclusive).
 *  - `while_active`: tied to its source action being enabled (ongoing effects).
 *  - `until_used`: persists until something consumes it (charge-like).
 *  - `match`: persists to the final whistle.
 */
export type EffectLifetime =
  | { kind: 'immediate' }
  | { kind: 'break'; period: PeriodNumber; breakIndex: BreakIndex }
  | { kind: 'period'; untilPeriod: PeriodNumber }
  | { kind: 'while_active' }
  | { kind: 'until_used' }
  | { kind: 'match' };

/** The coordinates an effect is created at, and where it first applies. */
export interface EffectCoords {
  /** The period recorded on match state when the effect was created. */
  period: PeriodNumber;
  /** The break the effect was created in; 0 when created mid-period. */
  breakIndex: BreakIndex | 0;
  /** The period the effect first takes hold in (usually the upcoming period). */
  effectivePeriod: PeriodNumber;
}

/** Identity of the action instance that produced an effect. */
export interface EffectSource {
  instanceId: string;
  actionId: string;
  cardId: string;
  actionName: string;
  side: TeamSide;
  origin: EffectOrigin;
}

export interface ChanceTokenTarget {
  side: 'own' | 'enemy';
  selector: ChanceSelector;
  chanceTypes?: ChanceType[];
}

/** A materialised, resolved effect sitting in the ledger. */
export interface LedgerEffect {
  id: string;
  side: TeamSide;
  origin: EffectOrigin;
  sourceInstanceId: string;
  sourceActionId: string;
  sourceCardId: string;
  actionName: string;
  effect: ActionEffect;
  targetIds: string[];
  sector?: Sector;
  slotKey?: string;
  /**
   * For chance-targeting effects, the resolved target preserved verbatim from
   * the action: whose chances (relative to this effect's acting `side`), which
   * tokens, and optionally which football types. Period resolution consumes
   * this directly, so token ownership/type is never inferred from effect names.
   */
  tokenTarget?: ChanceTokenTarget;
  createdPeriod: PeriodNumber;
  createdBreakIndex: BreakIndex | 0;
  lifetime: EffectLifetime;
}

function clampPeriod(period: number): PeriodNumber {
  const clamped = Math.min(4, Math.max(1, period));
  return clamped as PeriodNumber;
}

/**
 * Translate a printed {@link EffectDuration} into a state-independent
 * {@link EffectLifetime}. `durationPeriods` only matters for `fixed_periods`.
 */
export function effectLifetime(
  duration: EffectDuration,
  coords: EffectCoords,
  durationPeriods = 1,
): EffectLifetime {
  switch (duration) {
    case 'instant':
      return { kind: 'immediate' };
    case 'this_break':
      return coords.breakIndex === 0
        ? { kind: 'immediate' }
        : { kind: 'break', period: coords.period, breakIndex: coords.breakIndex };
    case 'current_period':
      return { kind: 'period', untilPeriod: coords.effectivePeriod };
    case 'next_period':
      return { kind: 'period', untilPeriod: clampPeriod(coords.effectivePeriod + 1) };
    case 'fixed_periods':
      return { kind: 'period', untilPeriod: clampPeriod(coords.effectivePeriod + Math.max(0, durationPeriods - 1)) };
    case 'ongoing':
    case 'while_active':
    case 'until_disabled':
      return { kind: 'while_active' };
    case 'until_used':
      return { kind: 'until_used' };
    case 'whole_match':
    case 'match_permanent':
      return { kind: 'match' };
  }
}

/**
 * Materialise every effect an action carries into ledger records. One printed
 * {@link ActionEffect} becomes one {@link LedgerEffect}; the action's single
 * `duration` decides every record's lifetime. Ids are deterministic.
 */
export function buildLedgerEffects(
  source: EffectSource,
  effects: readonly ActionEffect[],
  resolved: ResolvedTarget,
  coords: EffectCoords,
  duration: EffectDuration,
  durationPeriods?: number,
): LedgerEffect[] {
  const lifetime = effectLifetime(duration, coords, durationPeriods);
  return effects.map((effect, index) => ({
    id: `eff:${source.side}:${source.instanceId}:${source.origin}:${coords.period}:${coords.breakIndex}:${index}`,
    side: source.side,
    origin: source.origin,
    sourceInstanceId: source.instanceId,
    sourceActionId: source.actionId,
    sourceCardId: source.cardId,
    actionName: source.actionName,
    effect,
    targetIds: [...resolved.playerIds],
    ...(resolved.sector !== undefined ? { sector: resolved.sector } : {}),
    ...(resolved.slotKey !== undefined ? { slotKey: resolved.slotKey } : {}),
    ...(resolved.chanceSelector !== undefined
      ? {
          tokenTarget: {
            side: resolved.chanceSide ?? 'own',
            selector: resolved.chanceSelector,
            ...(resolved.chanceTypes ? { chanceTypes: [...resolved.chanceTypes] } : {}),
          },
        }
      : {}),
    createdPeriod: coords.period,
    createdBreakIndex: coords.breakIndex,
    lifetime,
  }));
}

/** Append effects immutably. */
export function appendEffects(
  ledger: readonly LedgerEffect[],
  incoming: readonly LedgerEffect[],
): LedgerEffect[] {
  return [...ledger, ...incoming];
}

/** All ledger effects produced by a given action instance. */
export function effectsFromSource(ledger: readonly LedgerEffect[], instanceId: string): LedgerEffect[] {
  return ledger.filter((effect) => effect.sourceInstanceId === instanceId);
}

/** Drop every effect produced by a given action instance. */
export function dropEffectsFromSource(ledger: readonly LedgerEffect[], instanceId: string): LedgerEffect[] {
  return ledger.filter((effect) => effect.sourceInstanceId !== instanceId);
}

/** Clear one side's effects of a given origin (used before an ongoing rebuild). */
export function dropOriginForSide(
  ledger: readonly LedgerEffect[],
  origin: EffectOrigin,
  side: TeamSide,
): LedgerEffect[] {
  return ledger.filter((effect) => !(effect.origin === origin && effect.side === side));
}

/**
 * Read-time safety net: hide `while_active` effects whose source action is
 * disabled. The ongoing rebuild is the primary path for this, but a resolver
 * that reads the ledger between rebuilds gets the same guarantee.
 */
export function filterActiveEffects(
  ledger: readonly LedgerEffect[],
  disabledInstanceIds: ReadonlySet<string>,
): LedgerEffect[] {
  return ledger.filter(
    (effect) => !(effect.lifetime.kind === 'while_active' && disabledInstanceIds.has(effect.sourceInstanceId)),
  );
}
