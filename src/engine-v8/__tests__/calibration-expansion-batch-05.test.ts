import { describe, expect, it } from 'vitest';
import {
  V8_EXPANSION_BATCH_05,
  getV8ExpansionBatch05Card,
} from '../calibration-expansion-batch-05';

describe('V8 Action expansion Batch 05 source-first audit', () => {
  it('contains eight unique source-grounded contracts across the pitch', () => {
    expect(V8_EXPANSION_BATCH_05).toHaveLength(8);
    expect(new Set(V8_EXPANSION_BATCH_05.map((card) => card.id)).size).toBe(8);
    expect(V8_EXPANSION_BATCH_05.some((card) => card.position === 'GK')).toBe(true);
    expect(V8_EXPANSION_BATCH_05.some((card) => card.naturalZones.includes('DEF'))).toBe(true);
    expect(V8_EXPANSION_BATCH_05.some((card) => card.naturalZones.includes('MID'))).toBe(true);
    expect(V8_EXPANSION_BATCH_05.some((card) => card.naturalZones.includes('ATT'))).toBe(true);
  });

  it('keeps the V8 translations free of dice and obsolete sector geometry', () => {
    const text = V8_EXPANSION_BATCH_05.map((card) => card.actionText.toLowerCase()).join('\n');
    for (const forbidden of [
      'needs a 5',
      'needs a 6',
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

  it('specifically repairs the old Peter Shilton non-football direction', () => {
    const shilton = getV8ExpansionBatch05Card('peter-shilton');
    expect(shilton.actionName).toBe('SHUT THE ANGLE');
    expect(shilton.actionName).not.toBe('RECORD CAP');
    expect(shilton.actionText).toContain('Through Ball');
  });

  it('keeps strong source identities while refusing obvious duplicate implementations', () => {
    expect(getV8ExpansionBatch05Card('roberto-carlos').actionName).toBe('THUNDERBOLT');
    expect(getV8ExpansionBatch05Card('ole-gunnar-solskjaer').actionName).toBe('SUPERSUB');
    expect(getV8ExpansionBatch05Card('ronaldinho').actionName).toBe('SHOWBOAT');
    expect(getV8ExpansionBatch05Card('paul-scholes').actionName).toBe('HOLLYWOOD BALL');
    expect(getV8ExpansionBatch05Card('shunsuke-nakamura').actionName).toBe('DEAD BALL ARTIST');

    expect(getV8ExpansionBatch05Card('paul-scholes').auditDecision).toBe('mechanic_design');
    expect(getV8ExpansionBatch05Card('paul-scholes').auditNote).toContain('DIAGONAL SWITCH');
    expect(getV8ExpansionBatch05Card('shunsuke-nakamura').auditDecision).toBe('mechanic_design');
  });

  it('identifies a reusable typed Chance suppression primitive instead of bespoke copies', () => {
    const shilton = getV8ExpansionBatch05Card('peter-shilton');
    const mcgrath = getV8ExpansionBatch05Card('paul-mcgrath');
    expect(shilton.primitives).toContain('typed_chance_attack_suppression');
    expect(mcgrath.primitives).toContain('typed_chance_attack_suppression');
    expect(shilton.actionText).toContain('Through Ball');
    expect(mcgrath.actionText).toContain('Cross');
  });

  it('promotes only the four contracts with runtime plus mixed-XI coverage', () => {
    const ready = V8_EXPANSION_BATCH_05
      .filter((card) => card.implementationState === 'runtime_ready')
      .map((card) => card.id)
      .sort();
    const pending = V8_EXPANSION_BATCH_05
      .filter((card) => card.implementationState === 'primitive_required')
      .map((card) => card.id)
      .sort();

    expect(ready).toEqual(['paul-mcgrath', 'peter-shilton', 'roberto-carlos', 'tony-adams']);
    expect(pending).toEqual(['ole-gunnar-solskjaer', 'paul-scholes', 'ronaldinho', 'shunsuke-nakamura']);
  });
});
