'use client';

/**
 * KC six-contest UI (NW-143) — squad selection, the strategy surface (SM §9).
 *
 * The player fields an XI in the manager's formation. Every card is
 * PRE-EVALUATED against the manager's plan: lit = feeds the commitment the
 * reweight needs, red = fights it (the mirror contest), dim = neutral. The
 * COMMITMENT gate is the headline read — a build under the threshold is warned
 * that the reweight won't pay. Adherence band + energy/tactical hand preview sit
 * alongside. All the maths is the engine's (contestDials / COMMIT_MIN).
 */

import { useMemo, useState } from 'react';
import {
  type Contest,
  type KCCard,
  type Manager,
  type FixtureSetup,
  type RunState,
  contestDials,
  COMMIT_MIN,
  MIRROR,
  FORMATIONS,
  adherenceBand,
  TACTICS,
  DEFAULT_ENERGY,
} from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, Meter, PIXEL, CONTEST_COLOR } from './ui';
import PCard, { type Regime } from './PCard';

function regimeFor(card: KCCard, favoured: Contest): Regime {
  if (card.contest === favoured) return 'lit';
  if (card.contest === MIRROR[favoured]) return 'red';
  return 'dim';
}

export default function SquadPick({
  run,
  manager,
  setup,
  onKickoff,
  onBack,
}: {
  run: RunState;
  manager: Manager;
  setup: FixtureSetup;
  onKickoff: (xi: KCCard[]) => void;
  onBack: () => void;
}) {
  const slots = FORMATIONS[manager.formation];
  const [xi, setXi] = useState<KCCard[]>(() => setup.suggestedXI.slice(0, slots.length));
  const [picking, setPicking] = useState<number | null>(null);

  const favoured = manager.favoured;
  const dials = useMemo(() => contestDials(xi), [xi]);
  const favDial = dials[favoured];
  const threshold = COMMIT_MIN[favoured];
  const committed = favDial >= threshold;
  const band = adherenceBand(manager.formation, manager.formation); // formation fixed to the manager's in v1 → native
  const used = useMemo(() => new Set(xi.map((c) => c.id)), [xi]);

  const swap = (slotIdx: number, card: KCCard) => {
    setXi((prev) => prev.map((c, i) => (i === slotIdx ? card : c)));
    setPicking(null);
  };

  const options = (slotIdx: number): KCCard[] => {
    const pos = slots[slotIdx];
    return setup.pool
      .filter((c) => c.pos === pos && (!used.has(c.id) || c.id === xi[slotIdx]?.id))
      .sort((a, b) => (b.contest === favoured ? 1 : 0) - (a.contest === favoured ? 1 : 0) || b.tilt - a.tilt || b.att + b.def - (a.att + a.def))
      .slice(0, 24);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <Eyebrow color="var(--gold)">SELECT XI · {manager.formation}</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', marginTop: 2 }}>{manager.name.toUpperCase()}</div>
        </div>
        <Chip color={band === 'native' ? 'var(--success)' : band === 'adjacent' ? 'var(--gold)' : 'var(--kit-red)'}>
          {band.toUpperCase()} SHAPE
        </Chip>
      </div>

      {/* Commitment gate — the headline read. */}
      <PPanel glow={committed} style={{ padding: 12, border: committed ? '1px solid var(--gold)' : '1px solid var(--kit-red)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow color={committed ? 'var(--gold)' : 'var(--kit-red)'}>
            {manager.name.toUpperCase()} REWARDS {favoured}
          </Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 9, color: committed ? 'var(--success)' : 'var(--kit-red)' }}>
            {committed ? 'COMMITTED ✓' : 'NOT COMMITTED'}
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <Meter value={favDial} max={threshold} color={committed ? 'var(--gold)' : 'var(--kit-red)'} height={7} />
        </div>
        <div style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', marginTop: 5, lineHeight: 1.5 }}>
          {favoured} tilt {favDial} / {threshold} needed. {committed
            ? 'The reweight pays — your win-con is live.'
            : `Field more ${favoured} cards (lit gold) to open the gate, or the reweight pays nothing.`}
        </div>
      </PPanel>

      {/* The XI grid. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {xi.map((card, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Eyebrow style={{ fontSize: 6, textAlign: 'center' }}>{slots[i]}</Eyebrow>
              <PCard card={card} regime={regimeFor(card, favoured)} onClick={() => setPicking(i)} compact />
            </div>
          ))}
        </div>

        {/* Energy / tactical hand preview. */}
        <PPanel style={{ padding: 10, marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow>TACTICAL HAND</Eyebrow>
            <Chip color="var(--gold)">ENERGY {DEFAULT_ENERGY}⚡</Chip>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {TACTICS.map((t) => (
              <Chip key={t.id} color={t.posture === 'attack' ? 'var(--kit-red)' : t.posture === 'defend' ? 'var(--kit-blue)' : 'var(--gold)'}>
                {t.name.toUpperCase()} · {t.energyCost}⚡
              </Chip>
            ))}
          </div>
          <div style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', marginTop: 6, lineHeight: 1.5 }}>
            Timed posture windows — they fire between batches during the match.
          </div>
        </PPanel>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <PButton onClick={onBack} style={{ flex: 1, fontSize: 10 }}>← BACK</PButton>
        <PButton accent onClick={() => onKickoff(xi)} style={{ flex: 2 }}>
          {committed ? 'KICK OFF →' : 'KICK OFF ANYWAY →'}
        </PButton>
      </div>

      {/* Slot picker overlay. */}
      {picking !== null && (
        <div
          onClick={() => setPicking(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-surface"
            style={{ width: '100%', maxWidth: 480, maxHeight: '70dvh', borderRadius: '14px 14px 0 0', padding: 14, overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream)' }}>PICK {slots[picking]}</div>
              <Chip color={CONTEST_COLOR[favoured]}>WANT {favoured}</Chip>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {options(picking).map((c) => (
                <PCard key={c.id} card={c} regime={regimeFor(c, favoured)} selected={c.id === xi[picking]?.id} onClick={() => swap(picking, c)} compact />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
