'use client';

import { useEffect, useState } from 'react';
import type { PeriodResult, V6Card } from '@/lib/match-v6';

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/**
 * Rolls the period's chances one at a time — a RECEIPT of the engine's resolved
 * `ChanceRoll[]` (d6, spec A2). Each goal names its scorer + sector + roll; a
 * miss names the clearance. The running score ticks from the pre-period score.
 * Timers pace only; the outcome is already computed.
 */
export function V6ChanceResolution(props: {
  result: PeriodResult;
  pool: Record<string, V6Card>;
  preScore: { player: number; opponent: number };
  playerName: string;
  oppName: string;
  onDone: () => void;
}) {
  const { result, pool, preScore, playerName, oppName, onDone } = props;
  const rolls = result.rolls;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (rolls.length === 0) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    if (i >= rolls.length) {
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI((v) => v + 1), 720);
    return () => clearTimeout(t);
  }, [i, rolls.length, onDone]);

  if (rolls.length === 0) {
    return (
      <div className="v6-seq">
        <div className="v6-seq-label">No clear chances this period</div>
        <div className="v6-runscore v6-pixel">
          {preScore.player}–{preScore.opponent}
        </div>
        <button className="v6-skip" onClick={onDone}>
          Skip →
        </button>
      </div>
    );
  }

  const shown = Math.min(i, rolls.length - 1);
  const cur = rolls[shown];
  const face = cur.rolls[cur.rolls.length - 1];
  let p = preScore.player;
  let o = preScore.opponent;
  for (let k = 0; k <= shown; k++) {
    if (rolls[k].scored) {
      if (rolls[k].side === 'player') p++;
      else o++;
    }
  }
  const scorer = cur.attackerCardId ? pool[cur.attackerCardId]?.shortName ?? '' : '';
  const saver = cur.saverCardId ? pool[cur.saverCardId]?.shortName ?? '' : '';
  const team = cur.side === 'player' ? playerName : oppName;

  return (
    <div className="v6-seq">
      <button className="v6-skip" onClick={() => setI(rolls.length)}>
        Skip →
      </button>
      <div className="v6-seq-label">Chances · {cur.sector}</div>
      <div className="v6-runscore v6-pixel">
        {p}–{o}
      </div>
      <div key={shown} className="v6-die-big">
        {DIE[face - 1]}
      </div>
      <div className={`v6-outcome ${cur.scored ? 'goal' : 'miss'}`}>
        {cur.scored ? `⚽ ${team} — ${scorer}` : `${saver ? `${saver} clears` : 'off target'} · rolled ${cur.rolls.join('/')}`}
      </div>
      <div className="v6-seq-dots">
        {rolls.map((r, k) => (
          <i key={k} className={k <= shown ? (r.scored ? 'goal' : 'on') : ''} />
        ))}
      </div>
    </div>
  );
}
