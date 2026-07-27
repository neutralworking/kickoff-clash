'use client';

import type { CSSProperties } from 'react';
import type { BroadcastBeat, UiPlayerView, UiTeamView } from '@/game-v7';

type Sector = 'left' | 'centre' | 'right';
type Side = 'player' | 'opponent';
type Measure = 'attack' | 'defence';

const SECTORS: Sector[] = ['left', 'centre', 'right'];
const LANE_Y: Record<Sector, number> = { left: 22, centre: 50, right: 78 };
const PROGRESS: Record<BroadcastBeat['kind'], number> = {
  kickoff: 50,
  action: 61,
  change: 56,
  chance: 73,
  roll: 84,
  goal: 94,
  miss: 93,
  period_end: 50,
  priority: 50,
  full_time: 50,
  info: 54,
};

function playersInSector(team: UiTeamView, sector: Sector): UiPlayerView[] {
  return team.active.filter((player) => (player.sector ?? 'centre') === sector);
}

function strongest(team: UiTeamView, sector: Sector | null, measure: Measure): UiPlayerView | null {
  const sectorPlayers = sector ? playersInSector(team, sector) : [];
  const pool = sectorPlayers.length > 0 ? sectorPlayers : team.active;
  return [...pool].sort((a, b) => b[measure] - a[measure])[0] ?? null;
}

function representative(team: UiTeamView, sector: Sector): UiPlayerView | null {
  const pool = playersInSector(team, sector);
  return [...pool].sort((a, b) => (b.attack + b.defence) - (a.attack + a.defence))[0] ?? null;
}

function stageLabel(beat: BroadcastBeat | null): string {
  if (!beat) return 'Waiting for kick-off';
  switch (beat.kind) {
    case 'kickoff': return 'Kick-off';
    case 'action': return 'Tactical action';
    case 'change': return 'Shape changing';
    case 'chance': return 'Attack developing';
    case 'roll': return 'Shot in progress';
    case 'goal': return 'Goal';
    case 'miss': return 'Chance gone';
    case 'period_end': return 'End of period';
    case 'priority': return 'Possession reset';
    case 'full_time': return 'Full time';
    default: return 'Match in motion';
  }
}

function Marker({
  player,
  side,
  sector,
  active,
  defending,
}: {
  player: UiPlayerView | null;
  side: Side;
  sector: Sector;
  active: boolean;
  defending: boolean;
}) {
  if (!player) return null;
  const style: CSSProperties = {
    left: side === 'player' ? '27%' : '73%',
    top: `${LANE_Y[sector]}%`,
  };
  return (
    <div
      className={`v7-pitch-player ${side}${active ? ' active' : ''}${defending ? ' defending' : ''}`}
      style={style}
      title={`${player.shortName} · ${player.position}`}
    >
      <span className="v7-pitch-player-dot" />
      <span className="v7-pitch-player-name">{player.shortName}</span>
    </div>
  );
}

export function V7Pitch({
  beat,
  player,
  opponent,
  activeSector,
}: {
  beat: BroadcastBeat | null;
  player: UiTeamView;
  opponent: UiTeamView;
  activeSector: Sector | null;
}) {
  const attackingSide = beat?.side ?? null;
  const progress = beat ? PROGRESS[beat.kind] : 50;
  const ballX = attackingSide === 'opponent' ? 100 - progress : attackingSide === 'player' ? progress : 50;
  const ballY = activeSector ? LANE_Y[activeSector] : 50;
  const attackerTeam = attackingSide === 'opponent' ? opponent : player;
  const defenderTeam = attackingSide === 'opponent' ? player : opponent;
  const attacker = attackingSide ? strongest(attackerTeam, activeSector, 'attack') : null;
  const defender = attackingSide ? strongest(defenderTeam, activeSector, 'defence') : null;
  const isShot = beat?.kind === 'roll' || beat?.kind === 'goal' || beat?.kind === 'miss';
  const isGoal = beat?.kind === 'goal';
  const isMiss = beat?.kind === 'miss';
  const ballStyle: CSSProperties = { left: `${ballX}%`, top: `${ballY}%` };

  return (
    <section className={`v7-pitch-shell${isGoal ? ' goal' : ''}${isMiss ? ' miss' : ''}`} aria-label="Live match pitch">
      <div className="v7-pitch-topline">
        <div>
          <span className="v7-live-dot" aria-hidden="true" />
          <span className="v7-tag">Live match</span>
        </div>
        <strong>{stageLabel(beat)}</strong>
      </div>

      <div className={`v7-pitch${attackingSide ? ` attacking-${attackingSide}` : ''}`}>
        <div className="v7-pitch-stripe s1" />
        <div className="v7-pitch-stripe s2" />
        <div className="v7-pitch-stripe s3" />
        <div className="v7-pitch-stripe s4" />
        <div className="v7-pitch-halfway" />
        <div className="v7-pitch-circle" />
        <div className="v7-pitch-box left" />
        <div className="v7-pitch-box right" />
        <div className="v7-pitch-goal left" />
        <div className="v7-pitch-goal right" />

        {SECTORS.map((sector) => (
          <div className={`v7-pitch-lane ${sector}${activeSector === sector ? ' active' : ''}`} key={sector} />
        ))}

        {SECTORS.map((sector) => {
          const playerRep = representative(player, sector);
          const opponentRep = representative(opponent, sector);
          return (
            <div key={sector}>
              <Marker
                player={playerRep}
                side="player"
                sector={sector}
                active={attacker?.cardId === playerRep?.cardId}
                defending={defender?.cardId === playerRep?.cardId}
              />
              <Marker
                player={opponentRep}
                side="opponent"
                sector={sector}
                active={attacker?.cardId === opponentRep?.cardId}
                defending={defender?.cardId === opponentRep?.cardId}
              />
            </div>
          );
        })}

        <div
          className={`v7-ball${isShot ? ' shot' : ''}${isGoal ? ' scored' : ''}${isMiss ? ' missed' : ''}`}
          style={ballStyle}
          key={beat?.id ?? 'idle'}
          aria-hidden="true"
        >
          <span />
        </div>

        {isGoal && <div className={`v7-net-ripple ${attackingSide === 'opponent' ? 'left' : 'right'}`} aria-hidden="true" />}

        <div className="v7-pitch-side player">
          <span>{player.managerName}</span>
          <b>ATTACKS →</b>
        </div>
        <div className="v7-pitch-side opponent">
          <b>← ATTACKS</b>
          <span>{opponent.managerName}</span>
        </div>
      </div>

      <div className="v7-pitch-focus">
        <div className={attackingSide === 'player' ? 'active' : ''}>
          <span>Your threat</span>
          <strong>{attackingSide === 'player' ? attacker?.shortName ?? 'Team move' : defender?.shortName ?? 'Defending'}</strong>
        </div>
        <div className="v7-pitch-focus-centre">{activeSector ? `${activeSector} lane` : 'central reset'}</div>
        <div className={attackingSide === 'opponent' ? 'active opponent' : ''}>
          <span>Opponent threat</span>
          <strong>{attackingSide === 'opponent' ? attacker?.shortName ?? 'Team move' : defender?.shortName ?? 'Defending'}</strong>
        </div>
      </div>
    </section>
  );
}
