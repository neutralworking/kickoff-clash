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
  buyTacticPack,
  buyShopItem,
  healInjuredCard,
  drawRoundTactic,
} from '../lib/run';
import { getShopItem } from '../lib/economy';
import type { HandState } from '../lib/hand';
import { INCREMENT_MINUTES } from '../lib/hand';
import type { JokerCard } from '../lib/jokers';
import { rehydrateJokers } from '../lib/jokers';
import { ripStarterPacks } from '../lib/packs';
import { getTacticById } from '../lib/tactics';
import { calculateAttendance, getStadiumTier, JOKER_COST } from '../lib/economy';
import { findConnections } from '../lib/chemistry';
import { accrueMatch } from '../lib/chem';
import type { PackContents } from '../lib/packs';
import type { TeamSelection } from '../lib/run';
import TitleScreen from './TitleScreen';
import PackReveal from './PackReveal';
import TeamSelect from './TeamSelect';
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
// v1 permadeath: a single loss ends the run. A draw continues but earns a reduced
// reward. (Multi-loss tolerance + a board target arrive with later game modes.)
const MAX_ROUNDS = 5;
const DRAW_REWARD_FACTOR = 0.5;

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

type Phase = 'title' | 'packOpen' | 'teamSelect' | 'match' | 'postmatch' | 'shop' | 'end';

function phaseFromStatus(status: RunState['status']): Phase {
  if (status === 'won' || status === 'lost') return 'end';
  if (status === 'packSelect' || status === 'setup') return 'teamSelect';
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
  const [pendingSeed, setPendingSeed] = useState<number>(0);
  // Manager chosen during the manager-pack reveal; carried into TeamSelect.
  const [pickedManagerId, setPickedManagerId] = useState<string | null>(null);

  // Check for existing run on mount without reading localStorage during render.
  useEffect(() => {
    setTimeout(() => {
      setHasExistingRun(loadRun() !== null);
    }, 0);
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

  // --- Title: rip the three starter packs, reveal them, then select ---
  const handleNewRun = useCallback(() => {
    clearRun();
    setRunState(null);
    const seed = Date.now();
    setPendingContents(ripStarterPacks(seed));
    setPendingSeed(seed);
    setPhase('packOpen');
  }, []);

  const handlePacksOpened = useCallback((managerId: string | null) => {
    setPickedManagerId(managerId);
    setPhase('teamSelect');
  }, []);

  const handleContinue = useCallback(() => {
    const existing = loadRun();
    if (existing) {
      setRunState(existing);
      setPhase(phaseFromStatus(existing.status));
    }
  }, []);

  // --- Team selection → Match ---
  const handleTeamConfirm = useCallback((selection: TeamSelection) => {
    const run = createRun(selection, pendingSeed);
    setRunState(run);
    setPendingContents(null);
    setPhase('match');
    saveRun(run);
  }, [pendingSeed]);

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
      runState.stadiumTier,
      runState.ticketPriceBonus,
      runState.playingStyle,
    );

    // Durability check on the XI cards
    const durResult = postMatchDurabilityCheck(slottedXI, runState.seed + runState.round * 999);

    // v1 reward: a win earns the full match gate, a draw earns DRAW_REWARD_FACTOR of it,
    // a loss earns nothing (the run is over).
    const rewardFactor = result.result === 'win' ? 1 : result.result === 'draw' ? DRAW_REWARD_FACTOR : 0;
    const matchReward = Math.round(attendance.revenue * rewardFactor);

    // Create match result entry
    const matchResult: MatchResult = {
      round: runState.round,
      opponentName: getOpponent(runState.round).name,
      yourGoals: result.yourGoals,
      opponentGoals: result.opponentGoals,
      attendance: attendance.attendance,
      revenue: matchReward,
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
    const reachedFinalFixture = runState.round >= MAX_ROUNDS;
    // v1 permadeath: surviving the final fixture (no defeat) wins the run.
    const stadiumTier = getStadiumTier(
      wins,
      reachedFinalFixture,
      reachedFinalFixture && result.result !== 'loss',
    );

    // Run-accumulated chemistry: every pair in the final XI co-appeared this match
    // (CARDS §5; +1 per increment played, ≈ a full match). No decay — churn just
    // forgoes accumulation.
    const chemistry = accrueMatch(
      runState.chemistry ?? {},
      result.handState.xi.map((c) => c.id),
      INCREMENT_MINUTES.length,
    );

    const newState: RunState = {
      ...runState,
      deck: updatedDeck,
      cash: runState.cash + matchReward,
      stadiumTier,
      wins,
      losses,
      round: runState.round,
      matchHistory: [...runState.matchHistory, matchResult],
      chemistry,
    };

    setLastMatchResult(matchResult);
    setDurabilityResult(durResult);

    if (result.result === 'loss') {
      // v1 permadeath — a single defeat ends the run; go straight to the run-over screen.
      const ended: RunState = { ...newState, status: 'lost' };
      setRunState(ended);
      saveHistory(ended);
      clearRun();
      setPhase('end');
    } else {
      setRunState(newState);
      setPhase('postmatch');
      saveRun(newState);
    }
  }, [runState]);

  // --- Post Match ---
  const handlePostMatchContinue = useCallback(() => {
    if (!runState) return;

    if (runState.round >= MAX_ROUNDS) {
      // Survived all five fixtures without a defeat — the run is won.
      const ended: RunState = { ...runState, status: 'won' };
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
      if (!prev || prev.jokers.length >= 3 || prev.cash < JOKER_COST) return prev;
      return {
        ...prev,
        jokers: [...prev.jokers, joker],
        cash: prev.cash - JOKER_COST,
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

  const handleTrainPlayer = useCallback((cardId: number) => {
    if (!runState) return;
    const result = applyTraining(runState, cardId);
    if (result) { setRunState(result); saveRun(result); }
  }, [runState]);

  const handleRerollShop = useCallback(() => {
    if (!runState) return false;
    const item = getShopItem('reroll');
    if (!item) return false;
    const result = buyShopItem(runState, item);
    if (!result) return false;
    setRunState(result);
    saveRun(result);
    return true;
  }, [runState]);

  const handleHealPlayer = useCallback((cardId: number) => {
    if (!runState) return false;
    const result = healInjuredCard(runState, cardId);
    if (!result) return false;
    setRunState(result);
    saveRun(result);
    return true;
  }, [runState]);

  const handleScoutOpponent = useCallback(() => {
    if (!runState) return false;
    const item = getShopItem('scout_report');
    if (!item) return false;
    const result = buyShopItem(runState, item);
    if (!result) return false;
    setRunState(result);
    saveRun(result);
    return true;
  }, [runState]);

  const handleShopNext = useCallback(() => {
    if (!runState) return;
    const nextRound = runState.round + 1;
    // v1 tactics progression: one new tactic is drawn each round (the deck starts at 5).
    const tacticsDeck = drawRoundTactic(runState.tacticsDeck, runState.seed * 31 + nextRound * 7);
    const newState = { ...runState, round: nextRound, tacticsDeck };
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

      case 'packOpen':
        return pendingContents ? (
          <PackReveal contents={pendingContents} onContinue={handlePacksOpened} />
        ) : null;

      case 'teamSelect':
        return pendingContents ? (
          <TeamSelect contents={pendingContents} initialManagerId={pickedManagerId} onConfirm={handleTeamConfirm} />
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
        if (!lastMatchResult || !durabilityResult || !runState) return null;
        return (
          <PostMatch
            matchResult={lastMatchResult}
            durabilityResult={durabilityResult}
            round={lastMatchResult.round}
            totalRounds={MAX_ROUNDS}
            wins={runState.wins}
            matchHistory={runState.matchHistory}
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
            onTrainPlayer={handleTrainPlayer}
            onRerollShop={handleRerollShop}
            onHealPlayer={handleHealPlayer}
            onScoutOpponent={handleScoutOpponent}
            scoutedOpponent={
              runState.scoutedOpponentRound === runState.round + 1
                ? getOpponentBuild(runState.round + 1, runState.seed)
                : null
            }
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
