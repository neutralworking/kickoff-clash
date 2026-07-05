/**
 * KC rebuild engine — the drafting bot (Phase 3 acceptance; Phase 4/5 reuse).
 *
 * A seeded shop-bot that assembles a legal XI from random shop streams of the
 * regenerated pool, greedy on "manager fit" (traits whose contexts the
 * manager's engine actually feeds — dormant traits are near-dead weight, the
 * SM §9 lit/dim distinction as a number). Deterministic per (manager, seed).
 */

import { mulberry32 } from './rng';
import type { ManagerDef } from './data/managers';
import { ENGINE_CARDS } from './data/cards.gen';
import type { EngineCard } from './cards';

/** Context signatures a manager's engine cares about (traits + streak def). */
export function managerSignatures(manager: ManagerDef): Set<string> {
  const sigs = new Set<string>();
  sigs.add(`posture:${manager.defaultPosture}`);
  for (const t of manager.traits) {
    const c = t.context;
    if (c.kind === 'window') sigs.add(`window:${c.window}`);
    else if (c.kind === 'goal-event') sigs.add('goal-event');
    else if (c.kind === 'posture') sigs.add(`posture:${c.posture}`);
    else sigs.add(c.kind);
  }
  for (const s of manager.engine.successes) {
    if (s.on === 'window-goal') sigs.add(`window:${s.window}`);
    if (s.on === 'any-goal') sigs.add('goal-event');
    if (s.on === 'clean-batch') sigs.add('posture:deep-block');
    if (s.on === 'substitution') sigs.add('substitution');
  }
  return sigs;
}

function traitSignature(c: EngineCard['traits'][number]): string {
  const ctx = c.context;
  if (ctx.kind === 'window') return `window:${ctx.window}`;
  // A via-locked goal payout belongs to its window's build (Sucker Punch IS
  // a transition card); only the generic hooks read as plain goal-event.
  if (ctx.kind === 'goal-event') return ctx.via ? `window:${ctx.via}` : 'goal-event';
  if (ctx.kind === 'posture') return `posture:${ctx.posture}`;
  return ctx.kind;
}

/** Cash magnitudes live on a 25–150 scale; normalise so they compare with
 *  charge. Relocate rates look tiny but shift ~18 increments of generation —
 *  a +0.05/inc reweight is roughly a full charge point of value. */
function effectiveMagnitude(t: EngineCard['traits'][number]): number {
  if (t.resource === 'cash') return t.magnitude / 100;
  if (t.verb === 'relocate') return t.magnitude * 10;
  return t.magnitude;
}

/** Manager-fit score: lit traits at full weight, dormant nearly dead (SM §9). */
export function fitScore(card: EngineCard, sigs: Set<string>): number {
  let score = card.baseContribution;
  for (const t of card.traits) {
    if (sigs.has(traitSignature(t))) score += effectiveMagnitude(t) * 2;
    else score += effectiveMagnitude(t) * 0.2; // dormant traits are nearly dead weight
  }
  return score;
}

/** Fit-agnostic quality score — the "uncommitted-but-good" drafting lens:
 *  good numbers, zero regard for whether the engine ever lights them up. */
export function qualityScore(card: EngineCard): number {
  return card.baseContribution * 2 + card.traits.reduce((a, t) => a + effectiveMagnitude(t), 0);
}

/** How much of the card's trait value is LIT under the manager (0–1). The
 *  committed drafting discipline: skip anything mostly dormant. */
export function litRatio(card: EngineCard, sigs: Set<string>): number {
  let lit = 0;
  let total = 0;
  for (const t of card.traits) {
    const v = effectiveMagnitude(t);
    total += v;
    if (sigs.has(traitSignature(t))) lit += v;
  }
  return total === 0 ? 0 : lit / total;
}

/** The XI legality floor the bot must draft toward (mirrors isLegalXI). */
export const NEEDS: { positions: string[]; count: number }[] = [
  { positions: ['GK'], count: 1 },
  { positions: ['CD', 'WD'], count: 3 },
  { positions: ['DM', 'CM', 'WM', 'AM'], count: 2 },
  { positions: ['WF', 'CF'], count: 1 },
];

/**
 * Draft an XI for the manager from seeded random shop streams. Need-aware
 * greedy: unmet positional needs take priority within a shop (a bot that
 * never signs a keeper isn't a bot, it's a bug); otherwise best manager fit.
 */
export function draftSquad(manager: ManagerDef, draftSeed: number): EngineCard[] {
  const rng = mulberry32(draftSeed);
  const sigs = managerSignatures(manager);
  const pool = [...ENGINE_CARDS];
  const roster: EngineCard[] = [];

  const unmetNeeds = (): { positions: string[]; count: number }[] =>
    NEEDS.filter(
      (n) => roster.filter((c) => n.positions.includes(c.position)).length < n.count
    );

  for (let shop = 0; shop < 8; shop++) {
    const offers: EngineCard[] = [];
    for (let i = 0; i < 8 && pool.length > 0; i++) {
      offers.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    offers.sort((a, b) => fitScore(b, sigs) - fitScore(a, sigs));
    // Two signings per shop: the FIRST unmet need in priority order wins
    // (GK is scarcest — 8% of the pool — and must never be out-prioritised
    // by an abundant need), then pure fit.
    for (let signing = 0; signing < 2 && offers.length > 0; signing++) {
      let idx = 0;
      for (const need of unmetNeeds()) {
        const found = offers.findIndex((c) => need.positions.includes(c.position));
        if (found !== -1) {
          idx = found;
          break;
        }
      }
      roster.push(offers.splice(idx, 1)[0]);
    }
  }

  return pickXI(roster, (c) => fitScore(c, sigs));
}

/** Best legal XI from a roster under a scoring lens: legality floor first
 *  (best per slot family), then the best of the rest (never a second keeper). */
export function pickXI(roster: EngineCard[], score: (c: EngineCard) => number): EngineCard[] {
  const take = (from: EngineCard[], n: number): EngineCard[] =>
    [...from].sort((a, b) => score(b) - score(a)).slice(0, n);
  const used = new Set<number>();
  const pick = (cards: EngineCard[]) => {
    for (const c of cards) used.add(c.id);
    return cards;
  };
  const xi: EngineCard[] = [];
  for (const need of NEEDS) {
    xi.push(...pick(take(roster.filter((c) => need.positions.includes(c.position) && !used.has(c.id)), need.count)));
  }
  xi.push(...pick(take(roster.filter((c) => c.position !== 'GK' && !used.has(c.id)), 11 - xi.length)));
  return xi;
}

