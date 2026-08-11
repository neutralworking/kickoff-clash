import { describe, expect, it } from 'vitest';
import {
  V8_EXPANSION_BATCH_01,
  getV8ExpansionBatch01Card,
} from '../calibration-expansion-batch-01';

describe('V8 Action expansion Batch 01 contracts', () => {
  it('contains eight unique mixed-XI cards grounded in tracker rows', () => {
    expect(V8_EXPANSION_BATCH_01).toHaveLength(8);
    expect(new Set(V8_EXPANSION_BATCH_01.map((card) => card.id)).size).toBe(8);
    expect(V8_EXPANSION_BATCH_01.every((card) => card.trackerRow >= 5)).toBe(true);
    expect(V8_EXPANSION_BATCH_01.some((card) => card.naturalZones.includes('DEF'))).toBe(true);
    expect(V8_EXPANSION_BATCH_01.some((card) => card.naturalZones.includes('MID'))).toBe(true);
    expect(V8_EXPANSION_BATCH_01.some((card) => card.naturalZones.includes('ATT'))).toBe(true);
  });

  it('does not smuggle V7 dice, reroll or lateral-sector mechanics into V8 text', () => {
    const text = V8_EXPANSION_BATCH_01.map((card) => card.actionText.toLowerCase()).join('\n');
    for (const forbidden of ['needs a 5', 'requires a 7', 'reroll', 'left sector', 'right sector', 'central sector']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('locks the first reusable primitive set before runtime wiring', () => {
    expect(getV8ExpansionBatch01Card('abedi-pele').primitives).toEqual(['move_once']);
    expect(getV8ExpansionBatch01Card('aitana-bonmati').primitives).toEqual(['delayed_player_cost']);
    expect(getV8ExpansionBatch01Card('puyol').primitives).toEqual(['chance_cancellation_with_self_cost']);
    expect(getV8ExpansionBatch01Card('berbatov').primitives).toEqual(['action_target_interception', 'reactive_move']);
  });

  it('keeps Kante at stats-required after multi-zone presence semantics are resolved', () => {
    const kante = getV8ExpansionBatch01Card('kante');
    expect(kante.trackerRow).toBe(186);
    expect(kante.actionName).toBe('EVERYWHERE');
    expect(kante.primitives).toEqual(['multi_zone_presence']);
    expect(kante.actionText).toContain('Its ATT and DEF still contribute only where it is played.');
    expect(kante.implementationState).toBe('stats_required');
  });
});