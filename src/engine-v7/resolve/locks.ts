import type {
  BreakIndex,
  FormationDefinition,
  PeriodNumber,
  RuntimePlayerState,
  Sector,
  SectorLock,
  BreakPlan,
  TeamSide,
} from '../../lib/match-v7/types';
import type { EffectLifetime, LedgerEffect } from '../actions/effects';

// Sector movement / substitution locks (Batch-1 Law 5 / NW-163). A `lock_sector`
// effect freezes one side's lineup in a sector for a window: while active, that
// side cannot substitute into or out of, or move a card across, the locked sector.
// Locks live on match state; enforcement is a pure check in `validateBreakPlan`, so
// an illegal plan is rejected before it reaches the resolver. Mandatory removal
// wins over a lock — a card that MUST leave is never trapped (settled).
//
// v1 scope: sector-scoped, own- or enemy-targeted, blocking lineup changes only
// (not activations). Slot/card scopes are out of this slice.

const otherSide = (side: TeamSide): TeamSide => (side === 'player' ? 'opponent' : 'player');

/** Map an effect lifetime to a lock window (mirrors the disable window). A
 *  non-span lifetime (immediate / while_active / until_used) locks the current
 *  break's period only. */
function windowForLifetime(lifetime: EffectLifetime, period: PeriodNumber): SectorLock['until'] {
  switch (lifetime.kind) {
    case 'match': return { matchEnd: true };
    case 'period': return { period: lifetime.untilPeriod };
    case 'break': return { period: lifetime.period, break: lifetime.breakIndex };
    default: return { period };
  }
}

/** Is a lock still in force at the given coordinates? Mirrors `isActionDisabled`. */
export function isLockActive(lock: SectorLock, coords: { period: PeriodNumber; breakIndex: BreakIndex | 0 }): boolean {
  const until = lock.until;
  if (!until) return true;
  if (until.matchEnd) return true;
  if (until.period !== undefined) {
    if (coords.period < until.period) return true;
    if (coords.period > until.period) return false;
    if (until.break !== undefined && coords.breakIndex !== 0) return coords.breakIndex <= until.break;
    return true;
  }
  if (until.break !== undefined && coords.breakIndex !== 0) return coords.breakIndex <= until.break;
  return false;
}

/** Build the sector locks a break's `lock_sector` effects create. `targetSide`
 *  is resolved relative to the acting side of each effect. */
export function createLocksFromEffects(
  ledger: readonly LedgerEffect[],
  coords: { period: PeriodNumber; breakIndex: BreakIndex },
): SectorLock[] {
  const locks: SectorLock[] = [];
  for (const entry of ledger) {
    if (entry.effect.type !== 'lock_sector') continue;
    if (entry.createdBreakIndex !== coords.breakIndex || entry.createdPeriod !== coords.period) continue;
    const side = entry.effect.targetSide === 'enemy' ? otherSide(entry.side) : entry.side;
    locks.push({ side, sector: entry.effect.sector, until: windowForLifetime(entry.lifetime, coords.period) });
  }
  return locks;
}

/** Carry forward the still-active locks for the upcoming coordinates and append
 *  any newly created this break. */
export function carryLocks(
  existing: readonly SectorLock[] | undefined,
  created: readonly SectorLock[],
  coords: { period: PeriodNumber; breakIndex: BreakIndex | 0 },
): SectorLock[] {
  return [...(existing ?? []).filter((lock) => isLockActive(lock, coords)), ...created];
}

function sectorOfSlot(formation: FormationDefinition, slotKey: string): Sector | undefined {
  return formation.slots.find((slot) => slot.slotKey === slotKey)?.sector;
}

/**
 * The lock violations a plan would incur: substituting into a locked sector,
 * substituting a non-mandatory card out of one, or moving a card across a locked
 * sector's boundary — for the plan's own side, against the currently active locks.
 */
export function sectorLockErrors(
  locks: readonly SectorLock[],
  coords: { period: PeriodNumber; breakIndex: BreakIndex | 0 },
  plan: BreakPlan,
  players: readonly RuntimePlayerState[],
  formation: FormationDefinition,
): string[] {
  const locked = new Set(
    locks.filter((lock) => lock.side === plan.side && isLockActive(lock, coords)).map((lock) => lock.sector),
  );
  if (locked.size === 0) return [];

  const errors: string[] = [];
  const currentSectorOf = (cardId: string): Sector | undefined =>
    players.find((player) => player.cardId === cardId)?.currentSector;
  const mandatory = new Set(players.filter((player) => player.mandatoryRemoval).map((player) => player.cardId));
  const incomingCards = new Set(plan.incomingAssignments.map((assignment) => assignment.cardId));
  // Slots a mandatory-removal card currently holds: a lock must not block filling
  // the slot a forced departure vacates, or the XI would be left short.
  const mandatorySlots = new Set(
    players
      .filter((player) => player.zone === 'active' && player.currentSlotKey && mandatory.has(player.cardId))
      .map((player) => player.currentSlotKey!),
  );

  for (const assignment of plan.incomingAssignments) {
    if (mandatorySlots.has(assignment.slotKey)) continue; // filling a forced vacancy
    const sector = sectorOfSlot(formation, assignment.slotKey);
    if (sector && locked.has(sector)) errors.push(`Cannot substitute ${assignment.cardId} into the locked ${sector} sector.`);
  }
  for (const cardId of plan.outgoingCardIds) {
    if (mandatory.has(cardId)) continue; // mandatory removal wins over a lock
    const sector = currentSectorOf(cardId);
    if (sector && locked.has(sector)) errors.push(`Cannot substitute ${cardId} out of the locked ${sector} sector.`);
  }
  for (const [slotKey, cardId] of Object.entries(plan.finalSlotAssignments)) {
    if (incomingCards.has(cardId)) continue; // a sub-on, handled above
    const toSector = sectorOfSlot(formation, slotKey);
    const fromSector = currentSectorOf(cardId);
    if (fromSector && toSector && fromSector !== toSector && (locked.has(fromSector) || locked.has(toSector))) {
      errors.push(`Cannot move ${cardId} across the locked ${locked.has(fromSector) ? fromSector : toSector} sector.`);
    }
  }
  return errors;
}
