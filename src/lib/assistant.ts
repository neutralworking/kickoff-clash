/**
 * Kickoff Clash — assistant coach reads (in-match team-talk advice).
 *
 * Pure, deterministic helpers that turn the live match state into a few concise coaching
 * lines for the team-talk break. Three reads, each at most one or two notes, prioritised:
 *   1. weakness  — the opponent's soft-spot archetype + whether your XI can punish it
 *   2. fitness   — who's injured / fading and should come off
 *   3. momentum  — a plain read of the match so far (goals + xG)
 * Display-only: never feeds the match math.
 */

import type { MatchV5State } from './match-v5';
import { cumulativeStats } from './match-v5';

export type CoachTone = 'good' | 'warn' | 'info';
export type CoachKind = 'weakness' | 'fitness' | 'tactics' | 'momentum';

export interface CoachNote {
  kind: CoachKind;
  tone: CoachTone;
  text: string;
}

export interface CoachContext {
  /** Human-readable soft-spot blurb (opponentBuild.weakness), e.g. "Weak to pace". */
  weaknessLabel?: string;
}

const TIRED_FITNESS = 60;     // at/under this a starter is fading (0–100 axis)
const SPENT_FITNESS = 50;     // at/under this they risk a knock (engine injury threshold)

/** Build the prioritised coach notes for the current break. At most ~4 lines. */
export function coachNotes(state: MatchV5State, ctx: CoachContext = {}): CoachNote[] {
  const notes: CoachNote[] = [];

  // 1. Opponent weakness — can your XI exploit the soft spot?
  const weakArch = state.opponentWeakness;
  if (weakArch) {
    const available = state.xi.filter((c) => !c.injured);
    const punishers = available.filter((c) => c.archetype === weakArch);
    const label = ctx.weaknessLabel ? `${ctx.weaknessLabel} (${weakArch})` : weakArch;
    if (punishers.length > 0) {
      notes.push({
        kind: 'weakness',
        tone: 'good',
        text: `Their soft spot is ${label}. You've got ${punishers.length} — get them on the ball.`,
      });
    } else {
      notes.push({
        kind: 'weakness',
        tone: 'info',
        text: `Their soft spot is ${label}, but you've none in your XI — one to target in the shop.`,
      });
    }
  }

  // 2. Fitness — flag the worst injured/spent starter.
  const injured = state.xi.filter((c) => c.injured);
  if (injured.length > 0) {
    const names = injured.slice(0, 2).map((c) => c.name).join(', ');
    notes.push({
      kind: 'fitness',
      tone: 'warn',
      text: injured.length === 1
        ? `${names} is injured — get them off.`
        : `${names} are injured — get them off.`,
    });
  } else {
    const tired = state.xi
      .filter((c) => (c.fitness ?? 100) <= TIRED_FITNESS)
      .sort((a, b) => (a.fitness ?? 100) - (b.fitness ?? 100));
    if (tired.length > 0) {
      const w = tired[0];
      const spent = (w.fitness ?? 100) <= SPENT_FITNESS;
      notes.push({
        kind: 'fitness',
        tone: 'warn',
        text: spent
          ? `${w.name} is spent (${(w.fitness ?? 100).toFixed(0)}%) and risks a knock — sub them.`
          : `${w.name} is tiring (${(w.fitness ?? 100).toFixed(0)}%) — keep an eye on them.`,
      });
    } else {
      notes.push({ kind: 'fitness', tone: 'good', text: 'Legs look fresh across the XI.' });
    }
  }

  // 3. Momentum — only once a period has been played.
  if (state.scores.length > 0) {
    const c = cumulativeStats(state.scores);
    const yg = c.yourGoals, og = c.opponentGoals;
    const xgEdge = c.yourXG - c.opponentXG;
    const xgRead = `xG ${c.yourXG.toFixed(1)}–${c.opponentXG.toFixed(1)}`;
    if (yg > og) {
      notes.push({ kind: 'momentum', tone: 'good', text: `Ahead ${yg}–${og} (${xgRead}) — see it out.` });
    } else if (yg < og) {
      notes.push({
        kind: 'momentum',
        tone: 'warn',
        text: xgEdge >= 0.3
          ? `Behind ${yg}–${og} but you're creating more (${xgRead}) — keep going.`
          : `Behind ${yg}–${og} (${xgRead}) — you need to change something.`,
      });
    } else {
      // Level — let xG break the tie.
      if (xgEdge >= 0.3) {
        notes.push({ kind: 'momentum', tone: 'info', text: `Level ${yg}–${og} but you shade the chances (${xgRead}) — keep pushing.` });
      } else if (xgEdge <= -0.3) {
        notes.push({ kind: 'momentum', tone: 'warn', text: `Level ${yg}–${og} but they're creating more (${xgRead}) — tighten up.` });
      } else {
        notes.push({ kind: 'momentum', tone: 'info', text: `Level ${yg}–${og}, honours even (${xgRead}).` });
      }
    }
  }

  return notes;
}
