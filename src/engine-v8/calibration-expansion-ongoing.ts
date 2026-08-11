import { getV8CalibrationPlayer } from './calibration-cards';
import {
  applyCalibrationModifier,
  calibrationPlayersInZone,
  calibrationZoneTotals,
  currentCalibrationAttack,
  isCalibrationActionEnabled,
  opposingDepthZone,
  refreshCalibrationSuppression,
  type V8CalibrationRuntimePlayer,
  type V8CalibrationState,
} from './calibration-runtime-base';
import type { V8Zone } from './core';

const ASHLEY_SOURCE_PREFIX = 'SHOW HIM OUTSIDE:';
const TYMOSHCHUK_SOURCE_PREFIX = 'STEP IN:';
const CANNAVARO_SOURCE_PREFIX = 'READS IT EARLY:';
const BRONZE_SOURCE_PREFIX = 'OVERLAP:';
const BERBATOV_COUNTER_PREFIX = 'berba-spin:';
const HANSEN_COUNTER_PREFIX = 'hansen-one-on-one:';
const HANSEN_SOURCE_PREFIX = 'hansen-one-on-one-source:';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: 'home' | 'away'): 'home' | 'away' {
  return side === 'home' ? 'away' : 'home';
}

function positionCodes(position: string): Set<string> {
  return new Set(position.toUpperCase().split(/[^A-Z]+/).filter(Boolean));
}

function isAttacker(player: V8CalibrationRuntimePlayer): boolean {
  const card = getV8CalibrationPlayer(player.cardId);
  return card.position !== 'GK' && card.naturalZones.includes('ATT');
}

function isMidfielder(player: V8CalibrationRuntimePlayer): boolean {
  const card = getV8CalibrationPlayer(player.cardId);
  return card.position !== 'GK' && card.naturalZones.includes('MID');
}

function isWideForward(player: V8CalibrationRuntimePlayer): boolean {
  const codes = positionCodes(getV8CalibrationPlayer(player.cardId).position);
  return codes.has('WF') || codes.has('LW') || codes.has('RW');
}

function isDefender(player: V8CalibrationRuntimePlayer): boolean {
  const card = getV8CalibrationPlayer(player.cardId);
  return card.position !== 'GK' && card.naturalZones.includes('DEF');
}

function clearDynamicOngoingModifiers(state: V8CalibrationState): void {
  for (const player of Object.values(state.players)) {
    player.modifiers = player.modifiers.filter((modifier) =>
      !modifier.source?.startsWith(ASHLEY_SOURCE_PREFIX)
      && !modifier.source?.startsWith(TYMOSHCHUK_SOURCE_PREFIX)
      && !modifier.source?.startsWith(CANNAVARO_SOURCE_PREFIX)
      && !modifier.source?.startsWith(BRONZE_SOURCE_PREFIX)
    );
  }
}

function berbatovDestination(state: V8CalibrationState, player: V8CalibrationRuntimePlayer): V8Zone | undefined {
  const candidates: readonly V8Zone[] = player.zone === 'ATT'
    ? ['MID']
    : player.zone === 'MID'
      ? ['ATT', 'DEF']
      : ['MID'];
  return candidates.find((zone) => calibrationPlayersInZone(state, player.side, zone).length < 4);
}

type DefenderTargetInterception = 'none' | 'ignored' | 'moved';

function activeTargetActionCanFire(
  state: V8CalibrationState,
  source: V8CalibrationRuntimePlayer,
  target: V8CalibrationRuntimePlayer,
): boolean {
  const activeSuppressor = state.suppressedActions[target.runtimeId];
  return activeSuppressor === undefined || activeSuppressor === source.runtimeId;
}

/**
 * Shared post-target interception hook for defender Actions.
 *
 * - BERBA SPIN consumes once per period, ignores the targeting Action, then moves Berbatov.
 * - ONE ON ONE consumes once per period, ignores the targeting defender Action, then gives Hansen
 *   +2 ATT for the period. The consumed source binding keeps that same ongoing Action ignored on
 *   later board refreshes while allowing a different defender Action to target her normally.
 */
function tryDefenderTargetInterception(
  state: V8CalibrationState,
  source: V8CalibrationRuntimePlayer,
  target: V8CalibrationRuntimePlayer,
): DefenderTargetInterception {
  if (source.side === target.side || !isDefender(source)) return 'none';

  if (target.cardId === 'berbatov') {
    if (!activeTargetActionCanFire(state, source, target)) return 'none';
    const key = `${BERBATOV_COUNTER_PREFIX}${target.runtimeId}`;
    if ((state.periodCounters[key] ?? 0) > 0) return 'none';

    state.periodCounters[key] = 1;
    state.events.push({
      type: 'action_ignored',
      period: state.period,
      text: `${getV8CalibrationPlayer(target.cardId).realName} · BERBA SPIN ignores ${getV8CalibrationPlayer(source.cardId).actionName}.`,
    });

    const destination = berbatovDestination(state, target);
    if (!destination) return 'ignored';
    const from = target.zone;
    target.zone = destination;
    state.events.push({
      type: 'player_moved',
      period: state.period,
      text: `${getV8CalibrationPlayer(target.cardId).realName} spins away ${from} → ${destination}.`,
    });
    return 'moved';
  }

  if (target.cardId === 'caroline-graham-hansen') {
    if (!activeTargetActionCanFire(state, source, target)) return 'none';
    const key = `${HANSEN_COUNTER_PREFIX}${target.runtimeId}`;
    const sourceKey = `${HANSEN_SOURCE_PREFIX}${target.runtimeId}:${source.runtimeId}`;
    if ((state.periodCounters[sourceKey] ?? 0) > 0) return 'ignored';
    if ((state.periodCounters[key] ?? 0) > 0) return 'none';

    state.periodCounters[key] = 1;
    state.periodCounters[sourceKey] = 1;
    state.events.push({
      type: 'action_ignored',
      period: state.period,
      text: `${getV8CalibrationPlayer(target.cardId).realName} · ONE ON ONE ignores ${getV8CalibrationPlayer(source.cardId).actionName}.`,
    });
    target.modifiers.push({
      id: `ONE ON ONE-${state.period}-${state.nextModifierId}`,
      attack: 2,
      defence: 0,
      lifetime: 'period',
      source: 'ONE ON ONE',
    });
    state.nextModifierId += 1;
    state.events.push({
      type: 'modifier_changed',
      period: state.period,
      text: `${getV8CalibrationPlayer(target.cardId).realName}: +2 ATT, +0 DEF (period).`,
    });
    return 'ignored';
  }

  return 'none';
}

function removeSuppressionEvent(state: V8CalibrationState, source: V8CalibrationRuntimePlayer, target: V8CalibrationRuntimePlayer): void {
  const needle = `${getV8CalibrationPlayer(source.cardId).realName} · ${getV8CalibrationPlayer(source.cardId).actionName} suppresses ${getV8CalibrationPlayer(target.cardId).realName}.`;
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    if (state.events[index]?.type === 'action_suppressed' && state.events[index]?.text === needle) {
      state.events.splice(index, 1);
      return;
    }
  }
}

function interceptDefenderSuppression(state: V8CalibrationState): V8CalibrationState {
  let next = state;
  for (const [targetId, sourceId] of Object.entries({ ...next.suppressedActions })) {
    const target = next.players[targetId];
    const source = next.players[sourceId];
    if (!target || !source) continue;
    const interception = tryDefenderTargetInterception(next, source, target);
    if (interception === 'none') continue;
    delete next.suppressedActions[targetId];
    removeSuppressionEvent(next, source, target);
    // BERBA SPIN changes board geometry, so suppression must retarget. Hansen stays in place: an
    // immediate refresh would simply let the same defender Action target her again after consuming
    // the once-per-period interception, which would violate the ignored-Action contract.
    if (interception === 'moved') next = refreshCalibrationSuppression(next);
  }
  return next;
}

function highestAttack(
  state: V8CalibrationState,
  candidates: readonly V8CalibrationRuntimePlayer[],
): V8CalibrationRuntimePlayer | undefined {
  return [...candidates].sort((a, b) =>
    currentCalibrationAttack(state, b.runtimeId) - currentCalibrationAttack(state, a.runtimeId)
    || a.deployedOrder - b.deployedOrder
    || a.runtimeId.localeCompare(b.runtimeId)
  )[0];
}

/**
 * Rebuilds dynamic ongoing effects from the current board rather than allowing their modifiers to
 * stack. The rebuild starts from a state with these dynamic modifiers removed, so conditional
 * comparisons and dynamic targets always use the board without their own previous binding.
 */
export function refreshCalibrationExpansionOngoingEffects(state: V8CalibrationState): V8CalibrationState {
  let next = clone(state);
  clearDynamicOngoingModifiers(next);

  const ashleys = Object.values(next.players)
    .filter((player) => player.cardId === 'ashley-cole' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const ashley of ashleys) {
    const opposingZone = opposingDepthZone(ashley.zone);
    let target = highestAttack(
      next,
      calibrationPlayersInZone(next, otherSide(ashley.side), opposingZone).filter(isAttacker),
    );
    if (!target) continue;

    const interception = tryDefenderTargetInterception(next, ashley, target);
    if (interception === 'ignored') continue;
    if (interception === 'moved') {
      target = highestAttack(
        next,
        calibrationPlayersInZone(next, otherSide(ashley.side), opposingZone).filter(isAttacker),
      );
    }
    if (!target) continue;

    next = applyCalibrationModifier(next, target.runtimeId, {
      attack: -5,
      lifetime: 'match',
      source: `${ASHLEY_SOURCE_PREFIX}${ashley.runtimeId}`,
      sourceRuntimeId: ashley.runtimeId,
    });
  }

  const tymoshchuks = Object.values(next.players)
    .filter((player) => player.cardId === 'tymoshchuk' && player.zone === 'MID' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const tymoshchuk of tymoshchuks) {
    const target = highestAttack(
      next,
      calibrationPlayersInZone(next, otherSide(tymoshchuk.side), 'MID').filter(isMidfielder),
    );
    if (!target) continue;
    if (tryDefenderTargetInterception(next, tymoshchuk, target) !== 'none') continue;

    next = applyCalibrationModifier(next, target.runtimeId, {
      attack: -3,
      lifetime: 'match',
      source: `${TYMOSHCHUK_SOURCE_PREFIX}${tymoshchuk.runtimeId}`,
      sourceRuntimeId: tymoshchuk.runtimeId,
    });
  }

  const cannavaros = Object.values(next.players)
    .filter((player) => player.cardId === 'cannavaro' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const cannavaro of cannavaros) {
    const friendlyDefence = calibrationZoneTotals(next, cannavaro.side, cannavaro.zone).defence;
    const opposingAttack = calibrationZoneTotals(next, otherSide(cannavaro.side), opposingDepthZone(cannavaro.zone)).attack;
    if (opposingAttack <= friendlyDefence) continue;

    next = applyCalibrationModifier(next, cannavaro.runtimeId, {
      defence: 4,
      lifetime: 'match',
      source: `${CANNAVARO_SOURCE_PREFIX}${cannavaro.runtimeId}`,
    });
  }

  const bronzes = Object.values(next.players)
    .filter((player) => player.cardId === 'lucy-bronze' && player.zone === 'MID' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const bronze of bronzes) {
    const target = highestAttack(
      next,
      calibrationPlayersInZone(next, bronze.side, 'ATT').filter(isWideForward),
    );
    if (!target) continue;

    next = applyCalibrationModifier(next, bronze.runtimeId, {
      attack: 2,
      lifetime: 'match',
      source: `${BRONZE_SOURCE_PREFIX}${bronze.runtimeId}`,
    });
    next = applyCalibrationModifier(next, target.runtimeId, {
      attack: 2,
      lifetime: 'match',
      source: `${BRONZE_SOURCE_PREFIX}${bronze.runtimeId}`,
    });
  }

  next = refreshCalibrationSuppression(next);
  return interceptDefenderSuppression(next);
}
