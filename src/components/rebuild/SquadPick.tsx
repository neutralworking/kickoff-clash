'use client';

/**
 * Squad selection (SM §9): XI + reserves with the regime pre-evaluation on
 * every card (lit/dim trait pills), a LIVE adherence band indicator as the
 * formation changes, and the energy/tactical-hand preview. Tap an XI card
 * then a reserve to swap (positions must stay legal).
 */

import { useMemo, useState } from 'react';
import type { RunState } from '../../engine/run';
import type { ManagerDef } from '../../engine/data/managers';
import type { EngineCard } from '../../engine/cards';
import { isLegalXI } from '../../engine/cards';
import { ENGINE_CARDS } from '../../engine/data/cards.gen';
import { pickXI, fitScore, managerSignatures } from '../../engine/draft';
import { adherenceBand, ADHERENCE_FACTOR, FORMATION_ADJACENCY } from '../../engine/data/adherence';
import { TACTICAL_CARDS } from '../../engine/data/tactical-cards';
import { ENERGY_BUDGET, SUBS_BUDGET } from '../../engine/data/baseline';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';
import { Chip } from './ManagerPick';
import RCard from './RCard';

const cardById = new Map(ENGINE_CARDS.map((c) => [c.id, c]));

export default function SquadPick({
  run,
  manager,
  onKickoff,
  onBack,
}: {
  run: RunState;
  manager: ManagerDef;
  onKickoff: (xi: EngineCard[], formation: string) => void;
  onBack: () => void;
}) {
  const sigs = useMemo(() => managerSignatures(manager), [manager]);
  const roster = useMemo(() => run.squad.map((id) => cardById.get(id)!), [run.squad]);
  const [xi, setXi] = useState<EngineCard[]>(() => pickXI(roster, (c) => fitScore(c, sigs)));
  const [formation, setFormation] = useState(manager.preferredFormation);
  const [swapping, setSwapping] = useState<EngineCard | null>(null);

  const reserves = roster.filter((c) => !xi.some((x) => x.id === c.id));
  const legal = isLegalXI(xi);
  const band = adherenceBand(formation, manager.preferredFormation);
  const formations = [manager.preferredFormation, ...(FORMATION_ADJACENCY[manager.preferredFormation] ?? [])];

  const trySwap = (reserve: EngineCard) => {
    if (!swapping) return;
    setXi((prev) => prev.map((c) => (c.id === swapping.id ? reserve : c)));
    setSwapping(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 16, paddingBottom: 8 }}>
      <header className="flex items-center justify-between">
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 11, color: 'var(--dust)' }}>PICK YOUR XI</div>
        <div className="flex" style={{ gap: 6 }}>
          <Chip label={`ENERGY ${ENERGY_BUDGET}`} dim />
          <Chip label={`SUBS ${SUBS_BUDGET}`} dim />
          <Chip label={`${TACTICAL_CARDS.length} TACTICS`} dim />
        </div>
      </header>

      {/* Adherence: live band indicator as the formation changes (SM §7). */}
      <RPanel style={{ padding: 10 }}>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <div className="flex" style={{ gap: 6 }}>
            {formations.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormation(f)}
                style={{
                  fontFamily: PIXEL_FONT,
                  fontSize: 9,
                  padding: '6px 8px',
                  borderRadius: 3,
                  border: `1px solid ${formation === f ? 'var(--gold)' : 'var(--border)'}`,
                  color: formation === f ? 'var(--gold)' : 'var(--dust)',
                  background: formation === f ? 'rgba(232,178,60,0.12)' : 'transparent',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <Chip
            label={`${band.toUpperCase()} ${Math.round(ADHERENCE_FACTOR[band] * 100)}%`}
            color={band === 'native' ? 'var(--success)' : band === 'adjacent' ? 'var(--gold)' : 'var(--kit-red)'}
          />
        </div>
      </RPanel>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SectionLabel text={swapping ? `SWAPPING OUT ${swapping.name.toUpperCase()} — PICK A RESERVE` : 'STARTING XI (tap to swap)'} />
        {xi.map((c) => (
          <RCard
            key={c.id}
            card={c}
            sigs={sigs}
            selected={swapping?.id === c.id}
            onClick={() => setSwapping(swapping?.id === c.id ? null : c)}
          />
        ))}
        <SectionLabel text={`RESERVES (${reserves.length})`} />
        {reserves.map((c) => (
          <RCard key={c.id} card={c} sigs={sigs} onClick={swapping ? () => trySwap(c) : undefined} />
        ))}
      </div>

      <div className="flex" style={{ gap: 8 }}>
        <RButton onClick={onBack} style={{ flex: 1 }}>
          BACK
        </RButton>
        <RButton accent disabled={!legal} onClick={() => onKickoff(xi, formation)} style={{ flex: 2 }}>
          {legal ? 'KICK OFF →' : 'XI NOT LEGAL'}
        </RButton>
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, letterSpacing: 1, color: 'var(--dust)', margin: '6px 2px 2px' }}>
      {text}
    </div>
  );
}
