import { describe, expect, it } from 'vitest';
import type {
  ActionEffect,
  ChanceToken,
  ChanceType,
  PositionCode,
  RuntimePlayerState,
  Sector,
  TeamSide,
  V7TeamState,
} from '../../lib/match-v7/types';
import {
  assignFinishers,
  createRng,
  rollToken,
  type EffectivePlayer,
  type LedgerEffect,
} from '..';

function chance(chanceType: ChanceType, overrides: Partial<ChanceToken> = {}): ChanceToken {
  return {
    id: `finisher:${chanceType}`,
    side: 'player',
    sector: 'centre',
    origin: 'calculated',
    chanceType,
    order: 0,
    minimumGoalRoll: 6,
    rerolls: 0,
    cancelled: false,
    ...overrides,
  };
}

function player(cardId: string, position: PositionCode, attack: number, sector: Sector = 'centre'): EffectivePlayer {
  return {
    cardId,
    zone: 'active',
    slotKey: cardId,
    position,
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
    currentSector: 'centre',
    periodsParticipated: [],
    mandatoryRemoval: false,
    actionInstances: [],
    activeEffectIds: [],
    accumulatedStacks: {},
    currentCost: 3,
  };
}

function team(side: TeamSide, ids: string[]): V7TeamState {
  return {
    side,
    managerId: 'manager',
    formationId: 'formation',
    players: ids.map(runtime),
    score: 0,
    cumulativeGrossChances: 0,
  };
}

function claim(
  sourceCardId: string,
  chanceType: ChanceType,
  overrides: Partial<Pick<LedgerEffect, 'id' | 'sourceInstanceId'>> = {},
): LedgerEffect {
  const effect: ActionEffect = { type: 'claim_chance' };
  return {
    id: overrides.id ?? `claim:${sourceCardId}:${chanceType}`,
    side: 'player',
    origin: 'ongoing',
    sourceInstanceId: overrides.sourceInstanceId ?? `instance:${sourceCardId}`,
    sourceActionId: 'claim-action',
    sourceCardId,
    actionName: 'CLAIM TEST',
    effect,
    targetIds: [],
    tokenTarget: { side: 'own', selector: 'first', chanceTypes: [chanceType] },
    createdPeriod: 1,
    createdBreakIndex: 0,
    lifetime: { kind: 'while_active' },
  };
}

describe('V7 finisher acceptance tables', () => {
  const cases: Array<{
    chanceType: ChanceType;
    eligible: PositionCode;
    ineligible: PositionCode;
  }> = [
    { chanceType: 'box', eligible: 'AM', ineligible: 'CB' },
    { chanceType: 'cross', eligible: 'CF', ineligible: 'AM' },
    { chanceType: 'through_ball', eligible: 'AM', ineligible: 'CM' },
    { chanceType: 'corner', eligible: 'CB', ineligible: 'AM' },
  ];

  for (const entry of cases) {
    it(`${entry.chanceType} selects a valid ${entry.eligible} over a stronger ineligible ${entry.ineligible}`, () => {
      const eligible = player('eligible', entry.eligible, 3);
      const distractor = player('distractor', entry.ineligible, 99);
      const active = [eligible, distractor];
      const result = assignFinishers(
        [chance(entry.chanceType)],
        [],
        'player',
        1,
        active,
        team('player', active.map((item) => item.cardId)),
        101,
      );

      expect(result.tokens[0]).toMatchObject({
        finisherId: 'eligible',
        finisherAssignment: 'default',
      });
    });
  }
});

describe('V7 finisher claim edge cases', () => {
  it('a claim with no matching token fizzles and leaves the live Box for default assignment', () => {
    const claimant = player('claimant', 'CF', 6);
    const other = player('other', 'AM', 8);
    const result = assignFinishers(
      [chance('box')],
      [claim('claimant', 'cross')],
      'player',
      1,
      [claimant, other],
      team('player', ['claimant', 'other']),
      202,
    );

    expect(result.receipts.some((receipt) => receipt.eventType === 'claim_fizzled' && receipt.data.reason === 'no_matching_token')).toBe(true);
    expect(result.tokens[0]?.finisherAssignment).toBe('default');
    expect(result.tokens[0]?.chanceType).toBe('box');
  });

  it('finisher assignment does not perturb the goal-roll RNG namespace', () => {
    const seed = 303;
    const namespace = 'rolls:1';
    const base = chance('box');
    const expected = rollToken(base, createRng(seed, namespace));

    const active = [player('cf-a', 'CF', 8), player('cf-b', 'CF', 12)];
    const assigned = assignFinishers(
      [base],
      [],
      'player',
      1,
      active,
      team('player', ['cf-a', 'cf-b']),
      seed,
    ).tokens[0]!;
    const actual = rollToken(assigned, createRng(seed, namespace));

    expect(actual.rolls).toEqual(expected.rolls);
    expect(actual.finalRoll).toBe(expected.finalRoll);
    expect(actual.scored).toBe(expected.scored);
  });
});
