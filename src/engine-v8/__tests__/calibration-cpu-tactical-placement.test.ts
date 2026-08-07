import { describe, expect, it } from 'vitest';
import {
  createTacticalInstance,
  tacticalDefinition,
  type V8TacticalCardInstance,
  type V8Zone,
} from '../tactical';
import {
  createV8CalibrationState,
  previewCalibrationTacticalCost,
  seedCalibrationPlayer,
  type V8CalibrationState,
} from '../calibration-runtime';

function chooseLikeCalibrationCpu(
  state: V8CalibrationState,
  card: V8TacticalCardInstance,
  energy = 9,
): { zone: V8Zone; cost: number } | undefined {
  return tacticalDefinition(card.type).eligibleZones
    .map((zone) => ({ zone, cost: previewCalibrationTacticalCost(state, 'away', card, zone) }))
    .filter(({ cost }) => cost <= energy)
    .sort((a, b) => a.cost - b.cost)[0];
}

describe('V8 calibration CPU Tactical placement', () => {
  it('prefers ATT for Cross so the Cross squad can use its heading specialists', () => {
    const state = seedCalibrationPlayer(createV8CalibrationState(), 'away', 'wambach', 'ATT');
    const choice = chooseLikeCalibrationCpu(state, createTacticalInstance('cross', 'cpu-cross'));

    expect(choice).toEqual({ zone: 'ATT', cost: 1 });
    expect(new Set(tacticalDefinition('cross').eligibleZones)).toEqual(new Set(['MID', 'ATT']));
  });

  it('prefers ATT for Through Ball so the Through Ball squad can use its runners', () => {
    const state = seedCalibrationPlayer(createV8CalibrationState(), 'away', 'shevchenko', 'ATT');
    const choice = chooseLikeCalibrationCpu(state, createTacticalInstance('through_ball', 'cpu-through-ball'));

    expect(choice).toEqual({ zone: 'ATT', cost: 1 });
    expect(new Set(tacticalDefinition('through_ball').eligibleZones)).toEqual(new Set(['MID', 'ATT']));
  });

  it('prefers MID for Long Shot and still takes Lloyd’s real zero-cost rider when available', () => {
    const state = seedCalibrationPlayer(createV8CalibrationState(), 'away', 'lloyd', 'MID');
    const choice = chooseLikeCalibrationCpu(state, createTacticalInstance('long_shot', 'cpu-long-shot'));

    expect(choice).toEqual({ zone: 'MID', cost: 0 });
    expect(new Set(tacticalDefinition('long_shot').eligibleZones)).toEqual(new Set(['DEF', 'MID', 'ATT']));
  });

  it('keeps Trigger Press in ATT, where its DEF-to-ATT conversion actually resolves', () => {
    const state = seedCalibrationPlayer(createV8CalibrationState(), 'away', 'makelele', 'ATT');
    const choice = chooseLikeCalibrationCpu(state, createTacticalInstance('trigger_press', 'cpu-trigger-press'));

    expect(choice).toEqual({ zone: 'ATT', cost: 1 });
    expect(tacticalDefinition('trigger_press').eligibleZones).toEqual(['ATT']);
  });

  it('uses stable specialist-lane tie-breaks without changing Tactical costs', () => {
    const state = createV8CalibrationState();

    expect(chooseLikeCalibrationCpu(state, createTacticalInstance('cross', 'cross'))).toEqual({ zone: 'ATT', cost: 1 });
    expect(chooseLikeCalibrationCpu(state, createTacticalInstance('through_ball', 'through'))).toEqual({ zone: 'ATT', cost: 1 });
    expect(chooseLikeCalibrationCpu(state, createTacticalInstance('long_shot', 'shot'))).toEqual({ zone: 'MID', cost: 1 });
  });
});
