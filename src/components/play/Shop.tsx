'use client';

/**
 * KC six-contest UI — the shop, rebuilt as the PACK OPENING (design handoff:
 * design/handoff/pack-opening/, 1C Foil Premium).
 *
 * Between fixtures the shop opens a nine-card pack (engine `packOffer`:
 * seeded, rarity-shaped, never re-offers owned cards). Cards cascade in on the
 * FoilCard reveal stagger; tapping an affordable card BUYS it (`buyCard`) —
 * owned cards lead every future fixture's draft stream. Quality investment
 * stays as the second cash sink, condensed below the pack. The engine does all
 * the maths; this screen renders offers and forwards taps.
 */

import { useMemo, useState } from 'react';
import {
  type Contest,
  type KCCard,
  type Manager,
  type RunState,
  investCash,
  deckDialBonus,
  packOffer,
  buyCard,
  CARD_PRICE,
} from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, PIXEL, CONTEST_COLOR } from './ui';
import FoilCard from '../cards/FoilCard';

export default function Shop({
  run,
  manager,
  pool,
  onDone,
}: {
  run: RunState;
  manager: Manager;
  pool: KCCard[];
  onDone: (next: RunState) => void;
}) {
  const [draft, setDraft] = useState<RunState>(run);
  // the pack is fixed for this visit (seeded off the settled run, not the draft,
  // so buying a card doesn't reshuffle the offer in front of the player)
  const pack = useMemo(() => packOffer(run, pool), [run, pool]);
  const spent = Math.round((run.cash - draft.cash) * 10) / 10;
  const bonus = deckDialBonus(draft.quality);
  const tiers = [5, 10, 20].filter((t) => t <= Math.floor(draft.cash));

  const owned = (c: KCCard) => draft.collection.includes(c.id);
  const tapCard = (c: KCCard) => setDraft((d) => buyCard(d, c));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <Eyebrow color="var(--gold)">THE SHOP · AFTER FIXTURE {run.fixture}</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--cream)', marginTop: 2 }}>PLAYER PACK</div>
        </div>
        <Chip color="var(--gold)">£{Math.floor(draft.cash)}</Chip>
      </div>

      {/* Info line (one line only, per the handoff). */}
      <div
        style={{
          fontFamily: PIXEL,
          fontSize: 8,
          color: 'var(--cream-soft)',
          border: '1px solid rgba(212,160,53,0.28)',
          background: 'rgba(212,160,53,0.06)',
          borderRadius: 8,
          padding: '8px 12px',
        }}
      >
        Tap a card to buy it — owned players lead every future squad draft.
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* The pack: 3 × 3 cascade. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', alignItems: 'start', gap: 7, padding: '2px 0' }}>
          {pack.map((c, i) => (
            <FoilCard
              key={c.id}
              card={c}
              revealDelayMs={i * 90}
              priceTag={`£${CARD_PRICE[c.rarity]}`}
              owned={owned(c)}
              onClick={() => tapCard(c)}
            />
          ))}
        </div>

        {/* Quality investment — the second sink, condensed. */}
        <PPanel style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Eyebrow>DECK QUALITY {Math.round(draft.quality)}{spent > 0 && <span style={{ color: 'var(--success)' }}> (+{Math.round((draft.quality - run.quality) * 10) / 10})</span>}</Eyebrow>
            <div style={{ display: 'flex', gap: 4 }}>
              {(Object.entries(bonus) as [Contest, number][]).filter(([, n]) => (n ?? 0) >= 1).map(([c, n]) => (
                <Chip key={c} color={CONTEST_COLOR[c]}>{c} +{Math.round(n)}</Chip>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {tiers.map((t) => (
              <PButton key={t} onClick={() => setDraft((d) => investCash(d, t))} style={{ flex: 1, minWidth: 80, fontSize: 9 }}>
                INVEST £{t}
              </PButton>
            ))}
            {tiers.length === 0 && (
              <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)' }}>No cash left to invest.</div>
            )}
          </div>
        </PPanel>

        {spent > 0 && (
          <PButton onClick={() => setDraft(run)} style={{ fontSize: 8, padding: '6px 10px' }}>
            RESET SHOP (£{spent} BACK)
          </PButton>
        )}
      </div>

      <PButton accent onClick={() => onDone(draft)}>NEXT FIXTURE →</PButton>
    </div>
  );
}
