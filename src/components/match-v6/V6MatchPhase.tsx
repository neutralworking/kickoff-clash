'use client';

/**
 * V6MatchPhase — the LIVE card-deployment match, dressed in the TEAM-SELECTION
 * look (owner direction). Four stacked zones, mobile-first:
 *   • ~5%  a controls line: Tactics · Formation · Manager + the YOU/OPP team switch
 *   • ~15% the scoreline + both teams' total ATT/DEF
 *   • ~60% the active team on a formation pitch + its bench (switch teams to scout)
 *   • ~20% the match log (reveals, chances, goals) streamed from engine state
 * The pitch is the same top-down formation surface as the squad screen, so a card
 * reads the same object in selection and in play. Blind subs still happen at the
 * three breaks; the engine + result contract are unchanged (packs → shop → run).
 */

import { useCallback, useMemo, useState } from 'react';
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
  type SubPair,
  type TeamSide,
  type V6Card,
} from '../../lib/match-v6';
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

type Phase = 'summary' | 'break' | 'fulltime';
type View = 'you' | 'opp';

const BREAK_NAME = ['', 'First break', 'Half-time', 'Final break'];

// ── Selectors over engine state (the log + boards are projections, no extra state) ──

/** Per-card effective ATT/DEF + out-of-position, flattened from a board receipt. */
function receiptsOf(board: BoardReceipt): Record<string, SlotStat> {
  const out: Record<string, SlotStat> = {};
  for (const sec of SECTORS) {
    for (const c of board[sec].cards) out[c.cardId] = { attack: c.attack, defence: c.defence, outOfPosition: c.outOfPosition };
  }
  return out;
}

/** A side's total effective ATT and DEF (the header read). */
function totalsOf(board: BoardReceipt): { att: number; def: number } {
  let att = 0;
  let def = 0;
  for (const sec of SECTORS) {
    att += Math.max(0, board[sec].attack);
    def += Math.max(0, board[sec].defence);
  }
  return { att, def };
}

/** The active cards mapped onto a formation's slots (holds shape across subs). */
function slotCardsFor(formationId: string, starterIds: string[], active: CardInPlay[], pool: Record<string, V6Card>): (V6Card | null)[] {
  const formation = getFormation(formationId);
  const sectors = formation.slots.map((s) => sectorFromSlot(s.x));
  const ids = assignSlots(starterIds, sectors, active.map((c) => ({ cardId: c.cardId, sector: c.sector })));
  return ids.map((id) => (id ? pool[id] ?? null : null));
}

/** The match log — a filtered projection of the engine's typed event log. */
interface LogRow {
  kind: 'goal' | 'reveal' | 'period';
  side?: TeamSide;
  text: string;
}
function logRows(log: MatchLogEvent[], pool: Record<string, V6Card>, playerName: string, oppName: string): LogRow[] {
  const rows: LogRow[] = [];
  let period = 1;
  for (const e of log) {
    if (e.type === 'reveal' && (e.event.kind === 'reveal' || e.event.kind === 'sub_off')) {
      rows.push({ kind: 'reveal', side: e.event.side, text: e.event.text });
    } else if (e.type === 'goal') {
      const who = e.scorerCardId ? pool[e.scorerCardId]?.shortName ?? '' : '';
      const team = e.side === 'player' ? playerName : oppName;
      rows.push({ kind: 'goal', side: e.side, text: `⚽ ${team}${who ? ` — ${who}` : ''} · ${e.sector}` });
    } else if (e.type === 'period_end') {
      rows.push({ kind: 'period', text: `Period ${period} · ${e.playerGoals}–${e.opponentGoals}` });
      period += 1;
    }
  }
  return rows;
}

export default function V6MatchPhase({ runState, onMatchComplete }: { runState: RunState; onMatchComplete: (r: MatchResultPayload) => void }) {
  const formation = getFormation(runState.activeFormation);
  const matchSeed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const opponentName = getOpponent(runState.round).name;

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

  const playerSquad = useMemo(() => {
    const squad = bridgePlayerSquad('YOUR XI', hand.xi, hand.bench, formation);
    return {
      ...squad,
      xi: squad.xi.map((c, i) => ({ ...c, portrait: portraitSrc(hand.xi[i]) ?? undefined })),
      bench: squad.bench.map((c, i) => ({ ...c, portrait: portraitSrc(hand.bench[i]) ?? undefined })),
    };
  }, [hand, formation]);

  const opponentSquad = useMemo(() => {
    const opp = getOpponent(runState.round);
    const power = cupMatchPower(runState.round, runState.matchInCup, cupSize(runState.round));
    return bridgeOpponentSquad({ name: opponentName, round: runState.round, style: opp.style, seed: matchSeed, power });
  }, [runState.round, runState.matchInCup, opponentName, matchSeed]);

  const [step, setStep] = useState<MatchStep>(() => {
    const start = startMatchFromSquads(playerSquad, opponentSquad, matchSeed);
    const adv = advancePeriod(start.state, start.rng);
    return { state: adv.state, rng: adv.rng };
  });
  const [phase, setPhase] = useState<Phase>('summary');
  const [view, setView] = useState<View>('you');
  const [plan, setPlan] = useState<SubPair[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [panel, setPanel] = useState<'formation' | 'manager' | 'tactics' | null>(null);

  const st = step.state;
  const pool = st.cardPool;
  const boards = useMemo(() => effectiveBoards(st), [st]);
  const youTotals = totalsOf(boards.player);
  const oppTotals = totalsOf(boards.opponent);
  const youReceipts = useMemo(() => receiptsOf(boards.player), [boards]);
  const oppReceipts = useMemo(() => receiptsOf(boards.opponent), [boards]);

  const playerStarterIds = useMemo(() => playerSquad.xi.map((c) => c.id), [playerSquad]);
  const opponentStarterIds = useMemo(() => opponentSquad.xi.map((c) => c.id), [opponentSquad]);
  const youActive = st.player.cards.filter((c) => c.zone === 'active');
  const oppActive = st.opponent.cards.filter((c) => c.zone === 'active');
  const youSlots = useMemo(() => slotCardsFor(playerSquad.formationId, playerStarterIds, youActive, pool), [playerSquad.formationId, playerStarterIds, youActive, pool]);
  const oppSlots = useMemo(() => slotCardsFor(opponentSquad.formationId, opponentStarterIds, oppActive, pool), [opponentSquad.formationId, opponentStarterIds, oppActive, pool]);

  const discounts = st.player.effects.filter((e) => e.kind === 'discount');
  const spent = plan.reduce((n, p) => n + cardEffectiveCost(pool[p.inCardId], discounts), 0);
  const plannedOut = useMemo(() => plan.map((p) => p.outCardId), [plan]);
  const plannedIn = useMemo(() => new Set(plan.map((p) => p.inCardId)), [plan]);

  const log = useMemo(() => logRows(st.log, pool, st.player.name, st.opponent.name), [st.log, pool, st.player.name, st.opponent.name]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const continueToBreak = useCallback(() => {
    setStep((s) => ({ ...s, state: openBreak(s.state) }));
    setPhase('break');
    setPlan([]);
    setPick(null);
    setView('you');
  }, []);

  const lock = useCallback(() => {
    setStep((s) => {
      const committed = commitBreak(s.state, { side: 'player', pairs: plan }, defaultOpponentAI.plan(s.state, 'opponent'));
      const adv = advancePeriod(committed.state, s.rng);
      return { state: adv.state, rng: adv.rng };
    });
    setPhase('summary');
    setPlan([]);
    setPick(null);
  }, [plan]);

  const selectBench = useCallback(
    (id: string) => {
      if (plannedIn.has(id)) return;
      if (spent + cardEffectiveCost(pool[id], discounts) > st.energy && pick !== id) return;
      setPick((cur) => (cur === id ? null : id));
    },
    [plannedIn, spent, pool, discounts, st.energy, pick],
  );
  const pickActive = useCallback(
    (outId: string) => {
      if (!pick || plannedOut.includes(outId)) return;
      if (spent + cardEffectiveCost(pool[pick], discounts) > st.energy) {
        setPick(null);
        return;
      }
      setPlan((p) => [...p, { outCardId: outId, inCardId: pick }]);
      setPick(null);
    },
    [pick, plannedOut, spent, pool, discounts, st.energy],
  );
  const undoPair = (inId: string) => setPlan((p) => p.filter((x) => x.inCardId !== inId));

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

  // ── Derived view data ────────────────────────────────────────────────────────
  const viewingYou = view === 'you';
  const activeSquad = viewingYou ? playerSquad : opponentSquad;
  const slotCards = viewingYou ? youSlots : oppSlots;
  const receipts = viewingYou ? youReceipts : oppReceipts;
  const benchIds = (viewingYou ? st.player : st.opponent).cards.filter((c) => c.zone === 'bench').map((c) => c.cardId);
  const canSub = phase === 'break' && viewingYou;

  const phaseLabel = phase === 'break' ? BREAK_NAME[st.breakIndex] : phase === 'fulltime' ? 'Full time' : `Period ${st.period}`;

  const cta =
    phase === 'fulltime'
      ? { label: 'Continue →', on: finish, disabled: false }
      : phase === 'break'
        ? { label: `Lock changes${plan.length ? ` · ${spent}/${st.energy}⚡` : ''} →`, on: lock, disabled: false }
        : st.period >= 4
          ? { label: 'Full time →', on: () => setPhase('fulltime'), disabled: false }
          : { label: `Continue to ${BREAK_NAME[st.period]} →`, on: continueToBreak, disabled: false };

  const managerName = runState.jokers?.[0]?.name ?? '—';
  const tacticNames = (runState.tacticsDeck ?? []).map((t) => t.name);
  const panelText =
    panel === 'formation' ? `Formation · ${formation.name}` : panel === 'manager' ? `Manager · ${managerName}` : panel === 'tactics' ? `Tactics · ${tacticNames.length ? tacticNames.join(', ') : 'none equipped'}` : '';

  return (
    <div className="v6-lab v6-match">
      {/* 5% — controls */}
      <div className="v6-mrow">
        <div className="v6-mbtns">
          <button className={panel === 'tactics' ? 'on' : ''} onClick={() => setPanel((p) => (p === 'tactics' ? null : 'tactics'))}>Tactics</button>
          <button className={panel === 'formation' ? 'on' : ''} onClick={() => setPanel((p) => (p === 'formation' ? null : 'formation'))}>Formation</button>
          <button className={panel === 'manager' ? 'on' : ''} onClick={() => setPanel((p) => (p === 'manager' ? null : 'manager'))}>Manager</button>
        </div>
        <div className="v6-teamtoggle" role="tablist" aria-label="Switch team">
          <button className={viewingYou ? 'on' : ''} onClick={() => setView('you')}>YOU</button>
          <button className={!viewingYou ? 'on' : ''} onClick={() => setView('opp')}>OPP</button>
        </div>
      </div>
      {panel && <div className="v6-mpanel" onClick={() => setPanel(null)}>{panelText}</div>}

      {/* 15% — scoreline + both teams' ATT/DEF */}
      <div className="v6-mhead">
        <div className={`v6-mside${viewingYou ? ' active' : ''}`}>
          <div className="nm">{st.player.name}</div>
          <div className="ad"><span className="v6-att">{youTotals.att}</span> <span className="v6-def">{youTotals.def}</span></div>
        </div>
        <div className="v6-mscore">
          <div className="sc">{st.player.score}<span>–</span>{st.opponent.score}</div>
          <div className="ph">{phaseLabel}</div>
        </div>
        <div className={`v6-mside right${!viewingYou ? ' active' : ''}`}>
          <div className="nm">{st.opponent.name}</div>
          <div className="ad"><span className="v6-att">{oppTotals.att}</span> <span className="v6-def">{oppTotals.def}</span></div>
        </div>
      </div>

      {/* 60% — the active team on a formation pitch + its bench */}
      <div className="v6-mpitch">
        <V6FormationPitch
          formation={getFormation(activeSquad.formationId)}
          slotCards={slotCards}
          receipts={receipts}
          mode={canSub ? 'break' : 'idle'}
          selectedId={canSub ? pick : null}
          plannedOutIds={plannedOut}
          onPick={canSub ? pickActive : undefined}
        />
        <div className="v6-mbenchwrap">
          {canSub && (
            <div className="v6-mbenchhint">
              {pick ? 'Tap a player to swap' : `Bench · pick a sub  ·  ${st.energy - spent}⚡ left`}
            </div>
          )}
          <div className="v6-mbench">
            {benchIds.map((id) => {
              const c = pool[id];
              if (!c) return null;
              const cost = cardEffectiveCost(c, discounts);
              const affordable = spent + cost <= st.energy;
              return (
                <V6PitchCard
                  key={id}
                  card={c}
                  selected={canSub && pick === id}
                  spent={canSub && plannedIn.has(id)}
                  dim={canSub && !affordable && pick !== id && !plannedIn.has(id)}
                  onClick={canSub ? () => selectBench(id) : undefined}
                />
              );
            })}
          </div>
          {canSub && plan.length > 0 && (
            <div className="v6-mplan">
              {plan.map((p) => (
                <button key={p.inCardId} className="v6-mplan-row" onClick={() => undoPair(p.inCardId)}>
                  {pool[p.outCardId]?.shortName} → {pool[p.inCardId]?.shortName} <span className="x">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 20% — the match log */}
      <div className="v6-mlog">
        {log.length === 0 ? (
          <div className="v6-mlog-empty">Kick-off — the deployment board is set.</div>
        ) : (
          log.map((r, i) => (
            <div key={i} className={`v6-mlog-row ${r.kind}${r.side ? ` ${r.side}` : ''}`}>{r.text}</div>
          ))
        )}
      </div>

      {/* CTA */}
      <button className="v6-cta v6-mcta" onClick={cta.on} disabled={cta.disabled}>{cta.label}</button>
    </div>
  );
}
