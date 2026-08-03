import { describe, expect, it } from 'vitest';
import { getFormation } from '@/lib/formations';
import { handFromSelection } from '@/lib/hand';
import { ripStarterPacks } from '@/lib/packs';
import { createRun } from '@/lib/run';
import { autoFill, emptySelection } from '@/lib/team-select';
import type { Card, Durability } from '@/lib/scoring';
import type { FixtureSquad, V7Fixture } from '../fixtures';
import {
  adaptLiveFormation,
  adaptPlayerCard,
  buildInitialMatch,
  buildLiveV7Fixture,
} from '..';
import {
  calculatedChanceCount,
  effectivePlayers,
  playMatch,
  splitByZone,
  type V7ManagerCard,
  type V7PlayerCard,
} from '@/engine-v7';

// NW-152 regression. The live adapter used to derive ATT and DEF from one `power`
// scalar with equal-and-opposite biases, so a standard XI summed to more team DEF
// than team ATT. The engine's chance count needs team ATT to exceed enemy DEF, so
// every mirror-quality live match created zero chances and ended 0-0. These tests
// pin the fixed regime: mirror-quality live-adapted squads create chances and a
// full live match is not scoreless — through both a controlled mirror and the real
// `buildLiveV7Fixture` production path. They fail closed if the 0-0 regime returns.

const FORMATION_433 = adaptLiveFormation(getFormation('4-3-3'));

// A standard 4-3-3 in live position codes, in slot order (GK, 2×FB, 2×CB, DM,
// 2×CM, LW, CF, RW). Real matchday squads carry more defensive than attacking
// slots — the exact shape that produced the symmetry bug.
const XI_POSITIONS = ['GK', 'WD', 'CD', 'CD', 'WD', 'DM', 'CM', 'CM', 'WF', 'CF', 'WF'];

function liveCard(position: string, power: number, index: number): Card {
  return {
    id: 1000 + index,
    name: `Player ${index}`,
    position,
    archetype: position,
    power,
    rarity: 'Rare',
    gatePull: 0,
    durability: 'standard' as Durability,
  } as Card;
}

/** Adapt a 4-3-3 XI the way the live builder does: stats from the adapter, flank
 *  (position code + sector) from the formation slot the card is placed in. */
function adaptXI(power: number, prefix: string): V7PlayerCard[] {
  return XI_POSITIONS.map((position, index) => {
    const slot = FORMATION_433.slots[index]!;
    const adapted = adaptPlayerCard(liveCard(position, power, index));
    if (!adapted.ok) throw new Error(adapted.error.message);
    return {
      ...adapted.value,
      id: `${prefix}-${index}`,
      cardKey: `${prefix}-${index}`,
      positionCodes: [slot.positionCode],
      naturalSector: slot.sector,
    };
  });
}

function bench(power: number, prefix: string): V7PlayerCard[] {
  return ['GK', 'CD', 'WD', 'CM', 'WM', 'WF', 'CF'].map((position, index) => {
    const adapted = adaptPlayerCard(liveCard(position, power, 500 + index));
    if (!adapted.ok) throw new Error(adapted.error.message);
    return { ...adapted.value, id: `${prefix}-b${index}`, cardKey: `${prefix}-b${index}` };
  });
}

const manager = (id: string): V7ManagerCard => ({
  id, cardKey: id, name: id, startingBudget: 5, formationIds: [FORMATION_433.id], actionIds: [], rarity: 'rare',
});

/** A V7 fixture with two independent squads (mirror when powers are equal). */
function twoSquadFixture(homePower: number, awayPower: number, seed = 1): V7Fixture {
  const homeXI = adaptXI(homePower, 'home');
  const homeBench = bench(homePower, 'home');
  const awayXI = adaptXI(awayPower, 'away');
  const awayBench = bench(awayPower, 'away');
  const home: FixtureSquad = { manager: manager('m-home'), formationId: FORMATION_433.id, startingXI: homeXI.map((c) => c.id), benchIds: homeBench.map((c) => c.id) };
  const away: FixtureSquad = { manager: manager('m-away'), formationId: FORMATION_433.id, startingXI: awayXI.map((c) => c.id), benchIds: awayBench.map((c) => c.id) };
  return { seed, cards: [...homeXI, ...homeBench, ...awayXI, ...awayBench], actions: [], formations: [FORMATION_433], home, away, source: 'fixture' };
}

function teamTotals(fixture: V7Fixture) {
  const built = buildInitialMatch(fixture);
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  const { state, registry } = built.value;
  const active = (team: typeof state.player) => splitByZone(effectivePlayers(team, registry, [])).active;
  const sum = (players: ReturnType<typeof active>, key: 'attack' | 'defence') => players.reduce((total, p) => total + p[key], 0);
  const player = active(state.player);
  const opponent = active(state.opponent);
  return {
    playerAtt: sum(player, 'attack'), playerDef: sum(player, 'defence'),
    opponentAtt: sum(opponent, 'attack'), opponentDef: sum(opponent, 'defence'),
    playerActive: player,
  };
}

describe('NW-152 — live-adapted squads create chances', () => {
  it('a standard live-adapted XI sums to more team ATT than team DEF', () => {
    // The root-cause property. Under the old derivation this was inverted.
    const totals = teamTotals(twoSquadFixture(70, 70));
    expect(totals.playerAtt).toBeGreaterThan(totals.playerDef);
  });

  it.each([55, 62, 70, 78, 85])('two mirror-quality squads (power %i) each create a non-zero chance count', (power) => {
    const totals = teamTotals(twoSquadFixture(power, power));
    const playerChances = calculatedChanceCount(totals.playerAtt, totals.opponentDef);
    const opponentChances = calculatedChanceCount(totals.opponentAtt, totals.playerDef);
    expect(playerChances).toBeGreaterThan(0);
    expect(opponentChances).toBeGreaterThan(0);
  });

  it('a full mirror match is not scoreless (was 0-0 every match)', () => {
    let totalGoals = 0;
    let scoreless = 0;
    const matches = 40;
    for (let seed = 0; seed < matches; seed += 1) {
      const built = buildInitialMatch(twoSquadFixture(70, 70, 100 + seed * 37));
      if (!built.ok) throw new Error(JSON.stringify(built.error));
      const result = playMatch({ state: built.value.state, ledger: built.value.ledger, registry: built.value.registry });
      const goals = result.finalScore.player + result.finalScore.opponent;
      totalGoals += goals;
      if (goals === 0) scoreless += 1;
    }
    expect(totalGoals).toBeGreaterThan(0);
    // A credible football rate, nothing like the old 100% 0-0.
    expect(scoreless / matches).toBeLessThan(0.3);
  });

  it('a stronger squad creates strictly more chances than a weaker one (builds matter)', () => {
    const strong = teamTotals(twoSquadFixture(88, 55));
    const strongChances = calculatedChanceCount(strong.playerAtt, strong.opponentDef);
    const weakChances = calculatedChanceCount(strong.opponentAtt, strong.playerDef);
    expect(strongChances).toBeGreaterThan(weakChances);
  });

  it('flank is slot-derived: a live-adapted XI populates both the left and right sectors', () => {
    const totals = teamTotals(twoSquadFixture(70, 70));
    const sectors = new Set(totals.playerActive.map((p) => p.sector));
    expect(sectors.has('left')).toBe(true);
    expect(sectors.has('right')).toBe(true);
    expect(sectors.has('centre')).toBe(true);
  });
});

describe('NW-152 — the real live production path scores', () => {
  it('buildLiveV7Fixture → a full match produces goals across seeds', () => {
    let totalGoals = 0;
    const seeds = [20260728, 20260729, 20260730, 20260731, 20260801];
    for (const seed of seeds) {
      const contents = ripStarterPacks(seed);
      const formation = getFormation('4-3-3');
      const selected = autoFill(contents.players, formation, emptySelection(formation), 'all');
      const startingXI = selected.starters.filter((id): id is number => id != null);
      const run = createRun({
        players: contents.players,
        startingXI,
        benchIds: selected.bench,
        manager: contents.managers[0] ?? null,
        tactics: [],
        formationId: formation.id,
        intent: 'balanced',
      }, seed);
      const hand = handFromSelection(run.deck, run.startingXI, run.benchIds, formation);
      if (!hand) throw new Error('hand build failed');

      const fixture = buildLiveV7Fixture(run, hand);
      const built = buildInitialMatch(fixture);
      if (!built.ok) throw new Error(JSON.stringify(built.error));
      const result = playMatch({ state: built.value.state, ledger: built.value.ledger, registry: built.value.registry });
      totalGoals += result.finalScore.player + result.finalScore.opponent;
    }
    // Across five real matchdays the live path must put the ball in the net.
    expect(totalGoals).toBeGreaterThan(0);
  });
});
