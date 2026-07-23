import type { FormationDefinition, FormationSlot, PositionCode, Sector } from '../../lib/match-v7/types';

export interface FormationValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFormation(formation: FormationDefinition): FormationValidationResult {
  const errors: string[] = [];
  const slotKeys = new Set<string>();
  let goalkeeperSlots = 0;

  if (formation.slots.length !== 11) {
    errors.push(`Formation ${formation.formationKey} must contain exactly 11 slots.`);
  }

  for (const slot of formation.slots) {
    if (slotKeys.has(slot.slotKey)) {
      errors.push(`Duplicate slot key: ${slot.slotKey}.`);
    }
    slotKeys.add(slot.slotKey);

    if (slot.positionCode === 'GK') goalkeeperSlots += 1;

    for (const adjacent of slot.adjacentSlotKeys) {
      if (adjacent === slot.slotKey) {
        errors.push(`Slot ${slot.slotKey} cannot be adjacent to itself.`);
      }
    }
  }

  if (goalkeeperSlots !== 1) {
    errors.push(`Formation ${formation.formationKey} must contain exactly one GK slot.`);
  }

  for (const slot of formation.slots) {
    for (const adjacent of slot.adjacentSlotKeys) {
      if (!slotKeys.has(adjacent)) {
        errors.push(`Slot ${slot.slotKey} references missing adjacent slot ${adjacent}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function slotByKey(
  formation: FormationDefinition,
  slotKey: string,
): FormationSlot | undefined {
  return formation.slots.find((slot) => slot.slotKey === slotKey);
}

export function slotsInSector(
  formation: FormationDefinition,
  sector: Sector,
): FormationSlot[] {
  return formation.slots.filter((slot) => slot.sector === sector);
}

export function slotsForPosition(
  formation: FormationDefinition,
  position: PositionCode,
): FormationSlot[] {
  return formation.slots.filter((slot) => slot.positionCode === position);
}

export function adjacentSlots(
  formation: FormationDefinition,
  slotKey: string,
): FormationSlot[] {
  const source = slotByKey(formation, slotKey);
  if (!source) return [];
  return source.adjacentSlotKeys
    .map((key) => slotByKey(formation, key))
    .filter((slot): slot is FormationSlot => Boolean(slot));
}

export function partnerSlots(
  formation: FormationDefinition,
  slotKey: string,
  partnerLinkKey?: string,
): FormationSlot[] {
  const source = slotByKey(formation, slotKey);
  if (!source) return [];

  const links = partnerLinkKey
    ? source.partnerLinkKeys.filter((key) => key === partnerLinkKey)
    : source.partnerLinkKeys;

  if (links.length === 0) return [];

  return formation.slots.filter((slot) =>
    slot.slotKey !== slotKey && links.some((link) => slot.partnerLinkKeys.includes(link)),
  );
}
