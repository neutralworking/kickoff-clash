/**
 * Kickoff Clash V6 — the board: effective ATT/DEF by sector + sector control.
 *
 * Pure over an input snapshot (placements + the stat effects that apply to THIS
 * board) so it is trivially testable and never reaches into match state. The
 * caller (the resolver) merges "my buffs" with "their onEnemy debuffs" into the
 * single `statEffects` list a board sees.
 *
 * Every number carries a receipt (spec §board): printed → out-of-position
 * penalty (A3) → each named effect → effective total. Threshold math (in
 * `resolver.ts`) floors effective stats at 0; the receipt keeps the raw values.
 */

import type {
  ActiveEffect,
  BoardReceipt,
  CardInPlay,
  CardStatReceipt,
  Sector,
  SectorReceipt,
  StatModLine,
  TeamSide,
  V6Card,
} from './types';
import { SECTORS } from './types';
import { V6_BALANCE, type V6Balance } from './balance';

/** A card placed on the board with its current sector resolved. */
export interface ActivePlacement {
  card: V6Card;
  sector: Sector;
}

/** Resolve a team's active `CardInPlay[]` into placements via the shared pool. */
export function activePlacements(cards: CardInPlay[], pool: Record<string, V6Card>): ActivePlacement[] {
  const out: ActivePlacement[] = [];
  for (const c of cards) {
    if (c.zone !== 'active') continue;
    const card = pool[c.cardId];
    if (card) out.push({ card, sector: c.sector });
  }
  return out;
}

/** Does this stat effect apply to the given placement? */
function statHits(eff: ActiveEffect, p: ActivePlacement): boolean {
  if (eff.kind !== 'stat') return false;
  if (eff.targetTeam) return true;
  if (eff.targetSector && eff.targetSector === p.sector) return true;
  if (eff.targetCardIds && eff.targetCardIds.includes(p.card.id)) return true;
  return false;
}

/** Effective stats + full receipt for one card. */
export function cardReceipt(
  p: ActivePlacement,
  statEffects: readonly ActiveEffect[],
  balance: V6Balance = V6_BALANCE,
): CardStatReceipt {
  const outOfPosition = p.sector !== p.card.sector;
  const mods: StatModLine[] = [];

  let attack = p.card.attack;
  let defence = p.card.defence;

  if (outOfPosition) {
    const pa = balance.outOfPositionPenalty.attack;
    const pd = balance.outOfPositionPenalty.defence;
    attack -= pa;
    defence -= pd;
    mods.push({ label: 'Out of position', attack: -pa, defence: -pd });
  }

  for (const eff of statEffects) {
    if (!statHits(eff, p)) continue;
    const a = eff.attack ?? 0;
    const d = eff.defence ?? 0;
    if (a === 0 && d === 0) continue;
    attack += a;
    defence += d;
    mods.push({ label: eff.sourceLabel, attack: a, defence: d });
  }

  return {
    cardId: p.card.id,
    name: p.card.name,
    sector: p.sector,
    naturalSector: p.card.sector,
    outOfPosition,
    printedAttack: p.card.attack,
    printedDefence: p.card.defence,
    mods,
    attack,
    defence,
  };
}

const emptySector = (sector: Sector): SectorReceipt => ({ sector, attack: 0, defence: 0, cards: [] });

/** Build one side's full board (all three sectors always present). */
export function buildBoard(
  placements: readonly ActivePlacement[],
  statEffects: readonly ActiveEffect[],
  balance: V6Balance = V6_BALANCE,
): BoardReceipt {
  const board: BoardReceipt = {
    left: emptySector('left'),
    centre: emptySector('centre'),
    right: emptySector('right'),
  };
  for (const p of placements) {
    const r = cardReceipt(p, statEffects, balance);
    const s = board[p.sector];
    s.cards.push(r);
    s.attack += r.attack;
    s.defence += r.defence;
  }
  return board;
}

/** ATT + DEF in a sector (the sector-control metric, handoff §"Reveal priority"). */
export function sectorStrength(s: SectorReceipt): number {
  return Math.max(0, s.attack) + Math.max(0, s.defence);
}

/** Total ATT + DEF across all sectors (priority tiebreak 1). */
export function boardStrength(board: BoardReceipt): number {
  return SECTORS.reduce((sum, sec) => sum + sectorStrength(board[sec]), 0);
}

export interface SectorControl {
  bySector: Record<Sector, TeamSide | 'tie'>;
  controlled: Record<TeamSide, number>;
}

/**
 * Which side controls each sector (greater ATT+DEF) and how many each holds.
 * Priority tiebreakers (total strength, then alternate) are applied in
 * `priority.ts`, not here.
 */
export function sectorControl(player: BoardReceipt, opponent: BoardReceipt): SectorControl {
  const bySector = {} as Record<Sector, TeamSide | 'tie'>;
  const controlled: Record<TeamSide, number> = { player: 0, opponent: 0 };
  for (const sec of SECTORS) {
    const mine = sectorStrength(player[sec]);
    const theirs = sectorStrength(opponent[sec]);
    if (mine > theirs) {
      bySector[sec] = 'player';
      controlled.player++;
    } else if (theirs > mine) {
      bySector[sec] = 'opponent';
      controlled.opponent++;
    } else {
      bySector[sec] = 'tie';
    }
  }
  return { bySector, controlled };
}
