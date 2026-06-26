'use client';

import { useState, useCallback } from 'react';
import type { RunState } from '../lib/run';
import { getOpponent, getOpponentBuild } from '../lib/run';
import type { HandState } from '../lib/hand';
import { rollXI, handFromSelection, INCREMENT_MINUTES } from '../lib/hand';
import { getFormation } from '../lib/formations';
import type { MatchV5State, IncrementResult } from '../lib/match-v5';
import {
  initMatch,
  evaluateSplit,
  resolveIncrement,
  advanceIncrement,
  makeSub,
  getMatchResult,
} from '../lib/match-v5';
import type { TacticSlots } from '../lib/tactics';
import { canDeploy, createEmptySlots, deployTactic, removeTactic } from '../lib/tactics';
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
  }) => void;
}

type MatchSubPhase = 'planning' | 'resolving' | 'between' | 'halftime' | 'finished';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MatchPhase({ runState, onMatchComplete }: MatchPhaseProps) {
  const formation = getFormation(runState.activeFormation);
  const matchSeed = runState.seed + runState.round * 1000;
  const opponent = getOpponent(runState.round);
  const opponentBuild = getOpponentBuild(runState.round);
  const [tacticSlots, setTacticSlots] = useState<TacticSlots>(() => createEmptySlots());

  // Core state
  const [matchState, setMatchState] = useState<MatchV5State>(() => {
    // Honour the player's pre-match selection; fall back to an auto-roll.
    const hand =
      handFromSelection(runState.deck, runState.startingXI ?? [], runState.benchIds ?? [], formation) ??
      rollXI(runState.deck, formation, matchSeed);
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
    );
  });

  const [subPhase, setSubPhase] = useState<MatchSubPhase>('planning');
  const [currentResult, setCurrentResult] = useState<IncrementResult | null>(null);

  const nextMinute =
    matchState.currentIncrement < INCREMENT_MINUTES.length
      ? INCREMENT_MINUTES[matchState.currentIncrement]
      : 90;

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

  // ---- Kick Off: evaluate and resolve ----
  const handleKickOff = useCallback(() => {
    const split = evaluateSplit(matchState, runState.jokers, tacticSlots);
    const seed = matchSeed + matchState.currentIncrement * 113;
    const result = resolveIncrement(matchState, split, seed);

    setCurrentResult(result);
    setSubPhase('resolving');
  }, [matchSeed, matchState, runState.jokers, tacticSlots]);

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

  const handleFormationChange = useCallback((formationId: string) => {
    const newFormation = getFormation(formationId);
    setMatchState((prev: MatchV5State) => ({ ...prev, formation: newFormation }));
  }, []);

  const handleToggleTactic = useCallback((tacticId: string) => {
    const tactic = runState.tacticsDeck.find((card) => card.id === tacticId);
    if (!tactic) return;

    setTacticSlots((prev) => {
      const existingIndex = prev.slots.findIndex((slot) => slot?.id === tactic.id);
      if (existingIndex !== -1) {
        return removeTactic(prev, existingIndex);
      }

      const deployResult = canDeploy(prev, tactic);
      if (!deployResult.canDeploy) {
        return prev;
      }

      const nextSlots = [...prev.slots];
      if (deployResult.wouldRemove) {
        const removeIndex = nextSlots.findIndex((slot) => slot?.id === deployResult.wouldRemove);
        if (removeIndex !== -1) {
          nextSlots[removeIndex] = null;
        }
      }

      const freeIndex = nextSlots.findIndex((slot) => slot === null);
      if (freeIndex === -1) {
        return prev;
      }

      return deployTactic({ slots: nextSlots }, tactic, freeIndex);
    });
  }, [runState.tacticsDeck]);

  // ---- Finished: return result to GameShell ----
  const handleMatchFinished = useCallback(() => {
    const result = getMatchResult(matchState);
    onMatchComplete({
      yourGoals: result.yourGoals,
      opponentGoals: result.opponentGoals,
      result: result.result,
      // Bridge to HandState shape for backward compatibility
      handState: {
        xi: matchState.xi,
        bench: matchState.bench,
        remainingDeck: matchState.remainingDeck,
        subsRemaining: matchState.subsRemaining,
        subsUsed: matchState.subsUsed,
        tacticSlots,
        currentIncrement: matchState.currentIncrement,
        isFirstHalf: matchState.isFirstHalf,
        scores: [],
        yourGoals: matchState.yourGoals,
        opponentGoals: matchState.opponentGoals,
      },
    });
  }, [matchState, onMatchComplete, tacticSlots]);

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
      {subPhase !== 'finished' && (
        <PitchMatchView
          matchState={matchState}
          formation={matchState.formation}
          jokers={runState.jokers}
          tacticSlots={tacticSlots}
          availableTactics={runState.tacticsDeck}
          ownedFormations={runState.ownedFormations}
          opponentBuild={opponentBuild}
          nextMinute={nextMinute}
          mode={subPhase === 'resolving' ? 'resolve' : 'plan'}
          currentResult={currentResult}
          onToggleTactic={handleToggleTactic}
          onSub={handleSub}
          onReassign={handleReassign}
          onFormationChange={handleFormationChange}
          onContinue={subPhase === 'resolving' ? handleResolveComplete : handleKickOff}
        />
      )}

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
                color: 'var(--line-white)',
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
