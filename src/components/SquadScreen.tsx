'use client';

/**
 * Kickoff Clash — SquadScreen: the ONE squad screen.
 *
 * Serves both phases of the run — `mode="draft"` is the run-start "Name Your
 * Squad" (after the packs; picks the manager too) and `mode="talk"` is the
 * between-ties Team Talk (fitness carries forward; the carried XI is seeded and
 * auto-filled). One component, one pitch, one bench, one reserves strip — the
 * old TeamSelect/TeamTalk duplication is gone.
 *
 * Interaction model (mirrors the in-match pitch):
 *   • DRAG is primary — lift any player chip (pitch, bench, reserves) and drop
 *     it on a pitch slot, a bench seat, or back onto the reserves strip. Swaps
 *     displace sensibly: a slot's occupant takes the vacated seat, a displaced
 *     reserve-drop occupant returns to the bench if there's room, else to the
 *     reserves. Ineligible drops land and show the misfit state — never blocked.
 *   • TAP is the fallback/accessibility path — a filled slot opens the assign
 *     sheet (swap/clear), a bench/reserve tile opens the full card, an empty
 *     slot/seat opens the picker sheet.
 *
 * The Scout Report replaces the always-free dossier: FREE tier = opponent name,
 * style, strength; the estimated lineup unlocks for SCOUT_COST (owner-driven via
 * onUnlockScout — GameShell owns the cash/state write).
 *
 * Emits a neutral SquadScreenResult; GameShell adapts it to the two existing
 * data contracts (TeamSelection for createRun, the lineup-levers update for the
 * team talk) so neither contract changes.
 */

import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Card, SlottedCard } from '../lib/scoring';
import type { Formation } from '../lib/formations';
import { getFormation, positionFitsSlot } from '../lib/formations';
import type { TeamIntent, OpponentBuild } from '../lib/run';
import type { JokerCard } from '../lib/jokers';
import { findConnections } from '../lib/chemistry';
import { SCOUT_COST } from '../lib/economy';
import {
  type XISelection,
  emptySelection,
  startersFilled,
  autoFill,
  autoFillXI,
  effectiveStrength,
  BENCH_SIZE,
} from '../lib/team-select';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import SquadGallery from './SquadGallery';
import { PIXEL, RARITY_COLOR, lastName } from './cards/cardTokens';
import { PosTag, FitnessBar, BenchTile, BenchCover, LineupSlot, fitnessOf } from './lineup';

// ---------------------------------------------------------------------------
// Props & result
// ---------------------------------------------------------------------------

export interface SquadScreenResult {
  startingXI: number[];
  benchIds: number[];
  formationId: string;
  intent: TeamIntent;
  managerId: string | null; // draft mode only; null in talk mode
}

interface SquadScreenProps {
  mode: 'draft' | 'talk';
  /** The full squad: draft = the pack rip, talk = the run deck. */
  pool: Card[];
  formations: Formation[];
  initialFormationId: string;
  initialIntent: TeamIntent;
  /** Carried lineup (talk) — missing ids are dropped, gaps auto-filled. */
  initialSelection?: { startingXI: number[]; benchIds: number[] };
  /** Manager picker (draft only). */
  managers?: JokerCard[];
  initialManagerId?: string | null;
  /** Header context line (talk), e.g. "CUP 2 · TIE 1/3". */
  contextLabel?: string;
  /** Next opponent — the deterministic engine build behind the Scout Report. */
  opponent: OpponentBuild;
  cash: number;
  scoutUnlocked: boolean;
  onUnlockScout?: () => void;
  onConfirm: (result: SquadScreenResult) => void;
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

// ---------------------------------------------------------------------------
// Drag model
// ---------------------------------------------------------------------------

type DragSrc = { from: 'slot' | 'bench' | 'reserve'; index: number; id: number };
type DropTarget = { kind: 'slot'; index: number } | { kind: 'bench'; index: number } | { kind: 'reserves' };

/**
 * Pure lineup move: place `cardId` at `target`, displacing any occupant
 * sensibly (occupant takes the vacated seat on a swap; a reserve-drop occupant
 * returns to the bench if there's room, else to the reserves). Eligibility is
 * never checked here — a misfit placement renders red, it doesn't block.
 */
export function moveCard(
  prev: XISelection,
  cardId: number,
  target: DropTarget,
  benchSize: number = BENCH_SIZE,
): XISelection {
  const sIdx = prev.starters.indexOf(cardId);
  const bIdx = prev.bench.indexOf(cardId);
  const src: 'slot' | 'bench' | 'reserve' = sIdx >= 0 ? 'slot' : bIdx >= 0 ? 'bench' : 'reserve';

  if (target.kind === 'reserves') {
    if (src === 'slot') {
      const starters = [...prev.starters];
      starters[sIdx] = null;
      return { ...prev, starters };
    }
    if (src === 'bench') return { ...prev, bench: prev.bench.filter((id) => id !== cardId) };
    return prev;
  }

  if (target.kind === 'slot') {
    const occ = prev.starters[target.index];
    if (occ === cardId) return prev;
    const starters = [...prev.starters];
    let bench = [...prev.bench];
    starters[target.index] = cardId;
    if (src === 'slot') {
      starters[sIdx] = occ ?? null; // pitch↔pitch swap (or vacate)
    } else if (src === 'bench') {
      bench = bench.filter((id) => id !== cardId);
      if (occ != null) bench.splice(Math.min(bIdx, bench.length), 0, occ); // occupant takes the bench seat
    } else if (occ != null) {
      if (bench.length < benchSize) bench.push(occ); // reserve→pitch: occupant to bench if room
      // else the occupant returns to the reserves
    }
    return { starters, bench };
  }

  // target.kind === 'bench'
  const occ = prev.bench[target.index]; // undefined = empty seat
  if (occ === cardId) return prev;
  if (src === 'bench') {
    const bench = [...prev.bench];
    if (occ == null) {
      const packed = bench.filter((id) => id !== cardId);
      packed.push(cardId);
      return { ...prev, bench: packed };
    }
    bench[target.index] = cardId;
    bench[bIdx] = occ;
    return { ...prev, bench };
  }
  if (src === 'slot') {
    const starters = [...prev.starters];
    let bench = [...prev.bench];
    starters[sIdx] = null;
    if (occ != null) {
      starters[sIdx] = occ; // bench occupant takes the vacated pitch slot
      bench = bench.map((id) => (id === occ ? cardId : id));
    } else if (bench.length < benchSize) {
      bench.splice(Math.min(target.index, bench.length), 0, cardId);
    } else {
      return prev;
    }
    return { starters, bench };
  }
  // reserve → bench
  let bench = [...prev.bench];
  if (occ != null) {
    bench = bench.map((id) => (id === occ ? cardId : id)); // occupant returns to reserves
  } else if (bench.length < benchSize) {
    bench.push(cardId);
  } else {
    return prev;
  }
  return { ...prev, bench };
}

// Seed the selection from a carried-forward lineup, dropping any card no longer
// in the deck (shattered/sold), then auto-fill gaps so the default XI is always
// confirmable. Draft mode starts empty.
function seedSelection(
  pool: Card[],
  formation: Formation,
  initial?: { startingXI: number[]; benchIds: number[] },
): XISelection {
  if (!initial) return emptySelection(formation);
  const inDeck = new Set(pool.map((c) => c.id));
  const starters = formation.slots.map((_, i) => {
    const id = initial.startingXI?.[i];
    return id != null && inDeck.has(id) ? id : null;
  });
  const used = new Set(starters.filter((x): x is number => x != null));
  const bench = (initial.benchIds ?? []).filter((id) => inDeck.has(id) && !used.has(id)).slice(0, BENCH_SIZE);
  return autoFill(pool, formation, { starters, bench }, 'empty');
}

// ---------------------------------------------------------------------------
// SquadScreen
// ---------------------------------------------------------------------------

export default function SquadScreen({
  mode,
  pool,
  formations,
  initialFormationId,
  initialIntent,
  initialSelection,
  managers,
  initialManagerId,
  contextLabel,
  opponent,
  cash,
  scoutUnlocked,
  onUnlockScout,
  onConfirm,
}: SquadScreenProps) {
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(initialFormationId);
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => seedSelection(pool, getFormation(initialFormationId), initialSelection));
  const [managerId, setManagerId] = useState<string | null>(
    initialManagerId && managers?.some((m) => m.id === initialManagerId) ? initialManagerId : null,
  );
  const [intent, setIntent] = useState<TeamIntent>(initialIntent);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [showScout, setShowScout] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [placedSlot, setPlacedSlot] = useState<number | null>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);

  // ── Drag state (tap = inspect/assign, drag = move; PitchMatchView pattern) ──
  const [drag, setDrag] = useState<DragSrc | null>(null);
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const pointerRef = useRef<{ src: DragSrc; startX: number; startY: number; moved: boolean } | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const reservesRef = useRef<HTMLDivElement | null>(null);

  const showFitness = mode === 'talk';

  const usedIds = useMemo(
    () => new Set<number>([...sel.starters.filter((x): x is number => x != null), ...sel.bench]),
    [sel],
  );
  // Every deck player not in the XI or on the bench — visible AND draggable.
  const reserves = useMemo(
    () => pool.filter((c) => !usedIds.has(c.id)).sort((a, b) => effectiveStrength(b) - effectiveStrength(a)),
    [pool, usedIds],
  );

  const filled = startersFilled(sel);
  const slotCount = formation.slots.length;
  const manager = managers?.find((m) => m.id === managerId) ?? null;
  const ready = filled === slotCount && (mode === 'draft' ? manager !== null : true);

  const xiCards = useMemo(
    () => sel.starters.filter((x): x is number => x != null).map((id) => byId.get(id)).filter((c): c is Card => !!c),
    [sel.starters, byId],
  );
  const benchCards = useMemo(
    () => sel.bench.map((id) => byId.get(id)).filter((c): c is Card => !!c),
    [sel.bench, byId],
  );
  const xiAvg = xiCards.length ? Math.round(xiCards.reduce((a, c) => a + c.power, 0) / xiCards.length) : 0;

  // Chemistry signal: live synergy connections in the current XI.
  const chemBonus = useMemo(() => {
    const slotted: SlottedCard[] = xiCards.map((card, i) => ({ card, slot: `slot_${i}` }));
    return findConnections(slotted).reduce((s, c) => s + (c.bonus || 0), 0);
  }, [xiCards]);

  // Squad status counts (chips only when nonzero; injuries/fitness only exist in talk).
  const injuredCount = xiCards.filter((c) => c.injured).length;
  const tiredCount = xiCards.filter((c) => !c.injured && fitnessOf(c) < 3).length;
  const misfitCount = useMemo(
    () =>
      sel.starters.reduce<number>((n, id, i) => {
        const c = id != null ? byId.get(id) : undefined;
        return c && !positionFitsSlot(c.position, formation.slots[i]) ? n + 1 : n;
      }, 0),
    [sel.starters, byId, formation],
  );

  // ── Lineup operations ────────────────────────────────────────────────────
  function switchFormation(id: string) {
    const newF = getFormation(id);
    setFormationId(id);
    setSel((prev) => {
      const chosen = [...prev.starters.filter((x): x is number => x != null), ...prev.bench]
        .map((cid) => byId.get(cid))
        .filter((c): c is Card => !!c);
      if (chosen.length === 0) return emptySelection(newF);
      const { xi, bench } = autoFillXI(chosen, newF, true);
      return {
        starters: newF.slots.map((_, i) => xi[i]?.id ?? null),
        bench: bench.slice(0, BENCH_SIZE).map((c) => c.id),
      };
    });
    setOverlay(null);
  }

  // Fitness-aware auto: rest tired/injured, pick the freshest strong XI. At the
  // draft everyone is fresh, so this is the plain best-XI pick.
  function autoPick() {
    const { xi, bench } = autoFillXI(pool, formation, true);
    setSel({
      starters: formation.slots.map((_, i) => xi[i]?.id ?? null),
      bench: bench.slice(0, BENCH_SIZE).map((c) => c.id),
    });
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
    if (overlay?.kind === 'slot') flashSlot(overlay.index);
    setOverlay(null);
  }

  function flashSlot(idx: number) {
    setPlacedSlot(idx);
    setTimeout(() => setPlacedSlot((cur) => (cur === idx ? null : cur)), 280);
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
      startingXI: sel.starters.filter((x): x is number => x != null),
      benchIds: sel.bench,
      formationId,
      intent,
      managerId,
    });
  }

  // ── Drag plumbing ────────────────────────────────────────────────────────
  function setTarget(t: DropTarget | null) {
    dropRef.current = t;
    setDropTarget(t);
  }

  function findDropTarget(cx: number, cy: number, src: DragSrc): DropTarget | null {
    const pr = pitchRef.current?.getBoundingClientRect();
    if (pr && cx >= pr.left && cx <= pr.right && cy >= pr.top - 8 && cy <= pr.bottom + 8) {
      let best = -1;
      let bestD = 48;
      formation.slots.forEach((s, i) => {
        const sx = pr.left + (s.x / 100) * pr.width;
        const sy = pr.top + (s.y / 100) * pr.height;
        const d = Math.hypot(cx - sx, cy - sy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0 && !(src.from === 'slot' && src.index === best)) return { kind: 'slot', index: best };
      return null;
    }
    const br = benchRef.current?.getBoundingClientRect();
    if (br && cx >= br.left && cx <= br.right && cy >= br.top - 6 && cy <= br.bottom + 6) {
      const index = Math.max(0, Math.min(BENCH_SIZE - 1, Math.floor(((cx - br.left) / br.width) * BENCH_SIZE)));
      if (src.from === 'bench' && src.index === index) return null;
      return { kind: 'bench', index };
    }
    const rr = reservesRef.current?.getBoundingClientRect();
    if (rr && src.from !== 'reserve' && cx >= rr.left && cx <= rr.right && cy >= rr.top - 6 && cy <= rr.bottom + 6) {
      return { kind: 'reserves' };
    }
    return null;
  }

  function beginPointer(src: DragSrc, e: ReactPointerEvent) {
    pointerRef.current = { src, startX: e.clientX, startY: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function movePointer(e: ReactPointerEvent) {
    const p = pointerRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.moved) {
      // Reserve tiles keep pan-x for strip scrolling, so their drag must start
      // with a dominant vertical pull; everything else lifts after 8px any way.
      const lift = p.src.from === 'reserve' ? Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) : Math.hypot(dx, dy) > 8;
      if (lift) {
        p.moved = true;
        setDrag(p.src);
      }
    }
    if (!p.moved) return;
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (rootRect) setDragXY({ x: e.clientX - rootRect.left, y: e.clientY - rootRect.top });
    setTarget(findDropTarget(e.clientX, e.clientY, p.src));
  }

  function endPointer(e: ReactPointerEvent) {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p) return;
    if (!p.moved) {
      // Tap — the fallback path: a filled slot opens the assign sheet; a bench
      // or reserve tile opens the full card.
      if (p.src.from === 'slot') {
        setOverlay({ kind: 'slot', index: p.src.index });
      } else {
        const c = byId.get(p.src.id);
        if (c) setModal({ variant: 'player', card: c });
      }
    } else {
      const target = dropRef.current;
      if (target) {
        setSel((prev) => moveCard(prev, p.src.id, target));
        if (target.kind === 'slot') flashSlot(target.index);
      }
    }
    setDrag(null);
    setDragXY(null);
    setTarget(null);
    e.stopPropagation();
  }

  function cancelPointer() {
    pointerRef.current = null;
    setDrag(null);
    setDragXY(null);
    setTarget(null);
  }

  const dragCard = drag ? byId.get(drag.id) ?? null : null;
  const activeSlot = overlay?.kind === 'slot' ? formation.slots[overlay.index] : null;

  return (
    <div
      ref={rootRef}
      className={`flex flex-col overflow-hidden relative ${mode === 'talk' ? 'phase-setup' : 'kc-app-bg'}`}
      style={{
        height: '100dvh',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
      onPointerMove={drag ? movePointer : undefined}
      onPointerUp={drag ? endPointer : undefined}
      onPointerCancel={drag ? cancelPointer : undefined}
    >
      {/* ── Header: title · context · AVG · CHEM · KICK OFF ─────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 px-3">
        <div className="flex flex-col mr-auto min-w-0">
          <span
            className="uppercase truncate"
            style={{ fontFamily: PIXEL, fontSize: 12.5, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
          >
            {mode === 'draft' ? 'Name Your Squad' : 'Team Talk'}
          </span>
          <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
            {mode === 'talk' && contextLabel ? contextLabel : `XI ${filled}/${slotCount} · BENCH ${sel.bench.length}/${BENCH_SIZE}`}
          </span>
        </div>

        <StatBadge value={xiAvg || '--'} label="AVG" />
        <StatBadge value={`+${chemBonus}`} label="CHEM" accent="var(--gold)" />

        <button
          onClick={confirm}
          disabled={!ready}
          className={`active:scale-95 shrink-0 relative overflow-hidden ${ready ? 'sheen-strong glow-edge' : 'glass-surface sheen'}`}
          style={{
            fontFamily: PIXEL,
            fontSize: 12.5,
            letterSpacing: 0.5,
            color: ready ? 'var(--line-white)' : 'var(--ink)',
            height: 42,
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: ready ? '2px solid var(--ink-black)' : undefined,
            background: ready ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : undefined,
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

      {/* ── Scout Report entry — opponent name/style/strength free ────────── */}
      <div className="shrink-0 px-3 mt-1.5 flex items-stretch gap-1.5">
        <button
          onClick={() => setShowScout(true)}
          className="glass-surface sheen flex flex-col justify-center px-2.5 flex-1 min-w-0 active:scale-[0.98] relative overflow-hidden text-left"
          style={{
            height: 44,
            borderRadius: 'var(--radius-sm)',
            border: scoutUnlocked ? '1px solid var(--gold)' : undefined,
            boxShadow: scoutUnlocked
              ? 'inset 0 1px 0 0 var(--glass-highlight), 0 0 10px var(--gold-glow), var(--depth-1)'
              : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
          }}
        >
          <span className="flex items-center gap-1.5 relative" style={{ zIndex: 2 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: scoutUnlocked ? 'var(--gold)' : 'var(--dust)' }}>
              SCOUT REPORT
            </span>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.5, color: 'var(--dust)', marginLeft: 'auto' }}>
              PWR {Math.round(opponent.baseStrength)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 relative min-w-0" style={{ zIndex: 2, marginTop: 2 }}>
            <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 11.5, color: 'var(--cream)' }}>{opponent.name}</span>
            <span className="shrink-0" style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.5, color: 'var(--kit-blue)', marginLeft: 'auto' }}>
              {opponent.style.toUpperCase()}
            </span>
          </span>
        </button>

        {mode === 'talk' && (
          <button
            onClick={() => setShowGallery(true)}
            className="active:scale-95 glass-surface sheen shrink-0 relative overflow-hidden"
            style={{
              height: 44,
              padding: '0 11px',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
              fontFamily: PIXEL,
              fontSize: 9,
              letterSpacing: 0.5,
              color: 'var(--cream)',
            }}
          >
            <span className="relative" style={{ zIndex: 2 }}>SQUAD</span>
          </button>
        )}
      </div>

      {/* ── Control bar: shape · intent · manager (draft) ─────────────────── */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-3 mt-1.5" style={{ height: 40 }}>
        <button
          onClick={() => setOverlay({ kind: 'formation' })}
          className="glass-surface sheen flex flex-col items-start justify-center px-2.5 active:scale-95 relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
            minWidth: 62,
          }}
        >
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: 'var(--dust)', zIndex: 2 }}>SHAPE</span>
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1.1, color: 'var(--cream)', zIndex: 2 }}>{formation.name}</span>
        </button>

        <div
          className="glass-surface flex relative overflow-hidden"
          style={{ borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
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
                  boxShadow: on ? 'inset 0 1px 0 0 rgba(242,246,239,0.35)' : undefined,
                  transition: 'background 0.15s ease',
                  zIndex: 2,
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>

        {mode === 'draft' ? (
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
                {manager ? 'MANAGER' : 'PICK MANAGER'}
              </span>
              <span className="truncate" style={{ fontSize: 11, fontWeight: 700, color: manager ? 'var(--cream)' : 'var(--dust)', maxWidth: 86 }}>
                {manager ? manager.name : 'Tap to choose'}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* ── Squad status chips (only when something needs attention) ──────── */}
      {(injuredCount > 0 || tiredCount > 0 || misfitCount > 0) && (
        <div className="shrink-0 px-3 mt-1 flex items-center gap-1.5">
          {injuredCount > 0 && <StatusChip label={`${injuredCount} INJ`} color="var(--danger)" />}
          {tiredCount > 0 && <StatusChip label={`${tiredCount} TIRED`} color="var(--gold)" />}
          {misfitCount > 0 && <StatusChip label={`${misfitCount} MISFIT`} color="var(--gold)" />}
        </div>
      )}

      {/* ── Pitch ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-3 mt-1.5">
        <div
          ref={pitchRef}
          data-kc="pitch"
          className="relative w-full h-full overflow-hidden"
          style={{
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 3px 0 0 var(--ink-black), inset 0 0 60px rgba(0,0,0,0.35)',
            background:
              'repeating-linear-gradient(180deg, var(--pitch-bright) 0px, var(--pitch-bright) 9%, var(--pitch-stripe) 9%, var(--pitch-stripe) 18%)',
          }}
        >
          <PitchMarkings />
          {formation.slots.map((slot, i) => {
            const cardId = sel.starters[i];
            const card = cardId != null ? byId.get(cardId) : undefined;
            const misfit = !!card && !positionFitsSlot(card.position, slot);
            return (
              <LineupSlot
                key={i}
                slot={slot}
                card={card}
                misfit={misfit}
                showMisfit
                showFitness={showFitness}
                justPlaced={placedSlot === i}
                dim={drag?.from === 'slot' && drag.index === i}
                dropHint={dropTarget?.kind === 'slot' && dropTarget.index === i}
                onClick={card ? undefined : () => setOverlay({ kind: 'slot', index: i })}
                onPointerDown={card ? (e) => beginPointer({ from: 'slot', index: i, id: card.id }, e) : undefined}
                onPointerMove={card && !drag ? movePointer : undefined}
                onPointerUp={card && !drag ? endPointer : undefined}
                onPointerCancel={card ? cancelPointer : undefined}
                onInspect={card ? () => setModal({ variant: 'player', card }) : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* ── Bench ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 mt-1.5">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>
            SUBS {sel.bench.length}/{BENCH_SIZE}
          </span>
          <BenchCover benchCards={benchCards} />
          <div className="flex items-center gap-1 ml-auto">
            <ActionBtn label="AUTO" accent="var(--gold)" onClick={autoPick} />
            {mode === 'draft' ? (
              <>
                <ActionBtn
                  label="FILL"
                  accent="var(--cream-soft)"
                  onClick={() => setSel((prev) => autoFill(pool, formation, prev, 'empty'))}
                />
                <ActionBtn label="CLEAR" accent="var(--dust)" onClick={() => setSel(emptySelection(formation))} />
              </>
            ) : (
              <ActionBtn
                label="RESET"
                accent="var(--dust)"
                onClick={() => setSel(seedSelection(pool, formation, initialSelection))}
              />
            )}
          </div>
        </div>
        <div ref={benchRef} data-kc="bench" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${BENCH_SIZE}, minmax(0, 1fr))` }}>
          {Array.from({ length: BENCH_SIZE }).map((_, i) => {
            const cardId = sel.bench[i];
            const card = cardId != null ? byId.get(cardId) : undefined;
            const hint = dropTarget?.kind === 'bench' && dropTarget.index === i;
            return card ? (
              <BenchTile
                key={i}
                card={card}
                onRemove={() => removeBench(card.id)}
                dim={drag?.from === 'bench' && drag.id === card.id}
                dropHint={hint}
                onPointerDown={(e) => beginPointer({ from: 'bench', index: i, id: card.id }, e)}
                onPointerMove={!drag ? movePointer : undefined}
                onPointerUp={!drag ? endPointer : undefined}
                onPointerCancel={cancelPointer}
              />
            ) : (
              <button
                key={i}
                onClick={() => setOverlay({ kind: 'bench' })}
                className="relative flex items-center justify-center active:scale-95"
                style={{
                  height: 62,
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0,0,0,0.28)',
                  border: hint ? '2px dashed var(--gold)' : '2px dashed var(--border)',
                  boxShadow: hint ? '0 0 0 2px var(--gold-glow)' : undefined,
                  transition: 'transform 0.12s ease',
                  minWidth: 0,
                }}
              >
                <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--ink)' }}>+</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Reserves — every deck player not named; drag onto pitch/bench ──── */}
      <div className="shrink-0 px-3 mt-1.5">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>
            RESERVES {reserves.length}
          </span>
        </div>
        <div
          ref={reservesRef}
          data-kc="reserves"
          className="flex gap-1 overflow-x-auto"
          style={{
            overscrollBehavior: 'contain',
            minHeight: 66,
            padding: 2,
            borderRadius: 'var(--radius-sm)',
            border: dropTarget?.kind === 'reserves' ? '1px solid var(--gold)' : '1px solid transparent',
            boxShadow: dropTarget?.kind === 'reserves' ? '0 0 0 2px var(--gold-glow)' : undefined,
            transition: 'box-shadow 0.12s ease',
          }}
        >
          {reserves.map((c) => (
            <div key={c.id} style={{ width: 64, flexShrink: 0 }}>
              <BenchTile
                card={c}
                touchAction="pan-x"
                dim={drag?.from === 'reserve' && drag.id === c.id}
                onPointerDown={(e) => beginPointer({ from: 'reserve', index: -1, id: c.id }, e)}
                onPointerMove={!drag ? movePointer : undefined}
                onPointerUp={!drag ? endPointer : undefined}
                onPointerCancel={cancelPointer}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Drag ghost — a lifted solid mini tile following the finger ─────── */}
      {drag && dragXY && dragCard && (
        <div
          style={{
            position: 'absolute',
            left: dragXY.x,
            top: dragXY.y,
            transform: 'translate(-50%, -70%)',
            zIndex: 60,
            pointerEvents: 'none',
          }}
        >
          <GhostTile card={dragCard} />
        </div>
      )}

      {/* ── Picker sheets (slot / bench / manager / formation) ─────────────── */}
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
                overlay.kind === 'manager' ? 'var(--kit-red)' : overlay.kind === 'formation' ? 'var(--kit-blue)' : 'var(--gold)'
              }`,
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)',
              maxHeight: '64%',
              paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0 relative" style={{ zIndex: 2 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
            </div>

            <div className="flex items-center justify-between px-3 pb-2 shrink-0 relative" style={{ zIndex: 2 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5, color: 'var(--cream)' }}>
                {overlay.kind === 'manager'
                  ? 'PICK MANAGER'
                  : overlay.kind === 'formation'
                    ? 'PICK SHAPE'
                    : overlay.kind === 'bench'
                      ? 'ADD TO BENCH'
                      : `FILL ${(activeSlot?.label ?? '').toUpperCase()}`}
              </span>
              <div className="flex items-center gap-1.5">
                {overlay.kind === 'slot' && sel.starters[overlay.index] != null && (
                  <button
                    onClick={() => {
                      clearSlot(overlay.index);
                      setOverlay(null);
                    }}
                    className="glass-surface active:scale-90 relative overflow-hidden"
                    style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--danger)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
                  >
                    CLEAR
                  </button>
                )}
                <button
                  onClick={() => setOverlay(null)}
                  className="glass-surface active:scale-90 relative overflow-hidden"
                  style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
                >
                  CLOSE
                </button>
              </div>
            </div>

            {overlay.kind === 'manager' && managers ? (
              <ManagerSheet
                managers={managers}
                managerId={managerId}
                onPick={(id) => {
                  setManagerId(id);
                  setOverlay(null);
                }}
                onInspect={(m) => setModal({ variant: 'manager', manager: m })}
              />
            ) : overlay.kind === 'formation' ? (
              <FormationSheet formations={formations} current={formationId} onPick={switchFormation} />
            ) : (
              <PlayerSheet
                available={reserves}
                activeSlot={activeSlot}
                showFitness={showFitness}
                onPick={placeInOverlay}
                onInspect={(c) => setModal({ variant: 'player', card: c })}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Scout Report overlay ────────────────────────────────────────────── */}
      {showScout && (
        <ScoutSheet
          opp={opponent}
          cash={cash}
          unlocked={scoutUnlocked}
          onUnlock={onUnlockScout}
          onClose={() => setShowScout(false)}
        />
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />

      {showGallery && <SquadGallery deck={pool} onClose={() => setShowGallery(false)} title="YOUR SQUAD" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PitchMarkings — SVG keeps lines crisp & GPU-cheap.
// ---------------------------------------------------------------------------

function PitchMarkings() {
  const line = 'rgba(242,246,239,0.5)';
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 150" preserveAspectRatio="none">
      <rect x="3" y="3" width="94" height="144" fill="none" stroke={line} strokeWidth="0.6" />
      <line x1="3" y1="75" x2="97" y2="75" stroke={line} strokeWidth="0.6" />
      <circle cx="50" cy="75" r="11" fill="none" stroke={line} strokeWidth="0.6" />
      <circle cx="50" cy="75" r="1" fill={line} />
      <rect x="26" y="3" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
      <rect x="38" y="3" width="24" height="8" fill="none" stroke={line} strokeWidth="0.6" />
      <path d="M 40 23 A 11 11 0 0 0 60 23" fill="none" stroke={line} strokeWidth="0.6" />
      <rect x="26" y="127" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
      <rect x="38" y="139" width="24" height="8" fill="none" stroke={line} strokeWidth="0.6" />
      <path d="M 40 127 A 11 11 0 0 1 60 127" fill="none" stroke={line} strokeWidth="0.6" />
      <rect x="43" y="1.4" width="14" height="1.6" fill="none" stroke={line} strokeWidth="0.6" />
      <rect x="43" y="147" width="14" height="1.6" fill="none" stroke={line} strokeWidth="0.6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GhostTile — the drag ghost. SOLID surface (no backdrop blur — it moves every
// frame), pixel content, gold lift ring on the frame.
// ---------------------------------------------------------------------------

function GhostTile({ card }: { card: Card }) {
  const accent = RARITY_COLOR[card.rarity] ?? 'var(--dust)';
  return (
    <div
      style={{
        width: 64,
        borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--ink-black)',
        background: 'linear-gradient(165deg, var(--surface-raised), var(--surface))',
        boxShadow: '0 0 0 2px var(--gold), 0 8px 16px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div style={{ height: 3, background: accent }} />
      <div style={{ padding: '4px 5px 5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
          <PosTag position={card.position} />
          <span style={{ fontFamily: PIXEL, fontSize: 12, lineHeight: 1, color: 'var(--cream)' }}>{Math.round(card.power)}</span>
        </div>
        <div
          style={{
            fontSize: 8.5,
            fontWeight: 800,
            color: 'var(--cream)',
            marginTop: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lastName(card.name)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatBadge / StatusChip / ActionBtn — compact glass readouts & buttons.
// ---------------------------------------------------------------------------

function StatBadge({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  // Long values (e.g. a four-digit chemistry sum) step down so they never clip.
  const len = String(value).length;
  const fs = len > 4 ? 9 : len > 3 ? 11 : 14;
  return (
    <div
      className="glass-surface flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
      style={{ width: 44, height: 42, borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: fs, lineHeight: 1, color: accent ?? 'var(--cream)' }}>{value}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="glass-surface relative overflow-hidden"
      style={{
        fontFamily: PIXEL,
        fontSize: 8,
        letterSpacing: 0.5,
        color,
        padding: '4px 7px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color}`,
        boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 8px ${color}33, var(--depth-1)`,
      }}
    >
      {label}
    </span>
  );
}

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
// ScoutSheet — FREE tier: opponent name, style, strength. The estimated lineup
// unlocks for SCOUT_COST (deducted by the owner via onUnlock).
// ---------------------------------------------------------------------------

function ScoutSheet({
  opp,
  cash,
  unlocked,
  onUnlock,
  onClose,
}: {
  opp: OpponentBuild;
  cash: number;
  unlocked: boolean;
  onUnlock?: () => void;
  onClose: () => void;
}) {
  const canUnlock = !!onUnlock && cash >= SCOUT_COST;
  return (
    <div
      className="absolute inset-0 flex flex-col justify-end scrim-fade"
      style={{ background: 'rgba(2,9,5,0.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 45 }}
      onClick={onClose}
    >
      <div
        className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
        style={{
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          borderTop: '3px solid var(--kit-blue)',
          boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)',
          maxHeight: '70%',
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0 relative" style={{ zIndex: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-2 shrink-0 relative gap-2" style={{ zIndex: 2 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5, color: 'var(--cream)' }}>SCOUT REPORT</span>
          <div className="flex items-center gap-1.5">
            <span
              className="glass-surface relative overflow-hidden"
              style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--gold)', padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}
            >
              CASH £{cash.toLocaleString()}
            </span>
            <button
              onClick={onClose}
              className="glass-surface active:scale-90 relative overflow-hidden"
              style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              CLOSE
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-3 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
          {/* FREE tier — name / style / strength */}
          <div
            className="glass-surface relative overflow-hidden"
            style={{ borderRadius: 'var(--radius-sm)', padding: '8px 10px', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
          >
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>OPPONENT</span>
            <p className="truncate" style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', margin: '3px 0 0' }}>{opp.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <div
              className="glass-surface relative overflow-hidden"
              style={{ borderRadius: 'var(--radius-sm)', padding: '7px 9px', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
            >
              <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>STYLE</span>
              <p className="truncate" style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--kit-blue)', margin: '3px 0 0' }}>
                {opp.style.toUpperCase()}
              </p>
            </div>
            <div
              className="glass-surface relative overflow-hidden"
              style={{ borderRadius: 'var(--radius-sm)', padding: '7px 9px', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
            >
              <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>STRENGTH</span>
              <p style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)', margin: '3px 0 0' }}>
                PWR {Math.round(opp.baseStrength)}
              </p>
            </div>
          </div>

          {/* PAID tier — the estimated lineup */}
          <div className="flex items-center gap-2 mt-2.5 mb-1">
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>ESTIMATED LINEUP</span>
            {unlocked ? (
              <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--gold)' }}>{opp.formation}</span>
            ) : (
              <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--dust)' }}>LOCKED</span>
            )}
          </div>

          {unlocked ? (
            <div className="grid grid-cols-2 gap-1">
              {opp.xi.map((p, i) => (
                <div
                  key={i}
                  className="glass-surface flex items-center gap-1.5 relative overflow-hidden"
                  style={{ borderRadius: 'var(--radius-sm)', padding: '5px 7px', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
                >
                  <PosTag position={p.position} />
                  <span className="truncate" style={{ fontSize: 9.5, color: 'var(--cream-soft)', flex: 1, minWidth: 0 }}>{lastName(p.name)}</span>
                  <span style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)' }}>{Math.round(p.power)}</span>
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={canUnlock ? onUnlock : undefined}
              disabled={!canUnlock}
              className={`w-full active:scale-[0.98] relative overflow-hidden ${canUnlock ? 'sheen-strong glow-edge' : 'glass-surface sheen'}`}
              style={{
                fontFamily: PIXEL,
                fontSize: 11,
                letterSpacing: 0.5,
                color: canUnlock ? 'var(--line-white)' : 'var(--ink)',
                height: 44,
                borderRadius: 'var(--radius-sm)',
                border: canUnlock ? '2px solid var(--ink-black)' : undefined,
                background: canUnlock ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : undefined,
                boxShadow: canUnlock
                  ? 'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)'
                  : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
                transition: 'transform 0.12s ease',
                cursor: canUnlock ? 'pointer' : 'default',
                ...(canUnlock ? { ['--glow' as string]: 'var(--amber-glow)' } : {}),
              }}
            >
              UNLOCK LINEUP · £{SCOUT_COST.toLocaleString()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlayerSheet — eligible-first grid; tap places, info pip inspects.
// ---------------------------------------------------------------------------

function PlayerSheet({
  available,
  activeSlot,
  showFitness,
  onPick,
  onInspect,
}: {
  available: Card[];
  activeSlot: Formation['slots'][number] | null;
  showFitness: boolean;
  onPick: (id: number) => void;
  onInspect: (c: Card) => void;
}) {
  const sorted = useMemo(() => {
    if (!activeSlot) return available;
    return [...available].sort((a, b) => {
      const ea = positionFitsSlot(a.position, activeSlot) ? 0 : 1;
      const eb = positionFitsSlot(b.position, activeSlot) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return effectiveStrength(b) - effectiveStrength(a);
    });
  }, [available, activeSlot]);

  return (
    <div className="grid grid-cols-3 gap-2 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {sorted.map((c) => {
        const eligible = !activeSlot || positionFitsSlot(c.position, activeSlot);
        return (
          <div key={c.id} className="relative" style={{ minWidth: 0 }}>
            <GameCard model={{ variant: 'player', card: c }} dimmed={!eligible} onClick={() => onPick(c.id)} ariaLabel={`Place ${c.name}`} />
            {showFitness && (
              <div className="absolute left-0 right-0" style={{ bottom: 0, padding: '0 2px 2px' }}>
                <FitnessBar card={c} />
              </div>
            )}
            <span
              role="button"
              aria-label={`Inspect ${c.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onInspect(c);
              }}
              className="absolute flex items-center justify-center active:scale-90"
              style={{
                // Hangs off the card corner so it never covers the rating
                // (top-right of the card face is the score).
                top: -5,
                right: -5,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--ink-black)',
                border: '1.5px solid var(--line-white)',
                color: 'var(--line-white)',
                fontFamily: PIXEL,
                fontSize: 8,
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
// ManagerSheet — gaffer GameCards (draft mode). Tap to pick; info pip inspects.
// ---------------------------------------------------------------------------

function ManagerSheet({
  managers,
  managerId,
  onPick,
  onInspect,
}: {
  managers: JokerCard[];
  managerId: string | null;
  onPick: (id: string) => void;
  onInspect: (m: JokerCard) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {managers.map((m) => {
        const on = managerId === m.id;
        return (
          <div key={m.id} className="relative" style={{ minWidth: 0 }}>
            <GameCard model={{ variant: 'manager', manager: m }} selected={on} onClick={() => onPick(m.id)} ariaLabel={`Pick ${m.name}`} />
            <span
              role="button"
              aria-label={`Inspect ${m.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onInspect(m);
              }}
              className="absolute flex items-center justify-center active:scale-90"
              style={{
                // Off the corner — matches PlayerSheet, keeps the card face clear.
                top: -5,
                right: -5,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--ink-black)',
                border: '1.5px solid var(--line-white)',
                color: 'var(--line-white)',
                fontFamily: PIXEL,
                fontSize: 8,
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
// FormationSheet
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
