/**
 * KC rebuild engine — the P1 acceptance stub (NW-139).
 *
 * A stub manager + stub squad exercising every spine mechanism: window-scoped
 * charge traits, a state-scoped (scoreline) charge trait, a clock-scoped
 * variance trait (die mutation), and a counter-style engine (streak on
 * transition goals, reset on conceding). `scripts/balance_sim.py` mirrors this
 * fixture exactly — it is the shared subject of the distribution acceptance
 * tests. Real managers/squads are Phase 2/3 data.
 */

import type { MatchConfig } from '../match';

export const STUB_FIXTURE: Omit<MatchConfig, 'seed'> = {
  sides: [
    {
      // The player: a counter-attack stub — deep-block, transition-fed.
      posture: 'deep-block',
      baseCharge: 0,
      autoCommit: false,
      traits: [
        { name: 'Break Runners', verb: 'amplify', context: { kind: 'window', window: 'transition' }, magnitude: 3 },
        { name: 'Corner Routine', verb: 'amplify', context: { kind: 'window', window: 'set-piece' }, magnitude: 1 },
        { name: 'Chasing Surge', verb: 'amplify', context: { kind: 'scoreline', is: 'chasing' }, magnitude: 2 },
        { name: 'Late Chaos', verb: 'amplify-variance', context: { kind: 'clock', band: 'late' }, magnitude: 1 },
      ],
      engine: {
        id: 'stub-counter',
        successes: [{ on: 'window-goal', window: 'transition' }],
        contradictions: [{ on: 'conceded', reason: 'conceded' }],
      },
    },
    {
      // The opponent: a possession profile, flat charge, no traits.
      posture: 'possession',
      baseCharge: 2,
      autoCommit: true,
      traits: [],
      engine: {
        id: 'stub-opponent',
        successes: [{ on: 'any-goal' }],
        contradictions: [{ on: 'conceded', reason: 'conceded' }],
      },
    },
  ],
  /** Mid-run-ish fixture target (the run curve arrives in Phase 4). */
  target: 10,
};
