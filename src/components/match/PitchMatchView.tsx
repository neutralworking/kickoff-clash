'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchV5State, IncrementResult, MatchBeat, MatchStats, ContestStats, PlayerMatchStat, MatchForecast } from '../../lib/match-v5';
import type { PointMod } from '../../lib/points';
import type { Formation, FormationSlot } from '../../lib/formations';
import { getFormation } from '../../lib/formations';
import type { Band, Lane } from '../../lib/field';
import { cellOf, bandOf } from '../../lib/field';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import { TACTIC_SLOTS } from '../../lib/match-v5';
import { deriveStats } from '../../lib/funnel';
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
import { portraitBackgroundStyle, rarityFrame, HERO, fitnessColor as heroFitnessColor } from '../cards/portrait';

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
  /** LIVE per-card effective ATK/DEF (split.cardStats): plan mode reads a preview of
   *  the CURRENT plan; resolve mode reads the resolved split. Includes every trait,
   *  manager, tactic and opposition effect — the player-facing feedback numbers. */
  cardStats: Record<number, { atk: number; def: number; baseAtk: number; baseDef: number }>;
  /** The receipt behind each card's live numbers (split.cardMods): every flat
   *  modifier by source. Tap a card's ATK/DEF pair to read it. */
  cardMods: Record<number, PointMod[]>;
  /** The forecast header (split.forecast): ATTACK v DEFENCE sums, +/- and NET. */
  forecast: MatchForecast;
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
const FURNITURE = 'rgba(255,255,255,0.22)'; // §6 white pitch furniture on the mow-stripe green
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
  fitness?: number;       // 0–100 dynamic condition
  injured?: boolean;
  lowFitness?: boolean;   // fitness < 50 (engine's injury-risk threshold)
  // ── PER-MATCH READOUT (Wave E) — read-side stats off playerMatchStats. ──
  effPower?: number;      // fitness-adjusted power (the on-pitch level)
  tired?: boolean;        // effPower < base power → legible "down on power" tell
  // ── LIVE two-stat readout (split.cardStats) — the feedback numbers. ──
  atkEff?: number;        // effective ATK right now (traits/manager/tactics/cascade folded in)
  defEff?: number;        // effective DEF right now
  baseAtk?: number;       // the printed card ATK (colour reference)
  baseDef?: number;       // the printed card DEF
  posFit?: boolean;       // false → playing out of position (a wrong-slot warning)
  matchRating?: number;   // 0–10 in-match rating
  goals?: number;         // goals scored this match
  assists?: number;       // assists this match
  booked?: boolean;       // carries a yellow card this match
  sentOff?: boolean;      // red-carded — off the pitch, points out of every contest
}


const LOW_FITNESS = 50; // matches the engine's injury-risk threshold (advanceIncrement)
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

/** A compact banded fitness meter (6 ticks) — fills proportional to live 0–100 condition.
 *  Colour comes from portrait.ts fitnessColor (the canonical band fn), so this can't drift
 *  from the card/pitch. Pixel-flat (no blur/soft shadow on the bars), banded to read fast. */
function FitnessMeter({ fitness }: { fitness: number }) {
  const pct = Math.max(0, Math.min(100, fitness));
  const filled = Math.round((pct / 100) * 6);
  const col = heroFitnessColor(fitness);
  return (
    <div aria-label={`Fitness ${Math.round(pct)} of 100`} style={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1, height: 4, borderRadius: 1,
            background: i < filled ? col : 'rgba(0,0,0,0.45)',
            border: '0.5px solid rgba(7,16,11,0.6)',
          }}
        />
      ))}
    </div>
  );
}

/** A single overhanging corner bubble on the pitch card (§6). 19px, offset -8. */
function CornerBubble({
  corner, border, valueColor, value, onTap, label,
}: {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  border: string;
  valueColor: string;
  value: string | number;
  onTap?: () => void;
  label?: string;
}) {
  const pos: React.CSSProperties =
    corner === 'tl' ? { top: -8, left: -8 }
      : corner === 'tr' ? { top: -8, right: -8 }
        : corner === 'bl' ? { bottom: -8, left: -8 }
          : { bottom: -8, right: -8 };
  return (
    <span
      role={onTap ? 'button' : undefined}
      aria-label={label}
      onPointerDown={onTap ? (e) => e.stopPropagation() : undefined}
      onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
      style={{
        position: 'absolute', ...pos, width: 19, height: 19, borderRadius: '50%',
        background: '#171207',
        border: `1.5px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 0 rgba(0,0,0,0.5)', zIndex: 6,
        cursor: onTap ? 'pointer' : undefined,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 6.5, lineHeight: 1, color: valueColor, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

function PitchCard({
  spot, side, accent, dim, glow, onStatTap,
}: {
  spot: PitchSpot;
  side: 'you' | 'opp';
  accent: string;        // rarity ring / top rail colour (fallback for id-less tokens)
  dim?: boolean;         // dragged-from card fades
  glow?: boolean;        // carrier glow during resolve
  /** Tap the ATK/DEF bubbles → open this card's modifier receipt. */
  onStatTap?: () => void;
}) {
  const youKit = side === 'you';
  // ── Pixel-Hero foil frame is the rarity axis (§6). Misfit reddens the frame. ──
  const frameSpec = rarityFrame(spot.rarity);
  const showStats = youKit; // rivals carry no live per-match stats
  const misfit = showStats && spot.posFit === false && !spot.isGK;
  const frameBg = misfit
    ? 'linear-gradient(135deg, #e0332d, #7a1f1c)'
    : frameSpec.frame;
  // FIT bubble reads the live 0–100 condition directly, coloured by band.
  const fitPct = typeof spot.fitness === 'number' ? Math.round(Math.max(0, Math.min(100, spot.fitness))) : null;
  const goals = spot.goals ?? 0;
  return (
    <div style={{ width: CARD_W, position: 'relative', opacity: dim ? 0.3 : 1 }} className={glow ? 'carrier-glow' : undefined}>
      {/* Event chips centred ABOVE the card (§6): goal chip / yellow-card rect. */}
      {showStats && (goals > 0 || (spot.booked && !spot.sentOff)) && (
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3, alignItems: 'center', zIndex: 7, pointerEvents: 'none' }}>
          {goals > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: PIXEL, fontSize: 6, color: HERO.cream, background: 'rgba(11,7,3,0.92)', border: `1px solid ${HERO.gold}66`, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', lineHeight: 1 }}>
              <BallGlyph size={7} />{goals > 1 ? goals : ''}
            </span>
          )}
          {spot.booked && !spot.sentOff && (
            <span aria-label="Booked" style={{ width: 6, height: 9, background: '#f5c542', border: `1px solid ${HERO.ink}`, borderRadius: 1 }} />
          )}
        </div>
      )}
      {/* Foil frame → clipped pixel interior (portrait + name). */}
      <div style={{ borderRadius: 7, padding: 2, background: frameBg, boxShadow: spot.isStar ? '0 2px 0 0 #0b0703, 0 4px 8px rgba(0,0,0,0.45), 0 0 12px rgba(232,178,60,0.5)' : '0 2px 0 0 #0b0703, 0 4px 8px rgba(0,0,0,0.45)' }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 5, border: `1.5px solid ${HERO.ink}`, background: 'linear-gradient(165deg, #2f2415, #191309)' }}>
          {/* Position badge — top-left inside the face (the corner bubbles overhang
              OUTSIDE the card, so this stays clear). Coloured by position family. */}
          {spot.position && (
            <span style={{ position: 'absolute', top: 2, left: 2, zIndex: 2, background: POSITION_COLOR[spot.position] ?? 'var(--dust)', color: HERO.badgeText, fontFamily: PIXEL, fontSize: 6, lineHeight: 1, padding: '2px 3px', borderRadius: 2, border: `1px solid ${HERO.ink}` }}>
              {spot.position}
            </span>
          )}
          {/* Portrait window (36px) — same seeded face as gallery/pack cards. */}
          <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'radial-gradient(90% 80% at 50% 30%, rgba(232,178,60,0.16), transparent 72%)' }}>
            {spot.cardId !== undefined ? (
              <div className="pixelated" aria-hidden style={{ ...portraitBackgroundStyle(spot.cardId), width: '62%', height: '100%' }} />
            ) : (
              <MiniSprite side={side} isGK={spot.isGK} accent={accent} />
            )}
            {spot.sentOff && (
              <span aria-label="Sent off" style={{ position: 'absolute', inset: 0, background: 'rgba(20,4,4,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                <span style={{ width: 9, height: 13, background: '#e0332d', border: `1px solid ${HERO.ink}`, borderRadius: 1.5, transform: 'rotate(8deg)', boxShadow: '0 1px 0 0 #0b0703' }} />
              </span>
            )}
          </div>
          {/* Name + role over the gold hairline top border. */}
          <div style={{ padding: '2px 3px 3px', borderTop: `1px solid ${HERO.gold}66` }}>
            <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 5, color: HERO.cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', lineHeight: 1.3 }}>
              {spot.name ?? '—'}
            </span>
            {(spot.card?.tacticalRole || spot.archetype) && (
              <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 4, color: HERO.gold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', lineHeight: 1.3, opacity: 0.9 }}>
                {(spot.card?.tacticalRole ?? spot.archetype ?? '').toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Four corner bubbles (yours only) — ATK · DEF · FIT · RTG (§6 semantics). */}
      {showStats && typeof spot.atkEff === 'number' && (
        <CornerBubble corner="tl" border={HERO.atk} valueColor={typeof spot.baseAtk === 'number' && spot.atkEff !== spot.baseAtk ? (spot.atkEff > spot.baseAtk ? '#5fd08a' : '#f0928c') : HERO.cream} value={spot.atkEff} onTap={onStatTap} label="Attack, tap for modifiers" />
      )}
      {showStats && typeof spot.defEff === 'number' && (
        <CornerBubble corner="tr" border={HERO.def} valueColor={typeof spot.baseDef === 'number' && spot.defEff !== spot.baseDef ? (spot.defEff > spot.baseDef ? '#5fd08a' : '#f0928c') : HERO.cream} value={spot.defEff} onTap={onStatTap} label="Defence, tap for modifiers" />
      )}
      {showStats && fitPct !== null && (
        <CornerBubble corner="bl" border={heroFitnessColor(fitPct)} valueColor={heroFitnessColor(fitPct)} value={fitPct} label={`Fitness ${fitPct}%`} />
      )}
      {showStats && typeof spot.matchRating === 'number' && (
        <CornerBubble corner="br" border={HERO.gold} valueColor={HERO.goldHi} value={spot.matchRating.toFixed(1)} label={`Rating ${spot.matchRating.toFixed(1)}`} />
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
  const frameSpec = rarityFrame(card.rarity);
  const st = deriveStats(card);
  return (
    // §6 bench micro card — foil frame → pixel interior (pos + ATK/DEF, portrait,
    // name). A pure <div> (pointerEvents:none) so the wrapping button owns the drag.
    <div style={{ width: '100%', borderRadius: 5, padding: 2, background: frameSpec.frame, boxShadow: `0 2px 0 0 ${HERO.ink}, 0 3px 6px rgba(0,0,0,0.4)`, opacity: dim ? 0.3 : 1, pointerEvents: 'none' }}>
      <div style={{ overflow: 'hidden', borderRadius: 3, border: `1px solid ${HERO.ink}`, background: 'linear-gradient(165deg, #2f2415, #191309)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 3px 0' }}>
          <span style={{ background: posColor, color: HERO.badgeText, fontFamily: PIXEL, fontSize: 6, lineHeight: 1, padding: '2px 3px', borderRadius: 2, border: `1px solid ${HERO.ink}` }}>{card.position}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, lineHeight: 1, color: HERO.cream, fontVariantNumeric: 'tabular-nums' }}>{st.atk}/{st.def}</span>
        </div>
        <div style={{ height: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="pixelated" aria-hidden style={{ ...portraitBackgroundStyle(card.id), width: '60%', height: '100%' }} />
        </div>
        <div style={{ padding: '0 3px 2px' }}>
          <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 4.5, color: HERO.cream, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{lastName(card.name)}</span>
          {(card.tacticalRole || card.archetype) && (
            <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 4, color: HERO.gold, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3, opacity: 0.9 }}>{(card.tacticalRole ?? card.archetype ?? '').toUpperCase()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TACTICS BY CARDS — the equipped hand (up to TACTIC_SLOTS for the match).
//
// A tactic's category sets its accent (all KC tokens):
//   attacking → kit-red · defensive → kit-blue · specialist → gold.
// TacticPill is one owned tactic — tap equips it for the MATCH (ringed EQUIPPED),
// tap again unequips; slots-full or match-started disables. The inspect pip
// opens the existing tactic CardModal. Pixel-flat on a hard-shadowed surface.
// ---------------------------------------------------------------------------

const TACTIC_CATEGORY_COLOR: Record<TacticCard['category'], string> = {
  attacking: '#e0332d',   // §6 attacking ⚔
  defensive: '#2b74e0',   // §6 defensive 🛡
  specialist: '#a855f7',  // §6 specialist ✨
};

type EquipState = 'equipped' | 'available' | 'blocked';

function CallPill({ tactic, state, onCall, onInspect }: {
  tactic: TacticCard;
  state: EquipState;
  onCall: () => void;
  onInspect: () => void;
}) {
  const accent = TACTIC_CATEGORY_COLOR[tactic.category] ?? 'var(--gold)';
  const called = state === 'equipped';
  const blocked = state === 'blocked';
  return (
    // No `disabled` attr — the inspect pip must stay tappable on a blocked
    // tactic; the equip tap itself is guarded below.
    <button
      onClick={() => { if (!blocked) onCall(); }}
      aria-disabled={blocked}
      aria-pressed={called}
      aria-label={`${tactic.name}, ${called ? 'equipped, tap to unequip' : blocked ? 'unavailable' : 'tap to equip'}`}
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
        {called && (
          <span style={{ alignSelf: 'flex-start', fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.3, color: 'var(--ink-black)', background: accent, borderRadius: 2, padding: '2px 3px', lineHeight: 1 }}>EQUIPPED</span>
        )}
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
  cardStats: Record<number, { atk: number; def: number; baseAtk: number; baseDef: number }>,
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
    const live = card ? cardStats[card.id] : undefined;
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
      atkEff: live?.atk,
      defEff: live?.def,
      baseAtk: live?.baseAtk,
      baseDef: live?.baseDef,
      // posFit defaults true when no stat row (e.g. mid-drag transient); only false flags a misfit.
      posFit: st ? st.posFit : true,
      matchRating: st?.rating,
      goals: st?.goals ?? 0,
      assists: st?.assists ?? 0,
      booked: card ? (matchState.bookings?.[card.id] ?? 0) > 0 : false,
      sentOff: card ? matchState.sentOffIds?.includes(card.id) : false,
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
    const stats = card ? deriveStats(card) : undefined;
    return {
      slot, band: bandOf(cellOf(slot.x, slot.y)),
      number: nums.get(i) ?? i + 1,
      name: card ? lastName(card.name) : null, isGK, cardId: card?.id,
      card: card ?? undefined,
      isStar: !!card && card.id === starId && !isGK,
      rating: card ? Math.round(card.power) : undefined,
      atkEff: stats?.atk,
      defEff: stats?.def,
      baseAtk: stats?.atk,
      baseDef: stats?.def,
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

type BeatKind = 'goal' | 'save' | 'miss' | 'idle' | 'card';
interface Beat {
  side: 'you' | 'opp';
  kind: BeatKind;
  lane: Lane;
  xg: number;
  label: string;
  /** 'card' beats: red or yellow. */
  red?: boolean;
  /** The named player for card/idle callouts (fouler, corner winner). */
  name?: string | null;
  // The engine beat behind this animation frame — text, scorer, d100 receipt.
  source: MatchBeat | null;
}

/**
 * SCORING_V2 — the playout comes 1:1 off the engine's round beats (already in
 * clock order): possessions, chances with their d100 receipts, corners, trait
 * stops, bookings and reds. Each engine beat maps to one animation beat:
 *   goal/save/miss → the shot run;  stop → a save-flash credited to the stopper
 *   (side flipped so the ball runs AT the stopping side's goal);  booking/red →
 *   a card flash;  turnover/corner/foul → a labelled build-up fizzle.
 * Goals and reds are never dropped by the length cap.
 */
function buildTimeline(result: IncrementResult): Beat[] {
  const beats: Beat[] = [];
  for (const b of result.beats ?? []) {
    switch (b.outcome) {
      case 'goal':
        beats.push({ side: b.side, kind: 'goal', lane: b.lane, xg: b.xg, label: 'GOAL!', source: b });
        break;
      case 'save':
        beats.push({ side: b.side, kind: 'save', lane: b.lane, xg: b.xg, label: b.side === 'you' ? 'SAVED' : 'SAVED!', source: b });
        break;
      case 'miss':
        beats.push({ side: b.side, kind: 'miss', lane: b.lane, xg: b.xg, label: 'OFF TARGET', source: b });
        break;
      case 'stop':
        // The stop belongs to the DEFENDING side; the animation runs the attack
        // at their goal and flashes the stopper's trait at the moment of denial.
        beats.push({ side: b.side === 'you' ? 'opp' : 'you', kind: 'save', lane: b.lane, xg: 0, label: (b.traitName ?? 'STOPPED').toUpperCase() + '!', source: b });
        break;
      case 'booking':
        beats.push({ side: b.side, kind: 'card', lane: b.lane, xg: 0, label: 'YELLOW CARD', name: b.scorerName, source: b });
        break;
      case 'red':
        beats.push({ side: b.side, kind: 'card', lane: b.lane, xg: 0, label: 'RED CARD!', red: true, name: b.scorerName, source: b });
        break;
      case 'foul':
        beats.push({ side: b.side === 'you' ? 'opp' : 'you', kind: 'idle', lane: b.lane, xg: 0, label: 'FREE KICK', source: b });
        break;
      case 'corner':
        beats.push({ side: b.side, kind: 'idle', lane: b.lane, xg: 0, label: b.side === 'you' ? 'CORNER WON' : 'THEIR CORNER', source: b });
        break;
      case 'turnover':
        beats.push({ side: b.side, kind: 'idle', lane: 'C', xg: 0, label: b.side === 'you' ? 'MOVE BREAKS DOWN' : 'YOU WIN IT BACK', source: b });
        break;
      case 'spell':
      default:
        break; // the possession summary lives in the ticker, not the pitch
    }
  }

  // Trim to a snappy sequence: goals and reds are the record — never dropped.
  const MAX_BEATS = 8;
  const keep = (b: Beat) => b.kind === 'goal' || (b.kind === 'card' && b.red);
  const must = beats.filter(keep);
  if (beats.length > MAX_BEATS) {
    const optional = beats.filter((b) => !keep(b));
    const budget = Math.max(0, MAX_BEATS - must.length);
    // Keep the most consequential optional beats (shots over fizzles), in order.
    const rank = (b: Beat) => (b.kind === 'save' || b.kind === 'miss' ? 0 : b.kind === 'card' ? 1 : 2);
    const chosen = new Set(
      [...optional].sort((a, b2) => rank(a) - rank(b2)).slice(0, budget),
    );
    const trimmed = beats.filter((b) => keep(b) || chosen.has(b));
    if (trimmed.length > 0) return trimmed;
  }

  // If literally nothing happened, still show one quiet possession so the period
  // never feels frozen.
  if (beats.length === 0) beats.push({ side: 'you', kind: 'idle', lane: 'C', xg: 0, label: '', source: null });
  return beats;
}

// Beat pacing (ms): travel for shots, a touch quicker for idle build-up.
const BEAT_MS: Record<BeatKind, number> = { goal: 1500, save: 900, miss: 850, idle: 650, card: 1100 };

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
function RatingRow({ st, rank, live }: { st: PlayerMatchStat; rank: number; live?: { atk: number; def: number } }) {
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
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)' }}>
            A <b style={{ color: 'var(--cream-soft)' }}>{live?.atk ?? '—'}</b>{' '}
            D <b style={{ color: 'var(--cream-soft)' }}>{live?.def ?? '—'}</b>
          </span>
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
        <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: heroFitnessColor(st.fitness), textAlign: 'right', lineHeight: 1 }}>FIT {Math.round(st.fitness)}/100</span>
      </div>
    </div>
  );
}

function RatingsSheet({ stats, goals, surnameOf, onClose, cardStats }: { stats: PlayerMatchStat[]; goals: GoalLine[]; surnameOf: (n: string) => string; onClose: () => void; cardStats: Record<number, { atk: number; def: number }> }) {
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
            {sorted.map((st, i) => <RatingRow key={st.cardId} st={st} rank={i} live={cardStats[st.cardId]} />)}
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

// ---------------------------------------------------------------------------
// The six contests, as the stats overlay reads them. Each group is a small panel
// with its name coloured by contest FAMILY and its two ContestStats metrics as
// YOU-vs-OPP StatPair rows (this-period value + match-to-date). Family colours:
//   KEEP / CREATE  → possession-gold  · PRESS / BREAK → ball-winning blue
//   FINISH         → kit-red          · STOP          → wall-green
// The `field` keys index straight into ContestStats (match-v5) — one source.
// ---------------------------------------------------------------------------
type ContestField = keyof ContestStats;
interface ContestMeta {
  name: string;
  color: string;
  metrics: { label: string; field: ContestField; fmt?: (n: number) => string }[];
}
const CONTEST_META: ContestMeta[] = [
  { name: 'KEEP', color: 'var(--gold)', metrics: [
    { label: 'POSS %', field: 'possessionPct' },
    { label: 'POSSESSION', field: 'possessions' } ] },
  { name: 'CREATE', color: 'var(--gold)', metrics: [
    { label: 'SHOTS', field: 'shots' },
    { label: 'BIG CH.', field: 'bigChances' } ] },
  { name: 'FINISH', color: 'var(--kit-red)', metrics: [
    { label: 'ON TARGET', field: 'shotsOnTarget' },
    { label: 'GOALS', field: 'goals' } ] },
  { name: 'BREAK', color: 'var(--kit-blue)', metrics: [
    { label: 'TURNOVERS', field: 'turnoversWon' },
    { label: 'INTERCEPT', field: 'interceptions' } ] },
  { name: 'PRESS', color: 'var(--kit-blue)', metrics: [
    { label: 'PRESSURES', field: 'pressures' },
    { label: 'TACKLES', field: 'tackles' } ] },
  { name: 'STOP', color: 'var(--success)', metrics: [
    { label: 'SAVES', field: 'saves' },
    { label: 'BLOCKS', field: 'blocks' } ] },
];

function ContestGroup({ meta, stats, cumulative, delay }: {
  meta: ContestMeta; stats: MatchStats; cumulative: CumulativeStats; delay: number;
}) {
  return (
    <div className="stat-row-in" style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '7px 8px 8px',
      borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)',
      borderTop: `3px solid ${meta.color}`, boxShadow: '0 2px 0 0 var(--ink-black)',
      background: 'var(--surface)', animationDelay: `${delay}ms`, minWidth: 0,
    }}>
      <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.7, color: meta.color, lineHeight: 1 }}>{meta.name}</span>
      {meta.metrics.map((m, i) => (
        <StatPair
          key={m.field}
          label={m.label}
          you={stats.yourContest[m.field]}
          opp={stats.opponentContest[m.field]}
          matchYou={cumulative.yourContest[m.field]}
          matchOpp={cumulative.opponentContest[m.field]}
          fmt={m.fmt}
          delay={delay + i * 40}
        />
      ))}
    </div>
  );
}

function StatsScreen({
  stats, cumulative, minute, periodLabel, youName, oppName, scoreYou, scoreOpp, isFullTime,
  goals, coachNotes, log, surnameOf, onRatings, onContinue,
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
  /** The assistant's team-talk reads — RELOCATED here from the plan screen. */
  coachNotes: CoachNote[];
  /** The full match log so far (all beats, chronological) — the expanded readout. */
  log: GoalLine[];
  surnameOf: (n: string) => string;
  /** Open the per-player ratings sheet (req 5). */
  onRatings: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="stats-rise" style={{ position: 'absolute', inset: 0, zIndex: 14, background: 'linear-gradient(180deg, #08130c, #0a160e)', display: 'flex', flexDirection: 'column', padding: '14px 14px 14px', overflow: 'hidden' }}>
      {/* Fixed scoreboard header — period marker + running score + the matchup.
          Everything below scrolls INTERNALLY; the page itself never scrolls. */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        <div className="stat-row-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: 'var(--gold)', letterSpacing: 0.6 }}>{isFullTime ? 'FULL TIME' : `${minute}' — ${periodLabel} HALF`}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--line-white)' }}>
            <span style={{ color: YOU }}>{scoreYou}</span> – <span style={{ color: OPP }}>{scoreOpp}</span>
          </span>
        </div>
        <div className="stat-row-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', animationDelay: '40ms' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: YOU, overflow: 'hidden' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: YOU }} />{youName}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: OPP, overflow: 'hidden' }}>
            <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oppName}</span><span style={{ width: 8, height: 8, borderRadius: 2, background: OPP }} />
          </span>
        </div>
      </div>

      {/* Scroll region — the ONLY thing that scrolls. Coach team-talk (relocated
          here), the xG headline, the six-contest grid, the goals ledger, and the
          expanded match log, in that order. */}
      <div className="tactic-sheet-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 1px 4px' }}>
        {/* Coach TEAM TALK — moved out of the plan screen into this between-period beat. */}
        <CoachPanel notes={coachNotes} style={{ margin: 0 }} />

        {/* Caption: which column is this-period vs match-to-date (applies to xG + grid). */}
        <div className="stat-row-in" style={{ display: 'flex', justifyContent: 'center', gap: 6, animationDelay: '60ms' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--cream-soft)' }}>THIS 15{"'"}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--dust)' }}>·</span>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--ink)' }}>MATCH SO FAR</span>
        </div>

        {/* xG — the headline number above the contest grid. */}
        <div className="stat-row-in" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', borderTop: '3px solid var(--amber)', boxShadow: '0 2px 0 0 var(--ink-black)', background: 'var(--surface)', animationDelay: '70ms' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.7, color: 'var(--amber)', lineHeight: 1 }}>EXPECTED GOALS</span>
          <StatPair label="xG" you={stats.yourXG} opp={stats.opponentXG} matchYou={cumulative.yourXG} matchOpp={cumulative.opponentXG} fmt={(n) => n.toFixed(2)} delay={80} />
        </div>

        {/* THE SIX CONTESTS — one small panel each, coloured by family, two metrics apiece. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {CONTEST_META.map((meta, i) => (
            <ContestGroup key={meta.name} meta={meta} stats={stats} cumulative={cumulative} delay={110 + i * 40} />
          ))}
        </div>

        {/* GOALS ledger — scorer + assister + minute for every goal. */}
        {goals.length > 0 && (
          <div className="stat-row-in" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)', background: 'var(--surface)', animationDelay: '340ms' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.6, color: 'var(--gold)' }}>GOALS</span>
              <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>{goals.length}</span>
            </div>
            <GoalsFeed goals={goals} surnameOf={surnameOf} delay={350} />
          </div>
        )}

        {/* MATCH LOG — expanded: every beat so far (chances, shots, cards, corners),
            chronological, side-coloured. Taller than the pitch-screen ticker, scrolls
            internally beyond ~9 rows so this beat can show much more of the match. */}
        {log.length > 0 && (
          <div className="stat-row-in" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', boxShadow: '0 2px 0 0 var(--ink-black)', background: 'var(--surface)', animationDelay: '360ms' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.6, color: 'var(--cream-soft)' }}>MATCH LOG</span>
              <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>{log.length}</span>
            </div>
            <div className="tactic-sheet-scroll" style={{ maxHeight: 200, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {log.map((l, i) => {
                  const col = l.type === 'goal-yours' ? YOU : l.type === 'goal-opponent' ? OPP : l.side === 'you' ? YOU : OPP;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 30 }}>{l.time}</span>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: l.side === 'you' ? YOU : OPP }} />
                      <span style={{ fontSize: 10.5, color: col, opacity: l.type === 'chance' ? 0.85 : 1, fontWeight: l.type !== 'chance' ? 800 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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

function CoachPanel({ notes, style }: { notes: CoachNote[]; style?: React.CSSProperties }) {
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
        ...style,
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
  opponentBuild, nextMinute, mode, breakMoment, currentResult, playerStats, cardStats, cardMods, forecast,
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

  // SCORING_V2 — the modifier receipt sheet: which card's ledger is open (tap the
  // ATK/DEF pair on one of your pitch cards). Null = closed.
  const [receiptId, setReceiptId] = useState<number | null>(null);

  // Team identity prefers the live engine style, falling back to the build's label.
  const oppStyleLabel = matchState.opponentStyle || opponentBuild.style;

  const youSpots = useMemo(() => yourPitch(matchState, formation, playerStats, cardStats), [matchState, formation, playerStats, cardStats]);
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

  // ── TACTICS BY CARDS — the match's equipped hand (up to TACTIC_SLOTS).
  // Equip/unequip is pre-kickoff only; after the first whistle the plan is locked
  // (equipTactics in match-v5 enforces it — this mirrors it for the labels).
  const equippedIds = matchState.equippedTactics;
  const equipLocked = matchState.scores.length > 0;
  const equipHand = useMemo(() => {
    return availableTactics.map((tactic) => {
      const equipped = equippedIds.includes(tactic.id);
      const state: EquipState = equipped
        ? 'equipped'
        : equipLocked || equippedIds.length >= TACTIC_SLOTS ? 'blocked' : 'available';
      return { tactic, state };
    });
  }, [availableTactics, equippedIds, equipLocked]);

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
  // Opponent PWR for the scoreboard (§6) — the average printed power of the rival XI.
  const oppPwr = (() => {
    const live = matchState.opponentXI.filter(Boolean) as Card[];
    if (live.length === 0) return null;
    return Math.round(live.reduce((a, c) => a + c.power, 0) / live.length);
  })();
  // The period marker word for the scoreboard bar.
  const scoreMarker = resolving ? 'LIVE'
    : breakMoment === 'halftime' ? 'HALFTIME'
      : breakMoment === 'kickoff' ? 'KICK OFF'
        : matchState.currentIncrement >= INCREMENT_MINUTES_LEN ? 'FULL TIME'
          : `${periodLabel} HALF`;
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
      if (s.lowFitness && (s.fitness ?? 100) < tiredVal) { tiredVal = s.fitness ?? 100; tiredSpot = s; }
    }
    return injuredSpot ?? tiredSpot;
  }, [planning, youSpots]);
  // FIX 2 — subs now work in the first half too (makeSub no longer gates on it), so
  // the SUB? prompt fires for any injured/tired starter whenever a sub is available.
  const canSubFlag = !!flaggedPlayer && subsRemaining > 0;
  const showSubPrompt = planning && canSubFlag && bench.length > 0;

  // Nudge the TACTICS tab pre-kickoff while slots are free and tactics are owned.
  const showCallNudge = planning && !equipLocked && equippedIds.length < TACTIC_SLOTS && availableTactics.length > 0;

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

  // FIX 5 — the assistant's reads (assistant.coachNotes), RELOCATED to the
  // between-period stats overlay (StatsScreen). Computed unconditionally now (it's
  // cheap and pure) so it's populated while resolving, when the overlay renders.
  // The 'tactics' kind is dropped display-side: it only restates the slot count the
  // plan strip already shows. What remains (weakness / fitness / momentum) is
  // genuinely situational; when nothing remains the coach block doesn't render.
  const notes = useMemo<CoachNote[]>(
    () => coachNotes(matchState, {
      weaknessLabel: opponentBuild.weakness,
    }).filter((n) => n.kind !== 'tactics'),
    [matchState, opponentBuild.weakness],
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

      {/* ── §6 SCOREBOARD BAR — period/clock · your XI · boxed score · rival ·
          play-style/PWR. All the same live values (displayGoals + shake, clock,
          opponent identity/style); just the Pixel-Hero chrome. ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px', background: 'linear-gradient(180deg, #221a0f, #171207)', borderBottom: `2px solid ${HERO.ink}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: HERO.gold, whiteSpace: 'nowrap' }}>{scoreMarker}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className={resolving ? 'carrier-glow' : undefined} style={{ width: 5, height: 5, borderRadius: '50%', background: resolving ? 'var(--success)' : HERO.creamMuted, flexShrink: 0, boxShadow: resolving ? '0 0 5px var(--success)' : undefined }} />
            <span style={{ fontFamily: PIXEL, fontSize: 9, color: HERO.creamMuted, fontVariantNumeric: 'tabular-nums' }}>{clockMMSS}</span>
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 9, color: HERO.cream, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }}>YOUR XI</span>
          <span style={{ fontFamily: PIXEL, fontSize: 20, color: HERO.cream, textShadow: `0 2px 0 ${HERO.ink}`, background: 'rgba(0,0,0,0.4)', border: `1px solid ${HERO.gold}66`, borderRadius: 5, padding: '2px 9px', display: 'inline-flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
            <span className={shake === 'you' ? 'score-tick' : undefined} style={{ display: 'inline-block', color: shake === 'you' ? 'var(--success)' : HERO.cream }}>{displayGoals.you}</span>
            <span style={{ color: HERO.creamMuted, fontSize: 15 }}>–</span>
            <span className={shake === 'opp' ? 'score-tick' : undefined} style={{ display: 'inline-block', color: shake === 'opp' ? 'var(--danger)' : HERO.cream }}>{displayGoals.opp}</span>
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 9, color: HERO.creamMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }}>{opponentBuild.name}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', minWidth: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: HERO.def, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 72 }}>{oppStyleLabel.toUpperCase()}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 9, color: HERO.creamMuted, whiteSpace: 'nowrap' }}>{oppPwr !== null ? `PWR ${oppPwr}` : badge}</span>
        </div>
      </div>

      {/* SCORING_V2 FORECAST — the sums that drive the result, kept as a slim strip
          under the scoreboard: your ATTACK v their DEFENCE (+edge), their ATTACK v
          your DEFENCE (+edge), and the NET. Tap a pitch card's bubble for the receipt. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 4px', flexShrink: 0, fontVariantNumeric: 'tabular-nums', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {([
          { tag: 'ATK', yours: forecast.yourAttack, theirs: forecast.oppDefence, edge: forecast.attackEdge, bg: HERO.atk },
          { tag: 'DEF', yours: forecast.yourDefence, theirs: forecast.oppAttack, edge: forecast.defendEdge, bg: HERO.def },
        ] as const).map((row) => (
          <div key={row.tag} style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.4, color: HERO.ink, background: row.bg, borderRadius: 2, padding: '1.5px 3px', lineHeight: 1, width: 22, textAlign: 'center' }}>{row.tag}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 10, color: HERO.cream, lineHeight: 1 }}>{row.yours}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 7, color: HERO.creamMuted, lineHeight: 1 }}>v</span>
            <span style={{ fontFamily: PIXEL, fontSize: 10, color: HERO.creamBody, lineHeight: 1 }}>{row.theirs}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 9, lineHeight: 1, color: row.edge > 0 ? 'var(--success)' : row.edge < 0 ? 'var(--danger)' : HERO.creamMuted }}>
              {row.edge > 0 ? `+${row.edge}` : row.edge}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.4, color: HERO.ink, background: HERO.gold, borderRadius: 2, padding: '1.5px 3px', lineHeight: 1, width: 22, textAlign: 'center' }}>NET</span>
          <span style={{ fontFamily: PIXEL, fontSize: 10, lineHeight: 1, color: forecast.net > 0 ? 'var(--success)' : forecast.net < 0 ? 'var(--danger)' : HERO.creamMuted }}>
            {forecast.net > 0 ? `+${forecast.net}` : forecast.net} {forecast.net > 0 ? '▲ YOU' : forecast.net < 0 ? '▼ THEM' : '· LEVEL'}
          </span>
        </div>
      </div>

      {/* Ticker — three lines, tap to expand. Pre-kickoff shows a coach prompt.
         While resolving, the firing TRAITS take the ticker as styled callouts so
         a missed on-pitch flash is still captured in the running commentary. The
         team-talk COACH panel no longer lives here — it was relocated to the
         between-period stats overlay (StatsScreen). */}
      {(
      <button onClick={() => setTickerOpen(true)} style={{ textAlign: 'left', margin: '0 16px 10px', padding: '8px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.35)', border: `1px solid ${HERO.gold}4d`, flexShrink: 0, cursor: 'pointer', display: 'grid', gap: 3 }}>
        {preKickoff ? (
          // ISSUE 6 — guidance, not a fake match event (no minute stamp).
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 51 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--ink-black)', background: 'var(--amber)', borderRadius: 3, padding: '3px 5px', lineHeight: 1, flexShrink: 0 }}>COACH</span>
            <span style={{ fontSize: 12, color: 'var(--cream-soft)', lineHeight: 1.35 }}>Set your XI and shape, then kick off. Drag a player to swap; tap to inspect.</span>
          </div>
        ) : resolving && (planLines.length > 0 || traitCallouts.length > 0) ? (
          // THIS SPELL — ONE panel for "your plan paid off": the cascade's
          // tactic / manager / chemistry lines (label + attack points, straight
          // off the engine), then the trait firings beneath.
          <div data-this-spell style={{ display: 'grid', gap: 3, minHeight: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--ink-black)', background: 'var(--gold)', borderRadius: 3, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>THIS SPELL</span>
              {traitCallouts.length > 2 && (
                <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: 'var(--dust)', marginLeft: 'auto' }}>+{traitCallouts.length - 2} MORE</span>
              )}
            </div>
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
      {mode === 'plan' && !oppView && (
        <div className="glass-surface sheen" style={{ margin: '0 16px 8px', borderRadius: 'var(--radius)', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px 8px', position: 'relative', zIndex: 2 }}>
            <span className={showCallNudge ? 'carrier-glow' : undefined}
              style={{ flexShrink: 0, fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, color: showCallNudge ? 'var(--ink-black)' : 'var(--dust)', background: showCallNudge ? 'var(--amber)' : 'rgba(0,0,0,0.3)', border: '1px solid var(--ink-black)', borderRadius: 3, padding: '3px 4px', lineHeight: 1.35, width: 36, textAlign: 'center' }}>
              TACTICS {equippedIds.length}/{TACTIC_SLOTS}
            </span>
            <div className="kc-call-row" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden', flex: 1, minWidth: 0 }}>
              {equipHand.length === 0 && <span style={{ fontSize: 10, color: 'var(--dust)' }}>No tactic cards owned — buy them in the store.</span>}
              {equipHand.map(({ tactic, state }) => (
                <CallPill key={tactic.id} tactic={tactic} state={state}
                  onCall={() => onToggleTactic(tactic.id)}
                  onInspect={() => setModal({ variant: 'tactic', tactic })} />
              ))}
            </div>
            <button onClick={() => setTrayOpen(true)} aria-label="Tactic details"
              style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, background: 'none', border: 'none', color: 'var(--dust)', fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.4, cursor: 'pointer', padding: '8px 0 8px 8px', lineHeight: 1 }}>
              DETAILS <span style={{ fontSize: 9 }}>{'›'}</span>
            </button>
          </div>
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

      {/* Pitch — §6 mow-stripe green + white furniture (a red wash flags the
          "viewing opposition" mode). Every handler/geometry below is unchanged. */}
      <div ref={pitchRef} style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 16px', borderRadius: 'var(--radius-lg)', border: `2px solid ${HERO.ink}`, background: oppView
        ? 'repeating-linear-gradient(180deg, #9e3b36 0 34px, #8a2f2a 34px 68px)'
        : 'repeating-linear-gradient(180deg, #1f9d4f 0 34px, #1a8a45 34px 68px)', boxShadow: `0 3px 0 0 ${HERO.ink}, inset 0 0 40px rgba(0,0,0,0.3)`, overflow: 'hidden', touchAction: 'none' }}>
        {/* Pitch markings — white furniture at 0.22 (§6). */}
        <div style={{ position: 'absolute', inset: 8, border: `1px solid ${FURNITURE}`, borderRadius: 3, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 1, background: FURNITURE }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 84, height: 84, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid ${FURNITURE}` }} />
        {/* Penalty boxes, open toward the pitch. */}
        <div style={{ position: 'absolute', left: '50%', top: 8, width: 150, height: 52, transform: 'translateX(-50%)', border: `1px solid ${FURNITURE}`, borderTop: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 8, width: 150, height: 52, transform: 'translateX(-50%)', border: `1px solid ${FURNITURE}`, borderBottom: 'none', pointerEvents: 'none' }} />
        {/* Goals (top = the goal your XI attacks; bottom = your own goal the opponent attacks) */}
        <div className={shake === (oppView ? 'opp' : 'you') ? 'net-shake' : undefined} style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: 78, height: 12, borderRadius: '0 0 6px 6px', border: `2px solid ${FURNITURE}`, borderTop: 'none', background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 3px, transparent 3px 6px)' }} />
        <div className={shake === (oppView ? 'you' : 'opp') ? 'net-shake' : undefined} style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: 78, height: 12, borderRadius: '6px 6px 0 0', border: `2px solid ${FURNITURE}`, borderBottom: 'none', background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 3px, transparent 3px 6px)' }} />

        {/* ── TELEGRAPH LANE PULSE (planning) — where the telegraphed play commits
            its attack, read from the play's records. Their commitment lands in
            YOUR half (same lane), so the band shades the defensive end toward
            your goal. Subtle breathing tint under the player cards; static under
            reduced motion. Your-team view only (the rival view flips ends). ── */}

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
                <PitchCard
                  spot={spot}
                  side={oppView ? 'opp' : 'you'}
                  accent={rarityAccent}
                  dim={isDragging}
                  glow={carrier}
                  onStatTap={!oppView && spot.cardId !== undefined ? () => setReceiptId(spot.cardId!) : undefined}
                />
                {/* Goals + bookings live in the card's own event strip and the FIT
                    bubble now (§6). Injury / misfit / low-fitness read through the
                    card's red frame + red FIT bubble + the status ring on this button
                    (ringColor above), so no colliding external pips are drawn. Tap the
                    card to inspect (endPointer), tap a stat bubble for the receipt. */}
                {/* drop-target hint when dragging another card over this one. */}
                {isDropTarget && !isHover && (
                  <span aria-hidden style={{ position: 'absolute', inset: -2, borderRadius: 7, border: '2px dashed var(--gold)', pointerEvents: 'none' }} />
                )}
              </button>
            </div>
          );
        })}

        {/* ---- Possession ball / shot / fizzle (event-driven) ---- */}
        {resolving && beat && beat.kind !== 'idle' && beat.kind !== 'card' && (
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

        {/* A build-up possession event: muted fizzle + what happened (turnover /
            corner / free kick — straight off the engine beat's label). */}
        {resolving && beat && beat.kind === 'idle' && (
          <div key={`idle-${beatIdx}`} className="possession-fizzle" style={{ position: 'absolute', left: `${MIDFIELD.x}%`, top: `${MIDFIELD.y + (beat.side === 'you' ? -6 : 6)}%`, transform: 'translate(-50%,-50%)', display: 'grid', justifyItems: 'center', gap: 3, zIndex: 6, pointerEvents: 'none', animationDuration: dur(500) }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'rgba(136,160,140,0.6)', boxShadow: '0 0 6px rgba(136,160,140,0.4)' }} />
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)' }}>{beat.label || (beat.side === 'you' ? 'BUILD-UP' : 'THEY PROBE')}</span>
          </div>
        )}

        {/* A card — the referee's moment: a raised yellow/red with the player named.
            A red also means the player is OFF and suspended for the next fixture. */}
        {resolving && beat && beat.kind === 'card' && (
          <div key={`card-${beatIdx}`} className="possession-fizzle" style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', display: 'grid', justifyItems: 'center', gap: 5, zIndex: 10, pointerEvents: 'none', animationDuration: dur(BEAT_MS.card) }}>
            <span style={{ width: 22, height: 30, background: beat.red ? 'var(--danger)' : 'var(--gold)', border: '2px solid var(--ink-black)', borderRadius: 3, transform: 'rotate(8deg)', boxShadow: '0 2px 0 0 var(--ink-black)' }} />
            <span style={{ fontFamily: PIXEL, fontSize: beat.red ? 13 : 10, lineHeight: 1, color: beat.red ? 'var(--danger)' : 'var(--gold)', textShadow: '0 2px 0 var(--ink-black)', background: 'rgba(7,16,11,0.85)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px' }}>
              {beat.label}
            </span>
            {beat.name && (
              <span style={{ fontFamily: PIXEL, fontSize: 9, lineHeight: 1, color: 'var(--cream)', background: 'rgba(7,16,11,0.85)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px' }}>
                {lastName(beat.name).toUpperCase()}{beat.red ? ' — OFF' : ''}
              </span>
            )}
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
              {/* The engine's emergent pattern name for the move. Yours only. */}
              {scored && (() => {
                const label = currentResult?.split.playName?.toUpperCase() ?? null;
                if (!label) return null;
                return (
                  <span style={{ fontFamily: PIXEL, fontSize: 7.5, lineHeight: 1, color: 'var(--dust)', letterSpacing: 0.4 }}>
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
          style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '11px 0', borderRadius: 7, border: `2px solid ${resolving ? 'var(--success)' : HERO.ink}`, boxShadow: resolving ? `0 3px 0 0 ${HERO.ink}` : `0 3px 0 0 ${HERO.ink}, 0 0 16px rgba(232,98,26,0.4)`, background: resolving ? 'linear-gradient(135deg, #143a24, #0f2c1b)' : 'linear-gradient(135deg, #e8621a, #f5a03e)', color: HERO.badgeText, fontFamily: PIXEL, fontSize: 15, textShadow: resolving ? undefined : '0 2px 0 rgba(0,0,0,0.4)', cursor: resolving ? 'default' : 'pointer', transition: 'background 200ms, color 200ms' }}>
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
                <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--amber)', letterSpacing: 0.8 }}>MATCH TACTICS</span>
                <button onClick={() => setTrayOpen(false)} aria-label="Close plays" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, marginRight: -8, background: 'none', border: 'none', color: 'var(--dust)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>{'×'}</button>
              </div>
              {/* EQUIPPED — up to TACTIC_SLOTS for the whole match; locked at kick-off. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.5 }}>
                  EQUIPPED {equippedIds.length}/{TACTIC_SLOTS}
                </span>
                <span style={{ fontSize: 10, color: 'var(--cream-soft)', marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {equipLocked ? 'Locked at kick-off' : equippedIds.length === 0 ? 'Pick up to 3 before kick-off' : equipHand.filter((h) => h.state === 'equipped').map((h) => h.tactic.name).join(' · ')}
                </span>
              </div>
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

              {/* The tactic cards — full effects; same equip/unequip tap as the hand row. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', letterSpacing: 0.8 }}>TACTIC CARDS</span>
                <span style={{ fontSize: 9, color: 'var(--dust)' }}>{availableTactics.length} owned</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {equipHand.length === 0 && <div style={{ fontSize: 11, color: 'var(--dust)' }}>No tactic cards owned — buy them in the store.</div>}
                {equipHand.map(({ tactic, state }) => {
                  const accent = TACTIC_CATEGORY_COLOR[tactic.category] ?? 'var(--gold)';
                  const blocked = state === 'blocked';
                  const called = state === 'equipped';
                  // The border tells the state apart: accent = equipped,
                  // ink = available, muted = blocked (slots full / locked).
                  const borderColor = called ? accent : blocked ? 'var(--border)' : 'var(--ink-black)';
                  // Top-right status label — the action a tap performs RIGHT NOW.
                  const label = called ? 'EQUIPPED' : blocked ? (equipLocked ? 'LOCKED' : 'SLOTS FULL') : 'TAP TO EQUIP';
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
                      {called && !equipLocked && (
                        <div style={{ fontSize: 9.5, color: accent, marginTop: 6, paddingLeft: 4 }}>Equipped for this match — tap to unequip</div>
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
          goals={goalsLedger}
          coachNotes={notes}
          log={feed}
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
          cardStats={cardStats}
        />
      )}

      {/* SCORING_V2 — the modifier RECEIPT: how this card's live ATK/DEF got here.
          Printed numbers first, then every flat modifier by source, then the totals.
          One currency — the sheet is literally the sum the engine plays. */}
      {receiptId !== null && (() => {
        const card = xi.find((c) => c.id === receiptId);
        const live = cardStats[receiptId];
        const mods = cardMods[receiptId] ?? [];
        if (!card || !live) return null;
        const sum = (f: (m: PointMod) => number) => mods.reduce((s, m) => s + f(m), 0);
        return (
          <div role="dialog" aria-label="Stat modifiers" onClick={() => setReceiptId(null)}
            style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(7,16,11,0.62)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxHeight: '70%', overflowY: 'auto', background: 'var(--surface)', borderTop: '2px solid var(--ink-black)', borderRadius: '14px 14px 0 0', padding: '14px 16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--cream)' }}>{lastName(card.name).toUpperCase()}</span>
                <button onClick={() => setReceiptId(null)} style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)', background: 'none', border: 'none', cursor: 'pointer' }}>CLOSE ✕</button>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px', gap: 6, fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.4 }}>
                  <span>SOURCE</span><span style={{ textAlign: 'right' }}>ATK</span><span style={{ textAlign: 'right' }}>DEF</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px', gap: 6, fontSize: 11.5, color: 'var(--cream-soft)', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
                  <span>Printed card</span>
                  <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)' }}>{live.baseAtk}</span>
                  <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)' }}>{live.baseDef}</span>
                </div>
                {mods.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--dust)', padding: '4px 0' }}>No modifiers — playing exactly as printed.</div>
                )}
                {mods.map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px', gap: 6, fontSize: 11.5, color: 'var(--cream-soft)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.source}</span>
                    <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 10, color: m.atk > 0 ? 'var(--success)' : m.atk < 0 ? 'var(--danger)' : 'var(--dust)' }}>{m.atk > 0 ? `+${m.atk}` : m.atk !== 0 ? m.atk : '·'}</span>
                    <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 10, color: m.def > 0 ? 'var(--success)' : m.def < 0 ? 'var(--danger)' : 'var(--dust)' }}>{m.def > 0 ? `+${m.def}` : m.def !== 0 ? m.def : '·'}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px', gap: 6, fontSize: 11.5, borderTop: '1px solid var(--border)', paddingTop: 5, color: 'var(--cream)' }}>
                  <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.4, alignSelf: 'center' }}>ON THE PITCH</span>
                  <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 11, color: sum((m) => m.atk) > 0 ? 'var(--success)' : sum((m) => m.atk) < 0 ? 'var(--danger)' : 'var(--cream)' }}>{live.atk}</span>
                  <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 11, color: sum((m) => m.def) > 0 ? 'var(--success)' : sum((m) => m.def) < 0 ? 'var(--danger)' : 'var(--cream)' }}>{live.def}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Full-card overlay — tap any player (yours, GK included) to inspect. */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
