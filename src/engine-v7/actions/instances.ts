import type {
  BreakIndex,
  PeriodNumber,
  RuntimeActionInstance,
  V7ActionDefinition,
  V7PlayerCard,
} from '../../lib/match-v7/types';
import { initialCharges } from './charges';

// A printed action becomes a RuntimeActionInstance when its owner enters the
// match. The instance carries its own mutable-by-copy runtime: remaining
// charges, once-per-break activation count, disable window, and a small
// runtimeState bag (used e.g. by ongoing progress accumulators like Glass).

/** Provenance for a new instance. */
export interface InstanceOrigin {
  /** The card that currently owns (and will act with) this instance. */
  cardId: string;
  /** The card the action came from this time (equals cardId for printed). */
  immediateSourceCardId?: string;
  /** The card the action was originally printed on (survives copies). */
  originalSourceCardId?: string;
}

export interface CreateInstanceOptions {
  /** Override the deterministic instance id (printed default: `card::action`). */
  instanceId?: string;
  /** Seed the runtime bag (e.g. `{ accrues: true, progress: 0 }` for Glass). */
  runtimeState?: Record<string, unknown>;
}

/** Build a fresh runtime instance for a printed action on its owner card. */
export function createActionInstance(
  action: V7ActionDefinition,
  origin: InstanceOrigin,
  options: CreateInstanceOptions = {},
): RuntimeActionInstance {
  return {
    instanceId: options.instanceId ?? `${origin.cardId}::${action.id}`,
    printedActionId: action.id,
    currentOwnerCardId: origin.cardId,
    immediateSourceCardId: origin.immediateSourceCardId ?? origin.cardId,
    originalSourceCardId: origin.originalSourceCardId ?? origin.cardId,
    remainingCharges: initialCharges(action),
    copyDepth: 0,
    activationCountThisBreak: 0,
    runtimeState: { ...(options.runtimeState ?? {}) },
  };
}

/** Instantiate every action a player card carries, in listed order. */
export function instantiatePlayerActions(
  card: V7PlayerCard,
  actions: ReadonlyMap<string, V7ActionDefinition>,
  seedRuntimeState?: (action: V7ActionDefinition) => Record<string, unknown> | undefined,
): RuntimeActionInstance[] {
  const instances: RuntimeActionInstance[] = [];
  for (const actionId of card.actionIds) {
    const action = actions.get(actionId);
    if (!action) continue;
    const runtimeState = seedRuntimeState?.(action);
    instances.push(
      createActionInstance(action, { cardId: card.id }, runtimeState ? { runtimeState } : {}),
    );
  }
  return instances;
}

export interface CopyCoords {
  period: PeriodNumber;
  breakIndex: BreakIndex;
  /** Distinguishes multiple copies made in the same break. */
  ordinal?: number;
}

/**
 * Copy an action onto a new owner. The copy is a wholly independent instance:
 * it starts with the printed charge count again, a cleared activation count and
 * an empty runtime bag, so depleting the copy never touches the original. The
 * original *printed* source is preserved for provenance receipts.
 */
export function copyActionInstance(
  source: RuntimeActionInstance,
  action: V7ActionDefinition,
  newOwnerCardId: string,
  coords: CopyCoords,
  options: CreateInstanceOptions = {},
): RuntimeActionInstance {
  const ordinal = coords.ordinal ?? 0;
  return {
    instanceId:
      options.instanceId ?? `${source.instanceId}::copy:${coords.period}:${coords.breakIndex}:${ordinal}`,
    printedActionId: action.id,
    currentOwnerCardId: newOwnerCardId,
    immediateSourceCardId: source.currentOwnerCardId,
    originalSourceCardId: source.originalSourceCardId,
    remainingCharges: initialCharges(action),
    copiedAtPeriod: coords.period,
    copiedAtBreak: coords.breakIndex,
    copyDepth: (source.copyDepth ?? 0) + 1,
    activationCountThisBreak: 0,
    runtimeState: { ...(options.runtimeState ?? {}) },
  };
}
