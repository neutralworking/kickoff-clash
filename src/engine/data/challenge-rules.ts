/**
 * KC rebuild engine — challenge rule catalogue v1 (KC_REBUILD_PLAN_V1 §P4).
 *
 * A rule is traits on the fixture (applied to a side's trait list for that
 * match) plus optional flat fixture overrides — pure data, no rule classes.
 * Severity 2 rules are boss material (SM §8: boss = harshest rule). Rules
 * apply from fixture 2 onward. This catalogue is FUNCTIONAL v1 — the fuller
 * authoring pass is the separate design ticket; the mechanism and the sweep
 * instrument are what ship here.
 */

import type { EngineTrait } from '../traits';
import type { Side } from '../events';

export interface ChallengeRuleDef {
  id: string;
  name: string;
  /** One plain line: what this does to your match. */
  effect: string;
  severity: 1 | 2;
  sideTraits: [Side, EngineTrait][];
  energyDelta?: number;
  subsDelta?: number;
  targetMult?: number;
}

export const CHALLENGE_RULES: ChallengeRuleDef[] = [
  {
    id: 'waterlogged-pitch',
    name: 'Waterlogged Pitch',
    effect: 'The break is slower: both sides convert transition windows less.',
    severity: 1,
    sideTraits: [
      [0, { name: 'Heavy Going', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 0.75 }],
      [1, { name: 'Heavy Going', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 0.75 }],
    ],
  },
  {
    id: 'whistle-happy-ref',
    name: 'Whistle-Happy Referee',
    effect: 'They win fouls all day: their set-piece threat is elevated.',
    severity: 1,
    sideTraits: [
      [1, { name: 'Soft Whistles', verb: 'relocate', context: { kind: 'window', window: 'set-piece' }, magnitude: 0.06 }],
      [1, { name: 'Soft Whistles Charge', verb: 'amplify', context: { kind: 'window', window: 'set-piece' }, magnitude: 1 }],
    ],
  },
  {
    id: 'hostile-crowd',
    name: 'Hostile Crowd',
    effect: 'Everything is harder away from home: their windows convert better.',
    severity: 1,
    sideTraits: [
      [1, { name: 'Twelfth Man', verb: 'amplify', context: { kind: 'posture', posture: 'possession' }, magnitude: 0.5 }],
      [1, { name: 'Twelfth Man (Block)', verb: 'amplify', context: { kind: 'posture', posture: 'deep-block' }, magnitude: 0.5 }],
    ],
  },
  {
    id: 'fixture-congestion',
    name: 'Fixture Congestion',
    effect: 'Tired squad: two fewer energy this match.',
    severity: 1,
    sideTraits: [],
    energyDelta: -2,
  },
  {
    id: 'suspension-crisis',
    name: 'Suspension Crisis',
    effect: 'A thin bench: two fewer substitutions this match.',
    severity: 1,
    sideTraits: [],
    subsDelta: -2,
  },
  {
    id: 'cagey-affair',
    name: 'Cagey Affair',
    effect: 'A tight, nervous game: the resolution die shrinks for both sides.',
    severity: 1,
    sideTraits: [
      [1, { name: 'Nerves', verb: 'dampen-variance', context: { kind: 'posture', posture: 'possession' }, magnitude: 1 }],
      [1, { name: 'Nerves (Block)', verb: 'dampen-variance', context: { kind: 'posture', posture: 'deep-block' }, magnitude: 1 }],
    ],
  },
  {
    id: 'derby-chaos',
    name: 'Derby Chaos',
    effect: 'Anything can happen: the resolution die grows for both sides.',
    severity: 1,
    sideTraits: [
      [1, { name: 'Derby Blood', verb: 'amplify-variance', context: { kind: 'posture', posture: 'possession' }, magnitude: 1 }],
      [1, { name: 'Derby Blood (Block)', verb: 'amplify-variance', context: { kind: 'posture', posture: 'deep-block' }, magnitude: 1 }],
    ],
  },
  {
    id: 'the-wall',
    name: 'The Wall',
    effect: 'They defend everything: your windows are denied across the board.',
    severity: 2,
    sideTraits: [
      [1, { name: 'Brick by Brick', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 1 }],
      [1, { name: 'Brick by Brick (Corners)', verb: 'deny', context: { kind: 'window', window: 'set-piece' }, magnitude: 1 }],
    ],
  },
  {
    id: 'title-decider',
    name: 'Title Decider',
    effect: 'The board demands more: the points target is a quarter higher.',
    severity: 2,
    sideTraits: [],
    targetMult: 1.25,
  },
  {
    id: 'champions-pedigree',
    name: "Champion's Pedigree",
    effect: 'They are simply better drilled: their whole game is elevated.',
    severity: 2,
    sideTraits: [
      [1, { name: 'Pedigree', verb: 'amplify', context: { kind: 'posture', posture: 'possession' }, magnitude: 1 }],
      [1, { name: 'Pedigree (Block)', verb: 'amplify', context: { kind: 'posture', posture: 'deep-block' }, magnitude: 1 }],
    ],
  },
];

export const SEVERE_RULES = CHALLENGE_RULES.filter((r) => r.severity === 2);
export const REGULAR_RULES = CHALLENGE_RULES.filter((r) => r.severity === 1);

export function getChallengeRule(id: string): ChallengeRuleDef {
  const r = CHALLENGE_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`unknown challenge rule: ${id}`);
  return r;
}
