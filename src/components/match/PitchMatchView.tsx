'use client';

import { useMemo, useState } from 'react';
import type { Card } from '../../lib/scoring';
import type { MatchV5State, IncrementResult } from '../../lib/match-v5';
import { getOpponentBaselines } from '../../lib/match-v5';
import type { Formation, FormationSlot } from '../../lib/formations';
import { getFormation } from '../../lib/formations';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard, TacticSlots } from '../../lib/tactics';
import type { OpponentBuild, OpponentPlayer } from '../../lib/run';

interface PitchMatchViewProps {
  matchState: MatchV5State;
  formation: Formation;
  jokers: JokerCard[];
  tacticSlots: TacticSlots;
  availableTactics: TacticCard[];
  opponentBuild: OpponentBuild;
  nextMinute: number;
  mode: 'plan' | 'resolve';
  currentResult: IncrementResult | null;
  onToggleAttacker: (cardId: number) => void;
  onToggleTactic: (tacticId: string) => void;
  onContinue: () => void;
}

const LINE = 'rgba(255,255,255,0.12)';
const lastName = (name: string) => name.split(' ').slice(-1)[0];
const cleanCommentary = (text: string) => {
  const dash = text.indexOf('— ');
  return dash >= 0 ? text.slice(dash + 2) : text;
};

interface PitchSpot {
  slot: FormationSlot;
  number: number;
  name: string | null;
  isGK: boolean;
  cardId?: number;
  isStar?: boolean;
}

/** Stable shirt numbers over a set of slots: GK = 1, then back-to-front, left-to-right. */
function numberSlots(slots: FormationSlot[]): Map<number, number> {
  const map = new Map<number, number>();
  const gkIdx = slots.findIndex((s) => s.type === 'GK');
  if (gkIdx !== -1) map.set(gkIdx, 1);
  slots
    .map((s, i) => ({ s, i }))
    .filter((e) => e.i !== gkIdx)
    .sort((a, b) => b.s.y - a.s.y || a.s.x - b.s.x)
    .forEach((e, n) => map.set(e.i, n + 2));
  return map;
}

/** Your XI placed on the active formation. */
function yourPitch(matchState: MatchV5State, formation: Formation): PitchSpot[] {
  const nums = numberSlots(formation.slots);
  return formation.slots.map((slot, i) => {
    const card = matchState.xi[i] ?? null;
    const isGK = slot.type === 'GK' || card?.position === 'GK';
    return { slot, number: nums.get(i) ?? i + 1, name: card ? lastName(card.name) : null, isGK, cardId: card?.id };
  });
}

/** Opponent XI: known players placed by position onto their formation, rest generic. */
function rivalPitch(opponentBuild: OpponentBuild): PitchSpot[] {
  const formation = getFormation(opponentBuild.formation);
  const nums = numberSlots(formation.slots);
  const filled = new Array<OpponentPlayer | null>(formation.slots.length).fill(null);
  for (const p of opponentBuild.xi) {
    let idx = formation.slots.findIndex((s, i) => filled[i] === null && s.accepts.includes(p.position));
    if (idx === -1) idx = filled.findIndex((f, i) => f === null && formation.slots[i].type !== 'GK');
    if (idx === -1) idx = filled.findIndex((f) => f === null);
    if (idx !== -1) filled[idx] = p;
  }
  return formation.slots.map((slot, i) => {
    const p = filled[i];
    const isGK = slot.type === 'GK';
    return {
      slot,
      number: nums.get(i) ?? i + 1,
      name: p ? lastName(p.name) : null,
      isGK,
      isStar: !!p && p.name === opponentBuild.starPlayer.name,
    };
  });
}

export default function PitchMatchView({
  matchState,
  formation,
  jokers,
  tacticSlots,
  availableTactics,
  opponentBuild,
  nextMinute,
  mode,
  currentResult,
  onToggleAttacker,
  onToggleTactic,
  onContinue,
}: PitchMatchViewProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [oppView, setOppView] = useState(false);
  const [tickerOpen, setTickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { attackerIds, bench, yourGoals, opponentGoals, xi } = matchState;
  const baseline = useMemo(
    () => getOpponentBaselines(matchState.opponentRound, matchState.opponentStyle, matchState.currentIncrement, matchState),
    [matchState],
  );
  const threat = ((baseline.attack + baseline.defence) / 115).toFixed(1);

  const spots = useMemo(
    () => (oppView ? rivalPitch(opponentBuild) : yourPitch(matchState, formation)),
    [oppView, opponentBuild, matchState, formation],
  );

  // Match feed (newest last). During resolve the just-played beat leads.
  const feed = useMemo(() => {
    const played = matchState.scores.map((r) => ({ minute: r.minute, text: cleanCommentary(r.event.text), type: r.event.type }));
    if (mode === 'resolve' && currentResult) {
      played.push({ minute: currentResult.minute, text: cleanCommentary(currentResult.event.text), type: currentResult.event.type });
    }
    return played;
  }, [matchState.scores, mode, currentResult]);

  // Assistant hints shown over the ticker when scouting the rivals.
  const hints = [
    { minute: nextMinute, text: `${opponentBuild.name} set up ${opponentBuild.style} in a ${opponentBuild.formation}.`, type: 'chance' as const },
    { minute: nextMinute, text: `Soft spot: ${opponentBuild.weakness.toLowerCase()} — work that channel.`, type: 'goal-yours' as const },
    { minute: nextMinute, text: `Danger man ${lastName(opponentBuild.starPlayer.name)}: ${opponentBuild.starAbility.toLowerCase()}.`, type: 'goal-opponent' as const },
  ];

  const tickerLines = oppView ? hints : (feed.length ? feed.slice(-3) : [{ minute: nextMinute, text: 'Tap players to push them forward — the last one takes the shot.', type: 'chance' as const }]);

  const manager = jokers[0] ?? null;
  const deployedIds = new Set(tacticSlots.slots.filter(Boolean).map((t) => t!.id));
  const selected = selectedId !== null ? xi.find((c) => c.id === selectedId) ?? null : null;
  const badge = opponentBuild.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'OPP';
  const colour = (type: string) => (type === 'goal-yours' ? '#86efac' : type === 'goal-opponent' ? '#fca5a5' : 'var(--cream-soft,#d9d0b8)');
  const canTapPlayers = mode === 'plan' && !oppView;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 16px 8px', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(160deg,#8b1d1d,#5c1212)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fde2e2', flexShrink: 0 }}>{badge}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream,#f5f0e8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opponentBuild.name}</div>
            <div style={{ fontSize: 11, color: 'var(--dust,#8a7560)' }}>threat <span style={{ color: '#fca5a5' }}>{'\u{1F525}'} {threat}</span></div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display,sans-serif)', fontSize: 24, lineHeight: 1, color: 'var(--cream,#f5f0e8)' }}>{yourGoals} – {opponentGoals}</div>
          <div style={{ fontSize: 11, color: 'var(--dust,#8a7560)', marginTop: 2 }}>{String(nextMinute).padStart(2, '0')}:00</div>
          <button onClick={() => setOppView((v) => !v)} style={{ marginTop: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: oppView ? '#fca5a5' : '#60a5fa', fontWeight: 600 }}>
            {oppView ? 'viewing Rivals' : 'viewing your XI'}
          </button>
        </div>
      </div>

      {/* Ticker (3 lines) — tap to expand the full match log */}
      <button onClick={() => setTickerOpen(true)} style={{ textAlign: 'left', margin: '0 16px 10px', padding: '9px 12px', borderRadius: 12, background: 'rgba(0,0,0,0.28)', border: `1px solid ${oppView ? 'rgba(139,29,29,0.4)' : 'rgba(255,255,255,0.06)'}`, flexShrink: 0, cursor: 'pointer', display: 'grid', gap: 3 }}>
        {oppView && <div style={{ fontSize: 9, color: '#fca5a5', fontWeight: 700, letterSpacing: 0.6 }}>ASSISTANT</div>}
        {tickerLines.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.4, color: colour(e.type), opacity: oppView ? 1 : 0.45 + (i / Math.max(1, tickerLines.length - 1)) * 0.55 }}>
            <span style={{ color: 'var(--dust,#8a7560)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{String(e.minute).padStart(2, '0')}:00</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.text}</span>
          </div>
        ))}
      </button>

      {/* Pitch */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 16px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', background: oppView ? 'rgba(139,29,29,0.05)' : 'rgba(255,255,255,0.015)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, borderLeft: `1px dashed ${LINE}` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 84, height: 84, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid ${LINE}` }} />

        {spots.map((spot, i) => {
          if (oppView ? false : !spot.cardId) return null;
          const committed = !oppView && spot.cardId !== undefined && attackerIds.has(spot.cardId);
          const sel = !oppView && spot.cardId === selectedId;
          const base = oppView
            ? (spot.isGK ? 'rgba(120,120,120,0.18)' : 'linear-gradient(160deg,#b1322f,#7f1d1d)')
            : (spot.isGK ? 'rgba(120,120,120,0.18)' : committed ? 'linear-gradient(160deg,#3b82f6,#1d4ed8)' : 'linear-gradient(160deg,#1d4ed8,#1e3a8a)');
          return (
            <div key={i} style={{ position: 'absolute', left: `${spot.slot.x}%`, top: `${spot.slot.y}%`, transform: 'translate(-50%,-50%)', display: 'grid', justifyItems: 'center', gap: 2, width: 64, zIndex: sel ? 6 : committed ? 4 : 3 }}>
              <button
                onClick={() => { if (!canTapPlayers || spot.isGK || spot.cardId === undefined) return; setSelectedId((s) => (s === spot.cardId ? null : spot.cardId!)); onToggleAttacker(spot.cardId); }}
                style={{
                  width: 42, height: 42, borderRadius: '50%', padding: 0, cursor: canTapPlayers && !spot.isGK ? 'pointer' : 'default',
                  background: base,
                  border: committed ? '2px solid #fbbf24' : spot.isStar ? '2px solid #fde68a' : spot.isGK ? '1px solid rgba(255,255,255,0.25)' : '2px solid rgba(255,255,255,0.18)',
                  color: '#fff', fontWeight: 800, fontSize: spot.isGK ? 11 : 14,
                  boxShadow: sel ? '0 0 0 3px rgba(96,165,250,0.5)' : committed ? '0 4px 12px rgba(37,99,235,0.4)' : '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                {spot.isGK ? 'GK' : spot.number}
              </button>
              {spot.name && (
                <span style={{ fontSize: 8.5, fontWeight: 600, color: oppView ? '#fca5a5' : committed ? '#fde68a' : 'rgba(245,240,224,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.6)', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spot.name}</span>
              )}
            </div>
          );
        })}

        {/* Player / ability popover */}
        {selected && !oppView && (() => {
          const spot = spots.find((s) => s.cardId === selected.id);
          const committed = attackerIds.has(selected.id);
          const top = spot ? Math.min(70, spot.slot.y) : 40;
          return (
            <div style={{ position: 'absolute', left: '50%', top: `${top}%`, transform: 'translate(-50%, calc(-100% - 22px))', width: 192, zIndex: 7, pointerEvents: 'none' }}>
              <div style={{ borderRadius: 12, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(96,165,250,0.45)', padding: '9px 11px', boxShadow: '0 12px 28px rgba(0,0,0,0.45)' }}>
                {committed && <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 700, marginBottom: 5 }}>ability firing</div>}
                <div style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 6, background: 'rgba(37,99,235,0.5)', fontSize: 11, fontWeight: 800, color: '#fff' }}>#{spot?.number ?? '?'} · {selected.name}</div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: 'var(--cream,#f5f0e8)' }}>{selected.tacticalRole ?? selected.archetype}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: '#bfdbfe', lineHeight: 1.35 }}>{selected.abilityText ?? (committed ? 'Pushing forward into the move.' : 'Holding position.')}</div>
              </div>
            </div>
          );
        })()}

        {/* Side tactical tab */}
        <button onClick={() => setTrayOpen(true)} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl', padding: '14px 6px', borderRadius: '10px 0 0 10px', border: '1px solid rgba(245,158,11,0.3)', borderRight: 'none', background: 'rgba(232,98,26,0.22)', color: '#fde68a', fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: 'pointer', zIndex: 5 }}>TACTICS</button>
      </div>

      {/* Bench */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px 6px', flexShrink: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: 11, color: 'var(--dust,#8a7560)', flexShrink: 0 }}>bench</span>
        {bench.slice(0, 7).map((card, i) => (
          <div key={card.id} style={{ width: 34, height: 34, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--cream-soft,#d9d0b8)', flexShrink: 0 }}>{i + 12}</div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, padding: '4px 16px 14px', flexShrink: 0 }}>
        <button onClick={() => setOppView((v) => !v)} style={{ flex: '0 0 86px', padding: '11px 0', borderRadius: 12, border: `1px solid ${oppView ? 'rgba(252,165,165,0.4)' : 'rgba(255,255,255,0.12)'}`, background: oppView ? 'rgba(139,29,29,0.18)' : 'rgba(255,255,255,0.04)', color: 'var(--cream,#f5f0e8)', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: 1.2 }}>{'⇄'}<br />{oppView ? 'Your XI' : 'Rivals'}</button>
        <button onClick={onContinue} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontFamily: 'var(--font-display,sans-serif)', fontSize: 17, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,99,235,0.35)' }}>{mode === 'resolve' ? 'Play on' : 'Continue'} {'→'}</button>
      </div>

      {/* Expanded match log */}
      {tickerOpen && (
        <div onClick={() => setTickerOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 22, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '70%', overflowY: 'auto', background: 'linear-gradient(180deg,#10160d,#0a0f0b)', borderTop: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px 16px 0 0', padding: '16px 18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream,#f5f0e8)', letterSpacing: 0.6 }}>MATCH LOG</span>
              <button onClick={() => setTickerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--dust,#8a7560)', fontSize: 18, cursor: 'pointer' }}>{'×'}</button>
            </div>
            {feed.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--dust,#8a7560)' }}>Kickoff — no events yet.</div>
            ) : feed.slice().reverse().map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: 1.6, color: colour(e.type) }}>
                <span style={{ color: 'var(--dust,#8a7560)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{String(e.minute).padStart(2, '0')}:00</span>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tactical shelf */}
      {trayOpen && (
        <div onClick={() => setTrayOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '82%', maxWidth: 340, height: '100%', background: 'linear-gradient(180deg,#10160d,#0a0f0b)', borderLeft: '1px solid rgba(245,158,11,0.2)', padding: '16px 16px 20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', letterSpacing: 0.8 }}>TACTICAL SHELF</span>
              <button onClick={() => setTrayOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--dust,#8a7560)', fontSize: 18, cursor: 'pointer' }}>{'×'}</button>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dust,#8a7560)', letterSpacing: 0.8, marginBottom: 6 }}>MANAGER</div>
            <div style={{ borderRadius: 12, padding: '11px 13px', marginBottom: 18, background: manager ? 'linear-gradient(160deg,rgba(212,160,53,0.18),rgba(0,0,0,0.25))' : 'rgba(255,255,255,0.03)', border: `1px solid ${manager ? 'rgba(212,160,53,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
              {manager ? (<>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream,#f5f0e8)' }}>{manager.name}</div>
                <div style={{ fontSize: 12, color: '#e7c98a', marginTop: 3, lineHeight: 1.4 }}>{manager.effect}</div>
              </>) : (<div style={{ fontSize: 12, color: 'var(--dust,#8a7560)' }}>No manager — sign one in the shop.</div>)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dust,#8a7560)', letterSpacing: 0.8 }}>TACTICAL CARDS</span>
              <span style={{ fontSize: 10, color: 'var(--dust,#8a7560)' }}>{deployedIds.size}/{tacticSlots.slots.length} deployed</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {availableTactics.length === 0 && <div style={{ fontSize: 12, color: 'var(--dust,#8a7560)' }}>No tactical cards drafted for this fixture.</div>}
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
    </div>
  );
}
