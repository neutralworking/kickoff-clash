export * from './calibration-runtime-base';

import { getV8CalibrationPlayer } from './calibration-cards';
import {
  addCalibrationTacticalToHand,
  applyCalibrationModifier,
  calibrationHandTacticals,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationZoneTotals,
  currentCalibrationDefence,
  hasReducedDefence,
  isCalibrationActionEnabled,
  moveCalibrationPlayer as moveCalibrationPlayerBase,
  opposingDepthZone,
  playCalibrationTactical as playCalibrationTacticalBase,
  refreshCalibrationSuppression,
  removeCalibrationPlayerFromHand as removeCalibrationPlayerFromHandBase,
  revealCalibrationPlayer as revealCalibrationPlayerBase,
  type V8CalibrationSide,
  type V8CalibrationState,
} from './calibration-runtime-base';
import type { V8Zone } from './core';
import { isV8ChanceType } from './tactical';

export interface V8CalibrationScoreState {
  home: number;
  away: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

function lowestDefender(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone) {
  return [...opposingDefenders(state, side, zone)].sort((a, b) =>
    currentCalibrationDefence(state, a.runtimeId) - currentCalibrationDefence(state, b.runtimeId)
      || a.deployedOrder - b.deployedOrder
      || a.runtimeId.localeCompare(b.runtimeId)
  )[0];
}

function deployWithoutOnReveal(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): V8CalibrationState {
  let next = clone(state);
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
  return next;
}

function scoreRelation(score: V8CalibrationScoreState, side: V8CalibrationSide): 'winning' | 'losing' | 'level' {
  const own = side === 'home' ? score.home : score.away;
  const opponent = side === 'home' ? score.away : score.home;
  if (own > opponent) return 'winning';
  if (own < opponent) return 'losing';
  return 'level';
}

function aitanaDiscountPeriodKey(side: V8CalibrationSide): string {
  return `aitana-escape-the-press:${side}:period`;
}

function isMidPlayer(cardId: string): boolean {
  return getV8CalibrationPlayer(cardId).naturalZones.includes('MID');
}

/**
 * First next-period MID-capable player discount. The discount expires automatically because the
 * stored activation period must exactly equal the current period, and is consumed on first use.
 */
export function previewCalibrationPlayerCost(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
): number {
  const card = getV8CalibrationPlayer(cardId);
  const activePeriod = state.matchCounters[aitanaDiscountPeriodKey(side)] ?? 0;
  if (activePeriod !== state.period || !isMidPlayer(cardId)) return card.cost;
  return Math.max(0, card.cost - 1);
}

export function removeCalibrationPlayerFromHand(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  options: { ignoreEnergy?: boolean } = {},
): V8CalibrationState {
  const discountedCost = previewCalibrationPlayerCost(state, side, cardId);
  const printedCost = getV8CalibrationPlayer(cardId).cost;
  if (discountedCost === printedCost) return removeCalibrationPlayerFromHandBase(state, side, cardId, options);

  const next = clone(state);
  const index = next.teams[side].hand.findIndex((entry) => entry.kind === 'player' && entry.cardId === cardId);
  if (index < 0) throw new Error(`${cardId} is not in hand`);
  if (!options.ignoreEnergy && next.teams[side].energy < discountedCost) throw new Error('Not enough energy');
  if (!options.ignoreEnergy) next.teams[side].energy -= discountedCost;
  next.teams[side].hand.splice(index, 1);
  next.matchCounters[aitanaDiscountPeriodKey(side)] = 0;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `ESCAPE THE PRESS: ${getV8CalibrationPlayer(cardId).realName} costs ${discountedCost} Energy.`,
  });
  return next;
}

/**
 * Refreshes live match-score modifiers without baking score into the board-state model.
 * The match coordinator calls this when the score changes; repeated calls replace rather than stack.
 */
export function refreshCalibrationScoreState(
  state: V8CalibrationState,
  score: V8CalibrationScoreState,
): V8CalibrationState {
  let next = clone(state);
  const diStefanos = Object.values(next.players).filter((player) => player.cardId === 'di-stefano');

  for (const player of diStefanos) {
    player.modifiers = player.modifiers.filter((modifier) => modifier.source !== 'END-TO-END RUN');
    if (!isCalibrationActionEnabled(next, player.runtimeId)) continue;
    const relation = scoreRelation(score, player.side);
    const modifier = relation === 'losing'
      ? { attack: 3, defence: 0 }
      : relation === 'winning'
        ? { attack: 0, defence: 3 }
        : { attack: 1, defence: 1 };
    next = applyCalibrationModifier(next, player.runtimeId, {
      ...modifier,
      lifetime: 'match',
      source: 'END-TO-END RUN',
    });
  }
  return refreshCalibrationSuppression(next);
}

/**
 * Calibration runtime overrides for card-quality changes and the first expansion primitives.
 * Penalty ATT / Cost, global Energy and the +7 scoring band remain unchanged.
 */
export function revealCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  score: V8CalibrationScoreState = { home: 0, away: 0 },
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

  if (cardId === 'okocha') {
    const target = lowestDefender(state, side, zone);
    const defenceBefore = target ? currentCalibrationDefence(state, target.runtimeId) : undefined;
    let next = revealCalibrationPlayerBase(state, side, cardId, zone);

    if (target && defenceBefore !== undefined && next.players[target.runtimeId]) {
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

  if (cardId === 'ronaldo') {
    let next = deployWithoutOnReveal(state, side, cardId, zone);
    const runtimeId = calibrationRuntimeId(side, cardId);
    if (!isCalibrationActionEnabled(next, runtimeId)) return next;
    const card = getV8CalibrationPlayer(cardId);
    next.events.push({ type: 'action_triggered', period: next.period, text: `${card.realName} · ${card.actionName}.` });
    const target = highestDefender(next, side, zone);
    if (!target) return next;

    next = applyCalibrationModifier(next, target.runtimeId, {
      defence: -3,
      lifetime: 'period',
      source: card.actionName,
      sourceRuntimeId: runtimeId,
    });
    return refreshCalibrationSuppression(next);
  }

  if (cardId === 'dempsey') {
    let next = revealCalibrationPlayerBase(state, side, cardId, zone);
    const ownPower = calibrationZoneTotals(next, side, zone).power;
    const opponentPower = calibrationZoneTotals(next, otherSide(side), opposingDepthZone(zone)).power;
    if (ownPower < opponentPower) {
      next = applyCalibrationModifier(next, calibrationRuntimeId(side, cardId), {
        attack: 5,
        lifetime: 'period',
        source: 'CHEEKY CHIP',
      });
    }
    return next;
  }

  if (cardId === 'di-stefano') {
    const next = revealCalibrationPlayerBase(state, side, cardId, zone);
    return refreshCalibrationScoreState(next, score);
  }

  if (cardId === 'aitana-bonmati') {
    const next = revealCalibrationPlayerBase(state, side, cardId, zone);
    if (next.period < 4) next.matchCounters[aitanaDiscountPeriodKey(side)] = next.period + 1;
    return next;
  }

  if (cardId !== 'neymar') return revealCalibrationPlayerBase(state, side, cardId, zone);

  let next = deployWithoutOnReveal(state, side, cardId, zone);
  const runtimeId = calibrationRuntimeId(side, cardId);
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

/** JINKING RUN uses the existing movement board primitive but has a match-lifetime move allowance. */
export function moveCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  toZone: V8Zone,
): V8CalibrationState {
  if (cardId !== 'abedi-pele') return moveCalibrationPlayerBase(state, side, cardId, toZone);

  let next = clone(state);
  const runtimeId = calibrationRuntimeId(side, cardId);
  const player = next.players[runtimeId];
  if (!player) throw new Error(`${cardId} is not deployed`);
  if (player.zone === toZone) throw new Error('Player is already in that zone');
  if (calibrationPlayersInZone(next, side, toZone).length >= 4) throw new Error(`${toZone} is full`);
  if (!isCalibrationActionEnabled(next, runtimeId)) throw new Error('Player has no active movement Action');
  const card = getV8CalibrationPlayer(cardId);
  if (!card.naturalZones.includes(toZone)) throw new Error('JINKING RUN can only move between natural zones');
  const zoneIndex: Record<V8Zone, number> = { DEF: 0, MID: 1, ATT: 2 };
  if (Math.abs(zoneIndex[toZone] - zoneIndex[player.zone]) !== 1) throw new Error('JINKING RUN moves one adjacent zone');
  const key = `abedi-jinking-run:${runtimeId}`;
  if ((next.matchCounters[key] ?? 0) > 0) throw new Error('Player has already moved this match');

  const from = player.zone;
  player.zone = toZone;
  next.matchCounters[key] = 1;
  next.events.push({ type: 'player_moved', period: next.period, text: `${card.realName} moves ${from} → ${toZone}.` });
  if (from === 'MID' && toZone === 'ATT') {
    next = applyCalibrationModifier(next, runtimeId, {
      attack: 4,
      lifetime: 'match',
      source: 'JINKING RUN',
    });
  }
  return refreshCalibrationSuppression(next);
}

/** BODY ON THE LINE intercepts the first otherwise-resolving cancellable Chance in Puyol's confrontation. */
export function playCalibrationTactical(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): V8CalibrationState {
  const tactical = calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  const defendingSide = otherSide(side);
  const defendingZone = opposingDepthZone(zone);
  const puyol = tactical && isV8ChanceType(tactical.type)
    ? calibrationPlayersInZone(state, defendingSide, defendingZone).find((player) =>
        player.cardId === 'puyol'
        && isCalibrationActionEnabled(state, player.runtimeId)
        && (state.matchCounters[`puyol-body-on-the-line:${player.runtimeId}`] ?? 0) === 0)
    : undefined;

  let next = playCalibrationTacticalBase(state, side, cardId, zone, options);
  if (!tactical || !puyol) return next;
  const resolution = [...next.tacticalResolutions].reverse().find((candidate) => candidate.cardId === cardId && candidate.side === side);
  if (!resolution || resolution.cancelled || resolution.uncancellable || resolution.attack <= 0) return next;

  next.tacticalAttack[side][zone] -= resolution.attack;
  resolution.cancelled = true;
  resolution.attack = 0;
  const resolvedEventIndex = [...next.events].reverse().findIndex((event) => event.type === 'chance_resolved' && event.period === next.period);
  if (resolvedEventIndex >= 0) next.events.splice(next.events.length - 1 - resolvedEventIndex, 1);
  next.matchCounters[`puyol-body-on-the-line:${puyol.runtimeId}`] = 1;
  next.events.push({
    type: 'chance_cancelled',
    period: next.period,
    text: `${tactical.name} is cancelled by ${getV8CalibrationPlayer('puyol').actionName}.`,
  });
  next = applyCalibrationModifier(next, puyol.runtimeId, {
    defence: -3,
    lifetime: 'match',
    source: 'BODY ON THE LINE',
  });
  return refreshCalibrationSuppression(next);
}
