'use client';

/**
 * Kickoff Clash — Team Talk (pre-match).
 *
 * Shown before every tie AFTER the run-start draft (between ties in a cup, and on the
 * first tie of each new cup). Fitness carries forward across a cup, so this is where the
 * player reviews condition and adjusts the XI / shape / intent before kickoff — with a
 * fitness-aware auto-fill default so a casual player just hits CONFIRM.
 *
 * Reuses the pure team-select logic (autoFill / autoFillXI / effectiveStrength /
 * positionFitsSlot) and writes back only the lineup levers the match reads
 * (startingXI / benchIds / activeFormation / intent). It never touches jokers/tactics,
 * so the localStorage round-trip is unaffected.
 */

import { useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import type { Formation } from '../lib/formations';
import { getFormation, positionFitsSlot } from '../lib/formations';
import type { RunState, TeamIntent } from '../lib/run';
import { cupSize, isCupFinal } from '../lib/run';
import {
  type XISelection,
  autoFill,
  autoFillXI,
  startersFilled,
  effectiveStrength,
  BENCH_SIZE,
} from '../lib/team-select';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import SquadGallery from './SquadGallery';
import { PIXEL, RARITY_COLOR, POSITION_COLOR, lastName } from './cards/cardTokens';

interface TeamTalkProps {
  runState: RunState;
  onConfirm: (upd: {
    startingXI: number[];
    benchIds: number[];
    activeFormation: string;
    intent: TeamIntent;
  }) => void;
}

const INTENTS: { id: TeamIntent; label: string; accent: string }[] = [
  { id: 'attacking', label: 'ATT', accent: 'var(--kit-red)' },
  { id: 'balanced', label: 'BAL', accent: 'var(--gold)' },
  { id: 'defensive', label: 'DEF', accent: 'var(--kit-blue)' },
];

type Overlay = { kind: 'slot'; index: number } | { kind: 'bench' } | { kind: 'formation' } | null;

// --- Fitness read (mirrors the engine's fitnessOf: injured cards start low). ---
const fitnessOf = (c: Card): number => c.fitness ?? (c.injured ? 2 : 6);
const LOW_FITNESS = 2.5; // engine injury-risk threshold (advanceIncrement)
function fitnessColor(c: Card): string {
  if (c.injured) return 'var(--danger)';
  const f = fitnessOf(c);
  if (f >= 4) return 'var(--success)';
  if (f >= LOW_FITNESS) return 'var(--gold)';
  return 'var(--danger)';
}

// Seed the selection from the carried-forward lineup, dropping any card no longer in the
// deck (shattered/sold), then auto-fill gaps so the default XI is always confirmable.
function seedSelection(runState: RunState, formation: Formation, pool: Card[]): XISelection {
  const inDeck = new Set(pool.map((c) => c.id));
  const starters = formation.slots.map((_, i) => {
    const id = runState.startingXI?.[i];
    return id != null && inDeck.has(id) ? id : null;
  });
  const used = new Set(starters.filter((x): x is number => x != null));
  const bench = (runState.benchIds ?? []).filter((id) => inDeck.has(id) && !used.has(id)).slice(0, BENCH_SIZE);
  return autoFill(pool, formation, { starters, bench }, 'empty');
}

export default function TeamTalk({ runState, onConfirm }: TeamTalkProps) {
  const pool = runState.deck;
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(runState.activeFormation);
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => seedSelection(runState, formation, pool));
  const [intent, setIntent] = useState<TeamIntent>(runState.intent ?? 'balanced');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [placedSlot, setPlacedSlot] = useState<number | null>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const formations = useMemo(() => {
    const ids = runState.ownedFormations?.length ? runState.ownedFormations : [runState.activeFormation];
    const uniq = Array.from(new Set([runState.activeFormation, ...ids]));
    return uniq.map(getFormation);
  }, [runState.ownedFormations, runState.activeFormation]);

  const usedIds = useMemo(
    () => new Set<number>([...sel.starters.filter((x): x is number => x != null), ...sel.bench]),
    [sel],
  );
  const available = useMemo(
    () => pool.filter((c) => !usedIds.has(c.id)).sort((a, b) => effectiveStrength(b) - effectiveStrength(a)),
    [pool, usedIds],
  );

  const filled = startersFilled(sel);
  const slotCount = formation.slots.length;
  const ready = filled === slotCount;

  const xiCards = useMemo(
    () => sel.starters.filter((x): x is number => x != null).map((id) => byId.get(id)).filter((c): c is Card => !!c),
    [sel.starters, byId],
  );
  const xiAvg = xiCards.length ? Math.round(xiCards.reduce((a, c) => a + c.power, 0) / xiCards.length) : 0;
  const tiredCount = xiCards.filter((c) => !c.injured && fitnessOf(c) < 3).length;
  const injuredCount = xiCards.filter((c) => c.injured).length;
  const misfitCount = useMemo(
    () =>
      sel.starters.reduce<number>((n, id, i) => {
        const c = id != null ? byId.get(id) : undefined;
        return c && !positionFitsSlot(c.position, formation.slots[i]) ? n + 1 : n;
      }, 0),
    [sel.starters, byId, formation],
  );

  // The headline nudge: injuries first, then tiredness, then misfits, else all good.
  const nudge: { text: string; color: string } = injuredCount
    ? { text: `${injuredCount} INJURED — REST OR SUB`, color: 'var(--danger)' }
    : tiredCount
      ? { text: `${tiredCount} TIRED — CONSIDER ROTATING`, color: 'var(--gold)' }
      : misfitCount
        ? { text: `${misfitCount} OUT OF POSITION`, color: 'var(--gold)' }
        : { text: 'SQUAD FRESH — READY', color: 'var(--success)' };

  const tieLabel = isCupFinal(runState.round, runState.matchInCup)
    ? 'FINAL'
    : `TIE ${runState.matchInCup}/${cupSize(runState.round)}`;

  function switchFormation(id: string) {
    const newF = getFormation(id);
    setFormationId(id);
    setSel((prev) => {
      const chosen = [...prev.starters.filter((x): x is number => x != null), ...prev.bench]
        .map((cid) => byId.get(cid))
        .filter((c): c is Card => !!c);
      const { xi, bench } = autoFillXI(chosen, newF, true);
      return {
        starters: newF.slots.map((_, i) => xi[i]?.id ?? null),
        bench: bench.slice(0, BENCH_SIZE).map((c) => c.id),
      };
    });
    setOverlay(null);
  }

  // Fitness-aware auto: rest tired/injured, pick the freshest strong XI from the whole squad.
  function autoPick() {
    const { xi, bench } = autoFillXI(pool, formation, true);
    setSel({
      starters: formation.slots.map((_, i) => xi[i]?.id ?? null),
      bench: bench.slice(0, BENCH_SIZE).map((c) => c.id),
    });
  }
  function resetToCarried() {
    setSel(seedSelection(runState, formation, pool));
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
      startingXI: sel.starters.filter((x): x is number => x != null),
      benchIds: sel.bench,
      activeFormation: formationId,
      intent,
    });
  }

  const activeSlot = overlay?.kind === 'slot' ? formation.slots[overlay.index] : null;

  return (
    <div
      className="flex flex-col overflow-hidden relative phase-setup"
      style={{
        height: '100dvh',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {/* ── Header: title · tie · avg · CONFIRM ───────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3">
        <div className="flex flex-col mr-auto min-w-0">
          <span
            className="uppercase truncate"
            style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
          >
            Team Talk
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
            CUP {runState.round} {'·'} {tieLabel}
          </span>
        </div>

        <div
          className="glass-surface flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
          style={{ width: 46, height: 40, borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 15, lineHeight: 1, color: 'var(--line-white)' }}>{xiAvg || '--'}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>AVG</span>
        </div>

        <button
          onClick={confirm}
          disabled={!ready}
          className={`active:scale-95 shrink-0 relative overflow-hidden ${ready ? 'sheen-strong glow-edge' : 'glass-surface sheen'}`}
          style={{
            fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5,
            color: ready ? 'var(--line-white)' : 'var(--ink)',
            height: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)',
            border: ready ? '2px solid var(--ink-black)' : undefined,
            background: ready ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : undefined,
            boxShadow: ready
              ? 'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)'
              : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            transition: 'transform 0.12s ease', cursor: ready ? 'pointer' : 'default',
            ...(ready ? { ['--glow' as string]: 'var(--amber-glow)' } : {}),
          }}
        >
          KICK OFF
        </button>
      </div>

      {/* ── Fitness nudge bar + squad gallery entry ───────────────────────── */}
      <div className="shrink-0 px-3 mt-2 flex items-center gap-1.5">
        <div
          className="glass-surface flex items-center gap-2 px-2.5 flex-1 min-w-0 relative overflow-hidden"
          style={{ height: 28, borderRadius: 'var(--radius-sm)', border: `1px solid ${nudge.color}`, boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 10px ${nudge.color}33, var(--depth-1)` }}
        >
          <span className="relative" style={{ width: 8, height: 8, borderRadius: '50%', background: nudge.color, flexShrink: 0, zIndex: 2 }} />
          <span className="truncate relative" style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: nudge.color, zIndex: 2 }}>{nudge.text}</span>
        </div>
        <button
          onClick={() => setShowGallery(true)}
          className="active:scale-95 glass-surface sheen shrink-0 relative overflow-hidden"
          style={{ height: 28, padding: '0 11px', borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: 'var(--cream)' }}
        >
          <span className="relative" style={{ zIndex: 2 }}>SQUAD</span>
        </button>
      </div>

      {/* ── Control bar: shape · intent · auto/reset ──────────────────────── */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-3 mt-2">
        <button
          onClick={() => setOverlay({ kind: 'formation' })}
          className="glass-surface sheen flex flex-col items-start justify-center px-2.5 active:scale-95 relative overflow-hidden"
          style={{ borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)', transition: 'transform 0.12s ease', minWidth: 60 }}
        >
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: 'var(--dust)', zIndex: 2 }}>SHAPE</span>
          <span className="relative" style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1.1, color: 'var(--cream)', zIndex: 2 }}>{formation.name}</span>
        </button>

        <div className="glass-surface flex relative overflow-hidden" style={{ borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}>
          {INTENTS.map((it) => {
            const on = intent === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setIntent(it.id)}
                className="px-2.5 active:scale-95 relative"
                style={{ fontFamily: PIXEL, fontSize: 10, letterSpacing: 0.5, background: on ? it.accent : 'transparent', color: on ? 'var(--ink-black)' : 'var(--cream-soft)', boxShadow: on ? 'inset 0 1px 0 0 rgba(242,246,239,0.35)' : undefined, transition: 'background 0.15s ease', zIndex: 2 }}
              >
                {it.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <ActionBtn label="AUTO" accent="var(--gold)" onClick={autoPick} />
          <ActionBtn label="RESET" accent="var(--dust)" onClick={resetToCarried} />
        </div>
      </div>

      {/* ── Pitch ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-3 mt-2.5">
        <TalkPitch
          formation={formation}
          starters={sel.starters}
          byId={byId}
          placedSlot={placedSlot}
          onSlot={(i) => setOverlay({ kind: 'slot', index: i })}
          onInspect={(card) => setModal({ variant: 'player', card })}
        />
      </div>

      {/* ── Bench ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 mt-2">
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>BENCH {sel.bench.length}/{BENCH_SIZE}</span>
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
                style={{ height: 46, borderRadius: 'var(--radius-sm)', background: card ? undefined : 'rgba(0,0,0,0.28)', border: card ? `1px solid ${ring}` : '2px dashed var(--border)', boxShadow: card ? `inset 0 1px 0 0 var(--glass-highlight), 0 0 8px ${ring}33, var(--depth-1)` : undefined, transition: 'transform 0.12s ease', minWidth: 0 }}
              >
                {card ? (
                  <>
                    <span className="relative" style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: 'var(--line-white)', zIndex: 2 }}>{Math.round(card.power)}</span>
                    <span className="truncate w-full text-center px-0.5 relative" style={{ fontSize: 7.5, color: 'var(--cream-soft)', marginTop: 1, zIndex: 2 }}>{lastName(card.name)}</span>
                    <span className="relative" style={{ zIndex: 2 }}><FitnessBar card={card} width={26} /></span>
                    <span
                      role="button"
                      aria-label={`Remove ${lastName(card.name)} from bench`}
                      onClick={(e) => { e.stopPropagation(); removeBench(card.id); }}
                      className="absolute flex items-center justify-center"
                      style={{ top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'var(--danger)', border: '1.5px solid var(--ink-black)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 9, lineHeight: 1, zIndex: 3 }}
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

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {overlay && (
        <div className="absolute inset-0 flex flex-col justify-end scrim-fade" style={{ background: 'rgba(2,9,5,0.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 40 }} onClick={() => setOverlay(null)}>
          <div
            className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
            style={{ borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)', borderTop: `3px solid ${overlay.kind === 'formation' ? 'var(--kit-blue)' : 'var(--gold)'}`, boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)', maxHeight: '64%', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0 relative" style={{ zIndex: 2 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2 shrink-0 relative" style={{ zIndex: 2 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5, color: 'var(--cream)' }}>
                {overlay.kind === 'formation' ? 'PICK SHAPE' : overlay.kind === 'bench' ? 'ADD TO BENCH' : `FILL ${(activeSlot?.label ?? '').toUpperCase()}`}
              </span>
              <div className="flex items-center gap-1.5">
                {overlay.kind === 'slot' && sel.starters[overlay.index] != null && (
                  <button onClick={() => { clearSlot(overlay.index); setOverlay(null); }} className="glass-surface active:scale-90 relative overflow-hidden" style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--danger)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                    CLEAR
                  </button>
                )}
                <button onClick={() => setOverlay(null)} className="glass-surface active:scale-90 relative overflow-hidden" style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>CLOSE</button>
              </div>
            </div>

            {overlay.kind === 'formation' ? (
              <FormationSheet formations={formations} current={formationId} onPick={switchFormation} />
            ) : (
              <PlayerSheet available={available} activeSlot={activeSlot} onPick={placeInOverlay} onInspect={(c) => setModal({ variant: 'player', card: c })} />
            )}
          </div>
        </div>
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />

      {showGallery && <SquadGallery deck={pool} onClose={() => setShowGallery(false)} title="YOUR SQUAD" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FitnessBar — a compact condition meter (the headline read of this screen).
// ---------------------------------------------------------------------------
function FitnessBar({ card, width = '100%' }: { card: Card; width?: number | string }) {
  const f = fitnessOf(card);
  const pct = Math.max(0, Math.min(1, (f - 1) / 5)); // 1→0, 6→1
  return (
    <div style={{ width, height: 3, borderRadius: 2, marginTop: 2, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: fitnessColor(card) }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TalkPitch — top-down field with fitness-forward chips.
// ---------------------------------------------------------------------------
function TalkPitch({
  formation, starters, byId, placedSlot, onSlot, onInspect,
}: {
  formation: Formation;
  starters: (number | null)[];
  byId: Map<number, Card>;
  placedSlot: number | null;
  onSlot: (index: number) => void;
  onInspect: (card: Card) => void;
}) {
  const line = 'rgba(242,246,239,0.5)';
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)',
        boxShadow: '0 3px 0 0 var(--ink-black), inset 0 0 60px rgba(0,0,0,0.35)',
        background: 'repeating-linear-gradient(180deg, var(--pitch-bright) 0px, var(--pitch-bright) 9%, var(--pitch-stripe) 9%, var(--pitch-stripe) 18%)',
      }}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 150" preserveAspectRatio="none">
        <rect x="3" y="3" width="94" height="144" fill="none" stroke={line} strokeWidth="0.6" />
        <line x1="3" y1="75" x2="97" y2="75" stroke={line} strokeWidth="0.6" />
        <circle cx="50" cy="75" r="11" fill="none" stroke={line} strokeWidth="0.6" />
        <circle cx="50" cy="75" r="1" fill={line} />
        <rect x="26" y="3" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
        <rect x="38" y="3" width="24" height="8" fill="none" stroke={line} strokeWidth="0.6" />
        <rect x="26" y="127" width="48" height="20" fill="none" stroke={line} strokeWidth="0.6" />
        <rect x="38" y="139" width="24" height="8" fill="none" stroke={line} strokeWidth="0.6" />
      </svg>

      {formation.slots.map((slot, i) => {
        const cardId = starters[i];
        const card = cardId != null ? byId.get(cardId) : undefined;
        const misfit = !!card && !positionFitsSlot(card.position, slot);
        return (
          <TalkSlot
            key={i}
            slot={slot}
            card={card}
            misfit={misfit}
            justPlaced={placedSlot === i}
            onClick={() => onSlot(i)}
            onInspect={card ? () => onInspect(card) : undefined}
          />
        );
      })}
    </div>
  );
}

function TalkSlot({
  slot, card, misfit, justPlaced, onClick, onInspect,
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  misfit: boolean;
  justPlaced: boolean;
  onClick: () => void;
  onInspect?: () => void;
}) {
  const isGK = slot.type === 'GK';
  const kit = isGK ? '#16a34a' : 'var(--kit-red)';
  const rarityRing = card ? RARITY_COLOR[card.rarity] ?? 'var(--line-white)' : null;
  const posColor = card ? POSITION_COLOR[card.position] ?? 'var(--dust)' : null;
  const ring = misfit ? 'var(--danger)' : rarityRing;
  return (
    <button
      onClick={onClick}
      className="absolute flex flex-col items-center active:scale-95"
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)', width: 50, transition: 'transform 0.1s ease' }}
    >
      {card ? (
        <div
          className={`relative flex items-center justify-center ${justPlaced ? 'chip-place' : ''}`}
          style={{
            width: 34, height: 34, borderRadius: '50%',
            background: `radial-gradient(circle at 50% 32%, ${kit}, ${isGK ? '#0f7a35' : '#b62520'})`,
            border: `2px solid ${ring}`,
            boxShadow: misfit ? '0 0 0 2px var(--danger), 0 2px 0 0 var(--ink-black)' : '0 2px 0 0 var(--ink-black), 0 3px 5px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 13, color: 'var(--line-white)', textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}>{Math.round(card.power)}</span>
          {/* position dot — red if the card can't play this slot */}
          <span className="absolute" style={{ bottom: -2, left: -2, width: 11, height: 11, borderRadius: '50%', background: misfit ? 'var(--danger)' : posColor!, border: '1.5px solid var(--ink-black)' }} />
          {/* injured marker */}
          {card.injured && (
            <span className="absolute" style={{ top: -4, left: -4, width: 13, height: 13, borderRadius: '50%', background: 'var(--danger)', border: '1.5px solid var(--ink-black)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 8, lineHeight: '10px', textAlign: 'center' }}>+</span>
          )}
          {/* inspect pip (tap chip = swap; this = inspect) */}
          <span
            role="button"
            aria-label={`Inspect ${lastName(card.name)}`}
            onClick={(e) => { e.stopPropagation(); onInspect?.(); }}
            className="absolute flex items-center justify-center"
            style={{ bottom: -3, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--surface)', border: '1.5px solid var(--line-white)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1 }}
          >
            i
          </span>
        </div>
      ) : (
        <div className="slot-pulse flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(7,16,11,0.45)', border: '2px dashed rgba(242,246,239,0.7)' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'rgba(242,246,239,0.9)', lineHeight: 1 }}>+</span>
        </div>
      )}
      {card && <FitnessBar card={card} width={30} />}
      <span
        className="truncate text-center"
        style={{ width: 54, marginTop: 2, fontSize: card ? 8.5 : 7.5, fontWeight: card ? 700 : 400, fontFamily: card ? 'inherit' : PIXEL, letterSpacing: card ? 0 : 0.5, color: 'var(--line-white)', textShadow: '0 1px 2px rgba(0,0,0,0.85)', lineHeight: 1.1 }}
      >
        {card ? lastName(card.name) : slot.label.toUpperCase()}
      </span>
    </button>
  );
}

function ActionBtn({ label, accent, onClick }: { label: string; accent: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-surface sheen active:scale-95 relative overflow-hidden"
      style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: accent, padding: '6px 9px', borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)', transition: 'transform 0.12s ease' }}
    >
      <span className="relative" style={{ zIndex: 2 }}>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Player picker — eligible+fresh first; shows fitness on each card.
// ---------------------------------------------------------------------------
function PlayerSheet({
  available, activeSlot, onPick, onInspect,
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
      return effectiveStrength(b) - effectiveStrength(a);
    });
  }, [available, activeSlot]);

  return (
    <div className="grid grid-cols-3 gap-2 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {sorted.map((c) => {
        const eligible = !activeSlot || positionFitsSlot(c.position, activeSlot);
        return (
          <div key={c.id} className="relative" style={{ minWidth: 0 }}>
            <GameCard model={{ variant: 'player', card: c }} dimmed={!eligible} onClick={() => onPick(c.id)} ariaLabel={`Pick ${c.name}`} />
            {/* fitness strip across the bottom of the card */}
            <div className="absolute left-0 right-0" style={{ bottom: 0, padding: '0 2px 2px' }}>
              <FitnessBar card={c} />
            </div>
            <span
              role="button"
              aria-label={`Inspect ${c.name}`}
              onClick={(e) => { e.stopPropagation(); onInspect(c); }}
              className="absolute flex items-center justify-center active:scale-90"
              style={{ top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: 'var(--surface)', border: '1.5px solid var(--line-white)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 9, lineHeight: 1, zIndex: 2 }}
            >
              i
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FormationSheet({ formations, current, onPick }: { formations: Formation[]; current: string; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 overflow-y-auto px-3 pt-1 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
      {formations.map((f) => {
        const on = f.id === current;
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            className={`text-left active:scale-[0.98] relative overflow-hidden ${on ? 'glass-raised sheen glow-edge' : 'glass-surface sheen'}`}
            style={{ border: on ? '1px solid var(--kit-blue)' : undefined, borderRadius: 'var(--radius-sm)', padding: '10px 11px', boxShadow: on ? 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-2)' : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)', transition: 'transform 0.1s ease', minWidth: 0, ...(on ? { ['--glow' as string]: 'var(--glow-rare)' } : {}) }}
          >
            <span className="relative" style={{ fontFamily: PIXEL, fontSize: 15, color: on ? 'var(--kit-blue)' : 'var(--cream)', lineHeight: 1, zIndex: 2 }}>{f.name}</span>
            <p className="relative" style={{ fontSize: 9, lineHeight: 1.35, color: 'var(--dust)', margin: '5px 0 0', zIndex: 2 }}>{f.description}</p>
          </button>
        );
      })}
    </div>
  );
}
