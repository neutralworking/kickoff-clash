'use client';

import { useState, useCallback, useMemo } from 'react';
import type { RunState, TeamIntent } from '../lib/run';
import { getOpponent, getOpponentBuild, buildMatchSeed, cupSize } from '../lib/run';
import { cupMatchPower } from '../lib/opponent';
import type { HandState } from '../lib/hand';
import { rollXI, handFromSelection, INCREMENT_MINUTES } from '../lib/hand';
import { getFormation } from '../lib/formations';
import type { MatchV5State, IncrementResult, MatchVerdict } from '../lib/match-v5';
import {
  initMatch,
  evaluateSplit,
  resolveIncrement,
  advanceIncrement,
  makeSub,
  equipTactics,
  getMatchResult,
  playerMatchStats,
} from '../lib/match-v5';
import { autoFillXI } from '../lib/team-select';
import PitchMatchView from './match/PitchMatchView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchPhaseProps {
  runState: RunState;
  onMatchComplete: (result: {
    yourGoals: number;
    opponentGoals: number;
    result: 'win' | 'draw' | 'loss';
    handState: HandState;
    /** Why the match went the way it did (engine computeMatchVerdict). */
    verdict: MatchVerdict;
    /** Red-carded this match (your card ids) — suspended for the next fixture. */
    sentOffIds: number[];
  }) => void;
}

type MatchSubPhase = 'planning' | 'resolving' | 'between' | 'halftime' | 'finished';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MatchPhase({ runState, onMatchComplete }: MatchPhaseProps) {
  const formation = getFormation(runState.activeFormation);
  const matchSeed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const opponent = getOpponent(runState.round);
  const opponentBuild = getOpponentBuild(runState.round, runState.matchInCup, runState.seed);

  // Core state
  const [matchState, setMatchState] = useState<MatchV5State>(() => {
    // Suspended cards (red-carded last match) sit this fixture out entirely —
    // excluded from the selection AND the auto-roll (SCORING_V2 suspensions).
    const suspended = new Set(runState.suspendedIds ?? []);
    const eligibleDeck = runState.deck.filter((c) => !suspended.has(c.id));
    // Honour the player's pre-match selection; fall back to an auto-roll.
    const hand =
      handFromSelection(eligibleDeck, (runState.startingXI ?? []).filter((id) => !suspended.has(id)), (runState.benchIds ?? []).filter((id) => !suspended.has(id)), formation) ??
      rollXI(eligibleDeck, formation, matchSeed);
    return initMatch(
      hand.xi,
      hand.bench,
      hand.remainingDeck,
      formation,
      runState.playingStyle,
      runState.jokers,
      matchSeed,
      runState.round,
      opponent.style,
      opponentBuild.weaknessArchetype,
      runState.chemistry ?? {},
      runState.intent ?? 'balanced',
      cupMatchPower(runState.round, runState.matchInCup, cupSize(runState.round)),
    );
  });

  const [subPhase, setSubPhase] = useState<MatchSubPhase>('planning');
  const [currentResult, setCurrentResult] = useState<IncrementResult | null>(null);

  const nextMinute =
    matchState.currentIncrement < INCREMENT_MINUTES.length
      ? INCREMENT_MINUTES[matchState.currentIncrement]
      : 90;

  // Per-player in-match stats + 0–10 ratings (read-side, deterministic — never feeds
  // match math). Includes `currentResult` while resolving so ratings reflect the
  // just-resolved period during the resolve beat, then settle on the played history.
  const playerStats = useMemo(
    () =>
      playerMatchStats(
        currentResult ? [...matchState.scores, currentResult] : matchState.scores,
        matchState.xi,
        matchState.formation,
      ),
    [matchState.scores, matchState.xi, matchState.formation, currentResult],
  );

  // ---- Reposition: swap two players' formation slots (the allocation lever) ----
  const handleReassign = useCallback((cardA: number, cardB: number) => {
    setMatchState((prev: MatchV5State) => {
      const xi = [...prev.xi];
      const ia = xi.findIndex((c) => c.id === cardA);
      const ib = xi.findIndex((c) => c.id === cardB);
      if (ia < 0 || ib < 0 || ia === ib) return prev;
      [xi[ia], xi[ib]] = [xi[ib], xi[ia]];
      return { ...prev, xi };
    });
  }, []);

  // ---- LIVE plan preview: the split for the CURRENT plan (pure + deterministic).
  // The pitch cards read cardStats off it, so every equip/sub/swap/intent change
  // moves the shown ATK/DEF immediately — the feedback surface. Never resolves RNG.
  const previewSplit = useMemo(
    () => evaluateSplit(matchState, runState.jokers),
    [matchState, runState.jokers],
  );

  // ---- Kick Off: evaluate and resolve ----
  const handleKickOff = useCallback(() => {
    const split = evaluateSplit(matchState, runState.jokers);
    const seed = matchSeed + matchState.currentIncrement * 113;
    const result = resolveIncrement(matchState, split, seed);

    setCurrentResult(result);
    setSubPhase('resolving');
  }, [matchSeed, matchState, runState.jokers]);

  // ---- After resolution animation completes ----
  const handleResolveComplete = useCallback(() => {
    if (!currentResult) return;

    const advanced = advanceIncrement(matchState, currentResult);
    setMatchState(advanced);
    setCurrentResult(null);

    // Determine next phase based on what increment just completed
    const justPlayed = matchState.currentIncrement;
    if (justPlayed === 4) {
      // Just played 90' -> finished
      setSubPhase('finished');
    } else if (justPlayed === 1) {
      // Just played 30' -> halftime
      setSubPhase('halftime');
    } else if (justPlayed >= 2) {
      // Second half increments 2-3 -> between
      setSubPhase('between');
    } else {
      // First half increment 0 -> straight to planning
      setSubPhase('planning');
    }
  }, [matchState, currentResult]);

  const handleSub = useCallback((xiCardId: number, benchCardId: number) => {
    setMatchState((prev: MatchV5State) => makeSub(prev, xiCardId, benchCardId));
  }, []);

  // ---- Auto-select: fill the strongest fitness-aware XI from the squad ----
  // Only ever wired before the first kickoff (PitchMatchView gates the button on
  // breakMoment === 'kickoff' with no period played), so this never amounts to a
  // free mid-match sub — it just re-picks the starting XI from XI+bench.
  const handleAutoSelect = useCallback(() => {
    setMatchState((prev: MatchV5State) => {
      const { xi, bench } = autoFillXI([...prev.xi, ...prev.bench], prev.formation, true);
      return { ...prev, xi, bench };
    });
  }, []);

  const handleFormationChange = useCallback((formationId: string) => {
    const newFormation = getFormation(formationId);
    setMatchState((prev: MatchV5State) => ({ ...prev, formation: newFormation }));
  }, []);

  // ---- Intent: change the attacking lean between periods. The engine reads
  // state.intent fresh in evaluateSplit each increment, so it bites from the next period.
  const handleIntentChange = useCallback((intent: TeamIntent) => {
    setMatchState((prev: MatchV5State) => ({ ...prev, intent }));
  }, []);

  // ---- Equip / unequip a tactic card for the MATCH (pre-kickoff only; up to
  // TACTIC_SLOTS). Tapping an equipped card unequips it.
  const handleToggleTactic = useCallback((tacticId: string) => {
    const tactic = runState.tacticsDeck.find((card) => card.id === tacticId);
    if (!tactic) return;
    setMatchState((prev: MatchV5State) => {
      const has = prev.equippedTactics.includes(tacticId);
      const next = has
        ? prev.equippedTactics.filter((id) => id !== tacticId)
        : [...prev.equippedTactics, tacticId];
      return equipTactics(prev, next);
    });
  }, [runState.tacticsDeck]);

  // ---- Finished: return result to GameShell ----
  const handleMatchFinished = useCallback(() => {
    const result = getMatchResult(matchState);
    const yourIds = new Set([...matchState.xi, ...matchState.bench].map((c) => c.id));
    onMatchComplete({
      yourGoals: result.yourGoals,
      opponentGoals: result.opponentGoals,
      result: result.result,
      verdict: result.verdict,
      sentOffIds: matchState.sentOffIds.filter((id) => yourIds.has(id)),
      // Bridge to HandState shape for backward compatibility
      handState: {
        xi: matchState.xi,
        bench: matchState.bench,
        remainingDeck: matchState.remainingDeck,
        subsRemaining: matchState.subsRemaining,
        subsUsed: matchState.subsUsed,
        currentIncrement: matchState.currentIncrement,
        isFirstHalf: matchState.isFirstHalf,
        yourGoals: matchState.yourGoals,
        opponentGoals: matchState.opponentGoals,
      },
    });
  }, [matchState, onMatchComplete]);

  // ---- Render ----
  return (
    <div
      className="match-shell"
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--felt, #1a3a1a)',
        fontFamily: 'var(--font-body, sans-serif)',
        color: 'var(--cream, #f5f0e8)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* One screen for the whole match: plan → resolve → next, on the pitch. */}
      {subPhase !== 'finished' && (() => {
        // Which team-talk break this plan screen is. The pre-kickoff plan is the
        // 'kickoff' talk (no period played); 'halftime' after 30'; everything else
        // between periods reads as 'between'. Null while resolving (no talk).
        const breakMoment: 'kickoff' | 'halftime' | 'between' | null =
          subPhase === 'resolving'
            ? null
            : subPhase === 'halftime'
              ? 'halftime'
              : matchState.currentIncrement === 0 && matchState.scores.length === 0
                ? 'kickoff'
                : 'between';
        return (
          <PitchMatchView
            matchState={matchState}
            formation={matchState.formation}
            jokers={runState.jokers}
            availableTactics={runState.tacticsDeck}
            ownedFormations={runState.ownedFormations}
            opponentBuild={opponentBuild}
            nextMinute={nextMinute}
            mode={subPhase === 'resolving' ? 'resolve' : 'plan'}
            breakMoment={breakMoment}
            currentResult={currentResult}
            cardStats={subPhase === 'resolving' && currentResult ? currentResult.split.cardStats : previewSplit.cardStats}
            cardMods={subPhase === 'resolving' && currentResult ? currentResult.split.cardMods : previewSplit.cardMods}
            forecast={subPhase === 'resolving' && currentResult ? currentResult.split.forecast : previewSplit.forecast}
            playerStats={playerStats}
            onToggleTactic={handleToggleTactic}
            onSub={handleSub}
            onReassign={handleReassign}
            onFormationChange={handleFormationChange}
            onAutoSelect={handleAutoSelect}
            onIntentChange={handleIntentChange}
            onContinue={subPhase === 'resolving' ? handleResolveComplete : handleKickOff}
          />
        );
      })()}

      {subPhase === 'finished' && (() => {
        const win = matchState.yourGoals > matchState.opponentGoals;
        const loss = matchState.yourGoals < matchState.opponentGoals;
        const resultColor = win ? 'var(--success)' : loss ? 'var(--danger)' : 'var(--gold)';
        return (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '0 24px',
            }}
          >
            <div style={{ fontFamily: 'var(--font-pixel, sans-serif)', fontSize: 14, letterSpacing: 1, color: 'var(--dust)' }}>
              FULL TIME
            </div>
            <div
              className="score-pop"
              style={{
                fontFamily: 'var(--font-pixel, sans-serif)',
                fontSize: 48,
                color: 'var(--cream)',
                lineHeight: 1,
                textShadow: '0 3px 0 var(--ink-black)',
              }}
            >
              {matchState.yourGoals}–{matchState.opponentGoals}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-pixel, sans-serif)',
                fontSize: 18,
                marginTop: 2,
                color: resultColor,
                textShadow: '0 2px 0 var(--ink-black)',
              }}
            >
              {win ? 'WIN' : loss ? 'LOSS' : 'DRAW'}
            </div>
            <button
              onClick={handleMatchFinished}
              className="advance-btn-pulse"
              style={{
                marginTop: 14,
                width: '100%',
                maxWidth: 320,
                padding: '13px 0',
                borderRadius: 'var(--radius)',
                border: '2px solid var(--ink-black)',
                boxShadow: '0 4px 0 0 var(--ink-black)',
                background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
                color: 'var(--cream)',
                fontFamily: 'var(--font-pixel, sans-serif)',
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              CONTINUE →
            </button>
          </div>
        );
      })()}
    </div>
  );
}
