import type { V8CalibrationSide, V8CalibrationState } from './calibration-runtime-base';

const ACTION_RNG_SEED_KEY = 'action-rng:seed';
const SCORE_HOME_KEY = 'match-score:home';
const SCORE_AWAY_KEY = 'match-score:away';
const DEFAULT_RNG_SEED = 0x6d2b79f5;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hashText(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function deriveSeed(state: V8CalibrationState): number {
  const signature = (['home', 'away'] as const).flatMap((side) => {
    const team = state.teams[side];
    const deployed = Object.values(state.players)
      .filter((player) => player.side === side)
      .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))
      .map((player) => `d:${player.cardId}:${player.zone}`);
    const hand = team.hand.map((entry) => entry.kind === 'player' ? `h:${entry.cardId}` : `t:${entry.card.id}`);
    return [`${side}:`, ...deployed, ...hand, ...team.drawPile.map((cardId) => `p:${cardId}`)];
  }).join('|');
  return (hashText(signature) ^ DEFAULT_RNG_SEED) >>> 0;
}

export function withCalibrationActionRngSeed(state: V8CalibrationState, seed: number): V8CalibrationState {
  const next = clone(state);
  next.matchCounters[ACTION_RNG_SEED_KEY] = seed >>> 0;
  for (const key of Object.keys(next.matchCounters)) {
    if (key.startsWith('action-rng:count:')) delete next.matchCounters[key];
  }
  return next;
}

export function calibrationActionRngSeed(state: V8CalibrationState): number {
  return state.matchCounters[ACTION_RNG_SEED_KEY] ?? deriveSeed(state);
}

/**
 * Deterministic, namespaced Action RNG. Each Action namespace advances independently, so adding an
 * unrelated random Action cannot silently change SHOWBOAT outcomes in an existing replay.
 */
export function rollCalibrationAction(
  state: V8CalibrationState,
  namespace: string,
): { state: V8CalibrationState; roll: number; ordinal: number } {
  const next = clone(state);
  const seed = calibrationActionRngSeed(next);
  next.matchCounters[ACTION_RNG_SEED_KEY] = seed;
  const countKey = `action-rng:count:${namespace}`;
  const ordinal = next.matchCounters[countKey] ?? 0;
  next.matchCounters[countKey] = ordinal + 1;

  const namespaceHash = hashText(namespace);
  const ordinalSalt = Math.imul((ordinal + 1) >>> 0, 0x9e3779b1) >>> 0;
  const mixed = (seed ^ namespaceHash ^ ordinalSalt) >>> 0;
  const value = (Math.imul(mixed, 1664525) + 1013904223) >>> 0;
  return { state: next, roll: value / 0x100000000, ordinal };
}

export interface V8CalibrationStoredScore {
  home: number;
  away: number;
}

export function storeCalibrationMatchScore(
  state: V8CalibrationState,
  score: V8CalibrationStoredScore,
): V8CalibrationState {
  const next = clone(state);
  next.matchCounters[SCORE_HOME_KEY] = score.home;
  next.matchCounters[SCORE_AWAY_KEY] = score.away;
  return next;
}

export function calibrationStoredMatchScore(state: V8CalibrationState): V8CalibrationStoredScore | undefined {
  const home = state.matchCounters[SCORE_HOME_KEY];
  const away = state.matchCounters[SCORE_AWAY_KEY];
  if (home === undefined || away === undefined) return undefined;
  return { home, away };
}

export function calibrationScoreRelation(
  state: V8CalibrationState,
  side: V8CalibrationSide,
): 'winning' | 'losing' | 'level' | 'unknown' {
  const score = calibrationStoredMatchScore(state);
  if (!score) return 'unknown';
  const own = side === 'home' ? score.home : score.away;
  const opponent = side === 'home' ? score.away : score.home;
  if (own > opponent) return 'winning';
  if (own < opponent) return 'losing';
  return 'level';
}
