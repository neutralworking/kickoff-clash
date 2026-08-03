'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '../lib/scoring';
import type { Formation } from '../lib/formations';
import { getFormation } from '../lib/formations';
import type { TeamIntent, OpponentBuild } from '../lib/run';
import type { JokerCard } from '../lib/jokers';
import { xiV6Totals, toDisplayV6Card, MAX_XI_COST } from '../lib/v6-bridge';
import { managerMaxStartingXiCost } from '../lib/manager-v1';
import {
  ACTIVE_DECK_SIZE,
  loadActiveDeckIds,
  saveActiveDeckIds,
} from '../lib/active-deck';
import { portraitSrc } from './cards/portrait';
import {
  type XISelection,
  type Competence,
  autoFill,
  autoFillXI,
  competenceOf,
  emptySelection,
  startersFilled,
  BENCH_SIZE,
} from '../lib/team-select';
import { PIXEL } from './cards/cardTokens';
import { LineupSlot, BenchTile, SLOT_INSET_X, SLOT_INSET_Y, lineupPitchY } from './lineup';
import CardModal from './cards/CardModal';
import type { GameCardModel } from './cards/GameCard';
import ManagerCard from './manager-cards/ManagerCard';
import DeckBuilderScreen from './deck-builder/DeckBuilderScreen';

export interface SquadScreenResult {
  startingXI: number[];
  benchIds: number[];
  formationId: string;
  intent: TeamIntent;
  managerId: string | null;
}

interface SquadScreenProps {
  mode: 'draft' | 'talk';
  pool: Card[];
  formations: Formation[];
  initialFormationId: string;
  initialIntent: TeamIntent;
  initialSelection?: { startingXI: number[]; benchIds: number[] };
  managers?: JokerCard[];
  initialManagerId?: string | null;
  contextLabel?: string;
  opponent: OpponentBuild;
  seed?: number;
  round?: number;
  opponentPower?: number;
  jokers?: JokerCard[];
  cash: number;
  scoutUnlocked: boolean;
  onUnlockScout?: () => void;
  onConfirm: (result: SquadScreenResult) => void;
  suspendedCards?: Card[];
}

type Overlay = 'manager' | 'formation' | 'opposition' | null;
type DragSrc = { from: 'slot' | 'bench'; index: number; id: number };
type DropTarget = { kind: 'slot'; index: number } | { kind: 'bench'; index: number };

function initialDeckIds(pool: Card[], initial?: { startingXI: number[]; benchIds: number[] }): number[] {
  const valid = new Set(pool.map((card) => card.id));
  const selected = [...new Set([...(initial?.startingXI ?? []), ...(initial?.benchIds ?? [])])]
    .filter((id) => valid.has(id))
    .slice(0, ACTIVE_DECK_SIZE);

  for (const card of pool) {
    if (selected.length >= ACTIVE_DECK_SIZE) break;
    if (!selected.includes(card.id)) selected.push(card.id);
  }

  return selected;
}

function selectionFromDeck(deck: Card[], formation: Formation): XISelection {
  const { xi, bench } = autoFillXI(deck, formation, true);
  return {
    starters: formation.slots.map((_, index) => xi[index]?.id ?? null),
    bench: bench.slice(0, BENCH_SIZE).map((card) => card.id),
  };
}

export function moveCard(prev: XISelection, cardId: number, target: DropTarget): XISelection {
  const slotIndex = prev.starters.indexOf(cardId);
  const benchIndex = prev.bench.indexOf(cardId);

  if (target.kind === 'slot') {
    const occupant = prev.starters[target.index];
    if (occupant === cardId) return prev;

    const starters = [...prev.starters];
    const bench = [...prev.bench];
    starters[target.index] = cardId;

    if (slotIndex >= 0) {
      starters[slotIndex] = occupant ?? null;
    } else if (benchIndex >= 0) {
      if (occupant == null) bench.splice(benchIndex, 1);
      else bench[benchIndex] = occupant;
    }

    return { starters, bench };
  }

  const occupant = prev.bench[target.index];
  if (occupant === cardId) return prev;

  const starters = [...prev.starters];
  const bench = [...prev.bench];

  if (slotIndex >= 0) {
    starters[slotIndex] = occupant ?? null;
    bench[target.index] = cardId;
  } else if (benchIndex >= 0) {
    bench[target.index] = cardId;
    bench[benchIndex] = occupant;
  }

  return { starters, bench };
}

export default function SquadScreen({
  mode,
  pool,
  formations,
  initialFormationId,
  initialIntent,
  initialSelection,
  managers,
  initialManagerId,
  opponent,
  jokers,
  onConfirm,
}: SquadScreenProps) {
  const initialDeck = useMemo(() => initialDeckIds(pool, initialSelection), [pool, initialSelection]);
  const byId = useMemo(() => new Map(pool.map((card) => [card.id, card])), [pool]);

  const [deckIds, setDeckIds] = useState<number[]>(initialDeck);
  const deckCards = useMemo(
    () => deckIds.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card)),
    [deckIds, byId],
  );

  const [formationId, setFormationId] = useState(initialFormationId);
  const formation = getFormation(formationId);
  const [selection, setSelection] = useState<XISelection>(() => {
    const deck = initialDeck.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card));
    return selectionFromDeck(deck, getFormation(initialFormationId));
  });
  const [managerId, setManagerId] = useState<string | null>(initialManagerId ?? null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [showDeckBuilder, setShowDeckBuilder] = useState(false);
  const [modal, setModal] = useState<GameCardModel | null>(null);

  useEffect(() => {
    if (mode === 'draft') return;

    const savedIds = loadActiveDeckIds(pool, initialDeck);
    const unchanged = savedIds.length === deckIds.length
      && savedIds.every((id, index) => id === deckIds[index]);
    if (unchanged) return;

    const savedCards = savedIds
      .map((id) => byId.get(id))
      .filter((card): card is Card => Boolean(card));
    setDeckIds(savedIds);
    setSelection(selectionFromDeck(savedCards, getFormation(formationId)));
  }, [mode, pool, initialDeck, deckIds, byId, formationId]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ src: DragSrc; startX: number; startY: number; moved: boolean } | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [drag, setDrag] = useState<DragSrc | null>(null);
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const draftManager = managers?.find((candidate) => candidate.id === managerId) ?? null;
  const manager = mode === 'draft' ? draftManager : jokers?.[0] ?? null;
  const maxXiCost = manager ? managerMaxStartingXiCost(manager) : MAX_XI_COST;
  const xiCards = selection.starters
    .filter((id): id is number => id != null)
    .map((id) => byId.get(id))
    .filter((card): card is Card => Boolean(card));
  const competenceByIndex = selection.starters.map((id, index): Competence => {
    const card = id != null ? byId.get(id) : undefined;
    return card ? competenceOf(card.position, formation.slots[index]) : 'primary';
  });
  const totals = xiV6Totals(xiCards, formation);
  const capOver = totals.cost > maxXiCost;
  const ready = startersFilled(selection) === formation.slots.length
    && selection.bench.length === BENCH_SIZE
    && !capOver
    && (mode !== 'draft' || manager != null);

  const v6Of = (card: Card) => ({ ...toDisplayV6Card(card), portrait: portraitSrc(card) ?? undefined });

  function switchFormation(nextId: string) {
    const next = getFormation(nextId);
    setFormationId(nextId);
    setSelection(selectionFromDeck(deckCards, next));
    setOverlay(null);
  }

  function saveDeck(nextIds: number[]) {
    const nextCards = nextIds
      .map((id) => byId.get(id))
      .filter((card): card is Card => Boolean(card));
    saveActiveDeckIds(nextIds);
    setDeckIds(nextIds);
    setSelection(selectionFromDeck(nextCards, formation));
    setShowDeckBuilder(false);
  }

  function autoPick() {
    setSelection(selectionFromDeck(deckCards, formation));
  }

  function fillEmpty() {
    setSelection((current) => autoFill(deckCards, formation, current, 'empty'));
  }

  function clearSelection() {
    setSelection(emptySelection(formation));
  }

  function confirm() {
    if (!ready) return;
    saveActiveDeckIds(deckIds);
    onConfirm({
      startingXI: selection.starters.filter((id): id is number => id != null),
      benchIds: selection.bench,
      formationId,
      intent: initialIntent,
      managerId: mode === 'draft' ? managerId : null,
    });
  }

  function setTarget(target: DropTarget | null) {
    dropRef.current = target;
    setDropTarget(target);
  }

  function findDropTarget(clientX: number, clientY: number, src: DragSrc): DropTarget | null {
    const pitch = pitchRef.current?.getBoundingClientRect();
    if (pitch && clientX >= pitch.left && clientX <= pitch.right && clientY >= pitch.top && clientY <= pitch.bottom) {
      let best = -1;
      let bestDistance = 48;
      formation.slots.forEach((slot, index) => {
        const x = pitch.left + SLOT_INSET_X + (slot.x / 100) * (pitch.width - SLOT_INSET_X * 2);
        const y = pitch.top + SLOT_INSET_Y + (lineupPitchY(slot.y) / 100) * (pitch.height - SLOT_INSET_Y * 2);
        const distance = Math.hypot(clientX - x, clientY - y);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      if (best >= 0 && !(src.from === 'slot' && src.index === best)) return { kind: 'slot', index: best };
    }

    const bench = benchRef.current?.getBoundingClientRect();
    if (bench && clientX >= bench.left && clientX <= bench.right && clientY >= bench.top && clientY <= bench.bottom) {
      const index = Math.max(0, Math.min(BENCH_SIZE - 1, Math.floor(((clientX - bench.left) / bench.width) * BENCH_SIZE)));
      if (!(src.from === 'bench' && src.index === index)) return { kind: 'bench', index };
    }

    return null;
  }

  function beginPointer(src: DragSrc, event: ReactPointerEvent) {
    pointerRef.current = { src, startX: event.clientX, startY: event.clientY, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function movePointer(event: ReactPointerEvent) {
    const pointer = pointerRef.current;
    if (!pointer) return;

    if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 8) {
      pointer.moved = true;
      setDrag(pointer.src);
    }
    if (!pointer.moved) return;

    const root = rootRef.current?.getBoundingClientRect();
    if (root) setDragXY({ x: event.clientX - root.left, y: event.clientY - root.top });
    setTarget(findDropTarget(event.clientX, event.clientY, pointer.src));
  }

  function endPointer(event: ReactPointerEvent) {
    const pointer = pointerRef.current;
    pointerRef.current = null;
    if (!pointer) return;

    if (pointer.moved && dropRef.current) {
      setSelection((current) => moveCard(current, pointer.src.id, dropRef.current as DropTarget));
    } else if (!pointer.moved) {
      const card = byId.get(pointer.src.id);
      if (card) setModal({ variant: 'player', card });
    }

    setDrag(null);
    setDragXY(null);
    setTarget(null);
    event.stopPropagation();
  }

  function cancelPointer() {
    pointerRef.current = null;
    setDrag(null);
    setDragXY(null);
    setTarget(null);
  }

  if (showDeckBuilder) {
    return (
      <DeckBuilderScreen
        collection={pool}
        initialDeckIds={deckIds}
        onCancel={() => setShowDeckBuilder(false)}
        onSave={saveDeck}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden ${mode === 'talk' ? 'phase-setup' : 'kc-app-bg'}`}
      style={{
        height: '100dvh',
        display: 'grid',
        gridTemplateRows: '28px 24px 38px minmax(0, 1fr) 22px auto 42px',
        gap: 4,
        paddingTop: 'max(env(safe-area-inset-top), 8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 6px)',
      }}
      onPointerMove={drag ? movePointer : undefined}
      onPointerUp={drag ? endPointer : undefined}
      onPointerCancel={drag ? cancelPointer : undefined}
    >
      <header className="flex items-center px-3">
        <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, letterSpacing: 0.6, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)' }}>
          TEAM SELECTION
        </h1>
      </header>

      <div className="px-3">
        <div
          className="flex h-full items-center justify-center"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(0,0,0,0.25)',
            fontFamily: PIXEL,
            fontSize: 8,
            letterSpacing: 0.35,
          }}
        >
          <span style={{ color: 'var(--dust)' }}>ATT&nbsp;</span><strong style={{ color: '#ff9a54', fontWeight: 400 }}>{totals.att}</strong>
          <span style={{ color: 'var(--border)', margin: '0 10px' }}>·</span>
          <span style={{ color: 'var(--dust)' }}>DEF&nbsp;</span><strong style={{ color: '#72c9f2', fontWeight: 400 }}>{totals.def}</strong>
          <span style={{ color: 'var(--border)', margin: '0 10px' }}>·</span>
          <span style={{ color: capOver ? 'var(--danger)' : 'var(--dust)' }}>BUDGET&nbsp;</span>
          <strong style={{ color: capOver ? 'var(--danger)' : 'var(--cream)', fontWeight: 400 }}>{totals.cost}/{maxXiCost}</strong>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3">
        <button
          type="button"
          onClick={() => mode === 'draft' && setOverlay('manager')}
          className="glass-surface sheen min-w-0 text-left px-2 active:scale-[0.98]"
          style={{ borderRadius: 'var(--radius-sm)', border: manager ? '1px solid var(--kit-red)' : undefined }}
        >
          <small style={{ display: 'block', fontFamily: PIXEL, fontSize: 5.5, letterSpacing: 0.7, color: 'var(--dust)' }}>MANAGER</small>
          <strong className="truncate" style={{ display: 'block', marginTop: 2, fontSize: 9.5, color: 'var(--cream)' }}>{manager?.name ?? 'PICK MANAGER'}</strong>
        </button>

        <button
          type="button"
          onClick={() => setOverlay('formation')}
          className="glass-surface sheen min-w-0 text-left px-2 active:scale-[0.98]"
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <small style={{ display: 'block', fontFamily: PIXEL, fontSize: 5.5, letterSpacing: 0.7, color: 'var(--dust)' }}>FORMATION</small>
          <strong className="truncate" style={{ display: 'block', marginTop: 2, fontSize: 9.5, color: 'var(--cream)' }}>{formation.name}</strong>
        </button>

        <button
          type="button"
          onClick={() => setOverlay('opposition')}
          className="glass-surface sheen min-w-0 text-left px-2 active:scale-[0.98]"
          style={{ borderRadius: 'var(--radius-sm)', border: '1px solid rgba(114,201,242,0.42)', background: 'rgba(57,128,162,0.15)' }}
        >
          <small style={{ display: 'block', fontFamily: PIXEL, fontSize: 5.5, letterSpacing: 0.7, color: 'var(--dust)' }}>OPPOSITION</small>
          <strong className="truncate" style={{ display: 'block', marginTop: 2, fontSize: 9.5, color: 'var(--cream)' }}>{opponent.name}</strong>
        </button>
      </div>

      <div className="min-h-0 px-3">
        <div
          ref={pitchRef}
          data-kc="pitch"
          className="relative h-full w-full overflow-hidden"
          style={{
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 3px 0 var(--ink-black), inset 0 0 60px rgba(0,0,0,0.35)',
            background: 'repeating-linear-gradient(180deg, var(--pitch-bright) 0, var(--pitch-bright) 9%, var(--pitch-stripe) 9%, var(--pitch-stripe) 18%)',
          }}
        >
          <PitchMarkings />
          {formation.slots.map((slot, index) => {
            const cardId = selection.starters[index];
            const card = cardId != null ? byId.get(cardId) : undefined;
            return (
              <LineupSlot
                key={`${formationId}-${index}`}
                slot={slot}
                card={card}
                v6card={card ? v6Of(card) : undefined}
                competence={competenceByIndex[index]}
                justPlaced={false}
                dim={drag?.from === 'slot' && drag.index === index}
                dropHint={dropTarget?.kind === 'slot' && dropTarget.index === index}
                onPointerDown={card ? (event) => beginPointer({ from: 'slot', index, id: card.id }, event) : undefined}
                onPointerMove={card && !drag ? movePointer : undefined}
                onPointerUp={card && !drag ? endPointer : undefined}
                onPointerCancel={card ? cancelPointer : undefined}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1 px-3">
        <strong style={{ marginRight: 'auto', fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.65, color: 'var(--gold)', fontWeight: 400 }}>
          SUBSTITUTES {selection.bench.length}/{BENCH_SIZE}
        </strong>
        <MiniAction label="AUTO" onClick={autoPick} accent="var(--gold)" />
        <MiniAction label="FILL" onClick={fillEmpty} accent="var(--cream-soft)" />
        <MiniAction label="CLEAR" onClick={clearSelection} accent="var(--dust)" />
      </div>

      <div ref={benchRef} data-kc="bench" className="grid grid-cols-7 gap-1 px-3">
        {Array.from({ length: BENCH_SIZE }).map((_, index) => {
          const cardId = selection.bench[index];
          const card = cardId != null ? byId.get(cardId) : undefined;
          return card ? (
            <BenchTile
              key={card.id}
              card={card}
              v6card={v6Of(card)}
              dim={drag?.from === 'bench' && drag.index === index}
              dropHint={dropTarget?.kind === 'bench' && dropTarget.index === index}
              onPointerDown={(event) => beginPointer({ from: 'bench', index, id: card.id }, event)}
              onPointerMove={!drag ? movePointer : undefined}
              onPointerUp={!drag ? endPointer : undefined}
              onPointerCancel={cancelPointer}
            />
          ) : (
            <div
              key={`empty-${index}`}
              style={{ aspectRatio: '4 / 5', border: '1px dashed var(--border)', borderRadius: 5, background: 'rgba(0,0,0,0.2)' }}
            />
          );
        })}
      </div>

      <footer className="relative z-20 flex gap-2 px-3" style={{ background: 'linear-gradient(180deg, transparent, rgba(2,7,3,0.72) 22%)' }}>
        <button
          type="button"
          onClick={() => setShowDeckBuilder(true)}
          className="glass-surface active:scale-95"
          style={{ flex: '0 0 92px', height: 39, borderRadius: 'var(--radius-sm)', fontFamily: PIXEL, fontSize: 9, color: 'var(--cream)' }}
        >
          EDIT DECK
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready}
          className={ready ? 'sheen-strong glow-edge active:scale-95' : 'glass-surface'}
          style={{
            flex: 1,
            height: 39,
            borderRadius: 'var(--radius-sm)',
            border: ready ? '2px solid var(--ink-black)' : '1px solid var(--border)',
            background: ready ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : 'rgba(0,0,0,0.25)',
            color: ready ? 'var(--line-white)' : capOver ? 'var(--danger)' : 'var(--dust)',
            fontFamily: PIXEL,
            fontSize: 11,
          }}
        >
          {capOver ? 'OVER BUDGET' : !manager && mode === 'draft' ? 'PICK MANAGER' : 'KICK OFF →'}
        </button>
      </footer>

      {drag && dragXY && (
        <div style={{ position: 'absolute', left: dragXY.x, top: dragXY.y, width: 58, transform: 'translate(-50%, -65%)', zIndex: 70, pointerEvents: 'none', opacity: 0.9 }}>
          <div style={{ width: '100%', aspectRatio: '2 / 3', borderRadius: 6, border: '2px solid var(--gold)', background: 'var(--surface-raised)', boxShadow: '0 8px 18px rgba(0,0,0,0.55)' }} />
        </div>
      )}

      {overlay && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ zIndex: 80, background: 'rgba(2,7,3,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOverlay(null)}
        >
          <div
            className="glass-raised"
            style={{ maxHeight: '72%', overflowY: 'auto', borderRadius: '14px 14px 0 0', borderTop: '2px solid var(--gold)', padding: '10px 12px max(env(safe-area-inset-bottom), 12px)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center">
              <strong style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream)' }}>
                {overlay === 'manager' ? 'PICK MANAGER' : overlay === 'formation' ? 'PICK FORMATION' : 'OPPOSITION'}
              </strong>
              <button type="button" onClick={() => setOverlay(null)} className="glass-surface ml-auto" style={{ padding: '5px 8px', borderRadius: 6, fontFamily: PIXEL, fontSize: 8, color: 'var(--cream)' }}>CLOSE</button>
            </div>

            {overlay === 'manager' && managers && (
              <div className="grid grid-cols-2 gap-2">
                {managers.map((candidate) => (
                  <ManagerCard
                    key={candidate.id}
                    manager={candidate}
                    selected={candidate.id === managerId}
                    onClick={() => {
                      setManagerId(candidate.id);
                      setOverlay(null);
                    }}
                  />
                ))}
              </div>
            )}

            {overlay === 'formation' && (
              <div className="grid grid-cols-2 gap-2">
                {formations.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.id}
                    onClick={() => switchFormation(candidate.id)}
                    className="glass-surface text-left active:scale-[0.98]"
                    style={{ padding: 10, borderRadius: 8, border: candidate.id === formationId ? '1px solid var(--kit-blue)' : undefined }}
                  >
                    <strong style={{ display: 'block', fontFamily: PIXEL, fontSize: 13, color: 'var(--cream)' }}>{candidate.name}</strong>
                    <small style={{ display: 'block', marginTop: 4, color: 'var(--dust)' }}>{candidate.description}</small>
                  </button>
                ))}
              </div>
            )}

            {overlay === 'opposition' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="glass-surface" style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8 }}>
                  <small style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>OPPONENT</small>
                  <strong style={{ display: 'block', marginTop: 4, fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)' }}>{opponent.name}</strong>
                </div>
                <div className="glass-surface" style={{ padding: 10, borderRadius: 8 }}>
                  <small style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>STYLE</small>
                  <strong style={{ display: 'block', marginTop: 4, fontFamily: PIXEL, fontSize: 10, color: 'var(--kit-blue)' }}>{opponent.style.toUpperCase()}</strong>
                </div>
                <div className="glass-surface" style={{ padding: 10, borderRadius: 8 }}>
                  <small style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)' }}>STRENGTH</small>
                  <strong style={{ display: 'block', marginTop: 4, fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)' }}>PWR {Math.round(opponent.baseStrength)}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}

function MiniAction({ label, onClick, accent }: { label: string; onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-surface active:scale-95"
      style={{ height: 20, padding: '0 7px', borderRadius: 5, fontFamily: PIXEL, fontSize: 7, color: accent }}
    >
      {label}
    </button>
  );
}

function PitchMarkings() {
  const line = 'rgba(242,246,239,0.5)';
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 150" preserveAspectRatio="none">
      <rect x="3" y="3" width="94" height="144" fill="none" stroke={line} strokeWidth="0.6" />
      <line x1="3" y1="75" x2="97" y2="75" stroke={line} strokeWidth="0.6" />
      <circle cx="50" cy="75" r="11" fill="none" stroke={line} strokeWidth="0.6" />
      <circle cx="50" cy="75" r="1" fill={line} />
      <rect x="26" y="3" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
      <rect x="26" y="127" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
    </svg>
  );
}
