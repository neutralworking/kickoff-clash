/**
 * KC rebuild engine — the v1 manager roster (SYNERGY_MODEL_V1 §4).
 *
 * Law 4: managers are TraitRecords — NO manager class. Each entry is a bundle
 * of EngineTraits that reweights contexts, a default posture, a preferred
 * formation, and a streak EngineDef. Win conditions are the SM §4 one-liners
 * verbatim (the legibility rule: statable in one line or it isn't a v1
 * manager). Managers never reference players; players never reference
 * managers — the shared context vocabulary is the only coupling (law 2).
 *
 * Personas carry the live game's gaffers-are-people fiction forward; the
 * mechanics are entirely these records. Magnitudes are calibration-owned:
 * `scripts/balance_sim.py --calibrate` is the reference,
 * `__tests__/calibration.test.ts` the gate.
 */

import type { Posture } from '../contexts';
import type { EngineTrait } from '../traits';
import type { EngineDef } from '../streak';
import { mulberry32 } from '../rng';

export interface ManagerDef {
  id: string;
  name: string;
  nation: string;
  /** SM §4 one-line win condition, verbatim. */
  winCondition: string;
  defaultPosture: Posture;
  preferredFormation: string;
  traits: EngineTrait[];
  engine: EngineDef;
}

export const ALL_MANAGERS: ManagerDef[] = [
  {
    id: 'counter-attack',
    name: 'Marek Volný',
    nation: 'Czech Republic',
    winCondition: 'Win the ball, score within the window, chain counters',
    defaultPosture: 'deep-block',
    preferredFormation: '4-4-2',
    traits: [
      { name: 'Spring the Trap', verb: 'amplify', context: { kind: 'window', window: 'transition' }, magnitude: 3 },
      { name: 'Blood Rush', verb: 'amplify', context: { kind: 'streak', atLeast: 2 }, magnitude: 1 },
    ],
    engine: {
      id: 'counter-attack',
      successes: [{ on: 'window-goal', window: 'transition' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'set-piece',
    name: 'Gordon Blackwood',
    nation: 'Scotland',
    winCondition: 'Corners and free kicks are your entire offense',
    defaultPosture: 'deep-block',
    preferredFormation: '5-4-1',
    traits: [
      { name: 'Win the Foul', verb: 'relocate', context: { kind: 'window', window: 'set-piece' }, magnitude: 0.14 },
      { name: 'Rehearsed Routine', verb: 'amplify', context: { kind: 'window', window: 'set-piece' }, magnitude: 4 },
      { name: 'Training-Ground Goal', verb: 'generate', context: { kind: 'goal-event', on: 'scored' }, magnitude: 1 },
    ],
    engine: {
      id: 'set-piece',
      successes: [{ on: 'window-goal', window: 'set-piece' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'fortress',
    name: 'Vittorio Scudieri',
    nation: 'Italy',
    winCondition: 'Clean-sheet minutes bank points; a 0-0 can win',
    defaultPosture: 'deep-block',
    preferredFormation: '5-3-2',
    traits: [
      { name: 'Clean Clock', verb: 'generate', context: { kind: 'streak', atLeast: 2 }, magnitude: 1 },
      { name: 'No Way Through', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 1 },
    ],
    engine: {
      id: 'fortress',
      successes: [{ on: 'clean-batch' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'tinkerman',
    name: 'Aurelio Benti',
    nation: 'Italy',
    winCondition: 'Substitutions fuel the engine',
    defaultPosture: 'possession',
    preferredFormation: '4-2-3-1',
    traits: [
      { name: 'Fresh Legs', verb: 'amplify', context: { kind: 'substitution' }, magnitude: 3 },
      { name: 'Final Card', verb: 'amplify', context: { kind: 'clock', band: 'late' }, magnitude: 1 },
    ],
    engine: {
      id: 'tinkerman',
      successes: [{ on: 'substitution' }, { on: 'any-goal' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'metronome',
    name: 'Xavier Puig',
    nation: 'Spain',
    winCondition: 'Unbroken possession compounds',
    defaultPosture: 'possession',
    preferredFormation: '4-3-3',
    traits: [
      { name: 'Keep the Ball', verb: 'amplify', context: { kind: 'posture', posture: 'possession' }, magnitude: 2 },
      { name: 'Rhythm Dividend', verb: 'generate', context: { kind: 'streak', atLeast: 2 }, magnitude: 1 },
    ],
    engine: {
      id: 'metronome',
      successes: [{ on: 'any-goal' }, { on: 'clean-batch' }],
      contradictions: [{ on: 'turnover-conceded', reason: 'turnover conceded' }],
    },
  },
  {
    id: 'chaser',
    name: 'Duncan Hart',
    nation: 'England',
    winCondition: 'Engine only ignites level/behind, late',
    defaultPosture: 'possession',
    preferredFormation: '3-5-2',
    traits: [
      { name: 'Nothing to Lose', verb: 'amplify', context: { kind: 'scoreline', is: 'chasing' }, magnitude: 4 },
      { name: 'Level Heads', verb: 'amplify', context: { kind: 'scoreline', is: 'level' }, magnitude: 1 },
      { name: 'Final Push', verb: 'amplify', context: { kind: 'clock', band: 'late' }, magnitude: 3 },
    ],
    engine: {
      id: 'chaser',
      successes: [{ on: 'any-goal' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'gambler',
    name: 'Sonny Callahan',
    nation: 'Ireland',
    winCondition: 'Everything swingy, both directions',
    defaultPosture: 'possession',
    preferredFormation: '3-4-3',
    traits: [
      { name: 'Roll the Dice', verb: 'amplify-variance', context: { kind: 'posture', posture: 'possession' }, magnitude: 1 },
      { name: 'Double or Quits', verb: 'amplify-variance', context: { kind: 'clock', band: 'late' }, magnitude: 1 },
      { name: 'Chance It', verb: 'amplify', context: { kind: 'window', window: 'transition' }, magnitude: 1 },
    ],
    engine: {
      id: 'gambler',
      successes: [{ on: 'any-goal' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'pragmatist',
    name: 'Piet Vermeer',
    nation: 'Netherlands',
    winCondition: 'Narrow, grinding, reliable 1-0s',
    defaultPosture: 'deep-block',
    preferredFormation: '4-1-2-1-2',
    traits: [
      { name: 'Kill the Chaos', verb: 'dampen-variance', context: { kind: 'posture', posture: 'deep-block' }, magnitude: 1 },
      { name: 'Drilled Break', verb: 'amplify', context: { kind: 'window', window: 'transition' }, magnitude: 4 },
      { name: 'Zonal Wall', verb: 'deny', context: { kind: 'window', window: 'set-piece' }, magnitude: 1 },
    ],
    engine: {
      id: 'pragmatist',
      successes: [{ on: 'any-goal' }, { on: 'clean-batch' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'taskmaster',
    name: 'Ute Brandt',
    nation: 'Germany',
    winCondition: 'Output bought with player fitness',
    defaultPosture: 'possession',
    preferredFormation: '4-4-2',
    traits: [
      { name: 'Run Them Ragged', verb: 'drain-fitness', context: { kind: 'posture', posture: 'possession' }, magnitude: 0.5 },
      { name: 'Peak Output', verb: 'amplify', context: { kind: 'fitness', atLeast: 5 }, magnitude: 3 },
    ],
    engine: {
      id: 'taskmaster',
      successes: [{ on: 'any-goal' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'financier',
    name: 'Bernard Grosvenor',
    nation: 'England',
    winCondition: 'Weak on pitch; results generate extra cash',
    defaultPosture: 'possession',
    preferredFormation: '4-3-3',
    traits: [
      { name: 'Win Bonus Clause', verb: 'generate', resource: 'cash', context: { kind: 'goal-event', on: 'scored' }, magnitude: 150 },
      { name: 'Bare Minimum', verb: 'amplify', context: { kind: 'window', window: 'transition' }, magnitude: 3 },
      { name: 'Corner Budget', verb: 'amplify', context: { kind: 'window', window: 'set-piece' }, magnitude: 2 },
    ],
    engine: {
      id: 'financier',
      successes: [{ on: 'any-goal' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
];

export function getManager(id: string): ManagerDef | undefined {
  return ALL_MANAGERS.find((m) => m.id === id);
}

/** Run start: a seeded choice of three distinct managers (SM §4). */
export function managerOffer(seed: number): [ManagerDef, ManagerDef, ManagerDef] {
  const rng = mulberry32(seed);
  const pool = [...ALL_MANAGERS];
  const picks: ManagerDef[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rng() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks as [ManagerDef, ManagerDef, ManagerDef];
}
