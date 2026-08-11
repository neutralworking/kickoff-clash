import { getV8CalibrationPlayer } from './calibration-cards';
import * as runtime from './calibration-expansion-chance-reactions';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: runtime.V8CalibrationSide): runtime.V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

function latestResolution(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationTacticalResolution | undefined {
  return [...state.tacticalResolutions].reverse()
    .find((resolution) => resolution.side === side && resolution.cardId === cardId);
}

function suppressorConfig(type: runtime.V8CalibrationTacticalResolution['type']): { cardId: string; counter: string } | undefined {
  if (type === 'through_ball') return { cardId: 'peter-shilton', counter: 'shilton-shut-the-angle' };
  if (type === 'cross') return { cardId: 'paul-mcgrath', counter: 'mcgrath-aerial-command' };
  return undefined;
}

/**
 * Shared typed-Chance ATT suppression. This runs after friendly Chance enhancement but before
 * threshold/once-match cancellation reactions, so downstream defenders see the real reduced ATT.
 * ATT-protection effects such as POWER HEADER still consume the suppression attempt but prevent
 * the reduction, matching BLACK SPIDER's established attempt-consumption semantics.
 */
export function applyV8Batch05TypedChanceSuppression(
  state: runtime.V8CalibrationState,
  attackingSide: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationState {
  const resolution = latestResolution(state, attackingSide, cardId);
  if (!resolution || resolution.zone !== 'ATT') return state;
  const config = suppressorConfig(resolution.type);
  if (!config) return state;

  const defendingSide = otherSide(attackingSide);
  const suppressor = runtime.calibrationPlayersInZone(state, defendingSide, 'DEF')
    .filter((player) =>
      player.cardId === config.cardId
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[`${config.counter}:${player.runtimeId}`] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
  if (!suppressor) return state;

  const next = clone(state);
  const key = `${config.counter}:${suppressor.runtimeId}`;
  next.periodCounters[key] = 1;
  const live = latestResolution(next, attackingSide, cardId)!;
  const action = getV8CalibrationPlayer(config.cardId);
  const attackProtected = live.specialistBonuses.some((label) => label.includes('ATT protected'));

  if (live.cancelled || live.attack <= 0) {
    next.events.push({
      type: 'action_triggered',
      period: next.period,
      text: `${action.realName} · ${action.actionName} meets the first ${live.type === 'cross' ? 'Cross' : 'Through Ball'} but it has already been stopped.`,
    });
    return next;
  }

  if (attackProtected) {
    next.events.push({
      type: 'action_ignored',
      period: next.period,
      text: `${action.realName} · ${action.actionName} cannot reduce the protected ${live.type === 'cross' ? 'Cross' : 'Through Ball'}.`,
    });
    return next;
  }

  const reduction = Math.min(3, live.attack);
  live.attack -= reduction;
  next.tacticalAttack[attackingSide][live.zone] -= reduction;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${action.realName} · ${action.actionName} reduces the first opposing ${live.type === 'cross' ? 'Cross' : 'Through Ball'} by ${reduction} ATT.`,
  });
  return next;
}
