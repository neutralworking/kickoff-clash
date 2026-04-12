'use client';

import { useState, useCallback, useRef } from 'react';
import type { RunState } from '../lib/run';
import type { HandState } from '../lib/hand';
import { rollXI, INCREMENT_MINUTES } from '../lib/hand';
import { getFormation, type Formation } from '../lib/formations';
import type { JokerCard as JokerCardType } from '../lib/jokers';
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
// Opponent names
// ---------------------------------------------------------------------------

const OPPONENT_NAMES = [
  'Dynamo Midtable', 'FC Relegation', 'Sporting Vibes',
  'Real Farmacia', 'Inter Naptime', 'Borussia Teeth',
  'Red Star Sofa', 'Ajax Dishwash', 'Porto Nap',
];

function getOpponentName(seed: number): string {
  return OPPONENT_NAMES[Math.abs(seed) % OPPONENT_NAMES.length];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MatchPhase({ runState, onMatchComplete }: MatchPhaseProps) {
  const formation = getFormation(runState.activeFormation);
  const seedRef = useRef(runState.seed + runState.round * 1000);
  const opponentName = getOpponentName(seedRef.current);

  // Opponent data from runState (if available) or defaults
  const opponentStyle = 'Balanced';
  const opponentWeakness = '';

  // Core state
  const [matchState, setMatchState] = useState<MatchV5State>(() => {
    const hand = rollXI(runState.deck, formation, seedRef.current);
    return initMatch(
      hand.xi,
      hand.bench,
      hand.remainingDeck,
      formation,
      runState.playingStyle,
      runState.jokers,
      seedRef.current,
      runState.round,
      opponentStyle,
      opponentWeakness,
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
        const newIds = new Set(prev.attackerIds);
        if (newIds.has(cardId)) {
          newIds.delete(cardId);
        } else {
          // Check if card is injured
          const card = prev.xi.find((c) => c.id === cardId);
          if (card?.injured) return prev;
          newIds.add(cardId);
        }
        return commitAttackers(prev, Array.from(newIds));
      });
    },
    [],
  );

  // ---- Kick Off: evaluate and resolve ----
  const handleKickOff = useCallback(() => {
    const split = evaluateSplit(matchState, runState.jokers, matchState.formation
      ? { slots: [null, null, null] } // tactic slots from hand state - simplified for v5
      : { slots: [null, null, null] },
    );

    const { attack: oppAtk, defence: oppDef } = getOpponentBaselines(
      matchState.opponentRound,
      matchState.opponentStyle,
      matchState.currentIncrement,
      matchState,
    );

    const seed = seedRef.current + matchState.currentIncrement * 113;
    const result = resolveIncrement(matchState, split, oppAtk, oppDef, seed);

    setCurrentResult(result);
    setSubPhase('resolving');
  }, [matchState, runState.jokers]);

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
        tacticSlots: { slots: [null, null, null] },
        currentIncrement: matchState.currentIncrement,
        isFirstHalf: matchState.isFirstHalf,
        scores: [],
        yourGoals: matchState.yourGoals,
        opponentGoals: matchState.opponentGoals,
      },
    });
  }, [matchState, onMatchComplete]);

  // ---- Render ----
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
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
        style={{
          display: 'flex',
          gap: 6,
          padding: '4px 10px',
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
        opponentName={opponentName}
        round={runState.round}
        subPhase={subPhase}
      />

      {/* Main content area by sub-phase */}
      {subPhase === 'planning' && (
        <DeployPhase
          matchState={matchState}
          formation={matchState.formation}
          jokers={runState.jokers}
          tacticSlots={{ slots: [null, null, null] }}
          onToggleAttacker={handleToggleAttacker}
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
          onSub={handleSub}
          onDiscard={handleDiscard}
          onFormationChange={handleFormationChange}
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
