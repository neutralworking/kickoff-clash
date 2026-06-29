'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchV5State, IncrementResult, MatchBeat, MatchStats } from '../../lib/match-v5';
import type { Formation, FormationSlot } from '../../lib/formations';
import { getFormation } from '../../lib/formations';
import type { Band, Lane, Cell } from '../../lib/field';
import { cellOf, bandOf } from '../../lib/field';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import { canDeploy, getTacticById } from '../../lib/tactics';
import type { OpponentBuild } from '../../lib/run';
import type { Card } from '../../lib/scoring';
import { subBlockReason, cumulativeStats } from '../../lib/match-v5';
import type { CumulativeStats } from '../../lib/match-v5';
import { coachNotes } from '../../lib/assistant';
import type { CoachNote } from '../../lib/assistant';
import CardModal from '../cards/CardModal';
import type { GameCardModel } from '../cards/GameCard';
import { PIXEL, lastName, POSITION_COLOR, RARITY_COLOR, TACTIC_CAT_COLOR } from '../cards/cardTokens';

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
  /** Which team-talk break this plan screen is: 'kickoff' before the first whistle,
   *  'halftime' after 30', 'between' after 60'/75'. Null while resolving. Drives the
   *  prominence of the team-talk affordances (coach panel, tactics + shape entry). */
  breakMoment: 'kickoff' | 'halftime' | 'between' | null;
  currentResult: IncrementResult | null;
  onToggleTactic: (tacticId: string) => void;
  onSub: (xiCardId: number, benchCardId: number) => void;
  onReassign: (cardA: number, cardB: number) => void;
  onFormationChange: (formationId: string) => void;
  /** Fill the strongest fitness-aware XI from the current XI+bench. Only ever wired
   *  for the pre-kickoff team talk (currentIncrement 0, no periods played) — pulling
   *  bench players on mid-match would be a free sub. */
  onAutoSelect?: () => void;
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
  card?: Card;            // CARDS ON THE PITCH — the full card backs the pixel card face.
  isStar?: boolean;
  // inline player info read straight off the Card.
  rating?: number;        // power, shown on the card
  position?: string;      // position tab
  rarity?: string;        // rarity ring colour
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
// INCREMENT_MINUTES = [15,30,60,75,90] — window END minutes per increment. Index 4
// (90') is full time. Mirrored here (display-only) so the ticking clock can read
// the previous increment's end and the current window's bounds. Kept local so the
// view stays decoupled from the engine module's import surface.
const INCREMENT_MINUTES_LIST = [15, 30, 60, 75, 90] as const;
const INCREMENT_MINUTES_LEN = INCREMENT_MINUTES_LIST.length; // 5 (last index 4 = 90', full time)

// ---------------------------------------------------------------------------
// PitchCard — the compact pixel PLAYING CARD that lives on the pitch.
//
// This is the headline change: the XI are CARDS, not circles. A reduced card
// face — rarity-ringed frame, position tab, big rating, surname, archetype code
// — sized so 11 per side stay legible on a 390-wide pitch. It shares the
// GameCard family's tokens (rarity ring, position colour, pixel type) so a card
// on the pitch reads as the same object you tapped open in CardModal.
//
// Pure presentational: all interaction (drag/inspect) stays on the wrapping
// elements in the pitch loop, exactly as the old token did.
// ---------------------------------------------------------------------------

// FIX 5 — the pitch cards are the headline element now, so they're noticeably
// bigger. Sized so all 11 stay legible and don't badly overlap at 390×844: a
// 4-wide attacking band tiles ~4×54 = 216px across a ~358px pitch (margins 16px),
// leaving comfortable gutters; rating/surname/position all read at arm's length.
const CARD_W = 54;   // up from 44 — bolder face on the pitch
const CARD_H = 68;   // up from 56, holds the ~2.5:3.5 card ratio

function PitchCard({
  spot, side, accent, dim, glow,
}: {
  spot: PitchSpot;
  side: 'you' | 'opp';
  accent: string;        // rarity ring / top rail colour
  dim?: boolean;         // dragged-from card fades
  glow?: boolean;        // carrier glow during resolve
}) {
  const posColor = spot.position ? POSITION_COLOR[spot.position] ?? 'var(--dust)' : 'var(--dust)';
  const youKit = side === 'you';
  // The card face tints to the side so a glance reads friend vs foe, but the
  // rarity rail still signals quality.
  const faceTop = youKit ? 'linear-gradient(165deg, #16361f, #0e2616)' : 'linear-gradient(165deg, #3a1411, #2a0d0b)';
  return (
    <div
      className={glow ? 'carrier-glow' : undefined}
      style={{
        width: CARD_W, height: CARD_H,
        borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--ink-black)',
        background: faceTop,
        boxShadow: spot.isStar
          ? '0 2px 0 0 var(--ink-black), 0 0 0 2px var(--gold-glow)'
          : '0 2px 0 0 var(--ink-black)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        opacity: dim ? 0.3 : 1,
        position: 'relative',
      }}
    >
      {/* Rarity / accent top rail — the card family signature. */}
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      {/* Header: position tab · rating */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 4px 0' }}>
        <span style={{ background: posColor, color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 7.5, lineHeight: 1, padding: '2px 3px', borderRadius: 2 }}>
          {spot.isGK ? 'GK' : spot.position ?? '—'}
        </span>
        {spot.rating !== undefined && (
          <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: 'var(--line-white)' }}>{spot.rating}</span>
        )}
      </div>
      {/* Mini sprite — a flat pixel kit block, tinted by side. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MiniSprite side={side} isGK={spot.isGK} accent={accent} />
      </div>
      {/* Surname + archetype code */}
      <div style={{ padding: '0 4px 3px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--cream)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {spot.name ?? '—'}
        </div>
        {!spot.isGK && spot.archetype && (
          <div style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.2, color: 'var(--dust)', lineHeight: 1.1, marginTop: 1.5 }}>
            {archCode(spot.archetype)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubCard — the trimmed bench card (FIX 4).
//
// Just NAME · POSITION · LEVEL (+ a compact role line where it fits). No
// nationality flag, no sprite clutter — a clean identity chip the size of a
// thumb, tuned to drag reliably. It is a pure <div> with no nested interactive
// elements, so the wrapping <button>'s pointer capture (begin/move/end) is never
// swallowed — the cause of the previous GameCard bench drag failure.
// ---------------------------------------------------------------------------
function SubCard({ card, dim }: { card: Card; dim?: boolean }) {
  const posColor = POSITION_COLOR[card.position] ?? 'var(--dust)';
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.Common;
  return (
    <div
      style={{
        width: '100%', borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)',
        background: 'linear-gradient(165deg, var(--surface-raised), var(--surface))',
        boxShadow: '0 2px 0 0 var(--ink-black)', overflow: 'hidden',
        opacity: dim ? 0.3 : 1, pointerEvents: 'none',
      }}
    >
      {/* Rarity rail */}
      <div style={{ height: 3, background: accent }} />
      <div style={{ padding: '4px 5px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Position tab · level */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={{ background: posColor, color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 7, lineHeight: 1, padding: '2px 3px', borderRadius: 2 }}>{card.position}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: 'var(--line-white)' }}>{Math.round(card.power)}</span>
        </div>
        {/* Surname */}
        <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--cream)', lineHeight: 1.05, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastName(card.name)}</div>
        {/* Role (archetype) — fits efficiently on one muted line. */}
        <div style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 0.2, color: 'var(--dust)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{archCode(card.archetype) ?? card.archetype}</div>
      </div>
    </div>
  );
}

/** A tiny flat pixel kit sprite for the pitch card, tinted to the side. */
function MiniSprite({ side, isGK, accent }: { side: 'you' | 'opp'; isGK: boolean; accent: string }) {
  const kit = isGK ? '#5a6b5f' : side === 'you' ? 'var(--kit-blue)' : 'var(--kit-red)';
  const kitDark = isGK ? '#36433a' : side === 'you' ? '#1f5bb0' : '#9e1f1a';
  return (
    <svg className="pixelated" viewBox="0 0 24 24" shapeRendering="crispEdges" style={{ width: 30, height: 30, display: 'block' }}>
      {/* head */}
      <rect x="9" y="3" width="6" height="6" fill="#e8c9a0" />
      <rect x="9" y="3" width="6" height="2" fill="#3a2a1e" />
      {/* shirt */}
      <rect x="6" y="10" width="12" height="9" fill={kit} />
      <rect x="6" y="10" width="12" height="2" fill={kitDark} />
      {/* sleeves */}
      <rect x="4" y="11" width="2" height="5" fill={kitDark} />
      <rect x="18" y="11" width="2" height="5" fill={kitDark} />
      {/* collar */}
      <rect x="10" y="9" width="4" height="2" fill="var(--line-white)" />
      {/* crest */}
      <rect x="11" y="13" width="2" height="2" fill={accent} />
    </svg>
  );
}

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
      card: card ?? undefined,
      rating: card ? Math.round(card.power) : undefined,
      position: card?.position,
      rarity: card?.rarity,
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
      card: card ?? undefined,
      isStar: !!card && card.id === starId && !isGK,
      rating: card ? Math.round(card.power) : undefined,
      position: card?.position,
      rarity: card?.rarity,
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
  // Goals are the headline — they are NEVER dropped by the length cap; only the
  // surrounding non-goal beats are trimmed so the period stays snappy. (A bug fix:
  // a flat slice used to truncate the goals when a side had many saved/missed
  // shots, so the goal that decided the score never animated.)
  const nonGoal = beats.filter((b) => b.kind !== 'goal');
  const goals = beats.filter((b) => b.kind === 'goal');
  const MAX_BEATS = 6;
  // Reserve room for the lead idle + all goals; whatever's left goes to non-goal shots.
  const leadIdle = idleBeats[0] ? 1 : 0;
  const nonGoalBudget = Math.max(0, MAX_BEATS - leadIdle - goals.length);
  const ordered: Beat[] = [];
  if (idleBeats[0]) ordered.push(idleBeats[0]);
  ordered.push(...nonGoal.slice(0, nonGoalBudget));
  ordered.push(...goals); // goals last, always kept

  // If literally nothing happened, still show one quiet possession so the period
  // never feels frozen.
  if (ordered.length === 0) ordered.push({ side: 'you', kind: 'idle', lane: 'C', xg: 0, label: '', source: null });
  return ordered;
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

// ---------------------------------------------------------------------------
// StatsScreen — the per-15-minute head-to-head readout (PER-15-MIN STATS).
//
// Built entirely from the engine's MatchStats: xG, possession %, shots, shots
// on target, and the three contested zones (L/C/R). A natural beat between
// periods — it rises once the possession animation finishes, and CONTINUE
// proceeds to the next planning step. Colour by side: you = green, opp = red.
// ---------------------------------------------------------------------------

const YOU = 'var(--success)';
const OPP = 'var(--danger)';

/** A diverging bar that fills from each side toward the centre by share. */
function StatBar({ you, opp, fmt, delay }: { you: number; opp: number; fmt?: (n: number) => string; delay: number }) {
  const total = you + opp;
  const yPct = total > 0 ? (you / total) * 100 : 50;
  const oPct = 100 - yPct;
  const show = (n: number) => (fmt ? fmt(n) : String(n));
  return (
    <div className="stat-row-in" style={{ display: 'grid', gridTemplateColumns: '34px 1fr 34px', alignItems: 'center', gap: 8, animationDelay: `${delay}ms` }}>
      <span style={{ fontFamily: PIXEL, fontSize: 11, color: YOU, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{show(you)}</span>
      <div style={{ display: 'flex', height: 9, borderRadius: 3, overflow: 'hidden', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
        <div style={{ width: `${yPct}%`, display: 'flex', justifyContent: 'flex-end' }}>
          <div className="stat-bar-grow" style={{ width: '100%', background: YOU, transformOrigin: 'right', animationDelay: `${delay}ms` }} />
        </div>
        <div style={{ width: `${oPct}%` }}>
          <div className="stat-bar-grow" style={{ width: '100%', height: '100%', background: OPP, transformOrigin: 'left', animationDelay: `${delay}ms` }} />
        </div>
      </div>
      <span style={{ fontFamily: PIXEL, fontSize: 11, color: OPP, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{show(opp)}</span>
    </div>
  );
}

function StatLabel({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <div className="stat-row-in" style={{ textAlign: 'center', fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.6, color: 'var(--dust)', marginBottom: 4, marginTop: 2, animationDelay: `${delay}ms` }}>{children}</div>
  );
}

/** A compact PERIOD / MATCH pairing for one stat: the live 15' window value beside
 *  the running match-to-date total, so the team-talk reads both at a glance. */
function StatPair({
  label, you, opp, matchYou, matchOpp, fmt, delay,
}: {
  label: string;
  you: number; opp: number;          // this period
  matchYou: number; matchOpp: number; // match to date
  fmt?: (n: number) => string;
  delay: number;
}) {
  const show = (n: number) => (fmt ? fmt(n) : String(n));
  return (
    <div className="stat-row-in" style={{ animationDelay: `${delay}ms` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', columnGap: 8 }}>
        {/* This period — the headline value, the diverging bar */}
        <span style={{ fontFamily: PIXEL, fontSize: 11, color: YOU, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{show(you)}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--dust)' }}>{label}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 11, color: OPP, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{show(opp)}</span>
      </div>
      <StatBar you={you} opp={opp} fmt={fmt} delay={delay} />
      {/* Match-to-date total — a faint sub-line beneath, clearly tagged MATCH. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', columnGap: 8, marginTop: 1 }}>
        <span style={{ fontSize: 8.5, color: YOU, opacity: 0.7, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{show(matchYou)}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 0.5, color: 'var(--ink)' }}>MATCH</span>
        <span style={{ fontSize: 8.5, color: OPP, opacity: 0.7, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{show(matchOpp)}</span>
      </div>
    </div>
  );
}

function StatsScreen({
  stats, cumulative, minute, periodLabel, youName, oppName, scoreYou, scoreOpp, isFullTime, onContinue,
}: {
  stats: MatchStats;
  cumulative: CumulativeStats;
  minute: number;
  periodLabel: string;
  youName: string;
  oppName: string;
  scoreYou: number;
  scoreOpp: number;
  isFullTime: boolean;
  onContinue: () => void;
}) {
  // FIX 7 — tally won cells from the full 9-cell grid (was the 3 L/C/R lanes).
  const gridZones: Band[] = ['ATT', 'MID', 'DEF']; // top → bottom (your perspective)
  const gridLanes: Lane[] = ['L', 'C', 'R'];        // left → right
  const countGrid = (g: Record<Cell, boolean>) =>
    gridZones.reduce((acc, b) => acc + gridLanes.reduce((a, l) => a + (g[`${b}_${l}` as Cell] ? 1 : 0), 0), 0);
  const youZonesWon = countGrid(stats.yourZoneGrid);
  const oppZonesWon = countGrid(stats.opponentZoneGrid);
  return (
    <div className="stats-rise" style={{ position: 'absolute', inset: 0, zIndex: 14, background: 'linear-gradient(180deg, #08130c, #0a160e)', display: 'flex', flexDirection: 'column', padding: '14px 14px 14px', overflow: 'hidden' }}>
      {/* The whole readout — header, matchup, four stat bars, the zones map — is
          ONE centred cluster with even gaps between its groups. It fills the body
          from the middle outward (no empty top half, no edge-stretched voids).
          CONTINUE stays a fixed footer below. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', paddingTop: 6, paddingBottom: 2 }}>
        {/* Scoreboard — period marker, running score, and the matchup, as one block. */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Header: the period marker + the running score */}
          <div className="stat-row-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: 'var(--gold)', letterSpacing: 0.6 }}>{isFullTime ? 'FULL TIME' : `${minute}' — ${periodLabel} HALF`}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--line-white)' }}>
              <span style={{ color: YOU }}>{scoreYou}</span> – <span style={{ color: OPP }}>{scoreOpp}</span>
            </span>
          </div>

          {/* Side names */}
          <div className="stat-row-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', animationDelay: '40ms' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: YOU, overflow: 'hidden' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: YOU }} />{youName}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: OPP, overflow: 'hidden' }}>
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oppName}</span><span style={{ width: 8, height: 8, borderRadius: 2, background: OPP }} />
            </span>
          </div>
        </div>

        {/* Four stats — each a PERIOD value (headline + diverging bar) over its
            MATCH-to-date total, so the team-talk reads this 15' window and the whole
            match at once. The MATCH totals come from cumulativeStats(scores). */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Caption: which column is which. */}
          <div className="stat-row-in" style={{ display: 'flex', justifyContent: 'center', gap: 6, animationDelay: '70ms' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--cream-soft)' }}>THIS 15{"'"}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--dust)' }}>·</span>
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--ink)' }}>MATCH SO FAR</span>
          </div>
          <StatPair label="xG" you={stats.yourXG} opp={stats.opponentXG} matchYou={cumulative.yourXG} matchOpp={cumulative.opponentXG} fmt={(n) => n.toFixed(2)} delay={90} />
          <StatPair label="POSS %" you={stats.yourPossessionPct} opp={stats.opponentPossessionPct} matchYou={cumulative.yourPossessionPct} matchOpp={cumulative.opponentPossessionPct} delay={140} />
          <StatPair label="SHOTS" you={stats.yourShots} opp={stats.opponentShots} matchYou={cumulative.yourShots} matchOpp={cumulative.opponentShots} delay={190} />
          <StatPair label="ON TARGET" you={stats.yourShotsOnTarget} opp={stats.opponentShotsOnTarget} matchYou={cumulative.yourShotsOnTarget} matchOpp={cumulative.opponentShotsOnTarget} delay={240} />
        </div>

        {/* FIX 7 — ZONES WON as a pitch-shaped 3×3 mini-heatmap. Oriented from your
            perspective: ATT third at the TOP (toward the opponent's goal), MID in
            the middle, DEF at the BOTTOM (your goal); columns L/C/R left-to-right.
            Green = you lead the cell, red = opponent, neutral = level. Each cell
            carries its SIGNED control margin (engine `zoneMargin`): +n you lead,
            -n the opponent leads, 0 level. A slim DEF/MID/ATT caption column sits
            to the LEFT of every row so each cell is free for its number. */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <StatLabel delay={280}>ZONES WON · <span style={{ color: YOU }}>{youZonesWon}</span>–<span style={{ color: OPP }}>{oppZonesWon}</span> <span style={{ color: 'var(--ink)' }}>· MATCH <span style={{ color: YOU, opacity: 0.8 }}>{cumulative.yourZonesWon}</span>–<span style={{ color: OPP, opacity: 0.8 }}>{cumulative.opponentZonesWon}</span></span></StatLabel>
          <div className="stat-row-in" style={{ display: 'flex', justifyContent: 'center', animationDelay: '290ms' }}>
            {/* A pitch-shaped frame: top goal (opponent's) → bottom goal (yours).
                LABEL_W reserves a slim row-caption column; the 3 lanes fill the rest. */}
            <div style={{ position: 'relative', width: 202, borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)', background: '#0a1a10', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* opponent goal mouth (top) */}
              <div style={{ position: 'absolute', top: -3, left: 'calc(50% + 13px)', transform: 'translateX(-50%)', width: 32, height: 3, borderRadius: '0 0 2px 2px', background: OPP }} />
              {/* your goal mouth (bottom) */}
              <div style={{ position: 'absolute', bottom: -3, left: 'calc(50% + 13px)', transform: 'translateX(-50%)', width: 32, height: 3, borderRadius: '2px 2px 0 0', background: YOU }} />
              {gridZones.map((band) => (
                <div key={band} style={{ display: 'grid', gridTemplateColumns: '26px repeat(3, 1fr)', gap: 4, alignItems: 'stretch' }}>
                  {/* Row caption: full word DEF / MID / ATT, out to the side. */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.3, color: 'var(--dust)', lineHeight: 1 }}>{band}</span>
                  </div>
                  {gridLanes.map((lane) => {
                    const cell = `${band}_${lane}` as Cell;
                    const youWon = stats.yourZoneGrid[cell];
                    const oppWon = stats.opponentZoneGrid[cell];
                    const bg = youWon ? YOU : oppWon ? OPP : 'var(--surface)';
                    const margin = stats.zoneMargin[cell] ?? 0;
                    const marginText = margin > 0 ? `+${margin}` : String(margin);
                    // High contrast on the bright tints (dark ink); muted cream on neutral.
                    const fg = youWon || oppWon ? 'var(--ink-black)' : 'var(--cream-soft)';
                    return (
                      <div key={cell} title={`${band} ${lane}`} style={{ height: 26, borderRadius: 2, background: bg, border: '1px solid var(--ink-black)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: PIXEL, fontSize: 10, color: fg, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{marginText}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CONTINUE — the single advance verb proceeds from the stats screen. */}
      <button onClick={onContinue} className="advance-btn-pulse stat-row-in"
        style={{ flexShrink: 0, marginTop: 12, width: '100%', padding: '13px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 4px 0 0 var(--ink-black)', background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))', color: 'var(--cream)', fontFamily: PIXEL, fontSize: 15, cursor: 'pointer', animationDelay: '320ms' }}>
        {isFullTime ? 'FULL TIME →' : 'CONTINUE →'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MatchToast — a brief, on-brand banner for a blocked action (a rejected sub).
//
// Pinned to the top of the pitch column, drops in, and auto-dismisses after
// ~2s. Kept dead simple: the parent owns a `{ id, text }` and clears it on a
// timer; the `id` re-arms the drop animation when a new message replaces an old.
// ---------------------------------------------------------------------------
function MatchToast({ message }: { message: { id: number; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      key={message.id}
      className="match-toast"
      role="status"
      style={{
        position: 'absolute', top: 8, left: '50%', zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 8,
        maxWidth: 'calc(100% - 32px)',
        padding: '8px 12px',
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
        border: '2px solid var(--danger)',
        boxShadow: '0 3px 0 0 var(--ink-black)',
        pointerEvents: 'none',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--line-white)', background: 'var(--danger)', borderRadius: 3, padding: '3px 5px', lineHeight: 1, flexShrink: 0 }}>BLOCKED</span>
      <span style={{ fontSize: 11.5, color: 'var(--cream)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message.text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoachPanel — the assistant's team-talk reads (assistant.coachNotes).
//
// A compact panel framed as the assistant manager speaking to the room during
// the break: a tone-coloured dot + line per note (good = green, warn = amber/red,
// info = neutral). Capped at the ~4 notes the helper returns. Pure presentational.
// ---------------------------------------------------------------------------
const COACH_TONE: Record<CoachNote['tone'], { dot: string; text: string }> = {
  good: { dot: 'var(--success)', text: 'var(--cream)' },
  warn: { dot: 'var(--amber)', text: 'var(--cream)' },
  info: { dot: 'var(--cream-soft)', text: 'var(--cream-soft)' },
};

function CoachPanel({ notes }: { notes: CoachNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div
      style={{
        margin: '0 16px 8px', flexShrink: 0,
        borderRadius: 'var(--radius)',
        border: '2px solid var(--ink-black)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
        background: 'linear-gradient(165deg, var(--surface-raised), var(--surface))',
        overflow: 'hidden',
      }}
    >
      {/* Speaker bar — the assistant has the room. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'rgba(0,0,0,0.28)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.4, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '3px 5px', lineHeight: 1 }}>COACH</span>
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.6, color: 'var(--cream-soft)' }}>TEAM TALK</span>
      </div>
      {/* The reads — one tone-coloured line each. */}
      <div style={{ padding: '6px 10px 7px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {notes.map((n, i) => {
          const tone = COACH_TONE[n.tone];
          return (
            <div key={`${n.kind}-${i}`} className="coach-line-in" style={{ display: 'flex', alignItems: 'flex-start', gap: 7, animationDelay: `${i * 60}ms` }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: tone.dot, flexShrink: 0, marginTop: 4 }} />
              <span style={{ fontSize: 11, color: tone.text, lineHeight: 1.35 }}>{n.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PitchMatchView({
  matchState, formation, jokers, tacticSlots, availableTactics, ownedFormations,
  opponentBuild, nextMinute, mode, breakMoment, currentResult,
  onToggleTactic, onSub, onReassign, onFormationChange, onAutoSelect, onContinue,
}: PitchMatchViewProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [oppView, setOppView] = useState(false);
  const [tickerOpen, setTickerOpen] = useState(false);
  const [formSheet, setFormSheet] = useState(false);
  const [modal, setModal] = useState<GameCardModel | null>(null);
  // FIX 2 — a transient blocked-action banner (a rejected sub). The `id` re-arms
  // the drop animation when a new message replaces an old; cleared on a ~2s timer.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
  // FIX 1 — the live match clock, in seconds. Counts UP across the increment
  // window while resolving (a ticking timer, below); shows the elapsed time while
  // planning. Held in state so it re-renders smoothly without driving the engine.
  const [clockSec, setClockSec] = useState(0);

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

  // FIX 1 — the MATCH LOG / ticker carries each beat's REAL clock (seconds) and
  // mm:ss `time` from the engine, not the increment minute. Lines are sorted by
  // `clock` for chronological display, so they read 02:45, 07:02, … Newest-first
  // in the log overlay. The full played history plus the live increment's beats
  // up to the current playhead (so the log fills in lockstep with the animation).
  type FeedLine = { clock: number; time: string; text: string; type: 'goal-yours' | 'goal-opponent' | 'chance'; scorer: string | null; side: 'you' | 'opp' };
  const beatToLine = (b: MatchBeat): FeedLine => ({
    clock: b.clock,
    time: b.time,
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
    // Chronological by real clock so timestamps read in order (your shots then opp
    // come out of the engine interleaved; sorting fixes the display order).
    lines.sort((a, b) => a.clock - b.clock);
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
  const deployedTactics = tacticSlots.slots.filter((t): t is TacticCard => t !== null);
  const deployedIds = new Set(deployedTactics.map((t) => t.id));

  // ── TACTIC DECK STATE (display-only) ──────────────────────────────────────
  // The engine (onToggleTactic + canDeploy in tactics.ts) is the single source of
  // truth; here we mirror it to a label so a tap is never a silent no-op. Each
  // card resolves to exactly one of four states, computed from canDeploy() +
  // its `contradicts` field:
  //   • deployed   — already in a slot           → tap removes it
  //   • deployable — a free slot, no conflict     → tap deploys it
  //   • swap       — canDeploy via auto-removal   → tap REPLACES the named card
  //   • blocked    — slots full, nothing to swap  → tap is a no-op, so we disable
  // `replaces` carries the contradicting card's NAME so the swap is explicit
  // BEFORE it happens; `contradictsName` surfaces the static pairing on the card.
  type TacticState = 'deployed' | 'deployable' | 'swap' | 'blocked';
  const tacticView = useMemo(() => {
    return availableTactics.map((tactic) => {
      const deployed = deployedIds.has(tactic.id);
      // The contradiction note (static, regardless of what's deployed).
      const contradictsName = tactic.contradicts
        ? getTacticById(tactic.contradicts)?.name ?? null
        : null;
      let state: TacticState;
      let replaces: string | null = null;
      if (deployed) {
        state = 'deployed';
      } else {
        const { canDeploy: ok, wouldRemove } = canDeploy(tacticSlots, tactic);
        if (ok && wouldRemove) {
          state = 'swap';
          replaces = getTacticById(wouldRemove)?.name ?? null;
        } else if (ok) {
          state = 'deployable';
        } else {
          state = 'blocked';
        }
      }
      return { tactic, state, replaces, contradictsName };
    });
    // deployedIds is derived from tacticSlots, so tacticSlots is the real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTactics, tacticSlots]);

  // FIX 1 — A MATCH CLOCK THAT COUNTS (mm:ss).
  //   • PLANNING: show the elapsed time = the last completed increment's end
  //     (00:00 before kickoff), so the clock reads where the match currently sits.
  //   • RESOLVE: tick UP across this increment's 15-minute window as the
  //     PossessionClock plays the beats. We map the live playhead to a real
  //     clock time — anchored on the beats' own `clock` seconds where present,
  //     interpolated smoothly across the window otherwise — so it visibly counts.
  // `nextMinute` (= INCREMENT_MINUTES[currentIncrement]) is the window END minute.
  const windowEndMin = nextMinute;                 // 15 | 30 | 60 | 75 | 90
  const windowStartMin = Math.max(0, windowEndMin - 15);
  // Elapsed before this increment (planning anchor): the last completed end.
  const elapsedMin = matchState.currentIncrement === 0 ? 0 : INCREMENT_MINUTES_LIST[matchState.currentIncrement - 1] ?? windowStartMin;
  const clockMinute = nextMinute;
  // First half = first two increments (15', 30'); the rest is the second half.
  const periodLabel = matchState.currentIncrement <= 1 ? '1ST' : '2ND';

  // SIMPLIFY THE ADVANCE FLOW — KICK OFF only at the very first kickoff; every
  // later advance (resolve-done, then later plans) reads CONTINUE.
  const isFirstKickoff = mode === 'plan' && matchState.currentIncrement === 0 && matchState.scores.length === 0;
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
  // FIX 2 — subs now work in the first half too (makeSub no longer gates on it), so
  // the SUB? prompt fires for any injured/tired starter whenever a sub is available.
  const canSubFlag = !!flaggedPlayer && subsRemaining > 0;
  const showSubPrompt = planning && canSubFlag && bench.length > 0;

  const emptyTacticSlots = tacticSlots.slots.filter((s) => s === null).length;
  const hasUndeployedTactic = availableTactics.some((t) => !deployedIds.has(t.id));
  const showTacticPrompt = planning && emptyTacticSlots > 0 && hasUndeployedTactic;

  // The team-talk break: planning, not scouting the opposition. At a real break
  // (kickoff / halftime / between) the coach panel and the SHAPE + TACTICS entry
  // points are surfaced prominently rather than left to the side rail.
  const isBreak = planning && breakMoment !== null;

  // FIX 5 — the assistant's reads for this break (assistant.coachNotes). Pass the
  // opponent's soft-spot blurb, the live tactic slots, and whether an undeployed
  // tactic is still in hand, so the tactics read is accurate. Capped at ~4 lines.
  const notes = useMemo<CoachNote[]>(
    () => (isBreak ? coachNotes(matchState, {
      weaknessLabel: opponentBuild.weakness,
      tacticSlots,
      hasUndeployedTactic,
    }) : []),
    [isBreak, matchState, opponentBuild.weakness, tacticSlots, hasUndeployedTactic],
  );

  // FIX 3 — match-to-date totals for the stats screen (cumulativeStats over scores).
  const cumulative = useMemo<CumulativeStats>(() => cumulativeStats(matchState.scores), [matchState.scores]);

  // FIX 1 — auto-select is only legal at the pre-kickoff team talk (no period
  // played yet); pulling bench players on mid-match would be a free sub.
  const canAutoSelect = !!onAutoSelect && breakMoment === 'kickoff'
    && matchState.currentIncrement === 0 && matchState.scores.length === 0;
  // `drag` is only set once movement crosses the threshold, so its presence
  // already means a real drag is underway (taps never set it).
  const moving = !oppView && mode === 'plan' && drag !== null;

  const displayGoals = animGoals ?? { you: yourGoals, opp: opponentGoals };

  // FIX 1 — drive the ticking match clock.
  //   • PLANNING: snap to the elapsed time (last completed increment's end).
  //   • RESOLVE: count UP across [windowStart, windowEnd]. The target second is
  //     mapped from the live playhead — anchored on the current beat's real
  //     `clock` (the engine's seconds) when it has one, else interpolated by the
  //     playhead fraction. A short interval eases the displayed value toward the
  //     target, so the readout visibly ticks rather than jumping per beat.
  const windowStartSec = windowStartMin * 60;
  const windowEndSec = windowEndMin * 60;
  useEffect(() => {
    if (!resolving) {
      setClockSec(elapsedMin * 60);
      return;
    }
    // Map the playhead to a target time inside the window.
    const computeTarget = () => {
      const liveClock = timeline[Math.max(0, beatIdx)]?.source?.clock;
      if (typeof liveClock === 'number') {
        return Math.min(windowEndSec, Math.max(windowStartSec, liveClock));
      }
      const frac = timeline.length > 0 ? Math.min(1, Math.max(0, (beatIdx + 1) / timeline.length)) : 1;
      return windowStartSec + (windowEndSec - windowStartSec) * frac;
    };
    const id = setInterval(() => {
      setClockSec((cur) => {
        const target = computeTarget();
        if (cur >= target) return Math.min(cur, windowEndSec);
        // Ease toward the target; never overshoot it, never run past the window.
        const step = Math.max(1, (target - cur) * 0.25);
        return Math.min(target, cur + step, windowEndSec);
      });
    }, 90);
    return () => clearInterval(id);
  }, [resolving, beatIdx, timeline, elapsedMin, windowStartSec, windowEndSec]);

  // When a fresh resolve begins, seed the clock at the window start so it counts up.
  useEffect(() => {
    if (resolving) setClockSec(windowStartSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolving, matchState.currentIncrement]);

  const clockMMSS = useMemo(() => {
    const s = Math.max(0, Math.round(clockSec));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [clockSec]);

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
      if (p.kind === 'bench') {
        // FIX 2 — confirm the sub is legal BEFORE committing it. subBlockReason
        // returns the human reason a sub is rejected (no subs left, etc.) or null
        // when it's fine; on a block we surface the reason as a toast and do NOT
        // call onSub (which previously could no-op silently — "subs don't work").
        const reason = subBlockReason(matchState, hoverTargetId, p.id);
        if (reason) showToast(reason);
        else onSub(hoverTargetId, p.id);
      } else if (p.id !== hoverTargetId) onReassign(p.id, hoverTargetId);
    }
    setDrag(null); setDragPos(null); setHoverTargetId(null);
    e.stopPropagation();
  };

  const dragCard = drag ? (drag.kind === 'pitch' ? xi : bench).find((c) => c.id === drag.id) ?? null : null;
  const dragSpot = drag?.kind === 'pitch' ? youSpots.find((s) => s.cardId === drag.id) : null;
  // A synthetic spot so the drag ghost renders as the same compact card face,
  // whether it was lifted off the pitch (use its real spot) or off the bench.
  const dragGhostSpot: PitchSpot = dragSpot ?? (dragCard ? {
    slot: { type: dragCard.position, label: dragCard.position, accepts: [], x: 50, y: 50 },
    band: 'MID', number: 0, name: lastName(dragCard.name), isGK: dragCard.position === 'GK',
    cardId: dragCard.id, card: dragCard, rating: Math.round(dragCard.power),
    position: dragCard.position, rarity: dragCard.rarity, archetype: dragCard.archetype,
  } : {
    slot: { type: '', label: '', accepts: [], x: 50, y: 50 },
    band: 'MID', number: 0, name: null, isGK: false,
  });

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
      {/* FIX 2 — blocked-action toast (a rejected sub). Auto-dismisses ~2s. */}
      <MatchToast message={toast} />

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
              {/* FIX 6 — the opponent's PLAYING STYLE, clearly labelled "PLAY" so it
                  reads as their approach (Passive/Balanced/Attacking/…), not a tactic
                  card. A leading STYLE tab distinguishes it from the tactic pills. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0, flexShrink: 0, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.4, color: 'var(--ink-black)', background: 'var(--cream-soft)', padding: '2px 3px', lineHeight: 1 }}>PLAY</span>
                <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--cream)', background: 'rgba(0,0,0,0.35)', padding: '2px 4px', lineHeight: 1, whiteSpace: 'nowrap' }}>{oppStyleLabel.toUpperCase()}</span>
              </span>
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: resolving ? 'var(--success)' : 'var(--dust)', flexShrink: 0, boxShadow: resolving ? '0 0 5px var(--success)' : undefined }} className={resolving ? 'carrier-glow' : undefined} />
            {/* FIX 1 — a real mm:ss clock: ticks up while resolving, shows elapsed while planning. */}
            <span style={{ fontFamily: PIXEL, fontSize: 13, color: resolving ? 'var(--cream)' : 'var(--dust)', fontVariantNumeric: 'tabular-nums' }}>{clockMMSS}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', letterSpacing: 0.4 }}>{periodLabel}</span>
          </div>
        </div>
      </div>

      {/* FIX 5 — the assistant's team-talk reads, surfaced prominently at a break
          (halftime / between / pre-kickoff). It takes the ticker's spot during the
          break — the recent events it would show are subsumed by the coach's
          momentum line, and the full MATCH LOG stays one tap away below. */}
      {isBreak && notes.length > 0 ? (
        <>
          <CoachPanel notes={notes} />
          {/* A slim, tappable strip keeps the full match log reachable during the talk. */}
          {feed.length > 0 && (
            <button onClick={() => setTickerOpen(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 16px 8px', padding: '6px 10px', borderRadius: 'var(--radius)', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', flexShrink: 0, cursor: 'pointer' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--dust)' }}>MATCH LOG</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 10.5, color: feed.length ? lineColour(feed[feed.length - 1]) : 'var(--dust)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed[feed.length - 1]?.text ?? ''}</span>
                <span style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)', flexShrink: 0 }}>›</span>
              </span>
            </button>
          )}
        </>
      ) : (
      /* Ticker — three lines, tap to expand. Pre-kickoff shows a coach prompt. */
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
                <span style={{ color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, visibility: e ? 'visible' : 'hidden' }}>{e ? e.time : '00:00'}</span>
                {e && <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: e.side === 'you' ? 'var(--success)' : 'var(--danger)' }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: e && e.type !== 'chance' ? 800 : 400 }}>{e ? e.text : ''}</span>
              </div>
            );
          })
        )}
      </button>
      )}

      {/* TACTICS + MANAGER ON SCREEN — the active gaffer and deployed tactics are
          mirrored here persistently, so synergies read at a glance without opening
          the drawer. Tap a pill to inspect; the + opens the shelf to deploy more. */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, margin: '0 16px 8px', flexShrink: 0 }}>
        {/* Manager pill */}
        <button
          onClick={() => { if (manager) setModal({ variant: 'manager', manager }); else setTrayOpen(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 'var(--radius)', border: `2px solid ${manager ? 'var(--gold)' : 'var(--border)'}`, background: manager ? 'rgba(245,197,66,0.10)' : 'rgba(0,0,0,0.25)', cursor: 'pointer', flexShrink: 0, maxWidth: 138, textAlign: 'left' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '3px 4px', lineHeight: 1, flexShrink: 0 }}>MGR</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: manager ? 'var(--cream)' : 'var(--dust)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manager ? lastName(manager.name) : 'No gaffer'}</span>
        </button>
        {/* Deployed tactic pills in a no-wrap scroll strip (tap a pill to inspect). */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', overflowX: 'auto', overflowY: 'hidden', flex: 1, scrollbarWidth: 'none', minWidth: 0 }} className="match-joker-row">
          {deployedTactics.map((t) => {
            const cat = TACTIC_CAT_COLOR[t.category] ?? 'var(--gold)';
            return (
              <button key={t.id} onClick={() => setModal({ variant: 'tactic', tactic: t })}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 'var(--radius)', border: `2px solid ${cat}`, background: 'rgba(0,0,0,0.3)', cursor: 'pointer', flexShrink: 0, maxWidth: 130, textAlign: 'left' }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: cat, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              </button>
            );
          })}
          {deployedTactics.length === 0 && (mode !== 'plan' || oppView) && (
            <span style={{ fontSize: 10, color: 'var(--dust)', alignSelf: 'center', paddingLeft: 2 }}>No tactics deployed</span>
          )}
          {deployedTactics.length === 0 && mode === 'plan' && !oppView && (
            <span style={{ fontSize: 10, color: 'var(--dust)', alignSelf: 'center', paddingLeft: 2, whiteSpace: 'nowrap' }}>No tactics yet</span>
          )}
        </div>
        {/* FIX 2 — the tactics tray trigger. An ALWAYS-VISIBLE control beside the
            active-tactics strip (sits outside the scroll area so deployed pills can
            never push it off-screen). Opens the tactical shelf to deploy/toggle.
            Pulses gold when there's a free slot and an undeployed tactic to suggest. */}
        {mode === 'plan' && !oppView && (
          <button onClick={() => setTrayOpen(true)} aria-label="Edit tactics"
            className={showTacticPrompt ? 'carrier-glow' : undefined}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 10px', borderRadius: 'var(--radius)', border: `2px ${deployedTactics.length === 0 ? 'dashed' : 'solid'} ${showTacticPrompt ? 'var(--gold)' : 'var(--border)'}`, background: showTacticPrompt ? 'rgba(245,197,66,0.10)' : 'rgba(0,0,0,0.25)', cursor: 'pointer', flexShrink: 0 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.4, color: showTacticPrompt ? 'var(--gold)' : 'var(--cream-soft)', lineHeight: 1 }}>TACTICS</span>
            {/* Slot pips mirror the shelf's meter so deployed capacity reads here too. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1 }}>
              {tacticSlots.slots.map((slot, i) => {
                const cat = slot ? TACTIC_CAT_COLOR[slot.category] ?? 'var(--amber)' : null;
                return (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: 2, flexShrink: 0, background: cat ?? 'transparent', border: `1.5px solid ${cat ?? 'var(--dust)'}` }} />
                );
              })}
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', marginLeft: 2, lineHeight: 1 }}>+</span>
            </span>
          </button>
        )}
      </div>

      {/* FIX 1 + FIX 4 — the TEAM-TALK action row. At a break the player's three
          levers are surfaced together as proper buttons rather than buried in a
          side rail: change SHAPE, open TACTICS, and (pre-kickoff only) AUTO-PICK
          the strongest fitness-aware XI. Only shown at a real break, not while
          scouting the opposition or mid-resolve. */}
      {isBreak && (
        <div style={{ display: 'flex', gap: 6, margin: '0 16px 8px', flexShrink: 0 }}>
          <button onClick={() => setFormSheet(true)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 6px', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 3px 0 0 var(--ink-black)', background: 'var(--surface)', cursor: 'pointer' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.4, color: 'var(--kit-blue)', lineHeight: 1 }}>SHAPE</span>
            <span style={{ fontSize: 9.5, color: 'var(--cream-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{formation.name}</span>
          </button>
          <button onClick={() => setTrayOpen(true)}
            className={showTacticPrompt ? 'carrier-glow' : undefined}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 6px', borderRadius: 'var(--radius)', border: `2px solid ${showTacticPrompt ? 'var(--gold)' : 'var(--ink-black)'}`, boxShadow: '0 3px 0 0 var(--ink-black)', background: showTacticPrompt ? 'rgba(245,197,66,0.10)' : 'var(--surface)', cursor: 'pointer' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.4, color: showTacticPrompt ? 'var(--gold)' : 'var(--amber)', lineHeight: 1 }}>TACTICS</span>
            <span style={{ fontSize: 9.5, color: 'var(--cream-soft)', lineHeight: 1 }}>{deployedIds.size}/{tacticSlots.slots.length} live{emptyTacticSlots > 0 ? ' · spare' : ''}</span>
          </button>
          {canAutoSelect && (
            <button onClick={onAutoSelect}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 6px', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 3px 0 0 var(--ink-black)', background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))', cursor: 'pointer' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.4, color: 'var(--cream)', lineHeight: 1 }}>AUTO XI</span>
              <span style={{ fontSize: 9.5, color: 'rgba(242,246,239,0.85)', lineHeight: 1 }}>best legs</span>
            </button>
          )}
        </div>
      )}

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

        {/* Players — now compact pixel CARDS, not circles. Drag/inspect, carrier
            glow, condition flags and the star marker are all preserved. */}
        {spots.map((spot, i) => {
          if (!oppView && !spot.cardId) return null;
          const attacking = !oppView && (spot.band === 'ATT' || spot.band === 'MID') && !spot.isGK;
          const spearhead = attacking && spot.band === 'ATT';
          const isDropTarget = moving && !spot.isGK && spot.cardId !== undefined && spot.cardId !== drag?.id;
          const isHover = isDropTarget && hoverTargetId === spot.cardId;
          const isDragging = drag?.kind === 'pitch' && drag.id === spot.cardId;
          // During resolve, the carrier glows on the side that's currently attacking.
          const carrier = !!(resolving && beat && ((beat.side === 'you' && !oppView && spearhead) || (beat.side === 'opp' && oppView && spot.band === 'ATT')));
          // The sub prompt points at the flagged player (pulsing amber).
          const isFlagged = !oppView && showSubPrompt && spot.cardId !== undefined && spot.cardId === flaggedPlayer?.cardId;
          // Fitness/injury status drives a clear corner indicator (yours only).
          const condition: 'injured' | 'tired' | null = !oppView
            ? (spot.injured ? 'injured' : spot.lowFitness ? 'tired' : null)
            : null;
          // The card's accent rail / ring: hover & drop targets take gold; a flagged
          // or injured card takes its status colour; otherwise the rarity colour.
          const rarityAccent = spot.rarity ? RARITY_COLOR[spot.rarity] ?? RARITY_COLOR.Common : 'var(--dust)';
          const ringColor = isHover || isDropTarget ? 'var(--gold)'
            : isFlagged ? 'var(--amber)'
            : condition === 'injured' ? 'var(--danger)'
            : spot.isStar ? 'var(--gold)'
            : null;
          return (
            <div key={`${oppView ? 'o' : 'y'}-${i}`} className="move-pop"
              style={{ position: 'absolute', left: `${spot.slot.x}%`, top: `${spot.slot.y}%`, transform: 'translate(-50%,-50%)', display: 'grid', justifyItems: 'center', width: CARD_W, zIndex: isHover || carrier || isFlagged ? 6 : attacking ? 4 : 3 }}>
              {oppView && spot.isStar && <span style={{ position: 'absolute', top: -13, fontFamily: PIXEL, fontSize: 7, color: 'var(--ink-black)', background: 'var(--gold)', padding: '2px 4px', borderRadius: 3, whiteSpace: 'nowrap', zIndex: 8, boxShadow: '0 1px 0 0 var(--ink-black)' }}>{'★'} DANGER</span>}
              <button
                onPointerDown={(e) => { if (spot.cardId !== undefined) beginPointer('pitch', spot.cardId, e); }}
                onPointerMove={drag ? undefined : movePointer}
                onPointerUp={drag ? undefined : endPointer}
                onClick={() => { if (oppView && spot.cardId !== undefined && spot.card) setModal({ variant: 'player', card: spot.card }); }}
                disabled={mode !== 'plan' && !oppView}
                aria-label={spot.name ? `${spot.name}, inspect` : 'Player'}
                style={{
                  position: 'relative', padding: 0, background: 'none', border: 'none',
                  cursor: (oppView ? (spot.cardId !== undefined ? 'pointer' : 'default') : mode === 'plan' ? 'grab' : 'default'),
                  touchAction: 'none',
                  transition: 'transform 160ms', transform: isHover ? 'scale(1.12)' : 'scale(1)',
                  // The ring is a hard outer halo so the rarity rail inside still shows.
                  boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : undefined,
                  borderRadius: 'var(--radius-sm)',
                }}>
                <PitchCard spot={spot} side={oppView ? 'opp' : 'you'} accent={rarityAccent} dim={isDragging} glow={carrier} />
                {/* fitness / injury flag, top-left corner. */}
                {condition && (
                  <span aria-label={condition === 'injured' ? 'Injured' : 'Low fitness'}
                    style={{ position: 'absolute', top: -5, left: -5, width: 14, height: 14, borderRadius: '50%', background: condition === 'injured' ? 'var(--danger)' : 'var(--amber)', border: '1.5px solid var(--ink-black)', color: condition === 'injured' ? 'var(--line-white)' : 'var(--ink-black)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>{condition === 'injured' ? '+' : '!'}</span>
                )}
                {/* drop-target hint when dragging another card over this one. */}
                {isDropTarget && !isHover && (
                  <span aria-hidden style={{ position: 'absolute', inset: -2, borderRadius: 'var(--radius-sm)', border: '2px dashed var(--gold)', pointerEvents: 'none' }} />
                )}
                {/* inspect pip — tap to open CardModal (yours, in plan). */}
                {!oppView && mode === 'plan' && spot.cardId !== undefined && (
                  <span role="button" aria-label="Inspect player"
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); inspectCard(spot.cardId); }}
                    style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: 'var(--ink-black)', border: '1.5px solid var(--line-white)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 9 }}>i</span>
                )}
              </button>
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

        {/* FIX 3 — Opponent intel while viewing the opposition. The SOFT SPOT
            scouting card no longer sits over the keeper: the opponent's GK is at
            the BOTTOM of the pitch (their own goal), so the intel is anchored at
            the TOP-LEFT, stacked under the shape chip, in the open corner above
            their attackers. Both panels are FULLY OPAQUE (no transparency) so no
            player name can ghost through, and z-index sits above the cards. */}
        {oppView && (
          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 12, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
            <div style={{ alignSelf: 'flex-start', fontFamily: PIXEL, fontSize: 8, color: 'var(--cream)', background: 'var(--surface)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)', padding: '5px 8px', borderRadius: 'var(--radius-sm)', letterSpacing: 0.3 }}>
              <span style={{ color: 'var(--dust)' }}>SHAPE</span>&nbsp; {matchState.opponentFormation.name} &nbsp;<span style={{ color: 'var(--dust)' }}>·</span>&nbsp; <span style={{ color: 'var(--cream-soft)' }}>{oppStyleLabel}</span>
            </div>
            <div style={{ maxWidth: 280, fontSize: 10, color: 'var(--cream-soft)', background: 'var(--surface)', border: '2px solid var(--success)', boxShadow: '0 2px 0 0 var(--ink-black)', padding: '7px 10px', borderRadius: 'var(--radius)', lineHeight: 1.4 }}>
              <b style={{ color: 'var(--success)', fontFamily: PIXEL, fontSize: 9 }}>SOFT SPOT</b> &nbsp;{opponentBuild.weakness.toLowerCase()} — {opponentBuild.starAbility.toLowerCase()}.
            </div>
          </div>
        )}

        {/* Side rail — SHAPE (the ONE formation control). Tactics now live in the
            persistent on-screen strip above the pitch. At a team-talk break the
            SHAPE control is surfaced as a full button in the action row above, so
            the side rail is suppressed there to avoid duplicating it. */}
        {!oppView && mode === 'plan' && !isBreak && (
          <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
            <button onClick={() => setFormSheet(true)} style={{ writingMode: 'vertical-rl', padding: '12px 6px', borderRadius: 'var(--radius) 0 0 var(--radius)', border: '2px solid var(--ink-black)', borderRight: 'none', background: 'var(--kit-blue)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 1, cursor: 'pointer' }}>SHAPE · {formation.name}</button>
          </div>
        )}

        {/* "Deploy a tactic?" pill — contextual nudge toward the opponent's weakness.
            FIX 3 (related) — anchored to the TOP-LEFT of the pitch (the clear zone
            by the opponent's goal mouth) so it never covers the GK at the bottom or
            any central player. Fully opaque; sits below the side rail in z-order.
            Suppressed at a break — the TACTICS button in the action row already
            glows the same nudge there. */}
        {showTacticPrompt && !isBreak && (
          <button onClick={() => setTrayOpen(true)} style={{ position: 'absolute', left: 8, top: 8, zIndex: 6, display: 'flex', alignItems: 'center', gap: 6, maxWidth: 160, background: 'var(--surface)', border: '2px solid var(--gold)', borderRadius: 'var(--radius)', padding: '6px 9px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 2px 0 0 var(--ink-black)' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>TIP</span>
            <span style={{ fontSize: 10, color: 'var(--cream-soft)', lineHeight: 1.25 }}>Deploy a tactic to exploit <b style={{ color: 'var(--gold)' }}>{opponentBuild.weakness.toLowerCase()}</b>.</span>
          </button>
        )}

        {/* Drag ghost following the finger — a lifted mini card. */}
        {drag && dragPos && dragCard && (
          <div style={{ position: 'absolute', left: `${dragPos.x}%`, top: `${dragPos.y}%`, transform: 'translate(-50%,-50%) scale(1.14)', zIndex: 12, pointerEvents: 'none', boxShadow: '0 0 0 2px var(--gold), 0 6px 12px rgba(0,0,0,0.5)', borderRadius: 'var(--radius-sm)' }}>
            <PitchCard
              spot={dragGhostSpot}
              side="you"
              accent={dragCard.rarity ? RARITY_COLOR[dragCard.rarity] ?? RARITY_COLOR.Common : 'var(--dust)'}
            />
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

      {/* Subs bench — now identity cards. Tap to inspect, drag onto a player to
          sub in. Each sub shows surname + position + rating via the card face. */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, padding: '8px 16px 4px', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0, width: 30 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: showSubPrompt ? 'var(--amber)' : 'var(--dust)', lineHeight: 1.2 }}>SUBS</span>
          <span style={{ fontFamily: PIXEL, fontSize: 13, color: showSubPrompt ? 'var(--amber)' : 'var(--cream)', lineHeight: 1 }}>{subsRemaining}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', overflowY: 'hidden', flex: 1, scrollbarWidth: 'none', paddingBottom: 2 }} className="match-joker-row">
          {bench.length === 0 && <span style={{ fontSize: 10, color: 'var(--dust)', alignSelf: 'center' }}>No subs on the bench.</span>}
          {bench.slice(0, 7).map((card) => {
            const isDragging = drag?.kind === 'bench' && drag.id === card.id;
            return (
              <button
                key={card.id}
                // FIX 4 — the bench drag works again. The pointer handlers live on
                // THIS button; SubCard below is a pure div (pointerEvents:none), so
                // pointerdown/move/up always fire on the button and pointer capture
                // is never swallowed by an inner interactive element (the GameCard
                // button was the culprit). move/up stay live until `drag` is set,
                // after which the root container owns them.
                onPointerDown={(e) => beginPointer('bench', card.id, e)}
                onPointerMove={drag ? undefined : movePointer}
                onPointerUp={drag ? undefined : endPointer}
                disabled={mode !== 'plan' || oppView}
                title={card.name}
                aria-label={`Substitute ${card.name}`}
                style={{ width: 56, flexShrink: 0, padding: 0, background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', cursor: mode === 'plan' && !oppView ? 'grab' : 'default', touchAction: 'none', boxShadow: showSubPrompt ? '0 0 0 2px var(--amber)' : undefined }}>
                <SubCard card={card} dim={isDragging} />
              </button>
            );
          })}
        </div>
        {moving && <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--gold)', alignSelf: 'center', flexShrink: 0 }}>→ DROP ON A PLAYER</span>}
      </div>

      {/* Controls — ISSUE 2: clear View Opposition / View Team toggle + advance CTA */}
      <div style={{ display: 'flex', gap: 10, padding: '8px 16px 14px', flexShrink: 0 }}>
        <button onClick={() => setOppView((v) => !v)} style={{ flex: '0 0 104px', padding: '11px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 3px 0 0 var(--ink-black)', background: oppView ? 'var(--surface-raised)' : 'var(--surface)', color: 'var(--cream)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.3, cursor: 'pointer', lineHeight: 1.3 }}>{oppView ? 'VIEW TEAM' : 'VIEW OPP'}</button>
        {/* ONE consistent advance verb. KICK OFF only at the very first kickoff;
            CONTINUE for every later advance. While resolving the button is the
            disabled PLAYING… state — the per-period stats screen (which rises once
            the animation finishes) carries the CONTINUE that proceeds. */}
        <button onClick={onContinue} disabled={resolving}
          className={resolving ? undefined : 'advance-btn-pulse'}
          style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 4px 0 0 var(--ink-black)', background: resolving ? 'var(--surface)' : 'linear-gradient(135deg, var(--amber), var(--amber-soft))', color: resolving ? 'var(--dust)' : 'var(--cream)', fontFamily: PIXEL, fontSize: 15, cursor: resolving ? 'default' : 'pointer', transition: 'background 200ms, color 200ms' }}>
          {resolving ? 'PLAYING…' : isFirstKickoff ? 'KICK OFF →' : 'CONTINUE →'}
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
                <span style={{ color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{e.time}</span>
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

      {/* ── TACTICAL SHELF — a bottom-sheet (DESIGN.md › Bottom-sheet overlay). ──
          Pinned to the bottom, internal scroll, the page never document-scrolls.
          Header carries a live SLOT METER (●●○) so capacity reads at a glance;
          each deck card is labelled with its engine-derived state so a tap is
          never a silent no-op. */}
      {trayOpen && (
        <div onClick={() => setTrayOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} className="scrim-fade">
          <div onClick={(e) => e.stopPropagation()} className="tactic-sheet" style={{ display: 'flex', flexDirection: 'column', maxHeight: '78%', background: 'var(--felt)', borderTop: '2px solid var(--amber)', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -8px 24px rgba(0,0,0,0.5)' }}>
            {/* Grab handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, flexShrink: 0 }}>
              <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>

            {/* Header — title + close, and the live slot meter beneath. */}
            <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--amber)', letterSpacing: 0.8 }}>TACTICAL SHELF</span>
                <button onClick={() => setTrayOpen(false)} aria-label="Close tactics" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, marginRight: -8, background: 'none', border: 'none', color: 'var(--dust)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>{'×'}</button>
              </div>
              {/* SLOT METER — three pips mirror tacticSlots.slots; filled pips carry
                  the deployed card's category colour, empty ones read as outlines. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 7 }}>
                  {tacticSlots.slots.map((slot, i) => {
                    const cat = slot ? TACTIC_CAT_COLOR[slot.category] ?? 'var(--amber)' : null;
                    return (
                      <span key={i} title={slot ? slot.name : 'Empty slot'} style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: cat ?? 'transparent', border: `2px solid ${cat ?? 'var(--border)'}`, boxShadow: cat ? `0 0 0 0 ${cat}` : 'none' }} />
                    );
                  })}
                </div>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.5 }}>
                  {deployedIds.size}/{tacticSlots.slots.length} SLOTS
                </span>
                <span style={{ fontSize: 10, color: 'var(--cream-soft)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {emptyTacticSlots > 0
                    ? `${emptyTacticSlots} free`
                    : 'Full — swap to change'}
                </span>
              </div>
            </div>

            {/* SCROLL REGION — the only thing that scrolls; the page never does. */}
            <div className="tactic-sheet-scroll" style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '12px 16px 16px', WebkitOverflowScrolling: 'touch' }}>
              {/* Manager */}
              <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8, marginBottom: 6 }}>MANAGER</div>
              <div style={{ borderRadius: 'var(--radius)', padding: '11px 13px', marginBottom: 16, background: 'var(--surface)', border: `2px solid ${manager ? 'var(--gold)' : 'var(--ink-black)'}` }}>
                {manager ? (<>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)' }}>{manager.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 4, lineHeight: 1.4 }}>{manager.effect}</div>
                </>) : <div style={{ fontSize: 11, color: 'var(--dust)' }}>No manager — sign one in the shop.</div>}
              </div>

              {/* Tactic deck */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8 }}>TACTICAL CARDS</span>
                <span style={{ fontSize: 9, color: 'var(--dust)' }}>{availableTactics.length} in deck</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {tacticView.length === 0 && <div style={{ fontSize: 11, color: 'var(--dust)' }}>No tactical cards drafted for this fixture.</div>}
                {tacticView.map(({ tactic, state, replaces, contradictsName }) => {
                  const cat = TACTIC_CAT_COLOR[tactic.category] ?? 'var(--gold)';
                  const blocked = state === 'blocked';
                  // The border tells the state apart: amber = deployed, kit-blue
                  // = swap (a deliberate change), category accent = deployable,
                  // muted = blocked. Blocked cards dim and disable.
                  const borderColor =
                    state === 'deployed' ? 'var(--amber)'
                      : state === 'swap' ? 'var(--kit-blue)'
                        : blocked ? 'var(--border)' : 'var(--ink-black)';
                  // Top-right status label — the action a tap performs RIGHT NOW.
                  const label =
                    state === 'deployed' ? 'DEPLOYED'
                      : state === 'swap' ? 'TAP TO SWAP'
                        : blocked ? 'SLOTS FULL'
                          : 'TAP TO DEPLOY';
                  const labelColor =
                    state === 'deployed' ? 'var(--amber)'
                      : state === 'swap' ? 'var(--kit-blue)'
                        : blocked ? 'var(--dust)' : 'var(--success)';
                  return (
                    <button
                      key={tactic.id}
                      onClick={() => { if (!blocked) onToggleTactic(tactic.id); }}
                      disabled={blocked}
                      aria-disabled={blocked}
                      className="tactic-card-btn"
                      style={{
                        textAlign: 'left', borderRadius: 'var(--radius)', padding: '10px 12px',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        background: state === 'deployed' ? 'rgba(255,122,31,0.08)' : 'var(--surface)',
                        border: `2px solid ${borderColor}`,
                        opacity: blocked ? 0.5 : 1,
                        position: 'relative', overflow: 'hidden',
                      }}>
                      {/* category accent rail — the card's identity colour */}
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: cat }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 2, background: cat, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tactic.name}</span>
                        </span>
                        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: labelColor, letterSpacing: 0.3, flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 3, lineHeight: 1.4, paddingLeft: 4 }}>{tactic.effect}</div>
                      {/* STATE LINE — make every consequence explicit before a tap:
                          the swap names the card it replaces; the blocked card says
                          how to free a slot; otherwise show the static contradiction. */}
                      {state === 'swap' && replaces && (
                        <div style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--kit-blue)', letterSpacing: 0.3, marginTop: 6, paddingLeft: 4, lineHeight: 1.3 }}>
                          {'⇄'} REPLACES {replaces.toUpperCase()}
                        </div>
                      )}
                      {state === 'deployed' && (
                        <div style={{ fontSize: 9.5, color: 'var(--amber)', marginTop: 6, paddingLeft: 4 }}>Tap to remove</div>
                      )}
                      {blocked && (
                        <div style={{ fontSize: 9.5, color: 'var(--dust)', marginTop: 6, paddingLeft: 4 }}>Slots full — remove one first</div>
                      )}
                      {/* Contradiction note (shown when it isn't already the live swap line). */}
                      {contradictsName && state !== 'swap' && (
                        <div style={{ fontSize: 9.5, color: 'var(--dust)', marginTop: 6, paddingLeft: 4 }}>Contradicts {contradictsName}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PER-15-MIN STATS — rises once the possession animation finishes. The
          single CONTINUE here proceeds to the next planning step (or full time). */}
      {resolving && sequenceDone && currentResult?.stats && (
        <StatsScreen
          stats={currentResult.stats}
          cumulative={cumulative}
          minute={clockMinute}
          periodLabel={periodLabel}
          youName="YOUR XI"
          oppName={opponentBuild.name}
          scoreYou={displayGoals.you}
          scoreOpp={displayGoals.opp}
          isFullTime={matchState.currentIncrement >= INCREMENT_MINUTES_LEN - 1}
          onContinue={onContinue}
        />
      )}

      {/* Full-card overlay — tap any player (yours, GK included) to inspect. */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
