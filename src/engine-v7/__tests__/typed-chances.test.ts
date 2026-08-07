import { describe, expect, it } from 'vitest';
import type {
  ActionEffect,
  ChanceToken,
  PositionCode,
  RuntimePlayerState,
  Sector,
  TeamSide,
  V7TeamState,
} from '../../lib/match-v7/types';
import {
  applyChanceShapeEffects,
  applyTokenEffects,
  assignFinishers,
  createChances,
  createRng,
  selectChanceTokens,
  type EffectivePlayer,
  type LedgerEffect,
} from '..';

function token(overrides: Partial<ChanceToken> = {}): ChanceToken {
  return {
    id: 'chance:player:1:left:0',
    side: 'player',
    sector: 'left',
    origin: 'calculated',
    chanceType: 'box',
    order: 0,
    minimumGoalRoll: 6,
    rerolls: 0,
    cancelled: false,
    ...overrides,
  };
}

function player(
  cardId: string,
  position: PositionCode,
  sector: Sector,
  attack: number,
  overrides: Partial<EffectivePlayer> = {},
): EffectivePlayer {
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
    ...overrides,
  };
}

function runtime(cardId: string, order: number): RuntimePlayerState {
  return {
    cardId,
    deploymentOrder: order,
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
    managerId: 'm',
    formationId: 'f',
    players: ids.map(runtime),
    score: 0,
    cumulativeGrossChances: 0,
  };
}

function ledger(
  effect: ActionEffect,
  options: {
    side?: TeamSide;
    sourceCardId?: string;
    sourceInstanceId?: string;
    sector?: Sector;
    selector?: NonNullable<LedgerEffect['tokenTarget']>['selector'];
    chanceTypes?: NonNullable<LedgerEffect['tokenTarget']>['chanceTypes'];
    targetSide?: 'own' | 'enemy';
    id?: string;
  } = {},
): LedgerEffect {
  return {
    id: options.id ?? `eff:${effect.type}`,
    side: options.side ?? 'player',
    origin: 'ongoing',
    sourceInstanceId: options.sourceInstanceId ?? 'instance:source',
    sourceActionId: 'action:source',
    sourceCardId: options.sourceCardId ?? 'source',
    actionName: 'TEST ACTION',
    effect,
    targetIds: [],
    ...(options.sector ? { sector: options.sector } : {}),
    tokenTarget: {
      side: options.targetSide ?? 'own',
      selector: options.selector ?? 'first',
      ...(options.chanceTypes ? { chanceTypes: options.chanceTypes } : {}),
    },
    createdPeriod: 1,
    createdBreakIndex: 0,
    lifetime: { kind: 'while_active' },
  };
}

describe('typed chance creation + shaping', () => {
  it('creates calculated chances as Box while keeping origin separate', () => {
    const own = [player('cf', 'CF', 'centre', 12)];
    const enemy = [player('cb', 'CB', 'centre', 2)];
    const created = createChances('player', 1, own, enemy, createRng(7, 'chance:player:1'));

    expect(created.tokens.length).toBeGreaterThan(0);
    expect(created.tokens.every((entry) => entry.origin === 'calculated' && entry.chanceType === 'box')).toBe(true);
    expect(created.receipts).toHaveLength(created.tokens.length);
    expect(created.receipts[0]?.eventType).toBe('chance_created');
  });

  it('changes only type when a calculated Box becomes a Cross', () => {
    const original = token();
    const shaped = applyChanceShapeEffects(
      [original],
      [ledger({ type: 'change_chance_type', chanceType: 'cross', count: 1 }, { sector: 'left', selector: 'first_in_sector', chanceTypes: ['box'] })],
      'player',
      1,
      [player('source', 'RM', 'right', 5)],
      44,
    );

    expect(shaped.tokens[0]).toMatchObject({
      id: original.id,
      origin: 'calculated',
      side: original.side,
      sector: original.sector,
      order: original.order,
      chanceType: 'cross',
    });
    expect(shaped.receipts.map((entry) => entry.eventType)).toContain('chance_type_changed');
  });

  it('adds a typed Action chance with a stable action identity', () => {
    const add = ledger(
      { type: 'add_chance', count: 1, chanceType: 'corner', sectorMode: 'centre' },
      { id: 'eff:add:corner', sourceInstanceId: 'instance:corner' },
    );
    const first = applyChanceShapeEffects([], [add], 'player', 2, [], 88);
    const replay = applyChanceShapeEffects([], [add], 'player', 2, [], 88);

    expect(first).toEqual(replay);
    expect(first.tokens[0]).toMatchObject({
      origin: 'action',
      chanceType: 'corner',
      sector: 'centre',
      sourceActionInstanceId: 'instance:corner',
    });
    expect(first.tokens[0]!.id).toContain('eff:add:corner');
  });

  it('namespaces each token in a multi-chance random Action independently', () => {
    const add = ledger(
      { type: 'add_chance', count: 3, chanceType: 'box', sectorMode: 'random' },
      { id: 'eff:add:random', sourceInstanceId: 'instance:random' },
    );
    const first = applyChanceShapeEffects([], [add], 'player', 1, [], 1);
    const replay = applyChanceShapeEffects([], [add], 'player', 1, [], 1);

    expect(first).toEqual(replay);
    expect(first.tokens).toHaveLength(3);
    expect(first.tokens.map((entry) => entry.sector)).toEqual(['right', 'left', 'right']);
  });

  it('filters typed targets without touching non-matching tokens', () => {
    const box = token({ id: 'box', chanceType: 'box', order: 0 });
    const cross = token({ id: 'cross', chanceType: 'cross', order: 1 });
    const target = ledger({ type: 'set_goal_threshold', minimumRoll: 5 }, { chanceTypes: ['cross'], selector: 'first' });
    expect(selectChanceTokens([box, cross], target).map((entry) => entry.id)).toEqual(['cross']);
  });

  it('supports a team-wide first selector across sectors', () => {
    const left = token({ id: 'left', chanceType: 'cross', sector: 'left', order: 0 });
    const centre = token({ id: 'centre', chanceType: 'cross', sector: 'centre', order: 1 });
    const global = ledger({ type: 'claim_chance' }, { chanceTypes: ['cross'], selector: 'first' });
    expect(selectChanceTokens([centre, left], global).map((entry) => entry.id)).toEqual(['left']);
  });
});

describe('deterministic finisher assignment + claims', () => {
  it('allows a centre-forward to finish a wide Cross by default', () => {
    const players = [
      player('cf', 'CF', 'centre', 10),
      player('cm', 'CM', 'centre', 20),
    ];
    const result = assignFinishers(
      [token({ chanceType: 'cross', sector: 'left' })],
      [],
      'player',
      1,
      players,
      team('player', players.map((entry) => entry.cardId)),
      123,
    );
    expect(result.tokens[0]).toMatchObject({ finisherId: 'cf', finisherAssignment: 'default' });
  });

  it('replays weighted default assignment byte-identically', () => {
    const players = [player('cf-a', 'CF', 'centre', 8), player('cf-b', 'CF', 'centre', 12)];
    const input = [token({ chanceType: 'box' })];
    const a = assignFinishers(input, [], 'player', 1, players, team('player', ['cf-a', 'cf-b']), 456);
    const b = assignFinishers(input, [], 'player', 1, players, team('player', ['cf-a', 'cf-b']), 456);
    expect(a).toEqual(b);
  });

  it('uses the strongest active non-emergency player as fallback', () => {
    const players = [
      player('cb-strong', 'CB', 'centre', 7),
      player('dm', 'DM', 'centre', 5),
      player('gk-emergency', 'GK', 'centre', 99, { emergencyGoalkeeper: true }),
    ];
    const result = assignFinishers(
      [token({ chanceType: 'through_ball' })],
      [],
      'player',
      1,
      players,
      team('player', players.map((entry) => entry.cardId)),
      1,
    );
    expect(result.tokens[0]).toMatchObject({ finisherId: 'cb-strong', finisherAssignment: 'fallback' });
  });

  it('lets a global specialist claim a wide Cross before default assignment', () => {
    const players = [player('glancer', 'CF', 'centre', 7), player('wing', 'LW', 'left', 12)];
    const claim = ledger(
      { type: 'claim_chance' },
      { sourceCardId: 'glancer', sourceInstanceId: 'instance:glancer', chanceTypes: ['cross'], selector: 'first' },
    );
    const result = assignFinishers(
      [token({ chanceType: 'cross', sector: 'right' })],
      [claim],
      'player',
      2,
      players,
      team('player', players.map((entry) => entry.cardId)),
      91,
    );

    expect(result.tokens[0]).toMatchObject({ finisherId: 'glancer', finisherAssignment: 'claimed' });
    expect(result.receipts.map((entry) => entry.eventType)).toEqual(['chance_claimed', 'finisher_assigned']);
  });

  it('first valid claim wins and a later claim fizzles', () => {
    const players = [player('first', 'CF', 'centre', 5), player('second', 'CF', 'centre', 5)];
    const claims = [
      ledger({ type: 'claim_chance' }, { id: 'claim:1', sourceCardId: 'first', sourceInstanceId: 'i:first', chanceTypes: ['cross'] }),
      ledger({ type: 'claim_chance' }, { id: 'claim:2', sourceCardId: 'second', sourceInstanceId: 'i:second', chanceTypes: ['cross'] }),
    ];
    const result = assignFinishers(
      [token({ chanceType: 'cross' })],
      claims,
      'player',
      1,
      players,
      team('player', ['first', 'second']),
      5,
    );

    expect(result.tokens[0]!.finisherId).toBe('first');
    expect(result.receipts.map((entry) => entry.eventType)).toEqual(['chance_claimed', 'finisher_assigned', 'claim_fizzled']);
  });
});

describe('specialist conversion + typed counters', () => {
  it('lowers only the token successfully claimed by the same specialist Action', () => {
    const cross = token({ chanceType: 'cross', finisherId: 'glancer', finisherAssignment: 'claimed' });
    const box = token({ id: 'box', chanceType: 'box', order: 1, finisherId: 'wing', finisherAssignment: 'default' });
    const source = 'instance:glancer';
    const effects = [
      ledger({ type: 'claim_chance' }, { id: 'claim', sourceCardId: 'glancer', sourceInstanceId: source, chanceTypes: ['cross'] }),
      ledger({ type: 'set_goal_threshold', minimumRoll: 5 }, { id: 'threshold', sourceCardId: 'glancer', sourceInstanceId: source, chanceTypes: ['cross'] }),
    ];
    const result = applyTokenEffects([cross, box], effects, 'player');
    expect(result.find((entry) => entry.id === cross.id)!.minimumGoalRoll).toBe(5);
    expect(result.find((entry) => entry.id === box.id)!.minimumGoalRoll).toBe(6);
  });

  it('does not grant the specialist threshold when its claim fizzled', () => {
    const cross = token({ chanceType: 'cross', finisherId: 'other', finisherAssignment: 'claimed' });
    const source = 'instance:glancer';
    const effects = [
      ledger({ type: 'claim_chance' }, { id: 'claim', sourceCardId: 'glancer', sourceInstanceId: source, chanceTypes: ['cross'] }),
      ledger({ type: 'set_goal_threshold', minimumRoll: 5 }, { id: 'threshold', sourceCardId: 'glancer', sourceInstanceId: source, chanceTypes: ['cross'] }),
    ];
    expect(applyTokenEffects([cross], effects, 'player')[0]!.minimumGoalRoll).toBe(6);
  });

  it('a Cross-only defensive threshold floor cannot touch a Box', () => {
    const box = token({ id: 'box', chanceType: 'box', minimumGoalRoll: 5 });
    const cross = token({ id: 'cross', chanceType: 'cross', order: 1, minimumGoalRoll: 5 });
    const counter = ledger(
      { type: 'set_goal_threshold_floor', minimumRoll: 6 },
      { side: 'opponent', targetSide: 'enemy', chanceTypes: ['cross'], selector: 'first' },
    );
    const out = applyTokenEffects([box, cross], [counter], 'player');
    expect(out.find((entry) => entry.id === 'box')!.minimumGoalRoll).toBe(5);
    expect(out.find((entry) => entry.id === 'cross')!.minimumGoalRoll).toBe(6);
  });

  it('a defensive floor wins regardless of player/opponent ledger order', () => {
    const source = 'instance:runner';
    const throughBall = token({
      id: 'through',
      side: 'opponent',
      chanceType: 'through_ball',
      minimumGoalRoll: 6,
      finisherId: 'runner',
      finisherAssignment: 'claimed',
    });
    const claim = ledger(
      { type: 'claim_chance' },
      { side: 'opponent', id: 'claim', sourceCardId: 'runner', sourceInstanceId: source, chanceTypes: ['through_ball'] },
    );
    const specialist = ledger(
      { type: 'set_goal_threshold', minimumRoll: 5 },
      { side: 'opponent', id: 'specialist', sourceCardId: 'runner', sourceInstanceId: source, chanceTypes: ['through_ball'] },
    );
    const counter = ledger(
      { type: 'set_goal_threshold_floor', minimumRoll: 6 },
      { side: 'player', id: 'counter', targetSide: 'enemy', chanceTypes: ['through_ball'] },
    );

    expect(applyTokenEffects([throughBall], [counter, claim, specialist], 'opponent')[0]!.minimumGoalRoll).toBe(6);
    expect(applyTokenEffects([throughBall], [claim, specialist, counter], 'opponent')[0]!.minimumGoalRoll).toBe(6);
  });
});
