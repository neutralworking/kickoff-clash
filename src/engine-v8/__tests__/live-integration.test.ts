import { describe, expect, it } from 'vitest';
import { V8_CALIBRATION_PLAYER_BY_ID } from '@/engine-v8/calibration-cards';
import { buildLiveV8Fixture } from '@/game-v8';
import { ripStarterPacks } from '@/lib/packs';
import { addCardToDeck, createRun, getShopCards } from '@/lib/run';
import { ALL_FORMATIONS } from '@/lib/formations';
import { managerFormationsV1 } from '@/lib/manager-v1';

function starterRun(seed = 8082026) {
  const contents = ripStarterPacks(seed);
  return createRun({
    players: contents.players,
    startingXI: contents.players.slice(0, 11).map((card) => card.id),
    benchIds: contents.players.slice(11).map((card) => card.id),
    manager: null,
    tactics: [],
    formationId: '4-3-3',
    intent: 'balanced',
  }, seed);
}

describe('live V8 fixture bridge', () => {
  it('limits a new run to its manager card formation pool', () => {
    const contents = ripStarterPacks(8082030);
    const manager = contents.managers[0]!;
    const allowed = managerFormationsV1(manager);
    const disallowed = ALL_FORMATIONS.find((formation) => !allowed.includes(formation.id))!;
    const run = createRun({
      players: contents.players,
      startingXI: contents.players.slice(0, 11).map((card) => card.id),
      benchIds: contents.players.slice(11).map((card) => card.id),
      manager,
      tactics: [],
      formationId: disallowed.id,
      intent: 'balanced',
    }, 8082030);

    expect(run.ownedFormations).toEqual(allowed);
    expect(run.activeFormation).toBe(allowed[0]);
    expect(run.ownedFormations).not.toContain(disallowed.id);
  });

  it('carries the selected starter XI into a deterministic 11-v-11 V8 fixture', () => {
    const run = starterRun();
    const fixture = buildLiveV8Fixture(run);
    const replay = buildLiveV8Fixture(run);

    expect(fixture.homeCards.map((card) => card.id)).toEqual(run.startingXI);
    expect(fixture.homePlayerIds).toHaveLength(11);
    expect(fixture.awayPlayerIds).toHaveLength(11);
    expect(fixture.awayPlayerIds).toEqual(replay.awayPlayerIds);
    expect(fixture.contextLabel).toBe('CUP 1 · TIE 1');
    expect(fixture.homePlayerIds.every((id) => V8_CALIBRATION_PLAYER_BY_ID.has(id))).toBe(true);
    expect(fixture.awayPlayerIds.every((id) => V8_CALIBRATION_PLAYER_BY_ID.has(id))).toBe(true);
  });

  it('carries a shop signing into the next fixture with its authored V8 Action', () => {
    const run = starterRun(8082028);
    const starterPlayerIds = new Set(run.deck.map((card) => card.v8PlayerId));
    const shopCard = getShopCards(run.seed + run.round * 999)
      .find((card) => card.v8PlayerId && !starterPlayerIds.has(card.v8PlayerId));

    expect(shopCard).toBeDefined();
    const signedRun = addCardToDeck(run, shopCard!);
    const signing = signedRun.deck.at(-1)!;
    const withSigningSelected = {
      ...signedRun,
      startingXI: [signing.id, ...(signedRun.startingXI ?? []).slice(1)],
    };
    const fixture = buildLiveV8Fixture(withSigningSelected);
    const playerId = fixture.homePlayerIds[0]!;

    expect(playerId).toBe(shopCard!.v8PlayerId);
    expect(V8_CALIBRATION_PLAYER_BY_ID.get(playerId)?.actionName).toBe(shopCard!.abilityName);
    expect(V8_CALIBRATION_PLAYER_BY_ID.get(playerId)?.actionName).not.toBe('V8 ADAPTER');
  });

  it('adapts a later legacy signing instead of blocking the next match', () => {
    const run = starterRun(8082027);
    const legacy = {
      ...run.deck[0]!,
      id: 990001,
      name: 'Legacy Trialist',
      realName: undefined,
      v8PlayerId: undefined,
      abilityName: undefined,
      abilityText: undefined,
      printedCost: undefined,
      printedAttack: undefined,
      printedDefence: undefined,
    };
    const withLegacy = {
      ...run,
      deck: [legacy, ...run.deck.slice(1)],
      startingXI: [legacy.id, ...(run.startingXI ?? []).slice(1)],
    };
    const fixture = buildLiveV8Fixture(withLegacy);
    const playerId = fixture.homePlayerIds[0]!;

    expect(playerId).toBe(`live-card-${legacy.id}`);
    expect(V8_CALIBRATION_PLAYER_BY_ID.get(playerId)).toMatchObject({
      realName: 'Legacy Trialist',
      actionName: 'V8 ADAPTER',
      usesCalibrationStatFallback: true,
    });
  });
});
