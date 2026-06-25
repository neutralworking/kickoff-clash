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

const INTENTS: { id: TeamIntent; label: string }[] = [
  { id: 'attacking', label: 'Att' },
  { id: 'balanced', label: 'Bal' },
  { id: 'defensive', label: 'Def' },
];

const RARITY_COLOR: Record<string, string> = {
  Common: '#9a8b73', Rare: '#5fa8d3', Epic: '#a78bfa', Legendary: '#e8a23a',
};

function lastName(name: string): string {
  const p = name.trim().split(' ');
  return p[p.length - 1];
}

type Overlay = { kind: 'slot'; index: number } | { kind: 'bench' } | { kind: 'manager' } | null;

export default function TeamSelect({ contents, onConfirm }: TeamSelectProps) {
  const pool = contents.players;
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [formationId, setFormationId] = useState(contents.formations[0]?.id ?? '4-3-3');
  const formation: Formation = getFormation(formationId);

  const [sel, setSel] = useState<XISelection>(() => emptySelection(formation));
  const [managerId, setManagerId] = useState<string | null>(null);
  const [intent, setIntent] = useState<TeamIntent>('balanced');
  const [overlay, setOverlay] = useState<Overlay>(null);

  const usedIds = useMemo(
    () => new Set<number>([...sel.starters.filter((x): x is number => x != null), ...sel.bench]),
    [sel],
  );
  const available = useMemo(
    () => pool.filter((c) => !usedIds.has(c.id)).sort((a, b) => b.power - a.power),
    [pool, usedIds],
  );

  const filled = startersFilled(sel);
  const manager = contents.managers.find((m) => m.id === managerId) ?? null;
  const ready = filled === formation.slots.length && manager !== null;

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
    setOverlay(null);
  }

  function clearSlot(i: number) {
    setSel((prev) => { const s = [...prev.starters]; s[i] = null; return { ...prev, starters: s }; });
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
    <div className="flex flex-col overflow-hidden relative" style={{ height: '100dvh', background: 'var(--felt)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <span className="text-base uppercase tracking-tight mr-auto" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>Team Selection</span>
        <select
          value={formationId}
          onChange={(e) => { setFormationId(e.target.value); setSel(emptySelection(getFormation(e.target.value))); }}
          className="rounded-[7px] px-2 py-1 text-sm"
          style={{ background: 'var(--leather)', color: 'var(--cream)', border: '1px solid rgba(154,139,115,0.3)', fontFamily: 'var(--font-display)' }}
        >
          {contents.formations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button
          onClick={confirm}
          disabled={!ready}
          className="px-3 py-1.5 rounded-[8px] text-sm uppercase tracking-wide active:scale-95"
          style={{
            fontFamily: 'var(--font-display)',
            background: ready ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : 'var(--leather)',
            color: ready ? 'var(--cream)' : 'var(--dust)',
            opacity: ready ? 1 : 0.5,
          }}
        >Kick Off →</button>
      </div>

      {/* Controls: intent · manager · auto */}
      <div className="flex items-center gap-1.5 px-3 pb-2 shrink-0">
        <div className="flex rounded-[7px] overflow-hidden" style={{ border: '1px solid rgba(154,139,115,0.25)' }}>
          {INTENTS.map((it) => {
            const on = intent === it.id;
            return (
              <button key={it.id} onClick={() => setIntent(it.id)} className="px-2.5 py-1 text-[11px] font-bold uppercase"
                style={{ background: on ? 'rgba(232,98,26,0.2)' : 'transparent', color: on ? 'var(--amber)' : 'var(--cream-soft)' }}>
                {it.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => setOverlay({ kind: 'manager' })} className="flex-1 px-2 py-1 rounded-[7px] text-[11px] text-left truncate"
          style={{ background: 'var(--leather)', border: `1px solid ${manager ? 'var(--amber)' : 'rgba(154,139,115,0.25)'}`, color: manager ? 'var(--cream)' : 'var(--dust)' }}>
          {manager ? `🎩 ${manager.name}` : '🎩 Pick Manager'}
        </button>
        <button onClick={() => { setSel(autoFill(pool, formation, sel, 'all')); }} className="px-2 py-1 rounded-[7px] text-[10px] font-bold uppercase" style={{ background: 'var(--leather)', color: 'var(--gold)', border: '1px solid rgba(212,160,53,0.3)' }}>Auto</button>
        <button onClick={() => { setSel(autoFill(pool, formation, sel, 'empty')); }} className="px-2 py-1 rounded-[7px] text-[10px] font-bold uppercase" style={{ background: 'var(--leather)', color: 'var(--gold)', border: '1px solid rgba(212,160,53,0.3)' }}>Fill</button>
        <button onClick={() => setSel(emptySelection(formation))} className="px-2 py-1 rounded-[7px] text-[10px] font-bold uppercase" style={{ background: 'var(--leather)', color: 'var(--dust)', border: '1px solid rgba(154,139,115,0.2)' }}>✕</button>
      </div>

      {/* Pitch */}
      <div className="relative mx-3 rounded-[12px] flex-1 min-h-0" style={{ background: 'linear-gradient(0deg, rgba(20,60,30,0.55), rgba(30,80,40,0.42))', border: '1px solid rgba(212,160,53,0.18)' }}>
        {formation.slots.map((slot, i) => {
          const cardId = sel.starters[i];
          const card = cardId != null ? byId.get(cardId) : undefined;
          return (
            <button key={i} onClick={() => (card ? clearSlot(i) : setOverlay({ kind: 'slot', index: i }))}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: 52 }}>
              <div className="flex items-center justify-center rounded-full text-[11px] font-bold"
                style={{ width: 34, height: 34, background: card ? 'var(--leather)' : 'rgba(0,0,0,0.32)', border: `2px solid ${card ? RARITY_COLOR[card.rarity] ?? 'var(--gold)' : 'rgba(245,240,232,0.35)'}`, color: card ? 'var(--cream)' : 'var(--dust)' }}>
                {card ? Math.round(card.power) : '+'}
              </div>
              <div className="text-[8px] mt-0.5 leading-none text-center" style={{ color: card ? 'var(--cream-soft)' : 'var(--dust)', width: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card ? lastName(card.name) : slot.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bench */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wide shrink-0 mr-1" style={{ color: 'var(--dust)' }}>Bench</span>
          {Array.from({ length: BENCH_SIZE }).map((_, i) => {
            const cardId = sel.bench[i];
            const card = cardId != null ? byId.get(cardId) : undefined;
            return (
              <button key={i} onClick={() => (card ? removeBench(card.id) : setOverlay({ kind: 'bench' }))}
                className="flex-1 flex items-center justify-center rounded-[6px] text-[9px] font-semibold"
                style={{ height: 30, background: card ? 'var(--leather)' : 'rgba(0,0,0,0.25)', border: `1px solid ${card ? RARITY_COLOR[card.rarity] ?? 'var(--gold)' : 'rgba(245,240,232,0.15)'}`, color: card ? 'var(--cream)' : 'var(--dust)', minWidth: 0 }}>
                <span className="truncate px-0.5">{card ? lastName(card.name) : '+'}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[9px] text-center mt-1" style={{ color: 'var(--dust)' }}>
          XI {filled}/{formation.slots.length} · Bench {sel.bench.length}/{BENCH_SIZE} · {available.length} cut
        </div>
      </div>

      {/* Overlay: player or manager picker */}
      {overlay && (
        <div className="absolute inset-0 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOverlay(null)}>
          <div className="rounded-t-[16px] p-3 flex flex-col" style={{ background: 'var(--felt)', border: '1px solid rgba(212,160,53,0.25)', maxHeight: '62%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-sm uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
                {overlay.kind === 'manager' ? 'Pick Manager' : overlay.kind === 'bench' ? 'Add to Bench' : `Fill ${activeSlot?.label}`}
              </span>
              <button onClick={() => setOverlay(null)} className="text-xs px-2 py-1 rounded-[6px]" style={{ color: 'var(--dust)' }}>Close</button>
            </div>

            {overlay.kind === 'manager' ? (
              <div className="flex flex-col gap-2 overflow-y-auto">
                {contents.managers.map((m) => {
                  const on = managerId === m.id;
                  return (
                    <button key={m.id} onClick={() => { setManagerId(m.id); setOverlay(null); }} className="text-left rounded-[10px] p-3"
                      style={{ background: 'var(--leather)', border: `2px solid ${on ? 'var(--amber)' : 'rgba(154,139,115,0.2)'}` }}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-base" style={{ fontFamily: 'var(--font-display)', color: on ? 'var(--amber)' : 'var(--cream)' }}>{m.name}</span>
                        {m.nation && <span className="text-[10px]" style={{ color: 'var(--dust)' }}>{m.nation}</span>}
                      </div>
                      <div className="text-[11px] italic mt-0.5" style={{ fontFamily: 'var(--font-flavour)', color: 'var(--cream-soft)' }}>“{m.philosophy}”</div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {m.traits.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(212,160,53,0.14)', color: 'var(--gold)', border: '1px solid rgba(212,160,53,0.25)' }}>{t}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 overflow-y-auto">
                {[...available]
                  .sort((a, b) => {
                    if (!activeSlot) return 0;
                    const ea = positionFitsSlot(a.position, activeSlot) ? 0 : 1;
                    const eb = positionFitsSlot(b.position, activeSlot) ? 0 : 1;
                    return ea - eb;
                  })
                  .map((c: Card) => {
                    const eligible = !activeSlot || positionFitsSlot(c.position, activeSlot);
                    return (
                      <button key={c.id} onClick={() => placeInOverlay(c.id)} className="text-left rounded-[8px] p-1.5 active:scale-95"
                        style={{ background: 'var(--leather)', border: `1px solid ${RARITY_COLOR[c.rarity] ?? 'rgba(154,139,115,0.25)'}`, opacity: eligible ? 1 : 0.45 }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold truncate" style={{ color: 'var(--cream)' }}>{lastName(c.name)}</span>
                          <span className="text-[11px] font-bold ml-1" style={{ color: 'var(--gold)' }}>{Math.round(c.power)}</span>
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--dust)' }}>{c.position} · {c.archetype}</div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
