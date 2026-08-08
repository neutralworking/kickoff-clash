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

const ASHLEY_SOURCE_PREFIX = 'SHOW HIM OUTSIDE:';

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

function clearDynamicOngoingModifiers(state: V8CalibrationState): void {
  for (const player of Object.values(state.players)) {
    player.modifiers = player.modifiers.filter((modifier) => !modifier.source?.startsWith(ASHLEY_SOURCE_PREFIX));
  }
}

/**
 * Rebuilds dynamic bound ongoing effects from the current board rather than allowing their
 * modifiers to stack. The function is safe to call after any reveal, movement or period cleanup.
 */
export function refreshCalibrationExpansionOngoingEffects(state: V8CalibrationState): V8CalibrationState {
  let next = clone(state);
  clearDynamicOngoingModifiers(next);

  const ashleys = Object.values(next.players)
    .filter((player) => player.cardId === 'ashley-cole' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const ashley of ashleys) {
    const opposingZone = opposingDepthZone(ashley.zone);
    const target = calibrationPlayersInZone(next, otherSide(ashley.side), opposingZone)
      .filter(isAttacker)
      .sort((a, b) =>
        currentCalibrationAttack(next, b.runtimeId) - currentCalibrationAttack(next, a.runtimeId)
        || a.deployedOrder - b.deployedOrder
        || a.runtimeId.localeCompare(b.runtimeId)
      )[0];
    if (!target) continue;

    next = applyCalibrationModifier(next, target.runtimeId, {
      attack: -5,
      lifetime: 'match',
      source: `${ASHLEY_SOURCE_PREFIX}${ashley.runtimeId}`,
      sourceRuntimeId: ashley.runtimeId,
    });
  }

  return refreshCalibrationSuppression(next);
}
