'use client';

import { useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import type { PackContents } from '../lib/packs';
import type { Formation } from '../lib/formations';
import { getFormation, positionFitsSlot } from '../lib/formations';
import type { TeamSelection, TeamIntent } from '../lib/run';
import {
  type XISelection,
  emptySelection,
  startersFilled,
  autoFill,
  BENCH_SIZE,
} from '../lib/team-select';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL, RARITY_COLOR, POSITION_COLOR, lastName } from './cards/cardTokens';

interface TeamSelectProps {
  contents: PackContents;
  /** Pre-selected gaffer carried from the manager pack reveal. */
  initialManagerId?: string | null;
  onConfirm: (sel: TeamSelection) => void;
}

const INTENTS: { id: TeamIntent; label: string; accent: string }[] = [
  { id: 'attacking', label: 'ATT', accent: 'var(--kit-red)' },
  { id: 'balanced', label: 'BAL', accent: 'var(--gold)' },
  { id: 'defensive', label: 'DEF', accent: 'var(--kit-blue)' },
];

type Overlay =
  | { kind: 'slot'; index: number }
  | { kind: 'bench' }
  | { kind: 'manager' }
  | { kind: 'formation' }
  | null;

export default function TeamSelect({ contents, initialManagerId, onConfirm }: TeamSelectProps) {
  const pool = contents.players;
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(contents.formations[0]?.id ?? '4-3-3');
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => emptySelection(formation));
  const [managerId, setManagerId] = useState<string | null>(
    initialManagerId && contents.managers.some((m) => m.id === initialManagerId) ? initialManagerId : null,
  );
  const [intent, setIntent] = useState<TeamIntent>('balanced');
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Tracks which slot index just received a chip, to fire the place animation.
  const [placedSlot, setPlacedSlot] = useState<number | null>(null);
  // Full-card overlay (tap any card to inspect — non-destructive).
  const [modal, setModal] = useState<GameCardModel | null>(null);

  const usedIds = useMemo(
    () => new Set<number>([...sel.starters.filter((x): x is number => x != null), ...sel.bench]),
    [sel],
  );
  const available = useMemo(
    () => pool.filter((c) => !usedIds.has(c.id)).sort((a, b) => b.power - a.power),
    [pool, usedIds],
  );

  const filled = startersFilled(sel);
  const slotCount = formation.slots.length;
  const manager = contents.managers.find((m) => m.id === managerId) ?? null;
  const ready = filled === slotCount && manager !== null;

  // Live squad average power of the placed XI (clean, single useful number).
  const xiAvg = useMemo(() => {
    const powers = sel.starters
      .filter((x): x is number => x != null)
      .map((id) => byId.get(id)?.power ?? 0);
    if (powers.length === 0) return 0;
    return Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
  }, [sel.starters, byId]);

  function switchFormation(id: string) {
    setFormationId(id);
    setSel(emptySelection(getFormation(id)));
    setOverlay(null);
  }

  function placeInOverlay(cardId: number) {
    setSel((prev) => {
      const next: XISelection = {
        starters: prev.starters.map((id) => (id === cardId ? null : id)),
        bench: prev.bench.filter((id) => id !== cardId),
      };
      if (overlay?.kind === 'slot') next.starters[overlay.index] = cardId;
      else if (overlay?.kind === 'bench' && next.bench.length < BENCH_SIZE) next.bench.push(cardId);
      return next;
    });
    if (overlay?.kind === 'slot') {
      const idx = overlay.index;
      setPlacedSlot(idx);
      setTimeout(() => setPlacedSlot((cur) => (cur === idx ? null : cur)), 280);
    }
    setOverlay(null);
  }

  function clearSlot(i: number) {
    setSel((prev) => {
      const s = [...prev.starters];
      s[i] = null;
      return { ...prev, starters: s };
    });
  }
  function removeBench(cardId: number) {
    setSel((prev) => ({ ...prev, bench: prev.bench.filter((id) => id !== cardId) }));
  }

  function confirm() {
    if (!ready) return;
    onConfirm({
      players: pool,
      startingXI: sel.starters.filter((x): x is number => x != null),
      benchIds: sel.bench,
      manager,
      tactics: contents.tactics,
      formationId,
      intent,
    });
  }

  const activeSlot = overlay?.kind === 'slot' ? formation.slots[overlay.index] : null;

  return (
    <div
      className="kc-app-bg flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {/* ── Header: title · squad avg · Kick Off ───────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3">
        <div className="flex flex-col mr-auto min-w-0">
          <span
            className="uppercase truncate"
            style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
          >
            Pick Your XI
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
            {filled}/{slotCount} STARTERS {'·'} {sel.bench.length}/{BENCH_SIZE} BENCH
          </span>
        </div>

        {/* Squad average power badge — glass chip, rating stays pixel --line-white. */}
        <div
          className="glass-surface flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
          style={{
            width: 46,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 15, lineHeight: 1, color: 'var(--line-white)' }}>{xiAvg || '--'}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>AVG</span>
        </div>

        <button
          onClick={confirm}
          disabled={!ready}
          className={`active:scale-95 shrink-0 relative overflow-hidden ${ready ? 'sheen-strong glow-edge' : 'glass-surface sheen'}`}
          style={{
            fontFamily: PIXEL,
            fontSize: 13,
            letterSpacing: 0.5,
            color: ready ? 'var(--line-white)' : 'var(--ink)',
            height: 40,
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: ready ? '2px solid var(--ink-black)' : undefined,
            background: ready
              ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))'
              : undefined,
            boxShadow: ready
              ? 'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)'
              : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
            cursor: ready ? 'pointer' : 'default',
            ...(ready ? { ['--glow' as string]: 'var(--amber-glow)' } : {}),
          }}
        >
          KICK OFF
        </button>
      </div>

      {/* ── Control bar: formation · intent · manager ──────────────────── */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-3 mt-2">
        {/* Formation chip — glass */}
        <button
          onClick={() => setOverlay({ kind: 'formation' })}
          className="glass-surface sheen flex flex-col items-start justify-center px-2.5 active:scale-95 relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
            minWidth: 64,
          }}
        >
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: 'var(--dust)', zIndex: 2 }}>SHAPE</span>
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1.1, color: 'var(--cream)', zIndex: 2 }}>{formation.name}</span>
        </button>

        {/* Intent segmented toggle — glass track; the active segment keeps its
            kit-accent fill (that colour is identity, not chrome). */}
        <div
          className="glass-surface flex relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
          }}
        >
          {INTENTS.map((it) => {
            const on = intent === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setIntent(it.id)}
                className="px-2.5 active:scale-95 relative"
                style={{
                  fontFamily: PIXEL,
                  fontSize: 10,
                  letterSpacing: 0.5,
                  background: on ? it.accent : 'transparent',
                  color: on ? 'var(--ink-black)' : 'var(--cream-soft)',
                  boxShadow: on ? `inset 0 1px 0 0 rgba(242,246,239,0.35)` : undefined,
                  transition: 'background 0.15s ease',
                  zIndex: 2,
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>

        {/* Manager chip — glass; gaffer accent glow when filled. */}
        <button
          onClick={() => setOverlay({ kind: 'manager' })}
          className="glass-surface sheen flex-1 flex items-center gap-1.5 px-2 min-w-0 active:scale-[0.98] relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius-sm)',
            border: manager ? '1px solid var(--kit-red)' : undefined,
            boxShadow: manager
              ? 'inset 0 1px 0 0 var(--glass-highlight), 0 0 12px rgba(232,54,47,0.30), var(--depth-1)'
              : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
          }}
        >
          <span className="relative" style={{ fontSize: 16, flexShrink: 0, zIndex: 2 }}>{'\u{1F454}'}</span>
          <span className="flex flex-col items-start min-w-0 relative" style={{ zIndex: 2 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: manager ? 'var(--kit-red)' : 'var(--dust)' }}>
              {manager ? 'GAFFER' : 'PICK GAFFER'}
            </span>
            <span className="truncate" style={{ fontSize: 11, fontWeight: 700, color: manager ? 'var(--cream)' : 'var(--dust)', maxWidth: 86 }}>
              {manager ? manager.name : 'Tap to choose'}
            </span>
          </span>
        </button>
      </div>

      {/* ── Pitch ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-3 mt-2.5">
        <Pitch
          formation={formation}
          starters={sel.starters}
          byId={byId}
          placedSlot={placedSlot}
          onSlot={(i, hasCard) => (hasCard ? clearSlot(i) : setOverlay({ kind: 'slot', index: i }))}
          onInspect={(card) => setModal({ variant: 'player', card })}
        />
      </div>

      {/* ── Bench + actions ────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 mt-2">
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>
            BENCH {sel.bench.length}/{BENCH_SIZE}
          </span>
          <div className="flex items-center gap-1">
            <ActionBtn label="AUTO" accent="var(--gold)" onClick={() => setSel(autoFill(pool, formation, sel, 'all'))} />
            <ActionBtn label="FILL" accent="var(--cream-soft)" onClick={() => setSel(autoFill(pool, formation, sel, 'empty'))} />
            <ActionBtn label="CLEAR" accent="var(--dust)" onClick={() => setSel(emptySelection(formation))} />
          </div>
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${BENCH_SIZE}, minmax(0, 1fr))` }}>
          {Array.from({ length: BENCH_SIZE }).map((_, i) => {
            const cardId = sel.bench[i];
            const card = cardId != null ? byId.get(cardId) : undefined;
            const ring = card ? RARITY_COLOR[card.rarity] ?? 'var(--border)' : 'var(--border)';
            return (
              <button
                key={i}
                onClick={() => (card ? setModal({ variant: 'player', card }) : setOverlay({ kind: 'bench' }))}
                className={`relative flex flex-col items-center justify-center active:scale-95 ${card ? 'glass-surface' : ''}`}
                style={{
                  height: 44,
                  borderRadius: 'var(--radius-sm)',
                  background: card ? undefined : 'rgba(0,0,0,0.28)',
                  border: card ? `1px solid ${ring}` : '2px dashed var(--border)',
                  boxShadow: card
                    ? `inset 0 1px 0 0 var(--glass-highlight), 0 0 8px ${ring}33, var(--depth-1)`
                    : undefined,
                  transition: 'transform 0.12s ease',
                  minWidth: 0,
                }}
              >
                {card ? (
                  <>
                    <span className="relative" style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: 'var(--line-white)', zIndex: 2 }}>
                      {Math.round(card.power)}
                    </span>
                    <span className="truncate w-full text-center px-0.5 relative" style={{ fontSize: 7.5, color: 'var(--cream-soft)', marginTop: 2, zIndex: 2 }}>
                      {lastName(card.name)}
                    </span>
                    {/* Remove affordance — keeps tap = inspect, this corner = remove. */}
                    <span
                      role="button"
                      aria-label={`Remove ${lastName(card.name)} from bench`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBench(card.id);
                      }}
                      className="absolute flex items-center justify-center"
                      style={{
                        top: -5,
                        right: -5,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'var(--danger)',
                        border: '1.5px solid var(--ink-black)',
                        color: 'var(--line-white)',
                        fontFamily: PIXEL,
                        fontSize: 9,
                        lineHeight: 1,
                        zIndex: 3,
                      }}
                    >
                      {'×'}
                    </span>
                  </>
                ) : (
                  <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--ink)' }}>+</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Overlays ───────────────────────────────────────────────────── */}
      {overlay && (
        <div
          className="absolute inset-0 flex flex-col justify-end scrim-fade"
          style={{ background: 'rgba(2,9,5,0.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 40 }}
          onClick={() => setOverlay(null)}
        >
          <div
            className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
            style={{
              borderTopLeftRadius: 'var(--radius-lg)',
              borderTopRightRadius: 'var(--radius-lg)',
              borderTop: `3px solid ${
                overlay.kind === 'manager'
                  ? 'var(--kit-red)'
                  : overlay.kind === 'formation'
                    ? 'var(--kit-blue)'
                    : 'var(--gold)'
              }`,
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)',
              maxHeight: '64%',
              paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0 relative" style={{ zIndex: 2 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
            </div>

            <div className="flex items-center justify-between px-3 pb-2 shrink-0 relative" style={{ zIndex: 2 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5, color: 'var(--cream)' }}>
                {overlay.kind === 'manager'
                  ? 'PICK GAFFER'
                  : overlay.kind === 'formation'
                    ? 'PICK SHAPE'
                    : overlay.kind === 'bench'
                      ? 'ADD TO BENCH'
                      : `FILL ${(activeSlot?.label ?? '').toUpperCase()}`}
              </span>
              <button
                onClick={() => setOverlay(null)}
                className="glass-surface active:scale-90 relative overflow-hidden"
                style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                CLOSE
              </button>
            </div>

            {overlay.kind === 'manager' ? (
              <ManagerSheet
                managers={contents.managers}
                managerId={managerId}
                onPick={(id) => {
                  setManagerId(id);
                  setOverlay(null);
                }}
                onInspect={(m) => setModal({ variant: 'manager', manager: m })}
              />
            ) : overlay.kind === 'formation' ? (
              <FormationSheet formations={contents.formations} current={formationId} onPick={switchFormation} />
            ) : (
              <PlayerSheet
                available={available}
                activeSlot={activeSlot}
                onPick={placeInOverlay}
                onInspect={(c) => setModal({ variant: 'player', card: c })}
              />
            )}
          </div>
        </div>
      )}

      {/* Full-card overlay — sits above the sheets. */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pitch — top-down Sensible-Soccer field with sprite chips
// ---------------------------------------------------------------------------

function Pitch({
  formation,
  starters,
  byId,
  placedSlot,
  onSlot,
  onInspect,
}: {
  formation: Formation;
  starters: (number | null)[];
  byId: Map<number, Card>;
  placedSlot: number | null;
  onSlot: (index: number, hasCard: boolean) => void;
  onInspect: (card: Card) => void;
}) {
  const line = 'rgba(242,246,239,0.5)';
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        borderRadius: 'var(--radius)',
        border: '2px solid var(--ink-black)',
        boxShadow: '0 3px 0 0 var(--ink-black), inset 0 0 60px rgba(0,0,0,0.35)',
        background:
          'repeating-linear-gradient(180deg, var(--pitch-bright) 0px, var(--pitch-bright) 9%, var(--pitch-stripe) 9%, var(--pitch-stripe) 18%)',
      }}
    >
      {/* Pitch line markings (SVG keeps lines crisp & GPU-cheap). */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 150" preserveAspectRatio="none">
        {/* outer touchline inset */}
        <rect x="3" y="3" width="94" height="144" fill="none" stroke={line} strokeWidth="0.6" />
        {/* half-way line */}
        <line x1="3" y1="75" x2="97" y2="75" stroke={line} strokeWidth="0.6" />
        {/* centre circle */}
        <circle cx="50" cy="75" r="11" fill="none" stroke={line} strokeWidth="0.6" />
        <circle cx="50" cy="75" r="1" fill={line} />
        {/* top (attacking) penalty box + 6-yard + arc */}
        <rect x="26" y="3" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
        <rect x="38" y="3" width="24" height="8" fill="none" stroke={line} strokeWidth="0.6" />
        <path d="M 40 23 A 11 11 0 0 0 60 23" fill="none" stroke={line} strokeWidth="0.6" />
        {/* bottom (defending) penalty box + 6-yard + arc */}
        <rect x="26" y="127" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
        <rect x="38" y="139" width="24" height="8" fill="none" stroke={line} strokeWidth="0.6" />
        <path d="M 40 127 A 11 11 0 0 1 60 127" fill="none" stroke={line} strokeWidth="0.6" />
        {/* goals */}
        <rect x="43" y="1.4" width="14" height="1.6" fill="none" stroke={line} strokeWidth="0.6" />
        <rect x="43" y="147" width="14" height="1.6" fill="none" stroke={line} strokeWidth="0.6" />
      </svg>

      {/* Slots */}
      {formation.slots.map((slot, i) => {
        const cardId = starters[i];
        const card = cardId != null ? byId.get(cardId) : undefined;
        return (
          <PitchSlot
            key={i}
            slot={slot}
            card={card}
            justPlaced={placedSlot === i}
            onClick={() => onSlot(i, !!card)}
            onInspect={card ? () => onInspect(card) : undefined}
          />
        );
      })}
    </div>
  );
}

function PitchSlot({
  slot,
  card,
  justPlaced,
  onClick,
  onInspect,
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  justPlaced: boolean;
  onClick: () => void;
  onInspect?: () => void;
}) {
  const isGK = slot.type === 'GK';
  const kit = isGK ? '#16a34a' : 'var(--kit-red)';
  const rarityRing = card ? RARITY_COLOR[card.rarity] ?? 'var(--line-white)' : null;
  const posColor = card ? POSITION_COLOR[card.position] ?? 'var(--dust)' : null;

  return (
    <button
      onClick={onClick}
      className="absolute flex flex-col items-center active:scale-95"
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        transform: 'translate(-50%, -50%)',
        width: 50,
        transition: 'transform 0.1s ease',
      }}
    >
      {card ? (
        <div
          className={`relative flex items-center justify-center ${justPlaced ? 'chip-place' : ''}`}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 32%, ${kit}, ${isGK ? '#0f7a35' : '#b62520'})`,
            border: `2px solid ${rarityRing}`,
            boxShadow: '0 2px 0 0 var(--ink-black), 0 3px 5px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 13, color: 'var(--line-white)', textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}>
            {Math.round(card.power)}
          </span>
          {/* position dot */}
          <span
            className="absolute"
            style={{
              bottom: -2,
              left: -2,
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: posColor!,
              border: '1.5px solid var(--ink-black)',
            }}
          />
          {/* Info affordance — non-destructive full-card view (tap on chip = remove). */}
          <span
            role="button"
            aria-label={`Inspect ${lastName(card.name)}`}
            onClick={(e) => {
              e.stopPropagation();
              onInspect?.();
            }}
            className="absolute flex items-center justify-center"
            style={{
              bottom: -3,
              right: -4,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--surface)',
              border: '1.5px solid var(--line-white)',
              color: 'var(--line-white)',
              fontFamily: PIXEL,
              fontSize: 8,
              lineHeight: 1,
            }}
          >
            i
          </span>
        </div>
      ) : (
        <div
          className="slot-pulse flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(7,16,11,0.45)',
            border: '2px dashed rgba(242,246,239,0.7)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'rgba(242,246,239,0.9)', lineHeight: 1 }}>+</span>
        </div>
      )}
      <span
        className="truncate text-center"
        style={{
          width: 54,
          marginTop: 3,
          fontSize: card ? 8.5 : 7.5,
          fontWeight: card ? 700 : 400,
          fontFamily: card ? 'inherit' : PIXEL,
          letterSpacing: card ? 0 : 0.5,
          color: 'var(--line-white)',
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          lineHeight: 1.1,
        }}
      >
        {card ? lastName(card.name) : slot.label.toUpperCase()}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Small action button (AUTO / FILL / CLEAR)
// ---------------------------------------------------------------------------

function ActionBtn({ label, accent, onClick }: { label: string; accent: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-surface sheen active:scale-95 relative overflow-hidden"
      style={{
        fontFamily: PIXEL,
        fontSize: 9,
        letterSpacing: 0.5,
        color: accent,
        padding: '5px 8px',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
        transition: 'transform 0.12s ease',
      }}
    >
      <span className="relative" style={{ zIndex: 2 }}>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Player picker sheet — eligible-first grid of player GameCards.
// Tap a card to place it; the info pip opens the full card (non-destructive).
// ---------------------------------------------------------------------------

function PlayerSheet({
  available,
  activeSlot,
  onPick,
  onInspect,
}: {
  available: Card[];
  activeSlot: Formation['slots'][number] | null;
  onPick: (id: number) => void;
  onInspect: (c: Card) => void;
}) {
  const sorted = useMemo(() => {
    if (!activeSlot) return available;
    return [...available].sort((a, b) => {
      const ea = positionFitsSlot(a.position, activeSlot) ? 0 : 1;
      const eb = positionFitsSlot(b.position, activeSlot) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return b.power - a.power;
    });
  }, [available, activeSlot]);

  return (
    <div className="grid grid-cols-3 gap-2 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {sorted.map((c) => {
        const eligible = !activeSlot || positionFitsSlot(c.position, activeSlot);
        return (
          <div key={c.id} className="relative" style={{ minWidth: 0 }}>
            <GameCard
              model={{ variant: 'player', card: c }}
              dimmed={!eligible}
              onClick={() => onPick(c.id)}
              ariaLabel={`Place ${c.name}`}
            />
            <span
              role="button"
              aria-label={`Inspect ${c.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onInspect(c);
              }}
              className="absolute flex items-center justify-center active:scale-90"
              style={{
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--surface)',
                border: '1.5px solid var(--line-white)',
                color: 'var(--line-white)',
                fontFamily: PIXEL,
                fontSize: 9,
                lineHeight: 1,
                zIndex: 2,
              }}
            >
              i
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager picker sheet — gaffer GameCards. Tap to pick; info pip to inspect.
// ---------------------------------------------------------------------------

function ManagerSheet({
  managers,
  managerId,
  onPick,
  onInspect,
}: {
  managers: PackContents['managers'];
  managerId: string | null;
  onPick: (id: string) => void;
  onInspect: (m: PackContents['managers'][number]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {managers.map((m) => {
        const on = managerId === m.id;
        return (
          <div key={m.id} className="relative" style={{ minWidth: 0 }}>
            <GameCard
              model={{ variant: 'manager', manager: m }}
              selected={on}
              onClick={() => onPick(m.id)}
              ariaLabel={`Pick ${m.name}`}
            />
            <span
              role="button"
              aria-label={`Inspect ${m.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onInspect(m);
              }}
              className="absolute flex items-center justify-center active:scale-90"
              style={{
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--surface)',
                border: '1.5px solid var(--line-white)',
                color: 'var(--line-white)',
                fontFamily: PIXEL,
                fontSize: 9,
                lineHeight: 1,
                zIndex: 2,
              }}
            >
              i
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formation picker sheet
// ---------------------------------------------------------------------------

function FormationSheet({
  formations,
  current,
  onPick,
}: {
  formations: Formation[];
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {formations.map((f) => {
        const on = f.id === current;
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            className={`text-left active:scale-[0.98] relative overflow-hidden ${on ? 'glass-raised sheen glow-edge' : 'glass-surface sheen'}`}
            style={{
              border: on ? '1px solid var(--kit-blue)' : undefined,
              borderRadius: 'var(--radius-sm)',
              padding: '10px 11px',
              boxShadow: on
                ? 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-2)'
                : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
              transition: 'transform 0.1s ease',
              minWidth: 0,
              ...(on ? { ['--glow' as string]: 'var(--glow-rare)' } : {}),
            }}
          >
            <span className="relative" style={{ fontFamily: PIXEL, fontSize: 15, color: on ? 'var(--kit-blue)' : 'var(--cream)', lineHeight: 1, zIndex: 2 }}>
              {f.name}
            </span>
            <p className="relative" style={{ fontSize: 9, lineHeight: 1.35, color: 'var(--dust)', margin: '5px 0 0', zIndex: 2 }}>{f.description}</p>
          </button>
        );
      })}
    </div>
  );
}
