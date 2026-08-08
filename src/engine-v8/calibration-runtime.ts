export * from './calibration-runtime-base';

import { getV8CalibrationPlayer } from './calibration-cards';
import {
  addCalibrationTacticalToHand,
  applyCalibrationModifier,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  currentCalibrationDefence,
  hasReducedDefence,
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

function opposingDefenders(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone) {
  return calibrationPlayersInZone(state, otherSide(side), opposingDepthZone(zone))
    .filter((opponent) => {
      const opponentCard = calibrationPlayerCard(opponent);
      return opponentCard.position !== 'GK' && opponentCard.naturalZones.includes('DEF');
    });
}

function highestDefender(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone) {
  return [...opposingDefenders(state, side, zone)].sort((a, b) =>
    currentCalibrationDefence(state, b.runtimeId) - currentCalibrationDefence(state, a.runtimeId)
      || a.deployedOrder - b.deployedOrder
      || a.runtimeId.localeCompare(b.runtimeId)
  )[0];
}

/**
 * Calibration runtime overrides for card-quality changes that have passed package-level design review.
 * Penalty ATT / Cost and every printed player stat remain unchanged.
 */
export function revealCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): V8CalibrationState {
  if (cardId === 'garrincha') {
    const target = highestDefender(state, side, zone);
    const targetWasReduced = target ? hasReducedDefence(state, target.runtimeId) : false;
    const defenceBefore = target ? currentCalibrationDefence(state, target.runtimeId) : undefined;
    let next = revealCalibrationPlayerBase(state, side, cardId, zone);

    if (target && !targetWasReduced && defenceBefore !== undefined && next.players[target.runtimeId]) {
      const actuallyReduced = currentCalibrationDefence(next, target.runtimeId) < defenceBefore;
      if (actuallyReduced) {
        next = applyCalibrationModifier(next, calibrationRuntimeId(side, cardId), {
          attack: 2,
          lifetime: 'period',
          source: getV8CalibrationPlayer(cardId).actionName,
        });
      }
    }
    return next;
  }

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

  const hasOpposingDefender = opposingDefenders(next, side, zone).length > 0;
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
