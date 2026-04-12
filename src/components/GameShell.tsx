'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Card, SlottedCard } from '../lib/scoring';
import type { RunState, MatchResult, DurabilityResult } from '../lib/run';
import {
  createRun,
  getOpponent,
  getOpponentBuild,
  postMatchDurabilityCheck,
  applyDurabilityResults,
  addCardToDeck,
  sellCard,
  upgradeAcademy,
  buyAcademyPlayer,
  applyTraining,
  buyFormation,
  buyTacticPack,
} from '../lib/run';
import type { HandState } from '../lib/hand';
import type { JokerCard } from '../lib/jokers';
import { rehydrateJokers } from '../lib/jokers';
import type { PackType } from '../lib/packs';
import { openPack } from '../lib/packs';
import { getTacticById, rehydrateTacticSlots } from '../lib/tactics';
import { calculateAttendance, getTransferFee } from '../lib/economy';
import { findConnections } from '../lib/chemistry';
import type { PackContents } from '../lib/packs';
import TitleScreen from './TitleScreen';
import SetupPhase from './SetupPhase';
import CardReveal from './CardReveal';
import MatchPhase from './MatchPhase';
import PostMatch from './PostMatch';
import ShopPhase from './ShopPhase';
import EndScreen from './EndScreen';
import PhaseTransition from './PhaseTransition';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kickoff-clash-v4-run';
const HISTORY_KEY = 'kickoff-clash-v4-history';
const MAX_LOSSES = 3;
const MAX_ROUNDS = 5;

// ---------------------------------------------------------------------------
// Serialization helpers — joker/tactic compute functions aren't serializable
// ---------------------------------------------------------------------------

interface SerializedRunState extends Omit<RunState, 'jokers' | 'tacticsDeck'> {
  jokerIds: string[];
  tacticIds: string[];
}

function serializeRun(state: RunState): string {
  const { jokers, tacticsDeck, ...rest } = state;
  const serialized: SerializedRunState = {
    ...rest,
    jokerIds: jokers.map(j => j.id),
    tacticIds: tacticsDeck.map(t => t.id),
  };
  return JSON.stringify(serialized);
}

function deserializeRun(json: string): RunState | null {
  try {
    const parsed = JSON.parse(json) as SerializedRunState;
    const { jokerIds, tacticIds, ...rest } = parsed;
    return {
      ...rest,
      jokers: rehydrateJokers(jokerIds ?? []),
      tacticsDeck: (tacticIds ?? []).map(id => getTacticById(id)).filter((t): t is NonNullable<typeof t> => t !== undefined),
    } as RunState;
  } catch {
    return null;
  }
}

function saveRun(state: RunState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeRun(state));
  } catch {
    // localStorage quota or unavailable — silently fail
  }
}

function loadRun(): RunState | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return deserializeRun(json);
  } catch {
    return null;
  }
}

function clearRun(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function saveHistory(state: RunState): void {
  try {
    const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    existing.push({
      status: state.status,
      wins: state.wins,
      losses: state.losses,
      cash: state.cash,
      rounds: state.round,
      matchHistory: state.matchHistory,
      timestamp: Date.now(),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Phase type
// ---------------------------------------------------------------------------

type Phase = 'title' | 'setup' | 'reveal' | 'match' | 'postmatch' | 'shop' | 'end';

function phaseFromStatus(status: RunState['status']): Phase {
  if (status === 'won' || status === 'lost') return 'end';
  if (status === 'packSelect') return 'setup';
  if (status === 'title') return 'title';
  return status as Phase;
}

// ---------------------------------------------------------------------------
// GameShell
// ---------------------------------------------------------------------------

export default function GameShell() {
  const [runState, setRunState] = useState<RunState | null>(null);
  const [phase, setPhase] = useState<Phase>('title');
  const [hasExistingRun, setHasExistingRun] = useState(false);
  const [durabilityResult, setDurabilityResult] = useState<DurabilityResult | null>(null);
  const [lastMatchResult, setLastMatchResult] = useState<MatchResult | null>(null);
  const [pendingContents, setPendingContents] = useState<PackContents | null>(null);
  const [pendingStyle, setPendingStyle] = useState<string | null>(null);
  const [pendingSeed, setPendingSeed] = useState<number>(0);

  // Check for existing run on mount
  useEffect(() => {
    const existing = loadRun();
    setHasExistingRun(existing !== null);
  }, []);

  // Persist state after every change
  useEffect(() => {
    if (runState) {
      saveRun(runState);
    }
  }, [runState]);

  // =========================================================================
  // Phase handlers
  // =========================================================================

  // --- Title ---
  const handleNewRun = useCallback(() => {
    clearRun();
    setRunState(null);
    setPhase('setup');
  }, []);

  const handleContinue = useCallback(() => {
    const existing = loadRun();
    if (existing) {
      setRunState(existing);
      setPhase(phaseFromStatus(existing.status));
    }
  }, []);

  // --- Setup (Pack Opening) → Reveal → Match ---
  const handleStart = useCallback((packType: PackType, style: string) => {
    const seed = Date.now();
    const contents = openPack(packType, seed);
    setPendingContents(contents);
    setPendingStyle(style);
    setPendingSeed(seed);
    setPhase('reveal');
  }, []);

  const handleRevealComplete = useCallback(() => {
    if (!pendingContents || !pendingStyle) return;
    const run = createRun(pendingContents, pendingStyle, pendingSeed);
    setRunState(run);
    setPendingContents(null);
    setPendingStyle(null);
    setPhase('match');
    saveRun(run);
  }, [pendingContents, pendingStyle, pendingSeed]);

  // --- Match Complete ---
  const handleMatchComplete = useCallback((result: { yourGoals: number; opponentGoals: number; result: 'win' | 'draw' | 'loss'; handState: HandState }) => {
    if (!runState) return;

    // Calculate attendance from hand's final XI
    const slottedXI: SlottedCard[] = result.handState.xi.map((card, i) => ({
      card,
      slot: 'slot_' + i,
    }));
    const connections = findConnections(slottedXI);
    const attendance = calculateAttendance(
      slottedXI,
      connections,
      result.yourGoals,
      result.opponentGoals,
      0,
      runState.stadiumTier,
      runState.ticketPriceBonus,
    );

    // Durability check on the XI cards
    const durResult = postMatchDurabilityCheck(slottedXI, runState.seed + runState.round * 999);

    // Create match result entry
    const matchResult: MatchResult = {
      round: runState.round,
      opponentName: getOpponent(runState.round).name,
      yourGoals: result.yourGoals,
      opponentGoals: result.opponentGoals,
      attendance: attendance.attendance,
      revenue: attendance.revenue,
      result: result.result,
      synergiesTriggered: connections.map(c => c.name),
      shattered: durResult.shattered.map(c => c.name),
      injured: durResult.injured.map(c => c.name),
      promoted: durResult.promoted.map(c => c.name),
    };

    // Apply durability to deck
    const updatedDeck = applyDurabilityResults(runState.deck, durResult);

    // Update wins/losses
    const wins = runState.wins + (result.result === 'win' ? 1 : 0);
    const losses = runState.losses + (result.result === 'loss' ? 1 : 0);

    const newState: RunState = {
      ...runState,
      deck: updatedDeck,
      cash: runState.cash + attendance.revenue,
      wins,
      losses,
      round: runState.round,
      matchHistory: [...runState.matchHistory, matchResult],
    };

    setRunState(newState);
    setLastMatchResult(matchResult);
    setDurabilityResult(durResult);
    setPhase('postmatch');
    saveRun(newState);
  }, [runState]);

  // --- Post Match ---
  const handlePostMatchContinue = useCallback(() => {
    if (!runState) return;

    if (runState.losses >= MAX_LOSSES) {
      const ended = { ...runState, status: 'lost' as const };
      setRunState(ended);
      saveHistory(ended);
      clearRun();
      setPhase('end');
    } else if (runState.round >= MAX_ROUNDS) {
      const ended = { ...runState, status: 'won' as const };
      setRunState(ended);
      saveHistory(ended);
      clearRun();
      setPhase('end');
    } else {
      setPhase('shop');
    }
  }, [runState]);

  // --- Shop handlers ---
  const handleBuyCard = useCallback((card: Card, cost: number) => {
    setRunState(prev => {
      if (!prev || prev.cash < cost) return prev;
      const withCard = addCardToDeck(prev, card);
      return { ...withCard, cash: withCard.cash - cost };
    });
  }, []);

  const handleSellCard = useCallback((card: Card) => {
    setRunState(prev => {
      if (!prev) return prev;
      return sellCard(prev, card);
    });
  }, []);

  const handleBuyJoker = useCallback((joker: JokerCard) => {
    setRunState(prev => {
      if (!prev || prev.jokers.length >= 3 || prev.cash < 25_000) return prev;
      return {
        ...prev,
        jokers: [...prev.jokers, joker],
        cash: prev.cash - 25_000,
      };
    });
  }, []);

  const handleBuyAcademy = useCallback((card: Card) => {
    setRunState(prev => {
      if (!prev) return prev;
      const result = buyAcademyPlayer(prev, card);
      return result ?? prev;
    });
  }, []);

  const handleUpgradeAcademy = useCallback(() => {
    setRunState(prev => {
      if (!prev) return prev;
      const result = upgradeAcademy(prev);
      return result ?? prev;
    });
  }, []);

  const handleBuyTacticPack = useCallback(() => {
    if (!runState) return;
    const result = buyTacticPack(runState, runState.seed + runState.round * 777);
    if (result) { setRunState(result); saveRun(result); }
  }, [runState]);

  const handleBuyFormation = useCallback((formationId: string) => {
    if (!runState) return;
    const result = buyFormation(runState, formationId);
    if (result) { setRunState(result); saveRun(result); }
  }, [runState]);

  const handleTrainPlayer = useCallback((cardId: number) => {
    if (!runState) return;
    const result = applyTraining(runState, cardId);
    if (result) { setRunState(result); saveRun(result); }
  }, [runState]);

  const handleShopNext = useCallback(() => {
    if (!runState) return;
    const newState = { ...runState, round: runState.round + 1 };
    setRunState(newState);
    setPhase('match');
    saveRun(newState);
  }, [runState]);

  // --- End ---
  const handleEndNewRun = useCallback(() => {
    clearRun();
    setRunState(null);
    setDurabilityResult(null);
    setLastMatchResult(null);
    setHasExistingRun(false);
    setPhase('title');
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  function renderPhase() {
    switch (phase) {
      case 'title':
        return (
          <TitleScreen
            onNewRun={handleNewRun}
            onContinue={handleContinue}
            hasExistingRun={hasExistingRun}
          />
        );

      case 'setup':
        return <SetupPhase onStart={handleStart} />;

      case 'reveal':
        return pendingContents ? (
          <CardReveal contents={pendingContents} onComplete={handleRevealComplete} />
        ) : null;

      case 'match': {
        if (!runState) return null;
        return (
          <MatchPhase
            runState={runState}
            onMatchComplete={handleMatchComplete}
          />
        );
      }

      case 'postmatch': {
        if (!lastMatchResult || !durabilityResult) return null;
        return (
          <PostMatch
            matchResult={lastMatchResult}
            durabilityResult={durabilityResult}
            onContinue={handlePostMatchContinue}
          />
        );
      }

      case 'shop': {
        if (!runState) return null;
        const shopSeed = runState.seed + runState.round * 999;
        return (
          <ShopPhase
            state={runState}
            onBuyCard={handleBuyCard}
            onSellCard={handleSellCard}
            onBuyJoker={handleBuyJoker}
            onBuyAcademy={handleBuyAcademy}
            onUpgradeAcademy={handleUpgradeAcademy}
            onBuyTacticPack={handleBuyTacticPack}
            onBuyFormation={handleBuyFormation}
            onTrainPlayer={handleTrainPlayer}
            onNext={handleShopNext}
            shopSeed={shopSeed}
          />
        );
      }

      case 'end': {
        if (!runState) return null;
        return (
          <EndScreen
            state={runState}
            onNewRun={handleEndNewRun}
          />
        );
      }

      default:
        return null;
    }
  }

  return (
    <PhaseTransition phase={phase}>
      {renderPhase()}
    </PhaseTransition>
  );
}
