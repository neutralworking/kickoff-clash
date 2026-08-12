import { describe, expect, it } from 'vitest';
import { V8_CALIBRATION_PLAYER_BY_ID } from '@/engine-v8/calibration-cards';
import { buildLiveV8Fixture } from '@/game-v8';
import { ripStarterPacks } from '@/lib/packs';
import { createRun } from '@/lib/run';

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
