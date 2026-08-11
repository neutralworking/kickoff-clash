import { getV8CalibrationPlayer } from './calibration-cards';
import { refreshCalibrationExpansionOngoingEffects } from './calibration-expansion-ongoing';
import {
  applyCalibrationModifier,
  isCalibrationActionEnabled,
  type V8CalibrationState,
} from './calibration-expansion-batch-05-runtime';

const ADAMS_SOURCE_PREFIX = 'SKIPPER:';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isDefender(cardId: string): boolean {
  const card = getV8CalibrationPlayer(cardId);
  return card.position !== 'GK' && card.naturalZones.includes('DEF');
}

/**
 * Batch 05 ongoing pre-layer. Adams is rebuilt before the older expansion ongoing pass so live
 * zone comparisons such as Cannavaro READS IT EARLY see the organised back-line DEF, not a stale
 * post-comparison aura.
 */
export function refreshV8Batch05OngoingEffects(state: V8CalibrationState): V8CalibrationState {
  let next = clone(state);
  for (const player of Object.values(next.players)) {
    player.modifiers = player.modifiers.filter((modifier) => !modifier.source?.startsWith(ADAMS_SOURCE_PREFIX));
  }

  const adamses = Object.values(next.players)
    .filter((player) => player.cardId === 'tony-adams' && isCalibrationActionEnabled(next, player.runtimeId))
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const adams of adamses) {
    const targets = Object.values(next.players)
      .filter((player) => player.side === adams.side && player.runtimeId !== adams.runtimeId && isDefender(player.cardId))
      .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
    for (const target of targets) {
      next = applyCalibrationModifier(next, target.runtimeId, {
        defence: 2,
        lifetime: 'match',
        source: `${ADAMS_SOURCE_PREFIX}${adams.runtimeId}`,
      });
    }
  }

  return refreshCalibrationExpansionOngoingEffects(next);
}
