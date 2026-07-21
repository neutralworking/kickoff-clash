'use client';

export interface PlanRow {
  outName: string;
  inName: string;
  note?: string;
}

/** The ordered {out,in} plan + energy meter + Lock (spec A4). */
export function V6PlanTray(props: {
  rows: PlanRow[];
  energy: number;
  spent: number;
  picking: boolean;
  onRemove: (i: number) => void;
  onLock: () => void;
}) {
  const remaining = props.energy - props.spent;
  const hint = props.picking ? 'Now tap the player he replaces on the pitch.' : 'Tap a bench card, then the player it replaces. Or lock with no changes.';
  return (
    <div className="v6-plan">
      {props.rows.length === 0 ? (
        <div className="v6-subcopy">{hint}</div>
      ) : (
        props.rows.map((r, i) => (
          <div className="v6-plan-row" key={i}>
            <span>
              <strong>{r.inName}</strong> for {r.outName}
            </span>
            {r.note && <span className="v6-threshold">· {r.note}</span>}
            <span className="x" onClick={() => props.onRemove(i)} role="button" aria-label="remove">
              ✕
            </span>
          </div>
        ))
      )}
      <div className="v6-plan-foot">
        <div className="v6-energy" aria-label={`energy ${remaining} of ${props.energy} left`}>
          {Array.from({ length: props.energy }).map((_, i) => (
            <i key={i} className={i < remaining ? 'on' : ''} />
          ))}
        </div>
        <span className="v6-tiny v6-muted">{remaining} energy left</span>
        <button className="v6-lock" onClick={props.onLock} disabled={props.spent > props.energy}>
          Lock{props.rows.length > 0 ? ` ${props.rows.length}` : ''}
        </button>
      </div>
    </div>
  );
}
