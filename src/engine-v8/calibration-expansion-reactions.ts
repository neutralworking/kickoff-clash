import { getV8CalibrationPlayer } from './calibration-cards';
import * as runtime from './calibration-runtime';

const CENTRAL_ATTACKER_CODES = new Set(['CF', 'SS', 'AM']);
const WIDE_ATTACKER_CODES = new Set(['WF', 'LW', 'RW', 'LM', 'RM']);

function positionCodes(position: string): Set<string> {
  return new Set(position.split(/[^A-Z]+/).filter(Boolean));
}

function qualifies(cardId: string, kind: 'central' | 'wide'): boolean {
  const codes = positionCodes(getV8CalibrationPlayer(cardId).position.toUpperCase());
  const required = kind === 'central' ? CENTRAL_ATTACKER_CODES : WIDE_ATTACKER_CODES;
  return [...required].some((code) => codes.has(code));
}

function reactionCounter(cardId: 'bobby-moore' | 'andy-robertson', runtimeId: string): string {
  return `${cardId === 'bobby-moore' ? 'moore-read-the-run' : 'robertson-recovery-run'}:${runtimeId}`;
}

interface AttackGain {
  player: runtime.V8CalibrationRuntimePlayer;
  amount: number;
}

function positiveAttackBySource(player: runtime.V8CalibrationRuntimePlayer | undefined): Map<string, number> {
  const totals = new Map<string, number>();
  if (!player) return totals;
  for (const modifier of player.modifiers) {
    if (modifier.attack <= 0) continue;
    const key = modifier.source ?? modifier.id;
    totals.set(key, (totals.get(key) ?? 0) + modifier.attack);
  }
  return totals;
}

/**
 * Reads increases in positive ATT contribution by modifier source, not raw net ATT changes or IDs.
 * This prevents removed debuffs from masquerading as gains and prevents a same-value live modifier
 * replacement from retriggering a reaction merely because it received a new modifier id.
 */
function newAttackGains(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
): AttackGain[] {
  const gains: AttackGain[] = [];
  for (const player of Object.values(after.players)) {
    const previous = positiveAttackBySource(before.players[player.runtimeId]);
    const current = positiveAttackBySource(player);
    let amount = 0;
    for (const [source, value] of current) amount += Math.max(0, value - (previous.get(source) ?? 0));
    if (amount > 0) gains.push({ player, amount });
  }
  return gains.sort((a, b) =>
    a.player.deployedOrder - b.player.deployedOrder
    || a.player.runtimeId.localeCompare(b.player.runtimeId)
  );
}

function firstQualifyingGain(
  state: runtime.V8CalibrationState,
  defender: runtime.V8CalibrationRuntimePlayer,
  gains: readonly AttackGain[],
  kind: 'central' | 'wide',
): AttackGain | undefined {
  const confrontation = runtime.opposingDepthZone(defender.zone);
  return gains.find(({ player }) =>
    player.side !== defender.side
    && player.zone === confrontation
    && qualifies(player.cardId, kind)
  );
}

/**
 * Shared reactive-defender primitive used by READ THE RUN and RECOVERY RUN.
 * Each defender can trigger once per period and mirrors the first qualifying positive ATT increase
 * applied to an opposing attacker in its current depth confrontation.
 */
export function applyCalibrationAttackGainReactions(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
): runtime.V8CalibrationState {
  const gains = newAttackGains(before, after);
  if (gains.length === 0) return after;

  let next = after;
  const defenders = Object.values(next.players)
    .filter((player) => player.cardId === 'bobby-moore' || player.cardId === 'andy-robertson')
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const defender of defenders) {
    if (!runtime.isCalibrationActionEnabled(next, defender.runtimeId)) continue;
    const cardId = defender.cardId as 'bobby-moore' | 'andy-robertson';
    const key = reactionCounter(cardId, defender.runtimeId);
    if ((next.periodCounters[key] ?? 0) > 0) continue;

    const kind = cardId === 'bobby-moore' ? 'central' : 'wide';
    const gain = firstQualifyingGain(next, defender, gains, kind);
    if (!gain) continue;

    next = runtime.applyCalibrationModifier(next, defender.runtimeId, {
      defence: gain.amount,
      lifetime: 'period',
      source: getV8CalibrationPlayer(cardId).actionName,
    });
    next.periodCounters[key] = 1;
    next.events.push({
      type: 'action_triggered',
      period: next.period,
      text: `${getV8CalibrationPlayer(cardId).realName} · ${getV8CalibrationPlayer(cardId).actionName}: +${gain.amount} DEF after ${getV8CalibrationPlayer(gain.player.cardId).realName} gains ATT.`,
    });
  }

  return next;
}
