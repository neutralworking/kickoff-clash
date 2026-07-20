'use client';

/**
 * Pack opening — the design-handoff pack screen (1C "Foil Premium"), CLASSIC game.
 *
 * Three packs in sequence (players → managers → tactics), each: a sealed
 * foil-shimmering pack (packPulse loop, TAP TO OPEN) → a white flash → the cards
 * cascade in (dealIn stagger 70ms/card, one-shot rarity flare, Legendary ✦
 * spark — the per-card animation lives in FoilCard). Player cards render as the
 * handoff's whole-card-colour foil cards (Bronze/Silver/Gold/Onyx) in a 3-column
 * grid, rows as needed (the classic player pack is 16 cards, not the handoff's
 * 9 — the grid scrolls internally; the page itself never scrolls). Tapping any
 * card opens the EXISTING CardModal for inspection.
 *
 * Manager / tactic stages keep their pick-one flow (GameCard tiles + PICK
 * buttons) under the same screen chrome: step dots, title, PACK n/3, the
 * one-line info pill, and the amber NEXT CTA.
 *
 * Props contract with GameShell is unchanged: `contents` (PackContents) in,
 * `onContinue(managerId, tacticId)` out after the tactic pick.
 */

import { useMemo, useState } from 'react';
import type { PackContents } from '../lib/packs';
import type { Card } from '../lib/scoring';
import type { JokerCard } from '../lib/jokers';
import type { TacticCard } from '../lib/tactics';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL } from './cards/cardTokens';

// ---------------------------------------------------------------------------
// Screen tokens (handoff values, mapped onto the game's palette where a token
// exists). The phone screen stays dark: a pitch-green-tinted radial over near-
// black — the foil cards are the light source.
// ---------------------------------------------------------------------------

const SCREEN_BG = 'radial-gradient(ellipse at 50% 18%, #14281a 0%, #0a0f0b 60%, #070907 100%)';
const GOLD_HI = '#f5c542';
const DOT_OFF = 'rgba(244,236,216,0.22)';
const INFO_BORDER = 'rgba(212,160,53,0.28)';
const INFO_BG = 'rgba(212,160,53,0.06)';

type Stage = 'players' | 'managers' | 'tactics';
type Phase = 'sealed' | 'open';

interface StageMeta {
  key: Stage;
  index: number;
  packLabel: string;
  /** Sealed-pack + step-dot accent. */
  accent: string;
  /** The one-line info pill under the header (handoff: one line only). */
  info: string;
}

const STAGE_META: Record<Stage, StageMeta> = {
  players: {
    key: 'players',
    index: 1,
    packLabel: 'PLAYER PACK',
    accent: GOLD_HI,
    info: 'Your starting squad — tap any card to inspect.',
  },
  managers: {
    key: 'managers',
    index: 2,
    packLabel: 'MANAGER PACK',
    accent: '#3aa0ff',
    info: 'Tap to inspect, then pick ONE gaffer to lead the run.',
  },
  tactics: {
    key: 'tactics',
    index: 3,
    packLabel: 'TACTICAL PACK',
    accent: '#b06cff',
    info: 'Tap to inspect, then pick ONE play to carry into the run.',
  },
};

// Screen-level one-shot animations (kcfcp-prefixed; FoilCard owns the per-card
// kcfc* keyframes). Reduced motion kills everything under the shell.
const KCFCP_CSS = `
@keyframes kcfcpPackPulse {
  0%, 100% { transform: scale(1) rotate(-1.5deg); }
  50%      { transform: scale(1.035) rotate(-1.5deg); }
}
@keyframes kcfcpHint {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
@keyframes kcfcpFlash {
  0%   { opacity: 0; }
  18%  { opacity: .85; }
  100% { opacity: 0; }
}
@keyframes kcfcpShimmer {
  0%   { background-position: -160% 0; }
  100% { background-position: 260% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .kcfcp, .kcfcp * { animation: none !important; }
}
`;

// ===========================================================================
// Sealed pack — foil-shimmering pack card, TAP TO OPEN
// ===========================================================================

function SealedPack({ meta, count, countNoun, onOpen }: { meta: StageMeta; count: number; countNoun: string; onOpen: () => void }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center" style={{ gap: 22 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${meta.packLabel}`}
        style={{
          width: 196,
          height: 288,
          borderRadius: 16,
          cursor: 'pointer',
          background: 'linear-gradient(160deg, #2a1a10 0%, #140b06 100%)',
          border: `3px solid ${meta.accent}`,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: `0 10px 26px rgba(0,0,0,0.6), 0 0 30px ${meta.accent}66`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          animation: 'kcfcpPackPulse 1.7s ease-in-out infinite',
        }}
      >
        {/* travelling foil shimmer */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
            opacity: 0.45,
            background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.6) 48%, transparent 66%)',
            backgroundSize: '250% 100%',
            animation: 'kcfcpShimmer 3.5s linear infinite',
          }}
        />
        {/* accent inner glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(circle at 50% 40%, ${meta.accent}33 0%, transparent 65%)`,
          }}
        />
        <span
          style={{
            fontFamily: PIXEL,
            fontSize: 52,
            lineHeight: 0.9,
            color: 'var(--cream)',
            transform: 'rotate(-11deg)',
            textShadow: '3px 3px 0 rgba(0,0,0,0.55)',
            zIndex: 2,
          }}
        >
          KC
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: 11, letterSpacing: '.16em', color: meta.accent, zIndex: 2, marginTop: 8 }}>
          {meta.packLabel}
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: '.12em', color: 'var(--cream-soft)', zIndex: 2 }}>
          {count} {countNoun.toUpperCase()}
        </span>
      </button>

      <span
        style={{
          fontFamily: PIXEL,
          fontSize: 11,
          letterSpacing: '.2em',
          color: 'var(--cream)',
          animation: 'kcfcpHint 1.3s ease-in-out infinite',
        }}
      >
        TAP TO OPEN
      </span>
    </div>
  );
}

// ===========================================================================
// Stage bodies
// ===========================================================================

/** Player stage — the handoff grid: 3 columns, gap 7, rows as needed. The
 *  classic pack is 16 cards (not 9), so the grid scrolls internally; every card
 *  is a fixed-height 234 foil card and the cascade staggers 70ms per card. */
function PlayerGrid({ players, onOpen }: { players: Card[]; onOpen: (c: Card) => void }) {
  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      style={{ overscrollBehavior: 'contain', padding: '8px 0 12px' }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'start', gap: 7 }}
      >
        {players.map((c, i) => (
          <GameCard key={c.id} model={{ variant: 'player', card: c }} size="grid" delay={i * 70} onClick={() => onOpen(c)} />
        ))}
      </div>
    </div>
  );
}

/** A PICK button under a manager/tactic tile. */
function PickBtn({ picked, accent, small, onClick, label }: { picked: boolean; accent: string; small?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="active:scale-95"
      style={{
        fontFamily: PIXEL,
        fontSize: small ? 9 : 11,
        letterSpacing: 0.4,
        color: picked ? '#0b0703' : 'var(--cream)',
        padding: small ? '7px 0' : '10px 0',
        borderRadius: 'var(--radius-sm)',
        border: picked ? `2px solid ${accent}` : '2px solid var(--ink-black)',
        background: picked ? accent : 'var(--surface)',
        boxShadow: picked ? `0 3px 0 0 var(--ink-black), 0 0 16px ${accent}55` : '0 3px 0 0 var(--ink-black)',
        transition: 'transform 0.12s ease',
        cursor: 'pointer',
      }}
    >
      {picked ? 'PICKED ✓' : label}
    </button>
  );
}

function ManagerGrid({
  managers,
  pickedId,
  accent,
  onOpen,
  onPick,
}: {
  managers: JokerCard[];
  pickedId: string | null;
  accent: string;
  onOpen: (m: JokerCard) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain', padding: '8px 0 12px' }}>
      <div
        className="grid mx-auto w-full"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, alignContent: 'start', maxWidth: 340 }}
      >
        {managers.map((m, i) => {
          const picked = pickedId === m.id;
          return (
            <div key={m.id} className="flex flex-col" style={{ gap: 8, minWidth: 0 }}>
              <GameCard
                model={{ variant: 'manager', manager: m }}
                delay={i * 120}
                selected={picked}
                onClick={() => onOpen(m)}
                ariaLabel={`Inspect ${m.name}`}
              />
              <PickBtn picked={picked} accent={accent} onClick={() => onPick(m.id)} label="PICK MANAGER" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TacticGrid({
  tactics,
  pickedId,
  accent,
  onOpen,
  onPick,
}: {
  tactics: TacticCard[];
  pickedId: string | null;
  accent: string;
  onOpen: (t: TacticCard) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain', padding: '8px 0 12px' }}>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 7, alignContent: 'start' }}
      >
        {tactics.map((t, i) => {
          const picked = pickedId === t.id;
          return (
            <div key={t.id} className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
              <GameCard
                // A freshly-ripped tactic arrives with a single charge (see tactics.ts).
                model={{ variant: 'tactic', tactic: t, charges: 1 }}
                delay={i * 70}
                selected={picked}
                onClick={() => onOpen(t)}
                ariaLabel={`Inspect ${t.name}`}
              />
              <PickBtn picked={picked} accent={accent} small onClick={() => onPick(t.id)} label="PICK" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Main component — props contract with GameShell preserved exactly.
// ===========================================================================

interface PackRevealProps {
  contents: PackContents;
  onContinue: (managerId: string | null, tacticId: string | null) => void;
}

export default function PackReveal({ contents, onContinue }: PackRevealProps) {
  const [stage, setStage] = useState<Stage>('players');
  const [phase, setPhase] = useState<Phase>('sealed');
  const [pickedManagerId, setPickedManagerId] = useState<string | null>(null);
  const [pickedTacticId, setPickedTacticId] = useState<string | null>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);

  // Players sorted strongest-first so pulls feel rewarding (display only).
  const sortedPlayers = useMemo(
    () => [...contents.players].sort((a, b) => b.power - a.power),
    [contents.players],
  );

  const meta = STAGE_META[stage];
  const count =
    stage === 'players' ? contents.players.length : stage === 'managers' ? contents.managers.length : contents.tactics.length;
  const countNoun = stage === 'players' ? 'players' : stage === 'managers' ? 'managers' : 'tactics';

  // The manager and tactic stages each gate the continue button on a pick.
  const managerGated = stage === 'managers' && pickedManagerId === null;
  const tacticGated = stage === 'tactics' && pickedTacticId === null;
  const gated = managerGated || tacticGated;
  const continueLabel =
    stage === 'tactics'
      ? tacticGated ? 'PICK A TACTIC' : 'PICK YOUR TEAM →'
      : stage === 'managers'
        ? managerGated ? 'PICK A MANAGER' : 'NEXT PACK →'
        : 'NEXT PACK →';

  function advanceStage() {
    if (stage === 'players') {
      setStage('managers');
      setPhase('sealed');
    } else if (stage === 'managers') {
      setStage('tactics');
      setPhase('sealed');
    } else {
      onContinue(pickedManagerId, pickedTacticId);
    }
  }

  return (
    <div
      className="kcfcp flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        background: SCREEN_BG,
        paddingTop: 'max(env(safe-area-inset-top), 14px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <style href="kcfcp-styles" precedence="medium">
        {KCFCP_CSS}
      </style>

      {/* open flash — a one-shot white burst as the pack tears (keyed per stage) */}
      {phase === 'open' && (
        <div
          key={`flash-${stage}`}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            pointerEvents: 'none',
            background: '#fff',
            opacity: 0,
            animation: 'kcfcpFlash .6s ease-out both',
          }}
        />
      )}

      {/* Header — step dots (active = wide pill), title, PACK n / 3 */}
      <div className="shrink-0 relative" style={{ zIndex: 2 }}>
        <div className="flex items-center justify-center" style={{ gap: 6, marginBottom: 10 }}>
          {(['players', 'managers', 'tactics'] as Stage[]).map((s) => {
            const active = STAGE_META[s].index === meta.index;
            const done = STAGE_META[s].index < meta.index;
            return (
              <span
                key={s}
                style={{
                  width: active ? 22 : 8,
                  height: 8,
                  borderRadius: 99,
                  background: active ? GOLD_HI : done ? 'rgba(244,236,216,0.5)' : DOT_OFF,
                  transition: 'all 0.3s ease',
                }}
              />
            );
          })}
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: PIXEL,
            fontSize: 19,
            letterSpacing: '.08em',
            color: GOLD_HI,
            textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 0 18px rgba(245,197,66,0.35)',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {meta.packLabel}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: PIXEL,
            fontSize: 9,
            letterSpacing: '.16em',
            color: 'var(--amber)',
            marginTop: 4,
          }}
        >
          PACK {meta.index} / 3
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col relative" style={{ zIndex: 2, marginTop: 4 }}>
        {phase === 'sealed' ? (
          <SealedPack meta={meta} count={count} countNoun={countNoun} onOpen={() => setPhase('open')} />
        ) : (
          <>
            {/* Info line — ONE line, hairline gold-tinted pill (handoff spec). */}
            <div
              className="shrink-0"
              style={{
                border: `1px solid ${INFO_BORDER}`,
                background: INFO_BG,
                borderRadius: 8,
                padding: '8px 12px',
                margin: '12px 0 0',
                fontSize: 11.5,
                lineHeight: 1.3,
                color: 'var(--cream-soft)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {meta.info}
            </div>

            {stage === 'players' ? (
              <PlayerGrid players={sortedPlayers} onOpen={(c) => setModal({ variant: 'player', card: c })} />
            ) : stage === 'managers' ? (
              <ManagerGrid
                managers={contents.managers}
                pickedId={pickedManagerId}
                accent={meta.accent}
                onOpen={(m) => setModal({ variant: 'manager', manager: m })}
                onPick={(id) => setPickedManagerId(id)}
              />
            ) : (
              <TacticGrid
                tactics={contents.tactics}
                pickedId={pickedTacticId}
                accent={meta.accent}
                onOpen={(t) => setModal({ variant: 'tactic', tactic: t, charges: 1 })}
                onPick={(id) => setPickedTacticId(id)}
              />
            )}
          </>
        )}
      </div>

      {/* Footer CTA (only after reveal) */}
      {phase === 'open' && (
        <div className="shrink-0 relative" style={{ zIndex: 2, paddingTop: 8 }}>
          <button
            type="button"
            onClick={advanceStage}
            disabled={gated}
            className={gated ? '' : 'active:scale-95'}
            style={{
              width: '100%',
              fontFamily: PIXEL,
              fontSize: 14,
              letterSpacing: '.06em',
              color: gated ? 'var(--dust)' : '#1a0f08',
              padding: '14px 0',
              borderRadius: 10,
              border: 'none',
              background: gated
                ? 'var(--surface)'
                : 'linear-gradient(180deg, var(--amber), var(--amber-soft))',
              boxShadow: gated
                ? '0 4px 0 0 var(--ink-black)'
                : '0 5px 0 #a3560a, 0 0 24px var(--amber-glow)',
              transition: 'transform 0.12s ease',
              cursor: gated ? 'default' : 'pointer',
            }}
          >
            {continueLabel}
          </button>
        </div>
      )}

      {/* Full-card overlay — the EXISTING inspect modal */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
