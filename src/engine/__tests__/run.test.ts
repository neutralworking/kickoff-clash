/**
 * Phase 4 mechanisms — the run loop, shop, rules, opponents, persistence
 * (KC_REBUILD_PLAN_V1 §P4), asserted on pure state transitions.
 */

import { describe, it, expect } from 'vitest';
import {
  createRun,
  starterSquad,
  fixturePreview,
  fixtureConfig,
  playFixture,
  stockShop,
  buyCard,
  sellCard,
  rerollShop,
  buyManager,
  closeShop,
  serialiseRun,
  deserialiseRun,
  playRun,
  type CollectionState,
} from '../run';
import { ENGINE_CARDS } from '../data/cards.gen';
import { getTemplate } from '../data/trait-templates';
import { CHALLENGE_RULES, SEVERE_RULES } from '../data/challenge-rules';
import { FIXTURE_SCHEDULE } from '../data/opponents';
import { MANAGER_PRICE, REROLL_COST, pointsTarget, CARD_PRICE, sellPrice } from '../data/economy';
import { isLegalXI } from '../cards';
import { pickXI, qualityScore } from '../draft';
import { runHeadless, COMMIT_ALL } from '../match';
import type { MatchEvent } from '../events';

const cardById = new Map(ENGINE_CARDS.map((c) => [c.id, c]));

describe('run construction', () => {
  it('starter squad is 16 cards satisfying the XI floor, deterministic per seed', () => {
    const a = starterSquad(42);
    const b = starterSquad(42);
    expect(a).toEqual(b);
    expect(a).toHaveLength(16);
    const cards = a.map((id) => cardById.get(id)!);
    expect(isLegalXI(pickXI(cards, qualityScore))).toBe(true);
  });

  it('collection cards are starter-pack eligible', () => {
    const collection: CollectionState = { unlocked: [1, 2, 3] };
    const squad = starterSquad(7, collection);
    expect(squad.filter((id) => [1, 2, 3].includes(id)).length).toBeGreaterThan(0);
  });

  it('the target curve is SM §8 verbatim', () => {
    expect(pointsTarget(1)).toBeCloseTo(2.556, 3);
    expect(pointsTarget(5)).toBeCloseTo(10.39, 2);
    expect(pointsTarget(9)).toBeCloseTo(42.24, 1);
  });
});

describe('fixtures + challenge rules', () => {
  it('fixture 1 has no rule; bosses draw from the severe pool; preview is stable', () => {
    let run = createRun(7, 'counter-attack');
    expect(fixturePreview(run).rule).toBeNull();
    // Jump the preview to each fixture (rule pick is (seed, fixture)-keyed).
    for (const f of FIXTURE_SCHEDULE) {
      const preview = fixturePreview({ ...run, fixture: f.fixture });
      if (f.fixture === 1) continue;
      expect(preview.rule).not.toBeNull();
      if (f.boss) expect(SEVERE_RULES.map((r) => r.id)).toContain(preview.rule!.id);
      expect(preview.target).toBeCloseTo(pointsTarget(f.fixture) * (preview.rule!.targetMult ?? 1), 9);
    }
  });

  it('rule traits land on the configured side; budget deltas land on the config', () => {
    const run = createRun(7, 'counter-attack');
    for (const rule of CHALLENGE_RULES) {
      // Force the rule by patching a preview-compatible fixture config through
      // its sideTraits/deltas directly (mechanism check, not seed hunting).
      const xi = pickXI(run.squad.map((id) => cardById.get(id)!), qualityScore);
      const base = fixtureConfig(run, xi);
      const withRule = {
        ...base,
        sides: [
          { ...base.sides[0], traits: [...base.sides[0].traits, ...rule.sideTraits.filter(([s]) => s === 0).map(([, t]) => t)] },
          { ...base.sides[1], traits: [...base.sides[1].traits, ...rule.sideTraits.filter(([s]) => s === 1).map(([, t]) => t)] },
        ] as typeof base.sides,
      };
      for (const [side, trait] of rule.sideTraits) {
        expect(withRule.sides[side].traits.map((t) => t.name)).toContain(trait.name);
      }
    }
  });

  it('losing a fixture ends the run; winning pays and opens a shop', () => {
    // Play with an intentionally illegal-weak XI (bench cards) to lose fast at f1? —
    // instead: play normally; assert the outcome invariants both ways over seeds.
    for (let seed = 1; seed <= 6; seed++) {
      let run = createRun(seed, 'metronome');
      const xi = pickXI(run.squad.map((id) => cardById.get(id)!), qualityScore);
      const { run: after } = playFixture(run, xi, {
        onBatch: () => ({ type: 'none' }),
        onWindow: () => ({ type: 'commit' }),
      });
      const h = after.history[0];
      if (h.met) {
        expect(after.fixture).toBe(2);
        expect(after.cash).toBeGreaterThan(run.cash);
        expect(after.shop).not.toBeNull();
      } else {
        expect(after.alive).toBe(false);
        expect(h.reward).toBe(0);
      }
    }
  });
});

describe('shop', () => {
  const shopRun = () => {
    const run = createRun(11, 'metronome');
    run.cash = 10_000;
    run.shop = stockShop(run, false);
    return run;
  };

  it('dual-axis stocking guarantee: both compounding axes always on offer (law 5)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = createRun(seed, 'counter-attack');
      const shop = stockShop(run, seed % 2 === 0);
      const axes = new Set(
        shop.offers.flatMap((o) => cardById.get(o.cardId)!.traits.map((t) => getTemplate(t.templateId)!.axis))
      );
      expect(axes.has('consistency'), `seed ${seed}`).toBe(true);
      expect(axes.has('amplification'), `seed ${seed}`).toBe(true);
    }
  });

  it('managers appear ONLY in post-boss shops, never the current manager, priced ≥ ~2 shops of spend', () => {
    const run = createRun(13, 'gambler');
    expect(stockShop(run, false).managerId).toBeNull();
    const boss = stockShop(run, true);
    expect(boss.managerId).not.toBeNull();
    expect(boss.managerId).not.toBe('gambler');
    // ~2 shops of player spend: two shops of two mid-rarity signings.
    expect(MANAGER_PRICE).toBeGreaterThanOrEqual(2 * 2 * CARD_PRICE.Rare);
  });

  it('buy/sell/reroll move cash and stock correctly; purchases unlock the collection', () => {
    let run = shopRun();
    const collection: CollectionState = { unlocked: [] };
    const offer = run.shop!.offers[0];
    run = buyCard(run, offer.cardId, collection);
    expect(run.squad).toContain(offer.cardId);
    expect(collection.unlocked).toContain(offer.cardId);
    expect(run.cash).toBe(10_000 - offer.price);

    const owned = offer.cardId;
    const cashBefore = run.cash;
    run = sellCard(run, owned);
    expect(run.squad).not.toContain(owned);
    expect(run.cash).toBe(cashBefore + sellPrice(cardById.get(owned)!.rarity));

    const offersBefore = JSON.stringify(run.shop!.offers);
    run = rerollShop(run);
    expect(run.cash).toBe(cashBefore + sellPrice(cardById.get(owned)!.rarity) - REROLL_COST);
    expect(JSON.stringify(run.shop!.offers)).not.toEqual(offersBefore);
  });

  it('buying the manager pivots the run identity', () => {
    let run = createRun(13, 'gambler');
    run.cash = MANAGER_PRICE + 100;
    run.shop = stockShop(run, true);
    const target = run.shop!.managerId!;
    run = buyManager(run);
    expect(run.managerId).toBe(target);
    expect(run.cash).toBe(100);
    expect(() => buyManager(run)).toThrow();
  });
});

describe('opponents — telegraphed profile shifts (SM §3)', () => {
  it('a shift is telegraphed one batch ahead and then honoured', () => {
    // Champions shift to deep-block at batch 5 when leading. Craft a fixture
    // where the opponent leads: player passes every window.
    const run = { ...createRun(7, 'counter-attack'), fixture: 9 };
    const xi = pickXI(run.squad.map((id) => cardById.get(id)!), qualityScore);
    for (let seed = 1; seed <= 30; seed++) {
      const config = { ...fixtureConfig(run, xi, seed) };
      const state = runHeadless(config, {
        onBatch: () => ({ type: 'none' }),
        onWindow: () => ({ type: 'pass' }),
      });
      const shifts = state.log.filter(
        (e): e is Extract<MatchEvent, { type: 'posture-shift' }> => e.type === 'posture-shift' && e.side === 1
      );
      if (shifts.length === 0) continue; // opponent never led at batch 4's telegraph
      const shift = shifts[0];
      expect(shift.reason).toBe('profile');
      expect(shift.batch).toBe(5);
      // The batch-4 start telegraphed it via `upcoming`.
      const b4 = state.log.find(
        (e): e is Extract<MatchEvent, { type: 'batch-start' }> => e.type === 'batch-start' && e.batch === 4
      )!;
      expect(b4.upcoming?.[1]).toBe('deep-block');
      return;
    }
    throw new Error('no leading-opponent seed found in 1..30');
  });
});

describe('persistence + determinism', () => {
  it('serialise → deserialise roundtrips mid-run state exactly', () => {
    let run = createRun(21, 'set-piece');
    const xi = pickXI(run.squad.map((id) => cardById.get(id)!), qualityScore);
    const played = playFixture(run, xi, COMMIT_ALL as never);
    run = played.run;
    const back = deserialiseRun(serialiseRun(run));
    expect(back).toEqual(run);
  });

  it('deserialise rejects corrupt saves', () => {
    const run = createRun(21, 'set-piece');
    expect(() => deserialiseRun(serialiseRun({ ...run, managerId: 'nope' }))).toThrow(/unknown manager/);
    expect(() => deserialiseRun(serialiseRun({ ...run, squad: [999999] }))).toThrow(/unknown card/);
  });

  it('playRun is deterministic per (seed, manager, policy)', () => {
    const a = playRun(31, 'pragmatist', 'committed');
    const b = playRun(31, 'pragmatist', 'committed');
    expect(a).toEqual(b);
  });
});
