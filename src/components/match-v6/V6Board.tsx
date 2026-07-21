'use client';

import { SECTORS, type BoardReceipt, type Sector, type TeamSide, type V6Card } from '@/lib/match-v6';
import { V6ActiveCard } from './V6ActiveCard';

/** The three-lane pitch: opponent on top, you at the bottom, chances in between. */
export function V6Board(props: {
  boards: { player: BoardReceipt; opponent: BoardReceipt };
  outlook: Record<TeamSide, Record<Sector, number>>;
  pool: Record<string, V6Card>;
  mode: 'idle' | 'break';
  onPickActive?: (cardId: string) => void;
}) {
  const nameOf = (id: string, fallback: string) => props.pool[id]?.shortName ?? fallback;
  return (
    <div className="v6-pitch">
      <div className="v6-lanes">
        {SECTORS.map((sec) => {
          const you = props.boards.player[sec];
          const them = props.boards.opponent[sec];
          const chances = props.outlook.player[sec];
          return (
            <div className="v6-lane" key={sec}>
              <div className="v6-lane-head">
                <span>{sec.toUpperCase()}</span>
                <span>
                  <b className="v6-att">{Math.max(0, you.attack)}</b>/<b className="v6-def">{Math.max(0, them.defence)}</b>
                </span>
              </div>
              <div className="v6-squad opp">
                {them.cards.map((c) => (
                  <V6ActiveCard key={c.cardId} id={c.cardId} name={nameOf(c.cardId, c.name)} att={c.attack} def={c.defence} oop={c.outOfPosition} portrait={props.pool[c.cardId]?.portrait} />
                ))}
              </div>
              <div className="v6-chance-row" aria-label={`${chances} chances`}>
                {Array.from({ length: chances }).map((_, i) => (
                  <i className="v6-ball" key={i}>
                    ⚽
                  </i>
                ))}
              </div>
              <div className="v6-squad you">
                {you.cards.map((c) => (
                  <V6ActiveCard
                    key={c.cardId}
                    id={c.cardId}
                    name={nameOf(c.cardId, c.name)}
                    att={c.attack}
                    def={c.defence}
                    oop={c.outOfPosition}
                    portrait={props.pool[c.cardId]?.portrait}
                    mode={props.mode === 'break' ? 'target' : 'idle'}
                    onClick={props.mode === 'break' && props.onPickActive ? () => props.onPickActive!(c.cardId) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
