import { describe, expect, it } from 'vitest';
import type {
  BreakPlan,
  FormationDefinition,
  FormationSlot,
  PlannedActivation,
  PositionCode,
  RuntimeActionInstance,
  RuntimePlayerState,
  Sector,
  TeamSide,
  V7ActionDefinition,
  V7MatchState,
  V7PlayerCard,
  V7TeamState,
} from '../../lib/match-v7/types';
import {
  applyLineup,
  computePriority,
  createActionInstance,
  createChances,
  createRng,
  effectivePlayers,
  resolveBreak,
  sectorControl,
  splitByZone,
  type CardRegistry,
  type EffectivePlayer,
} from '..';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SLOTS: ReadonlyArray<[string, PositionCode, Sector]> = [
  ['gk', 'GK', 'centre'],
  ['ld', 'CB', 'left'], ['cd', 'CB', 'centre'], ['rd', 'CB', 'right'],
  ['lm', 'CM', 'left'], ['cm', 'CM', 'centre'], ['rm', 'CM', 'right'],
  ['lf', 'LF', 'left'], ['cf', 'CF', 'centre'], ['rf', 'RF', 'right'],
  ['am', 'AM', 'centre'],
];

function formation(key: string): FormationDefinition {
  const slots: FormationSlot[] = SLOTS.map(([slotKey, positionCode, sector], index) => ({
    slotKey,
    positionCode,
    sector,
    xOrder: index,
    yOrder: index,
    adjacentSlotKeys: [],
    partnerLinkKeys: [],
  }));
  return { id: key, formationKey: key, name: key, slots };
}

function card(
  id: string,
  naturalSector: Sector,
  attack: number,
  defence: number,
  positions: PositionCode[],
  actionIds: string[] = [],
): V7PlayerCard {
  return {
    id,
    cardKey: id,
    name: id,
    positionCodes: positions,
    naturalSector,
    printedAttack: attack,
    printedDefence: defence,
    printedCost: 3,
    role: 'Test',
    rarity: 'common',
    actionIds,
  };
}

function defineAction(overrides: Partial<V7ActionDefinition> = {}): V7ActionDefinition {
  return {
    id: 'act',
    actionKey: 'act',
    name: 'Action',
    displayText: '',
    ownerType: 'player',
    timing: 'activated',
    conditionGroups: [],
    target: { type: 'self' },
    effects: [{ type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 3 }],
    duration: 'current_period',
    activationLimitPerBreak: 1,
    isNegative: false,
    copyRules: {},
    disableRules: {},
    engineSupportStatus: 'supported',
    ...overrides,
  };
}

function activePlayer(
  cardId: string,
  slotKey: string,
  sector: Sector,
  deploymentOrder: number,
  instances: RuntimeActionInstance[] = [],
): RuntimePlayerState {
  return {
    cardId,
    deploymentOrder,
    zone: 'active',
    currentSlotKey: slotKey,
    currentSector: sector,
    periodsParticipated: [],
    mandatoryRemoval: false,
    actionInstances: instances,
    activeEffectIds: [],
    accumulatedStacks: {},
    currentCost: 3,
  };
}

function benchPlayer(cardId: string, deploymentOrder: number, instances: RuntimeActionInstance[] = []): RuntimePlayerState {
  return {
    cardId,
    deploymentOrder,
    zone: 'bench',
    periodsParticipated: [],
    mandatoryRemoval: false,
    actionInstances: instances,
    activeEffectIds: [],
    accumulatedStacks: {},
    currentCost: 3,
  };
}

function eff(cardId: string, sector: Sector, attack: number, defence: number): EffectivePlayer {
  return {
    cardId,
    zone: 'active',
    sector,
    naturalSector: sector,
    attack,
    defence,
    cost: 3,
    outOfPosition: false,
    emergencyGoalkeeper: false,
    actionsSuppressed: false,
    partnerCardIds: [],
  };
}

// ── Priority ──────────────────────────────────────────────────────────────

describe('priority from sector control (B5)', () => {
  it('gives priority to the side controlling more sectors', () => {
    const player = [eff('p-l', 'left', 5, 5), eff('p-c', 'centre', 5, 5), eff('p-r', 'right', 1, 1)];
    const opponent = [eff('o-l', 'left', 1, 1), eff('o-c', 'centre', 1, 1), eff('o-r', 'right', 9, 9)];
    const control = sectorControl(player, opponent);
    expect(control.map((entry) => entry.controlledBy)).toEqual(['player', 'player', 'opponent']);
    expect(computePriority(player, opponent)).toBe('player');
  });

  it('breaks a sector tie on total strength, then alternates from the previous period', () => {
    const player = [eff('p', 'left', 5, 5)];
    const opponent = [eff('o', 'right', 5, 5)];
    // 1 sector each → tie on sectors, tie on total → alternate.
    expect(computePriority(player, opponent, 'player')).toBe('opponent');
    expect(computePriority(player, opponent, 'opponent')).toBe('player');
    // Give the player more total strength → player wins outright.
    expect(computePriority([eff('p', 'left', 9, 9)], opponent)).toBe('player');
  });
});

// ── Effective stats ─────────────────────────────────────────────────────────

describe('effective-stat ledger', () => {
  const registry: CardRegistry = {
    cards: new Map([
      ['keeper', card('keeper', 'centre', 2, 9, ['GK'])],
      ['striker', card('striker', 'left', 8, 3, ['LF'])],
      ['fielder', card('fielder', 'centre', 6, 6, ['CM'])],
    ]),
    actions: new Map(),
    formations: new Map([['f', formation('f')]]),
  };

  it('folds a flat ledger modifier into a card stat', () => {
    const team: V7TeamState = {
      side: 'player', managerId: 'm', formationId: 'f', score: 0, cumulativeGrossChances: 0,
      players: [activePlayer('fielder', 'cm', 'centre', 0)],
    };
    const players = effectivePlayers(team, registry, [
      { id: 'e1', side: 'player', origin: 'activated', sourceInstanceId: 's', sourceActionId: 'a', sourceCardId: 'x', actionName: 'A',
        effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 4 }, targetIds: ['fielder'],
        createdPeriod: 1, createdBreakIndex: 1, lifetime: { kind: 'period', untilPeriod: 2 } },
    ]);
    expect(players[0]!.attack).toBe(10);
    expect(players[0]!.defence).toBe(6);
  });

  it('applies the out-of-position penalty off the natural sector', () => {
    const team: V7TeamState = {
      side: 'player', managerId: 'm', formationId: 'f', score: 0, cumulativeGrossChances: 0,
      players: [activePlayer('striker', 'rf', 'right', 0)], // left-natural striker in the right slot
    };
    const [player] = effectivePlayers(team, registry, []);
    expect(player!.outOfPosition).toBe(true);
    expect(player!.attack).toBe(6); // 8 − 2
    expect(player!.defence).toBe(1); // 3 − 2
  });

  it('forces an emergency goalkeeper to zero attack and suppresses actions', () => {
    const team: V7TeamState = {
      side: 'player', managerId: 'm', formationId: 'f', score: 0, cumulativeGrossChances: 0,
      players: [activePlayer('fielder', 'gk', 'centre', 0)], // outfielder in goal
    };
    const [player] = effectivePlayers(team, registry, []);
    expect(player!.emergencyGoalkeeper).toBe(true);
    expect(player!.attack).toBe(0);
    expect(player!.actionsSuppressed).toBe(true);
  });
});

// ── Stat reset (Law 3) ───────────────────────────────────────────────────────

describe('reset_stats folding (Law 3)', () => {
  const registry: CardRegistry = {
    cards: new Map([
      ['fielder', card('fielder', 'centre', 6, 6, ['CM'])],
      ['winger', card('winger', 'centre', 8, 3, ['CM'])],
    ]),
    actions: new Map(),
    formations: new Map([['f', formation('f')]]),
  };
  const team = (cardId: string): V7TeamState => ({
    side: 'player', managerId: 'm', formationId: 'f', score: 0, cumulativeGrossChances: 0,
    players: [activePlayer(cardId, 'cm', 'centre', 0)],
  });
  const base = { side: 'player' as const, origin: 'activated' as const, sourceInstanceId: 's', sourceActionId: 'a', sourceCardId: 'x', actionName: 'A', createdPeriod: 1 as const, createdBreakIndex: 1 as const };

  it('clears a temporary buff on reset but keeps a whole-match buff', () => {
    const [player] = effectivePlayers(team('fielder'), registry, [
      { ...base, id: 'e1', effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 4 }, targetIds: ['fielder'], lifetime: { kind: 'period', untilPeriod: 2 } },
      { ...base, id: 'e2', effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 2 }, targetIds: ['fielder'], lifetime: { kind: 'match' } },
      { ...base, id: 'e3', effect: { type: 'reset_stats' }, targetIds: ['fielder'], lifetime: { kind: 'immediate' } },
    ]);
    // printed 6, temporary +4 dropped, whole-match +2 survives.
    expect(player!.attack).toBe(8);
    expect(player!.defence).toBe(6);
  });

  it('leaves a stat change applied after the reset intact', () => {
    const [player] = effectivePlayers(team('fielder'), registry, [
      { ...base, id: 'e1', effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 4 }, targetIds: ['fielder'], lifetime: { kind: 'period', untilPeriod: 2 } },
      { ...base, id: 'e2', effect: { type: 'reset_stats' }, targetIds: ['fielder'], lifetime: { kind: 'immediate' } },
      { ...base, id: 'e3', effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 5 }, targetIds: ['fielder'], lifetime: { kind: 'period', untilPeriod: 2 } },
    ]);
    // pre-reset +4 dropped, post-reset +5 kept.
    expect(player!.attack).toBe(11);
  });

  it('undoes a temporary swap on reset but leaves cost modifiers untouched', () => {
    const [player] = effectivePlayers(team('winger'), registry, [
      { ...base, id: 'e1', effect: { type: 'swap_stats' }, targetIds: ['winger'], lifetime: { kind: 'period', untilPeriod: 2 } },
      { ...base, id: 'e2', effect: { type: 'modify_cost', amount: -2 }, targetIds: ['winger'], lifetime: { kind: 'period', untilPeriod: 2 } },
      { ...base, id: 'e3', effect: { type: 'reset_stats' }, targetIds: ['winger'], lifetime: { kind: 'immediate' } },
    ]);
    // swap undone → back to printed 8/3; cost is not a stat, so −2 survives (3 − 2).
    expect(player!.attack).toBe(8);
    expect(player!.defence).toBe(3);
    expect(player!.cost).toBe(1);
  });

  it('only resets the targeted card', () => {
    const both: V7TeamState = {
      side: 'player', managerId: 'm', formationId: 'f', score: 0, cumulativeGrossChances: 0,
      players: [activePlayer('fielder', 'cm', 'centre', 0), activePlayer('winger', 'lm', 'centre', 1)],
    };
    const players = effectivePlayers(both, registry, [
      { ...base, id: 'e1', effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 3 }, targetIds: ['fielder', 'winger'], lifetime: { kind: 'period', untilPeriod: 2 } },
      { ...base, id: 'e2', effect: { type: 'reset_stats' }, targetIds: ['fielder'], lifetime: { kind: 'immediate' } },
    ]);
    const byId = new Map(players.map((p) => [p.cardId, p]));
    expect(byId.get('fielder')!.attack).toBe(6); // reset back to printed
    expect(byId.get('winger')!.attack).toBe(11); // untouched: printed 8 + 3
  });
});

// ── Lineup ──────────────────────────────────────────────────────────────────

describe('lineup application (A3/A4)', () => {
  const registry: CardRegistry = {
    cards: new Map([
      ['starter', card('starter', 'centre', 6, 6, ['CM'])],
      ['sub', card('sub', 'centre', 5, 5, ['CM'])],
      ['keep', card('keep', 'centre', 2, 9, ['GK'])],
    ]),
    actions: new Map(),
    formations: new Map([['f', formation('f')]]),
  };

  it('subs a bench card into the slot of the card it replaces and removes the outgoing card', () => {
    const team: V7TeamState = {
      side: 'player', managerId: 'm', formationId: 'f', score: 0, cumulativeGrossChances: 0,
      players: [
        activePlayer('keep', 'gk', 'centre', 0),
        activePlayer('starter', 'cm', 'centre', 1),
        benchPlayer('sub', 2),
      ],
    };
    const plan: BreakPlan = {
      side: 'player', breakIndex: 1,
      outgoingCardIds: ['starter'],
      incomingAssignments: [{ cardId: 'sub', slotKey: 'cm' }],
      finalSlotAssignments: { gk: 'keep', cm: 'sub' },
      activations: [],
      submittedBudget: { breakIndex: 1, baseEnergy: 3, guaranteedModifiers: [], availableEnergy: 3, incomingCosts: [], netIncomingCost: 0, legalAtSubmission: true },
      scannerRevealState: 'none', locked: true,
    };
    const { team: next, receipts } = applyLineup(team, plan, registry, { period: 2, breakIndex: 1 });

    const byId = new Map(next.players.map((player) => [player.cardId, player]));
    expect(byId.get('starter')!.zone).toBe('removed');
    expect(byId.get('sub')!.zone).toBe('active');
    expect(byId.get('sub')!.currentSlotKey).toBe('cm');
    expect(byId.get('sub')!.currentSector).toBe('centre');
    expect(receipts.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['substitution_off', 'substitution_on']),
    );
  });
});

// ── Chance creation ─────────────────────────────────────────────────────────

describe('chance creation from the board', () => {
  it('creates d6-threshold tokens from the global attack-defence difference', () => {
    const ownActive = [eff('a', 'left', 12, 4), eff('b', 'centre', 10, 4), eff('c', 'right', 8, 4)];
    const enemyActive = [eff('x', 'left', 4, 6), eff('y', 'centre', 4, 7), eff('z', 'right', 4, 6)];
    const result = createChances('player', 2, ownActive, enemyActive, createRng(7, 'chance'));
    // total ATT 30 − total DEF 19 = 11 → ceil(11/5) = 3 tokens.
    expect(result.count).toBe(3);
    expect(result.tokens).toHaveLength(3);
    expect(result.tokens.every((token) => token.minimumGoalRoll === 6)).toBe(true);
    expect(result.tokens.every((token) => token.origin === 'calculated' && !token.cancelled)).toBe(true);
  });
});

// ── The break orchestrator ───────────────────────────────────────────────────

const BUFF = defineAction({ id: 'buff', name: 'Buff', printedCharges: 1 });
const AURA = defineAction({
  id: 'aura', name: 'Aura', timing: 'ongoing', duration: 'ongoing',
  effects: [{ type: 'modify_stat', stat: 'defence', mode: 'flat', amount: 2 }],
});
const GATED = defineAction({
  id: 'gated', name: 'Gated', printedCharges: 1,
  conditionGroups: [{ group: 1, conditions: [{ type: 'score_state', state: 'winning' }] }],
});
const RESET = defineAction({
  id: 'reset', name: 'Reset', printedCharges: 1,
  target: { type: 'self' }, effects: [{ type: 'reset_stats' }], duration: 'instant',
});

function fullTeam(side: TeamSide, extraInstances: Record<string, RuntimeActionInstance[]> = {}): V7TeamState {
  const players = SLOTS.map(([slotKey, , sector], index) =>
    activePlayer(`${side}-${slotKey}`, slotKey, sector, index, extraInstances[slotKey] ?? []),
  );
  return { side, managerId: `${side}-mgr`, formationId: 'f', score: 0, cumulativeGrossChances: 0, players };
}

function buildRegistry(): CardRegistry {
  const cards = new Map<string, V7PlayerCard>();
  for (const side of ['player', 'opponent'] as const) {
    for (const [slotKey, position, sector] of SLOTS) {
      cards.set(`${side}-${slotKey}`, card(`${side}-${slotKey}`, sector, 6, 5, [position]));
    }
  }
  return {
    cards,
    actions: new Map([['buff', BUFF], ['aura', AURA], ['gated', GATED], ['reset', RESET]]),
    formations: new Map([['f', formation('f')]]),
  };
}

function emptyPlan(side: TeamSide, activations: PlannedActivation[] = []): BreakPlan {
  return {
    side, breakIndex: 1,
    outgoingCardIds: [], incomingAssignments: [], finalSlotAssignments: {},
    activations,
    submittedBudget: { breakIndex: 1, baseEnergy: 3, guaranteedModifiers: [], availableEnergy: 3, incomingCosts: [], netIncomingCost: 0, legalAtSubmission: true },
    scannerRevealState: 'none', locked: true,
  };
}

function matchState(player: V7TeamState, opponent: V7TeamState, priority: TeamSide): V7MatchState {
  return { seed: 99, period: 1, breakIndex: 1, priority, player, opponent, receipt: [], resolutionDepth: 0 };
}

describe('break orchestration', () => {
  it('runs a staged activation, banks its effect on the ledger, and emits a receipt', () => {
    const buffInstance = createActionInstance(BUFF, { cardId: 'player-cm' });
    const player = fullTeam('player', { cm: [buffInstance] });
    const opponent = fullTeam('opponent');
    const registry = buildRegistry();

    const activation: PlannedActivation = { actionInstanceId: buffInstance.instanceId, sourceId: 'player-cm', stage: 'before_lineup_changes', order: 0 };
    const out = resolveBreak({
      state: matchState(player, opponent, 'player'),
      ledger: [],
      plans: { player: emptyPlan('player', [activation]), opponent: emptyPlan('opponent') },
      registry, breakIndex: 1, upcomingPeriod: 2,
    });

    const activated = out.ledger.filter((entry) => entry.origin === 'activated');
    expect(activated).toHaveLength(1);
    expect(activated[0]!.targetIds).toEqual(['player-cm']);
    expect(out.receipts.some((event) => event.eventType === 'action_activated')).toBe(true);
    expect(out.state.previousPriority).toBe('player');
    expect(out.state.period).toBe(2);
  });

  it('resolves the priority side entirely before the other side (A1)', () => {
    const playerBuff = createActionInstance(BUFF, { cardId: 'player-cm' });
    const opponentBuff = createActionInstance(BUFF, { cardId: 'opponent-cm' });
    const registry = buildRegistry();
    const out = resolveBreak({
      state: matchState(fullTeam('player', { cm: [playerBuff] }), fullTeam('opponent', { cm: [opponentBuff] }), 'opponent'),
      ledger: [],
      plans: {
        player: emptyPlan('player', [{ actionInstanceId: playerBuff.instanceId, sourceId: 'player-cm', stage: 'before_lineup_changes', order: 0 }]),
        opponent: emptyPlan('opponent', [{ actionInstanceId: opponentBuff.instanceId, sourceId: 'opponent-cm', stage: 'before_lineup_changes', order: 0 }]),
      },
      registry, breakIndex: 1, upcomingPeriod: 2,
    });

    const activationSides = out.receipts.filter((event) => event.eventType === 'action_activated').map((event) => event.side);
    // Opponent has priority → its activation receipt comes first.
    expect(activationSides).toEqual(['opponent', 'player']);
  });

  it('fizzles a gated activation without banking an effect', () => {
    const gatedInstance = createActionInstance(GATED, { cardId: 'player-cm' });
    const registry = buildRegistry();
    const out = resolveBreak({
      state: matchState(fullTeam('player', { cm: [gatedInstance] }), fullTeam('opponent'), 'player'),
      ledger: [],
      plans: { player: emptyPlan('player', [{ actionInstanceId: gatedInstance.instanceId, sourceId: 'player-cm', stage: 'before_lineup_changes', order: 0 }]), opponent: emptyPlan('opponent') },
      registry, breakIndex: 1, upcomingPeriod: 2,
    });
    expect(out.ledger.filter((entry) => entry.origin === 'activated')).toEqual([]);
    expect(out.receipts.some((event) => event.eventType === 'action_fizzled')).toBe(true);
  });

  it('recomputes ongoing effects against the settled board', () => {
    const auraInstance = createActionInstance(AURA, { cardId: 'player-cd' });
    const registry = buildRegistry();
    const out = resolveBreak({
      state: matchState(fullTeam('player', { cd: [auraInstance] }), fullTeam('opponent'), 'player'),
      ledger: [],
      plans: { player: emptyPlan('player'), opponent: emptyPlan('opponent') },
      registry, breakIndex: 1, upcomingPeriod: 2,
    });
    const ongoing = out.ledger.filter((entry) => entry.origin === 'ongoing' && entry.side === 'player');
    expect(ongoing).toHaveLength(1);
    expect(ongoing[0]!.targetIds).toEqual(['player-cd']);
  });

  it('clears a temporary buff at reset while reapplying the ongoing aura after it', () => {
    const auraInstance = createActionInstance(AURA, { cardId: 'player-cd' });
    const resetInstance = createActionInstance(RESET, { cardId: 'player-cd' });
    const registry = buildRegistry();
    const out = resolveBreak({
      state: matchState(fullTeam('player', { cd: [auraInstance, resetInstance] }), fullTeam('opponent'), 'player'),
      // A temporary buff carried in from an earlier period, still on the ledger.
      ledger: [
        { id: 'carry', side: 'player', origin: 'activated', sourceInstanceId: 'carry', sourceActionId: 'buff', sourceCardId: 'player-cd', actionName: 'Carry',
          effect: { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 5 }, targetIds: ['player-cd'],
          createdPeriod: 1, createdBreakIndex: 1, lifetime: { kind: 'period', untilPeriod: 4 } },
      ],
      plans: {
        player: emptyPlan('player', [{ actionInstanceId: resetInstance.instanceId, sourceId: 'player-cd', stage: 'before_lineup_changes', order: 0 }]),
        opponent: emptyPlan('opponent'),
      },
      registry, breakIndex: 1, upcomingPeriod: 2,
    });

    const cd = effectivePlayers(out.state.player, registry, out.ledger).find((player) => player.cardId === 'player-cd')!;
    // Card prints 6/5. The reset drops the carried +5 attack; the ongoing aura
    // (+2 defence), re-emitted after the reset, still lands.
    expect(cd.attack).toBe(6);
    expect(cd.defence).toBe(7);
    expect(out.receipts.some((event) => event.eventType === 'action_activated' && event.actionName === 'Reset')).toBe(true);

    const reset = out.receipts.find((event) => event.eventType === 'stats_reset');
    expect(reset?.targetIds).toEqual(['player-cd']);
    expect(reset?.data.clearedEffectIds).toEqual(['carry']);
  });

  it('creates the upcoming period chances for both sides', () => {
    const registry = buildRegistry();
    const out = resolveBreak({
      state: matchState(fullTeam('player'), fullTeam('opponent'), 'player'),
      ledger: [], plans: { player: emptyPlan('player'), opponent: emptyPlan('opponent') },
      registry, breakIndex: 1, upcomingPeriod: 2,
    });
    expect(out.chances.player.every((token) => token.minimumGoalRoll === 6)).toBe(true);
    expect(Array.isArray(out.chances.opponent)).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const registry = buildRegistry();
    const build = () => {
      const buffInstance = createActionInstance(BUFF, { cardId: 'player-cm' });
      return resolveBreak({
        state: matchState(fullTeam('player', { cm: [buffInstance] }), fullTeam('opponent'), 'player'),
        ledger: [],
        plans: { player: emptyPlan('player', [{ actionInstanceId: buffInstance.instanceId, sourceId: 'player-cm', stage: 'before_lineup_changes', order: 0 }]), opponent: emptyPlan('opponent') },
        registry, breakIndex: 1, upcomingPeriod: 2,
      });
    };
    const first = build();
    const second = build();
    expect(first.receipts).toEqual(second.receipts);
    expect(first.ledger).toEqual(second.ledger);
    expect(first.chances).toEqual(second.chances);
  });
});

// ── sanity: effectivePlayers split ───────────────────────────────────────────

describe('splitByZone', () => {
  it('separates active and bench effective players', () => {
    const base = buildRegistry();
    const registry: CardRegistry = {
      ...base,
      cards: new Map([...base.cards, ['player-bench', card('player-bench', 'centre', 4, 4, ['CM'])]]),
    };
    const team = fullTeam('player');
    const withBench: V7TeamState = { ...team, players: [...team.players, benchPlayer('player-bench', 20)] };
    const { active, bench } = splitByZone(effectivePlayers(withBench, registry, []));
    expect(active).toHaveLength(11);
    expect(bench.map((player) => player.cardId)).toEqual(['player-bench']);
  });
});
