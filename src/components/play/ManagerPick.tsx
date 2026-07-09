'use client';

/**
 * KC six-contest UI (NW-143) — run start: manager choice-of-three.
 *
 * Each offer card shows the manager's one-line win condition, default posture,
 * preferred formation, and its committed-gated reweight package (the contest it
 * rewards). Picking one seeds the run. SM §9: the win condition is stated up
 * front so the player drafts toward it.
 */

import type { Contest, Manager } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, PIXEL, CONTEST_COLOR } from './ui';

const POSTURE_COLOR: Record<string, string> = {
  attack: 'var(--kit-red)',
  balanced: 'var(--gold)',
  defend: 'var(--kit-blue)',
};

export default function ManagerPick({
  offer,
  seed,
  onPick,
  onReroll,
}: {
  offer: Manager[];
  seed: number;
  onPick: (m: Manager) => void;
  onReroll: () => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 12 }}>
      <div>
        <Eyebrow color="var(--gold)">NEW RUN · SEED {seed}</Eyebrow>
        <div style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--cream)', marginTop: 2 }}>PICK YOUR MANAGER</div>
        <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', marginTop: 4, lineHeight: 1.5 }}>
          The manager sets your win condition. Draft a squad that COMMITS to its contest — the reweight only pays a committed build.
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {offer.map((m) => (
          <PPanel key={m.id} style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 13, color: 'var(--cream)' }}>{m.name}</div>
              <Chip color={POSTURE_COLOR[m.posture]}>{m.posture.toUpperCase()}</Chip>
            </div>
            <div style={{ fontFamily: PIXEL, fontSize: 8.5, color: 'var(--cream-soft)', lineHeight: 1.55, marginTop: 6 }}>{m.winCon}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
              <Eyebrow>REWARDS</Eyebrow>
              {(Object.entries(m.reweight) as [Contest, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([c, n]) => (
                  <Chip key={c} color={CONTEST_COLOR[c]} filled={c === m.favoured}>
                    {c} +{n}
                  </Chip>
                ))}
              <span style={{ flex: 1 }} />
              <Chip>{m.formation}</Chip>
            </div>
            {(m.variance || m.fitnessDrain || m.cashOnGoal) && (
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                {m.variance && <Chip color="var(--epic, #a855f7)">{m.variance === 'amplify' ? 'BOOM OR BUST' : 'CONSISTENT'}</Chip>}
                {m.fitnessDrain ? <Chip color="var(--kit-blue)">PRESS DRAINS LEGS</Chip> : null}
                {m.cashOnGoal ? <Chip color="var(--gold)">CASH ON GOAL</Chip> : null}
              </div>
            )}
            <PButton accent onClick={() => onPick(m)} style={{ width: '100%', marginTop: 10 }}>
              MANAGE {m.name.toUpperCase()} →
            </PButton>
          </PPanel>
        ))}
      </div>

      <PButton onClick={onReroll}>REROLL OFFER</PButton>
    </div>
  );
}
