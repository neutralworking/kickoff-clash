/**
 * KC six-contest engine (NW-139 Fork A) — the stub squad builder.
 *
 * A faithful TS port of `scripts/kc_sim.py`'s role map, role-correlated stat
 * PROFILE, and 4-3-3 build_xi / build_stopbus. This is TEST/CALIBRATION scaffold
 * — the real 540-card dataset is wired downstream (NW-140+). It exists so the
 * harness can field committed builds and assert the balance shape.
 *
 * Role-correlated stats (§4.1) are the load-bearing balance mechanism: a card
 * that tilts a contest prints weak stats at the contests it ignores, so a
 * mono-stack pays for its commitment in stat-holes.
 */

import type { Card, Contest, Position } from './contests';
import { CONTESTS } from './contests';
import { RngStream } from './rng';

interface RoleDef {
  name: string;
  pos: Position;
  contest: Contest;
  tilt: 'N' | 'S';
}

// role map (CARD_SYSTEM_V2 §3.1, with _CHANGES §6: Seconda Punta CREATE→FINISH...
// kept as authored in kc_sim.py for a bit-faithful census port)
export const ROLES: RoleDef[] = [
  { name: 'Marshal', pos: 'GK', contest: 'STOP', tilt: 'N' },
  { name: 'Sweeper Keeper', pos: 'GK', contest: 'STOP', tilt: 'N' },
  { name: 'Shotstopper', pos: 'GK', contest: 'STOP', tilt: 'N' },
  { name: 'Distributor', pos: 'GK', contest: 'KEEP', tilt: 'S' },
  { name: 'Centrale', pos: 'CD', contest: 'STOP', tilt: 'N' },
  { name: 'Colossus', pos: 'CD', contest: 'STOP', tilt: 'N' },
  { name: 'Progressor', pos: 'CD', contest: 'KEEP', tilt: 'S' },
  { name: 'Sweeper', pos: 'CD', contest: 'BREAK', tilt: 'N' },
  { name: 'Stopper', pos: 'CD', contest: 'PRESS', tilt: 'S' },
  { name: 'Fullback', pos: 'WD', contest: 'STOP', tilt: 'S' },
  { name: 'Auxiliary Centre-Back', pos: 'WD', contest: 'STOP', tilt: 'N' },
  { name: 'Wing-back', pos: 'WD', contest: 'PRESS', tilt: 'S' },
  { name: 'Invertido', pos: 'WD', contest: 'KEEP', tilt: 'S' },
  { name: 'Regista', pos: 'DM', contest: 'CREATE', tilt: 'N' },
  { name: 'Pivote', pos: 'DM', contest: 'KEEP', tilt: 'N' },
  { name: 'Anchor', pos: 'DM', contest: 'BREAK', tilt: 'N' },
  { name: 'Interceptor', pos: 'DM', contest: 'BREAK', tilt: 'N' },
  { name: 'Water-Carrier', pos: 'DM', contest: 'BREAK', tilt: 'S' },
  { name: 'Volante', pos: 'DM', contest: 'BREAK', tilt: 'N' },
  { name: 'Segundo Volante', pos: 'DM', contest: 'CREATE', tilt: 'S' },
  { name: 'Playmaker', pos: 'CM', contest: 'CREATE', tilt: 'N' },
  { name: 'Metodista', pos: 'CM', contest: 'KEEP', tilt: 'N' },
  { name: 'Mediano', pos: 'CM', contest: 'BREAK', tilt: 'N' },
  { name: 'Mezzala', pos: 'CM', contest: 'FINISH', tilt: 'S' },
  { name: 'Tuttocampista', pos: 'CM', contest: 'PRESS', tilt: 'N' },
  { name: 'Ball Winner', pos: 'CM', contest: 'BREAK', tilt: 'N' },
  { name: 'Carrilero', pos: 'CM', contest: 'PRESS', tilt: 'N' },
  { name: 'Touchline Winger', pos: 'WM', contest: 'CREATE', tilt: 'N' },
  { name: 'Tornante', pos: 'WM', contest: 'PRESS', tilt: 'N' },
  { name: 'False Winger', pos: 'WM', contest: 'KEEP', tilt: 'S' },
  { name: 'Wide Cover', pos: 'WM', contest: 'BREAK', tilt: 'N' },
  { name: 'Trequartista', pos: 'AM', contest: 'CREATE', tilt: 'N' },
  { name: 'Enganche', pos: 'AM', contest: 'CREATE', tilt: 'N' },
  { name: 'Incursore', pos: 'AM', contest: 'FINISH', tilt: 'N' },
  { name: 'Mediapunta', pos: 'AM', contest: 'KEEP', tilt: 'N' },
  { name: 'Shadow Striker', pos: 'AM', contest: 'FINISH', tilt: 'N' },
  { name: 'Inverted Winger', pos: 'WF', contest: 'FINISH', tilt: 'N' },
  { name: 'Advanced Winger', pos: 'WF', contest: 'CREATE', tilt: 'N' },
  { name: 'Wide Playmaker', pos: 'WF', contest: 'CREATE', tilt: 'N' },
  { name: 'Wide Target Forward', pos: 'WF', contest: 'FINISH', tilt: 'N' },
  { name: 'Prima Punta', pos: 'CF', contest: 'FINISH', tilt: 'N' },
  { name: 'Falso Nove', pos: 'CF', contest: 'CREATE', tilt: 'S' },
  { name: 'Spearhead', pos: 'CF', contest: 'PRESS', tilt: 'S' },
  { name: 'Target Forward', pos: 'CF', contest: 'KEEP', tilt: 'S' },
  { name: 'Seconda Punta', pos: 'CF', contest: 'CREATE', tilt: 'S' },
];

/** contest → (ATT μ,σ, DEF μ,σ): role-correlated stat profiles (§4.1). */
const PROFILE: Record<Contest, [number, number, number, number]> = {
  FINISH: [72, 10, 34, 9],
  CREATE: [66, 10, 38, 9],
  KEEP: [52, 11, 52, 11],
  PRESS: [42, 10, 62, 10],
  BREAK: [40, 10, 63, 10],
  STOP: [32, 9, 68, 10],
};

const FORMATION: Position[] = ['GK', 'CD', 'CD', 'WD', 'WD', 'DM', 'CM', 'CM', 'WF', 'CF', 'WF'];

const clip1 = (x: number) => Math.max(1, Math.min(99, x));

const byPos = new Map<Position, RoleDef[]>();
const byPosContest = new Map<string, RoleDef[]>();
for (const r of ROLES) {
  (byPos.get(r.pos) ?? byPos.set(r.pos, []).get(r.pos)!).push(r);
  const key = `${r.pos}:${r.contest}`;
  (byPosContest.get(key) ?? byPosContest.set(key, []).get(key)!).push(r);
}

function makeCard(rng: RngStream, r: RoleDef, id: string, boost = 0): Card {
  const [ma, sa, md, sd] = PROFILE[r.contest];
  return {
    id,
    role: r.name,
    pos: r.pos,
    contest: r.contest,
    tilt: r.tilt === 'N' ? 2 : 1,
    att: clip1(rng.gauss(ma, sa) + boost),
    def: clip1(rng.gauss(md, sd) + boost),
  };
}

function pickFor(rng: RngStream, pos: Position, target: Contest): RoleDef {
  const cand = byPosContest.get(`${pos}:${target}`);
  if (cand && cand.length) return cand[rng.int(cand.length)];
  const any = byPos.get(pos)!;
  return any[rng.int(any.length)];
}

export type Strategy = 'random' | `mono:${Contest}`;

/** Build an 11-card XI: a random draft, or a mono-contest committed build. */
export function buildXI(rng: RngStream, strategy: Strategy, quality = 0): Card[] {
  return FORMATION.map((pos, i) => {
    if (strategy === 'random') {
      const any = byPos.get(pos)!;
      return makeCard(rng, any[rng.int(any.length)], `${strategy}-${i}`, quality);
    }
    const target = strategy.split(':')[1] as Contest;
    return makeCard(rng, pickFor(rng, pos, target), `${strategy}-${i}`, quality);
  });
}

/**
 * The §7.1 costed wall: a mono-STOP build that gives up a back-line defender to
 * a possession-winning carrier (KEEP) and a CB to a BREAK screen, plus an
 * attacker slot to a no-tilt taker — the only build that unlocks set pieces.
 */
export function buildStopbus(rng: RngStream, quality = 0): Card[] {
  const xi = buildXI(rng, 'mono:STOP', quality);
  const wd = xi.find((c) => c.pos === 'WD');
  if (wd) {
    wd.contest = 'KEEP';
    wd.tilt = 2;
    const [ma, sa, md, sd] = PROFILE.KEEP;
    wd.att = clip1(rng.gauss(ma, sa) + quality);
    wd.def = clip1(rng.gauss(md, sd) + quality);
  }
  const wf = xi.find((c) => c.pos === 'WF');
  if (wf) wf.tilt = 0; // the taker: specialist, no role tilt
  const cd = xi.find((c) => c.pos === 'CD');
  if (cd) {
    cd.contest = 'BREAK';
    cd.tilt = 2;
    const [ma, sa, md, sd] = PROFILE.BREAK;
    cd.att = clip1(rng.gauss(ma, sa) + quality);
    cd.def = clip1(rng.gauss(md, sd) + quality);
  }
  return xi;
}

export const ALL_STRATEGIES: Strategy[] = [
  'random',
  'mono:CREATE',
  'mono:FINISH',
  'mono:KEEP',
  'mono:PRESS',
  'mono:BREAK',
  'mono:STOP',
];

/** Census helper: the modal/max tilt an XI reaches on each contest dial. */
export function tiltCensus(rng: RngStream, contest: Contest, trials = 2000): { max: number; median: number } {
  const vals: number[] = [];
  let max = 0;
  for (let t = 0; t < trials; t++) {
    const xi = buildXI(rng, `mono:${contest}` as Strategy);
    let sum = 0;
    for (const c of xi) if (c.contest === contest) sum += c.tilt;
    vals.push(sum);
    if (sum > max) max = sum;
  }
  vals.sort((a, b) => a - b);
  return { max, median: vals[Math.floor(vals.length / 2)] };
}

// re-export so consumers can enumerate contests without a second import
export { CONTESTS };
