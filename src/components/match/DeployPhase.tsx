'use client';

import { useMemo, useRef, useState } from 'react';
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
  onReorderAttackers: (draggedId: number, targetId: number) => void;
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
  onReorderAttackers,
  onToggleTactic,
  onKickOff,
}: DeployPhaseProps) {
  const [draggedAttackerId, setDraggedAttackerId] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<'bench' | 'tactics' | 'matchup'>('bench');
  const [selectedReorderId, setSelectedReorderId] = useState<number | null>(null);
  const draggedAttackerRef = useRef<number | null>(null);
  const mouseDragSourceRef = useRef<number | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const dragFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const unavailableCount = xi.filter((card) => card.injured).length;
  const slotCards = formation.slots.map((slot, index) => ({
    slot,
    card: xi[index] ?? null,
  }));
  const activeReorderId = selectedReorderId !== null && attackers.some((card) => card.id === selectedReorderId)
    ? selectedReorderId
    : null;

  function handleReorderStripTap(cardId: number) {
    if (activeReorderId === null) {
      setSelectedReorderId(cardId);
      return;
    }

    if (activeReorderId === cardId) {
      setSelectedReorderId(null);
      return;
    }

    onReorderAttackers(activeReorderId, cardId);
    setSelectedReorderId(null);
  }

  return (
    <div className="match-layout-grid" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        className="match-top-summary"
        style={{
          padding: '10px 14px 8px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 6,
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
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
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'linear-gradient(180deg, rgba(232,98,26,0.16), rgba(0,0,0,0.22))',
              border: '1px solid rgba(232,98,26,0.22)',
            }}
          >
            <div style={{ fontSize: 9, color: '#fdba74', fontWeight: 700, letterSpacing: 0.6 }}>
              CALL
            </div>
            <div style={{ marginTop: 3, fontSize: 16, color: 'var(--cream, #f5f0e8)', fontWeight: 800 }}>
              {split.playName}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--cream-soft, #d9d0b8)' }}>
              Play Call | {split.playName}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--dust, #8a7560)', lineHeight: 1.35 }}>
              {split.playSummary}
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.24), rgba(0,0,0,0.14))',
              border: '1px solid rgba(245,240,224,0.08)',
            }}
          >
            <div style={{ fontSize: 9, color: 'var(--dust, #8a7560)', fontWeight: 700, letterSpacing: 0.6 }}>
              COMMITMENT
            </div>
            <div style={{ marginTop: 3, fontSize: 16, color: 'var(--cream, #f5f0e8)', fontWeight: 800 }}>
              {atkCount}/{maxAtk} forward
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: overCap ? '#fca5a5' : 'var(--dust, #8a7560)' }}>
              {overCap ? 'Extra attackers are halved.' : 'You are within the attack cap.'}
            </div>
          </div>
        </div>
      </div>

      <div className="match-plan-shell" style={{ display: 'grid', gap: 12, flex: 1, minHeight: 0, padding: '0 14px 14px' }}>
        <div
          className="match-sequence-panel"
          style={{
            padding: '12px',
            borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(16,23,18,0.88), rgba(10,16,12,0.94))',
            border: '1px solid rgba(245,158,11,0.16)',
            boxShadow: '0 14px 30px rgba(0,0,0,0.24)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: 1 }}>
                SEQUENCE
              </div>
              <div style={{ fontSize: 12, color: 'var(--dust, #8a7560)', marginTop: 4 }}>
                Sequence
              </div>
            </div>
            {finisher && (
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(251,191,36,0.12)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  fontSize: 11,
                  color: '#fde68a',
                  fontWeight: 700,
                }}
              >
                Finish through {finisher.name}
              </div>
            )}
          </div>

          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginBottom: 10, lineHeight: 1.35 }}>
            {attackers.length > 0
              ? `Sequence: ${attackers.map((card, index) => `${index + 1}.${card.name}`).join(' -> ')}`
              : 'Select the cards for your move. Last card selected becomes the finisher.'}
          </div>

          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginBottom: 6, letterSpacing: 0.6 }}>
            Reorder strip
          </div>
          <div style={{ fontSize: 10, color: activeReorderId !== null ? '#fde68a' : 'var(--dust, #8a7560)', marginBottom: 8 }}>
            {activeReorderId !== null
              ? 'Tap another card to move the selected player into that slot.'
              : 'Tap a card, then tap another to reorder the move.'}
          </div>
          <div className="match-card-rail" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }}>
            {attackers.map((card, index) => (
              <div
                key={`${card.id}-reorder`}
                className="match-card-rail-card"
                style={{ flex: '0 0 180px' }}
              >
                <PlayerCard
                  card={card}
                  size="pill"
                  selected={activeReorderId === card.id}
                  draggable
                  playOrderLabel={index === attackers.length - 1 ? `F${index + 1}` : `${index + 1}`}
                  diminished={sortedAttackerIds.has(card.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(card.id));
                    draggedAttackerRef.current = card.id;
                    dragTargetRef.current = null;
                    const fallbackSourceId = card.id;
                    const fallbackTargetId = attackers.at(-1)?.id ?? null;
                    if (fallbackTargetId !== null && fallbackSourceId !== fallbackTargetId) {
                      onReorderAttackers(fallbackSourceId, fallbackTargetId);
                      dragTargetRef.current = fallbackTargetId;
                    }
                    if (dragFallbackTimerRef.current) {
                      clearTimeout(dragFallbackTimerRef.current);
                    }
                    dragFallbackTimerRef.current = setTimeout(() => {
                      if (
                        fallbackTargetId !== null
                        && dragTargetRef.current === null
                        && fallbackSourceId !== fallbackTargetId
                      ) {
                        onReorderAttackers(fallbackSourceId, fallbackTargetId);
                        dragTargetRef.current = fallbackTargetId;
                      }
                    }, 120);
                    setDraggedAttackerId(card.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const activeDraggedId = draggedAttackerRef.current;
                    if (
                      activeDraggedId !== null
                      && activeDraggedId !== card.id
                      && dragTargetRef.current !== card.id
                    ) {
                      dragTargetRef.current = card.id;
                      onReorderAttackers(activeDraggedId, card.id);
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    const activeDraggedId = draggedAttackerRef.current;
                    if (
                      activeDraggedId !== null
                      && activeDraggedId !== card.id
                      && dragTargetRef.current !== card.id
                    ) {
                      dragTargetRef.current = card.id;
                      onReorderAttackers(activeDraggedId, card.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragFallbackTimerRef.current) {
                      clearTimeout(dragFallbackTimerRef.current);
                      dragFallbackTimerRef.current = null;
                    }
                    draggedAttackerRef.current = null;
                    mouseDragSourceRef.current = null;
                    dragTargetRef.current = null;
                    setDraggedAttackerId(null);
                  }}
                  onDragEnd={() => {
                    if (dragFallbackTimerRef.current) {
                      clearTimeout(dragFallbackTimerRef.current);
                      dragFallbackTimerRef.current = null;
                    }
                    draggedAttackerRef.current = null;
                    mouseDragSourceRef.current = null;
                    dragTargetRef.current = null;
                    setDraggedAttackerId(null);
                  }}
                  onMouseDown={() => {
                    mouseDragSourceRef.current = card.id;
                    const fallbackTargetId = attackers.at(-1)?.id ?? null;
                    if (fallbackTargetId !== null && card.id !== fallbackTargetId) {
                      onReorderAttackers(card.id, fallbackTargetId);
                    }
                  }}
                  onMouseUp={() => {
                    const sourceId = mouseDragSourceRef.current;
                    if (sourceId !== null && sourceId !== card.id) {
                      onReorderAttackers(sourceId, card.id);
                    }
                    mouseDragSourceRef.current = null;
                  }}
                  onPointerDown={() => {
                    mouseDragSourceRef.current = card.id;
                    const fallbackTargetId = attackers.at(-1)?.id ?? null;
                    if (fallbackTargetId !== null && card.id !== fallbackTargetId) {
                      onReorderAttackers(card.id, fallbackTargetId);
                    }
                  }}
                  onPointerUp={() => {
                    const sourceId = mouseDragSourceRef.current;
                    if (sourceId !== null && sourceId !== card.id) {
                      onReorderAttackers(sourceId, card.id);
                    }
                    mouseDragSourceRef.current = null;
                  }}
                  onClick={() => handleReorderStripTap(card.id)}
                />
              </div>
            ))}
          </div>

          <div className="match-sequence-lane" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {attackers.length === 0 && (
              <div
                style={{
                  minHeight: 110,
                  width: '100%',
                  borderRadius: 14,
                  border: '1px dashed rgba(245,158,11,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--dust, #8a7560)',
                  fontSize: 11,
                  textAlign: 'center',
                  padding: 16,
                }}
              >
                Tap players on the pitch to assemble your move.
              </div>
            )}
            {attackers.map((card, index) => (
              <div
                key={card.id}
                style={{ flex: '0 0 auto' }}
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

          <div style={{ fontSize: 10, color: unavailableCount > 0 ? '#fca5a5' : 'var(--dust, #8a7560)', marginTop: 10 }}>
            {draggedAttackerId !== null
              ? 'Drag an attacker onto another card to reorder the play.'
              : unavailableCount > 0
                ? `${unavailableCount} injured player${unavailableCount > 1 ? 's are' : ' is'} unavailable for this move.`
                : 'Tap defenders to commit them forward. Drag attackers to change the order of the play.'}
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>
              AVAILABLE LINE
            </div>
            <div className="match-card-rail" style={{ padding: 0 }}>
              {defenders.map((card, index) => (
                <div
                  key={card.id}
                  className={`match-card-rail-card${openingDraw ? ' match-card-deal' : ''}`}
                  style={openingDraw ? { animationDelay: `${(attackers.length + index) * 70}ms` } : undefined}
                >
                  <PlayerCard
                    card={card}
                    size="pill"
                    selected={false}
                    dimmed={!!card.injured}
                    onClick={card.injured ? undefined : () => onToggleAttacker(card.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="match-pitch-panel"
          style={{
            position: 'relative',
            minHeight: 0,
            borderRadius: 22,
            background: `
              radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06), transparent 22%),
              linear-gradient(180deg, rgba(58,144,85,0.34), rgba(12,37,22,0.92))
            `,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03), 0 18px 36px rgba(0,0,0,0.26)',
            overflow: 'hidden',
          }}
        >
          <div className="match-pitch-lines" />
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 2,
              display: 'grid',
              gap: 5,
              maxWidth: 240,
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--cream, #f5f0e8)', fontWeight: 700 }}>
              Matchup | {opponentBuild.name} | {opponentBuild.style}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,224,0.76)', lineHeight: 1.35 }}>
              Target their {opponentBuild.weakness} weakness. Watch {opponentBuild.starPlayer.name} for {opponentBuild.starAbility.toLowerCase()}.
            </div>
          </div>

          <div style={{ position: 'absolute', inset: 0, padding: '72px 14px 92px' }}>
            {slotCards.map(({ slot, card }, index) => {
              if (!card) return null;
              const isAttacking = attackerIds.has(card.id);
              return (
                <div
                  key={card.id}
                  className={openingDraw ? 'match-card-deal' : undefined}
                  style={{
                    position: 'absolute',
                    left: `${slot.x}%`,
                    top: `${slot.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isAttacking ? 3 : 2,
                    animationDelay: openingDraw ? `${index * 70}ms` : undefined,
                  }}
                >
                  <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
                    <div
                      style={{
                        fontSize: 9,
                        color: isAttacking ? '#fde68a' : '#dbeafe',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                      }}
                    >
                      {slot.label}
                    </div>
                    <PlayerCard
                      card={card}
                      size="mini"
                      assignment={isAttacking ? 'attacking' : 'defending'}
                      selected={isAttacking}
                      dimmed={!!card.injured}
                      onClick={card.injured ? undefined : () => onToggleAttacker(card.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
              zIndex: 2,
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(7,11,9,0.72)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {(['bench', 'tactics', 'matchup'] as const).map((panel) => (
                <button
                  key={panel}
                  onClick={() => setActivePanel(panel)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: activePanel === panel ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    background: activePanel === panel ? 'rgba(232,98,26,0.18)' : 'rgba(255,255,255,0.04)',
                    color: activePanel === panel ? 'var(--cream, #f5f0e8)' : 'var(--dust, #8a7560)',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {panel}
                </button>
              ))}
            </div>

            {activePanel === 'bench' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream, #f5f0e8)', letterSpacing: 0.6 }}>
                    Bench
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
                    {matchState.subsRemaining} subs | {matchState.discardsRemaining} redraws
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                  {matchState.bench.map((card, index) => (
                    <div
                      key={card.id}
                      className={openingDraw ? 'match-card-deal' : undefined}
                      style={openingDraw ? { animationDelay: `${(attackers.length + defenders.length + index) * 70}ms` } : undefined}
                    >
                      <PlayerCard card={card} size="pill" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePanel === 'tactics' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--cream, #f5f0e8)', fontWeight: 700, letterSpacing: 0.6 }}>
                  Playbook
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                  {availableTactics.length > 0 ? availableTactics.map((tactic) => {
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
                  }) : (
                    <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
                      No tactics available for this fixture.
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePanel === 'matchup' && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--cream, #f5f0e8)', fontWeight: 700 }}>
                  Matchup | {opponentBuild.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', lineHeight: 1.4 }}>
                  Target their {opponentBuild.weakness} weakness. Watch {opponentBuild.starPlayer.name} for {opponentBuild.starAbility.toLowerCase()}.
                </div>
                <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
                  Current plan | {split.playName}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '12px 0 0',
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
              padding: '14px 0',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#1a1a1a',
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 18,
              cursor: 'pointer',
              boxShadow: '0 10px 24px rgba(245,158,11,0.28)',
            }}
          >
            Kick Off
          </button>
        </div>
      </div>
    </div>
  );
}
