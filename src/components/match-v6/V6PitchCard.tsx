'use client';

import type { V6Card } from '@/lib/match-v6';
import { avatarFor } from './avatar';

/**
 * A single V6 player token — the one card face shared by the formation pitch AND
 * the bench, so both surfaces read as the same object (the team-selection idea).
 * Shows the four fields the deployment game turns on: NAME, ROLE, ATT/DEF, COST
 * (no fitness — V6 has no fitness). Portrait when we have a real one, else the CSS
 * avatar. Pure display; the wrapper owns interaction.
 */
export function V6PitchCard(props: {
  card: V6Card;
  /** effective ATT/DEF after penalties/effects (falls back to printed). */
  attack?: number;
  defence?: number;
  outOfPosition?: boolean;
  selected?: boolean;
  spent?: boolean;
  dim?: boolean;
  target?: boolean; // a legal sub target this break (adds the tap affordance)
  onClick?: () => void;
}) {
  const { card } = props;
  const av = avatarFor(card.id);
  const att = props.attack ?? card.attack;
  const def = props.defence ?? card.defence;
  const cls = ['v6-pc'];
  if (props.outOfPosition) cls.push('oop');
  if (props.selected) cls.push('sel');
  if (props.spent) cls.push('spent');
  if (props.dim) cls.push('dim');
  if (props.target) cls.push('tgt');
  return (
    <div className={cls.join(' ')} onClick={props.spent ? undefined : props.onClick}>
      <span className="v6-cost">{card.cost}</span>
      <div className="v6-av" style={av.style}>
        {card.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element -- static-export basePath src
          <img src={card.portrait} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
        ) : (
          av.hair && <i className={`v6-hair ${av.hair}`} />
        )}
      </div>
      <div className="v6-pc-name">{card.shortName ?? card.name}</div>
      <div className="v6-pc-role">{card.role ?? card.position}</div>
      <div className="v6-pc-sd">
        <span className="v6-att">{Math.max(0, att)}</span>
        <span className="v6-def">{Math.max(0, def)}</span>
      </div>
    </div>
  );
}
