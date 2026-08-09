import { describe, expect, it } from 'vitest';
import {
  V8_EXPANSION_BATCH_06,
  getV8ExpansionBatch06Card,
} from '../calibration-expansion-batch-06';

describe('V8 Action expansion Batch 06 source-first audit', () => {
  it('contains eight unique tracker-grounded contracts across multiple roles', () => {
    expect(V8_EXPANSION_BATCH_06).toHaveLength(8);
    expect(new Set(V8_EXPANSION_BATCH_06.map((card) => card.id)).size).toBe(8);
    expect(V8_EXPANSION_BATCH_06.some((card) => card.naturalZones.includes('DEF'))).toBe(true);
    expect(V8_EXPANSION_BATCH_06.some((card) => card.naturalZones.includes('MID'))).toBe(true);
    expect(V8_EXPANSION_BATCH_06.some((card) => card.naturalZones.includes('ATT'))).toBe(true);
  });

  it('keeps tracker Action identity instead of older generic reconciliation Action names', () => {
    expect(getV8ExpansionBatch06Card('carli-lloyd').actionName).toBe('HALFWAY HIT');
    expect(getV8ExpansionBatch06Card('carlos-valderrama').actionName).toBe('PAUSE AND SLIP');
    expect(getV8ExpansionBatch06Card('christian-eriksen').actionName).toBe('WHIPPED DELIVERY');
    expect(getV8ExpansionBatch06Card('caroline-graham-hansen').actionName).toBe('ONE ON ONE');
    expect(getV8ExpansionBatch06Card('jari-litmanen').actionName).toBe('KILLER PASS');
    expect(getV8ExpansionBatch06Card('keira-walsh').actionName).toBe('BEAT THE PRESS');
  });

  it('promotes six cards and keeps only Robben and Delap as deliberate design problems', () => {
    const ready = V8_EXPANSION_BATCH_06
      .filter((card) => card.implementationState === 'runtime_ready')
      .map((card) => card.id)
      .sort();
    const pending = V8_EXPANSION_BATCH_06
      .filter((card) => card.implementationState === 'primitive_required')
      .map((card) => card.id)
      .sort();

    expect(ready).toEqual([
      'carli-lloyd',
      'carlos-valderrama',
      'caroline-graham-hansen',
      'christian-eriksen',
      'jari-litmanen',
      'keira-walsh',
    ]);
    expect(pending).toEqual([
      'arjen-robben',
      'rory-delap',
    ]);
  });

  it('refuses to fake obsolete or missing mechanics for Robben and Delap', () => {
    const robben = getV8ExpansionBatch06Card('arjen-robben');
    const delap = getV8ExpansionBatch06Card('rory-delap');

    expect(robben.auditDecision).toBe('mechanic_design');
    expect(robben.auditNote).toContain('wide-versus-centre geometry');
    expect(delap.auditNote).toContain('not automatically a Cross or Corner');
  });

  it('implements Graham Hansen through shared defender-target interception rather than post-hoc repair', () => {
    const hansen = getV8ExpansionBatch06Card('caroline-graham-hansen');
    expect(hansen.auditDecision).toBe('keep_translate');
    expect(hansen.primitives).toContain('targeted_defender_action_evasion');
    expect(hansen.implementationState).toBe('runtime_ready');
    expect(hansen.auditNote).toContain('shared defender-target interception');
    expect(hansen.actionText).toContain('ignored');
    expect(hansen.actionText).toContain('+2 ATT');
  });

  it('makes Walsh press resistance progression rather than another immunity Action', () => {
    const walsh = getV8ExpansionBatch06Card('keira-walsh');
    expect(walsh.auditDecision).toBe('keep_translate');
    expect(walsh.implementationState).toBe('runtime_ready');
    expect(walsh.actionText).toContain('Trigger Press');
    expect(walsh.actionText).toContain('Through Ball');
    expect(walsh.auditNote).toContain('not immunity');
  });
});
