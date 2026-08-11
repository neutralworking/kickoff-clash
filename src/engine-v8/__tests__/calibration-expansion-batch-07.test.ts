import { describe, expect, it } from 'vitest';
import {
  V8_EXPANSION_BATCH_07,
  getV8ExpansionBatch07Card,
} from '../calibration-expansion-batch-07';

describe('V8 Action expansion Batch 07 source-first audit', () => {
  it('contains eight unique tracker-grounded contracts across GK, defence, midfield and attack', () => {
    expect(V8_EXPANSION_BATCH_07).toHaveLength(8);
    expect(new Set(V8_EXPANSION_BATCH_07.map((card) => card.id)).size).toBe(8);
    expect(V8_EXPANSION_BATCH_07.some((card) => card.position === 'GK')).toBe(true);
    expect(V8_EXPANSION_BATCH_07.some((card) => card.naturalZones.includes('DEF'))).toBe(true);
    expect(V8_EXPANSION_BATCH_07.some((card) => card.naturalZones.includes('MID'))).toBe(true);
    expect(V8_EXPANSION_BATCH_07.some((card) => card.naturalZones.includes('ATT'))).toBe(true);
  });

  it('keeps tracker Action identity instead of generic reconciliation Actions', () => {
    expect(getV8ExpansionBatch07Card('achraf-hakimi').actionName).toBe('BOMB ON');
    expect(getV8ExpansionBatch07Card('annike-krahn').actionName).toBe('STEP ACROSS');
    expect(getV8ExpansionBatch07Card('nemanja-vidic').actionName).toBe('PARTNERSHIP');
    expect(getV8ExpansionBatch07Card('rio-ferdinand').actionName).toBe('PARTNERSHIP');
    expect(getV8ExpansionBatch07Card('sol-campbell').actionName).toBe('MARSHAL');
    expect(getV8ExpansionBatch07Card('zlatan-ibrahimovic').actionName).toBe('ALPHA');
    expect(getV8ExpansionBatch07Card('roy-keane').actionName).toBe('REDUCER');
    expect(getV8ExpansionBatch07Card('nadine-angerer').actionName).toBe('UNBEATEN');
  });

  it('promotes seven cards and leaves Angerer blocked on a real goalkeeper save primitive', () => {
    const ready = V8_EXPANSION_BATCH_07
      .filter((card) => card.implementationState === 'runtime_ready')
      .map((card) => card.id)
      .sort();
    const pending = V8_EXPANSION_BATCH_07
      .filter((card) => card.implementationState === 'primitive_required')
      .map((card) => card.id)
      .sort();

    expect(ready).toEqual([
      'achraf-hakimi',
      'annike-krahn',
      'nemanja-vidic',
      'rio-ferdinand',
      'roy-keane',
      'sol-campbell',
      'zlatan-ibrahimovic',
    ]);
    expect(pending).toEqual(['nadine-angerer']);
  });

  it('does not fake a save event or obsolete threshold rule for Angerer', () => {
    const angerer = getV8ExpansionBatch07Card('nadine-angerer');
    expect(angerer.auditDecision).toBe('mechanic_design');
    expect(angerer.primitives).toContain('goalkeeper_save_momentum');
    expect(angerer.auditNote).toContain('no save-event primitive');
    expect(angerer.auditNote).toContain('threshold +1 grammar is gone');
    expect(angerer.auditNote).toContain('achievement-like');
  });

  it('keeps Campbell zone contribution distinct from hidden personal DEF', () => {
    const campbell = getV8ExpansionBatch07Card('sol-campbell');
    expect(campbell.actionText).toContain('+3 DEF to this zone');
    expect(campbell.auditNote).toContain('zone-contribution rule');
    expect(campbell.auditNote).toContain('not hidden Campbell DEF');
  });

  it('translates Keane Game Start into progressive-board On Reveal without changing the bound effect', () => {
    const keane = getV8ExpansionBatch07Card('roy-keane');
    expect(keane.timing).toBe('on_reveal');
    expect(keane.actionText).toContain('highest-ATT opposing forward');
    expect(keane.actionText).toContain('50%');
    expect(keane.auditNote).toContain('Game Start effect is translated to On Reveal');
  });
});
