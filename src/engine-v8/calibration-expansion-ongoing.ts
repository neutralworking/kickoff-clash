import { getV8CalibrationPlayer } from './calibration-cards';
import {
  applyCalibrationModifier,
  calibrationPlayersInZone,
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
const BERBATOV_COUNTER_PREFIX = 'berba-spin:';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: 'home' | 'away'): 'home' | 'away' {
  return side === 'home' ? 'away' : 'home';
}

function isAttacker(player: V8CalibrationRuntimePlayer): boolean {
  const card = getV8CalibrationPlayer(player.cardId);
  return card.position !== 'GK' && card.naturalZones.includes('ATT');
}

function isMidfielder(player: V8CalibrationRuntimePlayer): boolean {
  const card = getV8CalibrationPlayer(player.cardId);
  return card.position !== 'GK' && card.naturalZones.includes('MID');
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

/**
 * Shared post-target interception hook for defender Actions. BERBA SPIN consumes once per period,
 * ignores the targeting Action, then moves Berbatov one adjacent zone if there is room.
 */
function tryBerbatovInterception(
  state: V8CalibrationState,
  source: V8CalibrationRuntimePlayer,
  target: V8CalibrationRuntimePlayer,
): boolean {
  if (target.cardId !== 'berbatov' || source.side === target.side || !isDefender(source)) return false;
  if (!isCalibrationActionEnabled(state, target.runtimeId)) return false;
  const key = `${BERBATOV_COUNTER_PREFIX}${target.runtimeId}`;
  if ((state.periodCounters[key] ?? 0) > 0) return false;

  state.periodCounters[key] = 1;
  state.events.push({
    type: 'action_ignored',
    period: state.period,
    text: `${getV8CalibrationPlayer(target.cardId).realName} · BERBA SPIN ignores ${getV8CalibrationPlayer(source.cardId).actionName}.`,
  });

  const destination = berbatovDestination(state, target);
  if (!destination) return true;
  const from = target.zone;
  target.zone = destination;
  state.events.push({
    type: 'player_moved',
    period: state.period,
    text: `${getV8CalibrationPlayer(target.cardId).realName} spins away ${from} → ${destination}.`,
  });
  return true;
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
    if (!tryBerbatovInterception(next, source, target)) continue;
    delete next.suppressedActions[targetId];
    removeSuppressionEvent(next, source, target);
    next = refreshCalibrationSuppression(next);
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
 * Rebuilds dynamic bound ongoing effects from the current board rather than allowing their
 * modifiers to stack. Safe after reveals, movement, score refreshes and period cleanup.
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

    if (tryBerbatovInterception(next, ashley, target)) {
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

    next = applyCalibrationModifier(next, target.runtimeId, {
      attack: -3,
      lifetime: 'match',
      source: `${TYMOSHCHUK_SOURCE_PREFIX}${tymoshchuk.runtimeId}`,
      sourceRuntimeId: tymoshchuk.runtimeId,
    });
  }

  next = refreshCalibrationSuppression(next);
  return interceptDefenderSuppression(next);
}
