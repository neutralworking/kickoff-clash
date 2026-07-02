'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchV5State, IncrementResult, MatchBeat, MatchStats, PlayerMatchStat } from '../../lib/match-v5';
import type { Formation, FormationSlot } from '../../lib/formations';
import { getFormation } from '../../lib/formations';
import type { Band, Lane, Cell } from '../../lib/field';
import { cellOf, bandOf } from '../../lib/field';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import { getTacticById, chargesLeft } from '../../lib/tactics';
import { getOpponentPlayById } from '../../lib/opponent';
import { attackLanes } from '../../lib/plays';
import type { OpponentBuild, TeamIntent } from '../../lib/run';
import type { Card } from '../../lib/scoring';
import { subBlockReason, cumulativeStats } from '../../lib/match-v5';
import type { CumulativeStats } from '../../lib/match-v5';
import { coachNotes } from '../../lib/assistant';
import type { CoachNote } from '../../lib/assistant';
import { traitCopy } from '../../lib/trait-copy';
import type { TraitKind } from '../../lib/trait-copy';
import CardModal from '../cards/CardModal';
import type { GameCardModel } from '../cards/GameCard';
import { PIXEL, lastName, POSITION_COLOR, RARITY_COLOR } from '../cards/cardTokens';

interface PitchMatchViewProps {
  matchState: MatchV5State;
  formation: Formation;
  jokers: JokerCard[];
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
  /** Per-player in-match stats + 0–10 rating, keyed by card id (read-side, deterministic).
   *  Surfaces effective power, fitness, position-fit, goals/assists and rating on the pitch
   *  cards and in the team-talk ratings panel. Computed in MatchPhase from playerMatchStats. */
  playerStats: Record<number, PlayerMatchStat>;
  onToggleTactic: (tacticId: string) => void;
  onSub: (xiCardId: number, benchCardId: number) => void;
  onReassign: (cardA: number, cardB: number) => void;
  onFormationChange: (formationId: string) => void;
  /** Fill the strongest fitness-aware XI from the current XI+bench. Only ever wired
   *  for the pre-kickoff team talk (currentIncrement 0, no periods played) — pulling
   *  bench players on mid-match would be a free sub. */
  onAutoSelect?: () => void;
  /** Change the team's attacking intent (ATT/BAL/DEF) mid-match. The engine reads
   *  `state.intent` fresh each increment, so it takes effect from the next period. */
  onIntentChange?: (intent: TeamIntent) => void;
  onContinue: () => void;
}

/** Intent options for the team-talk toggle — mirrors TeamSelect's segmented control. */
const INTENT_OPTIONS: { id: TeamIntent; label: string; accent: string }[] = [
  { id: 'defensive', label: 'DEF', accent: 'var(--kit-blue)' },
  { id: 'balanced', label: 'BAL', accent: 'var(--gold)' },
  { id: 'attacking', label: 'ATT', accent: 'var(--kit-red)' },
];

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
  // ── PER-MATCH READOUT (Wave E) — read-side stats off playerMatchStats. ──
  effPower?: number;      // fitness-adjusted power (the on-pitch level)
  tired?: boolean;        // effPower < base power → legible "down on power" tell
  posFit?: boolean;       // false → playing out of position (a wrong-slot warning)
  matchRating?: number;   // 0–10 in-match rating
  goals?: number;         // goals scored this match
  assists?: number;       // assists this match
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

// ── Wave E rating colour band (req 5): red <6, neutral 6–7.5, green >7.5. ──
// Returned as a {fill, ink} pair so the badge always carries a legible foreground.
function ratingBand(r: number): { fill: string; ink: string } {
  if (r < 6) return { fill: 'var(--danger)', ink: 'var(--line-white)' };
  if (r > 7.5) return { fill: 'var(--success)', ink: 'var(--ink-black)' };
  return { fill: 'var(--gold)', ink: 'var(--ink-black)' };
}

// ── Wave E fitness band (req 6): a 6-step condition meter. Fresh = green, low = red. ──
function fitnessColor(f: number): string {
  if (f <= LOW_FITNESS) return 'var(--danger)';
  if (f <= 4) return 'var(--amber)';
  return 'var(--success)';
}

/** A compact banded fitness meter (6 ticks) — fills proportional to live condition.
 *  Pixel-flat (no blur/soft shadow on the bars), banded so it reads at a glance. */
function FitnessMeter({ fitness }: { fitness: number }) {
  const f = Math.max(1, Math.min(6, Math.round(fitness)));
  const col = fitnessColor(fitness);
  return (
    <div aria-label={`Fitness ${f} of 6`} style={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1, height: 4, borderRadius: 1,
            background: i < f ? col : 'rgba(0,0,0,0.45)',
            border: '0.5px solid rgba(7,16,11,0.6)',
          }}
        />
      ))}
    </div>
  );
}

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
  // ── Wave E surfaces (yours only — rivals carry no live per-match stats). ──
  const showStats = youKit;
  const misfit = showStats && spot.posFit === false && !spot.isGK; // wrong-position warning (req 3)
  // Effective (fitness-adjusted) power is the headline level the engine actually uses;
  // when it's below base power, flag it tired so the drop is legible (req 1).
  const effShown = showStats && typeof spot.effPower === 'number';
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
      {/* Rarity / accent top rail — the card family signature. A misfit reddens it. */}
      <div style={{ height: 3, background: misfit ? 'var(--danger)' : accent, flexShrink: 0 }} />
      {/* Header: position tab · power. The power shown is the EFFECTIVE (fitness-adjusted)
          level for your players (req 1); a down-on-power card greys + carries a ▾.
          A misfit's position tab goes solid red — the Team Talk's misfit vocabulary. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 4px 0', gap: 2 }}>
        <span style={{ background: misfit ? 'var(--danger)' : posColor, color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 7.5, lineHeight: 1, padding: '2px 3px', borderRadius: 2 }}>
          {spot.isGK ? 'GK' : spot.position ?? '—'}
        </span>
        {effShown ? (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
            {spot.tired && <span style={{ fontFamily: PIXEL, fontSize: 8, lineHeight: 1, color: 'var(--amber)' }}>▾</span>}
            <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: spot.tired ? 'var(--amber)' : 'var(--line-white)' }}>{spot.effPower}</span>
          </span>
        ) : spot.rating !== undefined ? (
          <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: 'var(--line-white)' }}>{spot.rating}</span>
        ) : null}
      </div>
      {/* Mini sprite — a flat pixel kit block, tinted by side. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <MiniSprite side={side} isGK={spot.isGK} accent={accent} />
        {/* Rating badge (req 5) — colour-coded 0–10, bottom-left over the sprite. */}
        {showStats && typeof spot.matchRating === 'number' && (() => {
          const band = ratingBand(spot.matchRating);
          return (
            <span style={{ position: 'absolute', left: 2, bottom: 0, fontFamily: PIXEL, fontSize: 9, lineHeight: 1, color: band.ink, background: band.fill, border: '1px solid var(--ink-black)', borderRadius: 2, padding: '1.5px 2.5px', fontVariantNumeric: 'tabular-nums' }}>
              {spot.matchRating.toFixed(1)}
            </span>
          );
        })()}
        {/* Goal/assist badges live OUTSIDE the card frame (rendered by the pitch loop,
            GoalAssistBadges) so the sprite stays clean — a running record of who's done
            what, persisting all match (req 4). */}
      </div>
      {/* Surname + archetype code */}
      <div style={{ padding: '0 4px 2px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--cream)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {spot.name ?? '—'}
        </div>
        {!spot.isGK && spot.archetype && (
          <div style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.2, color: 'var(--dust)', lineHeight: 1.1, marginTop: 1 }}>
            {archCode(spot.archetype)}
          </div>
        )}
      </div>
      {/* Fitness meter (req 6) — a banded condition bar pinned to the card foot (yours only). */}
      {showStats && typeof spot.fitness === 'number' && (
        <div style={{ padding: '0 3px 3px', flexShrink: 0 }}>
          <FitnessMeter fitness={spot.fitness} />
        </div>
      )}
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

// ---------------------------------------------------------------------------
// CALLED PLAYS — the break-console hand (one call per spell).
//
// A play's class sets its accent (the call vocabulary, all KC tokens):
//   attacking → kit-red · defensive → kit-blue · control → gold.
// ChargeDots is the per-match charge meter (filled = remaining); CallPill is
// one owned play in the hand row — tap calls it for THIS spell (ringed CALLED),
// tap again clears, zero charges disables. The inspect pip opens the existing
// tactic CardModal. Pixel-flat content on a hard-shadowed surface.
// ---------------------------------------------------------------------------

const PLAY_CLASS_COLOR: Record<TacticCard['playClass'], string> = {
  attacking: 'var(--kit-red)',
  defensive: 'var(--kit-blue)',
  control: 'var(--gold)',
};

type CallState = 'called' | 'callable' | 'blocked';

function ChargeDots({ left, total, accent }: { left: number; total: number; accent: string }) {
  return (
    <span aria-label={`${left} of ${total} charges left`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: 1, background: i < left ? accent : 'rgba(0,0,0,0.45)', border: '1px solid var(--ink-black)' }} />
      ))}
    </span>
  );
}

function CallPill({ tactic, state, left, onCall, onInspect }: {
  tactic: TacticCard;
  state: CallState;
  left: number;
  onCall: () => void;
  onInspect: () => void;
}) {
  const accent = PLAY_CLASS_COLOR[tactic.playClass] ?? 'var(--gold)';
  const called = state === 'called';
  const blocked = state === 'blocked';
  return (
    // No `disabled` attr — the inspect pip must stay tappable on a no-charges
    // play; the call tap itself is guarded below.
    <button
      onClick={() => { if (!blocked) onCall(); }}
      aria-disabled={blocked}
      aria-pressed={called}
      aria-label={`${tactic.name}, ${called ? 'called this spell, tap to clear' : blocked ? 'no charges left' : 'tap to call'}`}
      style={{
        position: 'relative', flexShrink: 0, textAlign: 'left', padding: 0,
        display: 'flex', alignItems: 'stretch',
        height: 46,
        borderRadius: 'var(--radius-sm)',
        border: `2px solid ${called ? accent : 'var(--ink-black)'}`,
        boxShadow: called ? `0 0 0 2px ${accent}, 0 2px 0 0 var(--ink-black)` : '0 2px 0 0 var(--ink-black)',
        background: called
          ? `linear-gradient(165deg, color-mix(in srgb, ${accent} 22%, var(--surface)), var(--surface))`
          : 'linear-gradient(165deg, var(--surface-raised), var(--surface))',
        opacity: blocked ? 0.45 : 1,
        cursor: blocked ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        transition: 'box-shadow 160ms, border-color 160ms',
      }}
    >
      {/* play-class accent rail */}
      <span aria-hidden style={{ width: 3, background: accent, flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 8px', minWidth: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 112, lineHeight: 1.1 }}>{tactic.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ChargeDots left={left} total={tactic.charges} accent={accent} />
          {called && (
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.3, color: 'var(--ink-black)', background: accent, borderRadius: 2, padding: '2px 3px', lineHeight: 1 }}>CALLED</span>
          )}
        </span>
      </span>
      {/* inspect pip — opens the existing tactic CardModal; stopPropagation so a
          tap here never toggles the call (same pattern as the pitch-card pip). */}
      <span
        role="button"
        aria-label={`Inspect ${tactic.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onInspect(); }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, alignSelf: 'stretch', flexShrink: 0, borderLeft: '1px solid rgba(0,0,0,0.35)', color: 'var(--dust)', fontFamily: PIXEL, fontSize: 8, cursor: 'pointer' }}
      >i</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Goal / assist badges (req 4) — a persistent running record that reads as
// BADGES OUTSIDE the card frame: a ⚽ BALL on a scorer, a 👟 BOOT on an assister
// (with a count when >1). Crisp pixel-art SVG glyphs (emoji clash with the pixel
// font), hard --ink-black edge — they are CONTENT, never blurred. Rendered by the
// pitch loop as a sibling of PitchCard so they can overflow the card's clipped
// frame and sit on the top corners.
// ---------------------------------------------------------------------------

/** A flat pixel-art football, sized for a corner badge. */
function BallGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg className="pixelated" viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ width: size, height: size, display: 'block' }} aria-hidden>
      <rect x="2" y="2" width="8" height="8" fill="var(--line-white)" />
      <rect x="3" y="1" width="6" height="1" fill="var(--line-white)" />
      <rect x="3" y="10" width="6" height="1" fill="var(--line-white)" />
      <rect x="1" y="3" width="1" height="6" fill="var(--line-white)" />
      <rect x="10" y="3" width="1" height="6" fill="var(--line-white)" />
      {/* pentagon panels — the classic ball spots */}
      <rect x="5" y="4" width="2" height="2" fill="var(--ink-black)" />
      <rect x="3" y="6" width="2" height="2" fill="var(--ink-black)" />
      <rect x="7" y="6" width="2" height="2" fill="var(--ink-black)" />
      <rect x="5" y="8" width="2" height="1" fill="var(--ink-black)" />
    </svg>
  );
}

/** A flat pixel-art boot (cleat), sized for a corner badge. */
function BootGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg className="pixelated" viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ width: size, height: size, display: 'block' }} aria-hidden>
      {/* upper */}
      <rect x="3" y="2" width="4" height="5" fill="var(--ink-black)" />
      {/* ankle laces highlight */}
      <rect x="4" y="3" width="2" height="1" fill="var(--line-white)" />
      <rect x="4" y="5" width="2" height="1" fill="var(--line-white)" />
      {/* foot/toe */}
      <rect x="3" y="7" width="7" height="2" fill="var(--ink-black)" />
      {/* sole + studs */}
      <rect x="3" y="9" width="7" height="1" fill="var(--line-white)" />
      <rect x="4" y="10" width="1" height="1" fill="var(--ink-black)" />
      <rect x="6" y="10" width="1" height="1" fill="var(--ink-black)" />
      <rect x="8" y="10" width="1" height="1" fill="var(--ink-black)" />
    </svg>
  );
}

function GoalAssistBadges({ goals, assists }: { goals: number; assists: number }) {
  if (goals <= 0 && assists <= 0) return null;
  return (
    <div
      aria-label={`${goals} goals, ${assists} assists`}
      style={{
        position: 'absolute', bottom: -9, right: -10, zIndex: 8,
        display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', pointerEvents: 'none',
      }}
    >
      {goals > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--gold)', border: '2px solid var(--ink-black)', borderRadius: 5, padding: '2px 3px', boxShadow: '0 2px 0 0 var(--ink-black)', lineHeight: 1 }}>
          <BallGlyph size={13} />
          {goals > 1 && <span style={{ fontFamily: PIXEL, fontSize: 8.5, color: 'var(--ink-black)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{goals}</span>}
        </span>
      )}
      {assists > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--kit-blue)', border: '2px solid var(--ink-black)', borderRadius: 5, padding: '2px 3px', boxShadow: '0 2px 0 0 var(--ink-black)', lineHeight: 1 }}>
          <BootGlyph size={13} />
          {assists > 1 && <span style={{ fontFamily: PIXEL, fontSize: 8.5, color: 'var(--line-white)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{assists}</span>}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trait-firing pixel sprites — the PICTORIAL vocabulary for defining traits.
// Crisp pixel-art (crispEdges, hard --ink-black edges, ≤6 colours, one light
// source top-left) matching the ball/boot badge discipline above. These are
// CONTENT: never blurred, never soft-shadowed — motion lives on the wrapper.
// ---------------------------------------------------------------------------

/** Impact frame 1 — the tight flash at the moment of the tackle. */
function BurstFlashGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg className="pixelated" viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ width: size, height: size, display: 'block' }} aria-hidden>
      {/* ink backing cross */}
      <rect x="6" y="1" width="4" height="14" fill="var(--ink-black)" />
      <rect x="1" y="6" width="14" height="4" fill="var(--ink-black)" />
      {/* amber arms */}
      <rect x="7" y="2" width="2" height="12" fill="var(--amber)" />
      <rect x="2" y="7" width="12" height="2" fill="var(--amber)" />
      {/* white-hot core */}
      <rect x="6" y="6" width="4" height="4" fill="var(--line-white)" />
    </svg>
  );
}

/** Impact frame 2 — the full starburst as the challenge lands. */
function BurstBlastGlyph({ size = 38 }: { size?: number }) {
  return (
    <svg className="pixelated" viewBox="0 0 20 20" shapeRendering="crispEdges" style={{ width: size, height: size, display: 'block' }} aria-hidden>
      {/* ink backing spikes (cardinal) */}
      <rect x="8" y="0" width="4" height="20" fill="var(--ink-black)" />
      <rect x="0" y="8" width="20" height="4" fill="var(--ink-black)" />
      {/* gold cardinal spikes */}
      <rect x="9" y="1" width="2" height="18" fill="var(--gold)" />
      <rect x="1" y="9" width="18" height="2" fill="var(--gold)" />
      {/* amber diagonal debris */}
      <rect x="4" y="4" width="2" height="2" fill="var(--amber)" />
      <rect x="14" y="4" width="2" height="2" fill="var(--amber)" />
      <rect x="4" y="14" width="2" height="2" fill="var(--amber)" />
      <rect x="14" y="14" width="2" height="2" fill="var(--amber)" />
      {/* hollow white ring — the shockwave */}
      <rect x="7" y="6" width="6" height="2" fill="var(--line-white)" />
      <rect x="7" y="12" width="6" height="2" fill="var(--line-white)" />
      <rect x="6" y="7" width="2" height="6" fill="var(--line-white)" />
      <rect x="12" y="7" width="2" height="6" fill="var(--line-white)" />
      {/* open ink centre — the blast hollow */}
      <rect x="8" y="8" width="4" height="4" fill="var(--ink-black)" />
    </svg>
  );
}

/** A keeper's glove, fingers up — the SAVE. White mitt, gold cuff, ink edge. */
function GloveGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg className="pixelated" viewBox="0 0 14 14" shapeRendering="crispEdges" style={{ width: size, height: size, display: 'block' }} aria-hidden>
      {/* ink backing (mitt + thumb) */}
      <rect x="2" y="0" width="10" height="13" fill="var(--ink-black)" />
      <rect x="0" y="4" width="3" height="6" fill="var(--ink-black)" />
      {/* fingers */}
      <rect x="3" y="1" width="8" height="4" fill="var(--line-white)" />
      <rect x="5" y="1" width="1" height="3" fill="var(--ink-black)" />
      <rect x="7" y="1" width="1" height="3" fill="var(--ink-black)" />
      <rect x="9" y="1" width="1" height="3" fill="var(--ink-black)" />
      {/* palm */}
      <rect x="3" y="5" width="8" height="4" fill="var(--line-white)" />
      {/* thumb */}
      <rect x="1" y="5" width="2" height="4" fill="var(--line-white)" />
      {/* cuff — gold band with a white strap line */}
      <rect x="3" y="9" width="8" height="3" fill="var(--gold)" />
      <rect x="3" y="10" width="8" height="1" fill="var(--line-white)" />
    </svg>
  );
}

/** The linesman's raised flag — OFFSIDE. Ink pole, kit-red/amber checked cloth. */
function FlagGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg className="pixelated" viewBox="0 0 14 14" shapeRendering="crispEdges" style={{ width: size, height: size, display: 'block' }} aria-hidden>
      {/* pole */}
      <rect x="2" y="0" width="2" height="14" fill="var(--ink-black)" />
      <rect x="2" y="0" width="2" height="1" fill="var(--line-white)" />
      {/* cloth backing */}
      <rect x="4" y="1" width="9" height="7" fill="var(--ink-black)" />
      {/* checked cloth */}
      <rect x="5" y="2" width="4" height="3" fill="var(--kit-red)" />
      <rect x="9" y="2" width="3" height="3" fill="var(--amber)" />
      <rect x="5" y="5" width="4" height="2" fill="var(--amber)" />
      <rect x="9" y="5" width="3" height="2" fill="var(--kit-red)" />
      {/* grip */}
      <rect x="1" y="11" width="4" height="2" fill="var(--ink-black)" />
      <rect x="2" y="11" width="2" height="1" fill="var(--gold)" />
    </svg>
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

// ---------------------------------------------------------------------------
// TraitFiringLayer — the on-pitch beat for a defining trait that FIRED.
//
// The engine surfaces every firing in `IncrementResult.split.traitEvents`; this
// layer turns each into a visible beat anchored on the firing card's pitch
// coordinate (resolved by the caller, which knows the formation geometry).
//   • MOMENT kinds (cross/shot/setpiece/poach/tackle/offside) — a one-shot glyph
//     burst with a kind-appropriate motion, then clears (~600–900ms).
//   • AURA kinds (aura/engine) — a persistent breathing ring + glyph held for the
//     whole resolving increment (Leadership emanating, Engine Room late-game ring).
// Deterministic: placement is the card's slot; the only per-event variation is a
// stagger by event index so several firings read in sequence, not as mush.
// ---------------------------------------------------------------------------

// kind → the animation class + accent the firing plays. MOMENTS map to their
// bespoke keyframe; AURAS share the held ring. Accent reads the trait family
// colour (kit-blue deliveries, gold leadership, amber strikes, success defence).
const TRAIT_KIND_STYLE: Record<TraitKind, { accent: string; moment: boolean }> = {
  cross:    { accent: 'var(--kit-blue)',   moment: true },
  shot:     { accent: 'var(--amber)',      moment: true },
  setpiece: { accent: 'var(--gold)',       moment: true },
  poach:    { accent: 'var(--kit-red)',    moment: true },
  tackle:   { accent: 'var(--success)',    moment: true },
  offside:  { accent: 'var(--cream-soft)', moment: true },
  save:     { accent: 'var(--gold)',       moment: true },
  aura:     { accent: 'var(--gold)',       moment: false },
  engine:   { accent: 'var(--kit-blue)',   moment: false },
};

interface TraitFiring {
  key: string;          // stable per (cardId, traitName)
  x: number;            // pitch % left
  y: number;            // pitch % top
  glyph: string;
  label: string;
  blurb: string;        // one-line action description (for the feed callout)
  player: string | null; // firing player's surname (for the feed callout)
  kind: TraitKind;
  index: number;        // stagger order among the moment firings
}

/** One trait firing rendered on the pitch — PICTORIAL: the picture is the event
 *  (a travelling ball, an impact burst, a glove, a flag); no name banners. Names
 *  stay in the THIS SPELL feed. Moments flash and clear; auras hold as a glow. */
function TraitMarker({ firing, dur }: { firing: TraitFiring; dur: (ms: number) => string | undefined }) {
  const { accent, moment } = TRAIT_KIND_STYLE[firing.kind];
  // Stagger moments by ~700ms so they play as a SEQUENCE across the resolution
  // window (max 5 per spell), never a simultaneous burst.
  const delayMs = moment ? firing.index * 700 : 0;
  const delay = delayMs ? `${delayMs}ms` : undefined;

  if (!moment) {
    // AURA — a held, breathing glow ring on the card. Glow only, no label chip.
    return (
      <div style={{ position: 'absolute', left: `${firing.x}%`, top: `${firing.y}%`, zIndex: 8, pointerEvents: 'none' }}>
        <div className="trait-aura" style={{ position: 'absolute', left: 0, top: 0, width: CARD_W + 18, height: CARD_H + 18, transform: 'translate(-50%,-50%)', borderRadius: 'var(--radius)', border: `3px solid ${accent}`, boxShadow: `0 0 18px ${accent}, inset 0 0 10px ${accent}`, opacity: 0.85 }} />
      </div>
    );
  }

  const wrap: React.CSSProperties = { position: 'absolute', left: `${firing.x}%`, top: `${firing.y}%`, zIndex: 9, pointerEvents: 'none' };

  // TACKLE — an impact explosion: a tight flash then the full starburst.
  if (firing.kind === 'tackle') {
    return (
      <div style={wrap}>
        <div className="trait-burst-a" style={{ position: 'absolute', left: 0, top: 0, animationDelay: delay, animationDuration: dur(360) }}><BurstFlashGlyph /></div>
        <div className="trait-burst-b" style={{ position: 'absolute', left: 0, top: 0, animationDelay: delayMs ? `${delayMs + 120}ms` : '120ms', animationDuration: dur(640) }}><BurstBlastGlyph /></div>
      </div>
    );
  }

  // SAVE — the keeper's glove punches up and holds.
  if (firing.kind === 'save') {
    return (
      <div style={wrap}>
        <div className="trait-glove" style={{ position: 'absolute', left: 0, top: 0, animationDelay: delay, animationDuration: dur(900) }}><GloveGlyph /></div>
      </div>
    );
  }

  // OFFSIDE — the linesman's flag hinges up (existing raise motion, now a sprite).
  if (firing.kind === 'offside') {
    return (
      <div style={wrap}>
        <div className="trait-offside" style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)', animationDelay: delay, animationDuration: dur(820) }}><FlagGlyph /></div>
      </div>
    );
  }

  // BALL kinds — a pixel ball travels from the card toward the goal (your XI
  // attacks the top goal). Trajectory per kind via CSS vars; deterministic.
  //   shot: straight, long · cross: lateral arc into the box (toward the centre)
  //   setpiece: placed still, then struck · poach: a short sharp tap-in flick
  const toCentre = firing.x > 50 ? -1 : 1;
  const path: Record<'shot' | 'cross' | 'setpiece' | 'poach', { cls: string; tx: number; ty: number; ms: number }> = {
    shot:     { cls: 'trait-ball-fly',   tx: 0,             ty: -110, ms: 800 },
    cross:    { cls: 'trait-ball-fly',   tx: toCentre * 62, ty: -58,  ms: 850 },
    setpiece: { cls: 'trait-ball-place', tx: toCentre * 24, ty: -96,  ms: 1050 },
    poach:    { cls: 'trait-ball-fly',   tx: 0,             ty: -34,  ms: 520 },
  };
  const p = path[firing.kind as 'shot' | 'cross' | 'setpiece' | 'poach'] ?? path.shot;
  return (
    <div style={wrap}>
      <div
        className={p.cls}
        style={{
          position: 'absolute', left: 0, top: 0,
          ['--tx' as string]: `${p.tx}px`,
          ['--ty' as string]: `${p.ty}px`,
          animationDelay: delay,
          animationDuration: dur(p.ms),
          filter: `drop-shadow(0 0 6px ${accent})`,
        }}
      >
        <BallGlyph size={16} />
      </div>
    </div>
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

function yourPitch(
  matchState: MatchV5State,
  formation: Formation,
  playerStats: Record<number, PlayerMatchStat>,
): PitchSpot[] {
  const nums = numberSlots(formation.slots);
  return formation.slots.map((slot, i) => {
    const card = matchState.xi[i] ?? null;
    const band = bandOf(cellOf(slot.x, slot.y));
    const isGK = slot.type === 'GK' || card?.position === 'GK';
    const fitness = card?.fitness;
    // Per-match stats (read-side; effective power, rating, G/A, position-fit).
    const st = card ? playerStats[card.id] : undefined;
    const effPower = st?.effectivePower;
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
      effPower,
      tired: typeof effPower === 'number' && card ? effPower < Math.round(card.power) : false,
      // posFit defaults true when no stat row (e.g. mid-drag transient); only false flags a misfit.
      posFit: st ? st.posFit : true,
      matchRating: st?.rating,
      goals: st?.goals ?? 0,
      assists: st?.assists ?? 0,
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

// ---------------------------------------------------------------------------
// GoalLine + the goals ledger surfaces (Wave E req 4).
// A goal is scorer (+ assister) at a minute, coloured by side. Shared by the
// per-period stats screen and the team-talk ratings sheet so the record reads
// identically everywhere. Drawn from FeedLine (the engine beats).
// ---------------------------------------------------------------------------
interface GoalLine { time: string; text: string; type: 'goal-yours' | 'goal-opponent' | 'chance'; scorer: string | null; assister: string | null; side: 'you' | 'opp' }

/** A compact goals feed: one row per goal, scorer + assister, side-coloured. Used in
 *  the stats screen and the ratings sheet. `surnameOf` is passed in (the host owns
 *  the lastName import) so this stays a pure presentational helper. */
function GoalsFeed({ goals, surnameOf, delay = 0 }: { goals: GoalLine[]; surnameOf: (n: string) => string; delay?: number }) {
  if (goals.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {goals.map((g, i) => {
        const col = g.side === 'you' ? YOU : OPP;
        return (
          <div key={i} className="stat-row-in" style={{ display: 'flex', alignItems: 'center', gap: 7, animationDelay: `${delay + i * 50}ms` }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 30 }}>{g.time}</span>
            <span style={{ fontSize: 11, flexShrink: 0 }}>⚽</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.scorer ? surnameOf(g.scorer) : g.side === 'you' ? 'Your XI' : 'Opponent'}
            </span>
            {g.assister && (
              <span style={{ fontSize: 9.5, color: 'var(--dust)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {`assist ${surnameOf(g.assister)}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RatingsSheet — the per-player ratings panel (Wave E req 5).
//
// A bottom-sheet over the team-talk: every starter sorted by 0–10 rating, with
// the colour-coded rating badge · G/A · a banded fitness meter, so the player can
// read at a glance who to hook. Glass shell, pixel content. Internal scroll only —
// the page never scrolls. Pure presentational; the host owns playerStats + close.
// ---------------------------------------------------------------------------
function RatingRow({ st, rank }: { st: PlayerMatchStat; rank: number }) {
  const band = ratingBand(st.rating);
  return (
    <div
      className="stat-row-in"
      style={{
        display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', columnGap: 9,
        padding: '7px 9px', borderRadius: 'var(--radius-sm)',
        background: 'var(--surface)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)',
        animationDelay: `${rank * 35}ms`,
      }}
    >
      {/* Rating badge — colour-coded, the headline sort key. */}
      <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, textAlign: 'center', color: band.ink, background: band.fill, border: '1.5px solid var(--ink-black)', borderRadius: 3, padding: '4px 0', fontVariantNumeric: 'tabular-nums' }}>
        {st.rating.toFixed(1)}
      </span>
      {/* Name · position · effective power · G/A */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastName(st.name)}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.3, color: 'var(--line-white)', background: POSITION_COLOR[st.position] ?? 'var(--dust)', borderRadius: 2, padding: '2px 3px', lineHeight: 1, flexShrink: 0 }}>{st.position}</span>
          {!st.posFit && (
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.3, color: 'var(--line-white)', background: 'var(--danger)', borderRadius: 2, padding: '2px 3px', lineHeight: 1, flexShrink: 0 }}>OUT OF POS</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)' }}>PWR <b style={{ color: 'var(--cream-soft)' }}>{st.effectivePower}</b></span>
          {(st.goals > 0 || st.assists > 0) && (
            <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--gold)' }}>
              {st.goals > 0 ? `⚽${st.goals}` : ''}{st.goals > 0 && st.assists > 0 ? ' ' : ''}{st.assists > 0 ? `A${st.assists}` : ''}
            </span>
          )}
        </div>
      </div>
      {/* Fitness meter — the sub-decision tell. */}
      <div style={{ width: 54, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch' }}>
        <FitnessMeter fitness={st.fitness} />
        <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: fitnessColor(st.fitness), textAlign: 'right', lineHeight: 1 }}>FIT {Math.round(st.fitness)}/6</span>
      </div>
    </div>
  );
}

function RatingsSheet({ stats, goals, surnameOf, onClose }: { stats: PlayerMatchStat[]; goals: GoalLine[]; surnameOf: (n: string) => string; onClose: () => void }) {
  const sorted = [...stats].sort((a, b) => b.rating - a.rating);
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 23, background: 'rgba(2,9,5,0.62)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} className="scrim-fade">
      <div onClick={(e) => e.stopPropagation()} className="glass-raised sheen sheet-rise" style={{ display: 'flex', flexDirection: 'column', maxHeight: '82%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTop: '2px solid var(--gold)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, flexShrink: 0, position: 'relative', zIndex: 2 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
        </div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px 10px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0, position: 'relative', zIndex: 2 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--gold)', letterSpacing: 0.8 }}>PLAYER RATINGS</span>
          <button onClick={onClose} aria-label="Close ratings" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, marginRight: -8, background: 'none', border: 'none', color: 'var(--dust)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>{'×'}</button>
        </div>
        {/* Scroll region — the only thing that scrolls. */}
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '12px 14px 18px', WebkitOverflowScrolling: 'touch', position: 'relative', zIndex: 2 }}>
          {/* Goals ledger first — the record (req 4), then the sorted XI (req 5). */}
          {goals.length > 0 && (
            <>
              <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8, marginBottom: 6 }}>GOALS</div>
              <div style={{ marginBottom: 14 }}>
                <GoalsFeed goals={goals} surnameOf={surnameOf} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8 }}>YOUR XI · BY RATING</span>
            <span style={{ fontSize: 9, color: 'var(--dust)' }}>tap a player on the pitch to sub</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {sorted.map((st, i) => <RatingRow key={st.cardId} st={st} rank={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  stats, cumulative, minute, periodLabel, youName, oppName, scoreYou, scoreOpp, isFullTime,
  goals, surnameOf, onRatings, onContinue,
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
  /** Goals so far (scorer + assister), chronological — the per-match record (req 4). */
  goals: GoalLine[];
  surnameOf: (n: string) => string;
  /** Open the per-player ratings sheet (req 5). */
  onRatings: () => void;
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

          {/* GOALS FEED (req 4, FIX 2) — scorer + assister + minute for EVERY goal, no
              truncation. The list scrolls INTERNALLY when long so the page never does;
              the full record is always visible here, not just the last few. */}
          {goals.length > 0 && (
            <div className="stat-row-in" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)', background: 'var(--surface)', animationDelay: '55ms' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.6, color: 'var(--gold)' }}>GOALS</span>
                <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>{goals.length}</span>
              </div>
              {/* Scroll region: caps at ~5 rows tall, scrolls internally beyond that. */}
              <div style={{ maxHeight: 116, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }} className="tactic-sheet-scroll">
                <GoalsFeed goals={goals} surnameOf={surnameOf} delay={60} />
              </div>
            </div>
          )}
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

      {/* Footer — RATINGS opens the per-player marks (req 5: the sub-decision
          surface), CONTINUE advances. Full time hides RATINGS (no more subs to make). */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, marginTop: 12 }}>
        {!isFullTime && (
          <button onClick={onRatings} className="stat-row-in"
            style={{ flex: '0 0 116px', padding: '13px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 4px 0 0 var(--ink-black)', background: 'var(--surface)', color: 'var(--gold)', fontFamily: PIXEL, fontSize: 12, letterSpacing: 0.4, cursor: 'pointer', animationDelay: '300ms' }}>
            RATINGS
          </button>
        )}
        <button onClick={onContinue} className="advance-btn-pulse stat-row-in"
          style={{ flex: 1, padding: '13px 0', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 4px 0 0 var(--ink-black)', background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))', color: 'var(--cream)', fontFamily: PIXEL, fontSize: 15, cursor: 'pointer', animationDelay: '320ms' }}>
          {isFullTime ? 'FULL TIME →' : 'CONTINUE →'}
        </button>
      </div>
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
  matchState, formation, jokers, availableTactics, ownedFormations,
  opponentBuild, nextMinute, mode, breakMoment, currentResult, playerStats,
  onToggleTactic, onSub, onReassign, onFormationChange, onAutoSelect, onIntentChange, onContinue,
}: PitchMatchViewProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [oppView, setOppView] = useState(false);
  const [tickerOpen, setTickerOpen] = useState(false);
  const [formSheet, setFormSheet] = useState(false);
  // Wave E (req 5) — the per-player ratings sheet (opened from the team-talk).
  const [ratingsOpen, setRatingsOpen] = useState(false);
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

  const youSpots = useMemo(() => yourPitch(matchState, formation, playerStats), [matchState, formation, playerStats]);
  const rivalSpots = useMemo(() => rivalPitch(matchState), [matchState]);
  const spots = oppView ? rivalSpots : youSpots;

  // ISSUE 7 — the timeline comes from the real increment data.
  const timeline = useMemo(() => (currentResult ? buildTimeline(currentResult) : []), [currentResult]);
  const beat = beatIdx >= 0 && beatIdx < timeline.length ? timeline[beatIdx] : null;

  // ── DEFINING-TRAIT FIRINGS (Task #12) — the engine surfaces every trait that
  // fired this increment in `split.traitEvents`; we anchor each to the firing
  // card's pitch coordinate. Only firings for cards on the CURRENTLY VISIBLE side
  // render (events whose cardId isn't positioned on this pitch are skipped, never
  // crashed). Moments stagger by index so a busy spell reads in sequence; auras
  // hold the whole increment. Deduped defensively by (cardId, traitName). ──
  const traitFirings = useMemo<TraitFiring[]>(() => {
    if (mode !== 'resolve' || !currentResult) return [];
    const events = currentResult.split.traitEvents ?? [];
    if (events.length === 0) return [];
    // Position lookup for the visible pitch (your XI, or the rival when scouting).
    const byCard = new Map<number, PitchSpot>();
    for (const s of spots) if (s.cardId !== undefined) byCard.set(s.cardId, s);
    const out: TraitFiring[] = [];
    const seen = new Set<string>();
    let momentIdx = 0;
    for (const ev of events) {
      const key = `${ev.cardId}-${ev.traitName}`;
      if (seen.has(key)) continue;
      const spot = byCard.get(ev.cardId);
      if (!spot) continue; // card not on the visible pitch — skip, don't crash.
      seen.add(key);
      const copy = traitCopy(ev.traitName);
      // The VISUAL family (one-shot moment vs held aura) is driven by the trait's
      // kind so the pitch animation always matches the on-card pill — trait-copy
      // is the single source of truth both surfaces read.
      const isMoment = TRAIT_KIND_STYLE[copy.kind].moment;
      out.push({
        key,
        x: spot.slot.x,
        y: spot.slot.y,
        glyph: copy.glyph,
        label: copy.label,
        blurb: copy.blurb,
        player: spot.name,
        kind: copy.kind,
        index: isMoment ? momentIdx++ : 0,
      });
    }
    // Pace the pitch: at most 5 one-shot moments per spell (the feed still lists
    // every firing), so a busy increment reads as a SEQUENCE, not a simultaneous
    // burst. The wider stagger below spreads them across the resolution window.
    const MAX_MOMENTS = 5;
    let kept = 0;
    return out.filter((f) => {
      if (!TRAIT_KIND_STYLE[f.kind].moment) return true;
      kept += 1;
      return kept <= MAX_MOMENTS;
    });
  }, [mode, currentResult, spots]);

  // ── TRAIT CALLOUTS (Fix 1) — the same firings, surfaced as styled commentary
  // lines in the ticker while resolving, so a missed on-pitch flash is still
  // captured in the running feed ("⚑ DEADEYE — set-piece threat"). Auras lead
  // (they hold all increment), then moments in firing order. Capped for the strip. ──
  const traitCallouts = useMemo(
    () => traitFirings.map((f) => ({
      key: f.key,
      glyph: f.glyph,
      label: f.label,
      blurb: f.blurb,
      player: f.player,
      accent: TRAIT_KIND_STYLE[f.kind].accent,
      moment: TRAIT_KIND_STYLE[f.kind].moment,
    })),
    [traitFirings],
  );

  // ── THIS SPELL — the plan paying off (Tier B). The engine's own cascade
  // (split.attackBreakdown) carries the attack points each tactic / manager /
  // chemistry line contributed this increment; we surface exactly those lines,
  // label + value, summed by label, zeros dropped. Display-only. ──
  const planLines = useMemo(() => {
    if (!currentResult) return [];
    const agg = new Map<string, number>();
    for (const line of currentResult.split.attackBreakdown) {
      if (line.type !== 'tactic' && line.type !== 'manager' && line.type !== 'synergy') continue;
      agg.set(line.label, (agg.get(line.label) ?? 0) + line.value);
    }
    return [...agg.entries()]
      .filter(([, value]) => value !== 0)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)); // biggest first — the one-line row clips the tail
  }, [currentResult]);

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
  type FeedLine = { clock: number; time: string; text: string; type: 'goal-yours' | 'goal-opponent' | 'chance'; scorer: string | null; assister: string | null; side: 'you' | 'opp' };
  const beatToLine = (b: MatchBeat): FeedLine => ({
    clock: b.clock,
    time: b.time,
    text: b.text,
    type: b.outcome === 'goal' ? (b.side === 'you' ? 'goal-yours' : 'goal-opponent') : 'chance',
    scorer: b.scorerName,
    assister: b.assisterName,
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

  // ── Wave E (req 4) — the GOALS LEDGER: every goal so far, scorer + assister,
  // chronological. Drawn from the same feed so the resolve sequence and the team-talk
  // read identically. Pure derived from beats (deterministic). ──
  const goalsLedger = useMemo(
    () => feed.filter((l) => l.type === 'goal-yours' || l.type === 'goal-opponent'),
    [feed],
  );

  // ISSUE 6 — sensible pre-kickoff guidance (no fake minute, styled as a coach prompt).
  const preKickoff = feed.length === 0 && !resolving;

  // The 3-line ticker: live commentary leads while resolving (the synced line, coloured
  // by side); otherwise the most recent played lines. Deterministic — all from beats[].
  const tickerLines: (FeedLine | null)[] = feed.slice(-3);
  while (tickerLines.length < 3) tickerLines.unshift(null);

  const manager = jokers[0] ?? null;

  // ── CALLED PLAY (per-spell call; the 3-slot model is gone) ─────────────────
  // matchState.calledPlayId is THIS spell's call; playChargesUsed is the match's
  // used-charges ledger. The opponent's telegraphed play for the coming spell is
  // matchState.opponentPlay (Adaptive telegraphs 2 candidates — the real one plays).
  const calledPlay = useMemo<TacticCard | null>(
    () => (matchState.calledPlayId
      ? availableTactics.find((t) => t.id === matchState.calledPlayId) ?? getTacticById(matchState.calledPlayId) ?? null
      : null),
    [matchState.calledPlayId, availableTactics],
  );
  const playChargesUsed = useMemo(
    () => matchState.playChargesUsed ?? {},
    [matchState.playChargesUsed],
  );

  // The opponent's telegraph line(s) for the coming spell — plain factual engine
  // strings, verbatim. The Adaptive style telegraphs 2 candidates, joined " or ".
  const telegraphText = useMemo(() => {
    const ids = matchState.opponentPlayCandidates?.length
      ? matchState.opponentPlayCandidates
      : matchState.opponentPlay ? [matchState.opponentPlay.id] : [];
    const lines = ids
      .map((id) => getOpponentPlayById(id)?.telegraph)
      .filter((t): t is string => Boolean(t));
    return lines.join(' or ');
  }, [matchState.opponentPlayCandidates, matchState.opponentPlay]);

  // ── THREAT LANES — where the telegraphed play commits its attack. Read from
  // the play's records (attackLanes, plays.ts) rather than id-matching; only a
  // TARGETED read pulses (1–2 lanes — an overload/route-one), never a whole-field
  // amplify. The engine couples same-lane, so their lane L lands in your lane L. ──
  const threatLanes = useMemo<Lane[]>(() => {
    if (mode !== 'plan') return [];
    const ids = matchState.opponentPlayCandidates?.length
      ? matchState.opponentPlayCandidates
      : matchState.opponentPlay ? [matchState.opponentPlay.id] : [];
    const union = new Set<Lane>();
    for (const id of ids) {
      const play = getOpponentPlayById(id);
      if (!play) continue;
      const lanes = attackLanes(play.records);
      if (lanes.size > 0 && lanes.size <= 2) for (const l of lanes) union.add(l);
    }
    return [...union];
  }, [mode, matchState.opponentPlayCandidates, matchState.opponentPlay]);

  // ── THE HAND (display-only) ────────────────────────────────────────────────
  // The engine (onToggleTactic → callPlay in match-v5.ts) is the single source of
  // truth; here we mirror it to a state so a tap is never a silent no-op:
  //   • called   — the play called for THIS spell → tap clears the call
  //   • callable — charges remain                 → tap calls it (replacing any call)
  //   • blocked  — no charges left this match     → the call tap is disabled
  const callHand = useMemo(() => {
    return availableTactics.map((tactic) => {
      const left = chargesLeft(tactic, playChargesUsed);
      const state: CallState = calledPlay?.id === tactic.id
        ? 'called'
        : left > 0 ? 'callable' : 'blocked';
      return { tactic, state, left };
    });
  }, [availableTactics, calledPlay, playChargesUsed]);

  // ── CALL VERDICT + COUNTERFACTUAL IMPACT (resolve payoff, engine verbatim) ──
  // callGrade names how the call graded (neutral shows nothing); playImpact is
  // the engine's same-seed counterfactual xG swing — hidden when null / zero-ish
  // (rounds to 0.0 at one decimal).
  const callVerdict = useMemo(() => {
    if (!resolving || !currentResult) return null;
    const { callGrade, calledPlayName, opponentPlayName } = currentResult;
    if (!callGrade || callGrade === 'neutral' || !calledPlayName || !opponentPlayName) return null;
    return { answered: callGrade === 'answered', calledPlayName, opponentPlayName };
  }, [resolving, currentResult]);

  const impactChips = useMemo(() => {
    const pi = currentResult?.playImpact;
    if (!resolving || !pi) return [];
    const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} xG`;
    const chips: { key: string; label: string; text: string; color: string }[] = [];
    if (Math.abs(pi.yourCallXG) >= 0.05) {
      chips.push({ key: 'call', label: 'YOUR CALL', text: fmt(pi.yourCallXG), color: pi.yourCallXG > 0 ? 'var(--success)' : 'var(--danger)' });
    }
    if (Math.abs(pi.theirPlayXG) >= 0.05) {
      chips.push({ key: 'play', label: 'THEIR PLAY', text: fmt(pi.theirPlayXG), color: pi.theirPlayXG > 0 ? 'var(--danger)' : 'var(--success)' });
    }
    return chips;
  }, [resolving, currentResult]);

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

  const hasCallableTactic = availableTactics.some(
    (t) => t.id !== calledPlay?.id && chargesLeft(t, playChargesUsed) > 0,
  );
  // Nudge the YOUR CALL tab while no play is called and one could be.
  const showCallNudge = planning && !calledPlay && hasCallableTactic;

  // The team-talk break: planning, not scouting the opposition. At a real break
  // (kickoff / halftime / between) the coach panel and the SHAPE + TACTICS entry
  // points are surfaced prominently rather than left to the side rail.
  const isBreak = planning && breakMoment !== null;

  // Wave E (req 5) — the per-player ratings, as a list keyed to the current XI (in
  // XI order). `hasPlayed` gates the ratings surfaces (no marks before kickoff);
  // `hasPoorRating` nudges the RATINGS button when a starter is underperforming.
  const playerStatsList = useMemo<PlayerMatchStat[]>(
    () => xi.map((c) => playerStats[c.id]).filter((s): s is PlayerMatchStat => !!s),
    [xi, playerStats],
  );
  const hasPlayed = matchState.scores.length > 0;
  const hasPoorRating = hasPlayed && playerStatsList.some((s) => s.rating < 6);

  // FIX 5 — the assistant's reads for this break (assistant.coachNotes). The
  // 'tactics' kind is dropped display-side: it only restates the slot count the
  // plan strip already shows. What remains (weakness / fitness / momentum) is
  // genuinely situational; when nothing remains the panel doesn't render.
  const notes = useMemo<CoachNote[]>(
    () => (isBreak ? coachNotes(matchState, {
      weaknessLabel: opponentBuild.weakness,
    }).filter((n) => n.kind !== 'tactics') : []),
    [isBreak, matchState, opponentBuild.weakness],
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
      /* Ticker — three lines, tap to expand. Pre-kickoff shows a coach prompt.
         While resolving, the firing TRAITS take the ticker as styled callouts so
         a missed on-pitch flash is still captured in the running commentary. */
      <button onClick={() => setTickerOpen(true)} style={{ textAlign: 'left', margin: '0 16px 10px', padding: '8px 12px', borderRadius: 'var(--radius)', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', flexShrink: 0, cursor: 'pointer', display: 'grid', gap: 3 }}>
        {preKickoff ? (
          // ISSUE 6 — guidance, not a fake match event (no minute stamp).
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 51 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--ink-black)', background: 'var(--amber)', borderRadius: 3, padding: '3px 5px', lineHeight: 1, flexShrink: 0 }}>COACH</span>
            <span style={{ fontSize: 12, color: 'var(--cream-soft)', lineHeight: 1.35 }}>Set your XI and shape, then kick off. Drag a player to swap; tap to inspect.</span>
          </div>
        ) : resolving && (planLines.length > 0 || traitCallouts.length > 0 || impactChips.length > 0) ? (
          // THIS SPELL — ONE panel for "your plan paid off": the call's
          // counterfactual xG chips (engine playImpact, verbatim), the cascade's
          // tactic / manager / chemistry lines (label + attack points, straight
          // off the engine), then the trait firings beneath.
          <div data-this-spell style={{ display: 'grid', gap: 3, minHeight: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>THIS SPELL</span>
              {traitCallouts.length > 2 && (
                <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--dust)', marginLeft: 'auto' }}>+{traitCallouts.length - 2} MORE</span>
              )}
            </div>
            {/* COUNTERFACTUAL CHIPS — the call's net xG swing this spell (same seed,
                re-read without the play). + on YOUR CALL favours you (green); + on
                THEIR PLAY favours them (red). Hidden when null / zero-ish. */}
            {impactChips.length > 0 && (
              <div data-play-impact style={{ display: 'flex', alignItems: 'center', gap: 5, height: 18 }}>
                {impactChips.map((c, i) => (
                  <span key={c.key} className="kc-impact-chip" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '3px 5px', borderRadius: 3, border: `1px solid ${c.color}`, background: 'rgba(0,0,0,0.3)', animationDelay: `${i * 70}ms`, lineHeight: 1, flexShrink: 0 }}>
                    <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.3, color: 'var(--dust)' }}>{c.label}</span>
                    <span style={{ fontFamily: PIXEL, fontSize: 8.5, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.text}</span>
                  </span>
                ))}
              </div>
            )}
            {planLines.length > 0 && (
              <div data-plan-line className="coach-line-in" style={{ display: 'flex', alignItems: 'baseline', gap: 0, height: 16, lineHeight: '16px', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
                {planLines.map((p, i) => (
                  <span key={p.label} style={{ display: 'inline-flex', alignItems: 'baseline', flexShrink: i === 0 ? 0 : undefined, minWidth: 0 }}>
                    {i > 0 && <span style={{ color: 'var(--dust)', fontSize: 10, padding: '0 5px' }}>·</span>}
                    <span style={{ fontSize: 10.5, color: 'var(--cream-soft)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
                    <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: p.value > 0 ? 'var(--gold)' : 'var(--danger)', marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{p.value > 0 ? `+${p.value}` : p.value}</span>
                  </span>
                ))}
              </div>
            )}
            {traitCallouts.slice(0, 2).map((c) => (
              <div key={c.key} data-trait-callout className="coach-line-in" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, height: 16, lineHeight: '16px' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 11, color: c.accent, flexShrink: 0, width: 13, textAlign: 'center' }}>{c.glyph}</span>
                <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.3, color: c.accent, flexShrink: 0 }}>{c.label.toUpperCase()}</span>
                <span style={{ color: 'var(--cream-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {c.player ? `${c.player} — ` : ''}{c.blurb}
                </span>
              </div>
            ))}
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

      {/* ── BREAK CONSOLE — the Called Plays instrument (the 3-slot plan strip is
          gone). One glass panel, two rows:
            Row 1 · THE TELEGRAPH — the opponent's play for the coming spell,
            verbatim (Adaptive shows both candidates, "X or Y"). The problem
            statement of the break. DETAILS opens the full play sheet (manager +
            full effects + charges).
            Row 2 · YOUR HAND — every owned play as a call pill: tap = call for
            this spell, tap the called play again = clear, no charges = disabled.
          Shown at every planning break (the pre-kickoff talk shows the first
          telegraph, rolled at init); the hand hides while scouting the rival. */}
      {mode === 'plan' && (
        <div className="glass-surface sheen" style={{ margin: '0 16px 8px', borderRadius: 'var(--radius)', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: oppView ? '8px 10px' : '7px 10px 6px', borderBottom: oppView ? 'none' : '1px solid var(--glass-border)', position: 'relative', zIndex: 2 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--line-white)', background: 'var(--kit-red)', border: '1px solid var(--ink-black)', borderRadius: 3, padding: '3px 4px', lineHeight: 1, flexShrink: 0 }}>OPP PLAY</span>
            <span data-telegraph style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--cream)', lineHeight: 1.25, minWidth: 0, flex: 1 }}>{telegraphText || '—'}</span>
            {!oppView && (
              <button onClick={() => setTrayOpen(true)} aria-label="Play details"
                style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, background: 'none', border: 'none', color: 'var(--dust)', fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.4, cursor: 'pointer', padding: '8px 0 8px 8px', lineHeight: 1 }}>
                DETAILS <span style={{ fontSize: 9 }}>{'›'}</span>
              </button>
            )}
          </div>
          {!oppView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px 8px', position: 'relative', zIndex: 2 }}>
              <span className={showCallNudge ? 'carrier-glow' : undefined}
                style={{ flexShrink: 0, fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: showCallNudge ? 'var(--ink-black)' : 'var(--dust)', background: showCallNudge ? 'var(--amber)' : 'rgba(0,0,0,0.3)', border: '1px solid var(--ink-black)', borderRadius: 3, padding: '3px 4px', lineHeight: 1.35, width: 32, textAlign: 'center' }}>
                YOUR CALL
              </span>
              <div className="kc-call-row" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden', flex: 1, minWidth: 0 }}>
                {callHand.length === 0 && <span style={{ fontSize: 10, color: 'var(--dust)' }}>No plays drafted for this fixture.</span>}
                {callHand.map(({ tactic, state, left }) => (
                  <CallPill key={tactic.id} tactic={tactic} state={state} left={left}
                    onCall={() => onToggleTactic(tactic.id)}
                    onInspect={() => setModal({ variant: 'tactic', tactic })} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CALL VERDICT — the resolve payoff, in the console's slot. Names both
          plays; answered = green, countered = red; a neutral grade (or no call)
          shows nothing. Engine strings verbatim (IncrementResult). ── */}
      {callVerdict && (
        <div className="kc-verdict-in glass-surface" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 16px 8px', padding: '7px 10px', borderRadius: 'var(--radius)', border: `2px solid ${callVerdict.answered ? 'var(--success)' : 'var(--danger)'}`, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: callVerdict.answered ? 'var(--ink-black)' : 'var(--line-white)', background: callVerdict.answered ? 'var(--success)' : 'var(--danger)', border: '1px solid var(--ink-black)', borderRadius: 3, padding: '3px 5px', lineHeight: 1, flexShrink: 0, position: 'relative', zIndex: 2 }}>
            {callVerdict.answered ? 'ANSWERED' : 'COUNTERED'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--cream)', lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative', zIndex: 2 }}>
            <b>{callVerdict.calledPlayName}</b> met <b>{callVerdict.opponentPlayName}</b>
          </span>
        </div>
      )}

      {/* INTENT — the attacking lean (DEF/BAL/ATT). Surfaced in the team talk so the
          player can change it between periods; the engine reads state.intent fresh each
          increment, so it bites from the next period. A change mid-talk also refreshes
          the coach's momentum read. */}
      {isBreak && onIntentChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 16px 6px', flexShrink: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: 'var(--dust)', flexShrink: 0 }}>INTENT</span>
          <div className="flex" style={{ flex: 1, borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', overflow: 'hidden' }}>
            {INTENT_OPTIONS.map((it) => {
              const on = matchState.intent === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => onIntentChange(it.id)}
                  className="active:scale-95"
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontFamily: PIXEL,
                    fontSize: 10,
                    letterSpacing: 0.5,
                    background: on ? it.accent : 'var(--surface)',
                    color: on ? 'var(--ink-black)' : 'var(--cream-soft)',
                    transition: 'background 0.15s ease',
                    cursor: 'pointer',
                  }}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FIX 1 + FIX 4 — the TEAM-TALK action row. At a break the player's levers
          are surfaced together as proper buttons rather than buried in a side rail:
          change SHAPE, read RATINGS (once a period's played), and (pre-kickoff only)
          AUTO-PICK the strongest fitness-aware XI. TACTICS is NOT repeated here —
          the plan strip's trigger above is the one entry. Only shown at a real
          break, not while scouting the opposition or mid-resolve. */}
      {isBreak && (
        <div style={{ display: 'flex', gap: 6, margin: '0 16px 8px', flexShrink: 0 }}>
          <button onClick={() => setFormSheet(true)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 6px', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', boxShadow: '0 3px 0 0 var(--ink-black)', background: 'var(--surface)', cursor: 'pointer' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.4, color: 'var(--kit-blue)', lineHeight: 1 }}>SHAPE</span>
            <span style={{ fontSize: 9.5, color: 'var(--cream-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{formation.name}</span>
          </button>
          {/* RATINGS (req 5) — open the per-player ratings sheet to decide who to hook.
              Shown once a period's been played; pulses if anyone's rating is poor. */}
          {hasPlayed && (
            <button onClick={() => setRatingsOpen(true)}
              className={hasPoorRating ? 'carrier-glow' : undefined}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 6px', borderRadius: 'var(--radius)', border: `2px solid ${hasPoorRating ? 'var(--danger)' : 'var(--ink-black)'}`, boxShadow: '0 3px 0 0 var(--ink-black)', background: hasPoorRating ? 'rgba(232,54,47,0.12)' : 'var(--surface)', cursor: 'pointer' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.4, color: hasPoorRating ? 'var(--danger)' : 'var(--gold)', lineHeight: 1 }}>RATINGS</span>
              <span style={{ fontSize: 9.5, color: 'var(--cream-soft)', lineHeight: 1 }}>{hasPoorRating ? 'check the XI' : 'player marks'}</span>
            </button>
          )}
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

        {/* ── TELEGRAPH LANE PULSE (planning) — where the telegraphed play commits
            its attack, read from the play's records. Their commitment lands in
            YOUR half (same lane), so the band shades the defensive end toward
            your goal. Subtle breathing tint under the player cards; static under
            reduced motion. Your-team view only (the rival view flips ends). ── */}
        {mode === 'plan' && !oppView && threatLanes.map((lane) => (
          <div key={`threat-${lane}`} className="kc-lane-pulse" aria-hidden
            style={{ position: 'absolute', left: `${LANE_X[lane] - 11}%`, width: '22%', top: '50%', height: '46%', background: 'linear-gradient(180deg, transparent, var(--kit-red))', borderRadius: 4, zIndex: 1, pointerEvents: 'none' }} />
        ))}

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
          // Wave E (req 3) — a wrong-position starter. Reuses the Team Talk vocabulary:
          // a red ring on the card + a red position tab/rail (in PitchCard).
          const misfit = !oppView && spot.posFit === false && !spot.isGK;
          // The card's accent rail / ring: hover & drop targets take gold; a flagged
          // or injured/misfit card takes its status colour; otherwise the rarity colour.
          const rarityAccent = spot.rarity ? RARITY_COLOR[spot.rarity] ?? RARITY_COLOR.Common : 'var(--dust)';
          const ringColor = isHover || isDropTarget ? 'var(--gold)'
            : isFlagged ? 'var(--amber)'
            : condition === 'injured' ? 'var(--danger)'
            : misfit ? 'var(--danger)'
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
                {/* Goal/assist badges (req 4) — a ⚽ ball on a scorer, a 👟 boot on an
                    assister, sitting OUTSIDE the card frame (bottom-right). Persist all
                    match. Yours only (rivals carry no per-match record). */}
                {!oppView && !isDragging && (
                  <GoalAssistBadges goals={spot.goals ?? 0} assists={spot.assists ?? 0} />
                )}
                {/* fitness / injury flag, top-left corner. */}
                {condition && (
                  <span aria-label={condition === 'injured' ? 'Injured' : 'Low fitness'}
                    style={{ position: 'absolute', top: -5, left: -5, width: 14, height: 14, borderRadius: '50%', background: condition === 'injured' ? 'var(--danger)' : 'var(--amber)', border: '1.5px solid var(--ink-black)', color: condition === 'injured' ? 'var(--line-white)' : 'var(--ink-black)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>{condition === 'injured' ? '+' : '!'}</span>
                )}
                {/* Wave E (req 3) — wrong-position pip, top-left (offset below a condition
                    pip when both apply). A red 'X' tag matching the Team Talk misfit colour. */}
                {misfit && (
                  <span aria-label="Out of position"
                    style={{ position: 'absolute', top: condition ? 11 : -5, left: -5, height: 14, padding: '0 3px', borderRadius: 4, background: 'var(--danger)', border: '1.5px solid var(--ink-black)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.2, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>POS</span>
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

        {/* ---- DEFINING-TRAIT FIRINGS (Task #12) ---- a beat per trait that fired
            this increment, anchored on its card. Moments flash & clear (staggered);
            auras hold the whole increment. Sits below the goal eruption in z. */}
        {resolving && traitFirings.map((f) => (
          <TraitMarker key={f.key} firing={f} dur={dur} />
        ))}

        {/* GOAL / CONCEDED eruption (driven by the goal beat) — names its hero.
            The scorer (and assister) ride beneath the word so a goal isn't anonymous;
            both come off the engine's MatchBeat (beat.source), surnamed via lastName. */}
        {resolving && beat && beat.kind === 'goal' && (() => {
          const scorer = beat.source?.scorerName ?? null;
          const assister = beat.source?.assisterName ?? null;
          const scored = beat.side === 'you';
          const accent = scored ? 'var(--success)' : 'var(--danger)';
          return (
            <div key={`erupt-${beatIdx}`} className="goal-erupt" style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 10, pointerEvents: 'none', display: 'grid', justifyItems: 'center', gap: 5, whiteSpace: 'nowrap', animationDuration: dur(1450) }}>
              <span style={{ fontFamily: PIXEL, fontSize: scored ? 40 : 34, lineHeight: 1, color: accent, textShadow: '0 3px 0 var(--ink-black)' }}>
                {scored ? 'GOAL!' : 'CONCEDED'}
              </span>
              {/* Scorer's surname — the named hero. Falls back to the side when the
                  engine couldn't attribute the goal (e.g. an own-goal / no scorer). */}
              <span style={{ fontFamily: PIXEL, fontSize: 14, lineHeight: 1, color: 'var(--cream)', background: 'var(--surface)', border: `2px solid ${accent}`, borderRadius: 'var(--radius-sm)', padding: '4px 8px', boxShadow: '0 2px 0 0 var(--ink-black)', letterSpacing: 0.4 }}>
                {scorer ? lastName(scorer).toUpperCase() : scored ? 'YOUR XI' : 'OPPONENT'}
              </span>
              {assister && (
                <span style={{ fontFamily: PIXEL, fontSize: 8.5, lineHeight: 1, color: 'var(--dust)', letterSpacing: 0.3 }}>
                  {`ASSIST · ${lastName(assister).toUpperCase()}`}
                </span>
              )}
              {/* The play that produced it — a goal in a lane your CALLED play
                  boosted carries the play's name (beat.viaPlay, gold); otherwise
                  the engine's emergent pattern name. Yours only. */}
              {scored && (() => {
                const via = beat.source?.viaPlay ?? null;
                const label = via ? `VIA ${via.toUpperCase()}` : currentResult?.split.playName?.toUpperCase() ?? null;
                if (!label) return null;
                return (
                  <span style={{ fontFamily: PIXEL, fontSize: 7.5, lineHeight: 1, color: via ? 'var(--gold)' : 'var(--dust)', letterSpacing: 0.4 }}>
                    {label}
                  </span>
                );
              })()}
            </div>
          );
        })()}

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
            CONTINUE for every later advance. While resolving, this is the SINGLE
            tap-gate (the per-period stats screen carries the real CONTINUE once the
            animation finishes). DEAD-AIR FIX: the resolving state is no longer a
            frozen grey frame — it reads as LIVE: a match-green tint, a sweeping
            sheen, a breathing ellipsis and the ticking clock, so the period feels
            in motion while the pitch animations play. */}
        <button onClick={onContinue} disabled={resolving}
          className={resolving ? undefined : 'advance-btn-pulse'}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '11px 0', borderRadius: 'var(--radius)', border: `2px solid ${resolving ? 'var(--success)' : 'var(--ink-black)'}`, boxShadow: '0 4px 0 0 var(--ink-black)', background: resolving ? 'linear-gradient(135deg, #143a24, #0f2c1b)' : 'linear-gradient(135deg, var(--amber), var(--amber-soft))', color: resolving ? 'var(--cream)' : 'var(--cream)', fontFamily: PIXEL, fontSize: 15, cursor: resolving ? 'default' : 'pointer', transition: 'background 200ms, color 200ms' }}>
          {resolving ? (
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, zIndex: 1 }}>
              {/* Live dot — mirrors the header's resolving status pulse. */}
              <span className="carrier-glow" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)', flexShrink: 0 }} />
              <span style={{ letterSpacing: 0.6 }}>PLAYING</span>
              {/* Breathing ellipsis — the dead-air tell that the frame is alive. */}
              <span aria-hidden style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="playing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--cream-soft)', animationDelay: `${i * 180}ms` }} />
                ))}
              </span>
              {/* Live clock — the period visibly ticking under the CTA. */}
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream-soft)', fontVariantNumeric: 'tabular-nums', marginLeft: 2 }}>{clockMMSS}</span>
            </span>
          ) : (isFirstKickoff ? 'KICK OFF →' : 'CONTINUE →')}
          {/* A slow sheen sweep across the resolving CTA — never a dead frame. */}
          {resolving && (
            <span aria-hidden className="playing-sweep" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 35%, rgba(52,196,106,0.22) 50%, transparent 65%)', pointerEvents: 'none' }} />
          )}
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
            {feed.length === 0 ? <div style={{ fontSize: 12, color: 'var(--dust)' }}>Kickoff — no events yet.</div> : feed.slice().reverse().map((e, i) => {
              const isGoal = e.type !== 'chance';
              return (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, lineHeight: 1.55, color: lineColour(e), padding: '2px 0' }}>
                  <span style={{ color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{e.time}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', alignSelf: 'center', flexShrink: 0, background: e.side === 'you' ? 'var(--success)' : 'var(--danger)' }} />
                  <span style={{ flex: 1, fontWeight: isGoal ? 800 : 400 }}>{e.text}</span>
                  {/* Scorer + assister (req 4) — goals carry their author and creator. */}
                  {isGoal && e.scorer && (
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, lineHeight: 1.2 }}>
                      <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--cream-soft)' }}>{`⚽ ${lastName(e.scorer)}`}</span>
                      {e.assister && <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>{`A · ${lastName(e.assister)}`}</span>}
                    </span>
                  )}
                </div>
              );
            })}
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

            {/* Header — title + close, and the live call readout beneath. */}
            <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--amber)', letterSpacing: 0.8 }}>CALL A PLAY</span>
                <button onClick={() => setTrayOpen(false)} aria-label="Close plays" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, marginRight: -8, background: 'none', border: 'none', color: 'var(--dust)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>{'×'}</button>
              </div>
              {/* THE CALL — one play per spell; charges are per match. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <span title={calledPlay ? calledPlay.name : 'No play called'} style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: calledPlay ? PLAY_CLASS_COLOR[calledPlay.playClass] ?? 'var(--amber)' : 'transparent', border: `2px solid ${calledPlay ? PLAY_CLASS_COLOR[calledPlay.playClass] ?? 'var(--amber)' : 'var(--border)'}` }} />
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.5 }}>
                  THIS SPELL
                </span>
                <span style={{ fontSize: 10, color: 'var(--cream-soft)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {calledPlay ? calledPlay.name : 'No play called — one per spell'}
                </span>
              </div>
              {/* THE TELEGRAPH — the opponent's play for the coming spell. */}
              {telegraphText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, padding: '6px 9px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--kit-blue)', background: 'rgba(58,110,165,0.10)' }}>
                  <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--ink-black)', background: 'var(--kit-blue)', borderRadius: 3, padding: '3px 4px', lineHeight: 1, flexShrink: 0 }}>READ</span>
                  <span style={{ fontSize: 10, color: 'var(--cream-soft)', lineHeight: 1.3, overflow: 'hidden' }}>
                    Next spell: <b style={{ color: 'var(--cream)' }}>{telegraphText}</b>.
                  </span>
                </div>
              )}
              {/* FIX 3 — the opponent read in the shelf: their PLAY style + the SOFT
                  SPOT to exploit, so the player picks a play with the rival in mind. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, padding: '6px 9px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--success)', background: 'rgba(52,196,106,0.08)' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--ink-black)', background: 'var(--success)', borderRadius: 3, padding: '3px 4px', lineHeight: 1, flexShrink: 0 }}>SCOUT</span>
                <span style={{ fontSize: 10, color: 'var(--cream-soft)', lineHeight: 1.3, overflow: 'hidden' }}>
                  <b style={{ color: 'var(--cream)' }}>{opponentBuild.name}</b> play <b style={{ color: 'var(--cream)' }}>{oppStyleLabel}</b> — soft spot <b style={{ color: 'var(--success)' }}>{opponentBuild.weakness.toLowerCase()}</b>.
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

              {/* The plays — full effects; same call/clear tap as the hand row. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8 }}>PLAYS</span>
                <span style={{ fontSize: 9, color: 'var(--dust)' }}>{availableTactics.length} in deck</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {callHand.length === 0 && <div style={{ fontSize: 11, color: 'var(--dust)' }}>No plays drafted for this fixture.</div>}
                {callHand.map(({ tactic, state, left }) => {
                  const accent = PLAY_CLASS_COLOR[tactic.playClass] ?? 'var(--gold)';
                  const blocked = state === 'blocked';
                  const called = state === 'called';
                  // The border tells the state apart: accent = the called play,
                  // ink = callable, muted = out of charges (disabled).
                  const borderColor = called ? accent : blocked ? 'var(--border)' : 'var(--ink-black)';
                  // Top-right status label — the action a tap performs RIGHT NOW.
                  const label = called ? 'CALLED' : blocked ? 'NO CHARGES' : 'TAP TO CALL';
                  const labelColor = called ? accent : blocked ? 'var(--dust)' : 'var(--success)';
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
                        background: called ? `linear-gradient(165deg, color-mix(in srgb, ${accent} 14%, var(--surface)), var(--surface))` : 'var(--surface)',
                        border: `2px solid ${borderColor}`,
                        opacity: blocked ? 0.5 : 1,
                        position: 'relative', overflow: 'hidden',
                      }}>
                      {/* play-class accent rail — the call's identity colour */}
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 2, background: accent, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tactic.name}</span>
                        </span>
                        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: labelColor, letterSpacing: 0.3, flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 3, lineHeight: 1.4, paddingLeft: 4 }}>{tactic.effect}</div>
                      {/* STATE LINE — charges remaining (dots + words), and the clear action. */}
                      {called && (
                        <div style={{ fontSize: 9.5, color: accent, marginTop: 6, paddingLeft: 4 }}>Called this spell — tap to clear</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 4 }}>
                        <ChargeDots left={left} total={tactic.charges} accent={accent} />
                        <span style={{ fontSize: 9.5, color: blocked ? 'var(--dust)' : 'var(--cream-soft)', lineHeight: 1 }}>
                          {left} of {tactic.charges} charge{tactic.charges === 1 ? '' : 's'} left this match
                        </span>
                      </div>
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
          goals={goalsLedger}
          surnameOf={lastName}
          onRatings={() => setRatingsOpen(true)}
          onContinue={onContinue}
        />
      )}

      {/* Wave E (req 5) — the per-player ratings sheet (team-talk). Sorted by rating,
          with the goals ledger (req 4) on top. Glass shell, pixel content. */}
      {ratingsOpen && (
        <RatingsSheet
          stats={playerStatsList}
          goals={goalsLedger}
          surnameOf={lastName}
          onClose={() => setRatingsOpen(false)}
        />
      )}

      {/* Full-card overlay — tap any player (yours, GK included) to inspect. */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
