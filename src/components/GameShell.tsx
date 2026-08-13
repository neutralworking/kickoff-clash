'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Card, SlottedCard } from '../lib/scoring';
import type { RunState, MatchResult } from '../lib/run';
import {
  createRun,
  getOpponent,
  getOpponentBuild,
  addCardToDeck,
  addCardsToDeck,
  sellCard,
  applyTraining,
  buyTacticPack,
  buyShopItem,
  buyInvestment,
  healInjuredCard,
  drawRoundTactic,
  refillTacticCharges,
  cupSize,
  isCupFinal,
  MAX_CUPS,
  interestOn,
  applyMatchScoring,
  buildMatchSeed,
} from '../lib/run';
import { getShopItem, SCOUT_COST } from '../lib/economy';
import type { InvestmentCard } from '../lib/economy';
import { getFormation } from '../lib/formations';
import { cupMatchPower } from '../lib/opponent';
import type { HandState } from '../lib/hand';
import { INCREMENT_MINUTES } from '../lib/hand';
import type { JokerCard } from '../lib/jokers';
import { rehydrateJokers, payoutMult, refreshDiscount } from '../lib/jokers';
import { managerFormationsV1 } from '../lib/manager-v1';
import { ripStarterPackChoices, ripCardPack, type PackTier } from '../lib/packs';
import { getTacticById } from '../lib/tactics';
import { calculateAttendance, matchReward, JOKER_COST, SCOUT_PACK_COST, ELITE_PACK_COST } from '../lib/economy';
import { findConnections } from '../lib/chemistry';
import { accrueMatch } from '../lib/chem';
import type { PackContents, StarterPackChoices } from '../lib/packs';
import type { TeamSelection, TeamIntent } from '../lib/run';
import TitleScreen from './TitleScreen';
import type { MatchVerdict } from '../lib/match-v5';
import PackReveal from './PackReveal';
import SquadScreen from './SquadScreen';
import V8LiveMatchPhase from './match-v8/V8LiveMatchPhase';
import PostMatch from './PostMatch';
import ShopPhase from './ShopPhase';
import EndScreen from './EndScreen';
import PhaseTransition from './PhaseTransition';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kickoff-clash-v4-run';
const HISTORY_KEY = 'kickoff-clash-v4-history';
// v1 permadeath: a single loss ends the run. A draw advances at a reduced reward.
// The run is five knockout CUPS (Phase 3B; see MAX_CUPS / CUP_SIZES in run.ts).
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
      // Default for runs saved before the cup structure (Phase 3B).
      matchInCup: typeof (rest as Partial<RunState>).matchInCup === 'number' ? (rest as Partial<RunState>).matchInCup : 1,
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

type Phase = 'title' | 'packOpen' | 'teamSelect' | 'teamTalk' | 'match' | 'postmatch' | 'shop' | 'end';

function phaseFromStatus(status: RunState['status']): Phase {
  if (status === 'won' || status === 'lost') return 'end';
  if (status === 'packSelect' || status === 'setup') return 'teamSelect';
  if (status === 'title') return 'title';
  if (status === 'teamTalk') return 'teamTalk';
  return status as Phase;
}

// ---------------------------------------------------------------------------
// GameShell
// ---------------------------------------------------------------------------

export default function GameShell() {
  const [runState, setRunState] = useState<RunState | null>(null);
  const [phase, setPhase] = useState<Phase>('title');
  const [hasExistingRun, setHasExistingRun] = useState(false);
  const [lastMatchResult, setLastMatchResult] = useState<MatchResult | null>(null);
  const [lastPOTM, setLastPOTM] = useState<{ card: Card; goals: number; assists: number; rating: number } | null>(null);
  const [pendingPackChoices, setPendingPackChoices] = useState<StarterPackChoices | null>(null);
  const [pendingContents, setPendingContents] = useState<PackContents | null>(null);
  const [pendingSeed, setPendingSeed] = useState<number>(0);
  // Manager chosen during the pack reveal; carried into TeamSelect.
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

  // --- Title: choose one manager pack, then one player pack. ---
  const handleNewRun = useCallback(() => {
    clearRun();
    setRunState(null);
    const seed = Date.now();
    setPendingPackChoices(ripStarterPackChoices(seed));
    setPendingContents(null);
    setPickedManagerId(null);
    setPendingSeed(seed);
    setPhase('packOpen');
  }, []);

  const handlePacksOpened = useCallback((contents: PackContents) => {
    setPendingContents(contents);
    setPickedManagerId(contents.managers[0]?.id ?? null);
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
    setPendingPackChoices(null);
    setPendingContents(null);
    setPhase('match');
    saveRun(run);
  }, [pendingSeed]);

  // --- Match Complete ---
  const handleMatchComplete = useCallback((result: { yourGoals: number; opponentGoals: number; result: 'win' | 'draw' | 'loss'; handState: HandState; verdict: MatchVerdict; sentOffIds: number[]; scored: Record<number, { goals: number; assists: number }>; playerOfMatch: { card: Card; goals: number; assists: number; rating: number } | null }) => {
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
      runState.playingStyle,
    );

    // Option B reward: a flat per-result base by round × the purchased stadium payout
    // tier. A win earns the base, a draw DRAW_REWARD_FACTOR of it, a loss nothing (the
    // run is over). The gate (attendance.revenue) is now a flavour display only.
    const baseReward = matchReward(
      runState.round,
      result.result,
      runState.stadiumTier,
      DRAW_REWARD_FACTOR,
      result.yourGoals,
      runState.boxOffice ?? false,
    );
    // Manager economy hooks (MANAGER_ROSTER_V2): Box Office / Wheeler-Dealer
    // pay more per result. Flat multiplier on the settled reward.
    const reward = Math.round(baseReward * payoutMult(runState.jokers ?? []));

    // Create match result entry
    const matchResult: MatchResult = {
      round: runState.round,
      opponentName: getOpponent(runState.round).name,
      yourGoals: result.yourGoals,
      opponentGoals: result.opponentGoals,
      attendance: attendance.attendance,
      revenue: reward,
      result: result.result,
      synergiesTriggered: connections.map(c => c.name),
      // Fitness and durability were removed from the V8 run. Keep the legacy
      // history shape stable without inventing post-match card damage.
      shattered: [],
      injured: [],
      promoted: [],
      // Why the match went the way it did — read by PostMatch, and by EndScreen
      // via matchHistory (the last entry is why the run ended).
      verdict: result.verdict,
    };

    // Accrue this match's goals/assists onto the surviving deck (the inspector RECORD).
    const updatedDeck = applyMatchScoring(runState.deck, result.scored ?? {});

    // Update wins/losses
    const wins = runState.wins + (result.result === 'win' ? 1 : 0);
    const losses = runState.losses + (result.result === 'loss' ? 1 : 0);

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
      cash: runState.cash + reward,
      // stadiumTier persists from runState — now changed only by a Stadium Expansion
      // Investment purchase (Phase 2 Chunk 2), not derived from results.
      wins,
      losses,
      round: runState.round,
      matchHistory: [...runState.matchHistory, matchResult],
      chemistry,
      // Between fixtures every owned tactic refills to its rarity capacity — the
      // next match starts with a full playbook (per-call charges reset).
      tacticCharges: refillTacticCharges(runState),
      // SCORING_V2 suspensions: red-carded players sit out the NEXT fixture.
      // Overwritten every match — last match's suspensions have been served.
      suspendedIds: result.sentOffIds.filter((id) => runState.deck.some((c) => c.id === id)),
    };

    setLastMatchResult(matchResult);
    setLastPOTM(result.playerOfMatch);

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

  // --- Post Match (cup flow) ---
  // A loss already routed to 'end' (permadeath). A win/draw here means we advance:
  //  - won the cup FINAL → the run is complete if it was cup 5, else open the shop.
  //  - won a mid-cup tie → continue through the same between-match shop gate.
  const handlePostMatchContinue = useCallback(() => {
    if (!runState) return;

    // Lifting the FINAL cup's final tie wins the run (a loss already routed to 'end' via
    // permadeath). EVERY other match — mid-cup tie OR a non-final cup final — now opens the
    // shop: it is an after-every-match gate. The round/cup advance is deferred to
    // handleShopNext so the shop sits between the match just played and the next one.
    if (isCupFinal(runState.round, runState.matchInCup) && runState.round >= MAX_CUPS) {
      const ended: RunState = { ...runState, status: 'won' };
      setRunState(ended);
      saveHistory(ended);
      clearRun();
      setPhase('end');
      return;
    }

    const toShop: RunState = { ...runState, status: 'shop' };
    setRunState(toShop);
    setPhase('shop');
    saveRun(toShop);
  }, [runState]);

  // --- Team Talk (pre-match) → Match ---
  // Writes only the lineup levers the match reads (activeFormation — NOT the legacy
  // `formation` — plus startingXI/benchIds/intent), all serializable; jokers/tactics are
  // untouched so localStorage round-trip + rehydration are unaffected.
  const handleTeamTalkConfirm = useCallback(
    (upd: { startingXI: number[]; benchIds: number[]; activeFormation: string; intent: TeamIntent }) => {
      setRunState(prev => {
        if (!prev) return prev;
        const next: RunState = { ...prev, ...upd, status: 'match' };
        saveRun(next);
        return next;
      });
      setPhase('match');
    },
    [],
  );

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

  const handleBuyTacticPack = useCallback(() => {
    if (!runState) return;
    const result = buyTacticPack(runState, runState.seed + runState.round * 777);
    if (result) { setRunState(result); saveRun(result); }
  }, [runState]);

  // Buy + rip a sealed card pack. Deducts the cost, adds the pulls to the deck,
  // and RETURNS the revealed cards (with their owned ids) so the shop can play the
  // rip. deck.length seeds the draw so repeated buys in a shop differ. [] if broke.
  const handleBuyPack = useCallback((tier: PackTier): Card[] => {
    if (!runState) return [];
    const cost = tier === 'elite' ? ELITE_PACK_COST : SCOUT_PACK_COST;
    if (runState.cash < cost) return [];
    const seed = runState.seed + runState.deck.length * 131 + runState.round * 777 + (tier === 'elite' ? 911 : 0);
    const { state: withCards, added } = addCardsToDeck(runState, ripCardPack(tier, seed));
    const next = { ...withCards, cash: withCards.cash - cost };
    setRunState(next);
    saveRun(next);
    return added;
  }, [runState]);

  const handleBuyInvestment = useCallback((card: InvestmentCard) => {
    if (!runState) return;
    const result = buyInvestment(runState, card);
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
    // Wheeler-Dealer: shop refreshes at a discount (MANAGER_ROSTER_V2).
    const disc = refreshDiscount(runState.jokers ?? []);
    const result = buyShopItem(runState, disc > 0 ? { ...item, cost: Math.round(item.cost * (1 - disc)) } : item);
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

  // --- Scout Report (squad screen) ---
  // Unlocks the estimated lineup for the CURRENT upcoming tie. Stored as the
  // composite `round * 100 + matchInCup` in the existing scoutedOpponentRound
  // field (composites are ≥ 101, so they never collide with the shop's legacy
  // next-cup values of 2–5) — deterministic and localStorage-safe.
  const handleScoutCurrentTie = useCallback(() => {
    setRunState(prev => {
      if (!prev || prev.cash < SCOUT_COST) return prev;
      const next: RunState = {
        ...prev,
        cash: prev.cash - SCOUT_COST,
        scoutedOpponentRound: prev.round * 100 + prev.matchInCup,
      };
      saveRun(next);
      return next;
    });
  }, []);

  const handleShopNext = useCallback(() => {
    if (!runState) return;
    // The shop now follows EVERY match, so this is where the run advances to the next one.
    // Two cases, by whether the match just played closed out a cup:
    //   • cup final (never the last cup — that already routed to 'end') → roll into the
    //     next cup: matchInCup resets to 1, one tactic is drawn, and interest is banked.
    //   • mid-cup tie → the next tie of the same cup; matchInCup advances by one.
    // Either way we open the Team Talk so the player sets the XI/shape for the next match.
    const finishedCup = isCupFinal(runState.round, runState.matchInCup);
    let next: RunState;
    if (finishedCup) {
      const nextCup = runState.round + 1;
      const tacticsDeck = drawRoundTactic(runState.tacticsDeck, runState.seed * 31 + nextCup * 7);
      // A newly drawn play enters on a single charge (like a pack pull); the rest
      // keep the capacities refilled at post-match.
      const drawn = tacticsDeck.filter((t) => !runState.tacticsDeck.some((o) => o.id === t.id));
      next = {
        ...runState,
        round: nextCup,
        matchInCup: 1,
        cash: runState.cash + interestOn(runState.cash),
        deck: runState.deck,
        tacticsDeck,
        tacticCharges: { ...(runState.tacticCharges ?? {}), ...Object.fromEntries(drawn.map((t) => [t.id, 1])) },
        status: 'teamTalk',
      };
    } else {
      // Same cup, next tie: matchInCup advances HERE (the Team Talk confirm must not bump it).
      next = { ...runState, matchInCup: runState.matchInCup + 1, status: 'teamTalk' };
    }
    setRunState(next);
    setPhase('teamTalk');
    saveRun(next);
  }, [runState]);

  // --- End ---
  const handleEndNewRun = useCallback(() => {
    clearRun();
    setRunState(null);
    setLastMatchResult(null);
    setLastPOTM(null);
    setHasExistingRun(false);
    setPhase('title');
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  // The deterministic build of the next opponent, for the squad screen's Scout
  // Report. Draft = the first tie of cup 1 under the pending run seed (the same
  // seed createRun receives); team talk = the current upcoming tie.
  const nextOpponentBuild = useMemo(() => {
    if (phase === 'teamTalk' && runState) {
      return getOpponentBuild(runState.round, runState.matchInCup, runState.seed);
    }
    if (phase === 'teamSelect') return getOpponentBuild(1, 1, pendingSeed);
    return null;
  }, [phase, runState, pendingSeed]);

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
        return pendingPackChoices ? (
          <PackReveal choices={pendingPackChoices} onContinue={handlePacksOpened} />
        ) : null;

      case 'teamSelect': {
        // Run-start draft — the unified SquadScreen in draft mode. Its neutral
        // result is adapted HERE to the existing TeamSelection contract that
        // handleTeamConfirm → createRun expects (unchanged).
        if (!pendingContents || !nextOpponentBuild) return null;
        const contents = pendingContents;
        // Only the selected manager and selected 18-player pack cross into the
        // draft. Tactics are deliberately absent from the V1 opening.
        const chosenManagers = pickedManagerId
          ? contents.managers.filter((m) => m.id === pickedManagerId)
          : contents.managers;
        const chosenManager = chosenManagers[0] ?? null;
        const allowedFormations = chosenManager
          ? managerFormationsV1(chosenManager).map(getFormation)
          : contents.formations;
        return (
          <SquadScreen
            mode="draft"
            pool={contents.players}
            formations={contents.formations}
            initialFormationId={allowedFormations[0]?.id ?? '4-3-3'}
            initialIntent="balanced"
            managers={chosenManagers}
            initialManagerId={pickedManagerId}
            opponent={nextOpponentBuild}
            seed={pendingSeed}
            round={1}
            opponentPower={cupMatchPower(1, 1, cupSize(1))}
            cash={0}
            scoutUnlocked={false}
            onConfirm={(out) =>
              handleTeamConfirm({
                players: contents.players,
                startingXI: out.startingXI,
                benchIds: out.benchIds,
                manager: chosenManagers.find((m) => m.id === out.managerId) ?? null,
                tactics: [],
                formationId: out.formationId,
                intent: out.intent,
              })
            }
          />
        );
      }

      case 'teamTalk': {
        // Between-ties team talk — the SAME SquadScreen in talk mode. Its
        // neutral result is adapted HERE to the existing lineup-levers contract
        // that handleTeamTalkConfirm expects (unchanged).
        if (!runState || !nextOpponentBuild) return null;
        const formationIds = Array.from(
          new Set([
            runState.activeFormation,
            ...(runState.ownedFormations?.length ? runState.ownedFormations : [runState.activeFormation]),
          ]),
        );
        const tieLabel = isCupFinal(runState.round, runState.matchInCup)
          ? 'FINAL'
          : `TIE ${runState.matchInCup}/${cupSize(runState.round)}`;
        // Unlocked for THIS tie via the composite key, or via the shop's legacy
        // next-cup scout (which points at the next cup's opening tie).
        const scoutUnlocked =
          runState.scoutedOpponentRound === runState.round * 100 + runState.matchInCup ||
          (runState.scoutedOpponentRound === runState.round && runState.matchInCup === 1);
        return (
          <SquadScreen
            mode="talk"
            pool={runState.deck.filter((c) => !(runState.suspendedIds ?? []).includes(c.id))}
            suspendedCards={runState.deck.filter((c) => (runState.suspendedIds ?? []).includes(c.id))}
            formations={formationIds.map(getFormation)}
            initialFormationId={runState.activeFormation}
            initialIntent={runState.intent ?? 'balanced'}
            initialSelection={{ startingXI: runState.startingXI ?? [], benchIds: runState.benchIds ?? [] }}
            contextLabel={`CUP ${runState.round} · ${tieLabel}`}
            opponent={nextOpponentBuild}
            seed={buildMatchSeed(runState.seed, runState.round, runState.matchInCup)}
            round={runState.round}
            opponentPower={cupMatchPower(runState.round, runState.matchInCup, cupSize(runState.round))}
            jokers={runState.jokers}
            cash={runState.cash}
            scoutUnlocked={scoutUnlocked}
            onUnlockScout={handleScoutCurrentTie}
            onConfirm={(out) =>
              handleTeamTalkConfirm({
                startingXI: out.startingXI,
                benchIds: out.benchIds,
                activeFormation: out.formationId,
                intent: out.intent,
              })
            }
          />
        );
      }

      case 'match': {
        if (!runState) return null;
        return (
          <V8LiveMatchPhase
            runState={runState}
            onMatchComplete={handleMatchComplete}
          />
        );
      }

      case 'postmatch': {
        if (!lastMatchResult || !runState) return null;
        return (
          <PostMatch
            matchResult={lastMatchResult}
            round={lastMatchResult.round}
            matchInCup={runState.matchInCup}
            totalRounds={MAX_CUPS}
            playerOfMatch={lastPOTM}
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
            onBuyPack={handleBuyPack}
            onBuyTacticPack={handleBuyTacticPack}
            onBuyInvestment={handleBuyInvestment}
            onTrainPlayer={handleTrainPlayer}
            onRerollShop={handleRerollShop}
            onHealPlayer={handleHealPlayer}
            onScoutOpponent={handleScoutOpponent}
            scoutedOpponent={
              runState.scoutedOpponentRound === runState.round + 1
                ? getOpponentBuild(runState.round + 1, 1, runState.seed)
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
