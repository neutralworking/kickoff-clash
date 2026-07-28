import { describe, expect, it } from 'vitest';
import { getFormation } from '@/lib/formations';
import { handFromSelection } from '@/lib/hand';
import { ripStarterPacks } from '@/lib/packs';
import { createRun, getOpponent } from '@/lib/run';
import { autoFill, BENCH_SIZE, emptySelection } from '@/lib/team-select';
import { buildLiveV7Fixture } from '../live';
import { V7MatchController } from '../controller';

describe('live run → improved V7 match', () => {
  it('deals and selects an 18-player matchday squad', () => {
    const contents = ripStarterPacks(20260728);
    const formation = getFormation('4-3-3');
    const selected = autoFill(contents.players, formation, emptySelection(formation), 'all');

    expect(contents.players).toHaveLength(18);
    expect(BENCH_SIZE).toBe(7);
    expect(selected.starters.filter((id): id is number => id != null)).toHaveLength(11);
    expect(selected.bench).toHaveLength(7);
  });

  it('starts the V7 controller from the existing run, squad and opponent data', () => {
    const seed = 20260728;
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
    expect(hand).not.toBeNull();

    const fixture = buildLiveV7Fixture(run, hand!);
    expect(fixture.home.startingXI).toHaveLength(11);
    expect(fixture.home.benchIds).toHaveLength(7);
    expect(fixture.away.startingXI).toHaveLength(11);
    expect(fixture.away.benchIds).toHaveLength(7);
    expect(fixture.home.formationId).toBe('live-formation-4-3-3');
    expect(fixture.away.manager.name).toBe(getOpponent(1).name);
    expect(fixture.home.benchIds.every((id) => /^live-\d+$/.test(id))).toBe(true);

    const controller = new V7MatchController(fixture);
    const view = controller.getView();
    expect(view.player.active).toHaveLength(11);
    expect(view.player.bench).toHaveLength(7);
    expect(view.opponent.active).toHaveLength(11);
    expect(view.opponent.bench).toHaveLength(7);

    controller.resolvePeriod();
    expect(controller.getSnapshots()).toHaveLength(1);
  });
});
