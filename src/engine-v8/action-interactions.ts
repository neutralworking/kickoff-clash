import { type V8Board, type V8PlayerCard, type V8Zone } from './core';

export type V8PrototypeAction =
  | 'press_next'
  | 'keeper_react'
  | 'follow_att'
  | 'wall'
  | 'cross_receiver';

export type V8PrototypeActionPlayer = V8PlayerCard & {
  prototypeAction?: V8PrototypeAction;
};

export type V8PrototypeZonePenalty = { attack: number; defence: number };

export function prototypePressurePenalty(zone: V8Zone): V8PrototypeZonePenalty {
  if (zone === 'DEF') return { attack: 0, defence: 2 };
  if (zone === 'ATT') return { attack: 2, defence: 0 };
  return { attack: 2, defence: 2 };
}

/** STARFISH-style reactive keeper: revealing after an opposing ATT card is worth +3 DEF this period. */
export function prototypeKeeperReactionBoost(opponentAttackRevealsBefore: number): number {
  return opponentAttackRevealsBefore > 0 ? 3 : 0;
}

/** RUNNER / POACHER-style sequencing: following another friendly ATT reveal is worth +2 ATT this period. */
export function prototypeFollowAttackBoost(friendlyAttackRevealsBefore: number): number {
  return friendlyAttackRevealsBefore > 0 ? 2 : 0;
}

/** BOBO BOMBER / TARGET MAN: a revealed receiver in ATT adds +2 ATT to a Cross. */
export function prototypeCrossReceiverBonus(board: V8Board): number {
  return board.ATT.some((deployed) => (deployed.card as V8PrototypeActionPlayer).prototypeAction === 'cross_receiver') ? 2 : 0;
}

/**
 * WALL-style Ongoing effect. A wall card in DEF gains +2 printed DEF while at least one
 * other friendly player occupies DEF. The returned board is a derived scoring view only;
 * it never mutates the persistent board or the printed card data.
 */
export function prototypeBoardWithOngoing(board: V8Board): V8Board {
  return {
    ...board,
    DEF: board.DEF.map((deployed) => {
      const card = deployed.card as V8PrototypeActionPlayer;
      if (card.prototypeAction !== 'wall' || board.DEF.length < 2) return deployed;
      return {
        ...deployed,
        card: { ...card, printedDefence: card.printedDefence + 2 },
      };
    }),
  };
}
