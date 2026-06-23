'use client';

import { useMemo, useState } from 'react';
import type { Card } from '../../lib/scoring';
import type { MatchV5State } from '../../lib/match-v5';
import { getOpponentBaselines } from '../../lib/match-v5';
import type { Formation } from '../../lib/formations';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import type { OpponentBuild } from '../../lib/run';

interface PitchMatchViewProps {
  matchState: MatchV5State;
  formation: Formation;
  jokers: JokerCard[];
  tacticSlots: TacticSlots;
  availableTactics: TacticCard[];
  opponentBuild: OpponentBuild;
  nextMinute: number;
  onToggleAttacker: (cardId: number) => void;
  onToggleTactic: (tacticId: string) => void;
  onKickOff: () => void;
}

const FELT_LINE = 'rgba(255,255,255,0.12)';

/** Stable, football-ish shirt numbers: GK = 1, then back-to-front, left-to-right. */
function shirtNumbers(slotCards: { card: Card | null }[], formation: Formation): Map<number, number> {
  const map = new Map<number, number>();
  const entries = formation.slots
    .map((slot, i) => ({ slot, card: slotCards[i]?.card ?? null }))
    .filter((e): e is { slot: Formation['slots'][number]; card: Card } => !!e.card);
  const gk = entries.find((e) => e.slot.type === 'GK' || e.card.position === 'GK');
  if (gk) map.set(gk.card.id, 1);
  const rest = entries
    .filter((e) => e !== gk)
    .sort((a, b) => b.slot.y - a.slot.y || a.slot.x - b.slot.x);
  rest.forEach((e, i) => map.set(e.card.id, i + 2));
  return map;
}

function cleanCommentary(text: string): string {
  const dash = text.indexOf('— ');
  return dash >= 0 ? text.slice(dash + 2) : text;
}

export default function PitchMatchView({
  matchState,
  formation,
  jokers,
  tacticSlots,
  availableTactics,
  opponentBuild,
  nextMinute,
  onToggleAttacker,
  onToggleTactic,
  onKickOff,
}: PitchMatchViewProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [oppView, setOppView] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { xi, attackerIds, bench, yourGoals, opponentGoals } = matchState;
  const slotCards = formation.slots.map((slot, index) => ({ slot, card: xi[index] ?? null }));
  const numbers = useMemo(() => shirtNumbers(slotCards, formation), [slotCards, formation]);

  const baseline = useMemo(
    () => getOpponentBaselines(matchState.opponentRound, matchState.opponentStyle, matchState.currentIncrement, matchState),
    [matchState],
  );
  const threat = ((baseline.attack + baseline.defence) / 115).toFixed(1);

  const feed = matchState.scores.map((r) => ({
    minute: r.minute,
    text: cleanCommentary(r.event.text),
    type: r.event.type,
  }));

  const manager = jokers[0] ?? null;
  const deployedIds = new Set(tacticSlots.slots.filter(Boolean).map((t) => t!.id));
  const selected = selectedId !== null ? xi.find((c) => c.id === selectedId) ?? null : null;

  const badge = opponentBuild.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'OPP';

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Header — opponent, threat, score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px 10px', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'linear-gradient(160deg,#8b1d1d,#5c1212)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fde2e2', flexShrink: 0 }}>
            {badge}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream,#f5f0e8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opponentBuild.name}</div>
            <div style={{ fontSize: 12, color: 'var(--dust,#8a7560)' }}>threat <span style={{ color: '#fca5a5' }}>{'\u{1F525}'} {threat}</span></div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display,sans-serif)', fontSize: 26, lineHeight: 1, color: 'var(--cream,#f5f0e8)' }}>{yourGoals} – {opponentGoals}</div>
          <div style={{ fontSize: 12, color: 'var(--dust,#8a7560)', marginTop: 2 }}>{String(nextMinute).padStart(2, '0')}:00</div>
          <button onClick={() => setOppView((v) => !v)} style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>
            {oppView ? 'viewing Rivals' : 'viewing your XI'}
          </button>
        </div>
      </div>

      {/* Commentary feed */}
      <div style={{ margin: '0 16px 12px', padding: feed.length ? '12px 14px' : '10px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, maxHeight: 116, overflowY: 'auto' }}>
        {feed.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--dust,#8a7560)' }}>
            <span style={{ color: 'var(--cream-soft,#d9d0b8)', fontVariantNumeric: 'tabular-nums' }}>{String(nextMinute).padStart(2, '0')}:00</span>{'  '}
            Pick your move — tap players to push them forward; the last one takes the shot.
          </div>
        ) : (
          feed.slice(-4).map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: 1.5, color: e.type === 'goal-yours' ? '#86efac' : e.type === 'goal-opponent' ? '#fca5a5' : 'var(--cream-soft,#d9d0b8)' }}>
              <span style={{ color: 'var(--dust,#8a7560)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{String(e.minute).padStart(2, '0')}:00</span>
              <span>{e.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Pitch */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 16px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)', overflow: 'hidden' }}>
        {/* centre line */}
        <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, borderLeft: `1px dashed ${FELT_LINE}` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 92, height: 92, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid ${FELT_LINE}` }} />

        {slotCards.map(({ slot, card }) => {
          if (!card) return null;
          const isGK = slot.type === 'GK' || card.position === 'GK';
          const committed = attackerIds.has(card.id);
          const num = numbers.get(card.id) ?? '?';
          return (
            <button
              key={card.id}
              onClick={() => { setSelectedId((s) => (s === card.id ? null : card.id)); if (!isGK) onToggleAttacker(card.id); }}
              style={{
                position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%,-50%)',
                width: 46, height: 46, borderRadius: '50%', cursor: isGK ? 'default' : 'pointer', padding: 0,
                background: isGK ? 'rgba(120,120,120,0.18)' : committed ? 'linear-gradient(160deg,#3b82f6,#1d4ed8)' : 'linear-gradient(160deg,#1d4ed8,#1e3a8a)',
                border: committed ? '2px solid #fbbf24' : isGK ? '1px solid rgba(255,255,255,0.25)' : '2px solid rgba(255,255,255,0.18)',
                color: '#fff', fontWeight: 800, fontSize: isGK ? 12 : 15,
                boxShadow: selectedId === card.id ? '0 0 0 3px rgba(96,165,250,0.5)' : committed ? '0 4px 12px rgba(37,99,235,0.4)' : '0 2px 6px rgba(0,0,0,0.3)',
                zIndex: selectedId === card.id ? 6 : committed ? 4 : 3,
              }}
            >
              {isGK ? 'GK' : num}
            </button>
          );
        })}

        {/* Player / ability popover */}
        {selected && (() => {
          const sc = slotCards.find((s) => s.card?.id === selected.id);
          const committed = attackerIds.has(selected.id);
          const top = sc ? Math.min(72, sc.slot.y) : 40;
          return (
            <div style={{ position: 'absolute', left: '50%', top: `${top}%`, transform: 'translate(-50%, calc(-100% - 26px))', width: 196, zIndex: 7, pointerEvents: 'none' }}>
              <div style={{ borderRadius: 12, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(96,165,250,0.45)', padding: '10px 12px', boxShadow: '0 12px 28px rgba(0,0,0,0.45)' }}>
                {committed && <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 700, marginBottom: 6 }}>ability firing</div>}
                <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, background: 'rgba(37,99,235,0.5)', fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  #{numbers.get(selected.id) ?? '?'} · {selected.name}
                </div>
                <div style={{ marginTop: 7, fontSize: 14, fontWeight: 800, color: 'var(--cream,#f5f0e8)' }}>{selected.tacticalRole ?? selected.archetype}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: '#bfdbfe', lineHeight: 1.35 }}>{selected.abilityText ?? (committed ? 'Pushing forward into the move.' : 'Holding position.')}</div>
              </div>
            </div>
          );
        })()}

        {/* Side tactical tab */}
        <button
          onClick={() => setTrayOpen(true)}
          style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl', padding: '14px 6px', borderRadius: '10px 0 0 10px', border: '1px solid rgba(245,158,11,0.3)', borderRight: 'none', background: 'rgba(232,98,26,0.22)', color: '#fde68a', fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: 'pointer', zIndex: 5 }}
        >
          TACTICS
        </button>
      </div>

      {/* Bench */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 8px', flexShrink: 0, overflowX: 'auto' }}>
        <span style={{ fontSize: 12, color: 'var(--dust,#8a7560)', flexShrink: 0 }}>bench</span>
        {bench.map((card, i) => (
          <div key={card.id} style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--cream-soft,#d9d0b8)', flexShrink: 0 }}>
            {i + 12}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, padding: '4px 16px 16px', flexShrink: 0 }}>
        <button onClick={() => setOppView((v) => !v)} style={{ flex: '0 0 92px', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--cream,#f5f0e8)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {'⇄'}<br />Rivals
        </button>
        <button onClick={onKickOff} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontFamily: 'var(--font-display,sans-serif)', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,99,235,0.35)' }}>
          Continue {'→'}
        </button>
      </div>

      {/* Tactical tray */}
      {trayOpen && (
        <div onClick={() => setTrayOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '82%', maxWidth: 340, height: '100%', background: 'linear-gradient(180deg,#10160d,#0a0f0b)', borderLeft: '1px solid rgba(245,158,11,0.2)', padding: '16px 16px 20px', overflowY: 'auto', boxShadow: '-16px 0 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', letterSpacing: 0.8 }}>TACTICAL SHELF</span>
              <button onClick={() => setTrayOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--dust,#8a7560)', fontSize: 18, cursor: 'pointer' }}>{'×'}</button>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dust,#8a7560)', letterSpacing: 0.8, marginBottom: 6 }}>MANAGER</div>
            <div style={{ borderRadius: 12, padding: '11px 13px', marginBottom: 18, background: manager ? 'linear-gradient(160deg,rgba(212,160,53,0.18),rgba(0,0,0,0.25))' : 'rgba(255,255,255,0.03)', border: `1px solid ${manager ? 'rgba(212,160,53,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
              {manager ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream,#f5f0e8)' }}>{manager.name}</div>
                  <div style={{ fontSize: 12, color: '#e7c98a', marginTop: 3, lineHeight: 1.4 }}>{manager.effect}</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--dust,#8a7560)' }}>No manager — sign one in the shop.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dust,#8a7560)', letterSpacing: 0.8 }}>TACTICAL CARDS</span>
              <span style={{ fontSize: 10, color: 'var(--dust,#8a7560)' }}>{deployedIds.size}/{tacticSlots.slots.length} deployed</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {availableTactics.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--dust,#8a7560)' }}>No tactical cards drafted for this fixture.</div>
              )}
              {availableTactics.map((tactic) => {
                const active = deployedIds.has(tactic.id);
                return (
                  <button key={tactic.id} onClick={() => onToggleTactic(tactic.id)} style={{ textAlign: 'left', borderRadius: 11, padding: '10px 12px', cursor: 'pointer', background: active ? 'linear-gradient(160deg,rgba(245,158,11,0.2),rgba(0,0,0,0.25))' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.09)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream,#f5f0e8)' }}>{tactic.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#fde68a' : 'var(--dust,#8a7560)' }}>{active ? 'DEPLOYED' : 'tap to deploy'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--cream-soft,#d9d0b8)', marginTop: 3, lineHeight: 1.4 }}>{tactic.effect}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rivals scouting overlay */}
      {oppView && (
        <div onClick={() => setOppView(false)} style={{ position: 'absolute', inset: 0, zIndex: 18, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, borderRadius: 16, background: 'linear-gradient(180deg,#1a1110,#0c0807)', border: '1px solid rgba(139,29,29,0.5)', padding: '18px 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fca5a5', letterSpacing: 0.8 }}>SCOUTING REPORT</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--cream,#f5f0e8)', marginTop: 4 }}>{opponentBuild.name}</div>
            <div style={{ fontSize: 13, color: 'var(--dust,#8a7560)', marginTop: 2 }}>{opponentBuild.style} · {opponentBuild.formation} · threat {'\u{1F525}'} {threat}</div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--cream-soft,#d9d0b8)', lineHeight: 1.5 }}>
              Weak against <b style={{ color: '#86efac' }}>{opponentBuild.weakness}</b>. Their danger man is <b style={{ color: '#fde68a' }}>{opponentBuild.starPlayer.name}</b> — {opponentBuild.starAbility.toLowerCase()}.
            </div>
            <button onClick={() => setOppView(false)} style={{ marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--cream,#f5f0e8)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back to your XI</button>
          </div>
        </div>
      )}
    </div>
  );
}
