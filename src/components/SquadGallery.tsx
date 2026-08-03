'use client';

/**
 * Kickoff Clash — squad collection overlay.
 *
 * Browse mode now opens the shared 18-card deck builder. Sell mode keeps the
 * transfer gallery so the store can still inspect and sell owned players.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import { getTransferFee } from '../lib/economy';
import {
  ACTIVE_DECK_SIZE,
  loadActiveDeckIds,
  saveActiveDeckIds,
} from '../lib/active-deck';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import RosterCanvas from './RosterCanvas';
import DeckBuilderScreen from './deck-builder/DeckBuilderScreen';
import { PIXEL } from './cards/cardTokens';

interface SquadGalleryProps {
  deck: Card[];
  onClose: () => void;
  title?: string;
  /**
   * Optional SELL MODE. When provided, every card in the grid gains a transfer fee
   * + a Sell button; tapping Sell raises an in-gallery confirm step before firing
   * this callback. When omitted, this entry opens the active-deck builder.
   */
  onSellCard?: (card: Card) => void;
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

export default function SquadGallery(props: SquadGalleryProps) {
  if (!props.onSellCard) {
    return <DeckBuilderGallery deck={props.deck} onClose={props.onClose} />;
  }

  return <SellableSquadGallery {...props} onSellCard={props.onSellCard} />;
}

function DeckBuilderGallery({ deck, onClose }: { deck: Card[]; onClose: () => void }) {
  const fallbackIds = useMemo(
    () => deck.slice(0, ACTIVE_DECK_SIZE).map((card) => card.id),
    [deck],
  );
  const [initialIds, setInitialIds] = useState<number[]>(fallbackIds);

  useEffect(() => {
    setInitialIds(loadActiveDeckIds(deck, fallbackIds));
  }, [deck, fallbackIds]);

  return (
    <DeckBuilderScreen
      key={initialIds.join(':')}
      collection={deck}
      initialDeckIds={initialIds}
      onCancel={onClose}
      onSave={(ids) => {
        saveActiveDeckIds(ids);
        onClose();
      }}
    />
  );
}

function SellableSquadGallery({
  deck,
  onClose,
  title = 'SQUAD',
  onSellCard,
}: SquadGalleryProps & { onSellCard: (card: Card) => void }) {
  const [group, setGroup] = useState('all');
  const [sort, setSort] = useState<SortKey>('power');
  const [view, setView] = useState<'grid' | 'roster'>('grid');
  const [modal, setModal] = useState<GameCardModel | null>(null);
  const [sellConfirm, setSellConfirm] = useState<Card | null>(null);
  const sellMode = true;
  const rosterView = view === 'roster' && !sellMode;

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
      <div className="shrink-0 flex items-center gap-2 px-3">
        <div className="flex flex-col mr-auto min-w-0">
          <span
            className="uppercase truncate"
            style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
          >
            {title}
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 1, color: 'var(--gold)', marginTop: 2 }}>
            {cards.length} CARDS · TAP SELL FOR CASH
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

        {!sellMode && (
          <div className="flex ml-auto" style={{ borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', overflow: 'hidden' }}>
            {(['grid', 'roster'] as const).map((v) => {
              const on = view === v;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="active:scale-95"
                  style={{
                    fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, padding: '5px 10px',
                    background: on ? 'var(--amber)' : 'var(--surface)',
                    color: on ? 'var(--ink-black)' : 'var(--cream-soft)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {v === 'grid' ? 'GRID' : 'ROSTER'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={`flex-1 min-h-0 overflow-y-auto pb-2 ${rosterView ? '' : 'px-3 pt-2.5'}`}
        style={{ overscrollBehavior: 'contain' }}
      >
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)', letterSpacing: 0.5 }}>NO CARDS HERE</span>
          </div>
        ) : rosterView ? (
          <RosterCanvas cards={cards} onInspect={(c) => setModal({ variant: 'player', card: c })} title={title} />
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {cards.map((c, i) => (
              <div key={c.id} className="flex flex-col" style={{ gap: 5 }}>
                <GameCard
                  model={{ variant: 'player', card: c }}
                  onClick={() => setModal({ variant: 'player', card: c })}
                  delay={Math.min(i, 11) * 18}
                  ariaLabel={`Inspect ${c.name}`}
                />
                <button
                  onClick={() => setSellConfirm(c)}
                  className="active:scale-95"
                  style={{
                    height: 40,
                    borderRadius: 'var(--radius-sm)',
                    border: '2px solid var(--ink-black)',
                    background: 'rgba(232,54,47,0.18)',
                    boxShadow: '0 2px 0 0 var(--ink-black)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.4, color: 'var(--cream)', textTransform: 'uppercase' }}>
                    Sell
                  </span>
                  <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--kit-red)' }}>
                    {'£'}{getTransferFee(c).toLocaleString()}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sellConfirm && (
        <div
          className="absolute inset-0 flex flex-col justify-end scrim-fade"
          style={{ background: 'rgba(2,9,5,0.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 60 }}
          onClick={() => setSellConfirm(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderTop: '1px solid var(--glass-border)',
              borderTopLeftRadius: 'var(--radius-lg)',
              borderTopRightRadius: 'var(--radius-lg)',
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)',
              padding: '14px 16px max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            <div className="flex flex-col items-center" style={{ gap: 14 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Confirm Sale
              </span>
              <div style={{ width: 118 }}>
                <GameCard model={{ variant: 'player', card: sellConfirm }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--cream-soft)', textAlign: 'center', lineHeight: 1.4 }}>
                Sell <b style={{ color: 'var(--cream)' }}>{sellConfirm.name}</b> for{' '}
                <b style={{ color: 'var(--gold)' }}>{'£'}{getTransferFee(sellConfirm).toLocaleString()}</b>?
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setSellConfirm(null)}
                  className="flex-1 glass-raised sheen active:scale-[0.98] relative overflow-hidden"
                  style={{
                    height: 46, borderRadius: 'var(--radius-sm)',
                    boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
                    fontFamily: PIXEL, fontSize: 11, letterSpacing: 0.4, color: 'var(--cream)', textTransform: 'uppercase',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onSellCard(sellConfirm); setSellConfirm(null); }}
                  className="flex-1 sheen-strong active:scale-[0.98] relative overflow-hidden"
                  style={{
                    height: 46, borderRadius: 'var(--radius-sm)',
                    border: '2px solid var(--ink-black)',
                    background: 'linear-gradient(135deg, var(--kit-red), #c0241e)',
                    boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), 0 2px 0 0 var(--ink-black)',
                    fontFamily: PIXEL, fontSize: 11, letterSpacing: 0.4, color: 'var(--line-white)', textTransform: 'uppercase',
                  }}
                >
                  Confirm Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
