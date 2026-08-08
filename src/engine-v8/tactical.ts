import { type V8Zone } from './core';

export type V8CalibrationChanceType = 'cross' | 'through_ball' | 'long_shot' | 'corner' | 'penalty';
export type V8UtilityTacticalType = 'offside_trap' | 'trigger_press';
export type V8TacticalType = V8CalibrationChanceType | V8UtilityTacticalType;

export interface V8TacticalDefinition {
  type: V8TacticalType;
  name: string;
  baseCost: number;
  baseAtt: number;
  eligibleZones: readonly V8Zone[];
  isChance: boolean;
  text: string;
}

export interface V8GeneratedTacticalMetadata {
  /** Bobby Charlton: add this much ATT when the card is actually played in MID. */
  bonusAttInMid?: number;
  /** Park Ji-sung: the generated Trigger Press costs 0 only in this period. */
  freeThroughPeriod?: number;
  /** Franco Baresi: successful cancellation from this exact trap rewards its source zone. */
  baresiPlayerId?: string;
  /**
   * The period this instance entered hand. Window eligibility is the equality
   * `enteredHandPeriod === state.period` (the Generated-Tactical Window contract).
   */
  enteredHandPeriod?: number;
  /** First period whose COMMITMENT phase may play a held generated card (set by the timing layer). */
  availableFromPeriod?: number;
  /** Open metadata bag for future generated-card riders without inventing new card types. */
  [key: string]: string | number | boolean | undefined;
}

export interface V8TacticalCardInstance {
  kind: 'tactical';
  id: string;
  type: V8TacticalType;
  name: string;
  baseCost: number;
  costModifier: number;
  baseAtt: number;
  attModifier: number;
  cancellable: boolean;
  generatedBy?: string;
  metadata: V8GeneratedTacticalMetadata;
}

/**
 * eligibleZones remains the legality list, but its order is also the calibration CPU's
 * deterministic tie-break when two legal zones cost the same. Keep the preferred specialist
 * lane first: Cross / Through Ball finishers live in ATT, while Long Shot specialists live in MID.
 * This changes only CPU placement preference, not Tactical legality or balance values.
 */
export const V8_TACTICAL_DEFINITIONS: Record<V8TacticalType, V8TacticalDefinition> = {
  cross: {
    type: 'cross',
    name: 'Cross',
    baseCost: 1,
    baseAtt: 2,
    eligibleZones: ['ATT', 'MID'],
    isChance: true,
    text: '+2 ATT this period.',
  },
  through_ball: {
    type: 'through_ball',
    name: 'Through Ball',
    baseCost: 1,
    baseAtt: 2,
    eligibleZones: ['ATT', 'MID'],
    isChance: true,
    text: '+2 ATT this period.',
  },
  long_shot: {
    type: 'long_shot',
    name: 'Long Shot',
    baseCost: 1,
    baseAtt: 1,
    eligibleZones: ['MID', 'DEF', 'ATT'],
    isChance: true,
    text: '+1 ATT this period.',
  },
  corner: {
    type: 'corner',
    name: 'Corner',
    baseCost: 1,
    baseAtt: 3,
    eligibleZones: ['ATT'],
    isChance: true,
    text: '+3 ATT this period.',
  },
  penalty: {
    type: 'penalty',
    name: 'Penalty',
    baseCost: 1,
    baseAtt: 5,
    eligibleZones: ['ATT'],
    isChance: true,
    text: '+5 ATT this period.',
  },
  offside_trap: {
    type: 'offside_trap',
    name: 'Offside Trap',
    baseCost: 1,
    baseAtt: 0,
    eligibleZones: ['DEF'],
    isChance: false,
    text: 'Cancel the next opposing Through Ball played here this period.',
  },
  trigger_press: {
    type: 'trigger_press',
    name: 'Trigger Press',
    baseCost: 1,
    baseAtt: 0,
    eligibleZones: ['ATT'],
    isChance: false,
    text: "Your players’ DEF here also counts toward ATT this period.",
  },
};

export const V8_CHANCE_TYPES = new Set<V8TacticalType>([
  'cross',
  'through_ball',
  'long_shot',
  'corner',
  'penalty',
]);

export function isV8ChanceType(type: V8TacticalType): type is V8CalibrationChanceType {
  return V8_CHANCE_TYPES.has(type);
}

export function createTacticalInstance(
  type: V8TacticalType,
  id: string,
  options: Partial<Pick<V8TacticalCardInstance, 'costModifier' | 'attModifier' | 'cancellable' | 'generatedBy' | 'metadata'>> = {},
): V8TacticalCardInstance {
  const definition = V8_TACTICAL_DEFINITIONS[type];
  return {
    kind: 'tactical',
    id,
    type,
    name: definition.name,
    baseCost: definition.baseCost,
    costModifier: options.costModifier ?? 0,
    baseAtt: definition.baseAtt,
    attModifier: options.attModifier ?? 0,
    cancellable: options.cancellable ?? true,
    generatedBy: options.generatedBy,
    metadata: { ...(options.metadata ?? {}) },
  };
}

export function tacticalPrintedAttack(card: V8TacticalCardInstance, zone: V8Zone): number {
  const midRider = zone === 'MID' ? Number(card.metadata.bonusAttInMid ?? 0) : 0;
  return card.baseAtt + card.attModifier + midRider;
}

export function tacticalBaseCost(card: V8TacticalCardInstance, period: number): number {
  if (card.metadata.freeThroughPeriod === period) return 0;
  return Math.max(0, card.baseCost + card.costModifier);
}

export function tacticalCanPlayInZone(card: V8TacticalCardInstance, zone: V8Zone): boolean {
  return V8_TACTICAL_DEFINITIONS[card.type].eligibleZones.includes(zone);
}
