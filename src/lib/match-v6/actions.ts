/**
 * Kickoff Clash V6 — action resolution (event queue + effect lifecycle).
 *
 * Actions are DATA (`V6Action`); this module is the pure dispatch that turns
 * them into `ActiveEffect`s on a team's ledger and ordered `RevealEvent`s for
 * the animation. Two guarantees the handoff asks for (§`actions.ts`, spec B6):
 *   • Never mutate a fixture card — every state change returns NEW state.
 *   • No infinite trigger loops — the PRIMARY guard is an instance-id set (each
 *     `side:cardId:actionIndex` fires at most once per resolution); a depth cap
 *     is the defensive belt-and-braces.
 *
 * Effect lifecycles (spec B3/B4):
 *   • `ongoing` (from Ongoing + On Bench actions) is REBUILT from the current
 *     board every period, so it vanishes the instant its source leaves the zone.
 *   • `period` (from On Reveal / When Subbed On/Off / Game Start one-shots) lives
 *     for the current period, then `expirePeriodEffects` clears it.
 */

import type {
  ActionCondition,
  ActionTarget,
  ActiveEffect,
  EffectDuration,
  RevealEvent,
  TeamSide,
  Trigger,
  V6Action,
  V6Card,
  V6MatchState,
  V6TeamState,
} from './types';
import { V6_BALANCE, TRIGGER_LABELS } from './balance';

// ── Context for resolving one action ─────────────────────────────────────────

interface ActionCtx {
  sourceCard: V6Card;
  sourceSector: import('./types').Sector;
  side: TeamSide;
  period: number;
  scoreDiff: number; // source team score − opponent score (for winning/losing gates)
  instanceId: string;
}

/** Evaluate an action's gate against the current context. */
export function actionApplies(cond: ActionCondition | undefined, ctx: Pick<ActionCtx, 'period' | 'scoreDiff'>): boolean {
  if (!cond || cond.when === 'always') return true;
  switch (cond.when) {
    case 'period_is':
      return ctx.period === cond.period;
    case 'period_gte':
      return ctx.period >= cond.period;
    case 'winning':
      return ctx.scoreDiff > 0;
    case 'losing':
      return ctx.scoreDiff < 0;
    case 'level':
      return ctx.scoreDiff === 0;
  }
}

// ── Pure action → effects dispatch ───────────────────────────────────────────

function resolveStatTarget(t: ActionTarget, sourceCardId: string, sourceSector: import('./types').Sector) {
  if (t.scope === 'self') return { targetCardIds: [sourceCardId] };
  if (t.scope === 'team') return { targetTeam: true };
  return { targetSector: t.sector ?? sourceSector };
}

/**
 * Turn one action into 0+ resolved effects (targets resolved to concrete ids /
 * a sector / the team). `move_sector` returns `[]` — it is a state change the
 * queue processor applies, not a ledger effect.
 */
export function actionToEffects(action: V6Action, ctx: ActionCtx): ActiveEffect[] {
  if (!actionApplies(action.condition, ctx)) return [];
  const label = `${ctx.sourceCard.name} · ${TRIGGER_LABELS[action.trigger] ?? action.trigger}`;
  const base = { id: ctx.instanceId, sourceCardId: ctx.sourceCard.id, sourceLabel: label, createdPeriod: ctx.period };
  const tgt = () => resolveStatTarget((action as { target: ActionTarget }).target, ctx.sourceCard.id, ctx.sourceSector);

  switch (action.kind) {
    case 'modify_attack':
      return [{ ...base, kind: 'stat', onEnemy: false, attack: action.amount, defence: 0, duration: action.duration, ...tgt() }];
    case 'modify_defence':
      return [{ ...base, kind: 'stat', onEnemy: false, attack: 0, defence: action.amount, duration: action.duration, ...tgt() }];
    case 'modify_enemy_attack':
      return [{ ...base, kind: 'stat', onEnemy: true, attack: action.amount, defence: 0, duration: action.duration, ...tgt() }];
    case 'modify_enemy_defence':
      return [{ ...base, kind: 'stat', onEnemy: true, attack: 0, defence: action.amount, duration: action.duration, ...tgt() }];
    case 'improve_die_faces':
      return [{ ...base, kind: 'faces', onEnemy: false, faces: [...action.faces], chanceSelector: action.target, duration: action.duration }];
    case 'reroll_die':
      return [{ ...base, kind: 'reroll', onEnemy: false, rerollCount: action.count, chanceSelector: action.target, duration: 'period' }];
    case 'add_chance':
      return [{ ...base, kind: 'add_chance', onEnemy: false, count: action.count, targetSector: action.target.sector ?? ctx.sourceSector, duration: 'period' }];
    case 'cancel_chance':
      return [{ ...base, kind: 'cancel_chance', onEnemy: true, count: action.count, targetSector: action.target.sector ?? ctx.sourceSector, duration: 'period' }];
    case 'discount_cost':
      return [{ ...base, kind: 'discount', onEnemy: false, discount: action.amount, filter: action.filter, duration: 'ongoing' }];
    case 'move_sector':
      return [];
  }
}

/** Short human text for a reveal event / receipt (UI can elaborate). */
export function describeAction(action: V6Action): string {
  const s = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  switch (action.kind) {
    case 'modify_attack':
      return `${s(action.amount)} ATT`;
    case 'modify_defence':
      return `${s(action.amount)} DEF`;
    case 'modify_enemy_attack':
      return `${s(action.amount)} enemy ATT`;
    case 'modify_enemy_defence':
      return `${s(action.amount)} enemy DEF`;
    case 'improve_die_faces':
      return `scores on ${action.faces.join(' or ')}`;
    case 'reroll_die':
      return `reroll ${action.count} miss`;
    case 'add_chance':
      return `+${action.count} chance`;
    case 'cancel_chance':
      return `−${action.count} enemy chance`;
    case 'discount_cost':
      return `−${action.amount} cost`;
    case 'move_sector':
      return `move to ${action.target}`;
  }
}

// ── Immutable state helpers ──────────────────────────────────────────────────

function teamOf(state: V6MatchState, side: TeamSide): V6TeamState {
  return side === 'player' ? state.player : state.opponent;
}
function withTeam(state: V6MatchState, side: TeamSide, team: V6TeamState): V6MatchState {
  return side === 'player' ? { ...state, player: team } : { ...state, opponent: team };
}

function appendEffects(state: V6MatchState, side: TeamSide, effects: ActiveEffect[]): V6MatchState {
  if (effects.length === 0) return state;
  const team = teamOf(state, side);
  return withTeam(state, side, { ...team, effects: [...team.effects, ...effects] });
}

function moveCardSector(state: V6MatchState, side: TeamSide, cardId: string, sector: import('./types').Sector): V6MatchState {
  const team = teamOf(state, side);
  const cards = team.cards.map((c) => (c.cardId === cardId ? { ...c, sector } : c));
  return withTeam(state, side, { ...team, cards });
}

// ── Standing (ongoing / on-bench) effects — rebuilt each period ──────────────

/** Fresh ongoing + on-bench effects for one side, from its current zones. */
export function deriveStandingEffects(state: V6MatchState, side: TeamSide): ActiveEffect[] {
  const team = teamOf(state, side);
  const scoreDiff = team.score - teamOf(state, side === 'player' ? 'opponent' : 'player').score;
  const out: ActiveEffect[] = [];
  let seq = 0;
  for (const cip of team.cards) {
    const card = state.cardPool[cip.cardId];
    if (!card) continue;
    const want: Trigger | null = cip.zone === 'active' ? 'ongoing' : cip.zone === 'bench' ? 'on_bench' : null;
    if (!want) continue;
    for (let ai = 0; ai < card.actions.length; ai++) {
      const action = card.actions[ai];
      if (action.trigger !== want) continue;
      const ctx: ActionCtx = {
        sourceCard: card,
        sourceSector: cip.sector,
        side,
        period: state.period,
        scoreDiff,
        instanceId: `${side}:std:${cip.cardId}:${ai}:${seq++}`,
      };
      for (const eff of actionToEffects(action, ctx)) {
        out.push({ ...eff, duration: 'ongoing' as EffectDuration });
      }
    }
  }
  return out;
}

/** Replace both sides' `ongoing` effects with freshly-derived ones (keeps `period` effects). */
export function rebuildStandingEffects(state: V6MatchState): V6MatchState {
  const keep = (t: V6TeamState) => t.effects.filter((e) => e.duration !== 'ongoing');
  const player = { ...state.player, effects: [...keep(state.player), ...deriveStandingEffects(state, 'player')] };
  const withPlayer = { ...state, player };
  const opponent = { ...withPlayer.opponent, effects: [...keep(withPlayer.opponent), ...deriveStandingEffects(withPlayer, 'opponent')] };
  return { ...withPlayer, opponent };
}

/** Drop all `period` (one-shot) effects — called at period end. */
export function expirePeriodEffects(state: V6MatchState): V6MatchState {
  const drop = (t: V6TeamState): V6TeamState => ({ ...t, effects: t.effects.filter((e) => e.duration !== 'period') });
  return { ...state, player: drop(state.player), opponent: drop(state.opponent) };
}

// ── The event queue ──────────────────────────────────────────────────────────

export interface TriggerEvent {
  side: TeamSide;
  cardId: string;
  trigger: Trigger;
  depth: number;
}

export interface ProcessResult {
  state: V6MatchState;
  reveals: RevealEvent[];
}

/**
 * Process a queue of trigger events into new state + ordered reveals. Seeds are
 * consumed in order (the caller seeds priority-side first — commit 3). An
 * `on_reveal` (a card entering) enqueues teammates' `when_subbed_on` reactions
 * one level deeper. Termination is guaranteed by the instance-id set; the depth
 * cap is defensive.
 */
export function processTriggers(state: V6MatchState, seeds: TriggerEvent[], opts: { maxDepth?: number } = {}): ProcessResult {
  const maxDepth = opts.maxDepth ?? V6_BALANCE.maxEventDepth;
  const fired = new Set<string>();
  const reveals: RevealEvent[] = [];
  let s = state;
  const queue: TriggerEvent[] = [...seeds];
  let order = 0;
  let guard = 0;

  while (queue.length > 0) {
    if (guard++ > 1000) break; // absolute safety net
    const ev = queue.shift()!;
    if (ev.depth > maxDepth) continue; // depth guard

    const card = s.cardPool[ev.cardId];
    if (!card) continue;
    const cip = teamOf(s, ev.side).cards.find((c) => c.cardId === ev.cardId);
    if (!cip) continue;
    const scoreDiff = teamOf(s, ev.side).score - teamOf(s, ev.side === 'player' ? 'opponent' : 'player').score;

    for (let ai = 0; ai < card.actions.length; ai++) {
      const action = card.actions[ai];
      if (action.trigger !== ev.trigger) continue;
      const key = `${ev.side}:${ev.cardId}:${ai}`;
      if (fired.has(key)) continue; // instance-id guard: each action fires once
      fired.add(key);

      const ctx: ActionCtx = {
        sourceCard: card,
        sourceSector: cip.sector,
        side: ev.side,
        period: s.period,
        scoreDiff,
        instanceId: `${key}:p${s.period}`,
      };
      if (!actionApplies(action.condition, ctx)) continue;

      if (action.kind === 'move_sector') {
        s = moveCardSector(s, ev.side, ev.cardId, action.target);
        reveals.push({ side: ev.side, order: order++, kind: 'move', cardId: ev.cardId, text: `${card.name} shifts to ${action.target}` });
        continue;
      }

      const effects = actionToEffects(action, ctx);
      if (effects.length > 0) {
        s = appendEffects(s, ev.side, effects);
        reveals.push({
          side: ev.side,
          order: order++,
          kind: ev.trigger === 'on_reveal' ? 'reveal' : 'action',
          cardId: ev.cardId,
          text: `${card.name}: ${describeAction(action)}`,
        });
      }
    }

    // An entering card lets its active teammates react (When Subbed On), one depth deeper.
    if (ev.trigger === 'on_reveal') {
      for (const other of teamOf(s, ev.side).cards) {
        if (other.cardId === ev.cardId || other.zone !== 'active') continue;
        const oc = s.cardPool[other.cardId];
        if (oc && oc.actions.some((a) => a.trigger === 'when_subbed_on')) {
          queue.push({ side: ev.side, cardId: other.cardId, trigger: 'when_subbed_on', depth: ev.depth + 1 });
        }
      }
    }
  }

  return { state: s, reveals };
}
