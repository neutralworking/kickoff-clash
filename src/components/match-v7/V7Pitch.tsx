'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  v7Fixture,
  type PresentationBeat,
  type UiPlayerView,
  type UiTeamView,
} from '@/game-v7';
import { portraitSrc } from '../cards/portrait';
import './v7roll.css';

type Side = 'player' | 'opponent';

interface CardMeta {
  cost: number;
  role: string;
  actions: string[];
}

const fixture = v7Fixture();
const ACTION_NAMES = new Map(fixture.actions.map((action) => [action.id, action.name]));
const CARD_META = new Map<string, CardMeta>(
  fixture.cards.map((card) => [card.id, {
    cost: card.printedCost,
    role: card.role,
    actions: card.actionIds.map((id) => ACTION_NAMES.get(id)).filter((name): name is string => Boolean(name)),
  }]),
);

export function cardMetaFor(cardId: string): CardMeta {
  return CARD_META.get(cardId) ?? { cost: 0, role: 'Player', actions: [] };
}

const SLOT_POSITION: Record<string, { x: number; y: number }> = {
  gk: { x: 50, y: 90 },
  lb: { x: 9, y: 73 },
  lcb: { x: 31, y: 73 },
  ccb: { x: 50, y: 73 },
  rcb: { x: 69, y: 73 },
  rb: { x: 91, y: 73 },
  lwb: { x: 10, y: 53 },
  dm: { x: 50, y: 58 },
  lm: { x: 18, y: 47 },
  cm: { x: 50, y: 47 },
  rm: { x: 82, y: 47 },
  lw: { x: 14, y: 18 },
  lf: { x: 31, y: 20 },
  cf: { x: 50, y: 16 },
  rf: { x: 69, y: 20 },
  rw: { x: 86, y: 18 },
};

const FALLBACK_ROWS: Record<string, number> = {
  GK: 90,
  LB: 73,
  RB: 73,
  CB: 73,
  LWB: 54,
  RWB: 54,
  DM: 58,
  LM: 47,
  CM: 47,
  RM: 47,
  LW: 18,
  LF: 20,
  AM: 34,
  CF: 16,
  RF: 20,
  RW: 18,
};

const DIE_FACE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

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
  const x = total <= 1 ? 50 : 9 + ((index % total) / Math.max(1, total - 1)) * 82;
  return { x, y };
}

function playerPosition(player: UiPlayerView, index: number, total: number): { x: number; y: number } {
  if (player.slotKey && SLOT_POSITION[player.slotKey]) return SLOT_POSITION[player.slotKey];
  return fallbackPosition(player, index, total);
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
  onClick: () => void;
}) {
  const portrait = portraitSrc({ id: player.cardId, name: player.name, position: player.position });
  const meta = cardMetaFor(player.cardId);
  const position = player.position ?? '—';
  const className = [
    'v7-player-card',
    compact ? 'compact' : '',
    selected ? 'selected' : '',
    dimmed ? 'dimmed' : '',
    highlighted ? 'highlighted' : '',
    targetable ? 'targetable' : '',
  ].filter(Boolean).join(' ');

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={`Open ${player.name}, ${position}, ${meta.role}`}>
      <div className="v7-card-portrait">
        <span className="v7-card-initials">{initials(player.name)}</span>
        {portrait && <img src={portrait} alt="" draggable={false} />}
        <span className="v7-card-cost" aria-label={`Cost ${meta.cost}`}><b>{meta.cost}</b></span>
        <span className="v7-card-position">{position}</span>
        {badge && <span className="v7-card-badge">{badge}</span>}
      </div>
      <div className="v7-card-copy">
        <div className="v7-card-name" title={player.name}>{player.shortName}</div>
        <div className="v7-card-role" title={`${position} · ${meta.role}`}><b>{position}</b><span>·</span><em>{meta.role}</em></div>
        <div className="v7-card-stats" aria-label={`${player.attack} attack, ${player.defence} defence`}>
          <strong className="attack">{player.attack}</strong>
          <i />
          <strong className="defence">{player.defence}</strong>
        </div>
        {meta.actions[0] && <div className="v7-card-action">{meta.actions[0]}</div>}
      </div>
      {(player.outOfPosition || player.emergencyGoalkeeper) && (
        <div className="v7-card-warning">{player.emergencyGoalkeeper ? 'EMERGENCY GK' : 'OUT OF POSITION'}</div>
      )}
    </button>
  );
}

function ChanceRoll({ beat }: { beat: PresentationBeat }) {
  const [settled, setSettled] = useState(false);
  const values = beat.rolls?.length ? beat.rolls : beat.finalRoll ? [beat.finalRoll] : [];
  const finalRoll = beat.finalRoll ?? values.at(-1) ?? 0;
  const priorRolls = values.slice(0, -1);
  const scored = Boolean(beat.scored);
  const sideLabel = beat.side === 'player' ? 'YOUR CHANCE' : 'THEIR CHANCE';
  const sectorLabel = `${beat.sector?.toUpperCase() ?? 'CENTRE'} ATTACK`;

  useEffect(() => {
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), priorRolls.length > 0 ? 920 : 760);
    return () => window.clearTimeout(timer);
  }, [beat.id, priorRolls.length]);

  return (
    <div className={`v7-chance-stage${settled ? ` settled ${scored ? 'scored' : 'stopped'}` : ' rolling'}`} aria-label={settled ? `Rolled ${finalRoll}, ${scored ? 'goal' : 'no goal'}` : 'Rolling the chance'}>
      <div className="v7-chance-heading">
        <span>{sideLabel}</span>
        <strong>{beat.chanceIndex} <i>OF</i> {beat.chanceTotal}</strong>
        <b>{sectorLabel}</b>
      </div>

      <div className="v7-chance-resolution">
        <div className="v7-chance-die" key={`${beat.id}:${settled ? 'settled' : 'rolling'}`}>
          {settled ? (DIE_FACE[Math.max(1, finalRoll) - 1] ?? finalRoll) : <i>◆</i>}
        </div>
        <div className="v7-chance-comparison">
          <span>ROLL</span>
          <strong>{settled ? finalRoll : '–'}</strong>
          <i>{settled ? (finalRoll >= (beat.threshold ?? 6) ? '≥' : '<') : 'VS'}</i>
          <strong>{beat.threshold ?? 6}</strong>
          <span>TARGET</span>
        </div>
      </div>

      {priorRolls.length > 0 && (
        <div className="v7-reroll-history"><span>REROLL</span>{priorRolls.map((roll, index) => <b key={`${roll}:${index}`}>{DIE_FACE[roll - 1] ?? roll}</b>)}</div>
      )}

      <div className="v7-chance-outcome">
        {!settled ? 'ROLLING…' : scored ? 'GOAL' : 'NO GOAL'}
      </div>
    </div>
  );
}

export function V7Pitch({
  beat,
  team,
  side,
  canSelect,
  selectedBenchId,
  plannedOutIds,
  onPickActive,
  onInspect,
}: {
  beat: PresentationBeat | null;
  team: UiTeamView;
  side: Side;
  canSelect: boolean;
  selectedBenchId: string | null;
  plannedOutIds: readonly string[];
  onPickActive: (cardId: string) => void;
  onInspect: (player: UiPlayerView) => void;
}) {
  const activeSector = beat?.sector ?? null;
  const focusCardId = beat?.cardId && team.active.some((player) => player.cardId === beat.cardId)
    ? beat.cardId
    : null;
  const isGoal = beat?.kind === 'goal';
  const isMiss = beat?.kind === 'miss' || beat?.kind === 'cancelled';
  const isRolling = beat?.kind === 'roll';
  const calculating = Boolean(beat && ['lock', 'pressure', 'threshold', 'chances', 'overview'].includes(beat.kind));
  const showOverlay = Boolean(beat && ['reveal', 'roll', 'goal', 'miss', 'cancelled', 'period_end', 'full_time'].includes(beat.kind));

  return (
    <section className={`v7-formation-shell side-${side}${isGoal ? ' goal' : ''}${isMiss ? ' miss' : ''}${isRolling ? ' rolling' : ''}${calculating ? ' calculating' : ''}`}>
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
        {calculating && <div className="v7-calculation-scan" />}

        {selectedBenchId && canSelect && (
          <div className="v7-sub-instruction"><span>SUB SELECTED</span><strong>Tap the player to replace</strong></div>
        )}

        {team.active.map((player, index) => {
          const position = playerPosition(player, index, team.active.length);
          const style = { left: `${position.x}%`, top: `${position.y}%` } as CSSProperties;
          const plannedOut = plannedOutIds.includes(player.cardId);
          const targetable = canSelect && Boolean(selectedBenchId) && !plannedOut;
          const highlighted = focusCardId === player.cardId
            || (beat?.side === side && activeSector === player.sector && ['roll', 'goal', 'miss', 'cancelled'].includes(beat.kind));
          return (
            <div className={`v7-pitch-card-position${highlighted ? ' focused' : ''}`} style={style} key={player.cardId}>
              <V7PlayerCard
                player={player}
                highlighted={highlighted}
                targetable={targetable}
                dimmed={plannedOut}
                badge={plannedOut ? 'OUT' : undefined}
                onClick={() => (targetable ? onPickActive(player.cardId) : onInspect(player))}
              />
            </div>
          );
        })}

        {beat && showOverlay && (
          <div className={`v7-pitch-event kind-${beat.kind}`} aria-live="polite">
            {beat.kind === 'roll' && <ChanceRoll beat={beat} />}
            {beat.kind === 'goal' && <div className="v7-goal-word">GOAL!</div>}
            {beat.kind === 'cancelled' && <div className="v7-cancelled-word">BLOCKED</div>}
            {beat.kind !== 'roll' && <strong>{beat.title}</strong>}
            {beat.kind !== 'roll' && beat.detail && <span>{beat.detail}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
