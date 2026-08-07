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
import { RUNS_IN_BEHIND, SWEEPER, VISION } from '@/game-v7/player-actions';

const MATCHES = 5_000;

type Variant = 'creator' | 'pair' | 'counter';

function player(cardId: string, sector: Sector, attack: number): EffectivePlayer {
  return {
    cardId,
    zone: 'active',
    slotKey: cardId,
    position: cardId === 'finisher' ? 'CF' : 'CM',
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
    currentSector: cardId === 'creator' ? 'centre' : 'centre',
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
    id: `sim:${side}:${period}:${index}`,
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
  period: number,
): LedgerEffect[] {
  if (definition.target.type !== 'chance') throw new Error(`${definition.name} must target a chance.`);
  const sourceInstanceId = `sim:${definition.id}:${actingSide}:${period}`;
  return definition.effects.map((effect, index) => ({
    id: `sim:effect:${definition.id}:${actingSide}:${period}:${index}`,
    side: actingSide,
    origin: 'ongoing' as const,
    sourceInstanceId,
    sourceActionId: definition.id,
    sourceCardId,
    actionName: definition.name,
    effect,
    targetIds: [],
    tokenTarget: {
      side: definition.target.side,
      selector: definition.target.selector,
      ...(definition.target.chanceTypes ? { chanceTypes: [...definition.target.chanceTypes] } : {}),
    },
    createdPeriod: period as 1 | 2 | 3 | 4,
    createdBreakIndex: 0 as const,
    lifetime: { kind: 'while_active' as const },
  }));
}

interface SimulationResult {
  goalsPerMatch: number;
  specialistActivationsPerMatch: number;
  throughBallsPerMatch: number;
}

/**
 * Symmetric two-chance-per-side fixture. VISION always reshapes the first home
 * Box chance. RUNS IN BEHIND exists only while the home side is losing at the
 * start of the period. SWEEPER is the opponent's always-on typed counter.
 *
 * Every variant uses identical namespaced dice, so the measured delta comes
 * only from the specialist threshold. This is a balance regression, not a
 * replacement for full-match integration tests.
 */
function simulate(variant: Variant): SimulationResult {
  let goals = 0;
  let activations = 0;
  let throughBalls = 0;

  const active = [player('creator', 'centre', 7), player('finisher', 'centre', 10)];

  for (let seed = 1; seed <= MATCHES; seed += 1) {
    let homeScore = 0;
    let awayScore = 0;

    for (let period = 1; period <= 4; period += 1) {
      const losing = homeScore < awayScore;
      const ledger: LedgerEffect[] = [
        ...actionLedger(VISION, 'player', 'creator', period),
        ...(variant !== 'creator' && losing ? actionLedger(RUNS_IN_BEHIND, 'player', 'finisher', period) : []),
        ...(variant === 'counter' ? actionLedger(SWEEPER, 'opponent', 'counter', period) : []),
      ];

      let homeTokens = [token('player', period, 0), token('player', period, 1)];
      const shaped = applyChanceShapeEffects(homeTokens, ledger, 'player', period as 1 | 2 | 3 | 4, active, seed);
      homeTokens = shaped.tokens;
      throughBalls += homeTokens.filter((entry) => entry.chanceType === 'through_ball').length;

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
        const outcome = rollToken(homeTokens[index]!, createRng(seed, `specialist:user:${period}:${index}`));
        if (outcome.scored) homeScore += 1;
      }

      for (let index = 0; index < 2; index += 1) {
        const away = token('opponent', period, index);
        const outcome = rollToken(away, createRng(seed, `specialist:opponent:${period}:${index}`));
        if (outcome.scored) awayScore += 1;
      }
    }

    goals += homeScore;
  }

  return {
    goalsPerMatch: goals / MATCHES,
    specialistActivationsPerMatch: activations / MATCHES,
    throughBallsPerMatch: throughBalls / MATCHES,
  };
}

describe('VISION → RUNS IN BEHIND → SWEEPER balance regression', () => {
  it('VISION reshapes exactly one Box per period without changing scoring by itself', () => {
    const creator = simulate('creator');
    expect(creator.throughBallsPerMatch).toBe(4);
    expect(creator.specialistActivationsPerMatch).toBe(0);
  });

  it('the pair adds about +0.13 goals/match and activates about 0.80 times/match', () => {
    const creator = simulate('creator');
    const pair = simulate('pair');

    expect(Number((pair.goalsPerMatch - creator.goalsPerMatch).toFixed(2))).toBe(0.13);
    expect(Number(pair.specialistActivationsPerMatch.toFixed(2))).toBe(0.80);
    expect(pair.throughBallsPerMatch).toBe(4);
  });

  it('SWEEPER restores the creator-only scoring baseline without deleting Through Balls', () => {
    const creator = simulate('creator');
    const counter = simulate('counter');

    expect(counter.goalsPerMatch).toBe(creator.goalsPerMatch);
    expect(counter.throughBallsPerMatch).toBe(4);
  });
});
