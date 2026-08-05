import { describe, expect, it } from 'vitest';
import type {
  BreakPlan,
  FormationDefinition,
  FormationSlot,
  RuntimePlayerState,
  SectorLock,
  Sector,
  V7MatchState,
  V7PlayerCard,
  V7TeamState,
} from '../../lib/match-v7/types';
import { resolveBreak, validateBreakPlan, type CardRegistry, type LedgerEffect } from '..';

function slot(slotKey: string, sector: Sector, order: number): FormationSlot {
  return { slotKey, positionCode: slotKey === 'gk' ? 'GK' : 'CM', sector, xOrder: order, yOrder: order, adjacentSlotKeys: [], partnerLinkKeys: [] };
}
const FORMATION: FormationDefinition = {
  id: 'f', formationKey: 'f', name: 'f',
  slots: [slot('gk', 'centre', 0), slot('cm', 'centre', 1), slot('lm', 'left', 2)],
};

function active(cardId: string, slotKey: string, sector: Sector, mandatoryRemoval = false): RuntimePlayerState {
  return { cardId, deploymentOrder: 0, zone: 'active', currentSlotKey: slotKey, currentSector: sector, periodsParticipated: [], mandatoryRemoval, actionInstances: [], activeEffectIds: [], accumulatedStacks: {}, currentCost: 3 };
}
function bench(cardId: string): RuntimePlayerState {
  return { cardId, deploymentOrder: 9, zone: 'bench', periodsParticipated: [], mandatoryRemoval: false, actionInstances: [], activeEffectIds: [], accumulatedStacks: {}, currentCost: 3 };
}

const players = [active('keeper', 'gk', 'centre'), active('starter', 'cm', 'centre'), bench('sub')];
const subIntoCentre: BreakPlan = {
  side: 'player', breakIndex: 1,
  outgoingCardIds: ['starter'], incomingAssignments: [{ cardId: 'sub', slotKey: 'cm' }],
  finalSlotAssignments: { gk: 'keeper', cm: 'sub' }, activations: [],
  submittedBudget: { breakIndex: 1, baseEnergy: 3, guaranteedModifiers: [], availableEnergy: 3, incomingCosts: [], netIncomingCost: 0, legalAtSubmission: true },
  scannerRevealState: 'none', locked: true,
};
const centreLock: SectorLock = { side: 'player', sector: 'centre' };
const coords = { period: 2 as const, breakIndex: 0 as const };

describe('sector locks — enforcement (Law 5)', () => {
  it('rejects a plan that substitutes into a locked sector', () => {
    const result = validateBreakPlan({ plan: subIntoCentre, formation: FORMATION, players, locks: [centreLock], coords });
    expect(result.legal).toBe(false);
    expect(result.errors.some((error) => error.includes('locked centre'))).toBe(true);
  });

  it('allows the plan when the lock is on the other side', () => {
    const result = validateBreakPlan({ plan: subIntoCentre, formation: FORMATION, players, locks: [{ side: 'opponent', sector: 'centre' }], coords });
    expect(result.legal).toBe(true);
  });

  it('allows the plan when no locks are supplied', () => {
    expect(validateBreakPlan({ plan: subIntoCentre, formation: FORMATION, players }).legal).toBe(true);
  });

  it('lets a mandatory-removal card be replaced in a locked sector (removal wins)', () => {
    const forced = players.map((player) => (player.cardId === 'starter' ? active('starter', 'cm', 'centre', true) : player));
    const result = validateBreakPlan({ plan: subIntoCentre, formation: FORMATION, players: forced, locks: [centreLock], coords });
    expect(result.legal).toBe(true);
  });

  it('ignores an expired lock window', () => {
    const expired: SectorLock = { side: 'player', sector: 'centre', until: { period: 1 } };
    const result = validateBreakPlan({ plan: subIntoCentre, formation: FORMATION, players, locks: [expired], coords });
    expect(result.legal).toBe(true); // period 2 is past the lock's until-period 1
  });
});

describe('sector locks — creation (Law 5)', () => {
  const card = (id: string): V7PlayerCard => ({ id, cardKey: id, name: id, positionCodes: ['GK'], naturalSector: 'centre', printedAttack: 2, printedDefence: 6, printedCost: 3, role: 'Test', rarity: 'common', actionIds: [] });
  const registry: CardRegistry = {
    cards: new Map([['p1', card('p1')], ['o1', card('o1')]]),
    actions: new Map(),
    formations: new Map([['f', FORMATION]]),
  };
  const team = (side: 'player' | 'opponent', cardId: string): V7TeamState => ({
    side, managerId: `${side}-m`, formationId: 'f', score: 0, cumulativeGrossChances: 0,
    players: [active(cardId, 'gk', 'centre')],
  });
  const emptyPlan = (side: 'player' | 'opponent'): BreakPlan => ({
    side, breakIndex: 1, outgoingCardIds: [], incomingAssignments: [], finalSlotAssignments: {}, activations: [],
    submittedBudget: { breakIndex: 1, baseEnergy: 3, guaranteedModifiers: [], availableEnergy: 3, incomingCosts: [], netIncomingCost: 0, legalAtSubmission: true },
    scannerRevealState: 'none', locked: true,
  });

  it('a lock_sector effect this break creates a lock on the next state', () => {
    const state: V7MatchState = { seed: 1, period: 1, breakIndex: 1, priority: 'player', player: team('player', 'p1'), opponent: team('opponent', 'o1'), receipt: [], resolutionDepth: 0 };
    const lockEffect: LedgerEffect = {
      id: 'lock-1', side: 'player', origin: 'activated', sourceInstanceId: 's', sourceActionId: 'a', sourceCardId: 'x', actionName: 'Lockdown',
      effect: { type: 'lock_sector', sector: 'centre', targetSide: 'enemy', duration: 'next_period' }, targetIds: [],
      createdPeriod: 2, createdBreakIndex: 1, lifetime: { kind: 'period', untilPeriod: 3 },
    };
    const out = resolveBreak({ state, ledger: [lockEffect], plans: { player: emptyPlan('player'), opponent: emptyPlan('opponent') }, registry, breakIndex: 1, upcomingPeriod: 2 });
    expect(out.state.locks).toBeDefined();
    // targetSide 'enemy' on a player-side effect → the opponent's centre is locked.
    expect(out.state.locks).toContainEqual({ side: 'opponent', sector: 'centre', until: { period: 3 } });
  });
});
