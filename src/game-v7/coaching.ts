import { calculatedChanceCount, type PeriodNumber, type TeamSide } from '@/engine-v7';
import type { SubDecision } from './adapter/lineup';
import type { UiMatchView, UiPlayerView, UiTeamView } from './adapter/match';
import type { PresentationBeat } from './presentation';

interface TeamTotals {
  attack: number;
  defence: number;
}

interface SidePreview {
  attackDelta: number;
  defenceDelta: number;
  ownChancesBefore: number;
  ownChancesAfter: number;
  enemyChancesBefore: number;
  enemyChancesAfter: number;
  penalty: number;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function totals(team: UiTeamView): TeamTotals {
  return team.active.reduce((sum, player) => ({
    attack: sum.attack + Math.max(0, player.attack),
    defence: sum.defence + Math.max(0, player.defence),
  }), { attack: 0, defence: 0 });
}

function teamFor(view: UiMatchView, side: TeamSide): UiTeamView {
  return side === 'player' ? view.player : view.opponent;
}

function enemyFor(view: UiMatchView, side: TeamSide): UiTeamView {
  return side === 'player' ? view.opponent : view.player;
}

function findPlayer(view: UiMatchView, side: TeamSide, cardId: string): UiPlayerView | undefined {
  const team = teamFor(view, side);
  return [...team.active, ...team.bench].find((player) => player.cardId === cardId);
}

function previewPair(
  view: UiMatchView,
  side: TeamSide,
  incoming: UiPlayerView,
  outgoing: UiPlayerView,
  priorAttackDelta: number,
  priorDefenceDelta: number,
): SidePreview {
  const own = totals(teamFor(view, side));
  const enemy = totals(enemyFor(view, side));
  const penalty = incoming.sector === outgoing.sector ? 0 : 2;
  const attackDelta = Math.max(0, incoming.attack - penalty) - outgoing.attack;
  const defenceDelta = Math.max(0, incoming.defence - penalty) - outgoing.defence;
  const ownAttackBefore = own.attack + priorAttackDelta;
  const ownDefenceBefore = own.defence + priorDefenceDelta;
  const ownChancesBefore = calculatedChanceCount(ownAttackBefore, enemy.defence);
  const ownChancesAfter = calculatedChanceCount(ownAttackBefore + attackDelta, enemy.defence);
  const enemyChancesBefore = calculatedChanceCount(enemy.attack, ownDefenceBefore);
  const enemyChancesAfter = calculatedChanceCount(enemy.attack, ownDefenceBefore + defenceDelta);

  return {
    attackDelta,
    defenceDelta,
    ownChancesBefore,
    ownChancesAfter,
    enemyChancesBefore,
    enemyChancesAfter,
    penalty,
  };
}

function sideRevealBeats(
  period: PeriodNumber,
  view: UiMatchView,
  side: TeamSide,
  substitutions: readonly SubDecision[],
): PresentationBeat[] {
  let attackDelta = 0;
  let defenceDelta = 0;
  const team = teamFor(view, side);

  return substitutions.flatMap((sub, index) => {
    const outgoing = findPlayer(view, side, sub.outCardId);
    const incoming = findPlayer(view, side, sub.inCardId);
    if (!outgoing || !incoming) return [];
    const preview = previewPair(view, side, incoming, outgoing, attackDelta, defenceDelta);
    attackDelta += preview.attackDelta;
    defenceDelta += preview.defenceDelta;
    const ownLabel = side === 'player' ? 'your chances' : 'their chances';
    const enemyLabel = side === 'player' ? 'their chances' : 'your chances';

    return [{
      id: `presentation:${period}:coach:${side}:${index}:${sub.outCardId}:${sub.inCardId}`,
      kind: 'reveal' as const,
      period,
      side,
      sector: outgoing.sector,
      cardId: incoming.cardId,
      title: `${team.managerName}: ${incoming.shortName} on`,
      detail: `${outgoing.shortName} off · ${signed(preview.attackDelta)} ATT · ${signed(preview.defenceDelta)} DEF · ${ownLabel} ${preview.ownChancesBefore}→${preview.ownChancesAfter} · ${enemyLabel} ${preview.enemyChancesBefore}→${preview.enemyChancesAfter}${preview.penalty ? ' · −2/−2 out of position' : ''}`,
      durationMs: 1450,
      substitution: {
        outCardId: outgoing.cardId,
        inCardId: incoming.cardId,
        attackDelta: preview.attackDelta,
        defenceDelta: preview.defenceDelta,
        chanceDelta: preview.ownChancesAfter - preview.ownChancesBefore,
      },
    }];
  });
}

/** Reveal both submitted coaching decisions before the next period calculation. */
export function buildCoachingRevealBeats(
  period: PeriodNumber,
  view: UiMatchView,
  playerSubs: readonly SubDecision[],
  opponentSubs: readonly SubDecision[],
): PresentationBeat[] {
  return [
    ...sideRevealBeats(period, view, 'player', playerSubs),
    ...sideRevealBeats(period, view, 'opponent', opponentSubs),
  ];
}
