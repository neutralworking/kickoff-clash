'use client';

import { useMemo } from 'react';
import type { MatchV5State, AttackDefenceSplit } from '../../lib/match-v5';
import { evaluateSplit } from '../../lib/match-v5';
import type { Formation } from '../../lib/formations';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import type { OpponentBuild } from '../../lib/run';
import PlayerCard from '../PlayerCard';
import CardHand from '../CardHand';
import SynergyPreview from './SynergyPreview';

interface DeployPhaseProps {
  matchState: MatchV5State;
  formation: Formation;
  jokers: JokerCard[];
  tacticSlots: TacticSlots;
  availableTactics: TacticCard[];
  opponentBuild: OpponentBuild;
  onToggleAttacker: (cardId: number) => void;
  onToggleTactic: (tacticId: string) => void;
  onKickOff: () => void;
}

export default function DeployPhase({
  matchState,
  formation,
  jokers,
  tacticSlots,
  availableTactics,
  opponentBuild,
  onToggleAttacker,
  onToggleTactic,
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

      {/* Matchup + tactics */}
      <div
        style={{
          padding: '4px 10px 6px',
          display: 'grid',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 2,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.18)',
            border: '1px solid rgba(245,158,11,0.12)',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--cream, #f5f0e8)', fontWeight: 700 }}>
            {opponentBuild.name} | {opponentBuild.style}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
            Weakness: {opponentBuild.weakness}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
            Star: {opponentBuild.starPlayer.name} | {opponentBuild.starAbility}
          </div>
        </div>

        {availableTactics.length > 0 && (
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', textAlign: 'center' }}>
              Match Plan
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {availableTactics.map((tactic) => {
                const active = tacticSlots.slots.some((slot) => slot?.id === tactic.id);
                return (
                  <button
                    key={tactic.id}
                    onClick={() => onToggleTactic(tactic.id)}
                    style={{
                      minWidth: 120,
                      padding: '7px 8px',
                      textAlign: 'left',
                      borderRadius: 8,
                      border: `1px solid ${active ? 'rgba(245,158,11,0.45)' : 'rgba(138,117,96,0.22)'}`,
                      background: active ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.12)',
                      color: active ? 'var(--cream, #f5f0e8)' : 'var(--dust, #8a7560)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{tactic.name}</div>
                    <div style={{ fontSize: 9, lineHeight: 1.25, marginTop: 2 }}>{tactic.effect}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
