/**
 * KC rebuild engine — opponent archetypes + the 9-fixture schedule (SM §3, §8).
 *
 * An opponent is a posture profile + a small engine, pure data — the matchup
 * matrix IS the opponent system. Profile shifts are telegraphed one batch
 * ahead by the match engine. Fixture difficulty ramps through baseCharge and
 * archetype traits; bosses land every third fixture. Numbers here are the
 * Phase 4 tuning surface for the SM §8 distribution acceptance
 * (`scripts/run-probe.ts` is the instrument).
 */

import type { SideConfig, ProfileShift } from '../match';
import type { EngineTrait } from '../traits';
import type { Posture } from '../contexts';
import type { EngineDef } from '../streak';

export interface OpponentArchetype {
  id: string;
  name: string;
  posture: Posture;
  traits: EngineTrait[];
  shifts?: ProfileShift[];
  engine: EngineDef;
}

const ANY_GOAL_ENGINE = (id: string): EngineDef => ({
  id,
  successes: [{ on: 'any-goal' }],
  contradictions: [{ on: 'conceded', reason: 'conceded' }],
});

export const OPPONENT_ARCHETYPES: OpponentArchetype[] = [
  {
    id: 'journeymen',
    name: 'Park Lane Wanderers',
    posture: 'possession',
    traits: [],
    engine: ANY_GOAL_ENGINE('journeymen'),
  },
  {
    id: 'stonewall',
    name: 'Milltown Athletic',
    posture: 'deep-block',
    traits: [{ name: 'Massed Ranks', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 0.5 }],
    engine: {
      id: 'stonewall',
      successes: [{ on: 'any-goal' }, { on: 'clean-batch' }],
      contradictions: [{ on: 'conceded', reason: 'conceded' }],
    },
  },
  {
    id: 'pressing-machine',
    name: 'SV Hochdruck',
    posture: 'possession',
    traits: [{ name: 'Counterpress', verb: 'amplify', context: { kind: 'window', window: 'transition' }, magnitude: 1 }],
    engine: ANY_GOAL_ENGINE('pressing-machine'),
  },
  {
    id: 'dead-ball-merchants',
    name: 'Corner Kings FC',
    posture: 'deep-block',
    traits: [
      { name: 'Foul Hunters', verb: 'relocate', context: { kind: 'window', window: 'set-piece' }, magnitude: 0.08 },
      { name: 'Delivery Drill', verb: 'amplify', context: { kind: 'window', window: 'set-piece' }, magnitude: 1 },
    ],
    engine: ANY_GOAL_ENGINE('dead-ball-merchants'),
  },
  {
    id: 'shapeshifters',
    name: 'Proteus United',
    posture: 'possession',
    traits: [],
    // Goes for the throat late if not ahead; shuts up shop when leading.
    shifts: [
      { atBatch: 4, when: 'leading', to: 'deep-block' },
      { atBatch: 5, when: 'chasing', to: 'possession' },
      { atBatch: 5, when: 'level', to: 'deep-block' },
    ],
    engine: ANY_GOAL_ENGINE('shapeshifters'),
  },
  {
    id: 'champions',
    name: 'Real Dominion',
    posture: 'possession',
    traits: [
      { name: 'Suffocation', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 1 },
      { name: 'Galáctico Standard', verb: 'amplify', context: { kind: 'posture', posture: 'possession' }, magnitude: 0.5 },
    ],
    shifts: [{ atBatch: 5, when: 'leading', to: 'deep-block' }],
    engine: ANY_GOAL_ENGINE('champions'),
  },
];

export function getArchetype(id: string): OpponentArchetype {
  const a = OPPONENT_ARCHETYPES.find((x) => x.id === id);
  if (!a) throw new Error(`unknown opponent archetype: ${id}`);
  return a;
}

/**
 * The 9-fixture schedule: archetype + baseCharge ramp + boss flags.
 * Bosses every third fixture (SM §8) carry the harshest challenge rules and a
 * manager/legendary-weighted shop after. The ramp is the primary difficulty
 * lever for the distribution acceptance.
 */
export interface FixtureDef {
  fixture: number;
  archetypeId: string;
  baseCharge: number;
  /** The opponent's defensive quality: what YOUR windows must clear. The ramp
   *  is the compounding separation lever — surplus charge is worthless against
   *  a fixed threshold, so late fixtures only convert for stacked builds. */
  windowThreshold: number;
  boss: boolean;
}

export const FIXTURE_SCHEDULE: FixtureDef[] = [
  { fixture: 1, archetypeId: 'journeymen', baseCharge: 2, windowThreshold: 6, boss: false },
  { fixture: 2, archetypeId: 'stonewall', baseCharge: 2, windowThreshold: 6.5, boss: false },
  { fixture: 3, archetypeId: 'pressing-machine', baseCharge: 3, windowThreshold: 7, boss: true },
  { fixture: 4, archetypeId: 'dead-ball-merchants', baseCharge: 3, windowThreshold: 7.5, boss: false },
  { fixture: 5, archetypeId: 'shapeshifters', baseCharge: 4, windowThreshold: 9, boss: false },
  { fixture: 6, archetypeId: 'stonewall', baseCharge: 3.5, windowThreshold: 8.75, boss: true },
  { fixture: 7, archetypeId: 'pressing-machine', baseCharge: 3.5, windowThreshold: 9, boss: false },
  { fixture: 8, archetypeId: 'shapeshifters', baseCharge: 3.5, windowThreshold: 9.25, boss: false },
  { fixture: 9, archetypeId: 'champions', baseCharge: 4, windowThreshold: 9.25, boss: true },
];

/** Build the opponent SideConfig for a fixture. */
export function opponentSide(fixture: FixtureDef): SideConfig {
  const archetype = getArchetype(fixture.archetypeId);
  return {
    posture: archetype.posture,
    traits: archetype.traits,
    baseCharge: fixture.baseCharge,
    engine: archetype.engine,
    autoCommit: true,
    ...(archetype.shifts ? { shifts: archetype.shifts } : {}),
  };
}
