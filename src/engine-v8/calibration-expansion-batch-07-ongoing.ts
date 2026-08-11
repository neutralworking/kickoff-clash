import { getV8CalibrationPlayer } from './calibration-cards';
import { refreshV8Batch05OngoingEffects } from './calibration-expansion-batch-05-ongoing';
import {
  applyCalibrationModifier,
  isCalibrationActionEnabled,
  type V8CalibrationRuntimePlayer,
  type V8CalibrationState,
} from './calibration-expansion-batch-06-runtime';

const VIDIC_SOURCE_PREFIX = 'PARTNERSHIP:VIDIC:';
const FERDINAND_SOURCE_PREFIX = 'PARTNERSHIP:FERDINAND:';
const CAMPBELL_SOURCE_PREFIX = 'MARSHAL:';
const ZLATAN_SOURCE_PREFIX = 'ALPHA:';
const MARSHAL_ZONE_PREFIX = 'batch07:marshal-zone:';
const ZONES = ['DEF', 'MID', 'ATT'] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function positionCodes(cardId: string): Set<string> {
  return new Set(getV8CalibrationPlayer(cardId).position.toUpperCase().split(/[^A-Z]+/).filter(Boolean));
}

function isWidePlayer(player: V8CalibrationRuntimePlayer): boolean {
  const codes = positionCodes(player.cardId);
  return ['WF', 'WM', 'LW', 'RW', 'LM', 'RM'].some((code) => codes.has(code));
}

function isForward(player: V8CalibrationRuntimePlayer): boolean {
  const codes = positionCodes(player.cardId);
  return ['CF', 'SS', 'WF', 'LW', 'RW', 'LF', 'RF'].some((code) => codes.has(code));
}

function clearBatch07DynamicModifiers(state: V8CalibrationState): void {
  for (const player of Object.values(state.players)) {
    player.modifiers = player.modifiers.filter((modifier) =>
      !modifier.source?.startsWith(VIDIC_SOURCE_PREFIX)
      && !modifier.source?.startsWith(FERDINAND_SOURCE_PREFIX)
      && !modifier.source?.startsWith(CAMPBELL_SOURCE_PREFIX)
      && !modifier.source?.startsWith(ZLATAN_SOURCE_PREFIX)
    );
  }
}

function clearMarshalZoneContribution(state: V8CalibrationState): void {
  for (const side of ['home', 'away'] as const) {
    for (const zone of ZONES) {
      const key = `${MARSHAL_ZONE_PREFIX}${side}:${zone}`;
      const previous = state.periodCounters[key] ?? 0;
      if (previous !== 0) state.zoneDefenceBonus[side][zone] -= previous;
      delete state.periodCounters[key];
    }
  }
}

function deployedFriendly(state: V8CalibrationState, side: 'home' | 'away', cardId: string): boolean {
  return Object.values(state.players).some((player) => player.side === side && player.cardId === cardId);
}

/**
 * Rebuild Batch 07 real-stat auras from current board state. Older ongoing effects are rebuilt both
 * before and after these modifiers: first to remove stale older bindings, then again so dynamic
 * targeters/comparisons such as Ashley Cole and Cannavaro read the final Batch 07 real stats.
 * MARSHAL's +3 is tracked separately in zoneDefenceBonus, so Campbell's current DEF stays real.
 */
export function refreshV8Batch07OngoingEffects(state: V8CalibrationState): V8CalibrationState {
  let next = clone(state);
  clearBatch07DynamicModifiers(next);
  clearMarshalZoneContribution(next);
  next = refreshV8Batch05OngoingEffects(next);

  const vidics = Object.values(next.players)
    .filter((player) => player.cardId === 'nemanja-vidic' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
  for (const vidic of vidics) {
    const amount = deployedFriendly(next, vidic.side, 'rio-ferdinand') ? 5 : 2;
    next = applyCalibrationModifier(next, vidic.runtimeId, {
      defence: amount,
      lifetime: 'match',
      source: `${VIDIC_SOURCE_PREFIX}${vidic.runtimeId}`,
    });
  }

  const ferdinands = Object.values(next.players)
    .filter((player) => player.cardId === 'rio-ferdinand' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
  for (const ferdinand of ferdinands) {
    const amount = deployedFriendly(next, ferdinand.side, 'nemanja-vidic') ? 5 : 2;
    next = applyCalibrationModifier(next, ferdinand.runtimeId, {
      attack: amount,
      lifetime: 'match',
      source: `${FERDINAND_SOURCE_PREFIX}${ferdinand.runtimeId}`,
    });
  }

  const campbells = Object.values(next.players)
    .filter((player) => player.cardId === 'sol-campbell' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
  for (const campbell of campbells) {
    next.zoneDefenceBonus[campbell.side][campbell.zone] += 3;
    next.periodCounters[`${MARSHAL_ZONE_PREFIX}${campbell.side}:${campbell.zone}`] =
      (next.periodCounters[`${MARSHAL_ZONE_PREFIX}${campbell.side}:${campbell.zone}`] ?? 0) + 3;

    const widePlayers = Object.values(next.players)
      .filter((player) => player.side === campbell.side && player.runtimeId !== campbell.runtimeId && isWidePlayer(player))
      .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
    for (const target of widePlayers) {
      next = applyCalibrationModifier(next, target.runtimeId, {
        attack: -2,
        lifetime: 'match',
        source: `${CAMPBELL_SOURCE_PREFIX}${campbell.runtimeId}`,
      });
    }
  }

  const zlatans = Object.values(next.players)
    .filter((player) => player.cardId === 'zlatan-ibrahimovic' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
  for (const zlatan of zlatans) {
    next = applyCalibrationModifier(next, zlatan.runtimeId, {
      attack: 6,
      lifetime: 'match',
      source: `${ZLATAN_SOURCE_PREFIX}${zlatan.runtimeId}`,
    });
    const otherForwards = Object.values(next.players)
      .filter((player) => player.side === zlatan.side && player.runtimeId !== zlatan.runtimeId && isForward(player))
      .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
    for (const target of otherForwards) {
      next = applyCalibrationModifier(next, target.runtimeId, {
        attack: -2,
        lifetime: 'match',
        source: `${ZLATAN_SOURCE_PREFIX}${zlatan.runtimeId}`,
      });
    }
  }

  return refreshV8Batch05OngoingEffects(next);
}
