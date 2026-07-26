'use client';

import type { Sector, TeamSide } from '@/engine-v7';
import type { UiPlayerView, UiTeamView } from '@/game-v7';

// The match-stage pitch. Mobile-first: a single vertical pitch with the player's
// team along the bottom and the opponent across the top, each split into the
// three sectors (left / centre / right). Player markers are positioned by
// sector; the active sector lane and the highlighted source / target players
// glow so the current beat reads at a glance. Purely presentational — it renders
// whatever the stage hands it, never engine state.

const SECTORS: Sector[] = ['left', 'centre', 'right'];
const SECTOR_LABEL: Record<Sector, string> = { left: 'L', centre: 'C', right: 'R' };

function Marker({
  player,
  highlighted,
  chanceCount,
}: {
  player: UiPlayerView;
  highlighted: boolean;
  chanceCount?: number;
}) {
  return (
    <div className={`v7-marker${highlighted ? ' hot' : ''}`} title={`${player.name} · ${player.attack}A/${player.defence}D`}>
      <span className="v7-marker-name">{player.shortName}</span>
      <span className="v7-marker-stat">{player.position ?? ''}</span>
      {player.emergencyGoalkeeper ? <span className="v7-marker-tag">GK!</span> : player.outOfPosition ? <span className="v7-marker-tag">OOP</span> : null}
      {chanceCount ? <span className="v7-marker-chance" aria-label={`${chanceCount} chance token`}>●{chanceCount > 1 ? chanceCount : ''}</span> : null}
    </div>
  );
}

function Lane({
  sector,
  players,
  active,
  highlightIds,
  chances,
  align,
}: {
  sector: Sector;
  players: UiPlayerView[];
  active: boolean;
  highlightIds: Set<string>;
  chances: number;
  align: 'top' | 'bottom';
}) {
  return (
    <div className={`v7-lane${active ? ' active' : ''} ${align}`} data-sector={sector}>
      <div className="v7-lane-tag" aria-hidden>{SECTOR_LABEL[sector]}</div>
      <div className="v7-lane-players">
        {players.map((player) => (
          <Marker key={player.cardId} player={player} highlighted={highlightIds.has(player.cardId)} />
        ))}
      </div>
      {chances > 0 && active ? (
        <div className="v7-lane-token" aria-label={`${chances} chance${chances === 1 ? '' : 's'} in the ${sector}`}>
          {Array.from({ length: Math.min(chances, 4) }).map((_, i) => (
            <span key={i} className="v7-token-dot" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function bySector(team: UiTeamView): Record<Sector, UiPlayerView[]> {
  const map: Record<Sector, UiPlayerView[]> = { left: [], centre: [], right: [] };
  for (const player of team.active) map[player.sector ?? 'centre'].push(player);
  return map;
}

export function Pitch({
  player,
  opponent,
  activeSide,
  activeSector,
  highlightIds,
  chanceSide,
  chancesBySector,
}: {
  player: UiTeamView;
  opponent: UiTeamView;
  activeSide?: TeamSide;
  activeSector?: Sector;
  highlightIds: Set<string>;
  chanceSide?: TeamSide;
  chancesBySector?: Record<Sector, number>;
}) {
  const playerLanes = bySector(player);
  const opponentLanes = bySector(opponent);
  const chanceFor = (side: TeamSide, sector: Sector) =>
    chanceSide === side && chancesBySector ? chancesBySector[sector] : 0;

  return (
    <div className="v7-pitch" role="group" aria-label="Match pitch">
      <div className="v7-half top" aria-label={`${opponent.managerName} (opponent)`}>
        {SECTORS.map((sector) => (
          <Lane
            key={sector}
            sector={sector}
            players={opponentLanes[sector]}
            active={activeSide === 'opponent' && activeSector === sector}
            highlightIds={activeSide === 'opponent' ? highlightIds : new Set()}
            chances={chanceFor('opponent', sector)}
            align="top"
          />
        ))}
      </div>
      <div className="v7-halfway" aria-hidden>
        <span className="v7-centre-circle" />
      </div>
      <div className="v7-half bottom" aria-label={`${player.managerName} (you)`}>
        {SECTORS.map((sector) => (
          <Lane
            key={sector}
            sector={sector}
            players={playerLanes[sector]}
            active={activeSide === 'player' && activeSector === sector}
            highlightIds={activeSide === 'player' ? highlightIds : new Set()}
            chances={chanceFor('player', sector)}
            align="bottom"
          />
        ))}
      </div>
    </div>
  );
}
