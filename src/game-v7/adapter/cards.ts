import type { PositionCode, Rarity, Sector, V7PlayerCard } from '@/engine-v7';
import type { Card } from '@/lib/scoring';
import { err, ok, type AdapterResult } from './result';

// Frontend player card → V7 player contract. The live `Card` model (position
// code, power, pillars, rarity) predates V7, so this is a documented derivation,
// not a lossless map. Known gaps are called out inline and surfaced in the PR:
//  - the live position codes carry no left/right flank, so wide roles default to
//    a side (out-of-position penalties still apply once they are placed);
//  - the live model has no V7 action data, so adapted cards carry no actions.
// Anything the derivation cannot satisfy returns a typed error — never a guess.

interface PositionMapping {
  code: PositionCode;
  sector: Sector;
  attackBias: number;
  defenceBias: number;
}

// Live position codes: GK/CD/WD/DM/CM/WM/AM/WF/CF. Wide roles default to a side.
const POSITION_MAP: Record<string, PositionMapping> = {
  GK: { code: 'GK', sector: 'centre', attackBias: -4, defenceBias: 4 },
  CD: { code: 'CB', sector: 'centre', attackBias: -3, defenceBias: 3 },
  WD: { code: 'RB', sector: 'right', attackBias: -2, defenceBias: 2 },
  DM: { code: 'DM', sector: 'centre', attackBias: -1, defenceBias: 2 },
  CM: { code: 'CM', sector: 'centre', attackBias: 0, defenceBias: 0 },
  WM: { code: 'RM', sector: 'right', attackBias: 1, defenceBias: -1 },
  AM: { code: 'AM', sector: 'centre', attackBias: 2, defenceBias: -2 },
  WF: { code: 'RW', sector: 'right', attackBias: 3, defenceBias: -3 },
  CF: { code: 'CF', sector: 'centre', attackBias: 4, defenceBias: -4 },
};

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function normaliseRarity(rarity: string | undefined): Rarity {
  const lower = (rarity ?? '').toLowerCase();
  return (RARITIES as string[]).includes(lower) ? (lower as Rarity) : 'common';
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Convert one live `Card` into a V7 player contract, or a typed error. */
export function adaptPlayerCard(card: Card): AdapterResult<V7PlayerCard> {
  if (typeof card.name !== 'string' || card.name.length === 0) {
    return err('missing_field', 'Card is missing a name.', { id: card.id });
  }
  if (typeof card.power !== 'number' || !Number.isFinite(card.power)) {
    return err('missing_field', `Card ${card.name} has no usable power rating.`, { id: card.id });
  }
  const mapping = POSITION_MAP[card.position];
  if (!mapping) {
    return err('unknown_position', `Card ${card.name} has an unmapped position "${card.position}".`, { id: card.id, position: card.position });
  }

  const base = clamp(Math.round(card.power / 12), 1, 9);
  const attack = clamp(base + mapping.attackBias, 0, 12);
  const defence = clamp(base + mapping.defenceBias, 0, 12);
  const parts = card.name.split(' ');

  return ok({
    id: `live-${card.id}`,
    cardKey: `live-${card.id}`,
    name: card.name,
    shortName: parts.length > 1 ? `${parts[0]![0]}. ${parts[parts.length - 1]}` : card.name,
    positionCodes: [mapping.code],
    naturalSector: mapping.sector,
    printedAttack: attack,
    printedDefence: defence,
    printedCost: clamp(Math.round(card.power / 15), 1, 7),
    role: card.tacticalRole ?? card.archetype ?? 'Player',
    rarity: normaliseRarity(card.rarity),
    actionIds: [],
  });
}

/** Adapt many cards, collecting the first error (fail fast, never partial). */
export function adaptPlayerCards(cards: readonly Card[]): AdapterResult<V7PlayerCard[]> {
  const out: V7PlayerCard[] = [];
  for (const card of cards) {
    const result = adaptPlayerCard(card);
    if (!result.ok) return result;
    out.push(result.value);
  }
  return ok(out);
}
