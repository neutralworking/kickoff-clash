'use client';

import { useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import type { PackContents } from '../lib/packs';
import type { JokerCard } from '../lib/jokers';
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

const INTENTS: { id: TeamIntent; label: string; hint: string }[] = [
  { id: 'attacking', label: 'Attacking', hint: 'Push numbers forward' },
  { id: 'balanced', label: 'Balanced', hint: 'Even shape' },
  { id: 'defensive', label: 'Defensive', hint: 'Sit deeper, stay compact' },
];

const RARITY_COLOR: Record<string, string> = {
  Common: '#9a8b73',
  Rare: '#5fa8d3',
  Epic: '#a78bfa',
  Legendary: '#e8a23a',
};

function lastName(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1];
}

type Target = { kind: 'slot'; index: number } | { kind: 'bench' } | null;

export default function TeamSelect({ contents, onConfirm }: TeamSelectProps) {
  const pool = contents.players;
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(contents.formations[0]?.id ?? '4-3-3');
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => emptySelection(formation));
  const [target, setTarget] = useState<Target>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [intent, setIntent] = useState<TeamIntent>('balanced');

  const usedIds = useMemo(
    () => new Set<number>([...sel.starters.filter((x): x is number => x != null), ...sel.bench]),
    [sel],
  );
  const available = useMemo(
    () => pool.filter((c) => !usedIds.has(c.id)).sort((a, b) => b.power - a.power),
    [pool, usedIds],
  );

  const filled = startersFilled(sel);
  const ready = filled === formation.slots.length && managerId !== null;

  // --- placement helpers ---
  function placeCard(cardId: number) {
    setSel((prev) => {
      const next: XISelection = { starters: [...prev.starters], bench: [...prev.bench] };
      // strip from any existing spot first (no duplicates)
      next.starters = next.starters.map((id) => (id === cardId ? null : id));
      next.bench = next.bench.filter((id) => id !== cardId);

      if (target?.kind === 'slot') {
        next.starters[target.index] = cardId;
      } else if (target?.kind === 'bench') {
        if (next.bench.length < BENCH_SIZE) next.bench.push(cardId);
      } else {
        const empty = next.starters.findIndex((id) => id == null);
        if (empty >= 0) next.starters[empty] = cardId;
        else if (next.bench.length < BENCH_SIZE) next.bench.push(cardId);
      }
      return next;
    });
    setTarget(null);
  }

  function clearSlot(index: number) {
    setSel((prev) => {
      const starters = [...prev.starters];
      starters[index] = null;
      return { ...prev, starters };
    });
  }

  function removeBench(cardId: number) {
    setSel((prev) => ({ ...prev, bench: prev.bench.filter((id) => id !== cardId) }));
  }

  function runAuto(mode: 'all' | 'empty') {
    setSel((prev) => autoFill(pool, formation, prev, mode));
    setTarget(null);
  }

  function confirm() {
    if (!ready) return;
    onConfirm({
      players: pool,
      startingXI: sel.starters.filter((x): x is number => x != null),
      benchIds: sel.bench,
      manager: contents.managers.find((m) => m.id === managerId) ?? null,
      tactics: contents.tactics,
      formationId,
      intent,
    });
  }

  return (
    <div className="flex flex-col items-center min-h-screen px-3 py-5" style={{ background: 'var(--felt)' }}>
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between mb-3">
        <h1 className="text-2xl uppercase tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
          Team Selection
        </h1>
        <button
          onClick={confirm}
          disabled={!ready}
          className="px-4 py-2 rounded-[var(--radius)] text-sm uppercase tracking-wide transition-all active:scale-95"
          style={{
            fontFamily: 'var(--font-display)',
            background: ready ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : 'var(--leather)',
            color: ready ? 'var(--cream)' : 'var(--dust)',
            boxShadow: ready ? '0 4px 16px var(--amber-glow)' : 'none',
            opacity: ready ? 1 : 0.5,
            cursor: ready ? 'pointer' : 'not-allowed',
          }}
        >
          Kick Off →
        </button>
      </div>

      {/* Intent + formation */}
      <div className="w-full max-w-md flex gap-2 mb-3">
        <div className="flex-1 flex gap-1">
          {INTENTS.map((it) => {
            const on = intent === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setIntent(it.id)}
                title={it.hint}
                className="flex-1 py-1.5 rounded-[8px] text-[11px] font-bold uppercase tracking-wide transition-all"
                style={{
                  fontFamily: 'var(--font-body)',
                  background: on ? 'rgba(232,98,26,0.18)' : 'var(--leather)',
                  border: `1px solid ${on ? 'var(--amber)' : 'rgba(154,139,115,0.2)'}`,
                  color: on ? 'var(--amber)' : 'var(--cream-soft)',
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
        <select
          value={formationId}
          onChange={(e) => setFormationId(e.target.value)}
          className="rounded-[8px] px-2 text-sm"
          style={{ background: 'var(--leather)', color: 'var(--cream)', border: '1px solid rgba(154,139,115,0.3)', fontFamily: 'var(--font-display)' }}
        >
          {contents.formations.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Pitch */}
      <div
        className="w-full max-w-md relative rounded-[12px] mb-2"
        style={{
          height: 360,
          background: 'linear-gradient(0deg, rgba(20,60,30,0.55), rgba(30,80,40,0.45))',
          border: '1px solid rgba(212,160,53,0.18)',
        }}
      >
        {formation.slots.map((slot, i) => {
          const cardId = sel.starters[i];
          const card = cardId != null ? byId.get(cardId) : undefined;
          const active = target?.kind === 'slot' && target.index === i;
          return (
            <button
              key={i}
              onClick={() => (card ? clearSlot(i) : setTarget(active ? null : { kind: 'slot', index: i }))}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-all"
              style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: 58 }}
            >
              <div
                className="flex items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  width: 38,
                  height: 38,
                  background: card ? 'var(--leather)' : active ? 'rgba(232,98,26,0.25)' : 'rgba(0,0,0,0.3)',
                  border: `2px solid ${active ? 'var(--amber)' : card ? RARITY_COLOR[card.rarity] ?? 'var(--gold)' : 'rgba(245,240,232,0.35)'}`,
                  color: card ? 'var(--cream)' : 'var(--dust)',
                  boxShadow: active ? '0 0 12px var(--amber-glow)' : 'none',
                }}
              >
                {card ? Math.round(card.power) : slot.label.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </div>
              <div className="text-[9px] mt-0.5 leading-none text-center" style={{ color: card ? 'var(--cream-soft)' : 'var(--dust)', maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 58 }}>
                {card ? lastName(card.name) : slot.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Auto controls */}
      <div className="w-full max-w-md flex gap-2 mb-3 text-[11px]">
        <span style={{ color: 'var(--dust)', fontFamily: 'var(--font-body)' }} className="self-center mr-auto">
          XI {filled}/{formation.slots.length} · Bench {sel.bench.length}/{BENCH_SIZE}
        </span>
        <button onClick={() => runAuto('all')} className="px-3 py-1.5 rounded-[8px] font-bold uppercase tracking-wide" style={{ background: 'var(--leather)', color: 'var(--gold)', border: '1px solid rgba(212,160,53,0.3)' }}>Auto-Pick All</button>
        <button onClick={() => runAuto('empty')} className="px-3 py-1.5 rounded-[8px] font-bold uppercase tracking-wide" style={{ background: 'var(--leather)', color: 'var(--gold)', border: '1px solid rgba(212,160,53,0.3)' }}>Fill Empty</button>
        <button onClick={() => { setSel(emptySelection(formation)); setTarget(null); }} className="px-3 py-1.5 rounded-[8px] font-bold uppercase tracking-wide" style={{ background: 'var(--leather)', color: 'var(--dust)', border: '1px solid rgba(154,139,115,0.2)' }}>Clear</button>
      </div>

      {/* Bench */}
      <div className="w-full max-w-md mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--dust)' }}>Bench (subs)</div>
        <button
          onClick={() => setTarget(target?.kind === 'bench' ? null : { kind: 'bench' })}
          className="w-full flex gap-1.5 flex-wrap rounded-[8px] p-1.5"
          style={{ background: target?.kind === 'bench' ? 'rgba(232,98,26,0.12)' : 'rgba(0,0,0,0.18)', border: `1px solid ${target?.kind === 'bench' ? 'var(--amber)' : 'rgba(154,139,115,0.15)'}`, minHeight: 44 }}
        >
          {Array.from({ length: BENCH_SIZE }).map((_, i) => {
            const cardId = sel.bench[i];
            const card = cardId != null ? byId.get(cardId) : undefined;
            return (
              <span
                key={i}
                onClick={(e) => { if (card) { e.stopPropagation(); removeBench(card.id); } }}
                className="flex items-center justify-center rounded-[6px] text-[10px] font-semibold"
                style={{ width: 44, height: 32, background: card ? 'var(--leather)' : 'rgba(0,0,0,0.25)', border: `1px solid ${card ? RARITY_COLOR[card.rarity] ?? 'var(--gold)' : 'rgba(245,240,232,0.15)'}`, color: card ? 'var(--cream)' : 'var(--dust)' }}
              >
                {card ? lastName(card.name).slice(0, 5) : '—'}
              </span>
            );
          })}
        </button>
      </div>

      {/* Manager */}
      <div className="w-full max-w-md mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--dust)' }}>Manager (pick one)</div>
        <div className="flex gap-2">
          {contents.managers.map((m: JokerCard) => {
            const on = managerId === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setManagerId(on ? null : m.id)}
                className="flex-1 text-left rounded-[10px] p-2.5 transition-all"
                style={{ background: 'var(--leather)', border: `2px solid ${on ? 'var(--amber)' : 'rgba(154,139,115,0.2)'}`, boxShadow: on ? '0 0 12px var(--amber-glow)' : 'none' }}
              >
                <div className="text-sm" style={{ fontFamily: 'var(--font-display)', color: on ? 'var(--amber)' : 'var(--cream)' }}>{m.name}</div>
                <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--cream-soft)', fontFamily: 'var(--font-body)' }}>{m.effect}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Player pool */}
      <div className="w-full max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--dust)' }}>
          Available players ({available.length})
          {target?.kind === 'slot' && <span style={{ color: 'var(--amber)' }}> · tap a player for the highlighted slot</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {available.map((c: Card) => {
            const eligible = target?.kind !== 'slot' || positionFitsSlot(c.position, formation.slots[target.index]);
            return (
              <button
                key={c.id}
                onClick={() => placeCard(c.id)}
                className="text-left rounded-[8px] p-1.5 transition-all active:scale-95"
                style={{
                  background: 'var(--leather)',
                  border: `1px solid ${RARITY_COLOR[c.rarity] ?? 'rgba(154,139,115,0.25)'}`,
                  opacity: eligible ? 1 : 0.4,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold truncate" style={{ color: 'var(--cream)', fontFamily: 'var(--font-body)' }}>{lastName(c.name)}</span>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--gold)' }}>{Math.round(c.power)}</span>
                </div>
                <div className="text-[9px]" style={{ color: 'var(--dust)' }}>{c.position} · {c.archetype}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
