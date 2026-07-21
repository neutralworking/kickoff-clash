'use client';

import type { V6Card } from '@/lib/match-v6';
import { V6BenchCard } from './V6BenchCard';

export function V6Bench(props: {
  cards: { card: V6Card; cost: number }[];
  selectedId?: string | null;
  spentIds: string[];
  affordableUnspent: (id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="v6-bench">
      {props.cards.map(({ card, cost }) => {
        const spent = props.spentIds.includes(card.id);
        return (
          <V6BenchCard
            key={card.id}
            card={card}
            cost={cost}
            selected={props.selectedId === card.id}
            spent={spent}
            dim={!spent && !props.affordableUnspent(card.id)}
            onClick={() => props.onSelect(card.id)}
          />
        );
      })}
    </div>
  );
}
