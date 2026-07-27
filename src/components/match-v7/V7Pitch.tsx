'use client';

import type { CSSProperties, ReactNode } from 'react';
import { v7Fixture, type BroadcastBeat, type UiPlayerView, type UiTeamView } from '@/game-v7';
import { portraitSrc } from '../cards/portrait';

type Sector = 'left' | 'centre' | 'right';
type Side = 'player' | 'opponent';

interface CardMeta {
  cost: number;
  role: string;
}

const CARD_META = new Map<string, CardMeta>(
  v7Fixture().cards.map((card) => [card.id, { cost: card.printedCost, role: card.role }]),
);

export function cardMetaFor(cardId: string): CardMeta {
  return CARD_META.get(cardId) ?? { cost: 0, role: 'Player' };
}

const SLOT_POSITION: Record<string, { x: number; y: number }> = {
  gk: { x: 50, y: 90 },
  lb: { x: 10, y: 72 },
  lcb: { x: 32, y: 72 },
  ccb: { x: 50, y: 72 },
  rcb: { x: 68, y: 72 },
  rb: { x: 90, y: 72 },
  lwb: { x: 11, y: 54 },
  dm: { x: 50, y: 57 },
  lm: { x: 18, y: 47 },
  cm: { x: 50, y: 47 },
  rm: { x: 82, y: 47 },
  lw: { x: 15, y: 19 },
  lf: { x: 32, y: 21 },
  cf: { x: 50, y: 17 },
  rf: { x: 68, y: 21 },
  rw: { x: 85, y: 19 },
};

const FALLBACK_ROWS: Record<string, number> = {
  GK: 90,
  LB: 72,
  RB: 72,
  CB: 72,
  LWB: 54,
  RWB: 54,
  DM: 57,
  LM: 47,
  CM: 47,
  RM: 47,
  LW: 19,
  LF: 21,
  AM: 34,
  CF: 17,
  RF: 21,
  RW: 19,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fallbackPosition(player: UiPlayerView, index: number, total: number): { x: number; y: number } {
  const y = FALLBACK_ROWS[player.position ?? 'CM'] ?? 47;
  const row = Math.max(1, total);
  const x = row === 1 ? 50 : 10 + ((index % row) / Math.max(1, row - 1)) * 80;
  return { x, y };
}

function playerPosition(player: UiPlayerView, index: number, total: number): { x: number; y: number } {
  if (player.slotKey && SLOT_POSITION[player.slotKey]) return SLOT_POSITION[player.slotKey];
  return fallbackPosition(player, index, total);
}

function rollValue(beat: BroadcastBeat | null): string | null {
  if (!beat || beat.kind !== 'roll') return null;
  const text = `${beat.title} ${beat.detail ?? ''}`;
  const matches = [...text.matchAll(/\b([1-6])\b/g)];
  return matches.at(-1)?.[1] ?? '?';
}

export function V7PlayerCard({
  player,
  compact = false,
  selected = false,
  dimmed = false,
  highlighted = false,
  targetable = false,
  disabled = false,
  badge,
  onClick,
}: {
  player: UiPlayerView;
  compact?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  targetable?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onClick?: () => void;
}) {
  const portrait = portraitSrc({ id: player.cardId, name: player.name, position: player.position });
  const meta = cardMetaFor(player.cardId);
  const className = [
    'v7-player-card',
    compact ? 'compact' : '',
    selected ? 'selected' : '',
    dimmed ? 'dimmed' : '',
    highlighted ? 'highlighted' : '',
    targetable ? 'targetable' : '',
    onClick ? 'interactive' : '',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      <div className="v7-card-portrait">
        <span className="v7-card-initials">{initials(player.name)}</span>
        {portrait && <img src={portrait} alt="" draggable={false} />}
        <span className="v7-card-cost" aria-label={`Cost ${meta.cost}`}><b>{meta.cost}</b><i>⚡</i></span>
        <span className="v7-card-position">{player.position ?? '—'}</span>
        {badge && <span className="v7-card-badge">{badge}</span>}
      </div>
      <div className="v7-card-copy">
        <div className="v7-card-name" title={player.name}>{player.shortName}</div>
        <div className="v7-card-role" title={meta.role}>{meta.role}</div>
        <div className="v7-card-stats" aria-label={`${player.attack} attack, ${player.defence} defence`}>
          <strong className="attack">{player.attack}</strong>
          <i />
          <strong className="defence">{player.defence}</strong>
        </div>
      </div>
      {(player.outOfPosition || player.emergencyGoalkeeper) && (
        <div className="v7-card-warning">{player.emergencyGoalkeeper ? 'EMERGENCY GK' : 'OUT OF POSITION'}</div>
      )}
    </>
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>{body}</button>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function V7Pitch({
  beat,
  team,
  side,
  activeSector,
  focusPlayer,
  canSelect,
  selectedBenchId,
  plannedOutIds,
  onPickActive,
}: {
  beat: BroadcastBeat | null;
  team: UiTeamView;
  side: Side;
  activeSector: Sector | null;
  focusPlayer: UiPlayerView | null;
  canSelect: boolean;
  selectedBenchId: string | null;
  plannedOutIds: readonly string[];
  onPickActive: (cardId: string) => void;
}) {
  const goal = beat?.kind === 'goal';
  const miss = beat?.kind === 'miss';
  const roll = beat?.kind === 'roll';
  const currentRoll = rollValue(beat);
  const attackingThisTeam = beat?.side === side;
  const visibleFocus = focusPlayer?.cardId && team.active.some((player) => player.cardId === focusPlayer.cardId)
    ? focusPlayer.cardId
    : null;

  return (
    <section className={`v7-formation-shell side-${side}${goal ? ' goal' : ''}${miss ? ' miss' : ''}`}>
      <div className="v7-formation-heading">
        <div>
          <span className="v7-tag">{side === 'player' ? 'Home XI' : 'Away XI'}</span>
          <strong>{team.managerName}</strong>
        </div>
        <span>{team.formationName}</span>
      </div>

      <div className={`v7-formation-pitch${activeSector ? ` lane-${activeSector}` : ''}`}>
        <div className="v7-pitch-stripe stripe-1" />
        <div className="v7-pitch-stripe stripe-2" />
        <div className="v7-pitch-stripe stripe-3" />
        <div className="v7-pitch-stripe stripe-4" />
        <div className="v7-pitch-halfway" />
        <div className="v7-pitch-circle" />
        <div className="v7-pitch-box top" />
        <div className="v7-pitch-box bottom" />
        <div className="v7-pitch-goal top" />
        <div className="v7-pitch-goal bottom" />
        <div className="v7-lane-glow" />

        {selectedBenchId && canSelect && (
          <div className="v7-sub-instruction"><span>SUB SELECTED</span><strong>Choose the player to replace</strong></div>
        )}

        {team.active.map((player, index) => {
          const position = playerPosition(player, index, team.active.length);
          const style = { left: `${position.x}%`, top: `${position.y}%` } as CSSProperties;
          const plannedOut = plannedOutIds.includes(player.cardId);
          const targetable = canSelect && !!selectedBenchId && !plannedOut;
          return (
            <div className="v7-pitch-card-position" style={style} key={player.cardId}>
              <V7PlayerCard
                player={player}
                highlighted={visibleFocus === player.cardId || (attackingThisTeam && activeSector === player.sector)}
                targetable={targetable}
                dimmed={plannedOut}
                badge={plannedOut ? 'OUT' : undefined}
                onClick={targetable ? () => onPickActive(player.cardId) : undefined}
              />
            </div>
          );
        })}

        {beat && (
          <div className={`v7-pitch-event kind-${beat.kind}`} aria-live="polite">
            {roll && <div className="v7-roll-value">{currentRoll}</div>}
            {goal && <div className="v7-goal-word">GOAL!</div>}
            {!goal && !roll && <div className="v7-event-kicker">{beat.eyebrow}</div>}
            {(goal || roll || miss) && focusPlayer && (
              <div className="v7-event-card"><V7PlayerCard player={focusPlayer} highlighted /></div>
            )}
            <strong>{goal ? beat.detail ?? beat.title : beat.title}</strong>
            {!goal && beat.detail && <span>{beat.detail}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
