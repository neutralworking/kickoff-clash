import {
  BREAK_ENERGY,
  OUT_OF_POSITION_PENALTY,
  calculatedChanceCount,
  effectivePlayers,
  slotByKey,
  type BreakIndex,
  type BreakPlan,
  type EffectivePlayer,
  type LedgerEffect,
  type TeamSide,
  type V7MatchState,
  type V7TeamState,
} from '@/engine-v7';
import { buildBreakPlan, noopBreakPlan, type BreakDecision, type SubDecision } from './lineup';
import type { GameRegistry } from './match';
import { ok, type AdapterResult } from './result';

export interface OpponentDecisionSummary {
  decision: BreakDecision;
  plan: BreakPlan;
  rationale: string;
  ownChancesBefore: number;
  ownChancesAfter: number;
  enemyChancesBefore: number;
  enemyChancesAfter: number;
}

interface TeamTotals {
  attack: number;
  defence: number;
}

interface ProjectedDelta {
  attack: number;
  defence: number;
}

interface Candidate {
  sub: SubDecision;
  attackDelta: number;
  defenceDelta: number;
  penalty: number;
  natural: boolean;
  ownChancesBefore: number;
  ownChancesAfter: number;
  enemyChancesBefore: number;
  enemyChancesAfter: number;
  score: number;
}

function totals(players: readonly EffectivePlayer[]): TeamTotals {
  return players
    .filter((player) => player.zone === 'active')
    .reduce((sum, player) => ({
      attack: sum.attack + Math.max(0, player.attack),
      defence: sum.defence + Math.max(0, player.defence),
    }), { attack: 0, defence: 0 });
}

function byId(players: readonly EffectivePlayer[]): Map<string, EffectivePlayer> {
  return new Map(players.map((player) => [player.cardId, player]));
}

function projectedDeltaForDecision(
  team: V7TeamState,
  decision: BreakDecision,
  registry: GameRegistry,
  ledger: readonly LedgerEffect[],
): ProjectedDelta {
  const effective = effectivePlayers(team, registry, ledger);
  const players = byId(effective);
  let attack = 0;
  let defence = 0;

  for (const sub of decision.subs) {
    const outgoing = players.get(sub.outCardId);
    const incoming = players.get(sub.inCardId);
    if (!outgoing || !incoming || outgoing.zone !== 'active' || incoming.zone !== 'bench') continue;
    const penalty = incoming.naturalSector === outgoing.sector ? 0 : OUT_OF_POSITION_PENALTY;
    attack += Math.max(0, incoming.attack - penalty) - outgoing.attack;
    defence += Math.max(0, incoming.defence - penalty) - outgoing.defence;
  }

  return { attack, defence };
}

function candidateFor(
  state: V7MatchState,
  registry: GameRegistry,
  opponentPlayers: readonly EffectivePlayer[],
  playerTotals: TeamTotals,
  opponentTotals: TeamTotals,
  outgoing: EffectivePlayer,
  incoming: EffectivePlayer,
): Candidate | null {
  if (outgoing.zone !== 'active' || incoming.zone !== 'bench' || !outgoing.slotKey) return null;
  const formation = registry.formations.get(state.opponent.formationId);
  const slot = formation ? slotByKey(formation, outgoing.slotKey) : undefined;
  const targetSector = outgoing.sector ?? slot?.sector ?? incoming.naturalSector;
  const targetPosition = slot?.positionCode ?? outgoing.position;
  const natural = Boolean(targetPosition && registry.cards.get(incoming.cardId)?.positionCodes.includes(targetPosition));
  const penalty = incoming.naturalSector === targetSector ? 0 : OUT_OF_POSITION_PENALTY;
  const attackDelta = Math.max(0, incoming.attack - penalty) - outgoing.attack;
  const defenceDelta = Math.max(0, incoming.defence - penalty) - outgoing.defence;

  const ownChancesBefore = calculatedChanceCount(opponentTotals.attack, playerTotals.defence);
  const ownChancesAfter = calculatedChanceCount(opponentTotals.attack + attackDelta, playerTotals.defence);
  const enemyChancesBefore = calculatedChanceCount(playerTotals.attack, opponentTotals.defence);
  const enemyChancesAfter = calculatedChanceCount(playerTotals.attack, opponentTotals.defence + defenceDelta);
  const ownChanceDelta = ownChancesAfter - ownChancesBefore;
  const enemyChanceDelta = enemyChancesAfter - enemyChancesBefore;
  const scoreDelta = state.opponent.score - state.player.score;

  const chanceWeight = scoreDelta < 0
    ? ownChanceDelta * 34 - enemyChanceDelta * 20
    : scoreDelta > 0
      ? ownChanceDelta * 20 - enemyChanceDelta * 34
      : ownChanceDelta * 27 - enemyChanceDelta * 27;
  const statWeight = scoreDelta < 0
    ? attackDelta * 3 + defenceDelta * 1.5
    : scoreDelta > 0
      ? attackDelta * 1.5 + defenceDelta * 3
      : attackDelta * 2.2 + defenceDelta * 2.2;
  const fitWeight = natural ? 4 : penalty === 0 ? 1.5 : -6;

  return {
    sub: { outCardId: outgoing.cardId, inCardId: incoming.cardId },
    attackDelta,
    defenceDelta,
    penalty,
    natural,
    ownChancesBefore,
    ownChancesAfter,
    enemyChancesBefore,
    enemyChancesAfter,
    score: chanceWeight + statWeight + fitWeight,
  };
}

function rationaleFor(candidate: Candidate): string {
  const parts = [
    `${candidate.attackDelta >= 0 ? '+' : ''}${candidate.attackDelta} ATT`,
    `${candidate.defenceDelta >= 0 ? '+' : ''}${candidate.defenceDelta} DEF`,
    `chances ${candidate.ownChancesBefore}→${candidate.ownChancesAfter}`,
    `conceded chances ${candidate.enemyChancesBefore}→${candidate.enemyChancesAfter}`,
  ];
  if (candidate.penalty > 0) parts.push(`−${candidate.penalty}/−${candidate.penalty} out of position`);
  return parts.join(' · ');
}

/**
 * Build one deterministic, legal opponent substitution for the current break.
 * The opponent evaluates the player's submitted lineup projection, reacts to the
 * score, favours natural positions, and declines changes that do not improve its
 * projected position.
 */
export function buildOpponentPlan(
  state: V7MatchState,
  ledger: readonly LedgerEffect[],
  playerDecision: BreakDecision,
  breakIndex: BreakIndex,
  registry: GameRegistry,
): AdapterResult<OpponentDecisionSummary> {
  const playerEffective = effectivePlayers(state.player, registry, ledger);
  const opponentEffective = effectivePlayers(state.opponent, registry, ledger);
  const playerBase = totals(playerEffective);
  const opponentBase = totals(opponentEffective);
  const playerDelta = projectedDeltaForDecision(state.player, playerDecision, registry, ledger);
  const projectedPlayer = {
    attack: playerBase.attack + playerDelta.attack,
    defence: playerBase.defence + playerDelta.defence,
  };
  const budget = BREAK_ENERGY[breakIndex] ?? 0;
  const active = opponentEffective.filter((player) => player.zone === 'active');
  const bench = opponentEffective.filter((player) => player.zone === 'bench' && player.cost <= budget);
  const candidates: Candidate[] = [];

  for (const incoming of bench) {
    for (const outgoing of active) {
      const candidate = candidateFor(state, registry, opponentEffective, projectedPlayer, opponentBase, outgoing, incoming);
      if (candidate) candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => (
    b.score - a.score
    || Number(b.natural) - Number(a.natural)
    || b.ownChancesAfter - a.ownChancesAfter
    || a.enemyChancesAfter - b.enemyChancesAfter
    || b.attackDelta - a.attackDelta
    || b.defenceDelta - a.defenceDelta
    || a.sub.inCardId.localeCompare(b.sub.inCardId)
    || a.sub.outCardId.localeCompare(b.sub.outCardId)
  ));

  const best = candidates[0];
  if (!best || best.score <= 0) {
    const own = calculatedChanceCount(opponentBase.attack, projectedPlayer.defence);
    const enemy = calculatedChanceCount(projectedPlayer.attack, opponentBase.defence);
    return ok({
      decision: { subs: [], activations: [] },
      plan: noopBreakPlan('opponent', state.opponent, breakIndex),
      rationale: 'The current XI remains the best projected option.',
      ownChancesBefore: own,
      ownChancesAfter: own,
      enemyChancesBefore: enemy,
      enemyChancesAfter: enemy,
    });
  }

  const decision: BreakDecision = { subs: [best.sub], activations: [] };
  const plan = buildBreakPlan('opponent', state.opponent, decision, breakIndex, registry, state.seed, ledger);
  if (!plan.ok) return plan;

  return ok({
    decision,
    plan: plan.value,
    rationale: rationaleFor(best),
    ownChancesBefore: best.ownChancesBefore,
    ownChancesAfter: best.ownChancesAfter,
    enemyChancesBefore: best.enemyChancesBefore,
    enemyChancesAfter: best.enemyChancesAfter,
  });
}
