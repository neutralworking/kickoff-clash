import type { PositionCode, Rarity, Sector, V7PlayerCard } from '@/engine-v7';
import type { Card } from '@/lib/scoring';
import { err, ok, type AdapterResult } from './result';

// Frontend player card → V7 player contract. The live `Card` model (position
// code, power, pillars, rarity) predates V7, so this is a documented derivation,
// not a lossless map. Known gaps are called out inline and surfaced in the PR:
//  - the live position codes carry no left/right flank, so `naturalSector` here is
//    only a provisional default; the live builder (`live.ts`) resolves the real
//    flank from the formation slot the card is placed in (NW-152);
//  - the live model has no V7 action data, so adapted cards carry no actions.
// Anything the derivation cannot satisfy returns a typed error — never a guess.
//
// ATT/DEF derivation (NW-152). Owner decision: derive BOTH stats from the one
// `power` scalar with INDEPENDENT per-position curves, rather than normalising the
// per-card att/def in `kc_v2_cards.json`. The reason is single-regime symmetry: the
// live opponent XI is *synthesised* from a power budget alone (`opponent.ts`,
// `id: 9000+i`) with no dataset entry and no att/def, so power is the only stat
// source both sides can share. Feeding the player v2 data while the opponent stays
// power-derived would rebuild the very "two sides tuned against different data" bug
// this ticket fixes.
//
// The previous derivation gave every position a single `base = round(power/12)` and
// then equal-and-opposite biases, so `attack` and `defence` scaled together. A
// standard XI carries more defensive than attacking slots, so summed team DEF always
// exceeded summed team ATT — and the engine's chance count, `floor((teamATT −
// enemyDEF)/5)`, needs team ATT to *exceed* enemy DEF, so every mirror match created
// zero chances and ended 0-0. The fix breaks that symmetry: each position gets an
// independent ATT anchor and DEF anchor (at a reference power), and the DEF band is
// compressed relative to the ATT band so a mirror-quality XI sums to team ATT modestly
// above team DEF (~2 chances/period → a football scoreline). The per-position SHAPE
// (attackers att-heavy, defenders def-heavy) mirrors the curated positional means in
// `kc_v2_cards.json`; only the overall level is retuned to the engine's 0–12 scale and
// the team-total target. See the calibration note below the table.

// The power at which the anchors below are the printed stat; other powers scale
// linearly from it (a card at 2×REF power would print ~2× the anchors, pre-clamp).
const REFERENCE_POWER = 70;

interface PositionMapping {
  code: PositionCode;
  sector: Sector;
  /** Printed ATT at REFERENCE_POWER (0–12 engine scale), scaled by power. */
  attackAnchor: number;
  /** Printed DEF at REFERENCE_POWER (0–12 engine scale), scaled by power. */
  defenceAnchor: number;
}

// Live position codes: GK/CD/WD/DM/CM/WM/AM/WF/CF. The `sector` for wide roles
// (WD/WM/WF) is a provisional default only — `live.ts` overrides it from the slot.
//
// Anchors are calibrated so a reference (power≈70) 4-3-3 mirror sums to team
// ATT ≈ 56 vs team DEF ≈ 44 → each side gets `floor((56−44)/5) = 2` chances per
// period. The ATT/DEF split per position tracks the kc_v2 positional means
// (WF/AM/CF att-heavy, GK/CD/WD def-heavy, CM balanced), compressed to 0–12.
const POSITION_MAP: Record<string, PositionMapping> = {
  GK: { code: 'GK', sector: 'centre', attackAnchor: 1, defenceAnchor: 6 },
  CD: { code: 'CB', sector: 'centre', attackAnchor: 2, defenceAnchor: 5 },
  WD: { code: 'RB', sector: 'right', attackAnchor: 4, defenceAnchor: 4 },
  DM: { code: 'DM', sector: 'centre', attackAnchor: 4, defenceAnchor: 5 },
  CM: { code: 'CM', sector: 'centre', attackAnchor: 6, defenceAnchor: 4 },
  WM: { code: 'RM', sector: 'right', attackAnchor: 7, defenceAnchor: 3 },
  AM: { code: 'AM', sector: 'centre', attackAnchor: 8, defenceAnchor: 3 },
  WF: { code: 'RW', sector: 'right', attackAnchor: 9, defenceAnchor: 2 },
  CF: { code: 'CF', sector: 'centre', attackAnchor: 9, defenceAnchor: 3 },
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

  // Independent ATT/DEF, each its own function of power × per-position anchor.
  const powerFactor = card.power / REFERENCE_POWER;
  const attack = clamp(Math.round(mapping.attackAnchor * powerFactor), 0, 12);
  const defence = clamp(Math.round(mapping.defenceAnchor * powerFactor), 0, 12);
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
