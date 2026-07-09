'use client';

/**
 * KC six-contest UI (NW-143) — the shop.
 *
 * Between fixtures: invest cash into the deck. Quality is the engine's deck
 * strength (run.ts) — it lifts possession + creation + the finish (deckDialBonus
 * previews exactly what a purchase buys on the pitch). The engine does the maths
 * (investCash); the shop just offers the tiers.
 */

import { useState } from 'react';
import { type Contest, type Manager, type RunState, investCash, deckDialBonus } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, Meter, PIXEL, CONTEST_COLOR } from './ui';

export default function Shop({ run, manager, onDone }: { run: RunState; manager: Manager; onDone: (next: RunState) => void }) {
  const [draft, setDraft] = useState<RunState>(run);
  const spent = Math.round(run.cash - draft.cash);
  const bonus = deckDialBonus(draft.quality);

  const tiers = [5, 10, 20].filter((t) => t <= Math.floor(run.cash));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <Eyebrow color="var(--gold)">THE SHOP</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--cream)', marginTop: 2 }}>INVEST IN THE DECK</div>
        </div>
        <Chip color="var(--gold)">£{Math.floor(draft.cash)}</Chip>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PPanel glow style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Eyebrow>DECK QUALITY</Eyebrow>
            <div style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--gold)' }}>{Math.round(draft.quality)}{spent > 0 && <span style={{ fontSize: 9, color: 'var(--success)' }}> (+{Math.round(draft.quality - run.quality)})</span>}</div>
          </div>
          <div style={{ marginTop: 8 }}><Meter value={draft.quality} max={60} color="var(--gold)" /></div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            <Eyebrow>BUYS ON THE PITCH</Eyebrow>
            {(Object.entries(bonus) as [Contest, number][]).filter(([, n]) => (n ?? 0) >= 1).map(([c, n]) => (
              <Chip key={c} color={CONTEST_COLOR[c]}>{c} +{Math.round(n)}</Chip>
            ))}
          </div>
        </PPanel>

        <PPanel style={{ padding: 12 }}>
          <Eyebrow>INVEST CASH → QUALITY</Eyebrow>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {tiers.map((t) => (
              <PButton key={t} onClick={() => setDraft((d) => investCash(d, t))} disabled={draft.cash < t} style={{ flex: 1, minWidth: 90, fontSize: 10 }}>
                SPEND £{t}
              </PButton>
            ))}
            {Math.floor(draft.cash) > 0 && (
              <PButton onClick={() => setDraft((d) => investCash(d, Math.floor(d.cash)))} style={{ flex: 1, minWidth: 90, fontSize: 10 }}>
                ALL IN £{Math.floor(draft.cash)}
              </PButton>
            )}
          </div>
          {tiers.length === 0 && Math.floor(draft.cash) === 0 && (
            <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', marginTop: 8 }}>No cash to invest — beat fixtures by more to bank it.</div>
          )}
          {spent > 0 && (
            <PButton onClick={() => setDraft(run)} style={{ fontSize: 8, padding: '6px 10px', marginTop: 8 }}>RESET</PButton>
          )}
        </PPanel>

        <div style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', lineHeight: 1.6, padding: '0 2px' }}>
          A stronger deck controls more possession, creates more, and finishes better — the flat dial bonus every card carries. Save for a boss, or compound early.
        </div>
      </div>

      <PButton accent onClick={() => onDone(draft)}>NEXT FIXTURE →</PButton>
    </div>
  );
}
