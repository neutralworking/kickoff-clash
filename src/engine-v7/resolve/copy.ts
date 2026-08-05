import type {
  ActionEffect,
  BreakIndex,
  MatchReceiptEvent,
  PeriodNumber,
  RuntimeActionInstance,
  TeamSide,
  V7ActionDefinition,
  V7TeamState,
} from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import { createRng } from '../core/rng';
import { copyActionInstance } from '../actions/instances';
import type { LedgerEffect } from '../actions/effects';
import type { CardRegistry } from './stats';

// Law 2 — action copying. `copy_action` effects are minted by an activation but,
// unlike stat effects, they can't be resolved by the fold: a copy has to create
// a new, independent action instance on a card. This module materialises those
// effects into instances on the board, once, after the break's activations and
// lineup changes have settled and before the ongoing rebuild — so a copied
// ongoing passive takes hold next period.
//
// Every guard here exists to make copy chains terminate:
//  - `copyable:false` in an action's printed `copyRules` bars it as a source;
//  - `allowCopiedSource` (default false) bars an already-copied instance, and by
//    default a `copy_action`-bearing source, from being copied again — this alone
//    breaks the simplest A→B→A loop;
//  - `MAX_COPY_DEPTH` is the hard terminator: a copy's depth is source + 1, and a
//    copy above the cap is refused regardless of `allowCopiedSource`;
//  - a per-side, per-break budget bounds `sourceMode:'all'` so it cannot explode.
// Selection is deterministic (stable order; `random_positive` uses a seeded
// per-effect substream), so the whole pass replays byte-for-byte.

/** The hard copy-chain terminator: a copy above this depth is refused. */
export const MAX_COPY_DEPTH = 1;

/** Conservative per-side, per-break copy budget (a tuning number). */
export const DEFAULT_COPY_BUDGET = 3;

/** An action is copyable unless its printed `copyRules` set `copyable:false`. */
export function isActionCopyable(action: V7ActionDefinition): boolean {
  return action.copyRules?.copyable !== false;
}

function isCopyActionAction(action: V7ActionDefinition): boolean {
  return action.effects.some((effect) => effect.type === 'copy_action');
}

export interface CopyBoard {
  player: V7TeamState;
  opponent: V7TeamState;
}

export interface CopyResolutionCoords {
  period: PeriodNumber;
  breakIndex: BreakIndex;
  seed: number;
}

export interface ApplyCopyOptions {
  maxCopyDepth?: number;
  copyBudgetPerSide?: number;
  /**
   * Positivity predicate for `random_positive`. Engine-local default is the
   * printed `isNegative` flag (positive = not negative). The game layer can
   * inject the opponent-AI projected-chance-delta scorer, which lives outside
   * the pure engine, without changing this module.
   */
  isPositive?: (action: V7ActionDefinition) => boolean;
}

export interface CopyResolution {
  board: CopyBoard;
  receipts: MatchReceiptEvent[];
}

interface Candidate {
  sourceCardId: string;
  deploymentOrder: number;
  actionIndex: number;
  instance: RuntimeActionInstance;
  action: V7ActionDefinition;
}

type CopyActionEffect = Extract<ActionEffect, { type: 'copy_action' }>;

function locate(board: CopyBoard, cardId: string): { side: TeamSide; player: V7TeamState['players'][number] } | undefined {
  for (const side of ['player', 'opponent'] as const) {
    const player = board[side].players.find((entry) => entry.cardId === cardId);
    if (player) return { side, player };
  }
  return undefined;
}

interface CandidateScan {
  eligible: Candidate[];
  depthBlocked: number;
  notCopyable: number;
  total: number;
}

function scanCandidates(
  board: CopyBoard,
  effect: LedgerEffect,
  copy: CopyActionEffect,
  registry: CardRegistry,
  maxCopyDepth: number,
): CandidateScan {
  const eligible: Candidate[] = [];
  let depthBlocked = 0;
  let notCopyable = 0;
  let total = 0;

  for (const cardId of effect.targetIds) {
    const found = locate(board, cardId);
    if (!found) continue;
    found.player.actionInstances.forEach((instance, actionIndex) => {
      const action = registry.actions.get(instance.printedActionId);
      if (!action) return;
      total += 1;

      const printedCopyable = isActionCopyable(action);
      const copiedInstanceBlocked = !copy.allowCopiedSource && instance.copiedAtPeriod !== undefined;
      const copyActionBlocked = !copy.allowCopiedSource && isCopyActionAction(action);
      if (!printedCopyable || copiedInstanceBlocked || copyActionBlocked) {
        notCopyable += 1;
        return;
      }

      if ((instance.copyDepth ?? 0) + 1 > maxCopyDepth) {
        depthBlocked += 1;
        return;
      }

      eligible.push({
        sourceCardId: cardId,
        deploymentOrder: found.player.deploymentOrder,
        actionIndex,
        instance,
        action,
      });
    });
  }

  eligible.sort(
    (a, b) =>
      a.deploymentOrder - b.deploymentOrder ||
      (a.sourceCardId < b.sourceCardId ? -1 : a.sourceCardId > b.sourceCardId ? 1 : 0) ||
      a.actionIndex - b.actionIndex,
  );

  return { eligible, depthBlocked, notCopyable, total };
}

function selectSources(
  scan: CandidateScan,
  copy: CopyActionEffect,
  effect: LedgerEffect,
  coords: CopyResolutionCoords,
  isPositive: (action: V7ActionDefinition) => boolean,
): Candidate[] {
  switch (copy.sourceMode) {
    case 'all':
      return scan.eligible;
    case 'random_positive': {
      const positives = scan.eligible.filter((candidate) => isPositive(candidate.action));
      if (positives.length === 0) return [];
      const rng = createRng(coords.seed, `copy:${effect.side}:${effect.sourceInstanceId}:${coords.period}:${coords.breakIndex}`);
      return [rng.pick(positives)];
    }
    case 'first':
    case 'selected':
    default:
      return scan.eligible.slice(0, 1);
  }
}

function refusalReason(scan: CandidateScan): 'no_source' | 'not_copyable' | 'depth' {
  if (scan.total === 0) return 'no_source';
  if (scan.depthBlocked > 0) return 'depth';
  return 'not_copyable';
}

/**
 * Materialise every `copy_action` effect minted this break into independent
 * action instances on their new owners. Reads sources from the incoming board
 * snapshot, so a copy made this break is never itself a source this break.
 */
export function applyCopyEffects(
  board: CopyBoard,
  ledger: readonly LedgerEffect[],
  registry: CardRegistry,
  coords: CopyResolutionCoords,
  options: ApplyCopyOptions = {},
): CopyResolution {
  const maxCopyDepth = options.maxCopyDepth ?? MAX_COPY_DEPTH;
  const budget = options.copyBudgetPerSide ?? DEFAULT_COPY_BUDGET;
  const isPositive = options.isPositive ?? ((action: V7ActionDefinition) => !action.isNegative);

  const copyEffects = ledger.filter(
    (entry): entry is LedgerEffect & { effect: CopyActionEffect } =>
      entry.effect.type === 'copy_action' &&
      entry.createdPeriod === coords.period &&
      entry.createdBreakIndex === coords.breakIndex,
  );
  if (copyEffects.length === 0) return { board, receipts: [] };

  const additions = new Map<string, RuntimeActionInstance[]>();
  const perSideCopies: Record<TeamSide, number> = { player: 0, opponent: 0 };
  const receipts: MatchReceiptEvent[] = [];
  let ordinal = 0;

  for (const effect of copyEffects) {
    const copy = effect.effect;
    const ownerCardId = effect.sourceCardId;
    const owner = locate(board, ownerCardId);
    if (!owner) continue;

    const scan = scanCandidates(board, effect, copy, registry, maxCopyDepth);
    const selected = selectSources(scan, copy, effect, coords, isPositive);

    if (selected.length === 0) {
      receipts.push(
        receiptEvent({
          id: `rcpt:${effect.side}:copyblocked:${effect.id}`,
          period: coords.period,
          phase: 'copy_resolution',
          eventType: 'copy_blocked',
          message: `${effect.actionName} copied nothing.`,
          side: effect.side,
          sourceId: ownerCardId,
          actionName: effect.actionName,
          data: { reason: refusalReason(scan), sourceMode: copy.sourceMode },
        }),
      );
      continue;
    }

    let budgetCapped = false;
    for (const candidate of selected) {
      if (perSideCopies[effect.side] >= budget) {
        budgetCapped = true;
        break;
      }
      const created = copyActionInstance(candidate.instance, candidate.action, ownerCardId, {
        period: coords.period,
        breakIndex: coords.breakIndex,
        ordinal,
      });
      ordinal += 1;
      perSideCopies[effect.side] += 1;
      const list = additions.get(ownerCardId) ?? [];
      list.push(created);
      additions.set(ownerCardId, list);

      receipts.push(
        receiptEvent({
          id: `rcpt:${effect.side}:copied:${created.instanceId}`,
          period: coords.period,
          phase: 'copy_resolution',
          eventType: 'action_copied',
          message: `${effect.actionName} copied ${candidate.action.name} onto ${ownerCardId}.`,
          side: effect.side,
          sourceId: ownerCardId,
          actionName: effect.actionName,
          targetIds: [candidate.sourceCardId],
          data: {
            sourceInstanceId: candidate.instance.instanceId,
            newInstanceId: created.instanceId,
            ownerCardId,
            depth: created.copyDepth ?? 0,
          },
        }),
      );
    }

    if (budgetCapped) {
      receipts.push(
        receiptEvent({
          id: `rcpt:${effect.side}:copybudget:${effect.id}`,
          period: coords.period,
          phase: 'copy_resolution',
          eventType: 'copy_budget_reached',
          message: `${effect.actionName} hit the copy budget for this break.`,
          side: effect.side,
          sourceId: ownerCardId,
          actionName: effect.actionName,
          data: { budget },
        }),
      );
    }
  }

  if (additions.size === 0) return { board, receipts };

  const applyTo = (team: V7TeamState): V7TeamState => ({
    ...team,
    players: team.players.map((player) => {
      const extra = additions.get(player.cardId);
      return extra ? { ...player, actionInstances: [...player.actionInstances, ...extra] } : player;
    }),
  });

  return { board: { player: applyTo(board.player), opponent: applyTo(board.opponent) }, receipts };
}
