export * from './calibration-runtime';

import { outOfPositionPenalty, type V8Zone } from './core';
import * as runtime from './calibration-runtime';

function totalFootballActive(state: runtime.V8CalibrationState, side: runtime.V8CalibrationSide): boolean {
  return Object.values(state.players).some((player) =>
    player.side === side
    && player.cardId === 'cruyff'
    && runtime.isCalibrationActionEnabled(state, player.runtimeId)
  );
}

/**
 * Rules-layer OOP penalty. TOTAL FOOTBALL changes contribution only: it does not manufacture
 * positive ATT/DEF modifiers, so targeting, displayed current stats and ATT-gain listeners remain
 * based on the player's real stats.
 */
export function calibrationEffectiveOutOfPositionPenalty(
  state: runtime.V8CalibrationState,
  player: runtime.V8CalibrationRuntimePlayer,
): number {
  if (totalFootballActive(state, player.side)) return 0;
  return outOfPositionPenalty(runtime.calibrationPlayerCard(player), player.zone);
}

export function calibrationZoneTotals(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  zone: V8Zone,
): { attack: number; defence: number; power: number } {
  let attack = state.tacticalAttack[side][zone];
  let defence = state.zoneDefenceBonus[side][zone];

  for (const player of runtime.calibrationPlayersInZone(state, side, zone)) {
    const penalty = calibrationEffectiveOutOfPositionPenalty(state, player);
    const playerAttack = runtime.currentCalibrationAttack(state, player.runtimeId) - penalty;
    const playerDefence = runtime.currentCalibrationDefence(state, player.runtimeId) - penalty;

    if (zone === 'DEF') defence += playerDefence;
    else if (zone === 'MID') {
      attack += playerAttack;
      defence += playerDefence;
    } else {
      attack += playerAttack;
      if (state.triggerPress[side].ATT) attack += playerDefence;
    }
  }

  return { attack, defence, power: attack + defence };
}

export function calibrationTeamTotals(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
): { attack: number; defence: number } {
  const def = calibrationZoneTotals(state, side, 'DEF');
  const mid = calibrationZoneTotals(state, side, 'MID');
  const att = calibrationZoneTotals(state, side, 'ATT');
  return { attack: mid.attack + att.attack, defence: def.defence + mid.defence };
}
