'use client';

import type { V6Card } from '@/lib/match-v6';
import { actionLabel } from '@/lib/v6-bridge';
import { POSITION_COLOR } from '../cards/cardTokens';
import { avatarFor } from './avatar';

/**
 * The one player token, shared by the match pitch, the bench AND the team-selection
 * pitch, so a card reads as the same object everywhere. Shows the five fields the
 * game turns on: PORTRAIT · COST · POSITION · ATT/DEF · ACTION (no role, no class).
 * Portrait when we have one, else the CSS avatar. Pure display; the wrapper owns
 * interaction.
 */
export function V6PitchCard(props: {
  card: V6Card;
  attack?: number;
  defence?: number;
  outOfPosition?: boolean;
  selected?: boolean;
  spent?: boolean;
  dim?: boolean;
  target?: boolean;
  onClick?: () => void;
}) {
  const { card } = props;
  const av = avatarFor(card.id);
  const att = props.attack ?? card.attack;
  const def = props.defence ?? card.defence;
  const act = actionLabel(card.actions[0]);
  const cls = ['v6-pc'];
  if (props.outOfPosition) cls.push('oop');
  if (props.selected) cls.push('sel');
  if (props.spent) cls.push('spent');
  if (props.dim) cls.push('dim');
  if (props.target) cls.push('tgt');
  return (
    <div className={cls.join(' ')} onClick={props.spent ? undefined : props.onClick}>
      <span className="v6-cost">{card.cost}</span>
      <span className="v6-pos" style={{ background: POSITION_COLOR[card.position] ?? '#8a6a44' }}>{card.position}</span>
      <div className="v6-av" style={av.style}>
        {card.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element -- static-export basePath src
          <img src={card.portrait} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 32%' }} />
        ) : (
          av.hair && <i className={`v6-hair ${av.hair}`} />
        )}
      </div>
      <div className="v6-pc-name">{card.shortName ?? card.name}</div>
      <div className="v6-pc-act" title={act.full}>{act.short}</div>
      <div className="v6-pc-sd">
        <span className="v6-att">{Math.max(0, att)}</span>
        <span className="v6-def">{Math.max(0, def)}</span>
      </div>
    </div>
  );
}
