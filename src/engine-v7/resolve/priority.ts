import type { Sector, TeamSide } from '../../lib/match-v7/types';
import type { EffectivePlayer } from './stats';

// Priority (V6 spec B5). A sector is controlled by the side with the greater
// active ATT+DEF in it. More sectors controlled → priority; tie → the greater
// total ATT+DEF across all sectors; tie → priority alternates from the previous
// period. Priority only sets resolution ORDER — the leader resolves its locked
// plan first, so the trailing side's board-reading cards see the leader's moves.

const SECTORS: readonly Sector[] = ['left', 'centre', 'right'];

export interface SectorControl {
  sector: Sector;
  playerStrength: number;
  opponentStrength: number;
  controlledBy: TeamSide | 'none';
}

function sectorStrength(players: readonly EffectivePlayer[], sector: Sector): number {
  return players
    .filter((player) => player.zone === 'active' && player.sector === sector)
    .reduce((sum, player) => sum + player.attack + player.defence, 0);
}

/** Per-sector ATT+DEF control for the two sides. */
export function sectorControl(
  playerActive: readonly EffectivePlayer[],
  opponentActive: readonly EffectivePlayer[],
): SectorControl[] {
  return SECTORS.map((sector) => {
    const playerStrength = sectorStrength(playerActive, sector);
    const opponentStrength = sectorStrength(opponentActive, sector);
    const controlledBy: TeamSide | 'none' =
      playerStrength > opponentStrength ? 'player' : opponentStrength > playerStrength ? 'opponent' : 'none';
    return { sector, playerStrength, opponentStrength, controlledBy };
  });
}

/** Compute which side has priority for the next resolution (V6 spec B5). */
export function computePriority(
  playerActive: readonly EffectivePlayer[],
  opponentActive: readonly EffectivePlayer[],
  previousPriority?: TeamSide,
): TeamSide {
  const control = sectorControl(playerActive, opponentActive);
  const playerSectors = control.filter((entry) => entry.controlledBy === 'player').length;
  const opponentSectors = control.filter((entry) => entry.controlledBy === 'opponent').length;
  if (playerSectors !== opponentSectors) return playerSectors > opponentSectors ? 'player' : 'opponent';

  const playerTotal = control.reduce((sum, entry) => sum + entry.playerStrength, 0);
  const opponentTotal = control.reduce((sum, entry) => sum + entry.opponentStrength, 0);
  if (playerTotal !== opponentTotal) return playerTotal > opponentTotal ? 'player' : 'opponent';

  // Dead tie → alternate from the previous period (default to player at kickoff).
  return previousPriority === 'player' ? 'opponent' : 'player';
}

/** The two sides in resolution order, priority side first. */
export function resolutionOrder(priority: TeamSide): [TeamSide, TeamSide] {
  return priority === 'player' ? ['player', 'opponent'] : ['opponent', 'player'];
}
