'use client';

import type { V6Card } from '@/lib/match-v6';
import { TRIGGER_LABELS } from '@/lib/match-v6';
import { avatarFor } from './avatar';

/** A bench card at a break. Shows cost, portrait, name, action prefix, ATT/DEF. */
export function V6BenchCard(props: {
  card: V6Card;
  cost: number;
  selected?: boolean;
  spent?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  const { card } = props;
  const av = avatarFor(card.id);
  const prefix = card.actions[0] ? TRIGGER_LABELS[card.actions[0].trigger] ?? '' : card.rarity;
  const cls = ['v6-bench-card'];
  if (props.selected) cls.push('sel');
  if (props.spent) cls.push('spent');
  if (props.dim) cls.push('dim');
  return (
    <div className={cls.join(' ')} onClick={props.spent ? undefined : props.onClick}>
      <span className="v6-cost">{props.cost}</span>
      <div className="v6-av" style={av.style}>
        {card.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element -- static-export basePath src
          <img src={card.portrait} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
        ) : (
          av.hair && <i className={`v6-hair ${av.hair}`} />
        )}
      </div>
      <div className="name">{card.shortName ?? card.name}</div>
      <div className="role">{prefix}</div>
      <div className="sd">
        <span className="v6-att">{card.attack}</span>
        <span className="v6-def">{card.defence}</span>
      </div>
    </div>
  );
}
