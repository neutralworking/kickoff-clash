'use client';

import type { PointerEventHandler } from 'react';
import type { Card } from '../../lib/scoring';
import type { Formation } from '../../lib/formations';
import type { V6Card } from '../../lib/match-v6';
import { competenceOf, type Competence } from '../../lib/team-select';
import { pitchAxis } from '../../lib/pitch-layout';
import { PIXEL, POSITION_COLOR, lastName } from '../cards/cardTokens';
import { fitnessColor as fitnessColorForPct } from '../cards/portrait';
import TeamSelectionPlayerCard from '../player-cards/TeamSelectionPlayerCard';

const SLOT_CARD_W = 60;
const SLOT_CARD_H = 82;
export const SLOT_INSET_X = SLOT_CARD_W / 2 + 6;
export const SLOT_INSET_Y = SLOT_CARD_H / 2 + 5;

export function lineupPitchY(y: number): number {
  if (y >= 88) return 98;
  if (y >= 68) return 70;
  if (y >= 30) return 42;
  return 10;
}

export interface DragPointerHandlers {
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
}

export const fitnessOf = (card: Card): number => card.fitness ?? (card.injured ? 33 : 100);

export function fitnessColor(card: Card): string {
  return card.injured ? 'var(--danger)' : fitnessColorForPct(fitnessOf(card));
}

export function fitnessLabel(card: Card): string {
  if (card.injured) return 'INJ';
  const value = fitnessOf(card);
  if (value >= 75) return 'FRESH';
  if (value >= 50) return 'OK';
  if (value >= 25) return 'TIRED';
  return 'SPENT';
}

export function archShort(archetype?: string): string {
  if (!archetype) return '';
  if (archetype === 'GK' || archetype === 'Shotstopper') return 'GK';
  return archetype.slice(0, 3).toUpperCase();
}

export function PosTag({
  position,
  size = 'sm',
  misfit = false,
}: {
  position: string;
  size?: 'sm' | 'md';
  misfit?: boolean;
}) {
  const background = misfit ? 'var(--danger)' : POSITION_COLOR[position] ?? 'var(--dust)';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: size === 'md' ? '2.5px 4px' : '2px 3px',
        color: 'var(--ink-black)',
        background,
        border: '1px solid var(--ink-black)',
        borderRadius: 3,
        fontFamily: PIXEL,
        fontSize: size === 'md' ? 9 : 8,
        lineHeight: 1,
        letterSpacing: 0.3,
      }}
    >
      {position}
    </span>
  );
}

export function FitnessBar({ card, width = '100%' }: { card: Card; width?: number | string }) {
  const fraction = Math.max(0, Math.min(1, fitnessOf(card) / 100));
  return (
    <div style={{ width, height: 3, marginTop: 2, overflow: 'hidden', borderRadius: 2, background: 'rgba(0,0,0,0.45)' }}>
      <div style={{ width: `${fraction * 100}%`, height: '100%', background: fitnessColor(card) }} />
    </div>
  );
}

export function LineupSlot({
  slot,
  card,
  v6card,
  justPlaced,
  onClick,
  competence,
  dim = false,
  dropHint = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  v6card?: V6Card;
  justPlaced: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  competence?: Competence;
  stats?: { atk: number; def: number; baseAtk: number; baseDef: number };
  misfitReveal?: boolean;
  dim?: boolean;
  dropHint?: boolean;
} & DragPointerHandlers) {
  const resolvedCompetence = competence ?? (card ? competenceOf(card.position, slot) : 'primary');

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="absolute flex flex-col items-center active:scale-95"
      style={{
        left: pitchAxis(slot.x, SLOT_INSET_X),
        top: pitchAxis(lineupPitchY(slot.y), SLOT_INSET_Y),
        width: SLOT_CARD_W,
        padding: 0,
        border: 0,
        background: 'transparent',
        transform: `translate(-50%, -50%)${dropHint ? ' scale(1.06)' : ''}`,
        transition: 'transform 0.1s ease',
        touchAction: onPointerDown ? 'none' : undefined,
        opacity: dim ? 0.3 : 1,
        zIndex: dropHint ? 8 : undefined,
      }}
    >
      {card ? (
        <div className={`relative ${justPlaced ? 'chip-place' : ''}`}>
          <TeamSelectionPlayerCard
            card={card}
            v6card={v6card}
            size="pitch"
            competence={resolvedCompetence}
            dimmed={dim}
            highlighted={dropHint}
          />
        </div>
      ) : (
        <>
          <div
            className="slot-pulse flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'rgba(7,16,11,0.45)',
              border: dropHint ? '2px solid var(--gold)' : '2px dashed rgba(242,246,239,0.7)',
              boxShadow: dropHint ? '0 0 0 3px var(--gold-glow)' : undefined,
            }}
          >
            <span style={{ color: 'rgba(242,246,239,0.9)', fontFamily: PIXEL, fontSize: 12, lineHeight: 1 }}>+</span>
          </div>
          <span
            style={{
              marginTop: 2,
              padding: '2px 3px',
              color: 'var(--ink-black)',
              background: 'rgba(242,246,239,0.85)',
              border: '1px solid var(--ink-black)',
              borderRadius: 3,
              fontFamily: PIXEL,
              fontSize: 7,
              lineHeight: 1,
            }}
          >
            {slot.type}
          </span>
        </>
      )}
    </button>
  );
}

export function BenchTile({
  card,
  v6card,
  dim = false,
  dropHint = false,
  touchAction,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  card: Card;
  v6card?: V6Card;
  onRemove?: () => void;
  dim?: boolean;
  dropHint?: boolean;
  touchAction?: 'none' | 'pan-x';
} & DragPointerHandlers) {
  return (
    <button
      type="button"
      aria-label={lastName(card.name)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="relative flex active:scale-95"
      style={{
        width: '100%',
        minWidth: 0,
        padding: 0,
        border: 0,
        background: 'transparent',
        touchAction: touchAction ?? (onPointerDown ? 'none' : undefined),
        transition: 'transform 0.12s ease',
      }}
    >
      <TeamSelectionPlayerCard
        card={card}
        v6card={v6card}
        size="bench"
        competence="primary"
        dimmed={dim}
        highlighted={dropHint}
      />
    </button>
  );
}

export function BenchCover({ benchCards }: { benchCards: Card[] }) {
  if (benchCards.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {benchCards.slice(0, 7).map((card) => (
        <i
          key={card.id}
          style={{
            display: 'block',
            width: 5,
            height: 10,
            background: POSITION_COLOR[card.position] ?? 'var(--dust)',
            border: '1px solid var(--ink-black)',
            transform: 'skewY(-8deg)',
          }}
        />
      ))}
    </span>
  );
}
