'use client';

import { useMemo } from 'react';
import type { Card } from '@/lib/scoring';
import type { RunState } from '@/lib/run';
import { buildMatchSeed, getOpponent } from '@/lib/run';
import { getFormation } from '@/lib/formations';
import { handFromSelection, rollXI, type HandState } from '@/lib/hand';
import type { MatchVerdict } from '@/lib/match-v5';
import { V7MatchController, buildLiveV7Fixture } from '@/game-v7';
import V7MatchExperience from './V7MatchExperience';
import { registerV7CardMeta } from './V7Pitch';

interface MatchResultPayload {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  handState: HandState;
  verdict: MatchVerdict;
  sentOffIds: number[];
  scored: Record<number, { goals: number; assists: number }>;
  playerOfMatch: { card: Card; goals: number; assists: number; rating: number } | null;
}

function liveCardId(id: string | undefined): number | null {
  if (!id) return null;
  const match = /^live-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

export default function V7LiveMatchPhase({
  runState,
  onMatchComplete,
}: {
  runState: RunState;
  onMatchComplete: (result: MatchResultPayload) => void;
}) {
  const formation = getFormation(runState.activeFormation);
  const matchSeed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const opponentName = getOpponent(runState.round).name;

  const hand = useMemo<HandState>(() => {
    const suspended = new Set(runState.suspendedIds ?? []);
    const eligible = runState.deck.filter((card) => !suspended.has(card.id));
    return (
      handFromSelection(
        eligible,
        (runState.startingXI ?? []).filter((id) => !suspended.has(id)),
        (runState.benchIds ?? []).filter((id) => !suspended.has(id)),
        formation,
      ) ?? rollXI(eligible, formation, matchSeed)
    );
  }, [runState, formation, matchSeed]);

  const init = useMemo<{ controller?: V7MatchController; error?: string }>(() => {
    try {
      const fixture = buildLiveV7Fixture(runState, hand);
      registerV7CardMeta(fixture.cards, fixture.actions);
      return { controller: new V7MatchController(fixture) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [runState, hand]);

  if (!init.controller) {
    return (
      <main className="v7-lab">
        <div className="v7-err">Failed to initialise the live V7 match: {init.error ?? 'unknown error'}</div>
      </main>
    );
  }

  const finish = (controller: V7MatchController) => {
    const view = controller.getView();
    const yourGoals = view.player.score;
    const opponentGoals = view.opponent.score;
    const result: 'win' | 'draw' | 'loss' = yourGoals > opponentGoals ? 'win' : yourGoals < opponentGoals ? 'loss' : 'draw';
    const scored: Record<number, { goals: number; assists: number }> = {};

    for (const snapshot of controller.getSnapshots()) {
      for (const goal of snapshot.goals) {
        if (goal.side !== 'player') continue;
        const cardId = liveCardId(goal.scorerId);
        if (cardId == null) continue;
        (scored[cardId] ??= { goals: 0, assists: 0 }).goals += 1;
      }
    }

    let playerOfMatch: MatchResultPayload['playerOfMatch'] = null;
    for (const card of [...hand.xi, ...hand.bench]) {
      const goals = scored[card.id]?.goals ?? 0;
      if (goals > 0 && (!playerOfMatch || goals > playerOfMatch.goals)) {
        playerOfMatch = { card, goals, assists: 0, rating: 6 + goals };
      }
    }

    const headline = result === 'win'
      ? `Won ${yourGoals}–${opponentGoals}`
      : result === 'loss'
        ? `Lost ${yourGoals}–${opponentGoals}`
        : `Drew ${yourGoals}–${opponentGoals}`;

    onMatchComplete({
      yourGoals,
      opponentGoals,
      result,
      verdict: { headline, factors: [] },
      sentOffIds: [],
      scored,
      playerOfMatch,
      handState: { ...hand, yourGoals, opponentGoals },
    });
  };

  return (
    <V7MatchExperience
      controller={init.controller}
      homeLabel="YOU"
      awayLabel={opponentName}
      contextLabel={`CUP ${runState.round} · TIE ${runState.matchInCup}`}
      onComplete={finish}
    />
  );
}
