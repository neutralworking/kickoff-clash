'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  v7Fixture,
  type PresentationBeat,
  type UiPlayerView,
  type UiTeamView,
} from '@/game-v7';
import type { V7ActionDefinition, V7PlayerCard } from '@/engine-v7';
import { portraitSrc } from '../cards/portrait';

type Side = 'player' | 'opponent';

interface CardMeta {
  cost: number;
  role: string;
  actions: string[];
}

export interface V7ReplacementHint {
  label: string;
  tone: 'boost' | 'natural' | 'lane' | 'risk';
  detail: string;
}

const CARD_META = new Map<string, CardMeta>();

/** Register the cards used by the current match. The lab fixture is registered by
 * default; the live run registers its adapted collection before rendering. */
export function registerV7CardMeta(
  cards: readonly V7PlayerCard[],
  actions: readonly V7ActionDefinition[],
): void {
  const actionNames = new Map(actions.map((action) => [action.id, action.name]));
  for (const card of cards) {
    CARD_META.set(card.id, {
      cost: card.printedCost,
      role: card.role,
      actions: card.actionIds.map((id) => actionNames.get(id)).filter((name): name is string => Boolean(name)),
    });
  }
}

const fixture = v7Fixture();
registerV7CardMeta(fixture.cards, fixture.actions);

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
  rwb: { x: 90, y: 53 },
  ldm: { x: 36, y: 59 },
  dm: { x: 50, y: 58 },
  rdm: { x: 64, y: 59 },
  lm: { x: 18, y: 47 },
  lcm: { x: 34, y: 47 },
  cm: { x: 50, y: 47 },
  rcm: { x: 66, y: 47 },
  rm: { x: 82, y: 47 },
  lam: { x: 35, y: 34 },
  am: { x: 50, y: 34 },
  ram: { x: 65, y: 34 },
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
  targetTone,
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
  targetTone?: V7ReplacementHint['tone'];
  disabled?: boolean;
  badge?: ReactNode;
  onClick: () => void;
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
    targetable && targetTone ? `target-${targetTone}` : '',
  ].filter(Boolean).join(' ');

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={`Open ${player.name}`}>
      <div className="v7-card-portrait">
        <span className="v7-card-initials">{initials(player.name)}</span>
        {portrait && <img src={portrait} alt="" draggable={false} />}
        <span className="v7-card-cost" aria-label={`Cost ${meta.cost}`}><b>{meta.cost}</b></span>
        <span className="v7-card-position">{player.position ?? '—'}</span>
        {badge && <span className="v7-card-badge">{badge}</span>}
      </div>
      <div className="v7-card-copy">
        <div className="v7-card-name" title={player.name}>{player.shortName}</div>
        <div className="v7-card-role" title={meta.role}>{compact ? `${player.position ?? '—'} · ${meta.role}` : meta.role}</div>
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

function Dice({ beat }: { beat: PresentationBeat }) {
  const [settled, setSettled] = useState(false);
  const values = beat.rolls ?? [];
  const finalValue = values.at(-1) ?? beat.finalRoll;
  const scored = Boolean(beat.scored);

  useEffect(() => {
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), values.length > 1 ? 850 : 680);
    return () => window.clearTimeout(timer);
  }, [beat.id, values.length]);

  return (
    <div className={`v7-dice-stage${settled ? ' settled' : ' rolling'}${settled ? scored ? ' scored' : ' missed' : ''}`} aria-label={settled ? `Rolled ${values.join(', ')}` : 'Rolling the chance'}>
      <div className="v7-roll-context">
        <span>{beat.side === 'player' ? 'HOME' : 'AWAY'} CHANCE {beat.chanceIndex} OF {beat.chanceTotal}</span>
        <strong>{beat.sector?.toUpperCase()} ATTACK</strong>
      </div>
      {!settled ? (
        <span className="v7-die tumbling"><i>◆</i></span>
      ) : (
        <div className="v7-roll-result">
          {values.length > 1 && (
            <div className="v7-reroll-history" aria-label="Previous rolls">
              {values.slice(0, -1).map((value, index) => <span key={`${value}:${index}`}>{value}</span>)}
            </div>
          )}
          <span className="v7-die final">{finalValue ?? '?'}</span>
        </div>
      )}
      <div className="v7-roll-comparison">
        <div><span>ROLL</span><b>{settled ? finalValue ?? '?' : '–'}</b></div>
        <i>{settled ? scored ? '≥' : '<' : 'VS'}</i>
        <div><span>TARGET</span><b>{beat.threshold}+</b></div>
      </div>
      {settled && <strong className={`v7-roll-outcome ${scored ? 'goal' : 'miss'}`}>{scored ? 'GOAL' : 'NO GOAL'}</strong>}
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
  replacementHints = {},
  onPickActive,
  onInspect,
}: {
  beat: PresentationBeat | null;
  team: UiTeamView;
  side: Side;
  canSelect: boolean;
  selectedBenchId: string | null;
  plannedOutIds: readonly string[];
  replacementHints?: Readonly<Record<string, V7ReplacementHint>>;
  onPickActive: (cardId: string) => void;
  onInspect: (player: UiPlayerView) => void;
}) {
  const activeSector = beat?.sector ?? null;
  const focusCardId = beat?.cardId && team.active.some((player) => player.cardId === beat.cardId)
    ? beat.cardId
    : null;
  const isGoal = beat?.kind === 'goal';
  const isMiss = beat?.kind === 'miss' || beat?.kind === 'cancelled';
  const calculating = Boolean(beat && ['lock', 'pressure', 'threshold', 'chances', 'overview'].includes(beat.kind));
  const showOverlay = Boolean(beat && ['reveal', 'roll', 'goal', 'miss', 'cancelled', 'period_end', 'full_time'].includes(beat.kind));

  return (
    <section className={`v7-formation-shell side-${side}${isGoal ? ' goal' : ''}${isMiss ? ' miss' : ''}${calculating ? ' calculating' : ''}`}>
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
          <div className="v7-sub-instruction"><span>SUB SELECTED</span><strong>Compare the impact badges, then tap a player</strong></div>
        )}

        {team.active.map((player, index) => {
          const position = playerPosition(player, index, team.active.length);
          const style = { left: `${position.x}%`, top: `${position.y}%` } as CSSProperties;
          const plannedOut = plannedOutIds.includes(player.cardId);
          const targetable = canSelect && Boolean(selectedBenchId) && !plannedOut;
          const hint = targetable ? replacementHints[player.cardId] : undefined;
          const highlighted = focusCardId === player.cardId
            || (beat?.side === side && activeSector === player.sector && ['roll', 'goal', 'miss', 'cancelled'].includes(beat.kind));
          return (
            <div className="v7-pitch-card-position" style={style} key={player.cardId} title={hint?.detail}>
              <V7PlayerCard
                player={player}
                highlighted={highlighted}
                targetable={targetable}
                targetTone={hint?.tone}
                dimmed={plannedOut}
                badge={plannedOut ? 'OUT' : hint?.label}
                onClick={() => (targetable ? onPickActive(player.cardId) : onInspect(player))}
              />
            </div>
          );
        })}

        {beat && showOverlay && (
          <div className={`v7-pitch-event kind-${beat.kind}`} aria-live="polite">
            {beat.kind === 'roll' && <Dice beat={beat} />}
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
