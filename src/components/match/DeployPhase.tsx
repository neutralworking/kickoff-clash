'use client';

import { useMemo } from 'react';
import type { MatchV5State, AttackDefenceSplit } from '../../lib/match-v5';
import { evaluateSplit } from '../../lib/match-v5';
import type { Formation } from '../../lib/formations';
import type { JokerCard } from '../../lib/jokers';
import type { TacticSlots } from '../../lib/tactics';
import type { Card } from '../../lib/scoring';
import PlayerCard from '../PlayerCard';
import CardHand from '../CardHand';
import SynergyPreview from './SynergyPreview';

interface DeployPhaseProps {
  matchState: MatchV5State;
  formation: Formation;
  jokers: JokerCard[];
  tacticSlots: TacticSlots;
  onToggleAttacker: (cardId: number) => void;
  onKickOff: () => void;
}

export default function DeployPhase({
  matchState,
  formation,
  jokers,
  tacticSlots,
  onToggleAttacker,
  onKickOff,
}: DeployPhaseProps) {
  // Live preview: evaluate current split
  const split: AttackDefenceSplit = useMemo(
    () => evaluateSplit(matchState, jokers, tacticSlots),
    [matchState, jokers, tacticSlots],
  );

  const { xi, attackerIds } = matchState;
  const maxAtk = formation.maxAttackers;
  const atkCount = attackerIds.size;
  const overCap = atkCount > maxAtk;

  // Sort attackers by power desc to determine which are diminished
  const sortedAttackerIds = useMemo(() => {
    const attackers = xi
      .filter((c) => attackerIds.has(c.id))
      .sort((a, b) => b.power - a.power);
    return new Set(attackers.slice(maxAtk).map((c) => c.id));
  }, [xi, attackerIds, maxAtk]);

  // Group XI into attackers (top) and defenders (bottom)
  const attackers = xi.filter((c) => attackerIds.has(c.id));
  const defenders = xi.filter((c) => !attackerIds.has(c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Synergy preview — compact */}
      <SynergyPreview
        attackSynergies={split.attackSynergies}
        defenceSynergies={split.defenceSynergies}
        crossSynergies={split.crossSynergies}
      />

      {/* Score preview — compact row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16,
          padding: '2px 10px',
          flexShrink: 0,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>ATK </span>
          <span
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 18,
              color: '#fbbf24',
            }}
          >
            {split.attackScore}
          </span>
        </div>

        <div
          style={{
            fontSize: 10,
            color: overCap ? '#ef4444' : 'var(--dust, #8a7560)',
            fontWeight: overCap ? 700 : 400,
            textAlign: 'center',
          }}
        >
          {atkCount}/{maxAtk} atk
          {overCap && <span style={{ fontSize: 9, color: '#ef4444' }}> dim!</span>}
        </div>

        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 700 }}>DEF </span>
          <span
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 18,
              color: '#60a5fa',
            }}
          >
            {split.defenceScore}
          </span>
        </div>
      </div>

      {/* Attack hand */}
      <CardHand
        cardCount={attackers.length}
        cardWidth={82}
        maxSpreadDeg={attackers.length > 5 ? 22 : 16}
        label="Attack"
        labelColor="#fbbf24"
      >
        {attackers.map((card) => (
          <PlayerCard
            key={card.id}
            card={card}
            size="hand"
            assignment="attacking"
            diminished={sortedAttackerIds.has(card.id)}
            onClick={() => onToggleAttacker(card.id)}
          />
        ))}
      </CardHand>

      {/* Pitch line */}
      <div
        style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent 10%, rgba(245,158,11,0.25) 50%, transparent 90%)',
          margin: '2px 20px',
          flexShrink: 0,
        }}
      />

      {/* Defence hand */}
      <CardHand
        cardCount={defenders.length}
        cardWidth={82}
        maxSpreadDeg={defenders.length > 5 ? 22 : 16}
        label="Defend"
        labelColor="#60a5fa"
      >
        {defenders.map((card) => (
          <PlayerCard
            key={card.id}
            card={card}
            size="hand"
            assignment="defending"
            onClick={card.injured ? undefined : () => onToggleAttacker(card.id)}
            dimmed={!!card.injured}
          />
        ))}
      </CardHand>

      {/* Kick Off button — pinned at bottom */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <button
          className="advance-btn-pulse"
          onClick={onKickOff}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '12px 0',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#1a1a1a',
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 16,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
          }}
        >
          Kick Off
        </button>
      </div>
    </div>
  );
}
