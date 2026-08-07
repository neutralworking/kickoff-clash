import { getV8CalibrationPlayer, type V8CalibrationPlayerCard } from './calibration-cards';
import * as base from './calibration-runtime';

export type V8ExtendedModifierLifetime = base.V8ModifierLifetime | 'duration' | 'decay';

export interface V8ExtendedModifierInput {
  attack?: number;
  defence?: number;
  lifetime: V8ExtendedModifierLifetime;
  source: string;
  sourceRuntimeId?: string;
  durationPeriods?: number;
  decayAttackPerPeriod?: number;
  decayDefencePerPeriod?: number;
}

type ExtendedModifier = base.V8CalibrationStatModifier & {
  mode?: 'duration' | 'decay';
  remainingPeriods?: number;
  decayAttackPerPeriod?: number;
  decayDefencePerPeriod?: number;
};

function asExtended(modifier: base.V8CalibrationStatModifier): ExtendedModifier {
  return modifier as ExtendedModifier;
}

function tickTowardZero(value: number, amount: number): number {
  if (amount <= 0 || value === 0) return value;
  if (value > 0) return Math.max(0, value - amount);
  return Math.min(0, value + amount);
}

function modifierStatText(attack: number, defence: number): string {
  const parts: string[] = [];
  if (attack) parts.push(`${attack > 0 ? '+' : ''}${attack} ATT`);
  if (defence) parts.push(`${defence > 0 ? '+' : ''}${defence} DEF`);
  return parts.join(', ') || '0';
}

function annotateLatestModifier(
  state: base.V8CalibrationState,
  targetRuntimeId: string,
  previousCount: number,
  input: V8ExtendedModifierInput,
): void {
  const player = state.players[targetRuntimeId];
  if (!player || player.modifiers.length <= previousCount) return;
  const modifier = asExtended(player.modifiers[player.modifiers.length - 1]!);

  if (input.lifetime === 'duration') {
    if (!input.durationPeriods || input.durationPeriods < 1) throw new Error('Duration modifiers require durationPeriods >= 1');
    modifier.mode = 'duration';
    modifier.remainingPeriods = input.durationPeriods;
  }

  if (input.lifetime === 'decay') {
    const attackDecay = input.decayAttackPerPeriod ?? 0;
    const defenceDecay = input.decayDefencePerPeriod ?? 0;
    if (attackDecay <= 0 && defenceDecay <= 0) throw new Error('Decay modifiers require a positive per-period decay');
    modifier.mode = 'decay';
    modifier.decayAttackPerPeriod = Math.max(0, attackDecay);
    modifier.decayDefencePerPeriod = Math.max(0, defenceDecay);
  }
}

export function applyCalibrationModifier(
  state: base.V8CalibrationState,
  targetRuntimeId: string,
  modifier: V8ExtendedModifierInput,
): base.V8CalibrationState {
  const previousCount = state.players[targetRuntimeId]?.modifiers.length ?? 0;
  const storedLifetime: base.V8ModifierLifetime = modifier.lifetime === 'period' ? 'period' : 'match';
  const next = base.applyCalibrationModifier(state, targetRuntimeId, {
    attack: modifier.attack,
    defence: modifier.defence,
    lifetime: storedLifetime,
    source: modifier.source,
    sourceRuntimeId: modifier.sourceRuntimeId,
  });
  annotateLatestModifier(next, targetRuntimeId, previousCount, modifier);
  return next;
}

/**
 * Calibration-only text override. The tracker still holds the original ARRIVE UNMARKED wording;
 * this is the first explicit V8 action-decay experiment and is intentionally not written back yet.
 */
export function calibrationActionText(card: V8CalibrationPlayerCard): string {
  if (card.actionKey === 'sinclair_arrive_unmarked') {
    return 'On Reveal: If this is your first player here, she gains +4 ATT. This bonus loses 1 ATT at the end of each period.';
  }
  return card.actionText;
}

export function calibrationHandPlayersWithDecayText(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
): V8CalibrationPlayerCard[] {
  return base.calibrationHandPlayers(state, side).map((card) => (
    card.actionKey === 'sinclair_arrive_unmarked'
      ? { ...card, actionText: calibrationActionText(card) }
      : card
  ));
}

export function revealCalibrationPlayer(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  cardId: string,
  zone: import('./core').V8Zone,
): base.V8CalibrationState {
  const next = base.revealCalibrationPlayer(state, side, cardId, zone);
  if (cardId !== 'sinclair') return next;

  const runtimeId = base.calibrationRuntimeId(side, cardId);
  const player = next.players[runtimeId];
  const modifier = player?.modifiers
    .map(asExtended)
    .find((candidate) => candidate.source === 'ARRIVE UNMARKED' && candidate.attack === 4);
  if (!modifier) return next;

  modifier.mode = 'decay';
  modifier.decayAttackPerPeriod = 1;
  modifier.decayDefencePerPeriod = 0;

  for (let index = next.events.length - 1; index >= 0; index -= 1) {
    const event = next.events[index];
    if (event?.type !== 'modifier_changed' || !event.text.startsWith('Christine Sinclair:')) continue;
    event.text = 'Christine Sinclair: +4 ATT · decays by 1 ATT at each period end.';
    break;
  }
  return next;
}

function tickExtendedModifiers(state: base.V8CalibrationState, endedPeriod: number): void {
  for (const player of Object.values(state.players)) {
    const kept: base.V8CalibrationStatModifier[] = [];
    for (const raw of player.modifiers) {
      const modifier = asExtended(raw);

      if (modifier.mode === 'duration') {
        const previous = modifier.remainingPeriods ?? 1;
        modifier.remainingPeriods = previous - 1;
        if (modifier.remainingPeriods <= 0) {
          state.events.push({
            type: 'modifier_changed',
            period: endedPeriod,
            text: `${getV8CalibrationPlayer(player.cardId).realName}: ${modifier.source ?? 'timed modifier'} expires.`,
          });
          continue;
        }
        kept.push(modifier);
        continue;
      }

      if (modifier.mode === 'decay') {
        const previousAttack = modifier.attack;
        const previousDefence = modifier.defence;
        modifier.attack = tickTowardZero(modifier.attack, modifier.decayAttackPerPeriod ?? 0);
        modifier.defence = tickTowardZero(modifier.defence, modifier.decayDefencePerPeriod ?? 0);

        if (previousAttack !== modifier.attack || previousDefence !== modifier.defence) {
          state.events.push({
            type: 'modifier_changed',
            period: endedPeriod,
            text: `${getV8CalibrationPlayer(player.cardId).realName} · ${modifier.source ?? 'modifier'} fades: ${modifierStatText(previousAttack, previousDefence)} → ${modifierStatText(modifier.attack, modifier.defence)}.`,
          });
        }
        if (modifier.attack === 0 && modifier.defence === 0) continue;
      }

      kept.push(modifier);
    }
    player.modifiers = kept;
  }
}

export function endV8CalibrationPeriod(state: base.V8CalibrationState): base.V8CalibrationState {
  const endedPeriod = state.period;
  let next = base.endV8CalibrationPeriod(state);
  tickExtendedModifiers(next, endedPeriod);
  next = base.refreshCalibrationSuppression(next);
  return next;
}

export function calibrationModifierBadges(state: base.V8CalibrationState, runtimeId: string): string[] {
  const player = state.players[runtimeId];
  if (!player) return [];

  return player.modifiers.flatMap((raw) => {
    const modifier = asExtended(raw);
    if (modifier.mode === 'decay') {
      const decayParts: string[] = [];
      if (modifier.decayAttackPerPeriod) decayParts.push(`${modifier.decayAttackPerPeriod} ATT`);
      if (modifier.decayDefencePerPeriod) decayParts.push(`${modifier.decayDefencePerPeriod} DEF`);
      return [`${modifierStatText(modifier.attack, modifier.defence)} ↓${decayParts.join('/')}/P`];
    }
    if (modifier.mode === 'duration') {
      return [`${modifierStatText(modifier.attack, modifier.defence)} · ${modifier.remainingPeriods ?? 0}P`];
    }
    if (modifier.lifetime === 'period') return [`${modifierStatText(modifier.attack, modifier.defence)} · THIS P`];
    if (modifier.attack || modifier.defence) return [modifierStatText(modifier.attack, modifier.defence)];
    return [];
  });
}
