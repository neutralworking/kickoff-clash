'use client';

import { useState, useCallback } from 'react';
import type { RunState } from '../lib/run';
import { getOpponent, getOpponentBuild } from '../lib/run';
import type { HandState } from '../lib/hand';
import { rollXI, INCREMENT_MINUTES } from '../lib/hand';
import { getFormation } from '../lib/formations';
import type { MatchV5State, IncrementResult } from '../lib/match-v5';
import {
  initMatch,
  commitAttackers,
  evaluateSplit,
  resolveIncrement,
  getOpponentBaselines,
  advanceIncrement,
  makeSub,
  discardFromBench,
  getMatchResult,
} from '../lib/match-v5';
import type { TacticSlots } from '../lib/tactics';
import { canDeploy, createEmptySlots, deployTactic, removeTactic } from '../lib/tactics';
import MatchScorebar from './match/MatchScorebar';
import DeployPhase from './match/DeployPhase';
import ResolvingPhase from './match/ResolvingPhase';
import BetweenPhase from './match/BetweenPhase';

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
    const hand = rollXI(runState.deck, formation, matchSeed);
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
    );
  });

  const [subPhase, setSubPhase] = useState<MatchSubPhase>('planning');
  const [currentResult, setCurrentResult] = useState<IncrementResult | null>(null);

  const nextMinute =
    matchState.currentIncrement < INCREMENT_MINUTES.length
      ? INCREMENT_MINUTES[matchState.currentIncrement]
      : 90;

  // ---- Toggle attacker ----
  const handleToggleAttacker = useCallback(
    (cardId: number) => {
      setMatchState((prev: MatchV5State) => {
        const nextOrder = [...prev.attackerOrder];
        const existingIndex = nextOrder.indexOf(cardId);
        if (existingIndex !== -1) {
          nextOrder.splice(existingIndex, 1);
        } else {
          // Check if card is injured
          const card = prev.xi.find((c) => c.id === cardId);
          if (card?.injured) return prev;
          nextOrder.push(cardId);
        }
        return commitAttackers(prev, nextOrder);
      });
    },
    [],
  );

  const handleReorderAttackers = useCallback((draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;

    setMatchState((prev: MatchV5State) => {
      const nextOrder = [...prev.attackerOrder];
      const fromIndex = nextOrder.indexOf(draggedId);
      const toIndex = nextOrder.indexOf(targetId);

      if (fromIndex === -1 || toIndex === -1) return prev;

      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, draggedId);
      return commitAttackers(prev, nextOrder);
    });
  }, []);

  // ---- Kick Off: evaluate and resolve ----
  const handleKickOff = useCallback(() => {
    const split = evaluateSplit(matchState, runState.jokers, tacticSlots);

    const { attack: oppAtk, defence: oppDef } = getOpponentBaselines(
      matchState.opponentRound,
      matchState.opponentStyle,
      matchState.currentIncrement,
      matchState,
    );

    const seed = matchSeed + matchState.currentIncrement * 113;
    const result = resolveIncrement(matchState, split, oppAtk, oppDef, seed);

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

  // ---- Sub ----
  const handleSub = useCallback(
    (xiCardId: number, benchCardId: number) => {
      setMatchState((prev: MatchV5State) => makeSub(prev, xiCardId, benchCardId));
    },
    [],
  );

  // ---- Discard ----
  const handleDiscard = useCallback(
    (benchCardIds: number[]) => {
      setMatchState((prev: MatchV5State) => discardFromBench(prev, benchCardIds));
    },
    [],
  );

  // ---- Formation change (halftime) ----
  const handleFormationChange = useCallback(
    (formationId: string) => {
      const newFormation = getFormation(formationId);
      setMatchState((prev: MatchV5State) => ({ ...prev, formation: newFormation }));
    },
    [],
  );

  // ---- Continue from between/halftime ----
  const handleContinue = useCallback(() => {
    setSubPhase('planning');
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
      {/* Joker row — compact inline pills to save vertical space */}
      <div
        className="match-joker-row"
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 14px 6px',
          background: 'rgba(0,0,0,0.25)',
          alignItems: 'center',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--dust, #8a7560)', flexShrink: 0 }}>
          {'\u{1F454}'}
        </span>
        {runState.jokers.length === 0 && (
          <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
            No managers
          </span>
        )}
        {runState.jokers.map((j) => (
          <span
            key={j.id}
            style={{
              fontSize: 9,
              color: 'var(--cream, #f5f0e8)',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(212,160,53,0.12)',
              border: '1px solid rgba(212,160,53,0.3)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {j.name}
          </span>
        ))}
      </div>

      {/* Score bar */}
      <MatchScorebar
        yourGoals={matchState.yourGoals}
        opponentGoals={matchState.opponentGoals}
        minute={nextMinute}
        opponentName={opponentBuild.name}
        round={runState.round}
        seasonPoints={runState.seasonPoints}
        boardTargetPoints={runState.boardTargetPoints}
        subPhase={subPhase}
      />

      {/* Main content area by sub-phase */}
      {subPhase === 'planning' && (
        <DeployPhase
          matchState={matchState}
          formation={matchState.formation}
          jokers={runState.jokers}
          tacticSlots={tacticSlots}
          availableTactics={runState.tacticsDeck}
          opponentBuild={opponentBuild}
          onToggleAttacker={handleToggleAttacker}
          onReorderAttackers={handleReorderAttackers}
          onToggleTactic={handleToggleTactic}
          onKickOff={handleKickOff}
        />
      )}

      {subPhase === 'resolving' && currentResult && (
        <ResolvingPhase
          result={currentResult}
          onComplete={handleResolveComplete}
        />
      )}

      {(subPhase === 'between' || subPhase === 'halftime') && (
        <BetweenPhase
          matchState={matchState}
          ownedFormations={runState.ownedFormations}
          isHalftime={subPhase === 'halftime'}
          tacticSlots={tacticSlots}
          availableTactics={runState.tacticsDeck}
          onSub={handleSub}
          onDiscard={handleDiscard}
          onFormationChange={handleFormationChange}
          onToggleTactic={handleToggleTactic}
          onContinue={handleContinue}
        />
      )}

      {subPhase === 'finished' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 18,
              color: 'var(--cream, #f5f0e8)',
            }}
          >
            FULL TIME
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 40,
              color: 'var(--cream, #f5f0e8)',
              lineHeight: 1,
            }}
          >
            {matchState.yourGoals} - {matchState.opponentGoals}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 16,
              marginTop: 6,
              color:
                matchState.yourGoals > matchState.opponentGoals
                  ? '#22c55e'
                  : matchState.yourGoals < matchState.opponentGoals
                    ? '#ef4444'
                    : '#f59e0b',
            }}
          >
            {matchState.yourGoals > matchState.opponentGoals
              ? 'WIN'
              : matchState.yourGoals < matchState.opponentGoals
                ? 'LOSS'
                : 'DRAW'}
          </div>
          <button
            onClick={handleMatchFinished}
            style={{
              marginTop: 12,
              width: '100%',
              maxWidth: 320,
              padding: '12px 0',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#1a1a1a',
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 16,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
            }}
          >
            Continue
          </button>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
