/**
 * Kickoff Clash V6 — the four-period match loop + stepwise drivers.
 *
 * Kickoff (starters' Game Start + On Reveal fire, standing effects build) → for
 * each period: a break before P2/P3/P4 (energy set, both sides plan blind, the
 * priority side's plan resolves first), then the period resolves and its
 * one-shot effects expire.
 *
 * The loop is exposed as STEPPERS (startMatch / advancePeriod / openBreak /
 * commitBreak) so the interactive lab UI can pause at each break for the player
 * while the headless `simulateMatch` composes the very same steps — one code
 * path, so the UI and the 10k-match sim stay in lockstep. Deterministic: one
 * seed, fixed consumption order.
 */

import type { BreakIndex, CardInPlay, MatchLogEvent, RevealEvent, SubstitutionPlan, TeamSide, V6Card, V6MatchState } from './types';
import { SECTORS } from './types';
import { V6_BALANCE } from './balance';
import { makeRng, type RngState } from './random';
import { processTriggers, rebuildStandingEffects, expirePeriodEffects, teamOf } from './actions';
import { applyBreak } from './substitutions';
import { resolvePeriod, chanceOutlook, type PeriodResolution } from './resolver';
import { buildInitialState } from './fixtures';
import { initialPriority } from './priority';
import { defaultOpponentAI, type OpponentAI } from './opponent-ai';

export interface SimMatchOptions {
  playerDeckId: string;
  opponentDeckId: string;
  seed: number;
  playerAI?: OpponentAI;
  opponentAI?: OpponentAI;
}

/** Per-break diagnostics for the sim (decision divergence + threshold change). */
export interface BreakDiag {
  breakIndex: number;
  playerPlanSize: number;
  opponentPlanSize: number;
  thresholdChanged: boolean;
}

export interface MatchResult {
  state: V6MatchState;
  playerScore: number;
  opponentScore: number;
  winner: TeamSide | 'draw';
  subsMade: number;
  playerSubs: number;
  opponentSubs: number;
  breaks: BreakDiag[];
  log: MatchLogEvent[];
}

function outlookChanged(a: Record<TeamSide, Record<'left' | 'centre' | 'right', number>>, b: typeof a): boolean {
  for (const side of ['player', 'opponent'] as TeamSide[]) {
    for (const sec of SECTORS) if (a[side][sec] !== b[side][sec]) return true;
  }
  return false;
}

/** Fire every active starter's Game Start + On Reveal at kickoff (starters reveal at KO). */
function fireKickoff(state: V6MatchState): V6MatchState {
  let s = state;
  for (const side of ['player', 'opponent'] as TeamSide[]) {
    const activeIds = teamOf(s, side).cards.filter((c) => c.zone === 'active').map((c) => c.cardId);
    const seeds = activeIds.flatMap((cardId) => [
      { side, cardId, trigger: 'game_start' as const, depth: 0 },
      { side, cardId, trigger: 'on_reveal' as const, depth: 0 },
    ]);
    s = processTriggers(s, seeds).state;
  }
  return s;
}

// ── Steppers (the UI drives these; simulateMatch composes them) ──────────────

export interface MatchStep {
  state: V6MatchState;
  rng: RngState;
}

/** Kickoff → state ready to resolve Period 1. */
export function startMatch(playerDeckId: string, opponentDeckId: string, seed: number): MatchStep {
  let s = buildInitialState(playerDeckId, opponentDeckId, seed);
  s = fireKickoff(s);
  s = rebuildStandingEffects(s);
  return { state: { ...s, period: 1 }, rng: makeRng(seed) };
}

/** A squad for a from-squads match: a name + 11 starters + up to 7 bench (V6 cards). */
export interface V6Squad {
  name: string;
  xi: V6Card[];
  bench: V6Card[];
}

/** Kickoff from explicit V6 squads (the live-game bridge) rather than fixture deck ids. */
export function startMatchFromSquads(player: V6Squad, opponent: V6Squad, seed: number): MatchStep {
  const pool: Record<string, V6Card> = {};
  const place = (squad: V6Squad): CardInPlay[] => {
    const out: CardInPlay[] = [];
    for (const c of squad.xi) {
      pool[c.id] = c;
      out.push({ cardId: c.id, zone: 'active', sector: c.sector });
    }
    for (const c of squad.bench) {
      pool[c.id] = c;
      out.push({ cardId: c.id, zone: 'bench', sector: c.sector });
    }
    return out;
  };
  const priority = initialPriority(seed);
  let s: V6MatchState = {
    seed,
    period: 1,
    breakIndex: 0,
    priority,
    energy: 0,
    player: { side: 'player', managerId: 'live', name: player.name, cards: place(player), effects: [], score: 0 },
    opponent: { side: 'opponent', managerId: 'live', name: opponent.name, cards: place(opponent), effects: [], score: 0 },
    cardPool: pool,
    log: [{ type: 'kickoff', seed, priority }],
  };
  s = fireKickoff(s);
  s = rebuildStandingEffects(s);
  return { state: { ...s, period: 1 }, rng: makeRng(seed) };
}

/** Resolve the current period; update priority + expire one-shots. */
export function advancePeriod(state: V6MatchState, rng: RngState): MatchStep & { result: PeriodResolution['result'] } {
  const res = resolvePeriod(state, rng);
  let s = res.state;
  s = { ...s, priority: res.result.nextPriority };
  s = expirePeriodEffects(s);
  return { state: s, rng: res.rng, result: res.result };
}

/** Open the break that precedes the next period (call after resolving P, when P<4). */
export function openBreak(state: V6MatchState): V6MatchState {
  const breakIndex = state.period as BreakIndex; // break 1 before P2, etc.
  const energy = V6_BALANCE.energyByBreak[breakIndex - 1];
  return { ...state, breakIndex, energy, log: [...state.log, { type: 'break_open', breakIndex, energy, priority: state.priority }] };
}

export interface BreakCommit {
  state: V6MatchState;
  reveals: RevealEvent[];
  diag: BreakDiag;
}

/**
 * Commit both locked plans; advances to the next period (the period field is set
 * BEFORE reveals so period-gated On Reveal actions see the right period). The
 * priority side's plan resolves first (spec A1).
 */
export function commitBreak(state: V6MatchState, playerPlan: SubstitutionPlan, opponentPlan: SubstitutionPlan): BreakCommit {
  const before = chanceOutlook(state);
  const targetPeriod = state.period + 1;
  let s: V6MatchState = {
    ...state,
    period: targetPeriod,
    log: [...state.log, { type: 'plan_locked', side: 'player', pairs: playerPlan.pairs }, { type: 'plan_locked', side: 'opponent', pairs: opponentPlan.pairs }],
  };
  const applied = applyBreak(s, playerPlan, opponentPlan);
  s = applied.state;
  s = { ...s, log: [...s.log, ...applied.reveals.map((event) => ({ type: 'reveal' as const, event }))] };
  s = rebuildStandingEffects(s);
  const diag: BreakDiag = {
    breakIndex: state.breakIndex,
    playerPlanSize: playerPlan.pairs.length,
    opponentPlanSize: opponentPlan.pairs.length,
    thresholdChanged: outlookChanged(before, chanceOutlook(s)),
  };
  return { state: s, reveals: applied.reveals, diag };
}

/** Run a full deterministic match (headless), composing the steppers. */
export function simulateMatch(opts: SimMatchOptions): MatchResult {
  const playerAI = opts.playerAI ?? defaultOpponentAI;
  const opponentAI = opts.opponentAI ?? defaultOpponentAI;

  let { state, rng } = startMatch(opts.playerDeckId, opts.opponentDeckId, opts.seed);
  const breaks: BreakDiag[] = [];
  let playerSubs = 0;
  let opponentSubs = 0;

  ({ state, rng } = advancePeriod(state, rng)); // Period 1

  for (let b = 0; b < V6_BALANCE.periods - 1; b++) {
    state = openBreak(state);
    const playerPlan = playerAI.plan(state, 'player');
    const opponentPlan = opponentAI.plan(state, 'opponent');
    playerSubs += playerPlan.pairs.length;
    opponentSubs += opponentPlan.pairs.length;
    const committed = commitBreak(state, playerPlan, opponentPlan);
    state = committed.state;
    breaks.push(committed.diag);
    ({ state, rng } = advancePeriod(state, rng));
  }

  const playerScore = state.player.score;
  const opponentScore = state.opponent.score;
  state = { ...state, log: [...state.log, { type: 'full_time', playerScore, opponentScore }] };

  const winner: TeamSide | 'draw' = playerScore > opponentScore ? 'player' : opponentScore > playerScore ? 'opponent' : 'draw';
  return { state, playerScore, opponentScore, winner, subsMade: playerSubs + opponentSubs, playerSubs, opponentSubs, breaks, log: state.log };
}
