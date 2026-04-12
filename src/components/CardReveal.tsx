'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PackContents } from '../lib/packs';
import type { Card } from '../lib/scoring';
import PlayerCard from './PlayerCard';
import CardHand from './CardHand';
import TacticCardComp from './TacticCard';
import JokerCardComp from './JokerCard';
import { RARITY_COLORS } from './theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardRevealProps {
  contents: PackContents;
  onComplete: () => void;
}

type Stage = 'opening' | 'players' | 'extras' | 'ready';

// ---------------------------------------------------------------------------
// Card back pattern (gold crest on leather)
// ---------------------------------------------------------------------------

function CardBack() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid var(--gold, #d4a035)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          color: 'var(--gold, #d4a035)',
        }}
      >
        KC
      </div>
      <div
        style={{
          width: '60%',
          height: 1,
          background: 'linear-gradient(90deg, transparent, var(--gold, #d4a035), transparent)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CardReveal({ contents, onComplete }: CardRevealProps) {
  const [stage, setStage] = useState<Stage>('opening');
  const [revealIndex, setRevealIndex] = useState(-1); // -1 = no card yet
  const [flipped, setFlipped] = useState(false);
  const [revealedCards, setRevealedCards] = useState<Card[]>([]);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { players } = contents;
  const totalPlayers = players.length;

  // --- Opening phase: auto-advance after 0.8s ---
  useEffect(() => {
    if (stage !== 'opening') return;
    const t = setTimeout(() => {
      setStage('players');
      setRevealIndex(0);
    }, 800);
    return () => clearTimeout(t);
  }, [stage]);

  // --- When revealIndex changes, trigger flip ---
  useEffect(() => {
    if (stage !== 'players' || revealIndex < 0 || revealIndex >= totalPlayers) return;
    setFlipped(false);

    // Small delay then flip
    const flipTimer = setTimeout(() => {
      setFlipped(true);

      // Rarity flash
      const card = players[revealIndex];
      if (card.rarity === 'Epic') {
        setFlashColor('rgba(168,85,247,0.3)');
        setTimeout(() => setFlashColor(null), 300);
      } else if (card.rarity === 'Legendary') {
        setFlashColor('rgba(245,158,11,0.4)');
        setTimeout(() => setFlashColor(null), 400);
      }
    }, 200);

    // Auto-advance after 1.5s total
    autoAdvanceRef.current = setTimeout(() => {
      advanceCard();
    }, 1500);

    return () => {
      clearTimeout(flipTimer);
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealIndex, stage]);

  // --- Advance to next card ---
  const advanceCard = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }

    if (stage === 'players' && revealIndex >= 0 && revealIndex < totalPlayers) {
      // Add current card to revealed row
      setRevealedCards(prev => [...prev, players[revealIndex]]);

      if (revealIndex + 1 >= totalPlayers) {
        // All players revealed → extras
        setStage('extras');
      } else {
        setRevealIndex(prev => prev + 1);
      }
    }
  }, [stage, revealIndex, totalPlayers, players]);

  // --- Extras auto-advance to ready ---
  useEffect(() => {
    if (stage !== 'extras') return;
    const t = setTimeout(() => setStage('ready'), 1500);
    return () => clearTimeout(t);
  }, [stage]);

  // --- Tap anywhere during player reveal to skip ---
  const handleTap = useCallback(() => {
    if (stage === 'players') {
      advanceCard();
    } else if (stage === 'extras') {
      setStage('ready');
    } else if (stage === 'ready') {
      // Don't auto-complete on tap, require button press
    }
  }, [stage, advanceCard]);

  const currentCard = stage === 'players' && revealIndex >= 0 && revealIndex < totalPlayers
    ? players[revealIndex]
    : null;

  const hasExtras = contents.tactics.length > 0 || contents.formations.length > 0 || contents.managers.length > 0;

  return (
    <div
      className="phase-reveal"
      onClick={handleTap}
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 16px 16px',
        position: 'relative',
        overflow: 'hidden',
        cursor: stage === 'players' ? 'pointer' : 'default',
      }}
    >
      {/* Rarity flash overlay */}
      {flashColor && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: flashColor,
            pointerEvents: 'none',
            zIndex: 20,
            animation: 'rarityFlashEpic 0.4s ease-out forwards',
          }}
        />
      )}

      {/* --- Opening phase: pack tear --- */}
      {stage === 'opening' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 140,
              height: 190,
              borderRadius: 12,
              border: '2px solid var(--gold, #d4a035)',
              background: 'linear-gradient(135deg, #241e16, #1a1510)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'packTear 0.8s ease-in forwards',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display, sans-serif)',
                fontSize: 18,
                color: 'var(--gold, #d4a035)',
              }}
            >
              OPEN
            </span>
          </div>
        </div>
      )}

      {/* --- Counter --- */}
      {stage === 'players' && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--dust, #9a8b73)',
            fontFamily: 'var(--font-body, sans-serif)',
            flexShrink: 0,
          }}
        >
          {revealIndex + 1} / {totalPlayers}
        </div>
      )}

      {/* --- Center stage: current card flip --- */}
      {stage === 'players' && currentCard && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}
        >
          <div className="card-flip" key={revealIndex}>
            <div className={`card-flip-inner ${flipped ? 'flipped' : ''}`}>
              {/* Back */}
              <div className="card-flip-back">
                <CardBack />
              </div>
              {/* Front */}
              <div className="card-flip-front">
                <PlayerCard card={currentCard} size="full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Extras phase --- */}
      {stage === 'extras' && hasExtras && (
        <div
          className="phase-fade-in"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 14,
              color: 'var(--dust, #9a8b73)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Also in your pack
          </span>

          {/* Tactics */}
          {contents.tactics.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {contents.tactics.map(t => (
                <TacticCardComp key={t.id} tactic={t} compact />
              ))}
            </div>
          )}

          {/* Formations */}
          {contents.formations.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {contents.formations.map(f => (
                <span
                  key={f.id}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--gold, #d4a035)',
                    background: 'rgba(212,160,53,0.1)',
                    fontFamily: 'var(--font-display, sans-serif)',
                    fontSize: 13,
                    color: 'var(--gold, #d4a035)',
                  }}
                >
                  {f.name}
                </span>
              ))}
            </div>
          )}

          {/* Managers */}
          {contents.managers.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {contents.managers.map(j => (
                <JokerCardComp key={j.id} joker={j} compact />
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Extras phase with no extras: skip straight --- */}
      {stage === 'extras' && !hasExtras && (
        <div style={{ flex: 1 }} />
      )}

      {/* --- Ready phase: summary --- */}
      {stage === 'ready' && (
        <div
          className="phase-fade-in"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 16,
              color: 'var(--cream, #f5f0e0)',
            }}
          >
            Your Squad
          </span>

          {/* Two-row hand fan for 11 cards */}
          {revealedCards.length > 6 ? (
            <>
              <CardHand
                cardCount={Math.ceil(revealedCards.length / 2)}
                cardWidth={72}
                maxSpreadDeg={20}
              >
                {revealedCards.slice(0, Math.ceil(revealedCards.length / 2)).map(card => (
                  <PlayerCard key={card.id} card={card} size="mini" />
                ))}
              </CardHand>
              <CardHand
                cardCount={Math.floor(revealedCards.length / 2)}
                cardWidth={72}
                maxSpreadDeg={18}
              >
                {revealedCards.slice(Math.ceil(revealedCards.length / 2)).map(card => (
                  <PlayerCard key={card.id} card={card} size="mini" />
                ))}
              </CardHand>
            </>
          ) : (
            <CardHand
              cardCount={revealedCards.length}
              cardWidth={72}
              maxSpreadDeg={24}
            >
              {revealedCards.map(card => (
                <PlayerCard key={card.id} card={card} size="mini" />
              ))}
            </CardHand>
          )}
        </div>
      )}

      {/* --- Revealed row (during player reveal) — growing hand fan --- */}
      {stage === 'players' && revealedCards.length > 0 && (
        <div style={{ flexShrink: 0, padding: '4px 0' }}>
          <CardHand
            cardCount={revealedCards.length}
            cardWidth={48}
            maxSpreadDeg={Math.min(revealedCards.length * 3, 24)}
            overlapPx={revealedCards.length > 4 ? -12 : -6}
          >
            {revealedCards.map(card => (
              <div
                key={card.id}
                className="card-appear"
                style={{
                  width: 48,
                  height: 66,
                  borderRadius: 6,
                  border: `1.5px solid ${RARITY_COLORS[card.rarity] ?? '#71717a'}`,
                  background: 'linear-gradient(160deg, #1a1a2e, #101020)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    fontSize: 7,
                    fontWeight: 700,
                    color: '#f5f0e0',
                    textAlign: 'center',
                    lineHeight: 1.1,
                    padding: '0 2px',
                  }}
                >
                  {card.name.split(' ').pop()}
                </span>
              </div>
            ))}
          </CardHand>
        </div>
      )}

      {/* --- Ready button --- */}
      {stage === 'ready' && (
        <button
          className="advance-btn-pulse"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '14px 0',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#1a1a1a',
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 16,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Ready
        </button>
      )}

      {/* --- Tap hint during player reveal --- */}
      {stage === 'players' && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--dust, #9a8b73)',
            opacity: 0.6,
            textAlign: 'center',
            padding: '4px 0',
            flexShrink: 0,
          }}
        >
          Tap to skip
        </div>
      )}
    </div>
  );
}
