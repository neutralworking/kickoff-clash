import type { FormationSlot, V7PlayerCard } from '../../lib/match-v7/types';
import { positionFitsSlot } from '../formations/mapping';

export interface GoalkeeperEvaluation {
  attack: number;
  defence: number;
  actionsSuppressed: boolean;
  outOfPosition: boolean;
  emergencyGoalkeeper: boolean;
}

export function evaluateGoalkeeperPlacement(
  card: V7PlayerCard,
  slot: FormationSlot,
  calculatedAttack: number,
  calculatedDefence: number,
): GoalkeeperEvaluation {
  const naturalGoalkeeper = card.positionCodes.includes('GK');
  const inGoal = slot.positionCode === 'GK';

  if (inGoal && !naturalGoalkeeper) {
    return {
      attack: 0,
      defence: calculatedDefence - 5,
      actionsSuppressed: true,
      outOfPosition: true,
      emergencyGoalkeeper: true,
    };
  }

  const outOfPosition = !positionFitsSlot(card, slot);
  return {
    attack: calculatedAttack - (outOfPosition ? 2 : 0),
    defence: calculatedDefence - (outOfPosition ? 2 : 0),
    actionsSuppressed: false,
    outOfPosition,
    emergencyGoalkeeper: false,
  };
}
