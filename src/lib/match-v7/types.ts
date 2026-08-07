// Kickoff Clash V7 — serializable, implementation-facing domain contracts.

export type TeamSide = 'player' | 'opponent';
export type Sector = 'left' | 'centre' | 'right';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type PositionCode =
  | 'GK' | 'LB' | 'RB' | 'CB' | 'LWB' | 'RWB' | 'DM' | 'LM'
  | 'CM' | 'RM' | 'LW' | 'AM' | 'RW' | 'LF' | 'CF' | 'RF';
export type ChanceType = 'box' | 'cross' | 'through_ball' | 'corner';
export type FinisherAssignment = 'default' | 'claimed' | 'fallback';
export type ChanceSelector = 'first_in_sector' | 'last_in_sector' | 'all_in_sector' | 'first';

export const BREAK_ENERGY = { 1: 3, 2: 5, 3: 7 } as const;
export type BreakIndex = keyof typeof BREAK_ENERGY;
export type PeriodNumber = 1 | 2 | 3 | 4;

export type ActionTiming =
  | 'squad_selection'
  | 'game_start'
  | 'ongoing'
  | 'end_of_period'
  | 'subbed_off'
  | 'subbed_on'
  | 'on_bench'
  | 'before_final_period'
  | 'activated'
  | 'manager_activated';

export type ResolutionStage = 'before_lineup_changes' | 'after_lineup_changes';
export type EffectDuration =
  | 'instant'
  | 'this_break'
  | 'current_period'
  | 'next_period'
  | 'fixed_periods'
  | 'ongoing'
  | 'while_active'
  | 'whole_match'
  | 'until_used'
  | 'until_disabled'
  | 'match_permanent';

export type RankingMeasure = 'attack' | 'defence' | 'total';
export type SelectorDirection = 'strongest' | 'weakest';

export type ActionCondition =
  | { type: 'always' }
  | { type: 'score_state'; state: 'winning' | 'losing' | 'level' }
  | { type: 'period_is'; period: PeriodNumber }
  | { type: 'period_at_least'; period: PeriodNumber }
  | { type: 'formation_is'; formationKey: string }
  | { type: 'source_position_is'; positions: PositionCode[] }
  | { type: 'source_sector_is'; sectors: Sector[] }
  | { type: 'occupied_position_count'; positions: PositionCode[]; comparison: 'eq' | 'gte' | 'lte'; value: number }
  | { type: 'slot_occupied'; slotKey: string }
  | { type: 'slot_empty'; slotKey: string }
  | { type: 'has_partner'; partnerLinkKey?: string }
  | { type: 'source_rank'; direction: SelectorDirection; measure: RankingMeasure }
  | { type: 'probability'; numerator: number; denominator: number };

export interface ConditionGroup {
  /** Conditions inside a group are OR; groups are AND. */
  group: number;
  conditions: ActionCondition[];
}

export type ActionTarget =
  | { type: 'self' }
  | { type: 'selected_player'; side: TeamSide | 'own' | 'enemy'; zone?: 'active' | 'bench' | 'squad' }
  | { type: 'team'; side: 'own' | 'enemy'; zone?: 'active' | 'bench' }
  | { type: 'sector'; side: 'own' | 'enemy'; sector?: Sector; selected?: boolean }
  | { type: 'slot'; side: 'own' | 'enemy'; slotKey?: string; selected?: boolean }
  | { type: 'position_group'; side: 'own' | 'enemy'; positions: PositionCode[] }
  | { type: 'adjacent_player'; side: 'own' | 'enemy' }
  | { type: 'partner'; mode: 'one' | 'selected' | 'all' | 'first' | 'strongest' }
  | { type: 'ranked_players'; side: 'own' | 'enemy'; direction: SelectorDirection; measure: RankingMeasure; count?: number; includePrimaryTies?: boolean }
  | { type: 'chance'; side: 'own' | 'enemy'; selector: ChanceSelector; sector?: Sector; chanceTypes?: ChanceType[] };

export type ActionEffect =
  | { type: 'modify_stat'; stat: 'attack' | 'defence'; mode: 'flat' | 'set' | 'multiply'; amount: number }
  | { type: 'swap_stats' }
  | { type: 'modify_cost'; amount: number }
  | { type: 'modify_break_budget'; amount: number; guaranteed: boolean }
  | { type: 'add_chance'; count: number; chanceType: ChanceType; sectorMode: 'source' | 'selected' | 'centre' | 'highest_pressure' | 'lowest_pressure' | 'random' }
  | { type: 'change_chance_type'; chanceType: ChanceType; count: number }
  | { type: 'claim_chance' }
  | { type: 'cancel_chance'; count: number }
  | { type: 'move_chance'; destination: Sector | 'selected' | 'highest_pressure' | 'lowest_pressure' }
  | { type: 'set_goal_threshold'; minimumRoll: 3 | 4 | 5 | 6 | 7 }
  | { type: 'add_reroll'; count: number }
  | { type: 'copy_action'; sourceMode: 'first' | 'selected' | 'all' | 'random_positive'; allowCopiedSource: boolean }
  | { type: 'disable_action'; scope: 'named_action' | 'all_player_actions' | 'manager_action'; duration: EffectDuration }
  | { type: 'restore_charge'; count: number; mayExceedPrintedMaximum: boolean }
  | { type: 'add_charge'; count: number }
  | { type: 'remove_charge'; count: number }
  | { type: 'switch_formation'; formationKey?: string; selected: boolean }
  | { type: 'scanner'; reveal: 'full_plan' };

export interface V7ActionDefinition {
  id: string;
  actionKey: string;
  name: string;
  displayText: string;
  ownerType: 'player' | 'manager';
  timing: ActionTiming;
  resolutionStage?: ResolutionStage;
  conditionGroups: ConditionGroup[];
  target: ActionTarget;
  effects: ActionEffect[];
  duration: EffectDuration;
  printedCharges?: number;
  activationLimitPerBreak: 1;
  isNegative: boolean;
  copyRules: Record<string, unknown>;
  disableRules: Record<string, unknown>;
  engineSupportStatus: 'supported' | 'requires_extension' | 'blocked';
}

export interface V7PlayerCard {
  id: string;
  cardKey: string;
  name: string;
  shortName?: string;
  positionCodes: PositionCode[];
  naturalSector: Sector;
  printedAttack: number;
  printedDefence: number;
  printedCost: number;
  role: string;
  rarity: Rarity;
  actionIds: string[];
}

export interface V7ManagerCard {
  id: string;
  cardKey: string;
  name: string;
  startingBudget: number;
  formationIds: string[];
  actionIds: string[];
  rarity: Rarity;
}

export interface FormationSlot {
  slotKey: string;
  positionCode: PositionCode;
  sector: Sector;
  xOrder: number;
  yOrder: number;
  adjacentSlotKeys: string[];
  partnerLinkKeys: string[];
}

export interface FormationDefinition {
  id: string;
  formationKey: string;
  name: string;
  slots: FormationSlot[];
}

export type CardZone = 'active' | 'bench' | 'removed';

export interface RuntimeActionInstance {
  instanceId: string;
  printedActionId: string;
  currentOwnerCardId: string;
  immediateSourceCardId: string;
  originalSourceCardId: string;
  remainingCharges?: number;
  disabledUntil?: { period?: PeriodNumber; break?: BreakIndex; matchEnd?: true };
  copiedAtPeriod?: PeriodNumber;
  copiedAtBreak?: BreakIndex;
  activationCountThisBreak: 0 | 1;
  runtimeState: Record<string, unknown>;
}

export interface RuntimePlayerState {
  cardId: string;
  deploymentOrder: number;
  zone: CardZone;
  currentSlotKey?: string;
  currentSector?: Sector;
  periodsParticipated: PeriodNumber[];
  mandatoryRemoval: boolean;
  actionInstances: RuntimeActionInstance[];
  activeEffectIds: string[];
  accumulatedStacks: Record<string, number>;
  currentCost: number;
}

export interface PlannedActivation {
  actionInstanceId: string;
  sourceId: string;
  stage: ResolutionStage;
  order: number;
  selectedTargetIds?: string[];
  selectedSector?: Sector;
  selectedSlotKey?: string;
  selectedMode?: string;
}

export interface IncomingAssignment {
  cardId: string;
  slotKey: string;
}

export interface BreakBudgetReceipt {
  breakIndex: BreakIndex;
  baseEnergy: 3 | 5 | 7;
  guaranteedModifiers: Array<{ sourceId: string; actionId: string; amount: number }>;
  availableEnergy: number;
  incomingCosts: Array<{ cardId: string; cost: number }>;
  netIncomingCost: number;
  legalAtSubmission: boolean;
}

export interface BreakPlan {
  side: TeamSide;
  breakIndex: BreakIndex;
  formationSwitchId?: string;
  outgoingCardIds: string[];
  incomingAssignments: IncomingAssignment[];
  finalSlotAssignments: Record<string, string>;
  activations: PlannedActivation[];
  submittedBudget: BreakBudgetReceipt;
  scannerRevealState: 'none' | 'revealed' | 'cancelled';
  locked: boolean;
}

export interface ChanceToken {
  id: string;
  side: TeamSide;
  sector: Sector;
  origin: 'calculated' | 'stored' | 'action';
  chanceType: ChanceType;
  order: number;
  minimumGoalRoll: 3 | 4 | 5 | 6 | 7;
  rerolls: number;
  cancelled: boolean;
  sourceActionInstanceId?: string;
  finisherId?: string;
  finisherAssignment?: FinisherAssignment;
}

export interface MatchReceiptEvent {
  id: string;
  period: PeriodNumber;
  phase: string;
  side?: TeamSide;
  sourceId?: string;
  actionName?: string;
  targetIds?: string[];
  eventType: string;
  message: string;
  data: Record<string, unknown>;
}

export interface V7TeamState {
  side: TeamSide;
  managerId: string;
  formationId: string;
  players: RuntimePlayerState[];
  score: number;
  cumulativeGrossChances: number;
}

export interface V7MatchState {
  seed: number;
  period: PeriodNumber;
  breakIndex: 0 | BreakIndex;
  priority: TeamSide;
  previousPriority?: TeamSide;
  player: V7TeamState;
  opponent: V7TeamState;
  receipt: MatchReceiptEvent[];
  resolutionDepth: number;
}
