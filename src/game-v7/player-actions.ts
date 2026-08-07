import type { V7ActionDefinition } from '@/engine-v7';

function action(
  partial: Pick<V7ActionDefinition, 'id' | 'name' | 'displayText' | 'timing' | 'target' | 'effects' | 'duration'>
    & Partial<Pick<V7ActionDefinition, 'conditionGroups'>>,
): V7ActionDefinition {
  return {
    actionKey: partial.id,
    ownerType: 'player',
    conditionGroups: partial.conditionGroups ?? [],
    activationLimitPerBreak: 1,
    isNegative: false,
    copyRules: {},
    disableRules: {},
    engineSupportStatus: 'supported',
    ...partial,
  };
}

/** David Backman / David Beckham — first Box chance in his sector becomes a Cross. */
export const BEND_IT = action({
  id: 'act_bend_it',
  name: 'BEND IT',
  displayText: "Ongoing: Change your first Box chance in this player's sector each period into a Cross.",
  timing: 'ongoing',
  target: { type: 'chance', side: 'own', selector: 'first_in_sector', chanceTypes: ['box'] },
  effects: [{ type: 'change_chance_type', chanceType: 'cross', count: 1 }],
  duration: 'ongoing',
});

/** Jared Bogotti / Jared Borgetti — comeback Cross specialist. */
export const GLANCER = action({
  id: 'act_glancer',
  name: 'GLANCER',
  displayText: 'Ongoing while losing: This player claims your first Cross chance each period. It scores on 5+.',
  timing: 'ongoing',
  conditionGroups: [{ group: 0, conditions: [{ type: 'score_state', state: 'losing' }] }],
  target: { type: 'chance', side: 'own', selector: 'first', chanceTypes: ['cross'] },
  effects: [{ type: 'claim_chance' }, { type: 'set_goal_threshold', minimumRoll: 5 }],
  duration: 'ongoing',
});

/** Paul MacGraw / Paul McGrath — first defensive counter to Cross specialists. */
export const AERIAL_COMMAND = action({
  id: 'act_aerial_command',
  name: 'AERIAL COMMAND',
  displayText: "Ongoing: The opponent's first Cross chance each period cannot score on less than 6+.",
  timing: 'ongoing',
  target: { type: 'chance', side: 'enemy', selector: 'first', chanceTypes: ['cross'] },
  effects: [{ type: 'set_goal_threshold_floor', minimumRoll: 6 }],
  duration: 'ongoing',
});

/** Michael Ladrip / Michael Laudrup — first Box chance becomes a Through Ball. */
export const VISION = action({
  id: 'act_vision',
  name: 'VISION',
  displayText: 'Ongoing: Change your first Box chance each period into a Through Ball.',
  timing: 'ongoing',
  target: { type: 'chance', side: 'own', selector: 'first', chanceTypes: ['box'] },
  effects: [{ type: 'change_chance_type', chanceType: 'through_ball', count: 1 }],
  duration: 'ongoing',
});

/** Andriy Slavshinka / Andriy Shevchenko — comeback Through Ball specialist. */
export const RUNS_IN_BEHIND = action({
  id: 'act_runs_in_behind',
  name: 'RUNS IN BEHIND',
  displayText: 'Ongoing while losing: This player claims your first Through Ball chance each period. It scores on 5+.',
  timing: 'ongoing',
  conditionGroups: [{ group: 0, conditions: [{ type: 'score_state', state: 'losing' }] }],
  target: { type: 'chance', side: 'own', selector: 'first', chanceTypes: ['through_ball'] },
  effects: [{ type: 'claim_chance' }, { type: 'set_goal_threshold', minimumRoll: 5 }],
  duration: 'ongoing',
});

/** Franco Borisi / Franco Baresi — first defensive counter to Through Balls. */
export const SWEEPER = action({
  id: 'act_sweeper',
  name: 'SWEEPER',
  displayText: "Ongoing: The opponent's first Through Ball chance each period cannot score on less than 6+.",
  timing: 'ongoing',
  target: { type: 'chance', side: 'enemy', selector: 'first', chanceTypes: ['through_ball'] },
  effects: [{ type: 'set_goal_threshold_floor', minimumRoll: 6 }],
  duration: 'ongoing',
});

export const TYPED_CHANCE_PLAYER_ACTIONS: V7ActionDefinition[] = [
  BEND_IT,
  GLANCER,
  AERIAL_COMMAND,
  VISION,
  RUNS_IN_BEHIND,
  SWEEPER,
];
