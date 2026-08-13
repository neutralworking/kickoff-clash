import {
  applyCalibrationModifier,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  opposingDepthZone,
  type V8CalibrationSide,
  type V8CalibrationState,
  type V8Zone,
} from '@/engine-v8';
import type { JokerCard } from './jokers';

export type ManagerV8Effect =
  | 'control'
  | 'direct_play'
  | 'catenaccio'
  | 'positional_play'
  | 'counter_press'
  | 'park_the_bus'
  | 'rotation'
  | 'low_block'
  | 'murderball'
  | 'fergie_time'
  | 'all_out_attack'
  | 'total_football'
  | 'aerial_bombardment'
  | 'arm_around_shoulder'
  | 'joga_bonito';

export interface ManagerV8Profile {
  id: string;
  name: string;
  realManagerSource: string;
  rarity: JokerCard['rarity'];
  formations: string[];
  actionName: string;
  actionText: string;
  effect: ManagerV8Effect;
  cost: number;
}

type ManagerV8Definition = Pick<ManagerV8Profile, 'actionName' | 'formations' | 'effect'>;

/**
 * Manager IDs, formations, Action names and 3-Energy cost mirror the Managers
 * Google Sheet. Effect copy lives on the corresponding JokerCard so every
 * manager presentation reads the same sentence the live V8 resolver implements.
 */
const DEFINITION_BY_ID: Record<string, ManagerV8Definition> = {
  pomo: { actionName: 'Direct Play', formations: ['4-4-2', '4-2-3-1', '5-4-1'], effect: 'direct_play' },
  anti_football: { actionName: 'Catenaccio', formations: ['5-3-2', '5-4-1', '3-5-2'], effect: 'catenaccio' },
  tiki_taka: { actionName: 'Positional Play', formations: ['4-3-3', '4-2-3-1', '3-4-3'], effect: 'positional_play' },
  gegenpress: { actionName: 'Counter-Press', formations: ['4-3-3', '4-2-3-1'], effect: 'counter_press' },
  box_office: { actionName: 'Park the Bus', formations: ['4-2-3-1', '4-3-3', '3-5-2'], effect: 'park_the_bus' },
  tinkerman: { actionName: 'Rotation', formations: ['4-4-2', '4-2-3-1'], effect: 'rotation' },
  cholismo: { actionName: 'Low Block', formations: ['4-4-2', '3-5-2', '5-3-2'], effect: 'low_block' },
  murderball: { actionName: 'Murderball', formations: ['3-4-3', '4-3-3', '3-5-2'], effect: 'murderball' },
  fergie_time: { actionName: 'Fergie Time', formations: ['4-4-2', '4-2-3-1'], effect: 'fergie_time' },
  entertainers: { actionName: 'All-Out Attack', formations: ['4-4-2', '4-3-3'], effect: 'all_out_attack' },
  total_football: { actionName: 'Total Football', formations: ['3-4-3', '4-3-3', '3-5-2'], effect: 'total_football' },
  set_pieces_fc: { actionName: 'Aerial Bombardment', formations: ['5-4-1', '4-4-2', '5-3-2'], effect: 'aerial_bombardment' },
  wheeler_dealer: { actionName: 'Arm Around the Shoulder', formations: ['4-4-2', '4-2-3-1'], effect: 'arm_around_shoulder' },
  joga_bonito: { actionName: 'Joga Bonito', formations: ['4-3-3', '4-2-3-1'], effect: 'joga_bonito' },
};

export const CONTROL_MANAGER_V8: ManagerV8Profile = {
  id: 'control',
  name: 'Control',
  realManagerSource: 'Calibration prototype',
  rarity: 'common',
  formations: ['4-3-3'],
  actionName: 'Control',
  actionText: 'DEF: +2 DEF per player. MID: +1 ATT and +1 DEF per player. ATT: +2 ATT per player.',
  effect: 'control',
  cost: 3,
};

function fallbackDefinition(manager: JokerCard): ManagerV8Definition {
  return {
    actionName: manager.traits[0]?.trim() || 'Match Effect',
    formations: manager.preferredFormation ? [manager.preferredFormation] : ['4-3-3'],
    effect: 'control',
  };
}

export function managerV8Profile(manager: JokerCard): ManagerV8Profile {
  const definition = DEFINITION_BY_ID[manager.id] ?? fallbackDefinition(manager);
  return {
    id: manager.id,
    name: manager.name,
    realManagerSource: manager.realManagerSource ?? manager.archetype,
    rarity: manager.rarity,
    formations: Array.from(new Set(definition.formations)).slice(0, 3),
    actionName: definition.actionName,
    actionText: manager.effect,
    effect: definition.effect,
    cost: 3,
  };
}

export function managerActionNameV8(manager: JokerCard): string {
  return managerV8Profile(manager).actionName;
}

export function managerFormationsV8(manager: JokerCard): string[] {
  return managerV8Profile(manager).formations;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function attackLane(zone: V8Zone): V8Zone {
  return zone === 'DEF' ? 'MID' : zone;
}

function defenceLane(zone: V8Zone): V8Zone {
  return zone === 'ATT' ? 'MID' : zone;
}

function otherSide(side: V8CalibrationSide): V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

function addAttack(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone, amount: number): void {
  state.tacticalAttack[side][attackLane(zone)] += amount;
}

function addDefence(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone, amount: number): void {
  state.zoneDefenceBonus[side][defenceLane(zone)] += amount;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

/** Resolve the exact Action printed on a manager card. */
export function resolveManagerV8Action(
  state: V8CalibrationState,
  profile: ManagerV8Profile,
  side: V8CalibrationSide,
  zone: V8Zone,
  score: { home: number; away: number } = { home: 0, away: 0 },
): V8CalibrationState {
  let next = clone(state);
  const players = calibrationPlayersInZone(next, side, zone);
  const count = players.length;
  let attackDelta = 0;
  let defenceDelta = 0;
  let detail = `${count} player${count === 1 ? '' : 's'}`;

  switch (profile.effect) {
    case 'direct_play':
      attackDelta = count * 2;
      addAttack(next, side, zone, attackDelta);
      break;
    case 'catenaccio':
      defenceDelta = count * (zone === 'DEF' ? 3 : 2);
      addDefence(next, side, zone, defenceDelta);
      break;
    case 'positional_play':
      attackDelta = count;
      defenceDelta = count;
      addAttack(next, side, zone, attackDelta);
      addDefence(next, side, zone, defenceDelta);
      break;
    case 'counter_press': {
      const facing = calibrationPlayersInZone(next, otherSide(side), opposingDepthZone(zone)).length;
      attackDelta = count + (facing > 0 ? 2 : 0);
      defenceDelta = count;
      addAttack(next, side, zone, attackDelta);
      addDefence(next, side, zone, defenceDelta);
      detail = `${count} player${count === 1 ? '' : 's'} · ${facing} facing`;
      break;
    }
    case 'park_the_bus':
      attackDelta = -2;
      defenceDelta = count * 3;
      addAttack(next, side, zone, attackDelta);
      addDefence(next, side, zone, defenceDelta);
      break;
    case 'rotation': {
      attackDelta = count;
      defenceDelta = count;
      addAttack(next, side, zone, attackDelta);
      addDefence(next, side, zone, defenceDelta);
      const drawn = next.teams[side].drawPile.shift();
      if (drawn) {
        next.teams[side].hand.push({ kind: 'player', cardId: drawn });
        detail += ' · drew 1 player';
      } else {
        detail += ' · deck empty';
      }
      break;
    }
    case 'low_block': {
      const ownScore = side === 'home' ? score.home : score.away;
      const opponentScore = side === 'home' ? score.away : score.home;
      const perPlayer = ownScore <= opponentScore ? 3 : 2;
      defenceDelta = count * perPlayer;
      addDefence(next, side, zone, defenceDelta);
      detail += ownScore <= opponentScore ? ' · level/behind' : ' · ahead';
      break;
    }
    case 'murderball': {
      attackDelta = count * 2;
      defenceDelta = count * 2;
      addAttack(next, side, zone, attackDelta);
      addDefence(next, side, zone, defenceDelta);
      const opponent = otherSide(side);
      const facingZone = opposingDepthZone(zone);
      const facing = calibrationPlayersInZone(next, opponent, facingZone).length;
      addAttack(next, opponent, facingZone, facing);
      detail += ` · opponent ${signed(facing)} ATT`;
      break;
    }
    case 'fergie_time': {
      const perPlayer = next.period === 4 ? 3 : 1;
      attackDelta = count * perPlayer;
      addAttack(next, side, zone, attackDelta);
      detail += next.period === 4 ? ' · final period' : ` · period ${next.period}`;
      break;
    }
    case 'all_out_attack':
      attackDelta = count * 3;
      defenceDelta = count * -1;
      addAttack(next, side, zone, attackDelta);
      addDefence(next, side, zone, defenceDelta);
      break;
    case 'total_football': {
      const total = Object.values(next.players).filter((player) => player.side === side).length;
      attackDelta = total;
      defenceDelta = total;
      next.tacticalAttack[side].MID += attackDelta;
      next.zoneDefenceBonus[side].MID += defenceDelta;
      detail = `${total} deployed player${total === 1 ? '' : 's'}`;
      break;
    }
    case 'aerial_bombardment':
      attackDelta = 3 + count;
      addAttack(next, side, zone, attackDelta);
      detail += ' · Corner created';
      break;
    case 'arm_around_shoulder': {
      const target = [...players].sort((a, b) => (
        calibrationPlayerCard(b).cost - calibrationPlayerCard(a).cost
        || a.deployedOrder - b.deployedOrder
        || a.runtimeId.localeCompare(b.runtimeId)
      ))[0];
      if (target) {
        next = applyCalibrationModifier(next, target.runtimeId, {
          attack: 3,
          defence: 3,
          lifetime: 'period',
          source: profile.actionName,
        });
        attackDelta = 3;
        defenceDelta = 3;
        detail = calibrationPlayerCard(target).realName;
      } else {
        detail = 'no player to motivate';
      }
      break;
    }
    case 'joga_bonito':
      attackDelta = count * 2 + (zone === 'ATT' && count > 0 ? 2 : 0);
      addAttack(next, side, zone, attackDelta);
      detail += zone === 'ATT' && count > 0 ? ' · ATT flourish' : '';
      break;
    case 'control':
    default:
      if (zone === 'ATT') {
        attackDelta = count * 2;
        addAttack(next, side, zone, attackDelta);
      } else if (zone === 'DEF') {
        defenceDelta = count * 2;
        addDefence(next, side, zone, defenceDelta);
      } else {
        attackDelta = count;
        defenceDelta = count;
        addAttack(next, side, zone, attackDelta);
        addDefence(next, side, zone, defenceDelta);
      }
      break;
  }

  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${side === 'home' ? 'YOU' : 'CPU'} reveal ${profile.actionName.toUpperCase()} → ${zone}: ${signed(attackDelta)} ATT · ${signed(defenceDelta)} DEF · ${detail}.`,
  });
  return next;
}
