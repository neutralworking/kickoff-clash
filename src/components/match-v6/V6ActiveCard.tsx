'use client';

import { avatarFor } from './avatar';

/** A compact card on the pitch. `mode` drives break-planning affordances. */
export function V6ActiveCard(props: {
  id: string;
  name: string;
  att: number;
  def: number;
  oop?: boolean;
  mode?: 'idle' | 'target' | 'picked';
  onClick?: () => void;
}) {
  const av = avatarFor(props.id);
  const cls = ['v6-mini'];
  if (props.oop) cls.push('oop');
  if (props.mode === 'target') cls.push('tgt');
  if (props.mode === 'picked') cls.push('pick');
  return (
    <div className={cls.join(' ')} onClick={props.onClick} title={props.oop ? 'Out of position (−2/−2)' : undefined}>
      <div className="v6-av" style={av.style}>
        {av.hair && <i className={`v6-hair ${av.hair}`} />}
      </div>
      <div className="nm">{props.name}</div>
      <div className="sd">
        <span className="v6-att">{props.att}</span>
        <span className="v6-def">{props.def}</span>
      </div>
    </div>
  );
}
