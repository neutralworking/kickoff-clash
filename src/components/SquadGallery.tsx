'use client';

/**
 * Kickoff Clash — Squad Gallery.
 *
 * A full-screen overlay that shows EVERY owned card (RunState.deck) in a filter/sort
 * grid, tap → CardModal inspect. The collection/mastery surface the game was missing —
 * the player can finally see their whole squad. Reusable: opened from the Team Talk and
 * the Shop (and anywhere with a deck). Obeys the no-page-scroll law — only the grid
 * scrolls internally; header + controls are fixed.
 */

import { useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL } from './cards/cardTokens';

interface SquadGalleryProps {
  deck: Card[];
  onClose: () => void;
  title?: string;
}

const POS_GROUPS: { id: string; label: string; positions: string[] }[] = [
  { id: 'all', label: 'ALL', positions: [] },
  { id: 'GK', label: 'GK', positions: ['GK'] },
  { id: 'DEF', label: 'DEF', positions: ['CD', 'WD'] },
  { id: 'MID', label: 'MID', positions: ['DM', 'CM', 'AM', 'WM'] },
  { id: 'ATT', label: 'ATT', positions: ['WF', 'CF'] },
];

type SortKey = 'power' | 'fitness' | 'rarity' | 'position';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'power', label: 'PWR' },
  { id: 'fitness', label: 'FIT' },
  { id: 'rarity', label: 'RARE' },
  { id: 'position', label: 'POS' },
];

const RARITY_ORDER: Record<string, number> = { Legendary: 0, Epic: 1, Rare: 2, Common: 3 };
const POSITION_ORDER: Record<string, number> = { GK: 0, CD: 1, WD: 2, DM: 3, CM: 4, AM: 5, WM: 6, WF: 7, CF: 8 };
const fitnessOf = (c: Card): number => c.fitness ?? (c.injured ? 33 : 100);

export default function SquadGallery({ deck, onClose, title = 'SQUAD' }: SquadGalleryProps) {
  const [group, setGroup] = useState('all');
  const [sort, setSort] = useState<SortKey>('power');
  const [modal, setModal] = useState<GameCardModel | null>(null);

  const cards = useMemo(() => {
    const groupPositions = POS_GROUPS.find((g) => g.id === group)?.positions ?? [];
    const filtered = groupPositions.length ? deck.filter((c) => groupPositions.includes(c.position)) : deck;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'fitness':
          return fitnessOf(b) - fitnessOf(a) || b.power - a.power;
        case 'rarity':
          return (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) || b.power - a.power;
        case 'position':
          return (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9) || b.power - a.power;
        default:
          return b.power - a.power;
      }
    });
    return sorted;
  }, [deck, group, sort]);

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden phase-setup"
      style={{
        zIndex: 55,
        background: 'var(--felt)',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3">
        <div className="flex flex-col mr-auto min-w-0">
          <span
            className="uppercase truncate"
            style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
          >
            {title}
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
            {cards.length}/{deck.length} CARDS
          </span>
        </div>
        <button
          onClick={onClose}
          className="active:scale-95 shrink-0 glass-surface"
          style={{
            fontFamily: PIXEL, fontSize: 12, letterSpacing: 0.5, color: 'var(--cream)',
            height: 38, padding: '0 14px', borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--ink-black)', boxShadow: 'var(--depth-1)',
          }}
        >
          CLOSE
        </button>
      </div>

      {/* ── Filter (position groups) ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 mt-2">
        {POS_GROUPS.map((g) => {
          const on = group === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className={`active:scale-95 ${on ? '' : 'glass-surface'}`}
              style={{
                flex: 1, height: 30, borderRadius: 'var(--radius-sm)',
                fontFamily: PIXEL, fontSize: 9.5, letterSpacing: 0.5,
                color: on ? 'var(--ink-black)' : 'var(--cream-soft)',
                background: on ? 'var(--amber)' : undefined,
                border: '2px solid var(--ink-black)',
                boxShadow: on ? '0 2px 0 0 var(--ink-black)' : undefined,
                transition: 'transform 0.12s ease',
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* ── Sort ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 mt-1.5">
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>SORT</span>
        <div className="flex" style={{ borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', overflow: 'hidden' }}>
          {SORTS.map((s) => {
            const on = sort === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className="active:scale-95"
                style={{
                  fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, padding: '5px 10px',
                  background: on ? 'var(--kit-blue)' : 'var(--surface)',
                  color: on ? 'var(--line-white)' : 'var(--cream-soft)',
                  transition: 'background 0.15s ease',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Grid (the only scroller) ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2.5 pb-2" style={{ overscrollBehavior: 'contain' }}>
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)', letterSpacing: 0.5 }}>NO CARDS HERE</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {cards.map((c, i) => (
              <GameCard
                key={c.id}
                model={{ variant: 'player', card: c }}
                onClick={() => setModal({ variant: 'player', card: c })}
                delay={Math.min(i, 11) * 18}
                ariaLabel={`Inspect ${c.name}`}
              />
            ))}
          </div>
        )}
      </div>

      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
