'use client';

/**
 * V6MatchPhase — the live card-deployment match in the team-selection look, with a
 * choreographed period resolution (owner direction). Layout, top → bottom:
 *   • controls: Tactics · Formation · Manager + the YOU/OPP team switch
 *   • the SCOREBOARD: a running clock, the score, both teams' ATT/DEF counters, and
 *     two binary chance bars (HOME = its ATT vs the other's DEF, and AWAY likewise)
 *   • the active team on a formation pitch (portraits + big ATT/DEF) + its bench
 *   • the match log (goals, saves, keeper denials)
 *
 * Pressing Continue resolves the coming period as an ANIMATION: the ATT/DEF counters
 * glow → the bars fill → the chance count pops → the dice roll for each side (each
 * pre-allocated to an unseen player) → a goal flashes the scorer's card and ticks the
 * score. No per-period breakdown; the log carries the colour. The engine + the
 * onMatchComplete contract are unchanged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './v6lab.css';
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
  type SubPair,
  type TeamSide,
  type V6Card,
  type V6MatchState,
} from '../../lib/match-v6';
import type { RngState } from '../../lib/match-v6';
import { portraitSrc } from '../cards/portrait';
import { V6FormationPitch, type SlotStat } from './V6FormationPitch';
import { V6PitchCard } from './V6PitchCard';

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
type Stage = 'glow' | 'bars' | 'chances' | 'dice' | 'over';

const BREAK_NAME = ['Kick-off', 'First break', 'Half-time', 'Final break'];
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

interface Resolve {
  fromBoards: { player: BoardReceipt; opponent: BoardReceipt };
  rolls: ChanceRoll[];
  toState: V6MatchState;
  rng: RngState;
  preP: number;
  preO: number;
  stage: Stage;
  dieIdx: number;
}

function receiptsOf(board: BoardReceipt): Record<string, SlotStat> {
  const out: Record<string, SlotStat> = {};
  for (const sec of SECTORS) for (const c of board[sec].cards) out[c.cardId] = { attack: c.attack, defence: c.defence, outOfPosition: c.outOfPosition };
  return out;
}
function totalsOf(board: BoardReceipt): { att: number; def: number } {
  let att = 0;
  let def = 0;
  for (const sec of SECTORS) { att += Math.max(0, board[sec].attack); def += Math.max(0, board[sec].defence); }
  return { att, def };
}
function slotCardsFor(formationId: string, starterIds: string[], active: CardInPlay[], pool: Record<string, V6Card>): (V6Card | null)[] {
  const sectors = getFormation(formationId).slots.map((s) => sectorFromSlot(s.x));
  return assignSlots(starterIds, sectors, active.map((c) => ({ cardId: c.cardId, sector: c.sector }))).map((id) => (id ? pool[id] ?? null : null));
}

interface LogRow { kind: 'goal' | 'save' | 'reveal' | 'period'; side?: TeamSide; text: string; }
function logRows(log: MatchLogEvent[], pool: Record<string, V6Card>, playerName: string, oppName: string): LogRow[] {
  const rows: LogRow[] = [];
  let period = 1;
  for (const e of log) {
    if (e.type === 'reveal' && (e.event.kind === 'reveal' || e.event.kind === 'sub_off')) {
      rows.push({ kind: 'reveal', side: e.event.side, text: e.event.text });
    } else if (e.type === 'goal') {
      const who = e.scorerCardId ? pool[e.scorerCardId]?.shortName ?? '' : '';
      rows.push({ kind: 'goal', side: e.side, text: `⚽ ${e.side === 'player' ? playerName : oppName}${who ? ` — ${who}` : ''} · ${e.sector}` });
    } else if (e.type === 'period_end') {
      period += 1;
    }
  }
  return rows.reverse(); // newest first
}

/** Colour a non-scoring roll for the log — a keeper claim / clearance (the save layer). */
function saveLine(roll: ChanceRoll, pool: Record<string, V6Card>): string {
  const saver = roll.saverCardId ? pool[roll.saverCardId]?.shortName : undefined;
  const six = roll.rolls.includes(6);
  if (saver) return six ? `🧤 ${saver} claws away a certain goal!` : `${saver} clears the danger`;
  return 'the chance goes begging';
}

export default function V6MatchPhase({ runState, onMatchComplete }: { runState: RunState; onMatchComplete: (r: MatchResultPayload) => void }) {
  const formation = getFormation(runState.activeFormation);
  const matchSeed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const opponentName = getOpponent(runState.round).name;

  const hand = useMemo<HandState>(() => {
    const suspended = new Set(runState.suspendedIds ?? []);
    const eligible = runState.deck.filter((c) => !suspended.has(c.id));
    return (
      handFromSelection(eligible, (runState.startingXI ?? []).filter((id) => !suspended.has(id)), (runState.benchIds ?? []).filter((id) => !suspended.has(id)), formation) ??
      rollXI(eligible, formation, matchSeed)
    );
  }, [runState, formation, matchSeed]);

  const playerSquad = useMemo(() => {
    const squad = bridgePlayerSquad('Home', hand.xi, hand.bench, formation);
    return {
      ...squad,
      xi: squad.xi.map((c, i) => ({ ...c, portrait: portraitSrc(hand.xi[i]) ?? undefined })),
      bench: squad.bench.map((c, i) => ({ ...c, portrait: portraitSrc(hand.bench[i]) ?? undefined })),
    };
  }, [hand, formation]);

  const opponentSquad = useMemo(() => {
    const opp = getOpponent(runState.round);
    const power = cupMatchPower(runState.round, runState.matchInCup, cupSize(runState.round));
    return { ...bridgeOpponentSquad({ name: 'Away', round: runState.round, style: opp.style, seed: matchSeed, power }) };
  }, [runState.round, runState.matchInCup, matchSeed]);

  const [step, setStep] = useState<MatchStep>(() => startMatchFromSquads(playerSquad, opponentSquad, matchSeed));
  const [phase, setPhase] = useState<Phase>('break');
  const [view, setView] = useState<View>('you');
  const [plan, setPlan] = useState<SubPair[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [panel, setPanel] = useState<'formation' | 'manager' | 'tactics' | null>(null);
  const [resolve, setResolve] = useState<Resolve | null>(null);

  const st = step.state;
  const pool = st.cardPool;
  const boards = useMemo(() => effectiveBoards(st), [st]);

  // ── Resolve state machine (glow → bars → chances → dice → over) ──────────────
  useEffect(() => {
    if (!resolve) return;
    const r = resolve;
    const set = (patch: Partial<Resolve>) => setResolve((cur) => (cur ? { ...cur, ...patch } : cur));
    if (r.stage === 'glow') { const t = setTimeout(() => set({ stage: 'bars' }), 650); return () => clearTimeout(t); }
    if (r.stage === 'bars') { const t = setTimeout(() => set({ stage: 'chances' }), 850); return () => clearTimeout(t); }
    if (r.stage === 'chances') { const t = setTimeout(() => set({ stage: 'dice', dieIdx: 0 }), 750); return () => clearTimeout(t); }
    if (r.stage === 'dice') {
      if (r.dieIdx >= r.rolls.length) { const t = setTimeout(() => set({ stage: 'over' }), 400); return () => clearTimeout(t); }
      const dwell = r.rolls[r.dieIdx]?.scored ? 1500 : 560;
      const t = setTimeout(() => set({ dieIdx: r.dieIdx + 1 }), dwell);
      return () => clearTimeout(t);
    }
    if (r.stage === 'over') {
      const to = r.toState;
      const next = to.period < 4 ? openBreak(to) : to;
      const t = setTimeout(() => {
        setStep({ state: next, rng: r.rng });
        setPhase(to.period < 4 ? 'break' : 'ended');
        setPlan([]);
        setPick(null);
        setResolve(null);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [resolve]);

  const startResolve = useCallback(() => {
    let fromState = st;
    if (st.breakIndex > 0) {
      fromState = commitBreak(st, { side: 'player', pairs: plan }, defaultOpponentAI.plan(st, 'opponent')).state;
    }
    const adv = advancePeriod(fromState, step.rng);
    setStep({ state: fromState, rng: step.rng }); // pitch shows the post-sub board, pre-period score
    setResolve({
      fromBoards: effectiveBoards(fromState),
      rolls: adv.result.rolls,
      toState: adv.state,
      rng: adv.rng,
      preP: fromState.player.score,
      preO: fromState.opponent.score,
      stage: 'glow',
      dieIdx: -1,
    });
    setPhase('resolving');
    setPick(null);
  }, [st, step.rng, plan]);

  const finish = useCallback(() => {
    const yourGoals = st.player.score;
    const opponentGoals = st.opponent.score;
    const result: 'win' | 'draw' | 'loss' = yourGoals > opponentGoals ? 'win' : yourGoals < opponentGoals ? 'loss' : 'draw';
    const scored: Record<number, { goals: number; assists: number }> = {};
    for (const e of st.log) {
      if (e.type === 'goal' && e.side === 'player' && e.scorerCardId) {
        const m = /^live_(\d+)$/.exec(e.scorerCardId);
        if (m) (scored[Number(m[1])] ??= { goals: 0, assists: 0 }).goals += 1;
      }
    }
    let playerOfMatch: MatchResultPayload['playerOfMatch'] = null;
    for (const c of hand.xi) {
      const g = scored[c.id]?.goals ?? 0;
      if (g > 0 && (!playerOfMatch || g > playerOfMatch.goals)) playerOfMatch = { card: c, goals: g, assists: 0, rating: 6 + g };
    }
    const headline = result === 'win' ? `Won ${yourGoals}–${opponentGoals} on the deployment board` : result === 'loss' ? `Lost ${yourGoals}–${opponentGoals}` : `Drew ${yourGoals}–${opponentGoals}`;
    onMatchComplete({ yourGoals, opponentGoals, result, verdict: { headline, factors: [] }, sentOffIds: [], scored, playerOfMatch, handState: { ...hand, yourGoals, opponentGoals } });
  }, [st, hand, onMatchComplete]);

  // ── Break interaction ────────────────────────────────────────────────────────
  const discounts = st.player.effects.filter((e) => e.kind === 'discount');
  const spent = plan.reduce((n, p) => n + cardEffectiveCost(pool[p.inCardId], discounts), 0);
  const plannedOut = useMemo(() => plan.map((p) => p.outCardId), [plan]);
  const plannedIn = useMemo(() => new Set(plan.map((p) => p.inCardId)), [plan]);
  const canSub = phase === 'break' && view === 'you' && st.energy > 0;

  const selectBench = useCallback((id: string) => {
    if (plannedIn.has(id)) return;
    if (spent + cardEffectiveCost(pool[id], discounts) > st.energy && pick !== id) return;
    setPick((cur) => (cur === id ? null : id));
  }, [plannedIn, spent, pool, discounts, st.energy, pick]);
  const pickActive = useCallback((outId: string) => {
    if (!pick || plannedOut.includes(outId)) return;
    if (spent + cardEffectiveCost(pool[pick], discounts) > st.energy) { setPick(null); return; }
    setPlan((p) => [...p, { outCardId: outId, inCardId: pick }]);
    setPick(null);
  }, [pick, plannedOut, spent, pool, discounts, st.energy]);
  const undoPair = (inId: string) => setPlan((p) => p.filter((x) => x.inCardId !== inId));

  // ── Derived view data ────────────────────────────────────────────────────────
  const viewingYou = view === 'you';
  const activeSquad = viewingYou ? playerSquad : opponentSquad;
  const active = (viewingYou ? st.player : st.opponent).cards.filter((c) => c.zone === 'active');
  const starterIds = (viewingYou ? playerSquad : opponentSquad).xi.map((c) => c.id);
  const slotCards = slotCardsFor(activeSquad.formationId, starterIds, active, pool);
  const receipts = receiptsOf(viewingYou ? boards.player : boards.opponent);
  const benchIds = (viewingYou ? st.player : st.opponent).cards.filter((c) => c.zone === 'bench').map((c) => c.cardId);

  // Scoreboard numbers (bars use the resolving snapshot so they reflect the played board).
  const barBoards = resolve ? resolve.fromBoards : boards;
  const homeT = totalsOf(barBoards.player);
  const awayT = totalsOf(barBoards.opponent);
  const homeSplit = homeT.att / Math.max(1, homeT.att + awayT.def); // HOME chances = its ATT vs their DEF
  const awaySplit = awayT.att / Math.max(1, awayT.att + homeT.def);
  const barsLive = !!resolve && resolve.stage !== 'glow';
  const glowing = resolve?.stage === 'glow';

  // Running score + current die during the dice stage.
  const diceOn = resolve?.stage === 'dice' || resolve?.stage === 'chances' || resolve?.stage === 'over';
  const rolls = resolve?.rolls ?? [];
  const homeChances = rolls.filter((r) => r.side === 'player').length;
  const awayChances = rolls.filter((r) => r.side === 'opponent').length;
  const dieIdx = resolve?.stage === 'dice' ? Math.min(resolve.dieIdx, rolls.length - 1) : -1;
  let showP = resolve ? resolve.preP : st.player.score;
  let showO = resolve ? resolve.preO : st.opponent.score;
  if (resolve && resolve.stage === 'dice') {
    for (let k = 0; k <= resolve.dieIdx && k < rolls.length; k++) if (rolls[k].scored) { if (rolls[k].side === 'player') showP++; else showO++; }
  } else if (resolve && resolve.stage === 'over') { showP = resolve.toState.player.score; showO = resolve.toState.opponent.score; }
  const curRoll = dieIdx >= 0 ? rolls[dieIdx] : null;
  const goalCard = curRoll?.scored && curRoll.attackerCardId ? pool[curRoll.attackerCardId] : null;

  // Match clock (deterministic minute from period + dice progress).
  const resolvedPeriods = st.log.filter((e) => e.type === 'period_end').length;
  const baseMin = resolvedPeriods * 22 + (resolve ? 1 : 0) * 0;
  const diceMin = resolve && rolls.length ? Math.round((Math.max(0, resolve.dieIdx) / rolls.length) * 22) : 0;
  const minute = Math.min(90, resolve ? (resolvedPeriods * 22) + diceMin : baseMin);

  const log = useMemo(() => logRows(st.log, pool, 'Home', 'Away'), [st.log, pool]);

  const managerName = runState.jokers?.[0]?.name ?? '—';
  const panelText = panel === 'formation' ? `Formation · ${formation.name}` : panel === 'manager' ? `Manager · ${managerName}` : panel === 'tactics' ? `Tactics · ${(runState.tacticsDeck ?? []).map((t) => t.name).join(', ') || 'none'}` : '';

  const cta = phase === 'ended'
    ? { label: 'Full time →', on: finish }
    : { label: st.breakIndex === 0 ? 'Kick off →' : 'Continue →', on: startResolve };

  return (
    <div className="v6-lab v6-match">
      {/* controls */}
      <div className="v6-mrow">
        <div className="v6-mbtns">
          <button className={panel === 'tactics' ? 'on' : ''} onClick={() => setPanel((p) => (p === 'tactics' ? null : 'tactics'))}>Tactics</button>
          <button className={panel === 'formation' ? 'on' : ''} onClick={() => setPanel((p) => (p === 'formation' ? null : 'formation'))}>Formation</button>
          <button className={panel === 'manager' ? 'on' : ''} onClick={() => setPanel((p) => (p === 'manager' ? null : 'manager'))}>Manager</button>
        </div>
        <div className="v6-teamtoggle" role="tablist" aria-label="Switch team">
          <button className={viewingYou ? 'on' : ''} onClick={() => setView('you')}>HOME</button>
          <button className={!viewingYou ? 'on' : ''} onClick={() => setView('opp')}>AWAY</button>
        </div>
      </div>
      {panel && <div className="v6-mpanel" onClick={() => setPanel(null)}>{panelText}</div>}

      {/* scoreboard: clock · score · ATT/DEF counters · chance bars */}
      <div className="v6-sb">
        <div className="v6-sb-top">
          <div className={`v6-sb-cnt${glowing ? ' glow' : ''}`}><span className="lbl">HOME</span><span className="v6-att">{homeT.att}</span><span className="v6-def">{homeT.def}</span></div>
          <div className="v6-sb-mid"><div className="v6-clock">{minute}′</div><div className="v6-sb-score">{showP}<span>–</span>{showO}</div></div>
          <div className={`v6-sb-cnt right${glowing ? ' glow' : ''}`}><span className="v6-att">{awayT.att}</span><span className="v6-def">{awayT.def}</span><span className="lbl">AWAY</span></div>
        </div>
        <div className="v6-bars">
          <div className="v6-bar-row">
            <span className="v6-bar-tag">HOME</span>
            <div className="v6-bar"><i className="fill home" style={{ width: `${barsLive ? homeSplit * 100 : 0}%` }} /></div>
            {diceOn && <span className={`v6-bar-ch${resolve?.stage === 'chances' ? ' pop' : ''}`}>{homeChances}⚀</span>}
          </div>
          <div className="v6-bar-row">
            <span className="v6-bar-tag">AWAY</span>
            <div className="v6-bar"><i className="fill away" style={{ width: `${barsLive ? awaySplit * 100 : 0}%` }} /></div>
            {diceOn && <span className={`v6-bar-ch${resolve?.stage === 'chances' ? ' pop' : ''}`}>{awayChances}⚀</span>}
          </div>
        </div>
      </div>

      {/* pitch + bench, with the dice / goal overlay during resolve */}
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
          {resolve?.stage === 'dice' && curRoll && (
            <div className="v6-diebox">
              <div className="v6-dielabel">{curRoll.side === 'player' ? 'HOME' : 'AWAY'} · {curRoll.sector}</div>
              <div key={dieIdx} className={`v6-die-big${curRoll.scored ? ' hot' : ''}`}>{DIE[curRoll.rolls[curRoll.rolls.length - 1] - 1]}</div>
              {!curRoll.scored && <div className="v6-outcome miss">{saveLine(curRoll, pool)}</div>}
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
          {canSub && <div className="v6-mbenchhint">{pick ? 'Tap a player to swap' : `Bench · pick a sub  ·  ${st.energy - spent}⚡ left`}</div>}
          <div className="v6-mbench">
            {benchIds.map((id) => {
              const c = pool[id];
              if (!c) return null;
              const cost = cardEffectiveCost(c, discounts);
              return (
                <V6PitchCard
                  key={id}
                  card={c}
                  selected={canSub && pick === id}
                  spent={canSub && plannedIn.has(id)}
                  dim={canSub && spent + cost > st.energy && pick !== id && !plannedIn.has(id)}
                  onClick={canSub ? () => selectBench(id) : undefined}
                />
              );
            })}
          </div>
          {canSub && plan.length > 0 && (
            <div className="v6-mplan">
              {plan.map((p) => (
                <button key={p.inCardId} className="v6-mplan-row" onClick={() => undoPair(p.inCardId)}>{pool[p.outCardId]?.shortName} → {pool[p.inCardId]?.shortName} <span className="x">×</span></button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* match log */}
      <div className="v6-mlog">
        {log.length === 0 ? <div className="v6-mlog-empty">Kick-off — the board is set. Press {st.breakIndex === 0 ? 'Kick off' : 'Continue'}.</div> : log.map((r, i) => (
          <div key={i} className={`v6-mlog-row ${r.kind}${r.side ? ` ${r.side}` : ''}`}>{r.text}</div>
        ))}
      </div>

      {phase !== 'resolving' && <button className="v6-cta v6-mcta" onClick={cta.on}>{cta.label}</button>}
      {phase === 'resolving' && <div className="v6-cta v6-mcta ghost">{BREAK_NAME[st.breakIndex]} · playing…</div>}
    </div>
  );
}
