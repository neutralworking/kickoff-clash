'use client';

import { useState, useCallback } from 'react';
import type { MatchV5State } from '../../lib/match-v5';
import { ALL_FORMATIONS } from '../../lib/formations';
import PlayerCard from '../PlayerCard';
import CardHand from '../CardHand';

interface BetweenPhaseProps {
  matchState: MatchV5State;
  ownedFormations: string[];
  isHalftime: boolean;
  onSub: (xiCardId: number, benchCardId: number) => void;
  onDiscard: (benchCardIds: number[]) => void;
  onFormationChange: (formationId: string) => void;
  onContinue: () => void;
}

export default function BetweenPhase({
  matchState,
  ownedFormations,
  isHalftime,
  onSub,
  onDiscard,
  onFormationChange,
  onContinue,
}: BetweenPhaseProps) {
  const [selectedBenchId, setSelectedBenchId] = useState<number | null>(null);
  const [selectedXiId, setSelectedXiId] = useState<number | null>(null);
  const [markedForDiscard, setMarkedForDiscard] = useState<Set<number>>(new Set());

  const handleBenchTap = useCallback(
    (cardId: number) => {
      // If an XI card is selected, make a sub
      if (selectedXiId !== null) {
        onSub(selectedXiId, cardId);
        setSelectedXiId(null);
        setSelectedBenchId(null);
        return;
      }

      // Toggle discard mark
      setMarkedForDiscard((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else {
          next.add(cardId);
        }
        return next;
      });
      setSelectedBenchId(cardId);
    },
    [selectedXiId, onSub],
  );

  const handleXiTap = useCallback(
    (cardId: number) => {
      // If a bench card is selected, make a sub
      if (selectedBenchId !== null) {
        onSub(cardId, selectedBenchId);
        setSelectedBenchId(null);
        setSelectedXiId(null);
        return;
      }
      setSelectedXiId(selectedXiId === cardId ? null : cardId);
    },
    [selectedBenchId, selectedXiId, onSub],
  );

  const handleConfirmDiscard = useCallback(() => {
    if (markedForDiscard.size === 0) return;
    onDiscard([...markedForDiscard]);
    setMarkedForDiscard(new Set());
    setSelectedBenchId(null);
  }, [markedForDiscard, onDiscard]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 10px',
        gap: 8,
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 18,
            color: 'var(--amber, #f59e0b)',
          }}
        >
          {isHalftime ? 'HALF TIME' : 'BETWEEN INCREMENTS'}
        </span>
        <div style={{ fontSize: 11, color: 'var(--dust, #8a7560)', marginTop: 2 }}>
          Subs: {matchState.subsRemaining} | Discards: {matchState.discardsRemaining} | Deck: {matchState.remainingDeck.length}
        </div>
      </div>

      {/* XI cards — hand fan */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginBottom: 2, textAlign: 'center' }}>
          XI — tap to select for sub
        </div>
        <CardHand
          cardCount={matchState.xi.length}
          cardWidth={72}
          maxSpreadDeg={matchState.xi.length > 8 ? 22 : 16}
          selectedIndex={selectedXiId !== null ? matchState.xi.findIndex(c => c.id === selectedXiId) : null}
        >
          {matchState.xi.map((card) => (
            <PlayerCard
              key={card.id}
              card={card}
              size="mini"
              onClick={() => handleXiTap(card.id)}
              selected={selectedXiId === card.id}
              dimmed={!!card.injured}
            />
          ))}
        </CardHand>
      </div>

      {/* Bench */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginBottom: 2, textAlign: 'center' }}>
          Bench — tap to sub or mark for discard
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '0 8px' }}>
          {matchState.bench.map((card) => (
            <div key={card.id} style={{ position: 'relative' }}>
              <PlayerCard
                card={card}
                size="mini"
                onClick={() => handleBenchTap(card.id)}
                selected={selectedBenchId === card.id || markedForDiscard.has(card.id)}
              />
              {markedForDiscard.has(card.id) && (
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    color: '#fff',
                    fontWeight: 900,
                    pointerEvents: 'none',
                  }}
                >
                  &times;
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Discard confirm button */}
        {markedForDiscard.size > 0 && matchState.discardsRemaining > 0 && (
          <button
            onClick={handleConfirmDiscard}
            style={{
              display: 'block',
              margin: '8px auto 0',
              padding: '6px 20px',
              borderRadius: 6,
              border: '1px solid #ef4444',
              background: 'rgba(239,68,68,0.15)',
              color: '#ef4444',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-body, sans-serif)',
            }}
          >
            Discard {markedForDiscard.size} card{markedForDiscard.size > 1 ? 's' : ''} &amp; draw
          </button>
        )}
      </div>

      {/* Formation change (halftime only) */}
      {isHalftime && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--dust, #8a7560)' }}>Formation:</span>
          <select
            value={matchState.formation.id}
            onChange={(e) => onFormationChange(e.target.value)}
            style={{
              background: 'var(--leather, #3d2b1f)',
              color: 'var(--cream, #f5f0e8)',
              border: '1px solid var(--dust, #8a7560)',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 12,
              fontFamily: 'var(--font-body, sans-serif)',
            }}
          >
            {ownedFormations.map((fId) => {
              const f = ALL_FORMATIONS.find((fm) => fm.id === fId);
              return f ? (
                <option key={fId} value={fId}>
                  {f.name} (max {f.maxAttackers} atk)
                </option>
              ) : null;
            })}
          </select>
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={onContinue}
        style={{
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          padding: '12px 0',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#1a1a1a',
          fontFamily: 'var(--font-display, sans-serif)',
          fontSize: 16,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
          flexShrink: 0,
        }}
      >
        {isHalftime ? 'Second Half \u2192' : 'Continue \u2192'}
      </button>
    </div>
  );
}
