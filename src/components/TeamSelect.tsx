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

interface TeamSelectProps {
  contents: PackContents;
  onConfirm: (sel: TeamSelection) => void;
}

const INTENTS: { id: TeamIntent; label: string; accent: string }[] = [
  { id: 'attacking', label: 'ATT', accent: 'var(--kit-red)' },
  { id: 'balanced', label: 'BAL', accent: 'var(--gold)' },
  { id: 'defensive', label: 'DEF', accent: 'var(--kit-blue)' },
];

// Rarity rings the chip; ratings stay line-white for legibility (DESIGN contrast law).
const RARITY_COLOR: Record<string, string> = {
  Common: '#9aa0a8',
  Rare: '#3d7bd6',
  Epic: '#a855f7',
  Legendary: '#e8a23a',
};

// Position family → dot colour, matching PackReveal's POSITION_COLORS palette.
const POSITION_COLOR: Record<string, string> = {
  GK: '#e8621a',
  CD: '#3d7bd6',
  WD: '#3d7bd6',
  DM: '#22c55e',
  CM: '#22c55e',
  WM: '#22c55e',
  AM: '#a855f7',
  WF: '#f59e0b',
  CF: '#e23b35',
};

const NATION_FLAG: Record<string, string> = {
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  France: '\u{1F1EB}\u{1F1F7}',
  Sweden: '\u{1F1F8}\u{1F1EA}',
  Portugal: '\u{1F1F5}\u{1F1F9}',
  Brazil: '\u{1F1E7}\u{1F1F7}',
  Germany: '\u{1F1E9}\u{1F1EA}',
};

const PIXEL = 'var(--font-pixel, monospace)';

function lastName(name: string): string {
  const p = name.trim().split(' ');
  return p[p.length - 1];
}

type Overlay =
  | { kind: 'slot'; index: number }
  | { kind: 'bench' }
  | { kind: 'manager' }
  | { kind: 'formation' }
  | null;

export default function TeamSelect({ contents, onConfirm }: TeamSelectProps) {
  const pool = contents.players;
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(contents.formations[0]?.id ?? '4-3-3');
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => emptySelection(formation));
  const [managerId, setManagerId] = useState<string | null>(null);
  const [intent, setIntent] = useState<TeamIntent>('balanced');
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Tracks which slot index just received a chip, to fire the place animation.
  const [placedSlot, setPlacedSlot] = useState<number | null>(null);

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
  const intentMeta = INTENTS.find((it) => it.id === intent)!;

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        background: 'var(--felt)',
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

        {/* Squad average power badge */}
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            width: 46,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 2px 0 0 var(--ink-black)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 15, lineHeight: 1, color: 'var(--line-white)' }}>{xiAvg || '--'}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>AVG</span>
        </div>

        <button
          onClick={confirm}
          disabled={!ready}
          className="active:scale-95 shrink-0"
          style={{
            fontFamily: PIXEL,
            fontSize: 13,
            letterSpacing: 0.5,
            color: ready ? 'var(--cream)' : 'var(--ink)',
            height: 40,
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--ink-black)',
            background: ready
              ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))'
              : 'var(--surface)',
            boxShadow: ready
              ? '0 3px 0 0 var(--ink-black), 0 5px 14px var(--amber-glow)'
              : '0 3px 0 0 var(--ink-black)',
            transition: 'transform 0.12s ease',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          KICK OFF
        </button>
      </div>

      {/* ── Control bar: formation · intent · manager ──────────────────── */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-3 mt-2">
        {/* Formation chip */}
        <button
          onClick={() => setOverlay({ kind: 'formation' })}
          className="flex flex-col items-start justify-center px-2.5 active:scale-95"
          style={{
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '2px solid var(--ink-black)',
            transition: 'transform 0.12s ease',
            minWidth: 64,
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: 'var(--dust)' }}>SHAPE</span>
          <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1.1, color: 'var(--cream)' }}>{formation.name}</span>
        </button>

        {/* Intent segmented toggle */}
        <div
          className="flex"
          style={{ borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', overflow: 'hidden' }}
        >
          {INTENTS.map((it) => {
            const on = intent === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setIntent(it.id)}
                className="px-2.5 active:scale-95"
                style={{
                  fontFamily: PIXEL,
                  fontSize: 10,
                  letterSpacing: 0.5,
                  background: on ? it.accent : 'var(--surface)',
                  color: on ? 'var(--ink-black)' : 'var(--cream-soft)',
                  transition: 'background 0.15s ease',
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>

        {/* Manager chip */}
        <button
          onClick={() => setOverlay({ kind: 'manager' })}
          className="flex-1 flex items-center gap-1.5 px-2 min-w-0 active:scale-[0.98]"
          style={{
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: `2px solid ${manager ? 'var(--kit-red)' : 'var(--ink-black)'}`,
            transition: 'transform 0.12s ease',
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>{'\u{1F454}'}</span>
          <span className="flex flex-col items-start min-w-0">
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
                onClick={() => (card ? removeBench(card.id) : setOverlay({ kind: 'bench' }))}
                className="flex flex-col items-center justify-center active:scale-95"
                style={{
                  height: 44,
                  borderRadius: 'var(--radius-sm)',
                  background: card ? 'var(--surface)' : 'rgba(0,0,0,0.28)',
                  border: card ? `2px solid ${ring}` : '2px dashed var(--border)',
                  transition: 'transform 0.12s ease',
                  minWidth: 0,
                }}
              >
                {card ? (
                  <>
                    <span style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: 'var(--line-white)' }}>
                      {Math.round(card.power)}
                    </span>
                    <span className="truncate w-full text-center px-0.5" style={{ fontSize: 7.5, color: 'var(--cream-soft)', marginTop: 2 }}>
                      {lastName(card.name)}
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
          style={{ background: 'rgba(0,0,0,0.55)', zIndex: 40 }}
          onClick={() => setOverlay(null)}
        >
          <div
            className="sheet-rise rounded-t-[16px] flex flex-col"
            style={{
              background: 'var(--felt)',
              borderTop: `3px solid ${
                overlay.kind === 'manager'
                  ? 'var(--kit-red)'
                  : overlay.kind === 'formation'
                    ? 'var(--kit-blue)'
                    : 'var(--gold)'
              }`,
              maxHeight: '64%',
              paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>

            <div className="flex items-center justify-between px-3 pb-2 shrink-0">
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
                style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)', padding: '4px 6px' }}
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
              />
            ) : overlay.kind === 'formation' ? (
              <FormationSheet formations={contents.formations} current={formationId} onPick={switchFormation} />
            ) : (
              <PlayerSheet available={available} activeSlot={activeSlot} onPick={placeInOverlay} />
            )}
          </div>
        </div>
      )}
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
}: {
  formation: Formation;
  starters: (number | null)[];
  byId: Map<number, Card>;
  placedSlot: number | null;
  onSlot: (index: number, hasCard: boolean) => void;
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
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  justPlaced: boolean;
  onClick: () => void;
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
              right: -2,
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: posColor!,
              border: '1.5px solid var(--ink-black)',
            }}
          />
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
      className="active:scale-95"
      style={{
        fontFamily: PIXEL,
        fontSize: 9,
        letterSpacing: 0.5,
        color: accent,
        padding: '5px 8px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface)',
        border: '2px solid var(--ink-black)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
        transition: 'transform 0.12s ease',
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Player picker sheet — eligible-first grid of sprite cards
// ---------------------------------------------------------------------------

function PlayerSheet({
  available,
  activeSlot,
  onPick,
}: {
  available: Card[];
  activeSlot: Formation['slots'][number] | null;
  onPick: (id: number) => void;
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
    <div className="grid grid-cols-3 gap-1.5 overflow-y-auto px-3 pt-1" style={{ overscrollBehavior: 'contain' }}>
      {sorted.map((c) => {
        const eligible = !activeSlot || positionFitsSlot(c.position, activeSlot);
        const ring = RARITY_COLOR[c.rarity] ?? 'var(--border)';
        const posColor = POSITION_COLOR[c.position] ?? 'var(--dust)';
        return (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="text-left active:scale-95 pixel-edge"
            style={{
              background: 'linear-gradient(160deg, var(--surface-raised), var(--surface))',
              border: `2px solid ${eligible ? ring : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '6px 7px',
              opacity: eligible ? 1 : 0.42,
              transition: 'transform 0.1s ease',
              minWidth: 0,
            }}
          >
            <div className="flex items-center justify-between" style={{ gap: 4 }}>
              <span
                style={{
                  background: posColor,
                  color: 'var(--line-white)',
                  fontFamily: PIXEL,
                  fontSize: 7.5,
                  lineHeight: 1,
                  padding: '3px 4px',
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              >
                {c.position}
              </span>
              <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: 'var(--line-white)' }}>
                {Math.round(c.power)}
              </span>
            </div>
            <span className="truncate block" style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', marginTop: 4, lineHeight: 1.15 }}>
              {lastName(c.name)}
            </span>
            <span className="truncate block" style={{ fontSize: 8.5, color: 'var(--dust)', marginTop: 1, lineHeight: 1 }}>
              {c.archetype}
            </span>
            <div style={{ height: 2, background: ring, borderRadius: 2, marginTop: 4 }} />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager picker sheet — gaffer cards with trait pills
// ---------------------------------------------------------------------------

function ManagerSheet({
  managers,
  managerId,
  onPick,
}: {
  managers: PackContents['managers'];
  managerId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto px-3 pt-1" style={{ overscrollBehavior: 'contain' }}>
      {managers.map((m) => {
        const on = managerId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="text-left active:scale-[0.99] pixel-edge"
            style={{
              background: 'linear-gradient(160deg, var(--surface-raised), var(--surface))',
              border: `2px solid ${on ? 'var(--kit-red)' : 'var(--ink-black)'}`,
              borderRadius: 'var(--radius)',
              padding: 12,
              display: 'flex',
              gap: 11,
              transition: 'transform 0.1s ease',
            }}
          >
            <div
              className="flex items-center justify-center shrink-0 self-center"
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--radius-sm)',
                background: 'radial-gradient(circle at 50% 35%, #2a221a, #14100b)',
                border: '2px solid var(--ink-black)',
                fontSize: 26,
              }}
            >
              {'\u{1F454}'}
            </div>
            <div className="flex flex-col min-w-0" style={{ gap: 5, flex: 1 }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 12, color: on ? 'var(--kit-red)' : 'var(--cream)' }}>
                  {m.name}
                </span>
                {m.nation && (
                  <span style={{ fontSize: 14, flexShrink: 0 }} title={m.nation}>
                    {NATION_FLAG[m.nation] ?? '\u{1F3F3}'}
                  </span>
                )}
              </div>
              <p style={{ fontFamily: 'var(--font-flavour, serif)', fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.3, color: 'var(--cream-soft)', margin: 0 }}>
                {'“'}{m.philosophy}{'”'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {m.traits.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontFamily: PIXEL,
                      fontSize: 7.5,
                      letterSpacing: 0.3,
                      color: 'var(--kit-red)',
                      background: 'rgba(232,54,47,0.14)',
                      border: '1px solid rgba(232,54,47,0.4)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      lineHeight: 1,
                    }}
                  >
                    {t.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </button>
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
    <div className="grid grid-cols-2 gap-1.5 overflow-y-auto px-3 pt-1" style={{ overscrollBehavior: 'contain' }}>
      {formations.map((f) => {
        const on = f.id === current;
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            className="text-left active:scale-[0.98] pixel-edge"
            style={{
              background: 'linear-gradient(160deg, var(--surface-raised), var(--surface))',
              border: `2px solid ${on ? 'var(--kit-blue)' : 'var(--ink-black)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '10px 11px',
              transition: 'transform 0.1s ease',
              minWidth: 0,
            }}
          >
            <span style={{ fontFamily: PIXEL, fontSize: 15, color: on ? 'var(--kit-blue)' : 'var(--cream)', lineHeight: 1 }}>
              {f.name}
            </span>
            <p style={{ fontSize: 9, lineHeight: 1.35, color: 'var(--dust)', margin: '5px 0 0' }}>{f.description}</p>
          </button>
        );
      })}
    </div>
  );
}
