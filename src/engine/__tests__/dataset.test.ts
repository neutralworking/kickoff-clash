/**
 * Phase 3 acceptance — the regenerated dataset (SM §5, law 1 + law 5).
 *
 * The generated set must be template-pure (every trait stamped from the
 * reviewed pool at its rarity's magnitude), anatomically correct (1–2 traits,
 * mediocre base, cluster tag), and clear the coverage contract that
 * scripts/regenerate_cards.ts already enforced at build time — re-asserted
 * here so a hand-edit of cards.gen.ts can't rot silently.
 */

import { describe, it, expect } from 'vitest';
import { ENGINE_CARDS } from '../data/cards.gen';
import { TRAIT_TEMPLATES, REQUIRED_COVERAGE, getTemplate } from '../data/trait-templates';
import { LEGENDARY_SIGNATURES } from '../data/legendaries';
import type { Rarity } from '../cards';

const RARITIES: Rarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];

describe('dataset anatomy (SM §5)', () => {
  it('540 cards, each with 1–2 traits, a cluster tag, and a mediocre base', () => {
    expect(ENGINE_CARDS).toHaveLength(540);
    for (const c of ENGINE_CARDS) {
      expect(c.traits.length, `${c.id} ${c.name}`).toBeGreaterThanOrEqual(1);
      expect(c.traits.length).toBeLessThanOrEqual(2);
      expect(c.baseContribution).toBeGreaterThanOrEqual(0.05);
      expect(c.baseContribution).toBeLessThanOrEqual(0.25);
      expect(['spine', 'left-flank', 'right-flank', 'front-line', 'bench']).toContain(c.cluster);
    }
  });

  it('every trait is stamped from the template pool at its rarity magnitude (no free generation)', () => {
    for (const c of ENGINE_CARDS) {
      for (const t of c.traits) {
        const template = getTemplate(t.templateId);
        expect(template, `${c.id} carries unknown template ${t.templateId}`).toBeDefined();
        expect(t.verb).toBe(template!.verb);
        expect(t.magnitude).toBe(template!.magnitudes[c.rarity]);
        expect(JSON.stringify(t.context)).toBe(JSON.stringify(template!.context));
      }
    }
  });

  it('rarity scales conditionality: Commons carry exactly one broad trait', () => {
    for (const c of ENGINE_CARDS.filter((x) => x.rarity === 'Common')) {
      expect(c.traits).toHaveLength(1);
      expect(getTemplate(c.traits[0].templateId)!.breadth).toBe('broad');
    }
  });

  it('law 1: no unconditional traits anywhere in the pool', () => {
    for (const template of TRAIT_TEMPLATES) {
      expect(template.context, template.id).toBeDefined();
      expect(template.context.kind.length).toBeGreaterThan(0);
    }
  });

  it('the five Legendaries carry their hand-authored signatures', () => {
    for (const sig of LEGENDARY_SIGNATURES) {
      const card = ENGINE_CARDS.find((c) => c.id === sig.cardId)!;
      expect(card.rarity).toBe('Legendary');
      expect(card.traits.map((t) => t.templateId)).toEqual(sig.traits.map(([id]) => id));
      expect(card.traits.map((t) => t.name)).toEqual(sig.traits.map(([, name]) => name));
    }
  });
});

describe('coverage contract (law 5 executable)', () => {
  it('the template pool offers every required axis per context', () => {
    for (const req of REQUIRED_COVERAGE) {
      for (const axis of req.axes) {
        expect(
          TRAIT_TEMPLATES.some((t) => t.covers === req.context && t.axis === axis),
          `${req.context} lacks a ${axis} template`
        ).toBe(true);
      }
    }
  });

  it('per-rarity context shares clear the minima (the regeneration gate, re-checked)', () => {
    for (const req of REQUIRED_COVERAGE) {
      for (const rarity of RARITIES) {
        const min = req.minShare[rarity];
        if (min === undefined) continue;
        const band = ENGINE_CARDS.filter((c) => c.rarity === rarity);
        const share =
          band.filter((c) => c.traits.some((t) => getTemplate(t.templateId)!.covers === req.context)).length /
          band.length;
        expect(share, `${req.context} @ ${rarity}`).toBeGreaterThanOrEqual(min);
      }
    }
  });
});
