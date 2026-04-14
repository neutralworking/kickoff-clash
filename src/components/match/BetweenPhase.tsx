'use client';

import { useState, useCallback } from 'react';
import type { MatchV5State } from '../../lib/match-v5';
import { ALL_FORMATIONS } from '../../lib/formations';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import PlayerCard from '../PlayerCard';
import CardHand from '../CardHand';

interface BetweenPhaseProps {
  matchState: MatchV5State;
  ownedFormations: string[];
  isHalftime: boolean;
  tacticSlots: TacticSlots;
  availableTactics: TacticCard[];
  onSub: (xiCardId: number, benchCardId: number) => void;
  onDiscard: (benchCardIds: number[]) => void;
  onFormationChange: (formationId: string) => void;
  onToggleTactic: (tacticId: string) => void;
  onContinue: () => void;
}

export default function BetweenPhase({
  matchState,
  ownedFormations,
  isHalftime,
  tacticSlots,
  availableTactics,
  onSub,
  onDiscard,
  onFormationChange,
  onToggleTactic,
  onContinue,
}: BetweenPhaseProps) {
  const [selectedBenchId, setSelectedBenchId] = useState<number | null>(null);
  const [selectedXiId, setSelectedXiId] = useState<number | null>(null);
  const [markedForDiscard, setMarkedForDiscard] = useState<Set<number>>(new Set());
  const [benchMode, setBenchMode] = useState<'sub' | 'discard'>('sub');

  const handleBenchTap = useCallback(
    (cardId: number) => {
      if (benchMode === 'discard') {
        setSelectedBenchId(null);
        setSelectedXiId(null);
        setMarkedForDiscard((prev) => {
          const next = new Set(prev);
          if (next.has(cardId)) {
            next.delete(cardId);
          } else {
            next.add(cardId);
          }
          return next;
        });
        return;
      }

      // If an XI card is selected, make a sub
      if (selectedXiId !== null) {
        onSub(selectedXiId, cardId);
        setSelectedXiId(null);
        setSelectedBenchId(null);
        setMarkedForDiscard(new Set());
        return;
      }

      setMarkedForDiscard(new Set());
      setSelectedBenchId((prev) => (prev === cardId ? null : cardId));
    },
    [benchMode, selectedXiId, onSub],
  );

  const handleXiTap = useCallback(
    (cardId: number) => {
      if (benchMode === 'discard') {
        setSelectedXiId(null);
        return;
      }

      // If a bench card is selected, make a sub
      if (selectedBenchId !== null) {
        onSub(cardId, selectedBenchId);
        setSelectedBenchId(null);
        setSelectedXiId(null);
        setMarkedForDiscard(new Set());
        return;
      }
      setSelectedXiId(selectedXiId === cardId ? null : cardId);
    },
    [benchMode, selectedBenchId, selectedXiId, onSub],
  );

  const handleConfirmDiscard = useCallback(() => {
    if (markedForDiscard.size === 0) return;
    onDiscard([...markedForDiscard]);
    setMarkedForDiscard(new Set());
    setSelectedBenchId(null);
  }, [markedForDiscard, onDiscard]);

  return (
    <div
      className="between-shell"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '14px',
        gap: 12,
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: 'center',
          padding: '14px',
          borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(18,26,20,0.88), rgba(10,16,12,0.92))',
          border: '1px solid rgba(245,158,11,0.12)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 22,
            color: 'var(--amber, #f59e0b)',
          }}
        >
          {isHalftime ? 'HALF TIME' : 'BETWEEN INCREMENTS'}
        </span>
        <div style={{ fontSize: 11, color: 'var(--dust, #8a7560)', marginTop: 2 }}>
          Subs: {matchState.subsRemaining} | Discards: {matchState.discardsRemaining} | Deck: {matchState.remainingDeck.length}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => {
              setBenchMode('sub');
              setMarkedForDiscard(new Set());
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: benchMode === 'sub' ? '1px solid rgba(232,98,26,0.55)' : '1px solid rgba(154,139,115,0.25)',
              background: benchMode === 'sub' ? 'rgba(232,98,26,0.18)' : 'rgba(0,0,0,0.16)',
              color: benchMode === 'sub' ? 'var(--cream, #f5f0e8)' : 'var(--dust, #8a7560)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sub Mode
          </button>
          <button
            onClick={() => {
              setBenchMode('discard');
              setSelectedBenchId(null);
              setSelectedXiId(null);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: benchMode === 'discard' ? '1px solid rgba(239,68,68,0.55)' : '1px solid rgba(154,139,115,0.25)',
              background: benchMode === 'discard' ? 'rgba(239,68,68,0.16)' : 'rgba(0,0,0,0.16)',
              color: benchMode === 'discard' ? '#fecaca' : 'var(--dust, #8a7560)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Redraw Mode
          </button>
        </div>
      </div>

      <div className="between-grid" style={{ display: 'grid', gap: 12, flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: '12px',
          borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(16,23,18,0.88), rgba(10,16,12,0.94))',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginBottom: 8, textAlign: 'center', letterSpacing: 0.6 }}>
          XI — {benchMode === 'sub' ? 'tap to choose who comes off' : 'view only while marking redraws'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
          {matchState.xi.map((card) => (
            <div key={card.id} style={{ display: 'flex', justifyContent: 'center' }}>
              <PlayerCard
                card={card}
                size="mini"
                onClick={() => handleXiTap(card.id)}
                selected={selectedXiId === card.id}
                dimmed={!!card.injured}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bench */}
      <div
        style={{
          padding: '12px',
          borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(16,23,18,0.88), rgba(10,16,12,0.94))',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginBottom: 8, textAlign: 'center', letterSpacing: 0.6 }}>
          Bench — {benchMode === 'sub' ? 'tap to bring on a substitute' : 'tap cards to throw back and redraw'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
          {matchState.bench.map((card) => (
            <div key={card.id} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
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
      </div>

      {/* Formation change (halftime only) */}
      {isHalftime && (
        <div
          style={{
            display: 'grid',
            gap: 8,
            padding: '12px',
            borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(16,23,18,0.88), rgba(10,16,12,0.94))',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
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

          {availableTactics.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 8px' }}>
              {availableTactics.map((tactic) => {
                const active = tacticSlots.slots.some((slot) => slot?.id === tactic.id);
                return (
                  <button
                    key={tactic.id}
                    onClick={() => onToggleTactic(tactic.id)}
                    style={{
                      minWidth: 116,
                      padding: '6px 8px',
                      textAlign: 'left',
                      borderRadius: 8,
                      border: `1px solid ${active ? 'rgba(245,158,11,0.4)' : 'rgba(138,117,96,0.2)'}`,
                      background: active ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.12)',
                      color: active ? 'var(--cream, #f5f0e8)' : 'var(--dust, #8a7560)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{tactic.name}</div>
                    <div style={{ fontSize: 9, marginTop: 2, lineHeight: 1.2 }}>{tactic.effect}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={onContinue}
        style={{
          width: '100%',
          margin: '0 auto',
          padding: '14px 0',
          borderRadius: 14,
          border: 'none',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#1a1a1a',
          fontFamily: 'var(--font-display, sans-serif)',
          fontSize: 18,
          cursor: 'pointer',
          boxShadow: '0 10px 24px rgba(245,158,11,0.28)',
          flexShrink: 0,
        }}
      >
        {isHalftime ? 'Second Half \u2192' : 'Continue \u2192'}
      </button>
    </div>
  );
}
