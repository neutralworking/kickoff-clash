'use client';

/**
 * V6MatchPhase (migration Phase 3) — the LIVE run plays a V6 card-deployment
 * match. Drop-in for the old SCORING_V2 MatchPhase: same `onMatchComplete`
 * contract, so packs → shop → permadeath keep working. The player's rolled XI +
 * bench are bridged to V6 cards (real portraits kept); the opponent is a V6
 * fixture deck wearing the round's opponent name. At full time it hands the run
 * a compatible result (goals, verdict, scorer record, POTM, HandState).
 */

import { useCallback, useMemo, useState } from 'react';
import './v6lab.css';
import type { Card } from '../../lib/scoring';
import type { RunState } from '../../lib/run';
import { getOpponent, buildMatchSeed } from '../../lib/run';
import { getFormation } from '../../lib/formations';
import { rollXI, handFromSelection, type HandState } from '../../lib/hand';
import type { MatchVerdict } from '../../lib/match-v5';
import { toV6Card, v6Sector } from '../../lib/v6-bridge';
import {
  startMatchFromSquads,
  advancePeriod,
  openBreak,
  commitBreak,
  deckV6Squad,
  V6_DECKS,
  effectiveBoards,
  chanceOutlook,
  cardEffectiveCost,
  defaultOpponentAI,
  type MatchStep,
  type PeriodResult,
  type RevealEvent,
  type Sector,
  type SubPair,
  type V6Card,
} from '../../lib/match-v6';
import { portraitSrc } from '../cards/portrait';
import { V6ScoreHeader } from './V6ScoreHeader';
import { V6Board } from './V6Board';
import { V6Bench } from './V6Bench';
import { V6PlanTray, type PlanRow } from './V6PlanTray';
import { V6EventTicker, type Tick } from './V6EventTicker';
import { V6RevealSequence } from './V6RevealSequence';
import { V6ChanceResolution } from './V6ChanceResolution';

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

type Phase = 'summary' | 'break' | 'reveal' | 'chance' | 'fulltime';
interface Game {
  match: MatchStep;
  phase: Phase;
  lastResult: PeriodResult | null;
  lastReveals: RevealEvent[];
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const BREAK_NAME = ['', 'First break', 'Half-time', 'Final break'];

const withPortrait = (c: Card): V6Card => ({ ...toV6Card(c), portrait: portraitSrc(c) ?? undefined });

export default function V6MatchPhase({ runState, onMatchComplete }: { runState: RunState; onMatchComplete: (r: MatchResultPayload) => void }) {
  const formation = getFormation(runState.activeFormation);
  const matchSeed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const opponentName = getOpponent(runState.round).name;

  // The rolled hand (honour a pre-match selection, else auto-roll) — kept for the
  // run-compatible HandState we hand back at full time.
  const hand = useMemo<HandState>(() => {
    const suspended = new Set(runState.suspendedIds ?? []);
    const eligible = runState.deck.filter((c) => !suspended.has(c.id));
    return (
      handFromSelection(
        eligible,
        (runState.startingXI ?? []).filter((id) => !suspended.has(id)),
        (runState.benchIds ?? []).filter((id) => !suspended.has(id)),
        formation,
      ) ?? rollXI(eligible, formation, matchSeed)
    );
  }, [runState, formation, matchSeed]);

  // Sector from formation geometry (slot x), so the XI spreads across the three
  // lanes instead of piling every central role into centre.
  const sectorFromX = (x: number): Sector => (x < 33 ? 'left' : x > 67 ? 'right' : 'centre');
  const playerSquad = useMemo(
    () => ({
      name: 'YOUR XI',
      xi: hand.xi.map((c, i) => {
        const slot = formation.slots[i];
        return { ...withPortrait(c), sector: slot ? sectorFromX(slot.x) : v6Sector(c) };
      }),
      bench: hand.bench.map(withPortrait),
    }),
    [hand, formation],
  );
  const opponentSquad = useMemo(() => {
    const deck = V6_DECKS[runState.round % V6_DECKS.length];
    return { ...deckV6Squad(deck.id), name: opponentName };
  }, [runState.round, opponentName]);

  const [game, setGame] = useState<Game>(() => {
    const start = startMatchFromSquads(playerSquad, opponentSquad, matchSeed);
    const adv = advancePeriod(start.state, start.rng);
    return { match: { state: adv.state, rng: adv.rng }, phase: 'summary', lastResult: adv.result, lastReveals: [] };
  });
  const [plan, setPlan] = useState<SubPair[]>([]);
  const [pick, setPick] = useState<string | null>(null);

  const st = game.match.state;
  const pool = st.cardPool;
  const boards = useMemo(() => effectiveBoards(st), [st]);
  const outlook = useMemo(() => chanceOutlook(st), [st]);
  const discounts = st.player.effects.filter((e) => e.kind === 'discount');

  const planSpent = (p: SubPair[]) => p.reduce((n, x) => n + cardEffectiveCost(pool[x.inCardId], discounts), 0);
  const spent = planSpent(plan);
  const affordableUnspent = (id: string) => spent + cardEffectiveCost(pool[id], discounts) <= st.energy;

  const toChance = useCallback(() => setGame((g) => ({ ...g, phase: 'chance' })), []);
  const toSummary = useCallback(() => setGame((g) => ({ ...g, phase: 'summary' })), []);

  const finish = useCallback(() => {
    const yourGoals = st.player.score;
    const opponentGoals = st.opponent.score;
    const result: 'win' | 'draw' | 'loss' = yourGoals > opponentGoals ? 'win' : yourGoals < opponentGoals ? 'loss' : 'draw';

    // Map V6 goal events back to live card ids for the deck RECORD + POTM.
    const scored: Record<number, { goals: number; assists: number }> = {};
    for (const e of st.log) {
      if (e.type === 'goal' && e.side === 'player' && e.scorerCardId) {
        const m = /^live_(\d+)$/.exec(e.scorerCardId);
        if (m) {
          const id = Number(m[1]);
          (scored[id] ??= { goals: 0, assists: 0 }).goals += 1;
        }
      }
    }
    let playerOfMatch: MatchResultPayload['playerOfMatch'] = null;
    for (const c of hand.xi) {
      const g = scored[c.id]?.goals ?? 0;
      if (g > 0 && (!playerOfMatch || g > playerOfMatch.goals)) playerOfMatch = { card: c, goals: g, assists: 0, rating: 6 + g };
    }
    const headline = result === 'win' ? `Won ${yourGoals}–${opponentGoals} on the deployment board` : result === 'loss' ? `Lost ${yourGoals}–${opponentGoals}` : `Drew ${yourGoals}–${opponentGoals}`;

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
  }, [st, hand, onMatchComplete]);

  const continueFromSummary = () => {
    if (st.period >= 4) {
      setGame((g) => ({ ...g, phase: 'fulltime' }));
      return;
    }
    const opened = openBreak(st);
    setGame((g) => ({ ...g, match: { ...g.match, state: opened }, phase: 'break' }));
    setPlan([]);
    setPick(null);
  };

  const selectBench = (id: string) => {
    if (plan.some((p) => p.inCardId === id)) return;
    setPick((cur) => (cur === id ? null : id));
  };
  const pickActive = (outId: string) => {
    if (!pick) return;
    if (plan.some((p) => p.outCardId === outId)) return;
    if (spent + cardEffectiveCost(pool[pick], discounts) > st.energy) {
      setPick(null);
      return;
    }
    setPlan([...plan, { outCardId: outId, inCardId: pick }]);
    setPick(null);
  };
  const removePair = (i: number) => setPlan(plan.filter((_, j) => j !== i));

  const lock = () => {
    const committed = commitBreak(st, { side: 'player', pairs: plan }, defaultOpponentAI.plan(st, 'opponent'));
    const adv = advancePeriod(committed.state, game.match.rng);
    setGame({ match: { state: adv.state, rng: adv.rng }, phase: committed.reveals.length > 0 ? 'reveal' : 'chance', lastResult: adv.result, lastReveals: committed.reveals });
    setPlan([]);
    setPick(null);
  };

  const benchCards = st.player.cards
    .filter((c) => c.zone === 'bench')
    .map((c) => ({ card: pool[c.cardId], cost: cardEffectiveCost(pool[c.cardId], discounts) }));

  const planRows: PlanRow[] = plan.map((p) => {
    const out = pool[p.outCardId];
    const inn = pool[p.inCardId];
    const sector = st.player.cards.find((c) => c.cardId === p.outCardId)?.sector ?? out.sector;
    return { outName: out.shortName ?? out.name, inName: inn.shortName ?? inn.name, note: `${sector} ${signed(inn.attack - out.attack)}A ${signed(inn.defence - out.defence)}D` };
  });

  const phaseLabel =
    game.phase === 'break'
      ? `${BREAK_NAME[st.breakIndex]} · P${st.period + 1} next`
      : game.phase === 'reveal'
        ? `Reveal · Period ${st.period}`
        : game.phase === 'chance'
          ? `Period ${st.period}`
          : game.phase === 'fulltime'
            ? 'Full time'
            : `Period ${st.period}${st.period >= 4 ? '' : ' done'}`;

  const preScore = {
    player: st.player.score - (game.lastResult?.playerGoals ?? 0),
    opponent: st.opponent.score - (game.lastResult?.opponentGoals ?? 0),
  };
  const headerScore = game.phase === 'reveal' || game.phase === 'chance' ? preScore : undefined;

  const ticks: Tick[] = [];
  for (const r of game.lastReveals) ticks.push({ kind: 'reveal', text: r.text });
  if (game.lastResult) {
    for (const roll of game.lastResult.rolls) {
      if (!roll.scored) continue;
      const who = roll.attackerCardId ? pool[roll.attackerCardId]?.shortName ?? '' : '';
      const team = roll.side === 'player' ? st.player.name : st.opponent.name;
      ticks.push({ kind: 'goal', text: `⚽ ${team} — ${who} · ${roll.sector}, rolled ${roll.rolls.join('/')}` });
    }
  }

  const verdict = st.player.score > st.opponent.score ? 'You win!' : st.player.score < st.opponent.score ? 'You lose' : 'Draw';

  return (
    <div className="v6-lab">
      <V6ScoreHeader state={st} phaseLabel={phaseLabel} scoreOverride={headerScore} />

      <V6Board boards={boards} outlook={outlook} pool={pool} mode={game.phase === 'break' ? 'break' : 'idle'} onPickActive={pickActive} />

      {game.phase === 'break' && (
        <div className="v6-break">
          <div className="v6-break-head">
            <div>
              <div className="v6-break-title v6-pixel">{BREAK_NAME[st.breakIndex]}</div>
              <div className="v6-subcopy">Blind changes — the opponent&apos;s move is hidden until you lock.</div>
            </div>
          </div>
          <V6Bench cards={benchCards} selectedId={pick} spentIds={plan.map((p) => p.inCardId)} affordableUnspent={affordableUnspent} onSelect={selectBench} />
          <V6PlanTray rows={planRows} energy={st.energy} spent={spent} picking={!!pick} onRemove={removePair} onLock={lock} />
        </div>
      )}

      {game.phase === 'reveal' && <V6RevealSequence reveals={game.lastReveals} pool={pool} onDone={toChance} />}

      {game.phase === 'chance' && game.lastResult && (
        <V6ChanceResolution result={game.lastResult} pool={pool} preScore={preScore} playerName={st.player.name} oppName={st.opponent.name} onDone={toSummary} />
      )}

      {game.phase === 'summary' && (
        <div className="v6-summary">
          <V6EventTicker ticks={ticks} />
          <button className="v6-cta" onClick={continueFromSummary}>
            {st.period >= 4 ? 'Full time →' : `Continue to ${BREAK_NAME[st.period]} →`}
          </button>
        </div>
      )}

      {game.phase === 'fulltime' && (
        <div className="v6-fulltime">
          <div className="big v6-pixel">
            {st.player.score}–{st.opponent.score}
          </div>
          <div className="verdict v6-pixel">{verdict}</div>
          <button className="v6-cta" onClick={finish}>
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
