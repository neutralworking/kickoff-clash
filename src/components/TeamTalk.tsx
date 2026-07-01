'use client';

/**
 * Kickoff Clash — Team Talk (pre-match).
 *
 * Shown before every tie AFTER the run-start draft (between ties in a cup, and on the
 * first tie of each new cup). Fitness carries forward across a cup, so this is where the
 * player reviews condition and adjusts the XI / shape / intent before kickoff — with a
 * fitness-aware auto-fill default so a casual player just hits CONFIRM.
 *
 * The screen is an information layer: it surfaces the opponent read (style + soft-spot
 * and whether you carry a counter), a chemistry signal, the XI shape with per-player
 * position / rating / fitness, and — the headline read — a bench where every sub shows
 * the POSITION it covers, so subbing is never blind.
 *
 * Reuses the pure team-select logic (autoFill / autoFillXI / effectiveStrength /
 * positionFitsSlot) and writes back only the lineup levers the match reads
 * (startingXI / benchIds / activeFormation / intent). It never touches jokers/tactics,
 * so the localStorage round-trip is unaffected.
 */

import { useMemo, useState } from 'react';
import type { Card, SlottedCard } from '../lib/scoring';
import type { Formation } from '../lib/formations';
import { getFormation, positionFitsSlot } from '../lib/formations';
import type { RunState, TeamIntent } from '../lib/run';
import { cupSize, isCupFinal, getOpponentBuild } from '../lib/run';
import { findConnections } from '../lib/chemistry';
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
import { PIXEL, lastName } from './cards/cardTokens';
import {
  PosTag,
  FitnessBar,
  BenchTile,
  BenchCover,
  LineupSlot,
  fitnessOf,
  archShort,
} from './lineup';

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
  const [showOpp, setShowOpp] = useState(false);

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
  const benchCards = useMemo(
    () => sel.bench.map((id) => byId.get(id)).filter((c): c is Card => !!c),
    [sel.bench, byId],
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

  // ── Opponent read (same deterministic build the engine fields) ───────────────
  const opp = useMemo(
    () => getOpponentBuild(runState.round, runState.matchInCup, runState.seed),
    [runState.round, runState.matchInCup, runState.seed],
  );
  // How many of MY cards carry the archetype the opponent is soft against → my counter.
  const counterCount = useMemo(
    () => xiCards.filter((c) => c.archetype === opp.weaknessArchetype).length,
    [xiCards, opp.weaknessArchetype],
  );

  // ── Chemistry signal: live synergy connections in the current XI ─────────────
  const connections = useMemo(() => {
    const slotted: SlottedCard[] = xiCards.map((card, i) => ({ card, slot: `slot_${i}` }));
    return findConnections(slotted);
  }, [xiCards]);
  const chemBonus = useMemo(() => connections.reduce((s, c) => s + (c.bonus || 0), 0), [connections]);

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

        <StatBadge value={xiAvg || '--'} label="AVG" />
        <StatBadge value={`+${chemBonus}`} label="CHEM" accent="var(--gold)" />

        <button
          onClick={confirm}
          disabled={!ready}
          className={`active:scale-95 shrink-0 relative overflow-hidden ${ready ? 'sheen-strong glow-edge' : 'glass-surface sheen'}`}
          style={{
            fontFamily: PIXEL, fontSize: 12.5, letterSpacing: 0.5,
            color: ready ? 'var(--line-white)' : 'var(--ink)',
            height: 44, padding: '0 12px', borderRadius: 'var(--radius-sm)',
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

      {/* ── Opponent read · soft-spot counter · chemistry ─────────────────── */}
      <div className="shrink-0 px-3 mt-2 flex items-stretch gap-1.5">
        <button
          onClick={() => setShowOpp(true)}
          className="glass-surface sheen flex flex-col justify-center px-2.5 flex-1 min-w-0 active:scale-[0.98] relative overflow-hidden text-left"
          style={{ height: 46, borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)', transition: 'transform 0.12s ease' }}
        >
          <span className="flex items-center gap-1 relative" style={{ zIndex: 2 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)' }}>NEXT UP</span>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.5, color: 'var(--kit-blue)' }}>{opp.style.toUpperCase()}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.5, color: 'var(--dust)', marginLeft: 'auto' }}>PWR {Math.round(opp.baseStrength)}</span>
          </span>
          <span className="truncate relative" style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--cream)', marginTop: 2, zIndex: 2 }}>{opp.name}</span>
        </button>

        <div
          className="glass-surface flex flex-col justify-center px-2.5 shrink-0 relative overflow-hidden"
          style={{
            width: 96, height: 46, borderRadius: 'var(--radius-sm)',
            border: `1px solid ${counterCount ? 'var(--success)' : 'var(--gold)'}`,
            boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 9px ${counterCount ? 'rgba(52,196,106,0.28)' : 'rgba(245,197,66,0.22)'}, var(--depth-1)`,
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)' }}>SOFT SPOT</span>
          <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 8.5, color: 'var(--cream-soft)', marginTop: 2 }}>{opp.weaknessArchetype}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: counterCount ? 'var(--success)' : 'var(--gold)', marginTop: 1 }}>
            {counterCount ? `${counterCount} IN XI ✓` : 'NONE — SHOP'}
          </span>
        </div>
      </div>

      {/* ── Fitness nudge bar + squad gallery entry ───────────────────────── */}
      <div className="shrink-0 px-3 mt-1.5 flex items-center gap-1.5">
        <div
          className="glass-surface flex items-center gap-2 px-2.5 flex-1 min-w-0 relative overflow-hidden"
          style={{ height: 26, borderRadius: 'var(--radius-sm)', border: `1px solid ${nudge.color}`, boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 10px ${nudge.color}33, var(--depth-1)` }}
        >
          <span className="relative" style={{ width: 8, height: 8, borderRadius: '50%', background: nudge.color, flexShrink: 0, zIndex: 2 }} />
          <span className="truncate relative" style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: nudge.color, zIndex: 2 }}>{nudge.text}</span>
        </div>
        <button
          onClick={() => setShowGallery(true)}
          className="active:scale-95 glass-surface sheen shrink-0 relative overflow-hidden"
          style={{ height: 26, padding: '0 11px', borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)', fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: 'var(--cream)' }}
        >
          <span className="relative" style={{ zIndex: 2 }}>SQUAD</span>
        </button>
      </div>

      {/* ── Control bar: shape · intent · auto/reset ──────────────────────── */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-3 mt-1.5">
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
      <div className="flex-1 min-h-0 px-3 mt-2">
        <TalkPitch
          formation={formation}
          starters={sel.starters}
          byId={byId}
          placedSlot={placedSlot}
          onSlot={(i) => setOverlay({ kind: 'slot', index: i })}
          onInspect={(card) => setModal({ variant: 'player', card })}
        />
      </div>

      {/* ── Bench — each sub reads its POSITION, rating, role, condition ───── */}
      <div className="shrink-0 px-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>BENCH {sel.bench.length}/{BENCH_SIZE}</span>
          {/* mini cover read: which lines the bench can refresh */}
          <BenchCover benchCards={benchCards} />
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${BENCH_SIZE}, minmax(0, 1fr))` }}>
          {Array.from({ length: BENCH_SIZE }).map((_, i) => {
            const cardId = sel.bench[i];
            const card = cardId != null ? byId.get(cardId) : undefined;
            return card ? (
              <BenchTile key={i} card={card} onInspect={() => setModal({ variant: 'player', card })} onRemove={() => removeBench(card.id)} />
            ) : (
              <button
                key={i}
                onClick={() => setOverlay({ kind: 'bench' })}
                className="relative flex items-center justify-center active:scale-95"
                style={{ height: 62, borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.28)', border: '2px dashed var(--border)', transition: 'transform 0.12s ease', minWidth: 0 }}
              >
                <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--ink)' }}>+</span>
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

      {/* ── Opponent dossier sheet ────────────────────────────────────────── */}
      {showOpp && (
        <OpponentSheet opp={opp} counterCount={counterCount} onClose={() => setShowOpp(false)} />
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />

      {showGallery && <SquadGallery deck={pool} onClose={() => setShowGallery(false)} title="YOUR SQUAD" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatBadge — compact glass readout used in the header (AVG / CHEM).
// ---------------------------------------------------------------------------
function StatBadge({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <div
      className="glass-surface flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
      style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 14, lineHeight: 1, color: accent ?? 'var(--line-white)' }}>{value}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TalkPitch — top-down field; each chip now reads its POSITION tag + rating.
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
          <LineupSlot
            key={i}
            slot={slot}
            card={card}
            misfit={misfit}
            showMisfit
            showFitness
            justPlaced={placedSlot === i}
            onClick={() => onSlot(i)}
            onInspect={card ? () => onInspect(card) : undefined}
          />
        );
      })}
    </div>
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
// Opponent dossier — full read of the side you face (deterministic engine build).
// ---------------------------------------------------------------------------
function OpponentSheet({ opp, counterCount, onClose }: { opp: ReturnType<typeof getOpponentBuild>; counterCount: number; onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end scrim-fade" style={{ background: 'rgba(2,9,5,0.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 45 }} onClick={onClose}>
      <div
        className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
        style={{ borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)', borderTop: '3px solid var(--kit-red)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)', maxHeight: '70%', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0 relative" style={{ zIndex: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)' }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-2 shrink-0 relative" style={{ zIndex: 2 }}>
          <div className="flex flex-col min-w-0">
            <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 14, letterSpacing: 0.5, color: 'var(--cream)' }}>{opp.name}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--kit-blue)', marginTop: 2 }}>{opp.style.toUpperCase()} {'·'} {opp.formation} {'·'} PWR {Math.round(opp.baseStrength)}</span>
          </div>
          <button onClick={onClose} className="glass-surface active:scale-90 relative overflow-hidden" style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>CLOSE</button>
        </div>

        <div className="overflow-y-auto px-3 pb-2 relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
          {/* Read panels */}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <div className="glass-surface relative overflow-hidden" style={{ borderRadius: 'var(--radius-sm)', padding: '7px 9px', border: '1px solid var(--gold)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>SOFT SPOT</span>
              <p style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--cream)', margin: '3px 0 0' }}>{opp.weakness}</p>
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: counterCount ? 'var(--success)' : 'var(--gold)' }}>
                Punish with {opp.weaknessArchetype} {'·'} {counterCount ? `${counterCount} in your XI` : 'none yet'}
              </span>
            </div>
            <div className="glass-surface relative overflow-hidden" style={{ borderRadius: 'var(--radius-sm)', padding: '7px 9px', border: '1px solid var(--kit-red)', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>DANGER MAN</span>
              <p className="truncate" style={{ fontSize: 10.5, color: 'var(--cream)', margin: '3px 0 0' }}>{opp.starPlayer?.name}</p>
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--cream-soft)' }}>{archShort(opp.starPlayer?.archetype)} {opp.starPlayer ? Math.round(opp.starPlayer.power) : ''} {'·'} {opp.starAbility}</span>
            </div>
          </div>

          {/* Their XI by position */}
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>THEIR XI</span>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {opp.xi.map((p, i) => (
              <div key={i} className="glass-surface flex items-center gap-1.5 relative overflow-hidden" style={{ borderRadius: 'var(--radius-sm)', padding: '5px 7px', boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)' }}>
                <PosTag position={p.position} />
                <span className="truncate" style={{ fontSize: 9.5, color: 'var(--cream-soft)', flex: 1, minWidth: 0 }}>{lastName(p.name)}</span>
                <span style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--line-white)' }}>{Math.round(p.power)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
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
