export * from './calibration-runtime-base';

import { getV8CalibrationPlayer } from './calibration-cards';
import {
  addCalibrationTacticalToHand,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  isCalibrationActionEnabled,
  opposingDepthZone,
  refreshCalibrationSuppression,
  revealCalibrationPlayer as revealCalibrationPlayerBase,
  type V8CalibrationSide,
  type V8CalibrationState,
} from './calibration-runtime-base';
import type { V8Zone } from './core';

function otherSide(side: V8CalibrationSide): V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

/**
 * Calibration runtime override for the compact Dribbling / Penalty redesign.
 *
 * RAINBOW FLICK no longer depends on another dribbler reducing a defender in the
 * same period. Neymar wins the Penalty himself when he reveals into a zone that
 * confronts an opposing defender. Penalty ATT / Cost and every printed player
 * stat remain unchanged.
 */
export function revealCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): V8CalibrationState {
  if (cardId !== 'neymar') return revealCalibrationPlayerBase(state, side, cardId, zone);

  let next = JSON.parse(JSON.stringify(state)) as V8CalibrationState;
  const runtimeId = calibrationRuntimeId(side, cardId);
  if (next.players[runtimeId]) throw new Error(`${cardId} is already deployed for ${side}`);
  if (calibrationPlayersInZone(next, side, zone).length >= 4) throw new Error(`${zone} is full`);

  next.teams[side].deployedOrder += 1;
  next.players[runtimeId] = {
    runtimeId,
    side,
    cardId,
    zone,
    deployedOrder: next.teams[side].deployedOrder,
    modifiers: [],
  };
  next.events.push({ type: 'player_revealed', period: next.period, text: `${getV8CalibrationPlayer(cardId).realName} reveals in ${zone}.` });
  next = refreshCalibrationSuppression(next);

  if (!isCalibrationActionEnabled(next, runtimeId)) return next;
  const card = getV8CalibrationPlayer(cardId);
  next.events.push({ type: 'action_triggered', period: next.period, text: `${card.realName} · ${card.actionName}.` });

  const hasOpposingDefender = calibrationPlayersInZone(next, otherSide(side), opposingDepthZone(zone))
    .some((opponent) => {
      const opponentCard = calibrationPlayerCard(opponent);
      return opponentCard.position !== 'GK' && opponentCard.naturalZones.includes('DEF');
    });

  if (!hasOpposingDefender) return next;
  const added = addCalibrationTacticalToHand(next, side, 'penalty', { generatedBy: card.id });
  next = added.state;
  next.events.push({
    type: 'tactical_generated',
    period: next.period,
    text: `${card.realName} generates ${added.card.name}.`,
  });
  return next;
}
