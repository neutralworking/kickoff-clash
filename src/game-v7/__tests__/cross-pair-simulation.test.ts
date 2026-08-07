import { describe, expect, it } from 'vitest';
import {
  applyChanceShapeEffects,
  applyTokenEffects,
  assignFinishers,
  createRng,
  rollToken,
  type ChanceToken,
  type EffectivePlayer,
  type LedgerEffect,
  type RuntimePlayerState,
  type Sector,
  type TeamSide,
  type V7ActionDefinition,
  type V7TeamState,
} from '@/engine-v7';
import { AERIAL_COMMAND, BEND_IT, GLANCER } from '@/game-v7/player-actions';

const MATCHES = 5_000;

type Variant = 'creator' | 'pair' | 'counter';

function player(cardId: string, sector: Sector, attack: number): EffectivePlayer {
  return {
    cardId,
    zone: 'active',
    slotKey: cardId,
    position: cardId === 'finisher' ? 'CF' : 'RM',
    naturalSector: sector,
    sector,
    attack,
    defence: 2,
    cost: 3,
    outOfPosition: false,
    emergencyGoalkeeper: false,
    actionsSuppressed: false,
    partnerCardIds: [],
  };
}

function runtime(cardId: string, deploymentOrder: number): RuntimePlayerState {
  return {
    cardId,
    deploymentOrder,
    zone: 'active',
    currentSlotKey: cardId,
    currentSector: cardId === 'creator' ? 'right' : 'centre',
    periodsParticipated: [],
    mandatoryRemoval: false,
    actionInstances: [],
    activeEffectIds: [],
    accumulatedStacks: {},
    currentCost: 3,
  };
}

function team(side: TeamSide): V7TeamState {
  return {
    side,
    managerId: `${side}:manager`,
    formationId: `${side}:formation`,
    players: [runtime('creator', 0), runtime('finisher', 1)],
    score: 0,
    cumulativeGrossChances: 0,
  };
}

function token(side: TeamSide, period: number, index: number): ChanceToken {
  return {
    id: `cross-sim:${side}:${period}:${index}`,
    side,
    sector: index === 0 ? 'centre' : 'right',
    origin: 'calculated',
    chanceType: 'box',
    order: index,
    minimumGoalRoll: 6,
    rerolls: 0,
    cancelled: false,
  };
}

function actionLedger(
  definition: V7ActionDefinition,
  actingSide: TeamSide,
  sourceCardId: string,
  sourceSector: Sector,
  period: number,
): LedgerEffect[] {
  const target = definition.target;
  if (target.type !== 'chance') throw new Error(`${definition.name} must target a chance.`);
  const sourceInstanceId = `cross-sim:${definition.id}:${actingSide}:${period}`;
  const sector = target.selector === 'first' ? target.sector : target.sector ?? sourceSector;

  return definition.effects.map((effect, index) => ({
    id: `cross-sim:effect:${definition.id}:${actingSide}:${period}:${index}`,
    side: actingSide,
    origin: 'ongoing' as const,
    sourceInstanceId,
    sourceActionId: definition.id,
    sourceCardId,
    actionName: definition.name,
    effect,
    targetIds: [],
    ...(sector ? { sector } : {}),
    tokenTarget: {
      side: target.side,
      selector: target.selector,
      ...(target.chanceTypes ? { chanceTypes: [...target.chanceTypes] } : {}),
    },
    createdPeriod: period as 1 | 2 | 3 | 4,
    createdBreakIndex: 0 as const,
    lifetime: { kind: 'while_active' as const },
  }));
}

interface SimulationResult {
  goalsPerMatch: number;
  specialistActivationsPerMatch: number;
  crossesPerMatch: number;
}

/**
 * Symmetric two-chance-per-side balance fixture. BEND IT reshapes the right-side
 * Box token because its creator is an RM in that sector. GLANCER is present only
 * while the home side is losing at the start of a period; AERIAL COMMAND is the
 * opponent's always-on hard 6+ Cross floor.
 *
 * Every variant uses the same namespaced dice. The creator-only baseline therefore
 * differs from the pair only when GLANCER legitimately wins the Cross claim.
 */
function simulate(variant: Variant): SimulationResult {
  let goals = 0;
  let activations = 0;
  let crosses = 0;

  const active = [player('creator', 'right', 7), player('finisher', 'centre', 10)];

  for (let seed = 1; seed <= MATCHES; seed += 1) {
    let homeScore = 0;
    let awayScore = 0;

    for (let period = 1; period <= 4; period += 1) {
      const losing = homeScore < awayScore;
      const ledger: LedgerEffect[] = [
        ...actionLedger(BEND_IT, 'player', 'creator', 'right', period),
        ...(variant !== 'creator' && losing ? actionLedger(GLANCER, 'player', 'finisher', 'centre', period) : []),
        ...(variant === 'counter' ? actionLedger(AERIAL_COMMAND, 'opponent', 'counter', 'centre', period) : []),
      ];

      let homeTokens = [token('player', period, 0), token('player', period, 1)];
      const shaped = applyChanceShapeEffects(homeTokens, ledger, 'player', period as 1 | 2 | 3 | 4, active, seed);
      homeTokens = shaped.tokens;
      crosses += homeTokens.filter((entry) => entry.chanceType === 'cross').length;

      if (variant !== 'creator' && losing) activations += 1;

      const assigned = assignFinishers(
        homeTokens,
        ledger,
        'player',
        period as 1 | 2 | 3 | 4,
        active,
        team('player'),
        seed,
      );
      homeTokens = applyTokenEffects(assigned.tokens, ledger, 'player');

      for (let index = 0; index < homeTokens.length; index += 1) {
        const outcome = rollToken(homeTokens[index]!, createRng(seed, `specialist-cross:user:${period}:${index}`));
        if (outcome.scored) homeScore += 1;
      }

      for (let index = 0; index < 2; index += 1) {
        const away = token('opponent', period, index);
        const outcome = rollToken(away, createRng(seed, `specialist-cross:opponent:${period}:${index}`));
        if (outcome.scored) awayScore += 1;
      }
    }

    goals += homeScore;
  }

  return {
    goalsPerMatch: goals / MATCHES,
    specialistActivationsPerMatch: activations / MATCHES,
    crossesPerMatch: crosses / MATCHES,
  };
}

describe('BEND IT → GLANCER → AERIAL COMMAND balance regression', () => {
  it('BEND IT reshapes one right-sector Box per period without changing chance volume', () => {
    const creator = simulate('creator');
    expect(creator.crossesPerMatch).toBe(4);
    expect(creator.specialistActivationsPerMatch).toBe(0);
  });

  it('the pair adds +0.13 goals/match and activates on 0.78 Crosses/match', () => {
    const creator = simulate('creator');
    const pair = simulate('pair');

    expect(Number((pair.goalsPerMatch - creator.goalsPerMatch).toFixed(2))).toBe(0.13);
    expect(Number(pair.specialistActivationsPerMatch.toFixed(2))).toBe(0.78);
    expect(pair.crossesPerMatch).toBe(4);
  });

  it('AERIAL COMMAND restores BEND IT-only scoring without deleting Crosses', () => {
    const creator = simulate('creator');
    const counter = simulate('counter');

    expect(counter.goalsPerMatch).toBe(creator.goalsPerMatch);
    expect(counter.crossesPerMatch).toBe(4);
  });
});
