/**
 * Kickoff Clash V6 — the four-period match loop.
 *
 * Kickoff (starters' Game Start + On Reveal fire, standing effects build) → for
 * each period: a break before P2/P3/P4 (energy set, both sides plan blind, the
 * priority side's plan resolves first), then the period resolves and its
 * one-shot effects expire. AI-v-AI by default; the live UI supplies the player
 * plan instead (commit 6). Deterministic: one seed, fixed consumption order.
 */

import type { MatchLogEvent, SubstitutionPlan, TeamSide, V6MatchState } from './types';
import { V6_BALANCE } from './balance';
import { makeRng, type RngState } from './random';
import { processTriggers, rebuildStandingEffects, expirePeriodEffects, teamOf } from './actions';
import { applyBreak } from './substitutions';
import { resolvePeriod } from './resolver';
import { buildInitialState } from './fixtures';
import { defaultOpponentAI, type OpponentAI } from './opponent-ai';

export interface SimMatchOptions {
  playerDeckId: string;
  opponentDeckId: string;
  seed: number;
  playerAI?: OpponentAI;
  opponentAI?: OpponentAI;
}

export interface MatchResult {
  state: V6MatchState;
  playerScore: number;
  opponentScore: number;
  winner: TeamSide | 'draw';
  subsMade: number;
  playerSubs: number;
  opponentSubs: number;
  log: MatchLogEvent[];
}

/** Fire every active starter's Game Start + On Reveal at kickoff (spec: starters reveal at KO). */
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

/** Run a full deterministic match. */
export function simulateMatch(opts: SimMatchOptions): MatchResult {
  const playerAI = opts.playerAI ?? defaultOpponentAI;
  const opponentAI = opts.opponentAI ?? defaultOpponentAI;

  let s = buildInitialState(opts.playerDeckId, opts.opponentDeckId, opts.seed);
  let rng: RngState = makeRng(opts.seed);

  // Kickoff
  s = fireKickoff(s);
  s = rebuildStandingEffects(s);

  let playerSubs = 0;
  let opponentSubs = 0;

  for (let period = 1; period <= V6_BALANCE.periods; period++) {
    s = { ...s, period };

    if (period > 1) {
      const breakIndex = (period - 1) as 1 | 2 | 3;
      const energy = V6_BALANCE.energyByBreak[breakIndex - 1];
      s = { ...s, breakIndex, energy, log: [...s.log, { type: 'break_open', breakIndex, energy, priority: s.priority }] };

      const playerPlan: SubstitutionPlan = playerAI.plan(s, 'player');
      const opponentPlan: SubstitutionPlan = opponentAI.plan(s, 'opponent');
      playerSubs += playerPlan.pairs.length;
      opponentSubs += opponentPlan.pairs.length;
      s = {
        ...s,
        log: [...s.log, { type: 'plan_locked', side: 'player', pairs: playerPlan.pairs }, { type: 'plan_locked', side: 'opponent', pairs: opponentPlan.pairs }],
      };

      const applied = applyBreak(s, playerPlan, opponentPlan);
      s = applied.state;
      s = { ...s, log: [...s.log, ...applied.reveals.map((event) => ({ type: 'reveal' as const, event }))] };
      s = rebuildStandingEffects(s);
    }

    const res = resolvePeriod(s, rng);
    s = res.state;
    rng = res.rng;
    s = { ...s, priority: res.result.nextPriority };
    s = expirePeriodEffects(s);
  }

  const playerScore = s.player.score;
  const opponentScore = s.opponent.score;
  s = { ...s, log: [...s.log, { type: 'full_time', playerScore, opponentScore }] };

  const winner: TeamSide | 'draw' = playerScore > opponentScore ? 'player' : opponentScore > playerScore ? 'opponent' : 'draw';
  return { state: s, playerScore, opponentScore, winner, subsMade: playerSubs + opponentSubs, playerSubs, opponentSubs, log: s.log };
}
