import { describe, expect, it } from 'vitest';
import {
  V8_EXPANSION_BATCH_04,
  getV8ExpansionBatch04Card,
} from '../calibration-expansion-batch-04';

describe('V8 Action expansion Batch 04 audit contracts', () => {
  it('contains eight unique real-player contracts across GK/DEF/MID/ATT', () => {
    expect(V8_EXPANSION_BATCH_04).toHaveLength(8);
    expect(new Set(V8_EXPANSION_BATCH_04.map((card) => card.id)).size).toBe(8);
    expect(V8_EXPANSION_BATCH_04.some((card) => card.position === 'GK')).toBe(true);
    expect(V8_EXPANSION_BATCH_04.some((card) => card.naturalZones.includes('DEF'))).toBe(true);
    expect(V8_EXPANSION_BATCH_04.some((card) => card.naturalZones.includes('MID'))).toBe(true);
    expect(V8_EXPANSION_BATCH_04.some((card) => card.naturalZones.includes('ATT'))).toBe(true);
  });

  it('contains no V7 dice, reroll, Box-chance or lateral-sector grammar', () => {
    const text = V8_EXPANSION_BATCH_04.map((card) => card.actionText.toLowerCase()).join('\n');
    for (const forbidden of [
      'needs a 5',
      'requires a 7',
      'reroll',
      'box chance',
      'central sector',
      'wide sector',
      'left sector',
      'right sector',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('preserves the strong source Action identities', () => {
    expect(getV8ExpansionBatch04Card('gordon-banks').actionName).toBe('IMPOSSIBLE SAVE');
    expect(getV8ExpansionBatch04Card('bryan-robson').actionName).toBe('CAPTAIN MARVEL');
    expect(getV8ExpansionBatch04Card('chris-waddle').actionName).toBe('DROP THE SHOULDER');
    expect(getV8ExpansionBatch04Card('alan-shearer').actionName).toBe('LACES THROUGH IT');
    expect(getV8ExpansionBatch04Card('alexandra-popp').actionName).toBe('CRASH THE BOX');
    expect(getV8ExpansionBatch04Card('ali-daei').actionName).toBe('POWER HEADER');
    expect(getV8ExpansionBatch04Card('ellen-white').actionName).toBe('FIRST-TIME LOB');
  });

  it('explicitly replaces Terry CAPTAIN’S BODY before runtime work', () => {
    const terry = getV8ExpansionBatch04Card('john-terry');
    expect(terry.auditDecision).toBe('rename_repair');
    expect(terry.actionName).toBe('HEAD WHERE IT HURTS');
    expect(terry.actionName).not.toContain('CAPTAIN');
  });

  it('marks the complete eight-card Batch 04 runtime-ready only after focused runtime coverage exists', () => {
    const ready = V8_EXPANSION_BATCH_04
      .filter((card) => card.implementationState === 'runtime_ready')
      .map((card) => card.id)
      .sort();
    expect(ready).toEqual([
      'alan-shearer',
      'alexandra-popp',
      'ali-daei',
      'bryan-robson',
      'chris-waddle',
      'ellen-white',
      'gordon-banks',
      'john-terry',
    ]);
    expect(V8_EXPANSION_BATCH_04.some((card) => card.implementationState === 'primitive_required')).toBe(false);
  });
});
