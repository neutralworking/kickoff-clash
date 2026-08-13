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
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { cardNaturalPositions, cardPositionLabels, type Card } from '../lib/scoring';
import type { Formation } from '../lib/formations';
import { getFormation } from '../lib/formations';
import type { TeamIntent, OpponentBuild } from '../lib/run';
import { getOpponent } from '../lib/run';
import { xiV6Totals, toDisplayV6Card } from '../lib/v6-bridge';
import type { JokerCard } from '../lib/jokers';
import { managerActionNameV1, managerFormationsV1 } from '../lib/manager-v1';
import { SCOUT_COST } from '../lib/economy';
import {
  type XISelection,
  type Competence,
  emptySelection,
  startersFilled,
  autoFill,
  autoFillXI,
  effectiveStrength,
  competenceOf,
  BENCH_SIZE,
} from '../lib/team-select';
import { initMatch, evaluateSplit } from '../lib/match-v5';
import { contestPanel } from '../lib/contest-panel';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import SquadGallery from './SquadGallery';
import { PIXEL, RARITY_COLOR, POSITION_COLOR, lastName, playerActions } from './cards/cardTokens';
import { COMPETENCE_COLOR } from '../lib/team-select';
import { PosTag, FitnessBar, BenchTile, BenchCover, LineupSlot, fitnessOf, SLOT_INSET_X, SLOT_INSET_Y } from './lineup';
import { deriveStats } from '../lib/funnel';
import TeamSelectionPlayerCard from './player-cards/TeamSelectionPlayerCard';

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
  /** Match seed + cup round + the opponent's power dial for THIS fixture — feeds
   *  the live projected-contest preview (buildMatchSeed / cupMatchPower at the
   *  call site). Optional so a caller that doesn't need the preview can omit them
   *  (the preview is simply not computed). */
  seed?: number;
  round?: number;
  opponentPower?: number;
  /** The equipped manager (talk mode — draft mode uses its own live picker
   *  selection instead, see `managers`/`initialManagerId`). Feeds the preview. */
  jokers?: JokerCard[];
  cash: number;
  scoutUnlocked: boolean;
  onUnlockScout?: () => void;
  onConfirm: (result: SquadScreenResult) => void;
  /** Red-carded last match (SCORING_V2): unavailable this fixture. The caller
   *  filters them out of `pool`; these are surfaced as a status chip. */
  suspendedCards?: Card[];
}

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

function selectionAction(card: Card): { name: string; text: string } {
  const legacyAction = playerActions(card)[0];
  return {
    name: card.abilityName ?? legacyAction?.label ?? 'No Action',
    text: card.abilityText ?? legacyAction?.text ?? 'No printed effect.',
  };
}

function SelectionPositionChips({ card }: { card: Card }) {
  const positions = cardPositionLabels(card);
  const naturalPositions = cardNaturalPositions(card);

  return (
    <span className="flex flex-wrap items-center gap-1" aria-label={`Positions ${positions.join(' and ')}`}>
      {positions.map((position, index) => {
        const color = POSITION_COLOR[naturalPositions[index] ?? card.position] ?? 'var(--dust)';
        return (
          <span
            key={`${position}-${index}`}
            data-position-chip={position}
            style={{
              minWidth: 25,
              padding: '3px 5px',
              color: index === 0 ? 'var(--ink-black)' : 'var(--cream)',
              background: index === 0 ? color : 'rgba(5,8,6,0.75)',
              border: `1px solid ${color}`,
              borderRadius: 4,
              fontFamily: PIXEL,
              fontSize: 8,
              lineHeight: 1,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {position}
          </span>
        );
      })}
    </span>
  );
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
  seed,
  round,
  opponentPower,
  jokers,
  cash,
  scoutUnlocked,
  onUnlockScout,
  onConfirm,
  suspendedCards = [],
}: SquadScreenProps) {
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(initialFormationId);
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => seedSelection(pool, getFormation(initialFormationId), initialSelection));
  const [managerId, setManagerId] = useState<string | null>(
    initialManagerId && managers?.some((m) => m.id === initialManagerId) ? initialManagerId : null,
  );
  const [intent] = useState<TeamIntent>(initialIntent);
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
  const activeManager = mode === 'draft' ? manager : jokers?.[0] ?? null;
  const selectableFormations = useMemo(() => {
    if (!activeManager) return formations;
    const allowed = new Set(managerFormationsV1(activeManager));
    const candidates = formations.filter((candidate) => allowed.has(candidate.id));
    return candidates.length > 0
      ? candidates
      : managerFormationsV1(activeManager).map(getFormation);
  }, [activeManager, formations]);

  const xiCards = useMemo(
    () => sel.starters.filter((x): x is number => x != null).map((id) => byId.get(id)).filter((c): c is Card => !!c),
    [sel.starters, byId],
  );

  // V6 readout (the numbers the match plays with). Match Energy replaces the
  // old pre-match total-cost budget.
  const v6Totals = useMemo(() => xiV6Totals(xiCards, formation), [xiCards, formation]);
  const managerAllowsFormation = activeManager
    ? managerFormationsV1(activeManager).includes(formationId)
    : mode !== 'draft';
  const ready = filled === slotCount && managerAllowsFormation;

  // Live card → the unified V6 token (the same numbers used by the match).
  const v6Of = (card: Card) => toDisplayV6Card(card);
  const benchCards = useMemo(
    () => sel.bench.map((id) => byId.get(id)).filter((c): c is Card => !!c),
    [sel.bench, byId],
  );

  // Squad status counts (chips only when nonzero; injuries/fitness only exist in talk).
  const injuredCount = xiCards.filter((c) => c.injured).length;
  const tiredCount = xiCards.filter((c) => !c.injured && fitnessOf(c) < 50).length;

  // Competence per starter slot — primary/secondary/incompetent.
  const competenceByIndex = useMemo<Competence[]>(
    () =>
      sel.starters.map((id, i) => {
        const c = id != null ? byId.get(id) : undefined;
        return c ? competenceOf(cardNaturalPositions(c), formation.slots[i]) : 'primary';
      }),
    [sel.starters, byId, formation],
  );

  // ── Projected Contest preview (v4 hero) — the real match forecast (evaluateSplit),
  // not a reimplemented weight table. Only computed once the XI is full (a real
  // match can't kick off short-handed either); recomputes live on every squad /
  // formation / intent / manager change, exactly like MatchPhase's previewSplit.
  const previewJokers = useMemo<JokerCard[]>(
    () => (mode === 'draft' ? (manager ? [manager] : []) : (jokers ?? [])),
    [mode, manager, jokers],
  );
  const previewSplit = useMemo(() => {
    if (filled !== slotCount || seed == null || round == null) return null;
    const xi = sel.starters.map((id) => byId.get(id as number)!);
    const bench = sel.bench.map((id) => byId.get(id)).filter((c): c is Card => !!c);
    const state = initMatch(
      xi, bench, [], formation, 'total-football', previewJokers,
      seed, round, opponent.style, opponent.weaknessArchetype,
      {}, intent, opponentPower,
    );
    return evaluateSplit(state, previewJokers);
  }, [filled, slotCount, sel.starters, sel.bench, byId, formation, previewJokers, seed, round, opponent, intent, opponentPower]);

  // Δ-vs-balanced (v4 hero badge) — the same projection at intent:'balanced', so
  // the NET badge reads how far the CURRENT intent moves the net off neutral.
  const balancedNet = useMemo(() => {
    if (filled !== slotCount || seed == null || round == null) return 0;
    const xi = sel.starters.map((id) => byId.get(id as number)!);
    const bench = sel.bench.map((id) => byId.get(id)).filter((c): c is Card => !!c);
    const state = initMatch(
      xi, bench, [], formation, 'total-football', previewJokers,
      seed, round, opponent.style, opponent.weaknessArchetype,
      {}, 'balanced', opponentPower,
    );
    return evaluateSplit(state, previewJokers).forecast.net;
  }, [filled, slotCount, sel.starters, sel.bench, byId, formation, previewJokers, seed, round, opponent, opponentPower]);
  const deltaVsBalanced = previewSplit ? previewSplit.forecast.net - balancedNet : 0;

  // The six-row CONTEST BREAKDOWN view (owner directive) — pure selectors over
  // the SAME evaluated split, so the rows move with every squad/intent edit.
  const panelView = useMemo(
    () => (previewSplit
      ? contestPanel(previewSplit.youEff, previewSplit.oppEff, previewSplit.contest, previewSplit.oppContest, previewSplit.forecast.net)
      : null),
    [previewSplit],
  );
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Live effective stats per starter card (previewSplit.cardStats), for the tokens.
  const statsFor = (cardId: number) => previewSplit?.cardStats[cardId];

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
    const targetOverlay = overlay;
    setSel((prev) => {
      if (targetOverlay?.kind === 'slot') {
        return moveCard(prev, cardId, { kind: 'slot', index: targetOverlay.index });
      }
      if (targetOverlay?.kind === 'bench') {
        return moveCard(prev, cardId, { kind: 'bench', index: Math.min(prev.bench.length, BENCH_SIZE - 1) });
      }
      return prev;
    });
    if (targetOverlay?.kind === 'slot') flashSlot(targetOverlay.index);
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

  function moveBenchCard(cardId: number, targetIndex: number | null) {
    setSel((prev) => moveCard(
      prev,
      cardId,
      targetIndex === null ? { kind: 'reserves' } : { kind: 'bench', index: targetIndex },
    ));
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
        // Mirror the token-fit remap (pitchAxis) so a slot's hit-target sits under
        // the token as RENDERED, not at its raw formation %.
        const sx = pr.left + SLOT_INSET_X + (s.x / 100) * (pr.width - 2 * SLOT_INSET_X);
        const sy = pr.top + SLOT_INSET_Y + (s.y / 100) * (pr.height - 2 * SLOT_INSET_Y);
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
  const activeSlotCard = overlay?.kind === 'slot'
    ? byId.get(sel.starters[overlay.index] as number)
    : undefined;
  const playerSheetAvailable = overlay?.kind === 'slot' && activeSlotCard
    ? pool.filter((card) => card.id !== activeSlotCard.id)
    : reserves;

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
            TEAM SELECTION v {opponent.name}
          </span>
          {mode === 'talk' && contextLabel && (
            <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
              {contextLabel}
            </span>
          )}
        </div>

        {mode === 'talk' && (
          <button
            onClick={() => setShowGallery(true)}
            className="active:scale-95 glass-surface sheen shrink-0 relative overflow-hidden"
            style={{
              height: 42,
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
              fontFamily: PIXEL,
              fontSize: 8.5,
              letterSpacing: 0.5,
              color: 'var(--cream)',
            }}
          >
            <span className="relative" style={{ zIndex: 2 }}>SQUAD</span>
          </button>
        )}

      </div>

      {/* ── Squad readout — the two match totals only. ──────────────────── */}
      <div className="shrink-0 px-3 mt-1.5">
        <div
          className="flex items-stretch"
          style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.28)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight)', overflow: 'hidden' }}
        >
          <div className="flex-1 flex flex-col items-center justify-center py-1.5" style={{ borderRight: '1px solid var(--border)' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)' }}>ATT</span>
            <span style={{ fontFamily: PIXEL, fontSize: 15, color: 'var(--att, #ff9a54)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{v6Totals.att}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-1.5">
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)' }}>DEF</span>
            <span style={{ fontFamily: PIXEL, fontSize: 15, color: 'var(--def, #72c9f2)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{v6Totals.def}</span>
          </div>
        </div>
      </div>

      {/* ── Manager, formation and lineup utilities share one compact row. ── */}
      <div data-testid="team-selection-controls" className="shrink-0 flex items-stretch gap-1 px-3 mt-1.5" style={{ height: 42 }}>
        <button
          onClick={() => {
            if (mode === 'draft') setOverlay({ kind: 'manager' });
            else if (activeManager) setModal({ variant: 'manager', manager: activeManager });
          }}
          className="glass-surface sheen flex-1 flex items-center px-2 min-w-0 active:scale-[0.98] relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius-sm)',
            border: activeManager ? '1px solid var(--kit-red)' : undefined,
            boxShadow: activeManager
              ? 'inset 0 1px 0 0 var(--glass-highlight), 0 0 12px rgba(232,54,47,0.22), var(--depth-1)'
              : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
          }}
        >
          <span className="flex flex-col items-start min-w-0 relative" style={{ zIndex: 2 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 5.5, letterSpacing: 0.8, color: activeManager ? 'var(--kit-red)' : 'var(--dust)' }}>
              MANAGER
            </span>
            <span className="truncate w-full" style={{ fontSize: 9, lineHeight: 1.15, fontWeight: 800, color: activeManager ? 'var(--cream)' : 'var(--dust)' }}>
              {activeManager?.name ?? 'Pick manager'}
            </span>
            <span className="truncate w-full" style={{ fontFamily: PIXEL, fontSize: 6, lineHeight: 1.2, color: activeManager ? 'var(--gold)' : 'var(--dust)' }}>
              {activeManager ? managerActionNameV1(activeManager).toUpperCase() : 'ACTION —'}
            </span>
          </span>
        </button>

        <button
          onClick={() => setOverlay({ kind: 'formation' })}
          className="glass-surface sheen flex flex-col items-start justify-center px-2 active:scale-95 relative overflow-hidden"
          style={{
            width: 72,
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
          }}
        >
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 5.5, letterSpacing: 0.7, color: 'var(--dust)', zIndex: 2 }}>FORMATION</span>
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1.2, color: 'var(--cream)', zIndex: 2 }}>{formation.name}</span>
        </button>
        <button
          onClick={autoPick}
          className="active:scale-95 relative overflow-hidden shrink-0"
          style={{
            width: 76,
            color: 'var(--ink-black)',
            background: 'linear-gradient(180deg, #ffe69a, var(--gold))',
            border: '1px solid var(--ink-black)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 2px 0 var(--ink-black)',
            fontFamily: PIXEL,
            fontSize: 7.5,
            letterSpacing: 0.2,
            fontWeight: 800,
          }}
        >
          AUTO SELECT
        </button>
        <button
          onClick={() => setSel(mode === 'draft' ? emptySelection(formation) : seedSelection(pool, formation, initialSelection))}
          className="glass-surface active:scale-95 shrink-0"
          style={{
            width: 48,
            color: 'var(--dust)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: PIXEL,
            fontSize: 7,
            letterSpacing: 0.2,
          }}
        >
          {mode === 'draft' ? 'CLEAR' : 'RESET'}
        </button>
      </div>

      {/* ── Talk-mode status chips (suspended / injured / tired) ───────────── */}
      {(injuredCount > 0 || tiredCount > 0 || suspendedCards.length > 0) && (
        <div className="shrink-0 px-3 mt-1 flex items-center gap-1.5">
          {suspendedCards.length > 0 && (
            <StatusChip
              label={`${suspendedCards.map((c) => lastName(c.name).toUpperCase()).join(', ')} SUSPENDED`}
              color="var(--danger)"
            />
          )}
          {injuredCount > 0 && <StatusChip label={`${injuredCount} INJ`} color="var(--danger)" />}
          {tiredCount > 0 && <StatusChip label={`${tiredCount} TIRED`} color="var(--gold)" />}
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
            return (
              <LineupSlot
                key={i}
                slot={slot}
                card={card}
                v6card={card ? v6Of(card) : undefined}
                competence={competenceByIndex[i]}
                stats={card ? statsFor(card.id) : undefined}
                justPlaced={placedSlot === i}
                dim={drag?.from === 'slot' && drag.index === i}
                dropHint={dropTarget?.kind === 'slot' && dropTarget.index === i}
                onClick={card ? undefined : () => setOverlay({ kind: 'slot', index: i })}
                onPointerDown={card ? (e) => beginPointer({ from: 'slot', index: i, id: card.id }, e) : undefined}
                onPointerMove={card && !drag ? movePointer : undefined}
                onPointerUp={card && !drag ? endPointer : undefined}
                onPointerCancel={card ? cancelPointer : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* ── Bench ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 mt-1.5">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setOverlay({ kind: 'bench' })}
            className="active:scale-95 flex items-center gap-1"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--gold)' }}
          >
            BENCH {sel.bench.length}/{BENCH_SIZE} <span style={{ fontSize: 9 }}>{'▸'} EDIT</span>
          </button>
          <BenchCover benchCards={benchCards} />
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
                v6card={v6Of(card)}
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

      {/* ── KICK OFF — the primary action, at the bottom (mirrors the match CTA) ── */}
      <div className="shrink-0 px-3 mt-1.5">
        <button
          onClick={confirm}
          disabled={!ready}
          className={`active:scale-95 w-full relative overflow-hidden ${ready ? 'sheen-strong glow-edge' : 'glass-surface'}`}
          style={{
            fontFamily: PIXEL,
            fontSize: 14,
            letterSpacing: 0.5,
            color: ready ? 'var(--line-white)' : 'var(--dust)',
            height: 48,
            borderRadius: 'var(--radius-sm)',
            border: ready ? '2px solid var(--ink-black)' : '1px solid var(--border)',
            background: ready ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : 'rgba(0,0,0,0.28)',
            boxShadow: ready ? 'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)' : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease',
            cursor: ready ? 'pointer' : 'default',
            ...(ready ? { ['--glow' as string]: 'var(--amber-glow)' } : {}),
          }}
        >
          {filled < slotCount ? `FILL YOUR XI · ${filled}/${slotCount}` : mode === 'draft' && !manager ? 'PICK A MANAGER' : 'KICK OFF →'}
        </button>
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
            data-testid={overlay.kind === 'bench' ? 'bench-editor-sheet' : undefined}
            className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
            style={{
              height: overlay.kind === 'bench' ? '100%' : undefined,
              borderTopLeftRadius: overlay.kind === 'bench' ? 0 : 'var(--radius-lg)',
              borderTopRightRadius: overlay.kind === 'bench' ? 0 : 'var(--radius-lg)',
              borderTop: `3px solid ${
                overlay.kind === 'manager' ? 'var(--kit-red)' : overlay.kind === 'formation' ? 'var(--kit-blue)' : 'var(--gold)'
              }`,
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)',
              maxHeight: overlay.kind === 'bench' ? '100%' : '64%',
              paddingTop: overlay.kind === 'bench' ? 'max(env(safe-area-inset-top), 8px)' : undefined,
              paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {overlay.kind !== 'bench' && (
              <div className="flex justify-center pt-2 pb-1 shrink-0 relative" style={{ zIndex: 2 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
              </div>
            )}

            <div className="flex items-center justify-between px-3 pb-2 shrink-0 relative" style={{ zIndex: 2 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5, color: 'var(--cream)' }}>
                {overlay.kind === 'manager'
                  ? 'PICK MANAGER'
                  : overlay.kind === 'formation'
                    ? 'PICK FORMATION'
                    : overlay.kind === 'bench'
                      ? 'EDIT BENCH'
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
                  const nextManager = managers.find((candidate) => candidate.id === id);
                  const nextFormationIds = nextManager ? managerFormationsV1(nextManager) : [];
                  setManagerId(id);
                  if (nextFormationIds.length > 0 && !nextFormationIds.includes(formationId)) {
                    switchFormation(nextFormationIds[0]);
                  } else {
                    setOverlay(null);
                  }
                }}
                onInspect={(m) => setModal({ variant: 'manager', manager: m })}
              />
            ) : overlay.kind === 'formation' ? (
              <FormationSheet formations={selectableFormations} current={formationId} onPick={switchFormation} />
            ) : overlay.kind === 'bench' ? (
              <BenchEditor
                benchCards={benchCards}
                reserves={reserves}
                onMove={moveBenchCard}
                onInspect={(card) => setModal({ variant: 'player', card })}
              />
            ) : (
              <PlayerSheet
                available={playerSheetAvailable}
                activeSlot={activeSlot}
                currentCard={activeSlotCard}
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
  const stats = toDisplayV6Card(card);
  const positions = cardPositionLabels(card).join('/');
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
          <span
            title={positions}
            style={{
              maxWidth: 34,
              overflow: 'hidden',
              color: 'var(--ink-black)',
              background: POSITION_COLOR[card.position] ?? 'var(--dust)',
              borderRadius: 3,
              padding: '2px 3px',
              fontFamily: PIXEL,
              fontSize: positions.length > 2 ? 5.5 : 7,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {positions}
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 10, lineHeight: 1, color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>
            {stats.attack}/{stats.defence}
          </span>
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
// StatusChip — compact status readout.
// ---------------------------------------------------------------------------

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
                  {(() => {
                    const st = deriveStats(p);
                    return (
                      <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>
                        {st.atk}/{st.def}
                      </span>
                    );
                  })()}
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
// PlayerSheet — comparison first: current player stays visible while the
// alternatives scroll. Positions, printed Action, cost and match stats are all
// readable without opening a separate dossier.
// ---------------------------------------------------------------------------

function PlayerSheet({
  available,
  activeSlot,
  currentCard,
  showFitness,
  onPick,
  onInspect,
}: {
  available: Card[];
  activeSlot: Formation['slots'][number] | null;
  currentCard?: Card;
  showFitness: boolean;
  onPick: (id: number) => void;
  onInspect: (c: Card) => void;
}) {
  const sorted = useMemo(() => {
    if (!activeSlot) return available;
    const rank: Record<Competence, number> = { primary: 0, secondary: 1, incompetent: 2 };
    return [...available].sort((a, b) => {
      const ea = rank[competenceOf(cardNaturalPositions(a), activeSlot)];
      const eb = rank[competenceOf(cardNaturalPositions(b), activeSlot)];
      if (ea !== eb) return ea - eb;
      return effectiveStrength(b) - effectiveStrength(a);
    });
  }, [available, activeSlot]);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden relative" style={{ zIndex: 2 }}>
      {activeSlot && (
        <div className="flex items-center gap-3 px-3 pb-1.5 shrink-0">
          {(['primary', 'secondary', 'incompetent'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1" style={{ fontSize: 8, color: 'var(--dust)', fontFamily: PIXEL }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: COMPETENCE_COLOR[k].bg, display: 'inline-block' }} />
              {k === 'primary' ? 'BEST' : k === 'secondary' ? 'OK' : 'MISFIT'}
            </span>
          ))}
        </div>
      )}
      {currentCard && activeSlot && (
        <div className="shrink-0 px-3 pb-2">
          <div style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>CURRENT PLAYER</div>
          <PlayerSelectionRow
            card={currentCard}
            competence={competenceOf(cardNaturalPositions(currentCard), activeSlot)}
            showFitness={showFitness}
            current
            onInspect={onInspect}
          />
        </div>
      )}
      <div className="shrink-0 px-3 pb-1" style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>
        {currentCard ? 'SWAP WITH' : 'AVAILABLE PLAYERS'}
      </div>
      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-3 pb-2" style={{ overscrollBehavior: 'contain' }}>
        {sorted.map((card) => (
          <PlayerSelectionRow
            key={card.id}
            card={card}
            competence={activeSlot ? competenceOf(cardNaturalPositions(card), activeSlot) : 'primary'}
            showFitness={showFitness}
            actionLabel={activeSlot ? 'SWAP' : 'ADD'}
            onPick={() => onPick(card.id)}
            onInspect={onInspect}
          />
        ))}
        {sorted.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--dust)', padding: '8px 0' }}>No players available — every card is named.</div>
        )}
      </div>
    </div>
  );
}

function PlayerSelectionRow({
  card,
  competence,
  showFitness,
  current = false,
  actionLabel,
  onPick,
  onInspect,
}: {
  card: Card;
  competence: Competence;
  showFitness: boolean;
  current?: boolean;
  actionLabel?: 'SWAP' | 'ADD';
  onPick?: () => void;
  onInspect: (card: Card) => void;
}) {
  const stats = toDisplayV6Card(card);
  const action = selectionAction(card);
  const positions = cardPositionLabels(card);
  const fit = COMPETENCE_COLOR[competence];

  return (
    <div
      data-testid={current ? 'team-selection-current-player' : 'team-selection-player-option'}
      data-player-id={card.id}
      data-player-positions={positions.join('/')}
      data-player-action={action.name}
      data-player-attack={stats.attack}
      data-player-defence={stats.defence}
      className="grid items-stretch gap-2"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) 66px',
        minHeight: 78,
        background: current
          ? 'linear-gradient(180deg, rgba(92,66,24,0.52), rgba(24,17,8,0.96))'
          : 'linear-gradient(180deg, #1c1610, #100c07)',
        border: `1px solid ${current ? 'var(--gold)' : fit.bg}`,
        borderRadius: 'var(--radius-sm)',
        padding: 6,
        boxShadow: current ? '0 0 0 1px rgba(232,178,60,0.18)' : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => onInspect(card)}
        aria-label={`Inspect ${card.name} Action`}
        className="flex min-w-0 flex-col items-start text-left active:scale-[0.99]"
        style={{ padding: 0, border: 0, background: 'transparent' }}
      >
        <span className="flex w-full items-center gap-1.5 min-w-0">
          <strong className="truncate" style={{ fontFamily: PIXEL, fontSize: 9.5, lineHeight: 1.15, color: 'var(--cream)' }}>
            {lastName(card.name).toUpperCase()}
          </strong>
          <span
            style={{
              marginLeft: 'auto',
              padding: '2px 4px',
              color: fit.text,
              background: fit.bg,
              borderRadius: 3,
              fontFamily: PIXEL,
              fontSize: 6.5,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {competence === 'primary' ? 'BEST' : competence === 'secondary' ? 'OK' : 'MISFIT'}
          </span>
        </span>
        <span className="mt-1"><SelectionPositionChips card={card} /></span>
        <strong className="mt-1 truncate w-full" style={{ fontFamily: PIXEL, fontSize: 8.5, lineHeight: 1.15, color: 'var(--gold)' }}>
          {action.name.toUpperCase()}
        </strong>
        <span
          style={{
            display: '-webkit-box',
            overflow: 'hidden',
            marginTop: 2,
            color: 'var(--cream-soft)',
            fontSize: 8.5,
            lineHeight: 1.2,
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
          } as CSSProperties}
        >
          {action.text}
        </span>
        {showFitness && <span className="mt-1"><FitnessBar card={card} width={72} /></span>}
      </button>

      <div className="flex flex-col justify-between gap-1">
        <div className="grid grid-cols-3 gap-1 text-center">
          <SelectionMetric label="COST" value={stats.cost} color="var(--gold)" />
          <SelectionMetric label="ATT" value={stats.attack} color="#ff8f6a" />
          <SelectionMetric label="DEF" value={stats.defence} color="#8fb6ff" />
        </div>
        {current ? (
          <span
            style={{
              padding: '5px 0',
              color: 'var(--gold)',
              border: '1px solid rgba(232,178,60,0.5)',
              borderRadius: 4,
              fontFamily: PIXEL,
              fontSize: 7.5,
              textAlign: 'center',
            }}
          >
            CURRENT
          </span>
        ) : (
          <button
            type="button"
            onClick={onPick}
            className="active:scale-90"
            aria-label={`${actionLabel ?? 'Add'} ${card.name}`}
            style={{
              padding: '6px 0',
              color: 'var(--ink-black)',
              background: 'var(--gold)',
              border: '1px solid var(--ink-black)',
              borderRadius: 4,
              fontFamily: PIXEL,
              fontSize: 8,
              fontWeight: 800,
            }}
          >
            {actionLabel ?? 'ADD'}
          </button>
        )}
      </div>
    </div>
  );
}

function SelectionMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex flex-col items-center">
      <small style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1, color: 'var(--dust)' }}>{label}</small>
      <strong style={{ fontFamily: PIXEL, fontSize: 10, lineHeight: 1.35, color, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </span>
  );
}

// ---------------------------------------------------------------------------
// BenchEditor — full-screen, touch-first drag and drop. The current seven seats
// stay fixed at the top; the remaining squad scrolls beneath them.
// ---------------------------------------------------------------------------

type BenchEditTarget = { kind: 'seat'; index: number } | { kind: 'reserves' };

function BenchEditor({
  benchCards,
  reserves,
  onMove,
  onInspect,
}: {
  benchCards: Card[];
  reserves: Card[];
  onMove: (cardId: number, targetIndex: number | null) => void;
  onInspect: (card: Card) => void;
}) {
  const [drag, setDrag] = useState<{ card: Card; x: number; y: number } | null>(null);
  const [target, setTarget] = useState<BenchEditTarget | null>(null);
  const pointer = useRef<{ card: Card; x: number; y: number; moved: boolean } | null>(null);
  const targetRef = useRef<BenchEditTarget | null>(null);

  function updateTarget(next: BenchEditTarget | null) {
    targetRef.current = next;
    setTarget(next);
  }

  function targetAt(x: number, y: number): BenchEditTarget | null {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const seat = element?.closest<HTMLElement>('[data-bench-seat]');
    if (seat?.dataset.benchSeat !== undefined) {
      return { kind: 'seat', index: Number(seat.dataset.benchSeat) };
    }
    if (element?.closest('[data-bench-reserves]')) return { kind: 'reserves' };
    return null;
  }

  function begin(card: Card, event: ReactPointerEvent<HTMLButtonElement>) {
    pointer.current = { card, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = pointer.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 7) {
      current.moved = true;
    }
    if (!current.moved) return;
    setDrag({ card: current.card, x: event.clientX, y: event.clientY });
    updateTarget(targetAt(event.clientX, event.clientY));
  }

  function end(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = pointer.current;
    pointer.current = null;
    if (!current) return;
    if (current.moved) {
      if (targetRef.current?.kind === 'seat') onMove(current.card.id, targetRef.current.index);
      else if (targetRef.current?.kind === 'reserves') onMove(current.card.id, null);
    } else {
      onInspect(current.card);
    }
    setDrag(null);
    updateTarget(null);
    event.stopPropagation();
  }

  function cancel() {
    pointer.current = null;
    setDrag(null);
    updateTarget(null);
  }

  return (
    <div data-testid="bench-editor" className="flex min-h-0 flex-1 flex-col overflow-hidden relative" style={{ zIndex: 2 }}>
      <section className="shrink-0 px-3 pb-2">
        <div className="flex items-center justify-between pb-1.5">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--gold)' }}>
            CURRENT BENCH · {benchCards.length}/{BENCH_SIZE}
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: 'var(--dust)' }}>DRAG TO REORDER</span>
        </div>
        <div
          data-testid="bench-editor-current"
          className="flex gap-1.5 overflow-x-auto pb-2"
          style={{ scrollbarWidth: 'none', overscrollBehaviorX: 'contain' }}
        >
          {Array.from({ length: BENCH_SIZE }).map((_, index) => {
            const card = benchCards[index];
            const selected = target?.kind === 'seat' && target.index === index;
            return (
              <div
                key={index}
                data-bench-seat={index}
                className="shrink-0 flex items-center justify-center"
                style={{
                  width: 70,
                  minHeight: 100,
                  padding: 2,
                  border: selected ? '2px dashed var(--gold)' : '1px dashed var(--border)',
                  borderRadius: 7,
                  background: selected ? 'rgba(232,178,60,0.14)' : 'rgba(0,0,0,0.22)',
                }}
              >
                {card ? (
                  <BenchEditorCard card={card} dim={drag?.card.id === card.id} onBegin={begin} onMove={move} onEnd={end} onCancel={cancel} />
                ) : (
                  <span style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--ink)' }}>+</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col border-t px-3 pt-2" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-1.5 shrink-0">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--cream)' }}>AVAILABLE PLAYERS</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: 'var(--dust)' }}>DRAG UP TO ADD · DRAG HERE TO REMOVE</span>
        </div>
        <div
          data-testid="bench-editor-reserves"
          data-bench-reserves
          className="min-h-0 flex-1 overflow-y-auto pb-4"
          style={{
            border: target?.kind === 'reserves' ? '2px dashed var(--gold)' : '2px solid transparent',
            borderRadius: 7,
            overscrollBehavior: 'contain',
          }}
        >
          <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-3 py-2">
            {reserves.map((card) => (
              <BenchEditorCard
                key={card.id}
                card={card}
                dim={drag?.card.id === card.id}
                onBegin={begin}
                onMove={move}
                onEnd={end}
                onCancel={cancel}
              />
            ))}
          </div>
          {reserves.length === 0 && (
            <p style={{ margin: '12px 0', textAlign: 'center', fontSize: 10, color: 'var(--dust)' }}>Every available player is on the bench.</p>
          )}
        </div>
      </section>

      {drag && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: drag.x,
            top: drag.y,
            zIndex: 80,
            pointerEvents: 'none',
            transform: 'translate(-50%, -70%) scale(1.04)',
          }}
        >
          <TeamSelectionPlayerCard card={drag.card} v6card={toDisplayV6Card(drag.card)} size="bench" highlighted />
        </div>
      )}
    </div>
  );
}

function BenchEditorCard({
  card,
  dim,
  onBegin,
  onMove,
  onEnd,
  onCancel,
}: {
  card: Card;
  dim: boolean;
  onBegin: (card: Card, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCancel: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Drag ${card.name}`}
      onPointerDown={(event) => onBegin(card, event)}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onCancel}
      style={{ padding: 0, border: 0, background: 'transparent', touchAction: 'none', opacity: dim ? 0.25 : 1 }}
    >
      <TeamSelectionPlayerCard card={card} v6card={toDisplayV6Card(card)} size="bench" />
    </button>
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
