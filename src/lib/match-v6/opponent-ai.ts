/**
 * Kickoff Clash V6 — deterministic opponent AI (handoff §`opponent-ai.ts`).
 *
 * NOT sophisticated football AI (a non-goal). A bounded, deterministic scorer:
 * it sees both boards, both benches, score, energy and priority — but NEVER the
 * other side's locked plan. It generates a handful of legal candidate plans and
 * picks the best by expected chance-dice swing, biased by score-state, with a
 * touch of seeded noise so it isn't robotically identical. No telegraphs.
 *
 * The valuation is a cheap approximation (printed stats + out-of-position
 * penalty, action effects ignored) — enough to make sensible subs for the sim;
 * the real resolver still does the full effect-aware resolution.
 */

import type { CardInPlay, Sector, SubstitutionPlan, TeamSide, V6Card, V6MatchState } from './types';
import { SECTORS } from './types';
import { V6_BALANCE } from './balance';
import { activePlacements, buildBoard } from './board';
import { teamOf, otherSide } from './actions';
import { cardEffectiveCost } from './substitutions';

export interface OpponentAI {
  plan(state: V6MatchState, side: TeamSide): SubstitutionPlan;
}

type Sums = Record<Sector, { att: number; def: number }>;

function sectorSums(state: V6MatchState, side: TeamSide): Sums {
  const board = buildBoard(activePlacements(teamOf(state, side).cards, state.cardPool), []);
  return {
    left: { att: board.left.attack, def: board.left.defence },
    centre: { att: board.centre.attack, def: board.centre.defence },
    right: { att: board.right.attack, def: board.right.defence },
  };
}

const effAtt = (c: V6Card, sector: Sector) => c.attack - (c.sector !== sector ? V6_BALANCE.outOfPositionPenalty.attack : 0);
const effDef = (c: V6Card, sector: Sector) => c.defence - (c.sector !== sector ? V6_BALANCE.outOfPositionPenalty.defence : 0);

function applyPlanToSums(sums: Sums, plan: SubstitutionPlan, state: V6MatchState, side: TeamSide): Sums {
  const out: Sums = { left: { ...sums.left }, centre: { ...sums.centre }, right: { ...sums.right } };
  const team = teamOf(state, side);
  for (const pair of plan.pairs) {
    const outCip = team.cards.find((c) => c.cardId === pair.outCardId);
    if (!outCip) continue;
    const sector = outCip.sector;
    const outCard = state.cardPool[pair.outCardId];
    const inCard = state.cardPool[pair.inCardId];
    if (!outCard || !inCard) continue;
    out[sector].att += effAtt(inCard, sector) - effAtt(outCard, sector);
    out[sector].def += effDef(inCard, sector) - effDef(outCard, sector);
  }
  return out;
}

/** Expected goals for `mine` against `theirs` (chance count × ~1/6). */
function expGoals(mine: Sums, theirs: Sums): number {
  const t = V6_BALANCE.threshold;
  const pGoal = 1 / 6;
  let g = 0;
  for (const sec of SECTORS) {
    const created = Math.floor(Math.max(0, mine[sec].att) / t);
    const cancelled = Math.floor(Math.max(0, theirs[sec].def) / t);
    const chances = Math.min(V6_BALANCE.naturalChanceCapPerSector, Math.max(0, created - cancelled));
    g += chances * pGoal;
  }
  return g;
}

function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function planSignature(plan: SubstitutionPlan): string {
  return plan.pairs.map((p) => `${p.outCardId}>${p.inCardId}`).join(',');
}

function evaluate(state: V6MatchState, side: TeamSide, plan: SubstitutionPlan): number {
  const mine0 = sectorSums(state, side);
  const theirs = sectorSums(state, otherSide(side));
  const mine = applyPlanToSums(mine0, plan, state, side);
  const scoreDiff = teamOf(state, side).score - teamOf(state, otherSide(side)).score;
  const wAtt = scoreDiff < 0 ? 1.25 : 1.0; // chase when behind
  const wDef = scoreDiff > 0 ? 1.25 : 1.0; // protect a lead
  let v = expGoals(mine, theirs) * wAtt - expGoals(theirs, mine) * wDef;

  // card preservation: a small tax on spending pricey cards early, so the bench
  // isn't dumped in one turn.
  for (const pair of plan.pairs) {
    const inCard = state.cardPool[pair.inCardId];
    if (inCard) v -= (inCard.cost / 20) * (V6_BALANCE.periods - state.period) * 0.15;
  }
  // seeded noise (deterministic) to break ties without telegraphing
  v += (hash(state.seed, side, state.period, planSignature(plan)) - 0.5) * 0.02;
  return v;
}

function weakest(cards: CardInPlay[], pool: Record<string, V6Card>): CardInPlay | undefined {
  let best: CardInPlay | undefined;
  let bestVal = Infinity;
  for (const c of cards) {
    const card = pool[c.cardId];
    if (!card) continue;
    const val = card.attack + card.defence;
    if (val < bestVal) {
      bestVal = val;
      best = c;
    }
  }
  return best;
}

/** Legal single-sub candidates: each affordable bench card × a weak outgoing. */
function candidateSingles(state: V6MatchState, side: TeamSide): SubstitutionPlan[] {
  const team = teamOf(state, side);
  const discounts = team.effects.filter((e) => e.kind === 'discount');
  const active = team.cards.filter((c) => c.zone === 'active');
  const bench = team.cards.filter((c) => c.zone === 'bench');
  const out: SubstitutionPlan[] = [];

  for (const b of bench) {
    const card = state.cardPool[b.cardId];
    if (!card) continue;
    if (cardEffectiveCost(card, discounts) > state.energy) continue;
    // Two outgoing candidates: the weakest active in the incoming's natural sector, and the weakest overall.
    const inSector = active.filter((c) => c.sector === card.sector);
    const targets = new Set<string>();
    const w1 = weakest(inSector, state.cardPool);
    const w2 = weakest(active, state.cardPool);
    if (w1) targets.add(w1.cardId);
    if (w2) targets.add(w2.cardId);
    for (const outId of targets) {
      out.push({ side, pairs: [{ outCardId: outId, inCardId: b.cardId }] });
    }
  }
  return out;
}

export const defaultOpponentAI: OpponentAI = {
  plan(state, side) {
    const empty: SubstitutionPlan = { side, pairs: [] };
    let best = empty;
    let bestScore = evaluate(state, side, empty);

    const singles = candidateSingles(state, side);
    for (const c of singles) {
      const sc = evaluate(state, side, c);
      if (sc > bestScore) {
        best = c;
        bestScore = sc;
      }
    }

    // Greedy second sub: try to extend the best single with another affordable, non-overlapping sub.
    if (best.pairs.length === 1) {
      const team = teamOf(state, side);
      const discounts = team.effects.filter((e) => e.kind === 'discount');
      const usedIn = new Set(best.pairs.map((p) => p.inCardId));
      const usedOut = new Set(best.pairs.map((p) => p.outCardId));
      const spent = best.pairs.reduce((n, p) => n + cardEffectiveCost(state.cardPool[p.inCardId], discounts), 0);
      for (const c of singles) {
        const p = c.pairs[0];
        if (usedIn.has(p.inCardId) || usedOut.has(p.outCardId)) continue;
        if (spent + cardEffectiveCost(state.cardPool[p.inCardId], discounts) > state.energy) continue;
        const combo: SubstitutionPlan = { side, pairs: [...best.pairs, p] };
        const sc = evaluate(state, side, combo);
        if (sc > bestScore) {
          best = combo;
          bestScore = sc;
          break; // one extension is enough for the prototype
        }
      }
    }

    return best;
  },
};
