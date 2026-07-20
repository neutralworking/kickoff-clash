'use client';

import { useCallback, useMemo, useState } from 'react';
import './v6lab.css';
import {
  startMatch,
  advancePeriod,
  openBreak,
  commitBreak,
  effectiveBoards,
  chanceOutlook,
  cardEffectiveCost,
  defaultOpponentAI,
  V6_DECKS,
  type MatchStep,
  type PeriodResult,
  type RevealEvent,
  type SubPair,
} from '@/lib/match-v6';
import { V6ScoreHeader } from './V6ScoreHeader';
import { V6Board } from './V6Board';
import { V6Bench } from './V6Bench';
import { V6PlanTray, type PlanRow } from './V6PlanTray';
import { V6EventTicker, type Tick } from './V6EventTicker';
import { V6DebugReceipt } from './V6DebugReceipt';
import { V6RevealSequence } from './V6RevealSequence';
import { V6ChanceResolution } from './V6ChanceResolution';

type Phase = 'summary' | 'break' | 'reveal' | 'chance' | 'fulltime';
interface Game {
  match: MatchStep;
  phase: Phase;
  lastResult: PeriodResult | null;
  lastReveals: RevealEvent[];
}

function newGame(seed: number, playerDeck: string, oppDeck: string): Game {
  const started = startMatch(playerDeck, oppDeck, seed);
  const adv = advancePeriod(started.state, started.rng);
  return { match: { state: adv.state, rng: adv.rng }, phase: 'summary', lastResult: adv.result, lastReveals: [] };
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const BREAK_NAME = ['', 'First break', 'Half-time', 'Final break'];

export default function V6MatchLab() {
  const [seed, setSeed] = useState(1);
  const [playerDeck, setPlayerDeck] = useState('aggressive');
  const [oppDeck, setOppDeck] = useState('defensive');
  const [game, setGame] = useState<Game>(() => newGame(1, 'aggressive', 'defensive'));
  const [plan, setPlan] = useState<SubPair[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);

  const st = game.match.state;
  const pool = st.cardPool;
  const boards = useMemo(() => effectiveBoards(st), [st]);
  const outlook = useMemo(() => chanceOutlook(st), [st]);
  const discounts = st.player.effects.filter((e) => e.kind === 'discount');

  const restart = (s: number, pd: string, od: string) => {
    setSeed(s);
    setPlayerDeck(pd);
    setOppDeck(od);
    setGame(newGame(s, pd, od));
    setPlan([]);
    setPick(null);
  };

  const planSpent = (p: SubPair[]) => p.reduce((n, x) => n + cardEffectiveCost(pool[x.inCardId], discounts), 0);
  const spent = planSpent(plan);
  const affordableUnspent = (id: string) => spent + cardEffectiveCost(pool[id], discounts) <= st.energy;

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
    setGame({
      match: { state: adv.state, rng: adv.rng },
      phase: committed.reveals.length > 0 ? 'reveal' : 'chance',
      lastResult: adv.result,
      lastReveals: committed.reveals,
    });
    setPlan([]);
    setPick(null);
  };

  const toChance = useCallback(() => setGame((g) => ({ ...g, phase: 'chance' })), []);
  const toSummary = useCallback(() => setGame((g) => ({ ...g, phase: 'summary' })), []);

  // derived UI data
  const benchCards = st.player.cards
    .filter((c) => c.zone === 'bench')
    .map((c) => ({ card: pool[c.cardId], cost: cardEffectiveCost(pool[c.cardId], discounts) }));

  const planRows: PlanRow[] = plan.map((p) => {
    const out = pool[p.outCardId];
    const inn = pool[p.inCardId];
    const sector = st.player.cards.find((c) => c.cardId === p.outCardId)?.sector ?? out.sector;
    return {
      outName: out.shortName ?? out.name,
      inName: inn.shortName ?? inn.name,
      note: `${sector} ${signed(inn.attack - out.attack)}A ${signed(inn.defence - out.defence)}D`,
    };
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

  // Freeze the header score during reveal/chance so the sequences don't spoil it.
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
      <div className="v6-controls">
        <label className="v6-tiny v6-muted">You</label>
        <select value={playerDeck} onChange={(e) => restart(seed, e.target.value, oppDeck)}>
          {V6_DECKS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label className="v6-tiny v6-muted">Opp</label>
        <select value={oppDeck} onChange={(e) => restart(seed, playerDeck, e.target.value)}>
          {V6_DECKS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="v6-spacer" />
        <button onClick={() => restart(Math.floor(Math.random() * 1e9), playerDeck, oppDeck)}>New seed</button>
        <button onClick={() => restart(seed, playerDeck, oppDeck)}>Replay</button>
        <button onClick={() => setDebug((d) => !d)}>{debug ? 'Hide' : 'Debug'}</button>
      </div>

      <V6ScoreHeader state={st} phaseLabel={phaseLabel} scoreOverride={headerScore} />

      <V6Board boards={boards} outlook={outlook} pool={pool} mode={game.phase === 'break' ? 'break' : 'idle'} onPickActive={pickActive} />

      {debug && <V6DebugReceipt state={st} boards={boards} outlook={outlook} />}

      {game.phase === 'reveal' && <V6RevealSequence reveals={game.lastReveals} pool={pool} onDone={toChance} />}

      {game.phase === 'chance' && game.lastResult && (
        <V6ChanceResolution result={game.lastResult} pool={pool} preScore={preScore} playerName={st.player.name} oppName={st.opponent.name} onDone={toSummary} />
      )}

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
          <button className="v6-cta" onClick={() => restart(Math.floor(Math.random() * 1e9), playerDeck, oppDeck)}>
            New match
          </button>
        </div>
      )}
    </div>
  );
}
