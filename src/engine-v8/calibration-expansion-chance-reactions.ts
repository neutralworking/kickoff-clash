export * from './calibration-expansion-runtime';

import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import { isV8ChanceType, type V8TacticalCardInstance } from './tactical';
import * as runtime from './calibration-expansion-runtime';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: runtime.V8CalibrationSide): runtime.V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

function cavaniCounterKey(runtimeId: string): string {
  return `cavani-get-across-him:${runtimeId}`;
}

function yashinCounterKey(runtimeId: string): string {
  return `yashin-black-spider:${runtimeId}`;
}

function activeCavani(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  zone: V8Zone,
): runtime.V8CalibrationRuntimePlayer | undefined {
  return runtime.calibrationPlayersInZone(state, side, zone)
    .filter((player) =>
      player.cardId === 'cavani'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[cavaniCounterKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function activeYashin(
  state: runtime.V8CalibrationState,
  attackingSide: runtime.V8CalibrationSide,
  attackingZone: V8Zone,
): runtime.V8CalibrationRuntimePlayer | undefined {
  if (attackingZone !== 'ATT') return undefined;
  const defendingSide = otherSide(attackingSide);
  return runtime.calibrationPlayersInZone(state, defendingSide, runtime.opposingDepthZone(attackingZone))
    .filter((player) =>
      player.cardId === 'yashin'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[yashinCounterKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function latestResolution(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationTacticalResolution | undefined {
  return [...state.tacticalResolutions].reverse()
    .find((resolution) => resolution.side === side && resolution.cardId === cardId);
}

function makeChanceUncancellable(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationState {
  const next = clone(state);
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (entry?.kind === 'tactical') entry.card.cancellable = false;
  return next;
}

/**
 * GET ACROSS HIM only intervenes when a Cross would actually be cancelled. The cancelled attempt is
 * discarded and replayed once from the identical pre-resolution state as uncancellable, so Energy,
 * first-Chance counters and specialist effects are consumed exactly once in the accepted result.
 */
function interceptCancelledCross(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean },
): runtime.V8CalibrationState {
  const original = runtime.calibrationHandTacticals(before, side).find((card) => card.id === cardId);
  if (!original || original.type !== 'cross') return after;
  const resolution = latestResolution(after, side, cardId);
  if (!resolution?.cancelled) return after;

  const cavani = activeCavani(before, side, zone);
  if (!cavani) return after;

  const protectedState = makeChanceUncancellable(before, side, cardId);
  let retried = runtime.playCalibrationTactical(protectedState, side, cardId, zone, options);
  retried = clone(retried);
  retried.periodCounters[cavaniCounterKey(cavani.runtimeId)] = 1;
  retried.events.push({
    type: 'action_triggered',
    period: retried.period,
    text: `${getV8CalibrationPlayer('cavani').realName} · GET ACROSS HIM prevents ${original.name} from being cancelled.`,
  });
  return retried;
}

/** BLACK SPIDER consumes the first opposing ATT Chance attempt each period and reduces live ATT. */
function applyYashinSuppression(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): runtime.V8CalibrationState {
  const original = runtime.calibrationHandTacticals(before, side).find((card) => card.id === cardId);
  if (!original || !isV8ChanceType(original.type)) return after;
  const yashin = activeYashin(after, side, zone);
  if (!yashin) return after;

  const next = clone(after);
  next.periodCounters[yashinCounterKey(yashin.runtimeId)] = 1;
  const resolution = latestResolution(next, side, cardId);
  if (!resolution || resolution.cancelled || resolution.attack <= 0) return next;

  const reduction = Math.min(2, resolution.attack);
  resolution.attack -= reduction;
  next.tacticalAttack[side][zone] -= reduction;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('yashin').realName} · BLACK SPIDER reduces ${original.name} by ${reduction} ATT.`,
  });
  return next;
}

export function playCalibrationTactical(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): runtime.V8CalibrationState {
  let next = runtime.playCalibrationTactical(state, side, cardId, zone, options);
  next = interceptCancelledCross(state, next, side, cardId, zone, options);
  return applyYashinSuppression(state, next, side, cardId, zone);
}

export function resolveCommittedCalibrationTactical(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
  paidCost: number,
): runtime.V8CalibrationState {
  const next = clone(state);
  next.teams[side].hand.push({ kind: 'tactical', card });
  const resolved = playCalibrationTactical(next, side, card.id, zone, { ignoreEnergy: true });
  const latest = resolved.tacticalResolutions[resolved.tacticalResolutions.length - 1];
  if (latest) latest.cost = paidCost;
  return resolved;
}

export interface V8ExpansionChanceReactionWindowPlay {
  side: runtime.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

/** Commitment and generated-window Chances share the same Yashin/Cavani reaction pipeline. */
export function resolveGeneratedTacticalWindow(
  state: runtime.V8CalibrationState,
  plays: readonly runtime.V8CalibrationWindowPlay[],
): { state: runtime.V8CalibrationState; plays: V8ExpansionChanceReactionWindowPlay[] } {
  let next = state;
  const resolved: V8ExpansionChanceReactionWindowPlay[] = [];
  const isUtility = (play: runtime.V8CalibrationWindowPlay): boolean => {
    const card = runtime.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    return card !== undefined && !isV8ChanceType(card.type);
  };
  const ordered = [...plays.filter((play) => isUtility(play)), ...plays.filter((play) => !isUtility(play))];

  for (const play of ordered) {
    const card = runtime.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    if (!card) throw new Error(`Tactical card ${play.cardId} is not in hand`);
    if (!runtime.isWindowEligibleTactical(next, card)) {
      throw new Error(`${card.name} was not generated this period and is not window-eligible`);
    }
    const cost = runtime.previewCalibrationTacticalCost(next, play.side, card, play.zone);
    next = playCalibrationTactical(next, play.side, play.cardId, play.zone, { window: true });
    resolved.push({ side: play.side, card, zone: play.zone, cost });
  }

  return { state: next, plays: resolved };
}
