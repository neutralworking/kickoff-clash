'use client';

import { SECTORS, type BoardReceipt, type Sector, type TeamSide, type V6MatchState } from '@/lib/match-v6';

/** Raw engine receipt — sector totals + chance outlook + effect ledger sizes. */
export function V6DebugReceipt(props: {
  state: V6MatchState;
  boards: { player: BoardReceipt; opponent: BoardReceipt };
  outlook: Record<TeamSide, Record<Sector, number>>;
}) {
  const line = (sec: Sector) => {
    const y = props.boards.player[sec];
    const t = props.boards.opponent[sec];
    return `${sec.padEnd(6)}  you ${String(y.attack).padStart(2)}/${String(y.defence).padStart(2)}  vs  opp ${String(t.attack).padStart(2)}/${String(t.defence).padStart(2)}   chances you ${props.outlook.player[sec]} · opp ${props.outlook.opponent[sec]}`;
  };
  return (
    <div className="v6-debug">
      <h4>DEBUG · period {props.state.period} · priority {props.state.priority}</h4>
      {SECTORS.map((s) => (
        <div key={s}>{line(s)}</div>
      ))}
      <div style={{ marginTop: 6 }}>
        effects — you {props.state.player.effects.length} · opp {props.state.opponent.effects.length}
      </div>
    </div>
  );
}
