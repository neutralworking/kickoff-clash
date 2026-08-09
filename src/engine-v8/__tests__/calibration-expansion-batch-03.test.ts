import { describe, expect, it } from 'vitest';
import {
  V8_EXPANSION_BATCH_03,
  getV8ExpansionBatch03Card,
} from '../calibration-expansion-batch-03';

describe('V8 Action expansion Batch 03 contracts', () => {
  it('contains eight unique mixed-position Tracker-backed cards', () => {
    expect(V8_EXPANSION_BATCH_03).toHaveLength(8);
    expect(new Set(V8_EXPANSION_BATCH_03.map((card) => card.id)).size).toBe(8);
    expect(V8_EXPANSION_BATCH_03.some((card) => card.position === 'GK')).toBe(true);
    expect(V8_EXPANSION_BATCH_03.some((card) => card.naturalZones.includes('DEF'))).toBe(true);
    expect(V8_EXPANSION_BATCH_03.some((card) => card.naturalZones.includes('MID'))).toBe(true);
    expect(V8_EXPANSION_BATCH_03.some((card) => card.naturalZones.includes('ATT'))).toBe(true);
  });

  it('contains no V7 dice, Box or lateral-sector grammar', () => {
    const text = V8_EXPANSION_BATCH_03.map((card) => card.actionText.toLowerCase()).join('\n');
    for (const forbidden of ['needs a 5', 'requires a 7', 'reroll', 'box chance', 'central sector', 'wide sector', 'left sector', 'right sector']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('keeps signature Action identities while translating obsolete consequences', () => {
    expect(getV8ExpansionBatch03Card('maradona').actionName).toBe('SLALOM RUN');
    expect(getV8ExpansionBatch03Card('yashin').actionName).toBe('BLACK SPIDER');
    expect(getV8ExpansionBatch03Card('cavani').actionName).toBe('GET ACROSS HIM');
    expect(getV8ExpansionBatch03Card('lucy-bronze').actionName).toBe('OVERLAP');
    expect(getV8ExpansionBatch03Card('alexia-putellas').actionName).toBe('THROUGH THE GAP');
    expect(getV8ExpansionBatch03Card('pirlo').actionName).toBe('DIAGONAL SWITCH');
    expect(getV8ExpansionBatch03Card('bergkamp').actionName).toBe('FIRST TOUCH');
  });

  it('uses the current reusable primitive vocabulary before runtime wiring', () => {
    expect(getV8ExpansionBatch03Card('cannavaro').primitives).toEqual(['zone_advantage_modifier']);
    expect(getV8ExpansionBatch03Card('maradona').primitives).toEqual(['move_once', 'move_chance_protection']);
    expect(getV8ExpansionBatch03Card('cavani').primitives).toEqual(['chance_cancellation_interception']);
    expect(getV8ExpansionBatch03Card('alexia-putellas').primitives).toEqual(['generated_tactical_transformation']);
    expect(getV8ExpansionBatch03Card('pirlo').primitives).toEqual(['generated_tactical_transformation']);
  });

  it('promotes only cards with focused runtime proof', () => {
    const runtimeReady = V8_EXPANSION_BATCH_03
      .filter((card) => card.implementationState === 'runtime_ready')
      .map((card) => card.id);
    const primitiveRequired = V8_EXPANSION_BATCH_03
      .filter((card) => card.implementationState === 'primitive_required')
      .map((card) => card.id);

    expect(runtimeReady).toEqual(['cannavaro', 'maradona', 'yashin', 'cavani', 'lucy-bronze', 'bergkamp']);
    expect(primitiveRequired).toEqual(['alexia-putellas', 'pirlo']);
  });
});
