'use client';

/**
 * Live V6 match presentation. The V6 engine and GameShell result contract remain
 * authoritative; this component only stages coaching decisions and receipts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './v6lab.css';
import './v6match-review.css';
import type { Card } from '../../lib/scoring';
import type { RunState } from '../../lib/run';
import { getOpponent, buildMatchSeed, cupSize } from '../../lib/run';
import { cupMatchPower } from '../../lib/opponent';
import { getFormation } from '../../lib/formations';
import { rollXI, handFromSelection, type HandState } from '../../lib/hand';
import type { MatchVerdict } from '../../lib/match-v5';
import { bridgePlayerSquad, bridgeOpponentSquad, assignSlots, sectorFromSlot } from '../../lib/v6-bridge';
import {
  startMatchFromSquads,
  advancePeriod,
  openBreak,
  commitBreak,
  effectiveBoards,
  cardEffectiveCost,
  defaultOpponentAI,
  SECTORS,
  type MatchStep,
  type MatchLogEvent,
  type BoardReceipt,
  type CardInPlay,
  type ChanceRoll,
  type RevealEvent,
  type SubPair,
  type TeamSide,
  type V6Card,
  type V6MatchState,
} from '../../lib/match-v6';
import type { RngState } from '../../lib/match-v6';
import { portraitSrc } from '../cards/portrait';
import { V6FormationPitch, type SlotStat } from './V6FormationPitch';
import { V6PitchCard } from './V6PitchCard';
import { previewPlayerPlan, recommendOutgoing, type V6PlanProjection } from './v6MatchPreview';

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

type Phase = 'break' | 'resolving' | 'ended';
type View = 'you' | 'opp';
type Stage = 'reveal' | 'glow' | 'bars' | 'chances' | 'dice' | 'over';

const BREAK_NAME = ['Kick-off', 'First break', 'Half-time', 'Final break'];
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

interface Resolve {
  fromBoards: { player: BoardReceipt; opponent: BoardReceipt };
  rolls: ChanceRoll[];
  reveals: RevealEvent[];
  revealIdx: number;
  toState: V6MatchState;
  rng: RngState;
  preP: number;
  preO: number;
  stage: Stage;
  dieIdx: number;
}

function receiptsOf(board: BoardReceipt): Record<string, SlotStat> {
  const out: Record<string, SlotStat> = {};
  for (const sec of SECTORS) {
    for (const card of board[sec].cards) {
      out[card.cardId] = { attack: card.attack, defence: card.defence, outOfPosition: card.outOfPosition };
    }
  }
  return out;
}

function totalsOf(board: BoardReceipt): { att: number; def: number } {
  let att = 0;
  let def = 0;
  for (const sec of SECTORS) {
    att += Math.max(0, board[sec].attack);
    def += Math.max(0, board[sec].defence);
  }
  return { att, def };
}

function slotCardsFor(
  formationId: string,
  starterIds: string[],
  active: CardInPlay[],
  pool: Record<string, V6Card>,
): (V6Card | null)[] {
  const sectors = getFormation(formationId).slots.map((slot) => sectorFromSlot(slot.x));
  return assignSlots(starterIds, sectors, active.map((card) => ({ cardId: card.cardId, sector: card.sector })))
    .map((id) => (id ? pool[id] ?? null : null));
}

interface LogRow {
  kind: 'goal' | 'save' | 'reveal' | 'period';
  side?: TeamSide;
  text: string;
}

function logRows(log: MatchLogEvent[], pool: Record<string, V6Card>, playerName: string, oppName: string): LogRow[] {
  const rows: LogRow[] = [];
  for (const event of log) {
    if (event.type === 'reveal' && (event.event.kind === 'reveal' || event.event.kind === 'sub_off')) {
      rows.push({ kind: 'reveal', side: event.event.side, text: event.event.text });
    } else if (event.type === 'goal') {
      const who = event.scorerCardId ? pool[event.scorerCardId]?.shortName ?? '' : '';
      rows.push({
        kind: 'goal',
        side: event.side,
        text: `⚽ ${event.side === 'player' ? playerName : oppName}${who ? ` — ${who}` : ''} · ${event.sector}`,
      });
    }
  }
  return rows.reverse();
}

function saveLine(roll: ChanceRoll, pool: Record<string, V6Card>): string {
  const saver = roll.saverCardId ? pool[roll.saverCardId]?.shortName : undefined;
  const six = roll.rolls.includes(6);
  if (saver) return six ? `🧤 ${saver} claws away a certain goal!` : `${saver} clears the danger`;
  return 'The chance goes begging';
}

function metricTone(delta: number, inverse = false): string {
  if (delta === 0) return '';
  const positive = inverse ? delta < 0 : delta > 0;
  return positive ? ' good' : ' bad';
}

function projectionWarning(projection: V6PlanProjection, pool: Record<string, V6Card>): string | null {
  const warnings = projection.incomingReceipts.flatMap((receipt) => {
    if (!receipt.outOfPosition) return [];
    const penalty = receipt.mods.find((mod) => mod.label === 'Out of position');
    const name = pool[receipt.cardId]?.shortName ?? receipt.name;
    return [`${name} out of position: ${penalty?.attack ?? 0} ATT / ${penalty?.defence ?? 0} DEF`];
  });
  return warnings.length ? warnings.join(' · ') : null;
}

export default function V6MatchPhase({
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

  const playerSquad = useMemo(() => {
    const squad = bridgePlayerSquad('Your XI', hand.xi, hand.bench, formation);
    return {
      ...squad,
      xi: squad.xi.map((card, index) => ({ ...card, portrait: portraitSrc(hand.xi[index]) ?? undefined })),
      bench: squad.bench.map((card, index) => ({ ...card, portrait: portraitSrc(hand.bench[index]) ?? undefined })),
    };
  }, [hand, formation]);

  const opponentSquad = useMemo(() => {
    const opponent = getOpponent(runState.round);
    const power = cupMatchPower(runState.round, runState.matchInCup, cupSize(runState.round));
    const squad = bridgeOpponentSquad({
      name: opponentName,
      round: runState.round,
      style: opponent.style,
      seed: matchSeed,
      power,
    });
    const withPortrait = (card: V6Card): V6Card => ({
      ...card,
      portrait: portraitSrc({ id: card.id, name: card.name, position: card.position }) ?? undefined,
    });
    return { ...squad, xi: squad.xi.map(withPortrait), bench: squad.bench.map(withPortrait) };
  }, [runState.round, runState.matchInCup, matchSeed, opponentName]);

  const [step, setStep] = useState<MatchStep>(() => startMatchFromSquads(playerSquad, opponentSquad, matchSeed));
  const [phase, setPhase] = useState<Phase>('break');
  const [view, setView] = useState<View>('you');
  const [plan, setPlan] = useState<SubPair[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [planLocked, setPlanLocked] = useState(false);
  const [panel, setPanel] = useState<'formation' | 'manager' | null>(null);
  const [resolve, setResolve] = useState<Resolve | null>(null);

  const state = step.state;
  const pool = state.cardPool;
  const boards = useMemo(() => effectiveBoards(state), [state]);
  const planProjection = useMemo(() => previewPlayerPlan(state, plan), [state, plan]);
  const selectedRecommendation = useMemo(
    () => (pick ? recommendOutgoing(state, plan, pick) : null),
    [state, plan, pick],
  );
  const reviewProjection = selectedRecommendation?.projection ?? (plan.length > 0 ? planProjection : null);

  useEffect(() => {
    if (!resolve) return;
    const current = resolve;
    const patch = (next: Partial<Resolve>) => setResolve((value) => (value ? { ...value, ...next } : value));

    if (current.stage === 'reveal') {
      const reveal = current.reveals[current.revealIdx];
      if (!reveal) {
        patch({ stage: 'glow' });
        return;
      }
      setView(reveal.side === 'player' ? 'you' : 'opp');
      const timer = window.setTimeout(() => patch({ revealIdx: current.revealIdx + 1 }), 900);
      return () => window.clearTimeout(timer);
    }
    if (current.stage === 'glow') {
      const timer = window.setTimeout(() => patch({ stage: 'bars' }), 650);
      return () => window.clearTimeout(timer);
    }
    if (current.stage === 'bars') {
      const timer = window.setTimeout(() => patch({ stage: 'chances' }), 850);
      return () => window.clearTimeout(timer);
    }
    if (current.stage === 'chances') {
      const timer = window.setTimeout(() => patch({ stage: 'dice', dieIdx: 0 }), 750);
      return () => window.clearTimeout(timer);
    }
    if (current.stage === 'dice') {
      if (current.dieIdx >= current.rolls.length) {
        const timer = window.setTimeout(() => patch({ stage: 'over' }), 400);
        return () => window.clearTimeout(timer);
      }
      const dwell = current.rolls[current.dieIdx]?.scored ? 1500 : 650;
      const timer = window.setTimeout(() => patch({ dieIdx: current.dieIdx + 1 }), dwell);
      return () => window.clearTimeout(timer);
    }
    if (current.stage === 'over') {
      const nextState = current.toState.period < 4 ? openBreak(current.toState) : current.toState;
      const timer = window.setTimeout(() => {
        setStep({ state: nextState, rng: current.rng });
        setPhase(current.toState.period < 4 ? 'break' : 'ended');
        setPlan([]);
        setPick(null);
        setPlanLocked(false);
        setView('you');
        setResolve(null);
      }, 350);
      return () => window.clearTimeout(timer);
    }
  }, [resolve]);

  const startResolve = useCallback(() => {
    if (state.breakIndex > 0 && plan.length > 0 && !planLocked) return;

    let fromState = state;
    let reveals: RevealEvent[] = [];
    if (state.breakIndex > 0) {
      const opponentPlan = defaultOpponentAI.plan(state, 'opponent');
      const committed = commitBreak(state, { side: 'player', pairs: plan }, opponentPlan);
      fromState = committed.state;
      reveals = committed.reveals.filter((reveal) => reveal.kind === 'reveal');
    }

    const advanced = advancePeriod(fromState, step.rng);
    setStep({ state: fromState, rng: step.rng });
    setResolve({
      fromBoards: effectiveBoards(fromState),
      rolls: advanced.result.rolls,
      reveals,
      revealIdx: 0,
      toState: advanced.state,
      rng: advanced.rng,
      preP: fromState.player.score,
      preO: fromState.opponent.score,
      stage: reveals.length > 0 ? 'reveal' : 'glow',
      dieIdx: -1,
    });
    setPhase('resolving');
    setPick(null);
  }, [state, step.rng, plan, planLocked]);

  const finish = useCallback(() => {
    const yourGoals = state.player.score;
    const opponentGoals = state.opponent.score;
    const result: 'win' | 'draw' | 'loss' = yourGoals > opponentGoals ? 'win' : yourGoals < opponentGoals ? 'loss' : 'draw';
    const scored: Record<number, { goals: number; assists: number }> = {};
    for (const event of state.log) {
      if (event.type === 'goal' && event.side === 'player' && event.scorerCardId) {
        const match = /^live_(\d+)$/.exec(event.scorerCardId);
        if (match) (scored[Number(match[1])] ??= { goals: 0, assists: 0 }).goals += 1;
      }
    }
    let playerOfMatch: MatchResultPayload['playerOfMatch'] = null;
    for (const card of hand.xi) {
      const goals = scored[card.id]?.goals ?? 0;
      if (goals > 0 && (!playerOfMatch || goals > playerOfMatch.goals)) {
        playerOfMatch = { card, goals, assists: 0, rating: 6 + goals };
      }
    }
    const headline = result === 'win'
      ? `Won ${yourGoals}–${opponentGoals} on the deployment board`
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
  }, [state, hand, onMatchComplete]);

  const discounts = state.player.effects.filter((effect) => effect.kind === 'discount');
  const spent = plan.reduce((sum, pair) => sum + cardEffectiveCost(pool[pair.inCardId], discounts), 0);
  const plannedOut = useMemo(() => plan.map((pair) => pair.outCardId), [plan]);
  const plannedIn = useMemo(() => new Set(plan.map((pair) => pair.inCardId)), [plan]);
  const canSub = phase === 'break' && view === 'you' && state.energy > 0 && !planLocked;

  const selectBench = useCallback((id: string) => {
    if (plannedIn.has(id)) return;
    if (spent + cardEffectiveCost(pool[id], discounts) > state.energy && pick !== id) return;
    setPick((current) => (current === id ? null : id));
  }, [plannedIn, spent, pool, discounts, state.energy, pick]);

  const pickActive = useCallback((outId: string) => {
    if (!pick || plannedOut.includes(outId)) return;
    if (spent + cardEffectiveCost(pool[pick], discounts) > state.energy) {
      setPick(null);
      return;
    }
    setPlan((current) => [...current, { outCardId: outId, inCardId: pick }]);
    setPick(null);
    setPlanLocked(false);
  }, [pick, plannedOut, spent, pool, discounts, state.energy]);

  const undoPair = (inId: string) => {
    if (planLocked) return;
    setPlan((current) => current.filter((pair) => pair.inCardId !== inId));
  };

  const viewingYou = view === 'you';
  const activeSquad = viewingYou ? playerSquad : opponentSquad;
  const active = (viewingYou ? state.player : state.opponent).cards.filter((card) => card.zone === 'active');
  const starterIds = activeSquad.xi.map((card) => card.id);
  const slotCards = slotCardsFor(activeSquad.formationId, starterIds, active, pool);
  const receipts = receiptsOf(viewingYou ? boards.player : boards.opponent);
  const benchIds = (viewingYou ? state.player : state.opponent).cards
    .filter((card) => card.zone === 'bench')
    .map((card) => card.cardId);

  const barBoards = resolve ? resolve.fromBoards : boards;
  const homeTotals = totalsOf(barBoards.player);
  const awayTotals = totalsOf(barBoards.opponent);
  const homeSplit = homeTotals.att / Math.max(1, homeTotals.att + awayTotals.def);
  const awaySplit = awayTotals.att / Math.max(1, awayTotals.att + homeTotals.def);
  const barsLive = Boolean(resolve && !['reveal', 'glow'].includes(resolve.stage));
  const glowing = resolve?.stage === 'glow';

  const diceOn = resolve?.stage === 'dice' || resolve?.stage === 'chances' || resolve?.stage === 'over';
  const rolls = resolve?.rolls ?? [];
  const homeChances = rolls.filter((roll) => roll.side === 'player').length;
  const awayChances = rolls.filter((roll) => roll.side === 'opponent').length;
  const dieIdx = resolve?.stage === 'dice' ? Math.min(resolve.dieIdx, rolls.length - 1) : -1;
  let shownPlayerScore = resolve ? resolve.preP : state.player.score;
  let shownOpponentScore = resolve ? resolve.preO : state.opponent.score;
  if (resolve?.stage === 'dice') {
    for (let index = 0; index <= resolve.dieIdx && index < rolls.length; index += 1) {
      if (!rolls[index].scored) continue;
      if (rolls[index].side === 'player') shownPlayerScore += 1;
      else shownOpponentScore += 1;
    }
  } else if (resolve?.stage === 'over') {
    shownPlayerScore = resolve.toState.player.score;
    shownOpponentScore = resolve.toState.opponent.score;
  }
  const currentRoll = dieIdx >= 0 ? rolls[dieIdx] : null;
  const goalCard = currentRoll?.scored && currentRoll.attackerCardId ? pool[currentRoll.attackerCardId] : null;
  const currentReveal = resolve?.stage === 'reveal' ? resolve.reveals[resolve.revealIdx] ?? null : null;
  const revealCard = currentReveal?.cardId ? pool[currentReveal.cardId] : null;

  const resolvedPeriods = state.log.filter((event) => event.type === 'period_end').length;
  const diceMinute = resolve && rolls.length ? Math.round((Math.max(0, resolve.dieIdx) / rolls.length) * 22) : 0;
  const minute = Math.min(90, resolve ? resolvedPeriods * 22 + diceMinute : resolvedPeriods * 22);

  const log = useMemo(() => logRows(state.log, pool, 'Your XI', opponentName), [state.log, pool, opponentName]);
  const managerName = runState.jokers?.[0]?.name ?? '—';
  const panelText = panel === 'formation'
    ? `Formation · ${formation.name}`
    : panel === 'manager'
      ? `Manager · ${managerName}`
      : '';

  const selectedIncoming = pick ? pool[pick] : null;
  const recommendedOutgoing = selectedRecommendation ? pool[selectedRecommendation.outCardId] : null;
  const reviewWarning = reviewProjection ? projectionWarning(reviewProjection, pool) : null;

  const primary = phase === 'ended'
    ? { label: 'Full time →', onClick: finish, disabled: false }
    : state.breakIndex === 0
      ? { label: 'Kick off →', onClick: startResolve, disabled: false }
      : plan.length > 0 && !planLocked
        ? {
            label: 'Review changes →',
            onClick: () => setPlanLocked(true),
            disabled: !planProjection.legal,
          }
        : {
            label: planLocked ? 'Play next period →' : 'Continue →',
            onClick: startResolve,
            disabled: false,
          };

  return (
    <div className={`v6-lab v6-match${planLocked ? ' plan-locked' : ''}`}>
      <div className="v6-mrow">
        <div className="v6-mbtns">
          <button className={panel === 'formation' ? 'on' : ''} onClick={() => setPanel((current) => (current === 'formation' ? null : 'formation'))}>Formation</button>
          <button className={panel === 'manager' ? 'on' : ''} onClick={() => setPanel((current) => (current === 'manager' ? null : 'manager'))}>Manager</button>
        </div>
        <div className="v6-teamtoggle" role="tablist" aria-label="Switch team">
          <button className={viewingYou ? 'on' : ''} onClick={() => setView('you')}>YOU</button>
          <button className={!viewingYou ? 'on' : ''} onClick={() => setView('opp')}>OPP</button>
        </div>
      </div>
      {panel && <div className="v6-mpanel" onClick={() => setPanel(null)}>{panelText}</div>}

      <div className="v6-sb">
        <div className="v6-sb-top">
          <div className={`v6-sb-cnt${glowing ? ' glow' : ''}`}>
            <span className="lbl">YOU</span><span className="v6-att">{homeTotals.att}</span><span className="v6-def">{homeTotals.def}</span>
          </div>
          <div className="v6-sb-mid"><div className="v6-clock">{minute}′</div><div className="v6-sb-score">{shownPlayerScore}<span>–</span>{shownOpponentScore}</div></div>
          <div className={`v6-sb-cnt right${glowing ? ' glow' : ''}`}>
            <span className="v6-att">{awayTotals.att}</span><span className="v6-def">{awayTotals.def}</span><span className="lbl v6-team-name">{opponentName}</span>
          </div>
        </div>
        <div className="v6-bars">
          <div className="v6-bar-row">
            <span className="v6-bar-tag">YOU</span>
            <div className="v6-bar"><i className="fill home" style={{ width: `${barsLive ? homeSplit * 100 : 0}%` }} /></div>
            {diceOn && <span className={`v6-bar-ch${resolve?.stage === 'chances' ? ' pop' : ''}`}>{homeChances}⚀</span>}
          </div>
          <div className="v6-bar-row">
            <span className="v6-bar-tag">OPP</span>
            <div className="v6-bar"><i className="fill away" style={{ width: `${barsLive ? awaySplit * 100 : 0}%` }} /></div>
            {diceOn && <span className={`v6-bar-ch${resolve?.stage === 'chances' ? ' pop' : ''}`}>{awayChances}⚀</span>}
          </div>
        </div>
      </div>

      <div className="v6-mpitch">
        <div className="v6-pitchwrap">
          <V6FormationPitch
            formation={getFormation(activeSquad.formationId)}
            slotCards={slotCards}
            receipts={receipts}
            mode={canSub ? 'break' : 'idle'}
            selectedId={canSub ? pick : null}
            plannedOutIds={plannedOut}
            onPick={canSub ? pickActive : undefined}
          />
          {currentReveal && revealCard && (
            <div className="v6-reveal-overlay" aria-live="polite">
              <div className="side">{currentReveal.side === 'player' ? 'Your change' : `${opponentName} change`}</div>
              <div className="change">Substitution</div>
              <div className="card"><V6PitchCard card={revealCard} /></div>
              <div className="detail">{currentReveal.text}</div>
            </div>
          )}
          {resolve?.stage === 'dice' && currentRoll && (
            <div className="v6-diebox">
              <div className="v6-dielabel">{currentRoll.side === 'player' ? 'YOU' : opponentName.toUpperCase()} · {currentRoll.sector}</div>
              <div key={dieIdx} className={`v6-die-big${currentRoll.scored ? ' hot' : ''}`}>{DIE[currentRoll.rolls[currentRoll.rolls.length - 1] - 1]}</div>
              {!currentRoll.scored && <div className="v6-outcome miss">{saveLine(currentRoll, pool)}</div>}
            </div>
          )}
          {goalCard && (
            <div className="v6-goalpop">
              <div className="v6-goalword v6-pixel">GOAL!</div>
              <div className="v6-goalcard"><V6PitchCard card={goalCard} /></div>
            </div>
          )}
        </div>

        <div className="v6-mbenchwrap">
          {state.breakIndex > 0 && viewingYou && (
            <div className={`v6-mbenchhint${planLocked ? ' locked' : ''}`}>
              {planLocked
                ? 'Changes locked · opponent response will reveal next'
                : pick
                  ? 'Tap the player to replace'
                  : `Bench · pick a substitute · ${state.energy - spent}⚡ left`}
            </div>
          )}
          <div className="v6-mbench">
            {benchIds.map((id) => {
              const card = pool[id];
              if (!card) return null;
              const cost = cardEffectiveCost(card, discounts);
              return (
                <V6PitchCard
                  key={id}
                  card={card}
                  selected={canSub && pick === id}
                  spent={viewingYou && plannedIn.has(id)}
                  dim={viewingYou && ((canSub && spent + cost > state.energy && pick !== id && !plannedIn.has(id)) || planLocked)}
                  onClick={canSub ? () => selectBench(id) : undefined}
                />
              );
            })}
          </div>

          {viewingYou && plan.length > 0 && (
            <div className="v6-mplan">
              {plan.map((pair) => (
                <button key={pair.inCardId} className={`v6-mplan-row${planLocked ? ' locked' : ''}`} onClick={() => undoPair(pair.inCardId)}>
                  {pool[pair.outCardId]?.shortName} → {pool[pair.inCardId]?.shortName}
                  {!planLocked && <span className="x">×</span>}
                </button>
              ))}
            </div>
          )}

          {viewingYou && reviewProjection && (
            <div className="v6-review-strip">
              <div className="v6-review-head">
                <span>{selectedRecommendation ? 'Best available swap' : planLocked ? 'Submitted lineup' : 'Plan impact'}</span>
                <strong>
                  {selectedRecommendation && selectedIncoming && recommendedOutgoing
                    ? `${selectedIncoming.shortName} for ${recommendedOutgoing.shortName}`
                    : `${reviewProjection.cost}/${state.energy} energy`}
                </strong>
              </div>
              <div className="v6-review-grid">
                <div className={`v6-review-metric att${metricTone(reviewProjection.deltas.attack)}`}><span>ATT</span><b>{reviewProjection.before.player.attack}→{reviewProjection.after.player.attack}</b></div>
                <div className={`v6-review-metric def${metricTone(reviewProjection.deltas.defence)}`}><span>DEF</span><b>{reviewProjection.before.player.defence}→{reviewProjection.after.player.defence}</b></div>
                <div className={`v6-review-metric${metricTone(reviewProjection.deltas.chancesFor)}`}><span>For</span><b>{reviewProjection.before.player.chances}→{reviewProjection.after.player.chances}</b></div>
                <div className={`v6-review-metric${metricTone(reviewProjection.deltas.chancesAgainst, true)}`}><span>Against</span><b>{reviewProjection.before.opponent.chances}→{reviewProjection.after.opponent.chances}</b></div>
              </div>
              {reviewWarning && <div className="v6-review-warning">{reviewWarning}</div>}
              <div className="v6-review-note">Projection is your submitted lineup before the opponent makes its hidden V6 coaching decision.</div>
              {planLocked && (
                <div className="v6-review-actions"><span className="v6-lock-chip">Locked</span><button type="button" onClick={() => setPlanLocked(false)}>Edit changes</button></div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="v6-mlog">
        {log.length === 0
          ? <div className="v6-mlog-empty">Kick-off — the board is set. Press {state.breakIndex === 0 ? 'Kick off' : 'Continue'}.</div>
          : log.map((row, index) => <div key={`${row.text}:${index}`} className={`v6-mlog-row ${row.kind}${row.side ? ` ${row.side}` : ''}`}>{row.text}</div>)}
      </div>

      {phase !== 'resolving' && <button className="v6-cta v6-mcta" disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</button>}
      {phase === 'resolving' && <div className="v6-cta v6-mcta ghost">{resolve?.stage === 'reveal' ? 'Coaching changes · revealing…' : `${BREAK_NAME[state.breakIndex]} · playing…`}</div>}
    </div>
  );
}
