'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchV5State, IncrementResult, MatchBeat } from '../../lib/match-v5';
import type { Formation, FormationSlot } from '../../lib/formations';
import { getFormation } from '../../lib/formations';
import type { Band, Lane } from '../../lib/field';
import { cellOf, bandOf } from '../../lib/field';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import type { OpponentBuild } from '../../lib/run';
import type { Card } from '../../lib/scoring';
import CardModal from '../cards/CardModal';
import type { GameCardModel } from '../cards/GameCard';
import { PIXEL, lastName } from '../cards/cardTokens';

interface PitchMatchViewProps {
  matchState: MatchV5State;
  formation: Formation;
  jokers: JokerCard[];
  tacticSlots: TacticSlots;
  availableTactics: TacticCard[];
  ownedFormations: string[];
  opponentBuild: OpponentBuild;
  nextMinute: number;
  mode: 'plan' | 'resolve';
  currentResult: IncrementResult | null;
  onToggleTactic: (tacticId: string) => void;
  onSub: (xiCardId: number, benchCardId: number) => void;
  onReassign: (cardA: number, cardB: number) => void;
  onFormationChange: (formationId: string) => void;
  onContinue: () => void;
}

// ---------------------------------------------------------------------------
// Tokens & geometry
// ---------------------------------------------------------------------------

const LINE = 'rgba(242,246,239,0.12)';
const LANE_X: Record<Lane, number> = { L: 22, C: 50, R: 78 };
const YOUR_GOAL_Y = 6;   // your XI attacks UP toward the top goal
const OPP_GOAL_Y = 94;   // the opponent attacks DOWN toward the bottom goal
const MIDFIELD = { x: 50, y: 48 };

interface PitchSpot {
  slot: FormationSlot;
  band: Band;
  number: number;
  name: string | null;
  isGK: boolean;
  cardId?: number;
  isStar?: boolean;
  // ISSUE 2 — inline player info read straight off the Card.
  rating?: number;        // power, shown on the token
  archetype?: string;     // role hint (short code)
  fitness?: number;       // 1–6 dynamic condition
  injured?: boolean;
  lowFitness?: boolean;   // fitness ≤ 2.5 (engine's injury-risk threshold)
}

// Compact archetype code for the token (keeps a 390-wide pitch legible).
const ARCHETYPE_CODE: Record<string, string> = {
  Striker: 'ST', Target: 'TG', Powerhouse: 'PW', Dribbler: 'DR', Sprinter: 'SP',
  Creator: 'CR', Controller: 'CT', Passer: 'PS', Engine: 'EN', Commander: 'CM',
  Destroyer: 'DS', Cover: 'CV', GK: 'GK',
};
const archCode = (archetype?: string) =>
  archetype ? ARCHETYPE_CODE[archetype] ?? archetype.slice(0, 2).toUpperCase() : null;

const LOW_FITNESS = 2.5; // matches the engine's injury-risk threshold (advanceIncrement)

function numberSlots(slots: FormationSlot[]): Map<number, number> {
  const map = new Map<number, number>();
  const gkIdx = slots.findIndex((s) => s.type === 'GK');
  if (gkIdx !== -1) map.set(gkIdx, 1);
  slots.map((s, i) => ({ s, i })).filter((e) => e.i !== gkIdx)
    .sort((a, b) => b.s.y - a.s.y || a.s.x - b.s.x).forEach((e, n) => map.set(e.i, n + 2));
  return map;
}

function yourPitch(matchState: MatchV5State, formation: Formation): PitchSpot[] {
  const nums = numberSlots(formation.slots);
  return formation.slots.map((slot, i) => {
    const card = matchState.xi[i] ?? null;
    const band = bandOf(cellOf(slot.x, slot.y));
    const isGK = slot.type === 'GK' || card?.position === 'GK';
    const fitness = card?.fitness;
    return {
      slot, band, number: nums.get(i) ?? i + 1,
      name: card ? lastName(card.name) : null, isGK, cardId: card?.id,
      rating: card ? Math.round(card.power) : undefined,
      archetype: card?.archetype,
      fitness,
      injured: card?.injured,
      lowFitness: typeof fitness === 'number' && fitness <= LOW_FITNESS,
    };
  });
}

// ISSUE 1 — the opponent pitch is now the REAL positioned XI: opponentXI[i] fills
// opponentFormation.slots[i] (the engine guarantees slot alignment). All 11 show real
// surnames + ratings; the ★ DANGER marker maps to the highest-power card (deterministic).
function rivalPitch(matchState: MatchV5State): PitchSpot[] {
  const { opponentXI, opponentFormation } = matchState;
  const nums = numberSlots(opponentFormation.slots);
  let starId = -1;
  let starPower = -Infinity;
  for (const c of opponentXI) {
    if (c && c.power > starPower) { starPower = c.power; starId = c.id; }
  }
  return opponentFormation.slots.map((slot, i) => {
    const card = opponentXI[i] ?? null;
    const isGK = slot.type === 'GK' || card?.position === 'GK';
    return {
      slot, band: bandOf(cellOf(slot.x, slot.y)),
      number: nums.get(i) ?? i + 1,
      name: card ? lastName(card.name) : null, isGK, cardId: card?.id,
      isStar: !!card && card.id === starId && !isGK,
      rating: card ? Math.round(card.power) : undefined,
      archetype: card?.archetype,
    };
  });
}

// ---------------------------------------------------------------------------
// Event-driven possession timeline
//
// The animation is built ENTIRELY from the engine's IncrementResult — the same
// numbers that decide the score. Each beat reflects a real possession:
//   • goal  → ball runs the shot's lane, net shakes, goalmouth flares, GOAL erupts.
//   • shot  → ball runs the lane, then a muted SAVED / OFF-TARGET flash (by xG).
//   • idle  → a grey fizzle in midfield: a possession that went nowhere.
// Distinct outcomes look distinct; the sequence ends on the increment's tally.
// Pure + deterministic (no RNG), so a given increment always animates the same.
// ---------------------------------------------------------------------------

type BeatKind = 'goal' | 'save' | 'miss' | 'idle';
interface Beat {
  side: 'you' | 'opp';
  kind: BeatKind;
  lane: Lane;
  xg: number;
  label: string;
  // ISSUE 3 — the engine commentary line for THIS exact shot (null for idle build-up),
  // so the animated zone and the surfaced text always describe the same event.
  source: MatchBeat | null;
}

const SAVE_XG = 0.22; // a missed shot above this read as a goalkeeper's save, else off target

// The engine emits one MatchBeat per shot in the SAME order buildTimeline walks the
// shots (your shots, then the opponent's, in shot order, classified by the same 0.22
// threshold). So we can hand each animated shot beat its source commentary line by
// position before any reordering — keeping text, zone and animation 1:1.
function buildTimeline(result: IncrementResult): Beat[] {
  const beats: Beat[] = [];
  const sourceBeats = result.beats ?? [];
  let srcIdx = 0;
  const make = (side: 'you' | 'opp', shots: typeof result.yourShots) => {
    for (const s of shots) {
      const source = sourceBeats[srcIdx] ?? null;
      srcIdx += 1;
      if (s.goal) beats.push({ side, kind: 'goal', lane: s.lane, xg: s.xg, label: 'GOAL!', source });
      else if (s.xg >= SAVE_XG) beats.push({ side, kind: 'save', lane: s.lane, xg: s.xg, label: side === 'you' ? 'SAVED' : 'SAVED!', source });
      else beats.push({ side, kind: 'miss', lane: s.lane, xg: s.xg, label: 'OFF TARGET', source });
    }
  };
  make('you', result.yourShots);
  make('opp', result.opponentShots);

  // A couple of "nothing" possessions so wasted control reads as muted, not absent.
  // Capped so the period stays snappy; goals/shots are never dropped.
  const yourIdle = Math.max(0, result.yourPossessions - result.yourShots.length);
  const oppIdle = Math.max(0, result.opponentPossessions - result.opponentShots.length);
  const idleBeats: Beat[] = [];
  if (yourIdle > 0) idleBeats.push({ side: 'you', kind: 'idle', lane: 'C', xg: 0, label: '', source: null });
  if (oppIdle > 0) idleBeats.push({ side: 'opp', kind: 'idle', lane: 'C', xg: 0, label: '', source: null });

  // Order: lead with a beat of build-up (idle) for tempo, then the meaningful
  // shots in the engine's order, ending on the decisive ones. Deterministic.
  const shotsBeats = beats;
  const ordered: Beat[] = [];
  if (idleBeats[0]) ordered.push(idleBeats[0]);
  // Interleave shots so both sides' moments are visible, goals last within each run.
  const nonGoal = shotsBeats.filter((b) => b.kind !== 'goal');
  const goals = shotsBeats.filter((b) => b.kind === 'goal');
  ordered.push(...nonGoal);
  if (idleBeats[1] && ordered.length < 3) ordered.push(idleBeats[1]);
  ordered.push(...goals);

  // If literally nothing happened, still show one quiet possession so the period
  // never feels frozen.
  if (ordered.length === 0) ordered.push({ side: 'you', kind: 'idle', lane: 'C', xg: 0, label: '', source: null });
  return ordered.slice(0, 6);
}

// Beat pacing (ms): travel for shots, a touch quicker for idle build-up.
const BEAT_MS: Record<BeatKind, number> = { goal: 1500, save: 900, miss: 850, idle: 650 };

// Optional slow-motion multiplier — only ever set by the headless verification
// harness so each beat is long enough to screenshot. Never set in product.
function animScale(): number {
  if (typeof window === 'undefined') return 1;
  const w = window as unknown as { __KC_ANIM_SCALE__?: number };
  return typeof w.__KC_ANIM_SCALE__ === 'number' && w.__KC_ANIM_SCALE__ > 0 ? w.__KC_ANIM_SCALE__ : 1;
}

// ---------------------------------------------------------------------------
// PossessionClock — the event-driven beat sequencer (ISSUE 7).
//
// A self-contained, KEYED-per-increment unit: the parent renders one of these
// keyed by the increment identity, so every resolution gets a fresh instance
// with a clean lifecycle (no stale closures, no dropped timers, no re-arm bugs).
// It owns no UI — it just runs the clock and reports the live beat + running
// score + completion up to the parent via stable callbacks.
// ---------------------------------------------------------------------------

interface PossessionClockProps {
  timeline: Beat[];
  baseYou: number;
  baseOpp: number;
  onState: (beatIdx: number, you: number, opp: number, shake: 'you' | 'opp' | null) => void;
  onDone: () => void;
}

function PossessionClock({ timeline, baseYou, baseOpp, onState, onDone }: PossessionClockProps) {
  // Stable refs to the latest callbacks so the run-once effect never restarts.
  const cb = useRef({ onState, onDone });
  cb.current = { onState, onDone };

  useEffect(() => {
    const scale = animScale();
    const durs = timeline.map((b) => BEAT_MS[b.kind] * scale);
    let you = baseYou;
    let opp = baseOpp;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;

    cb.current.onState(0, you, opp, null);
    timeline.forEach((b, i) => {
      const d = durs[i];
      if (b.kind === 'goal') {
        timers.push(setTimeout(() => {
          if (b.side === 'you') you += 1; else opp += 1;
          cb.current.onState(i, you, opp, b.side);
          timers.push(setTimeout(() => cb.current.onState(i, you, opp, null), 560));
        }, t + d * 0.35));
      }
      // Enter beat i (idle/shot reveal) at its start.
      timers.push(setTimeout(() => cb.current.onState(i, you, opp, null), t));
      t += d;
    });
    timers.push(setTimeout(() => { cb.current.onState(timeline.length, you, opp, null); cb.current.onDone(); }, t));

    return () => timers.forEach(clearTimeout);
    // Run exactly once per mount; the parent remounts via `key` for each increment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function PitchMatchView({
  matchState, formation, jokers, tacticSlots, availableTactics, ownedFormations,
  opponentBuild, nextMinute, mode, currentResult,
  onToggleTactic, onSub, onReassign, onFormationChange, onContinue,
}: PitchMatchViewProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [oppView, setOppView] = useState(false);
  const [tickerOpen, setTickerOpen] = useState(false);
  const [formSheet, setFormSheet] = useState(false);
  const [modal, setModal] = useState<GameCardModel | null>(null);

  // Pointer drag: a tap inspects, a drag moves. We track movement to disambiguate.
  const [drag, setDrag] = useState<{ kind: 'bench' | 'pitch'; id: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<number | null>(null);
  const pointerRef = useRef<{ id: number; kind: 'bench' | 'pitch'; startX: number; startY: number; moved: boolean } | null>(null);
  const pitchRef = useRef<HTMLDivElement | null>(null);

  // Resolve animation — driven by the keyed PossessionClock child below.
  const [beatIdx, setBeatIdx] = useState(-1);
  const [animGoals, setAnimGoals] = useState<{ you: number; opp: number } | null>(null);
  const [shake, setShake] = useState<'you' | 'opp' | null>(null);
  const [resolveDone, setResolveDone] = useState(false);

  const { bench, yourGoals, opponentGoals, xi, subsRemaining } = matchState;

  // ISSUE 1 — average opposition strength is the mean POWER of the REAL opponent XI
  // (matchState.opponentXI, 60–99 scale), not the hand-authored 5-player build. This
  // fixes the scale bug (was reading ~30–40) so it sits comparable to your ratings.
  const oppStrength = useMemo(() => {
    const xs = matchState.opponentXI;
    if (!xs.length) return 0;
    return Math.round(xs.reduce((s, c) => s + c.power, 0) / xs.length);
  }, [matchState.opponentXI]);

  // Team identity prefers the live engine style, falling back to the build's label.
  const oppStyleLabel = matchState.opponentStyle || opponentBuild.style;

  const youSpots = useMemo(() => yourPitch(matchState, formation), [matchState, formation]);
  const rivalSpots = useMemo(() => rivalPitch(matchState), [matchState]);
  const spots = oppView ? rivalSpots : youSpots;

  // ISSUE 7 — the timeline comes from the real increment data.
  const timeline = useMemo(() => (currentResult ? buildTimeline(currentResult) : []), [currentResult]);
  const beat = beatIdx >= 0 && beatIdx < timeline.length ? timeline[beatIdx] : null;

  // Reset the playhead when we leave resolve mode (back to planning).
  useEffect(() => {
    if (mode === 'resolve') return;
    const r = setTimeout(() => { setBeatIdx(-1); setAnimGoals(null); setShake(null); setResolveDone(false); }, 0);
    return () => clearTimeout(r);
  }, [mode]);

  const resolving = mode === 'resolve';
  const sequenceDone = resolving && (resolveDone || (timeline.length > 0 && beatIdx >= timeline.length));

  // The live animated beat's source commentary (null for build-up beats).
  const liveSource = beat?.source ?? null;

  // ISSUE 3 — the MATCH LOG is the full per-shot beats history: every played
  // increment's beats, then the live increment's beats so far (up to the current
  // playhead, so the log fills in lockstep with the animation). Newest-first.
  type FeedLine = { minute: number; text: string; type: 'goal-yours' | 'goal-opponent' | 'chance'; scorer: string | null; side: 'you' | 'opp' };
  const beatToLine = (b: MatchBeat): FeedLine => ({
    minute: b.minute,
    text: b.text,
    type: b.outcome === 'goal' ? (b.side === 'you' ? 'goal-yours' : 'goal-opponent') : 'chance',
    scorer: b.scorerName,
    side: b.side,
  });

  const feed = useMemo(() => {
    const lines: FeedLine[] = [];
    for (const r of matchState.scores) for (const b of r.beats ?? []) lines.push(beatToLine(b));
    if (resolving && currentResult) {
      // Reveal each beat in the timeline's order, up to the current playhead, so the
      // log and the pitch animation stay in sync (build-up beats carry no line).
      const upTo = Math.max(0, Math.min(beatIdx + 1, timeline.length));
      for (let i = 0; i < upTo; i++) {
        const src = timeline[i]?.source;
        if (src) lines.push(beatToLine(src));
      }
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchState.scores, resolving, currentResult, beatIdx, timeline]);

  // ISSUE 6 — sensible pre-kickoff guidance (no fake minute, styled as a coach prompt).
  const preKickoff = feed.length === 0 && !resolving;

  // The 3-line ticker: live commentary leads while resolving (the synced line, coloured
  // by side); otherwise the most recent played lines. Deterministic — all from beats[].
  const tickerLines: (FeedLine | null)[] = feed.slice(-3);
  while (tickerLines.length < 3) tickerLines.unshift(null);

  const manager = jokers[0] ?? null;
  const deployedIds = new Set(tacticSlots.slots.filter(Boolean).map((t) => t!.id));
  const badge = opponentBuild.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'OPP';
  // ISSUE 3 — colour lines by side to match the on-pitch zone colours: you = green,
  // opp = red. Goals brighten; routine chances stay in the side tint, muted.
  const lineColour = (l: FeedLine) =>
    l.type === 'goal-yours' ? 'var(--success)'
      : l.type === 'goal-opponent' ? 'var(--danger)'
        : l.side === 'you' ? 'var(--success)' : 'var(--danger)';

  // ISSUE 4 — contextual planning prompts tied to REAL signals (planning only).
  const planning = mode === 'plan' && !oppView;
  const flaggedPlayer = useMemo(() => {
    if (!planning) return null;
    // Prefer an injured starter, else the lowest-fitness starter at/under the threshold.
    let injuredSpot: PitchSpot | null = null;
    let tiredSpot: PitchSpot | null = null;
    let tiredVal = Infinity;
    for (const s of youSpots) {
      if (s.cardId === undefined) continue;
      if (s.injured && !injuredSpot) injuredSpot = s;
      if (s.lowFitness && (s.fitness ?? 6) < tiredVal) { tiredVal = s.fitness ?? 6; tiredSpot = s; }
    }
    return injuredSpot ?? tiredSpot;
  }, [planning, youSpots]);
  const canSubFlag = !!flaggedPlayer && subsRemaining > 0 && (flaggedPlayer.injured || !matchState.isFirstHalf);
  const showSubPrompt = planning && canSubFlag && bench.length > 0;

  const emptyTacticSlots = tacticSlots.slots.filter((s) => s === null).length;
  const hasUndeployedTactic = availableTactics.some((t) => !deployedIds.has(t.id));
  const showTacticPrompt = planning && emptyTacticSlots > 0 && hasUndeployedTactic;
  // `drag` is only set once movement crosses the threshold, so its presence
  // already means a real drag is underway (taps never set it).
  const moving = !oppView && mode === 'plan' && drag !== null;

  const displayGoals = animGoals ?? { you: yourGoals, opp: opponentGoals };

  // Receives the live beat + running score from the keyed PossessionClock.
  const handleClockState = (idx: number, you: number, opp: number, sh: 'you' | 'opp' | null) => {
    setBeatIdx(idx);
    setAnimGoals({ you, opp });
    setShake(sh);
  };
  const handleClockDone = () => setResolveDone(true);

  // ---- pointer drag/inspect on a player token --------------------------------
  const inspectCard = (cardId: number | undefined) => {
    if (cardId === undefined) return;
    const c = xi.find((p) => p.id === cardId);
    if (c) setModal({ variant: 'player', card: c as Card });
  };

  const beginPointer = (kind: 'bench' | 'pitch', id: number, e: React.PointerEvent) => {
    if (mode !== 'plan' || oppView) return;
    pointerRef.current = { id, kind, startX: e.clientX, startY: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const movePointer = (e: React.PointerEvent) => {
    const p = pointerRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.moved && Math.hypot(dx, dy) > 8) {
      p.moved = true;
      setDrag({ kind: p.kind, id: p.id });
    }
    if (p.moved) {
      const rect = pitchRef.current?.getBoundingClientRect();
      if (rect) {
        setDragPos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
        // Find the nearest pitch player under the pointer for highlight.
        let best: number | null = null; let bestD = Infinity;
        for (const s of youSpots) {
          if (s.cardId === undefined || s.isGK || s.cardId === p.id) continue;
          const sx = rect.left + (s.slot.x / 100) * rect.width;
          const sy = rect.top + (s.slot.y / 100) * rect.height;
          const d = Math.hypot(e.clientX - sx, e.clientY - sy);
          if (d < bestD && d < 60) { bestD = d; best = s.cardId; }
        }
        setHoverTargetId(best);
      }
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p) return;
    if (!p.moved) {
      // A tap → inspect (pitch players are full cards; bench too).
      const card = (p.kind === 'pitch' ? xi : bench).find((c) => c.id === p.id);
      if (card) setModal({ variant: 'player', card: card as Card });
    } else if (hoverTargetId !== null) {
      // ISSUE 4 — a drag onto a player: bench → sub in; pitch → swap slots.
      if (p.kind === 'bench') onSub(hoverTargetId, p.id);
      else if (p.id !== hoverTargetId) onReassign(p.id, hoverTargetId);
    }
    setDrag(null); setDragPos(null); setHoverTargetId(null);
    e.stopPropagation();
  };

  const dragCard = drag ? (drag.kind === 'pitch' ? xi : bench).find((c) => c.id === drag.id) ?? null : null;
  const dragSpot = drag?.kind === 'pitch' ? youSpots.find((s) => s.cardId === drag.id) : null;

  // ---- resolve: where the ball travels (lane × target goalmouth) ------------
  const ballLaneX = beat ? LANE_X[beat.lane] : 50;
  const targetGoalY = beat ? (beat.side === 'you' ? YOUR_GOAL_Y : OPP_GOAL_Y) : 50;
  // Slow-mo (verification only) also stretches the marker CSS animations so the
  // ball / flash / eruption stay on screen long enough to capture. 1× in product.
  const aScale = animScale();
  const dur = (ms: number) => (aScale === 1 ? undefined : `${Math.round(ms * aScale)}ms`);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
      onPointerMove={drag ? movePointer : undefined}
      onPointerUp={drag ? endPointer : undefined}
    >
      {/* The event-driven possession clock — keyed per increment so each
          resolution gets a clean lifecycle (ISSUE 7). Renders nothing itself. */}
      {resolving && currentResult && (
        <PossessionClock
          key={matchState.currentIncrement}
          timeline={timeline}
          baseYou={yourGoals}
          baseOpp={opponentGoals}
          onState={handleClockState}
          onDone={handleClockDone}
        />
      )}

      {/* Header — opponent identity + average strength, the live score, view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 16px 8px', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(160deg, var(--kit-red), #9e1f1a)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 11, color: 'var(--line-white)', flexShrink: 0 }}>{badge}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opponentBuild.name}</span>
              {/* Team identity — live engine style (falls back to the build label). */}
              <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--cream-soft)', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 4px', lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>{oppStyleLabel.toUpperCase()}</span>
            </div>
            {/* ISSUE 1 — clear average opposition strength badge (real XI mean power) */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '2px 4px', lineHeight: 1 }}>AVG</span>
              <span style={{ fontSize: 11, color: 'var(--dust)' }}>OPP STRENGTH <b style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--line-white)' }}>{oppStrength}</b></span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: PIXEL, fontSize: 22, lineHeight: 1, color: 'var(--line-white)', display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <span className={shake === 'you' ? 'score-tick' : undefined} style={{ display: 'inline-block', color: shake === 'you' ? 'var(--success)' : 'var(--line-white)' }}>{displayGoals.you}</span>
            <span style={{ color: 'var(--dust)' }}>–</span>
            <span className={shake === 'opp' ? 'score-tick' : undefined} style={{ display: 'inline-block', color: shake === 'opp' ? 'var(--danger)' : 'var(--line-white)' }}>{displayGoals.opp}</span>
          </div>
          <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)', marginTop: 4 }}>{String(nextMinute).padStart(2, '0')}:00</div>
        </div>
      </div>

      {/* Ticker — three lines, tap to expand. Pre-kickoff shows a coach prompt. */}
      <button onClick={() => setTickerOpen(true)} style={{ textAlign: 'left', margin: '0 16px 10px', padding: '8px 12px', borderRadius: 'var(--radius)', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', flexShrink: 0, cursor: 'pointer', display: 'grid', gap: 2 }}>
        {preKickoff ? (
          // ISSUE 6 — guidance, not a fake match event (no minute stamp).
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 51 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--ink-black)', background: 'var(--amber)', borderRadius: 3, padding: '3px 5px', lineHeight: 1, flexShrink: 0 }}>COACH</span>
            <span style={{ fontSize: 12, color: 'var(--cream-soft)', lineHeight: 1.35 }}>Set your XI and shape, then kick off. Drag a player to swap; tap to inspect.</span>
          </div>
        ) : (
          tickerLines.map((e, i) => {
            // The bottom line is the live/most-recent; pulse it while resolving so the
            // text reads as the very event animating on the pitch.
            const isLive = resolving && i === 2 && !!liveSource && e?.text === liveSource.text;
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, height: 17, lineHeight: '17px', color: e ? lineColour(e) : 'transparent', opacity: e ? (isLive ? 1 : 0.5 + (i / 2) * 0.45) : 1, transition: 'opacity 160ms' }}>
                <span style={{ color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, visibility: e ? 'visible' : 'hidden' }}>{e ? `${String(e.minute).padStart(2, '0')}:00` : '00:00'}</span>
                {e && <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: e.side === 'you' ? 'var(--success)' : 'var(--danger)' }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: e && e.type !== 'chance' ? 800 : 400 }}>{e ? e.text : ''}</span>
              </div>
            );
          })
        )}
      </button>

      {/* Pitch */}
      <div ref={pitchRef} style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 16px', borderRadius: 'var(--radius-lg)', border: '2px solid var(--ink-black)', background: oppView
        ? 'repeating-linear-gradient(180deg, rgba(158,31,26,0.16) 0px, rgba(158,31,26,0.16) 26px, rgba(158,31,26,0.10) 26px, rgba(158,31,26,0.10) 52px)'
        : 'repeating-linear-gradient(180deg, rgba(31,157,79,0.16) 0px, rgba(31,157,79,0.16) 26px, rgba(31,157,79,0.10) 26px, rgba(31,157,79,0.10) 52px)', boxShadow: '0 3px 0 0 var(--ink-black)', overflow: 'hidden', touchAction: 'none' }}>
        {/* Pitch markings */}
        <div style={{ position: 'absolute', left: 10, right: 10, top: '50%', height: 1, borderTop: `1px dashed ${LINE}` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 84, height: 84, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid ${LINE}` }} />
        {/* Goals (top = the goal your XI attacks; bottom = your own goal the opponent attacks) */}
        <div className={shake === (oppView ? 'opp' : 'you') ? 'net-shake' : undefined} style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: 78, height: 14, borderRadius: '0 0 6px 6px', border: `2px solid ${LINE}`, borderTop: 'none', background: 'repeating-linear-gradient(90deg, rgba(242,246,239,0.10) 0 3px, transparent 3px 6px)' }} />
        <div className={shake === (oppView ? 'you' : 'opp') ? 'net-shake' : undefined} style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: 78, height: 14, borderRadius: '6px 6px 0 0', border: `2px solid ${LINE}`, borderBottom: 'none', background: 'repeating-linear-gradient(90deg, rgba(242,246,239,0.10) 0 3px, transparent 3px 6px)' }} />

        {/* Players */}
        {spots.map((spot, i) => {
          if (!oppView && !spot.cardId) return null;
          const attacking = !oppView && (spot.band === 'ATT' || spot.band === 'MID') && !spot.isGK;
          const spearhead = attacking && spot.band === 'ATT';
          const isDropTarget = moving && !spot.isGK && spot.cardId !== undefined && spot.cardId !== drag?.id;
          const isHover = isDropTarget && hoverTargetId === spot.cardId;
          const isDragging = drag?.kind === 'pitch' && drag.id === spot.cardId;
          // During resolve, the carrier glows on the side that's currently attacking.
          const carrier = resolving && beat && ((beat.side === 'you' && !oppView && spearhead) || (beat.side === 'opp' && oppView && spot.band === 'ATT'));
          const base = oppView
            ? (spot.isGK ? 'linear-gradient(160deg, #5a6b5f, #36433a)' : 'linear-gradient(160deg, var(--kit-red), #9e1f1a)')
            : (spot.isGK ? 'linear-gradient(160deg, #5a6b5f, #36433a)' : spearhead ? 'linear-gradient(160deg, #4a93f0, var(--kit-blue))' : 'linear-gradient(160deg, var(--kit-blue), #1f5bb0)');
          // ISSUE 4 — the player the sub prompt points at gets a pulsing amber ring.
          const isFlagged = !oppView && showSubPrompt && spot.cardId !== undefined && spot.cardId === flaggedPlayer?.cardId;
          // ISSUE 2 — fitness/injury status drives a clear corner indicator (yours only).
          const condition: 'injured' | 'tired' | null = !oppView
            ? (spot.injured ? 'injured' : spot.lowFitness ? 'tired' : null)
            : null;
          const ring = isHover ? '2px solid var(--gold)'
            : isDropTarget ? '2px dashed var(--gold)'
            : isFlagged ? '2px solid var(--amber)'
            : condition === 'injured' ? '2px solid var(--danger)'
            : spearhead ? '2px solid var(--gold)'
            : spot.isStar ? '2px solid var(--gold)'
            : spot.isGK ? '2px solid var(--ink-black)'
            : '2px solid var(--ink-black)';
          const code = archCode(spot.archetype);
          return (
            <div key={`${oppView ? 'o' : 'y'}-${i}`} className="move-pop"
              style={{ position: 'absolute', left: `${spot.slot.x}%`, top: `${spot.slot.y}%`, transform: 'translate(-50%,-50%)', display: 'grid', justifyItems: 'center', gap: 2, width: 60, zIndex: isHover || carrier || isFlagged ? 6 : attacking ? 4 : 3, opacity: isDragging ? 0.3 : 1 }}>
              <button
                className={isFlagged ? 'carrier-glow' : carrier ? 'carrier-glow' : undefined}
                onPointerDown={(e) => beginPointer('pitch', spot.cardId!, e)}
                onPointerMove={drag ? undefined : movePointer}
                onPointerUp={drag ? undefined : endPointer}
                disabled={oppView || mode !== 'plan' || spot.cardId === undefined}
                onClick={() => { if (oppView && spot.cardId === undefined) return; }}
                style={{
                  position: 'relative',
                  width: 40, height: 40, borderRadius: '50%', padding: 0,
                  cursor: oppView ? 'default' : 'grab', touchAction: 'none',
                  transition: 'box-shadow 160ms, transform 160ms', transform: isHover ? 'scale(1.14)' : 'scale(1)',
                  background: base, border: ring,
                  color: 'var(--line-white)', fontFamily: PIXEL, fontSize: spot.isGK ? 8 : 12,
                  boxShadow: spearhead || spot.isStar ? '0 2px 0 0 var(--ink-black), 0 0 0 3px var(--gold-glow)' : '0 2px 0 0 var(--ink-black)',
                }}>
                {spot.isGK ? 'GK' : spot.number}
                {/* ISSUE 2 — rating chip on the token: the basics without a tap. */}
                {spot.rating !== undefined && (
                  <span style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, color: 'var(--line-white)', background: oppView ? '#7a1410' : '#0c2238', border: '1px solid var(--ink-black)', borderRadius: 3, padding: '1px 3px', minWidth: 16, textAlign: 'center', zIndex: 2 }}>{spot.rating}</span>
                )}
                {/* ISSUE 2 — fitness / injury flag, top-left corner. */}
                {condition && (
                  <span aria-label={condition === 'injured' ? 'Injured' : 'Low fitness'}
                    style={{ position: 'absolute', top: -5, left: -5, width: 15, height: 15, borderRadius: '50%', background: condition === 'injured' ? 'var(--danger)' : 'var(--amber)', border: '1.5px solid var(--ink-black)', color: condition === 'injured' ? 'var(--line-white)' : 'var(--ink-black)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>{condition === 'injured' ? '+' : '!'}</span>
                )}
              </button>
              {spot.name && <span style={{ marginTop: 4, fontSize: 8.5, fontWeight: 700, color: oppView ? '#fca5a5' : spearhead ? 'var(--gold)' : 'var(--cream-soft)', textShadow: '0 1px 2px var(--ink-black)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spot.name}</span>}
              {/* ISSUE 2 — archetype/role hint (compact code), kept subtle so the pitch stays clean. */}
              {code && !spot.isGK && <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.3, color: 'var(--dust)', lineHeight: 1 }}>{code}</span>}
              {oppView && spot.isStar && <span style={{ position: 'absolute', top: -15, fontFamily: PIXEL, fontSize: 7.5, color: 'var(--ink-black)', background: 'var(--gold)', padding: '2px 5px', borderRadius: 3, whiteSpace: 'nowrap', zIndex: 4 }}>{'★'} DANGER</span>}
              {/* ISSUE 3 — inspect pip on EVERY token in plan mode, GK included. */}
              {!oppView && mode === 'plan' && spot.cardId !== undefined && (
                <span role="button" aria-label="Inspect player"
                  onPointerDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); inspectCard(spot.cardId); }}
                  style={{ position: 'absolute', top: -6, right: 2, width: 17, height: 17, borderRadius: '50%', background: 'var(--ink-black)', border: '1.5px solid var(--line-white)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 9, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 9 }}>i</span>
              )}
            </div>
          );
        })}

        {/* ---- Possession ball / shot / fizzle (event-driven) ---- */}
        {resolving && beat && beat.kind !== 'idle' && (
          <>
            {/* Lane glow showing where the move is going */}
            <div key={`lane-${beatIdx}`} className="lane-sweep" style={{ position: 'absolute', left: `${LANE_X[beat.lane] - 11}%`, width: '22%', top: beat.side === 'you' ? '6%' : '46%', height: '48%', background: `linear-gradient(${beat.side === 'you' ? '0deg' : '180deg'}, ${beat.side === 'you' ? 'var(--kit-blue)' : 'var(--kit-red)'}, transparent)`, opacity: 0.18, pointerEvents: 'none', zIndex: 2, animationDuration: dur(600) }} />
            {/* The ball streaks down the lane to the target goal */}
            <div key={`ball-${beatIdx}`} className="shot-kick" style={{ position: 'absolute', left: `${ballLaneX}%`, top: `${targetGoalY}%`, width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, var(--line-white), #b9c4ba)', boxShadow: '0 0 10px rgba(242,246,239,0.85), 0 2px 0 0 var(--ink-black)', transform: 'translate(-50%,-50%)', zIndex: 8, pointerEvents: 'none', animationDuration: dur(280) }} />
            {/* Outcome marker at the goalmouth */}
            {beat.kind === 'goal' && (
              <div key={`flash-${beatIdx}`} className="goal-flash" style={{ position: 'absolute', left: '50%', top: `${targetGoalY}%`, width: 120, height: 60, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, ${beat.side === 'you' ? 'var(--success)' : 'var(--danger)'}, transparent 70%)`, zIndex: 7, pointerEvents: 'none', animationDuration: dur(700) }} />
            )}
            {(beat.kind === 'save' || beat.kind === 'miss') && (
              <div key={`miss-${beatIdx}`} className="shot-miss" style={{ position: 'absolute', left: `${ballLaneX}%`, top: `${targetGoalY + (beat.side === 'you' ? 4 : -4)}%`, transform: 'translate(-50%,-50%)', fontFamily: PIXEL, fontSize: 10, color: 'var(--cream-soft)', background: 'rgba(7,16,11,0.85)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px', zIndex: 9, pointerEvents: 'none', whiteSpace: 'nowrap', animationDuration: dur(620) }}>{beat.label}</div>
            )}
          </>
        )}

        {/* A wasted possession: muted grey fizzle in midfield */}
        {resolving && beat && beat.kind === 'idle' && (
          <div key={`idle-${beatIdx}`} className="possession-fizzle" style={{ position: 'absolute', left: `${MIDFIELD.x}%`, top: `${MIDFIELD.y + (beat.side === 'you' ? -6 : 6)}%`, transform: 'translate(-50%,-50%)', display: 'grid', justifyItems: 'center', gap: 3, zIndex: 6, pointerEvents: 'none', animationDuration: dur(500) }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'rgba(136,160,140,0.6)', boxShadow: '0 0 6px rgba(136,160,140,0.4)' }} />
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)' }}>{beat.side === 'you' ? 'BUILD-UP' : 'THEY PROBE'}</span>
          </div>
        )}

        {/* GOAL / CONCEDED eruption (driven by the goal beat) */}
        {resolving && beat && beat.kind === 'goal' && (
          <div key={`erupt-${beatIdx}`} className="goal-erupt" style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 10, pointerEvents: 'none', fontFamily: PIXEL, fontSize: beat.side === 'you' ? 40 : 34, color: beat.side === 'you' ? 'var(--success)' : 'var(--danger)', textShadow: '0 3px 0 var(--ink-black)', whiteSpace: 'nowrap', animationDuration: dur(1450) }}>
            {beat.side === 'you' ? 'GOAL!' : 'CONCEDED'}
          </div>
        )}

        {/* Opponent intel strip while viewing the opposition (real shape + scouting). */}
        {oppView && (<>
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 7, fontFamily: PIXEL, fontSize: 8, color: 'var(--cream)', background: 'rgba(7,16,11,0.7)', border: '1px solid var(--border)', padding: '4px 7px', borderRadius: 'var(--radius-sm)' }}>{oppStyleLabel} · {matchState.opponentFormation.name}</div>
          <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 7, fontSize: 10, color: 'var(--cream-soft)', background: 'rgba(7,16,11,0.75)', border: '1px solid var(--border)', padding: '7px 10px', borderRadius: 'var(--radius)', lineHeight: 1.4 }}>
            <b style={{ color: 'var(--success)', fontFamily: PIXEL, fontSize: 9 }}>SOFT SPOT</b> &nbsp;{opponentBuild.weakness.toLowerCase()} — {opponentBuild.starAbility.toLowerCase()}.
          </div>
        </>)}

        {/* Side rail — SHAPE (the ONE formation control, issue 5) + TACTICS */}
        {!oppView && mode === 'plan' && (
          <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
            <button onClick={() => setFormSheet(true)} style={{ writingMode: 'vertical-rl', padding: '12px 6px', borderRadius: 'var(--radius) 0 0 var(--radius)', border: '2px solid var(--ink-black)', borderRight: 'none', background: 'var(--kit-blue)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 1, cursor: 'pointer' }}>SHAPE · {formation.name}</button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setTrayOpen(true)} className={showTacticPrompt ? 'carrier-glow' : undefined} style={{ writingMode: 'vertical-rl', padding: '12px 6px', borderRadius: 'var(--radius) 0 0 var(--radius)', border: `2px solid ${showTacticPrompt ? 'var(--gold)' : 'var(--ink-black)'}`, borderRight: 'none', background: 'var(--amber)', color: 'var(--ink-black)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 1, cursor: 'pointer' }}>TACTICS</button>
              {/* ISSUE 4 — deploy-a-tactic prompt: only when slots are free AND cards undeployed. */}
              {showTacticPrompt && (
                <span aria-hidden style={{ position: 'absolute', top: -6, left: -6, width: 16, height: 16, borderRadius: '50%', background: 'var(--gold)', border: '1.5px solid var(--ink-black)', color: 'var(--ink-black)', fontFamily: PIXEL, fontSize: 9, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>{emptyTacticSlots}</span>
              )}
            </div>
          </div>
        )}

        {/* ISSUE 4 — "Deploy a tactic?" pill, anchored to the TACTICS rail, with the
            reason. Sits at the lower-right edge so it never covers central players. */}
        {showTacticPrompt && (
          <button onClick={() => setTrayOpen(true)} style={{ position: 'absolute', right: 38, bottom: 10, zIndex: 6, display: 'flex', alignItems: 'center', gap: 6, maxWidth: 168, background: 'rgba(7,16,11,0.94)', border: '1.5px solid var(--gold)', borderRadius: 'var(--radius)', padding: '6px 9px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 2px 0 0 var(--ink-black)' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>TIP</span>
            <span style={{ fontSize: 10, color: 'var(--cream-soft)', lineHeight: 1.25 }}>Deploy a tactic to exploit <b style={{ color: 'var(--gold)' }}>{opponentBuild.weakness.toLowerCase()}</b>.</span>
          </button>
        )}

        {/* Drag ghost following the finger */}
        {drag && dragPos && dragCard && (
          <div style={{ position: 'absolute', left: `${dragPos.x}%`, top: `${dragPos.y}%`, transform: 'translate(-50%,-50%) scale(1.14)', zIndex: 12, pointerEvents: 'none', display: 'grid', justifyItems: 'center', gap: 2 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(160deg, var(--kit-blue), #1f5bb0)', border: '2px solid var(--gold)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 0 0 var(--ink-black), 0 0 0 4px var(--gold-glow)' }}>{drag.kind === 'pitch' ? dragSpot?.number ?? '?' : '+'}</div>
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--gold)', textShadow: '0 1px 2px var(--ink-black)' }}>{lastName(dragCard.name)}</span>
          </div>
        )}
      </div>

      {/* ISSUE 4 — SUB? prompt: a real injured / low-fitness starter + subs remaining.
          Points at the flagged player (ringed amber above) and the bench below. */}
      {showSubPrompt && flaggedPlayer && !moving && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 16px 0', padding: '6px 10px', flexShrink: 0, background: 'rgba(255,122,31,0.12)', border: '1.5px solid var(--amber)', borderRadius: 'var(--radius)' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--ink-black)', background: 'var(--amber)', borderRadius: 3, padding: '3px 5px', lineHeight: 1, flexShrink: 0 }}>SUB?</span>
          <span style={{ fontSize: 11, color: 'var(--cream-soft)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            <b style={{ color: 'var(--cream)' }}>{flaggedPlayer.name}</b> {flaggedPlayer.injured ? 'is injured' : 'is fading'} — drag a bench player on.
          </span>
        </div>
      )}

      {/* Subs bench — tap to inspect, drag onto a player to sub in */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px 4px', flexShrink: 0, overflow: 'hidden' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 8, color: showSubPrompt ? 'var(--amber)' : 'var(--dust)', flexShrink: 0 }}>SUBS {subsRemaining}</span>
        {bench.slice(0, 7).map((card, i) => {
          const isDragging = drag?.kind === 'bench' && drag.id === card.id;
          return (
            <button key={card.id}
              onPointerDown={(e) => beginPointer('bench', card.id, e)}
              onPointerMove={drag ? undefined : movePointer}
              onPointerUp={drag ? undefined : endPointer}
              disabled={mode !== 'plan' || oppView}
              title={card.name}
              style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: `2px solid ${showSubPrompt ? 'var(--amber)' : 'var(--ink-black)'}`, boxShadow: '0 2px 0 0 var(--ink-black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 10, color: 'var(--cream-soft)', flexShrink: 0, cursor: mode === 'plan' && !oppView ? 'grab' : 'default', touchAction: 'none', opacity: isDragging ? 0.3 : 1 }}>{i + 12}</button>
          );
        })}
        {moving && <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--gold)', marginLeft: 2 }}>→ DROP ON A PLAYER</span>}
      </div>

      {/* Controls — ISSUE 2: clear View Opposition / View Team toggle + advance CTA */}
      <div style={{ display: 'flex', gap: 10, padding: '8px 16px 14px', flexShrink: 0 }}>
        <button onClick={() => setOppView((v) => !v)} style={{ flex: '0 0 104px', padding: '11px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 3px 0 0 var(--ink-black)', background: oppView ? 'var(--surface-raised)' : 'var(--surface)', color: 'var(--cream)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.3, cursor: 'pointer', lineHeight: 1.3 }}>{oppView ? 'VIEW TEAM' : 'VIEW OPP'}</button>
        <button onClick={onContinue} disabled={resolving && !sequenceDone}
          className={resolving ? undefined : 'advance-btn-pulse'}
          style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 4px 0 0 var(--ink-black)', background: resolving && !sequenceDone ? 'var(--surface)' : 'linear-gradient(135deg, var(--amber), var(--amber-soft))', color: resolving && !sequenceDone ? 'var(--dust)' : 'var(--cream)', fontFamily: PIXEL, fontSize: 15, cursor: resolving && !sequenceDone ? 'default' : 'pointer', transition: 'background 200ms, color 200ms' }}>
          {resolving ? (sequenceDone ? 'PLAY ON →' : 'PLAYING…') : 'KICK OFF →'}
        </button>
      </div>

      {/* Match log — the full per-shot beats history (newest first), tagged minute +
          scorer + side (ISSUE 3). */}
      {tickerOpen && (
        <div onClick={() => setTickerOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 22, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }} className="scrim-fade">
          <div onClick={(e) => e.stopPropagation()} className="sheet-rise" style={{ width: '100%', maxHeight: '62%', overflowY: 'auto', overscrollBehavior: 'contain', background: 'var(--felt)', borderTop: '2px solid var(--ink-black)', borderRadius: '16px 16px 0 0', padding: '16px 18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--cream)', letterSpacing: 0.6 }}>MATCH LOG</span>
              <button onClick={() => setTickerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--dust)', fontSize: 18, cursor: 'pointer' }}>{'×'}</button>
            </div>
            {feed.length === 0 ? <div style={{ fontSize: 12, color: 'var(--dust)' }}>Kickoff — no events yet.</div> : feed.slice().reverse().map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, lineHeight: 1.55, color: lineColour(e), padding: '2px 0' }}>
                <span style={{ color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{String(e.minute).padStart(2, '0')}:00</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', alignSelf: 'center', flexShrink: 0, background: e.side === 'you' ? 'var(--success)' : 'var(--danger)' }} />
                <span style={{ flex: 1, fontWeight: e.type !== 'chance' ? 800 : 400 }}>{e.text}</span>
                {e.scorer && e.type !== 'chance' && <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--cream-soft)', flexShrink: 0 }}>{lastName(e.scorer)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formation sheet — the single formation control's surface */}
      {formSheet && (
        <div onClick={() => setFormSheet(false)} style={{ position: 'absolute', inset: 0, zIndex: 21, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }} className="scrim-fade">
          <div onClick={(e) => e.stopPropagation()} className="sheet-rise" style={{ width: '100%', background: 'var(--felt)', borderTop: '2px solid var(--kit-blue)', borderRadius: '16px 16px 0 0', padding: '16px 18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--cream)', letterSpacing: 0.6 }}>SHAPE</span>
              <button onClick={() => setFormSheet(false)} style={{ background: 'none', border: 'none', color: 'var(--dust)', fontSize: 18, cursor: 'pointer' }}>{'×'}</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--dust)', marginBottom: 12, lineHeight: 1.4 }}>Shape sets attack vs defence. Drag players on the pitch to fine-tune.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ownedFormations.map((fid) => {
                const active = formation.id === fid;
                return <button key={fid} onClick={() => { onFormationChange(fid); setFormSheet(false); }} style={{ padding: '9px 14px', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: PIXEL, fontSize: 11, border: '2px solid var(--ink-black)', boxShadow: active ? '0 3px 0 0 var(--ink-black)' : 'none', background: active ? 'var(--kit-blue)' : 'var(--surface)', color: active ? 'var(--line-white)' : 'var(--cream-soft)' }}>{getFormation(fid).name}</button>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tactical shelf */}
      {trayOpen && (
        <div onClick={() => setTrayOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end' }} className="scrim-fade">
          <div onClick={(e) => e.stopPropagation()} className="drawer-slide" style={{ width: '84%', maxWidth: 340, height: '100%', background: 'var(--felt)', borderLeft: '2px solid var(--amber)', padding: '16px 16px 20px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--amber)', letterSpacing: 0.8 }}>TACTICAL SHELF</span>
              <button onClick={() => setTrayOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--dust)', fontSize: 18, cursor: 'pointer' }}>{'×'}</button>
            </div>
            <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8, marginBottom: 6 }}>MANAGER</div>
            <div style={{ borderRadius: 'var(--radius)', padding: '11px 13px', marginBottom: 18, background: 'var(--surface)', border: `2px solid ${manager ? 'var(--gold)' : 'var(--ink-black)'}` }}>
              {manager ? (<>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>{manager.name}</div>
                <div style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 4, lineHeight: 1.4 }}>{manager.effect}</div>
              </>) : <div style={{ fontSize: 11, color: 'var(--dust)' }}>No manager — sign one in the shop.</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8 }}>TACTICAL CARDS</span>
              <span style={{ fontSize: 9, color: 'var(--dust)' }}>{deployedIds.size}/{tacticSlots.slots.length} deployed</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {availableTactics.length === 0 && <div style={{ fontSize: 11, color: 'var(--dust)' }}>No tactical cards drafted for this fixture.</div>}
              {availableTactics.map((tactic) => {
                const active = deployedIds.has(tactic.id);
                return (
                  <button key={tactic.id} onClick={() => onToggleTactic(tactic.id)} style={{ textAlign: 'left', borderRadius: 'var(--radius)', padding: '10px 12px', cursor: 'pointer', background: 'var(--surface)', border: `2px solid ${active ? 'var(--amber)' : 'var(--ink-black)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>{tactic.name}</span>
                      <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: active ? 'var(--amber)' : 'var(--dust)' }}>{active ? 'DEPLOYED' : 'TAP TO DEPLOY'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 3, lineHeight: 1.4 }}>{tactic.effect}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Full-card overlay — tap any player (yours, GK included) to inspect. */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
