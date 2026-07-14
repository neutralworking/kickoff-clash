'use client';

// TEMPORARY preview harness for FoilCard — delete after visual verification.

import { useEffect, useState } from 'react';
import FoilCard from '../../components/cards/FoilCard';
import type { KCCard } from '../../engine-v2';
import { fromJSON, type KCCardJSON } from '../../engine-v2';

export default function FoilPreview() {
  const [cards, setCards] = useState<KCCard[]>([]);
  useEffect(() => {
    fetch('/data/kc_v2_cards.json')
      .then((r) => r.json())
      .then((rows: KCCardJSON[]) => {
        const byRarity = (r: string, n: number) => rows.filter((c) => c.rarity === r).slice(0, n).map(fromJSON);
        setCards([
          ...byRarity('Common', 3),
          ...byRarity('Rare', 2),
          ...byRarity('Epic', 2),
          ...byRarity('Legendary', 2),
        ]);
      });
  }, []);
  if (cards.length < 9) return <div id="loading">loading…</div>;
  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse at 50% 18%, #14281a 0%, #0a0f0b 60%, #070907 100%)', padding: '20px 0' }} id="ready">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', alignItems: 'start', gap: 7, padding: '8px 12px 4px' }}>
        {cards.map((c, i) => (
          <FoilCard key={c.id} card={c} width={118} revealDelayMs={i * 70} onClick={() => {}} selected={i === 4} priceTag={i === 2 ? '£4' : undefined} owned={i === 3} />
        ))}
      </div>
    </div>
  );
}
