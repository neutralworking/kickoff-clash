/**
 * Kickoff Clash V6 — substitution plans (spec A3/A4, handoff §`substitutions.ts`).
 *
 * A break plan is an ORDERED list of {out,in} pairs (A4). Validation enforces:
 * outgoing active, incoming unused on bench, each card at most once, order
 * explicit, total effective cost ≤ current energy. Application, per pair in
 * order: When Subbed Off (outgoing) → move (incoming inherits the OUTGOING
 * card's sector — free placement, A3) → On Reveal (incoming) + When Subbed On
 * reactions. Outgoing always resolves before incoming On Reveal.
 */

import type {
  ActiveEffect,
  CardFilter,
  CardZone,
  RevealEvent,
  SubstitutionPlan,
  V6Card,
  V6MatchState,
} from './types';
import { processTriggers, teamOf, withTeam } from './actions';

export interface PlanValidation {
  ok: boolean;
  reason?: string;
  effectiveCost: number;
}

function matchesFilter(card: V6Card, filter?: CardFilter): boolean {
  if (!filter) return true;
  if (filter.sector && card.sector !== filter.sector) return false;
  if (filter.rarity && card.rarity !== filter.rarity) return false;
  if (filter.minCost != null && card.cost < filter.minCost) return false;
  if (filter.maxCost != null && card.cost > filter.maxCost) return false;
  return true;
}

/** A card's cost after applicable discount effects (floored at 0). */
export function cardEffectiveCost(card: V6Card, discounts: readonly ActiveEffect[]): number {
  let cost = card.cost;
  for (const eff of discounts) {
    if (eff.kind !== 'discount') continue;
    if (!matchesFilter(card, eff.filter)) continue;
    cost -= eff.discount ?? 0;
  }
  return Math.max(0, cost);
}

/** Validate a plan against the current board + energy. */
export function validatePlan(state: V6MatchState, plan: SubstitutionPlan): PlanValidation {
  const team = teamOf(state, plan.side);
  const discounts = team.effects.filter((e) => e.kind === 'discount');
  const seen = new Set<string>();
  let effectiveCost = 0;

  for (const pair of plan.pairs) {
    const outCip = team.cards.find((c) => c.cardId === pair.outCardId);
    const inCip = team.cards.find((c) => c.cardId === pair.inCardId);
    if (!outCip || outCip.zone !== 'active') return { ok: false, reason: `outgoing ${pair.outCardId} is not active`, effectiveCost };
    if (!inCip || inCip.zone !== 'bench') return { ok: false, reason: `incoming ${pair.inCardId} is not on the bench`, effectiveCost };
    if (seen.has(pair.outCardId) || seen.has(pair.inCardId)) return { ok: false, reason: 'a card appears in more than one pair', effectiveCost };
    seen.add(pair.outCardId);
    seen.add(pair.inCardId);
    const inCard = state.cardPool[pair.inCardId];
    if (inCard) effectiveCost += cardEffectiveCost(inCard, discounts);
  }

  if (effectiveCost > state.energy) return { ok: false, reason: `costs ${effectiveCost} > ${state.energy} energy`, effectiveCost };
  return { ok: true, effectiveCost };
}

function moveSub(state: V6MatchState, side: SubstitutionPlan['side'], outId: string, inId: string): V6MatchState {
  const team = teamOf(state, side);
  const outCip = team.cards.find((c) => c.cardId === outId);
  const sector = outCip?.sector ?? state.cardPool[inId]?.sector ?? 'centre';
  const cards = team.cards.map((c) => {
    if (c.cardId === outId) return { ...c, zone: 'used' as CardZone };
    if (c.cardId === inId) return { ...c, zone: 'active' as CardZone, sector };
    return c;
  });
  return withTeam(state, side, { ...team, cards });
}

export interface PlanApplication {
  state: V6MatchState;
  reveals: RevealEvent[];
}

/**
 * Apply ONE side's locked plan (the resolver applies the priority side's plan
 * first, then the other side's — spec A1). Returns new state + ordered reveals.
 */
export function applyPlan(state: V6MatchState, plan: SubstitutionPlan): PlanApplication {
  let s = state;
  const reveals: RevealEvent[] = [];

  for (const pair of plan.pairs) {
    const outCard = s.cardPool[pair.outCardId];
    const inCard = s.cardPool[pair.inCardId];

    // 1. When Subbed Off (outgoing) — resolves before the incoming reveal
    const off = processTriggers(s, [{ side: plan.side, cardId: pair.outCardId, trigger: 'when_subbed_off', depth: 0 }]);
    s = off.state;
    reveals.push({ side: plan.side, order: 0, kind: 'sub_off', cardId: pair.outCardId, text: `${outCard?.name ?? pair.outCardId} comes off` });
    reveals.push(...off.reveals);

    // 2. move: outgoing → used, incoming → active in the outgoing's sector (A3)
    s = moveSub(s, plan.side, pair.outCardId, pair.inCardId);

    // 3. On Reveal (incoming) + When Subbed On reactions from teammates
    reveals.push({ side: plan.side, order: 0, kind: 'reveal', cardId: pair.inCardId, text: `${inCard?.name ?? pair.inCardId} on for ${outCard?.name ?? pair.outCardId}` });
    const on = processTriggers(s, [{ side: plan.side, cardId: pair.inCardId, trigger: 'on_reveal', depth: 0 }]);
    s = on.state;
    reveals.push(...on.reveals);
  }

  return { state: s, reveals: reveals.map((r, i) => ({ ...r, order: i })) };
}

/** Apply both locked plans in priority order (priority side first, spec A1). */
export function applyBreak(
  state: V6MatchState,
  playerPlan: SubstitutionPlan,
  opponentPlan: SubstitutionPlan,
): PlanApplication {
  const first = state.priority;
  const firstPlan = first === 'player' ? playerPlan : opponentPlan;
  const secondPlan = first === 'player' ? opponentPlan : playerPlan;

  const a = applyPlan(state, firstPlan);
  const b = applyPlan(a.state, secondPlan);
  const reveals = [...a.reveals, ...b.reveals].map((r, i) => ({ ...r, order: i }));
  return { state: b.state, reveals };
}
