/**
 * KC rebuild engine — the 9-fixture run loop (KC_REBUILD_PLAN_V1 §P4; SM §8).
 *
 * Pure and serialisable, like the match machine: RunState is plain JSON, the
 * run RNG is a 32-bit integer field, and every transition is a function. A
 * run is: pick a manager (choice of three) → 9 fixtures on the
 * `1.8 × 1.42^f` points target curve — challenge rules from fixture 2, boss
 * every third — with a shop between fixtures (dual-axis stocking guarantee;
 * managers rare and priced at ~2 shops of player spend; post-boss shops
 * weight Epic/Legendary and carry the manager slot). Miss a target and the
 * run is over (v1 permadeath). Store purchases are permanent collection
 * unlocks, starter-pack eligible.
 */

import { rngNext, rngSeed } from './rng';
import type { MatchConfig, HeadlessPolicy, MatchState } from './match';
import { runHeadless, matchResult } from './match';
import { getManager, type ManagerDef } from './data/managers';
import { ENGINE_CARDS } from './data/cards.gen';
import type { EngineCard, Rarity } from './cards';
import { sideFromSquad } from './cards';
import { NEEDS, pickXI, managerSignatures, fitScore, qualityScore, litRatio } from './draft';
import { FIXTURE_SCHEDULE, opponentSide, type FixtureDef } from './data/opponents';
import { REGULAR_RULES, SEVERE_RULES, getChallengeRule, type ChallengeRuleDef } from './data/challenge-rules';
import {
  STARTING_CASH,
  REWARD_BASE,
  REWARD_PER_FIXTURE,
  REWARD_PER_GOAL,
  CARD_PRICE,
  sellPrice,
  REROLL_COST,
  SHOP_OFFERS,
  MANAGER_PRICE,
  BOSS_SHOP_RARITY_WEIGHTS,
  NORMAL_SHOP_RARITY_WEIGHTS,
  pointsTarget,
} from './data/economy';
import { getTemplate } from './data/trait-templates';
import { TACTICAL_CARDS } from './data/tactical-cards';

/** The v1 tactical hand: every card, once each per match (deck-building is v2). */
const TACTICAL_HAND = TACTICAL_CARDS.map((c) => c.id);
import { ENERGY_BUDGET, SUBS_BUDGET } from './data/baseline';

const cardById = new Map(ENGINE_CARDS.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ShopOffer {
  cardId: number;
  price: number;
}

export interface ShopState {
  offers: ShopOffer[];
  /** Manager pivot slot — post-boss shops only (SM §4: rare + expensive). */
  managerId: string | null;
  postBoss: boolean;
}

export interface FixtureOutcome {
  fixture: number;
  ruleId: string | null;
  score: [number, number];
  points: number;
  target: number;
  met: boolean;
  reward: number;
}

export interface RunState {
  seed: number;
  rng: number;
  managerId: string;
  /** Next fixture to play (1..9). */
  fixture: number;
  /** Owned card ids (the squad pool the XI is picked from). */
  squad: number[];
  cash: number;
  alive: boolean;
  completed: boolean;
  shop: ShopState | null;
  history: FixtureOutcome[];
}

/** Permanent collection (store purchase = permanent, starter-pack eligible). */
export interface CollectionState {
  unlocked: number[];
}

// ---------------------------------------------------------------------------
// Run construction
// ---------------------------------------------------------------------------

/**
 * The starter pack: 16 seeded cards satisfying the XI legality floor,
 * Common-weighted. Collection cards are starter-eligible: up to 3 unlocked
 * cards are folded in first (the product requirement's payoff).
 */
export function starterSquad(seed: number, collection: CollectionState = { unlocked: [] }): number[] {
  let rng = rngSeed(seed);
  const next = (): number => {
    const r = rngNext(rng);
    rng = r.next;
    return r.value;
  };
  const owned = new Set<number>();

  const fromCollection = collection.unlocked.filter((id) => cardById.has(id));
  for (let i = 0; i < 3 && fromCollection.length > 0; i++) {
    const idx = Math.floor(next() * fromCollection.length);
    owned.add(fromCollection.splice(idx, 1)[0]);
  }

  const drawWhere = (pred: (c: EngineCard) => boolean): void => {
    const pool = ENGINE_CARDS.filter((c) => !owned.has(c.id) && pred(c) && c.rarity !== 'Legendary');
    if (pool.length === 0) return;
    // Common-weighted draw.
    const weighted = pool.flatMap((c) => (c.rarity === 'Common' ? [c, c, c] : [c]));
    owned.add(weighted[Math.floor(next() * weighted.length)].id);
  };

  // Legality floor first, then filler.
  for (const need of NEEDS) {
    for (let i = ownedCount(owned, need.positions); i < need.count; i++) {
      drawWhere((c) => need.positions.includes(c.position));
    }
  }
  while (owned.size < 16) drawWhere(() => true);
  return [...owned];
}

function ownedCount(owned: Set<number>, positions: string[]): number {
  return [...owned].filter((id) => positions.includes(cardById.get(id)!.position)).length;
}

export function createRun(seed: number, managerId: string, collection?: CollectionState): RunState {
  if (!getManager(managerId)) throw new Error(`unknown manager: ${managerId}`);
  return {
    seed,
    rng: rngSeed(seed ^ 0x5eed),
    managerId,
    fixture: 1,
    squad: starterSquad(seed, collection),
    cash: STARTING_CASH,
    alive: true,
    completed: false,
    shop: null,
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function draw(run: RunState): number {
  const r = rngNext(run.rng);
  run.rng = r.next;
  return r.value;
}

/** The fixture card: opponent + challenge rule + target — shown before kickoff (SM §8). */
export interface FixturePreview {
  fixture: FixtureDef;
  rule: ChallengeRuleDef | null;
  target: number;
}

/** Deterministic per (run seed, fixture): rules start at fixture 2; bosses draw severe. */
export function fixturePreview(run: RunState): FixturePreview {
  const fixture = FIXTURE_SCHEDULE[run.fixture - 1];
  let rule: ChallengeRuleDef | null = null;
  if (run.fixture >= 2) {
    // Rule pick is seeded from (seed, fixture) — stable regardless of shop rerolls.
    let rr = rngSeed((run.seed ^ (run.fixture * 0x9e3779b9)) | 0);
    const r = rngNext(rr);
    rr = r.next;
    const pool = fixture.boss ? SEVERE_RULES : REGULAR_RULES;
    rule = pool[Math.floor(r.value * pool.length)];
  }
  const target = pointsTarget(run.fixture) * (rule?.targetMult ?? 1);
  return { fixture, rule, target };
}

/** Build the match config for the upcoming fixture with an XI. */
export function fixtureConfig(run: RunState, xi: EngineCard[], matchSeed?: number, formation?: string): MatchConfig {
  const manager = getManager(run.managerId)!;
  const { fixture, rule, target } = fixturePreview(run);
  const player = sideFromSquad(manager, xi, formation ? { formation } : undefined);
  const opponent = opponentSide(fixture);
  if (rule) {
    for (const [side, trait] of rule.sideTraits) {
      const target_ = side === 0 ? player : opponent;
      target_.traits = [...target_.traits, trait];
    }
  }
  return {
    seed: matchSeed ?? ((run.seed * 31 + run.fixture) | 0),
    sides: [player, opponent],
    target,
    tacticalHand: TACTICAL_HAND,
    attackThresholds: [fixture.windowThreshold, 6],
    ...(rule?.energyDelta ? { energyBudget: Math.max(0, ENERGY_BUDGET + rule.energyDelta) } : {}),
    ...(rule?.subsDelta ? { subsBudget: Math.max(0, SUBS_BUDGET + rule.subsDelta) } : {}),
  };
}

/** Resolve the upcoming fixture headless with the given XI. */
export function playFixture(
  run: RunState,
  xi: EngineCard[],
  policy: HeadlessPolicy
): { run: RunState; match: MatchState } {
  const state = runHeadless(fixtureConfig(run, xi), policy);
  return { run: applyMatchOutcome(run, state), match: state };
}

/** Apply a COMPLETED match (headless or UI-driven) to the run: pay rewards,
 *  advance/end, open the between-fixture shop. */
export function applyMatchOutcome(run: RunState, state: MatchState): RunState {
  if (!run.alive || run.completed) throw new Error('run is over');
  if (run.shop) throw new Error('close the shop before kicking off');
  const { rule, target } = fixturePreview(run);
  const result = matchResult(state);
  const ft = state.log.find((e) => e.type === 'full-time');
  const surplusCash = ft && ft.type === 'full-time' ? ft.surplusCash : 0;
  const next: RunState = { ...run, history: [...run.history] };
  const met = result.targetMet;
  const reward = met
    ? REWARD_BASE + run.fixture * REWARD_PER_FIXTURE + result.score[0] * REWARD_PER_GOAL + surplusCash + result.cash[0]
    : 0;
  next.history.push({
    fixture: run.fixture,
    ruleId: rule?.id ?? null,
    score: result.score,
    points: result.points[0],
    target,
    met,
    reward,
  });
  if (!met) {
    next.alive = false;
    return next;
  }
  next.cash += reward;
  if (run.fixture === 9) {
    next.completed = true;
    return next;
  }
  const wasBoss = FIXTURE_SCHEDULE[run.fixture - 1].boss;
  next.fixture = run.fixture + 1;
  next.shop = stockShop(next, wasBoss);
  return next;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

function templateAxisOf(card: EngineCard): Set<string> {
  return new Set(card.traits.map((t) => getTemplate(t.templateId)!.axis));
}

/** Seeded stock with the dual-axis guarantee (law 5: both axes always on offer). */
export function stockShop(run: RunState, postBoss: boolean): ShopState {
  const weights = postBoss ? BOSS_SHOP_RARITY_WEIGHTS : NORMAL_SHOP_RARITY_WEIGHTS;
  const owned = new Set(run.squad);
  const available = ENGINE_CARDS.filter((c) => !owned.has(c.id));

  const drawOne = (pred: (c: EngineCard) => boolean, taken: Set<number>): EngineCard | null => {
    const pool = available.filter((c) => !taken.has(c.id) && pred(c));
    if (pool.length === 0) return null;
    const total = pool.reduce((a, c) => a + weights[c.rarity as Rarity], 0);
    let cursor = draw(run) * total;
    for (const c of pool) {
      cursor -= weights[c.rarity as Rarity];
      if (cursor < 0) return c;
    }
    return pool[pool.length - 1];
  };

  const taken = new Set<number>();
  const offers: EngineCard[] = [];
  for (let i = 0; i < SHOP_OFFERS; i++) {
    const c = drawOne(() => true, taken);
    if (!c) break;
    taken.add(c.id);
    offers.push(c);
  }
  // Dual-axis guarantee: replace tail offers until both axes are present.
  for (const axis of ['consistency', 'amplification'] as const) {
    if (!offers.some((c) => templateAxisOf(c).has(axis))) {
      const replacement = drawOne((c) => templateAxisOf(c).has(axis), taken);
      if (replacement) {
        const dropped = offers.pop();
        if (dropped) taken.delete(dropped.id);
        taken.add(replacement.id);
        offers.push(replacement);
      }
    }
  }

  // Manager pivot slot: post-boss shops only, never the current manager.
  let managerId: string | null = null;
  if (postBoss) {
    const candidates = ['counter-attack', 'set-piece', 'fortress', 'tinkerman', 'metronome', 'chaser', 'gambler', 'pragmatist', 'taskmaster', 'financier'].filter((id) => id !== run.managerId);
    managerId = candidates[Math.floor(draw(run) * candidates.length)];
  }

  return {
    offers: offers.map((c) => ({ cardId: c.id, price: CARD_PRICE[c.rarity as Rarity] })),
    managerId,
    postBoss,
  };
}

export function buyCard(run: RunState, cardId: number, collection?: CollectionState): RunState {
  if (!run.shop) throw new Error('no shop open');
  const offer = run.shop.offers.find((o) => o.cardId === cardId);
  if (!offer) throw new Error(`card ${cardId} not on offer`);
  if (run.cash < offer.price) throw new Error('insufficient cash');
  if (collection && !collection.unlocked.includes(cardId)) collection.unlocked.push(cardId);
  return {
    ...run,
    cash: run.cash - offer.price,
    squad: [...run.squad, cardId],
    shop: { ...run.shop, offers: run.shop.offers.filter((o) => o.cardId !== cardId) },
  };
}

export function sellCard(run: RunState, cardId: number): RunState {
  if (!run.squad.includes(cardId)) throw new Error(`card ${cardId} not owned`);
  const card = cardById.get(cardId)!;
  return {
    ...run,
    cash: run.cash + sellPrice(card.rarity),
    squad: run.squad.filter((id) => id !== cardId),
  };
}

export function rerollShop(run: RunState): RunState {
  if (!run.shop) throw new Error('no shop open');
  if (run.cash < REROLL_COST) throw new Error('insufficient cash');
  const next = { ...run, cash: run.cash - REROLL_COST };
  next.shop = stockShop(next, run.shop.postBoss);
  return next;
}

/** The mid-run pivot: expensive by design (SM §4). Squad traits go partially dead — that tax is real. */
export function buyManager(run: RunState): RunState {
  if (!run.shop?.managerId) throw new Error('no manager on offer');
  if (run.cash < MANAGER_PRICE) throw new Error('insufficient cash');
  return {
    ...run,
    cash: run.cash - MANAGER_PRICE,
    managerId: run.shop.managerId,
    shop: { ...run.shop, managerId: null },
  };
}

export function closeShop(run: RunState): RunState {
  return { ...run, shop: null };
}

// ---------------------------------------------------------------------------
// Persistence (autosave layer — the UI wires storage in Phase 5)
// ---------------------------------------------------------------------------

export function serialiseRun(run: RunState): string {
  return JSON.stringify(run);
}

export function deserialiseRun(payload: string): RunState {
  const run = JSON.parse(payload) as RunState;
  if (!getManager(run.managerId)) throw new Error(`corrupt save: unknown manager ${run.managerId}`);
  for (const id of run.squad) {
    if (!cardById.has(id)) throw new Error(`corrupt save: unknown card ${id}`);
  }
  return run;
}

// ---------------------------------------------------------------------------
// Headless run bots (the SM §8 distribution harness's two archetypes)
// ---------------------------------------------------------------------------

export type RunPolicy = 'committed' | 'uncommitted';

const SUB_BATCHES = [3, 4, 5];

const MATCH_POLICY: HeadlessPolicy = {
  onBatch: (state, batch) =>
    SUB_BATCHES.includes(batch) && state.sides[0].subsLeft > 0 ? { type: 'substitution' } : { type: 'none' },
  onWindow: () => ({ type: 'commit' }),
};

export interface RunSummary {
  managerId: string;
  beaten: boolean;
  /** Fixture the run died at (null when beaten). */
  deathFixture: number | null;
  fixturesWon: number;
  finalCash: number;
}

/**
 * Play a whole run headless. `committed` drafts and buys through the
 * manager-fit lens (the engine build); `uncommitted` buys raw quality with no
 * regard for synergy — SM §8's "uncommitted-but-good" control group.
 */
export function playRun(seed: number, managerId: string, policy: RunPolicy): RunSummary {
  const manager: ManagerDef = getManager(managerId)!;
  const sigs = managerSignatures(manager);
  const score = policy === 'committed' ? (c: EngineCard) => fitScore(c, sigs) : qualityScore;

  let run = createRun(seed, managerId);
  while (run.alive && !run.completed) {
    if (run.shop) {
      // The two drafting disciplines diverge HERE (SM §8's control group):
      // committed buys ONLY cards its engine actually lights up (≥60% lit),
      // saving otherwise — the build compounds; uncommitted buys the biggest
      // numbers on offer, every shop.
      for (let buys = 0; buys < 3; buys++) {
        const affordable = run.shop!.offers
          .filter((o) => o.price <= run.cash)
          .sort((a, b) => score(cardById.get(b.cardId)!) - score(cardById.get(a.cardId)!));
        const lit = affordable.filter((o) => litRatio(cardById.get(o.cardId)!, sigs) >= 0.5);
        // Committed discipline: lit cards only — but never leave a shop
        // empty-handed while the squad is thin (an early body beats a hoard).
        const pick =
          policy === 'uncommitted'
            ? affordable[0]
            : (lit[0] ?? (buys === 0 && run.squad.length < 24 ? affordable[0] : undefined));
        if (!pick) break;
        run = buyCard(run, pick.cardId);
      }
      run = closeShop(run);
    }
    const roster = run.squad.map((id) => cardById.get(id)!);
    const xi = pickXI(roster, score);
    run = playFixture(run, xi, MATCH_POLICY).run;
  }
  return {
    managerId,
    beaten: run.completed,
    deathFixture: run.alive ? null : run.fixture,
    fixturesWon: run.history.filter((h) => h.met).length,
    finalCash: run.cash,
  };
}
