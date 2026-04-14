'use client';

import { useMemo } from 'react';
import type { MatchV5State, AttackDefenceSplit } from '../../lib/match-v5';
import { evaluateSplit, getOpponentBaselines } from '../../lib/match-v5';
import type { Formation } from '../../lib/formations';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import type { OpponentBuild } from '../../lib/run';
import PlayerCard from '../PlayerCard';
import TacticCardComp from '../TacticCard';

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

  const { xi, attackerIds, attackerOrder } = matchState;
  const maxAtk = formation.maxAttackers;
  const atkCount = attackerIds.size;
  const overCap = atkCount > maxAtk;
  const opponentBaseline = useMemo(
    () => getOpponentBaselines(
      matchState.opponentRound,
      matchState.opponentStyle,
      matchState.currentIncrement,
      matchState,
    ),
    [matchState],
  );
  const defenceMargin = split.defenceScore - opponentBaseline.attack;
  const attackMargin = split.attackScore - opponentBaseline.defence;
  const attackChemistry = split.attackSynergies.reduce((sum, syn) => sum + syn.bonus, 0)
    + split.crossSynergies.reduce((sum, syn) => sum + syn.attackBonus, 0);
  const defenceChemistry = split.defenceSynergies.reduce((sum, syn) => sum + syn.bonus, 0)
    + split.crossSynergies.reduce((sum, syn) => sum + syn.defenceBonus, 0);
  const openingDraw = matchState.currentIncrement === 0 && matchState.scores.length === 0;

  // Sort attackers by power desc to determine which are diminished
  const sortedAttackerIds = useMemo(() => {
    const attackers = xi
      .filter((c) => attackerIds.has(c.id))
      .sort((a, b) => b.power - a.power);
    return new Set(attackers.slice(maxAtk).map((c) => c.id));
  }, [xi, attackerIds, maxAtk]);

  // Group XI into attackers (top) and defenders (bottom)
  const attackers = attackerOrder
    .map((id) => xi.find((c) => c.id === id))
    .filter((card): card is NonNullable<typeof card> => !!card);
  const defenders = xi.filter((c) => !attackerIds.has(c.id));
  const finisher = attackers.at(-1) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Round target preview */}
      <div
        style={{
          padding: '8px 10px 6px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 6,
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'linear-gradient(180deg, rgba(96,165,250,0.18), rgba(15,23,42,0.35))',
              border: '1px solid rgba(96,165,250,0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <div style={{ fontSize: 9, color: '#93c5fd', fontWeight: 700, letterSpacing: 0.6 }}>
              DEFENCE POWER
            </div>
            <div
              style={{
                marginTop: 3,
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display, sans-serif)',
                  fontSize: 20,
                  color: '#dbeafe',
                }}
              >
                {split.defenceScore}
              </span>
              <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
                target {opponentBaseline.attack}
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: defenceMargin >= 0 ? '#86efac' : '#fca5a5' }}>
              {defenceMargin >= 0 ? `+${defenceMargin} over their pressure` : `${defenceMargin} under their pressure`}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: 'var(--cream-soft, #d9d0b8)' }}>
              Chemistry {defenceChemistry > 0 ? `+${defenceChemistry}` : 'quiet'}
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'linear-gradient(180deg, rgba(251,191,36,0.18), rgba(69,26,3,0.32))',
              border: '1px solid rgba(251,191,36,0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <div style={{ fontSize: 9, color: '#fcd34d', fontWeight: 700, letterSpacing: 0.6 }}>
              ATTACK POWER
            </div>
            <div
              style={{
                marginTop: 3,
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display, sans-serif)',
                  fontSize: 20,
                  color: '#fde68a',
                }}
              >
                {split.attackScore}
              </span>
              <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
                target {opponentBaseline.defence}
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: attackMargin >= 0 ? '#86efac' : '#fca5a5' }}>
              {attackMargin >= 0 ? `+${attackMargin} over their block` : `${attackMargin} under their block`}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: 'var(--cream-soft, #d9d0b8)' }}>
              Chemistry {attackChemistry > 0 ? `+${attackChemistry}` : 'quiet'}
            </div>
            <div style={{ marginTop: 2, fontSize: 9, color: 'var(--cream-soft, #d9d0b8)' }}>
              Create {split.chanceCreation} | Finish {split.shotQuality}
            </div>
          </div>
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
            background: 'linear-gradient(135deg, rgba(0,0,0,0.2), rgba(232,98,26,0.08))',
            border: '1px solid rgba(245,158,11,0.14)',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--cream, #f5f0e8)', fontWeight: 700 }}>
            Matchup | {opponentBuild.name} | {opponentBuild.style}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', lineHeight: 1.35 }}>
            Target their {opponentBuild.weakness} weakness. Watch {opponentBuild.starPlayer.name} for {opponentBuild.starAbility.toLowerCase()}.
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            color: overCap ? '#ef4444' : 'var(--dust, #8a7560)',
            fontWeight: overCap ? 700 : 500,
            textAlign: 'center',
          }}
        >
          {atkCount}/{maxAtk} committed forward
          {overCap && ' | extra attackers are halved'}
        </div>

        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.18)',
            border: '1px solid rgba(245,158,11,0.12)',
            display: 'grid',
            gap: 3,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--cream, #f5f0e8)', fontWeight: 700 }}>
            Play Call | {split.playName}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', lineHeight: 1.35 }}>
            {split.playSummary}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
            {attackers.length > 0
              ? `Sequence: ${attackers.map((card, index) => `${index + 1}.${card.name}`).join(' -> ')}`
              : 'Select the cards for your move. Last card selected becomes the finisher.'}
          </div>
          {finisher && (
            <div style={{ fontSize: 10, color: '#fde68a', fontWeight: 700 }}>
              Finish through {finisher.name}
            </div>
          )}
        </div>

        {availableTactics.length > 0 && (
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', textAlign: 'center', letterSpacing: 0.6 }}>
              PLAYBOOK
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 4px' }}>
              {availableTactics.map((tactic) => {
                const active = tacticSlots.slots.some((slot) => slot?.id === tactic.id);
                return (
                  <div
                    key={tactic.id}
                    style={{
                      flexShrink: 0,
                    }}
                  >
                    <TacticCardComp
                      tactic={tactic}
                      compact
                      deployed={active}
                      onClick={() => onToggleTactic(tactic.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Attack lane */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: 1, padding: '2px 0 6px' }}>
          ATTACK LINE
        </div>
        <div className="match-card-rail">
          {attackers.map((card, index) => (
            <div
              key={card.id}
              className={`match-card-rail-card${openingDraw ? ' match-card-deal' : ''}`}
              style={openingDraw ? { animationDelay: `${index * 70}ms` } : undefined}
            >
              <PlayerCard
                card={card}
                size="hand"
                assignment="attacking"
                showHandDetails
                playOrderLabel={index === attackers.length - 1 ? `F${index + 1}` : `${index + 1}`}
                diminished={sortedAttackerIds.has(card.id)}
                onClick={() => onToggleAttacker(card.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Pitch line */}
      <div
        style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent 10%, rgba(245,158,11,0.25) 50%, transparent 90%)',
          margin: '2px 20px',
          flexShrink: 0,
        }}
      />

      {/* Defence lane */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#60a5fa', letterSpacing: 1, padding: '4px 0 6px' }}>
          DEFENCE LINE
        </div>
        <div className="match-card-rail">
          {defenders.map((card, index) => (
            <div
              key={card.id}
              className={`match-card-rail-card${openingDraw ? ' match-card-deal' : ''}`}
              style={openingDraw ? { animationDelay: `${(attackers.length + index) * 70}ms` } : undefined}
            >
              <PlayerCard
                card={card}
                size="hand"
                assignment="defending"
                showHandDetails
                playOrderLabel={null}
                onClick={card.injured ? undefined : () => onToggleAttacker(card.id)}
                dimmed={!!card.injured}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bench preview */}
      <div style={{ padding: '2px 10px 0', display: 'grid', gap: 6, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream, #f5f0e8)', letterSpacing: 0.6 }}>
            BENCH
          </span>
          <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
            {matchState.subsRemaining} subs | {matchState.discardsRemaining} redraws
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {matchState.bench.map((card, index) => (
            <div
              key={card.id}
              className={openingDraw ? 'match-card-deal' : undefined}
              style={openingDraw ? { animationDelay: `${(attackers.length + defenders.length + index) * 70}ms` } : undefined}
            >
              <PlayerCard card={card} size="pill" dimmed={!!card.injured} />
            </div>
          ))}
        </div>
      </div>

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
