/**
 * Kickoff Clash — Match Engine v5: Active Card Play
 *
 * The player assigns XI cards to attack or defend each increment.
 * Two scoring axes (attack/defence) replace a single score.
 * Chemistry fires contextually based on card placement.
 */

import type { Card, SlottedCard, PlayingStyle } from './scoring';
import { seededRandom, PLAYING_STYLES } from './scoring';
import type { Connection, CrossSynergy } from './chemistry';
import {
  findPositionalConnections,
  PERSONALITY_THEMES,
  THEME_RESONANCES,
} from './chemistry';
import type { Formation, FormationSlot } from './formations';
import type { JokerCard } from './jokers';
import { applyJoker, getExtraDiscards } from './jokers';
import type { TacticCard, TacticSlots } from './tactics';
import {
  INCREMENT_MINUTES,
  generateGoalText,
  generateChanceText,
  generateInjuryText,
} from './hand';
import type { MatchEvent } from './hand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonalityBonus {
  attackMod: number;          // multiplier, e.g. 1.15
  defenceMod: number;         // multiplier, e.g. 1.20
  label: string | null;       // e.g. "Silk (3× Maestro)"
  perfectDressingRoom: boolean;
}

export interface MatchV5State {
  xi: Card[];
  bench: Card[];
  remainingDeck: Card[];
  attackerIds: Set<number>;   // card IDs committed to attack this increment
  subsRemaining: number;
  discardsRemaining: number;
  subsUsed: { outId: number; inId: number; minute: number }[];
  currentIncrement: number;   // 0–4 index
  isFirstHalf: boolean;
  scores: IncrementResult[];
  yourGoals: number;
  opponentGoals: number;
  formation: Formation;
  playingStyle: string;
  personalityBonus: PersonalityBonus;
  opponentRound: number;      // 1–5 (for baseline lookup)
  opponentStyle: string;      // Passive | Balanced | Attacking | Counter | Adaptive
  opponentWeakness: string;   // archetype the opponent is weak to
  seed: number;
}

export interface CascadeLine {
  label: string;
  value: number;
  type: 'base' | 'synergy' | 'style' | 'dual-role' | 'personality' | 'manager' | 'tactic' | 'ability';
}

export interface AttackDefenceSplit {
  attackScore: number;
  defenceScore: number;
  attackBreakdown: CascadeLine[];
  defenceBreakdown: CascadeLine[];
  attackSynergies: Connection[];
  defenceSynergies: Connection[];
  crossSynergies: CrossSynergy[];
  attackerCount: number;
  maxAttackers: number;
}

export interface IncrementResult {
  minute: number;
  split: AttackDefenceSplit;
  opponentAttack: number;
  opponentDefence: number;
  yourGoalChance: number;
  opponentGoalChance: number;
  yourScored: boolean;
  opponentScored: boolean;
  event: MatchEvent;
}

export interface MatchV5Result {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  scores: IncrementResult[];
  matchState: MatchV5State;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Opponent attack/defence baselines by round (1-indexed) */
const OPPONENT_BASELINES: { attack: number; defence: number }[] = [
  { attack: 400, defence: 450 },   // Match 1
  { attack: 550, defence: 600 },   // Match 2
  { attack: 700, defence: 750 },   // Match 3
  { attack: 850, defence: 900 },   // Match 4
  { attack: 1000, defence: 1050 }, // Match 5
];

/** Dual-role contribution rules */
const DUAL_ROLES: {
  archetype?: string;
  role?: string;
  attackWhenDefending: number; // fraction of power → attack score
  defenceWhenAttacking: number; // fraction of power → defence score
}[] = [
  { archetype: 'Controller', attackWhenDefending: 0.30, defenceWhenAttacking: 0 },
  { archetype: 'Passer',     attackWhenDefending: 0.25, defenceWhenAttacking: 0 },
  { archetype: 'Commander',  attackWhenDefending: 0, defenceWhenAttacking: 0.20 },
  { role: 'Regista',         attackWhenDefending: 0.35, defenceWhenAttacking: 0 },
  { role: 'Libero',          attackWhenDefending: 0.20, defenceWhenAttacking: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function cardToSlotted(card: Card, formation: Formation): SlottedCard {
  // Find best matching slot for this card's position
  const slot = formation.slots.find((s: FormationSlot) => s.accepts.includes(card.position));
  return { card, slot: slot?.type ?? card.position };
}

function getDualRole(card: Card): { attackWhenDefending: number; defenceWhenAttacking: number } | null {
  for (const rule of DUAL_ROLES) {
    if (rule.archetype && card.archetype === rule.archetype) return rule;
    if (rule.role && card.tacticalRole === rule.role) return rule;
  }
  return null;
}

function isEngine(card: Card): boolean {
  return card.archetype === 'Engine';
}

// ---------------------------------------------------------------------------
// Personality Bonus (calculated once at match start)
// ---------------------------------------------------------------------------

function calculatePersonalityBonus(xi: Card[], seed: number): PersonalityBonus {
  const themeCounts = new Map<string, number>();
  const themesPresent = new Set<string>();

  for (const card of xi) {
    if (!card.personalityTheme) continue;
    themesPresent.add(card.personalityTheme);
    themeCounts.set(card.personalityTheme, (themeCounts.get(card.personalityTheme) ?? 0) + 1);
  }

  let attackMod = 1.0;
  let defenceMod = 1.0;
  const labels: string[] = [];

  for (const theme of PERSONALITY_THEMES) {
    const count = themeCounts.get(theme) ?? 0;
    if (count < 3) continue;

    const resonance = THEME_RESONANCES[theme];
    switch (theme) {
      case 'General':
        attackMod += 0.10;
        defenceMod += 0.10;
        break;
      case 'Captain':
        defenceMod += 0.20;
        break;
      case 'Maestro':
        attackMod += 0.15;
        break;
      case 'Catalyst': {
        const rand = seededRandom(seed * 9301 + 49297);
        const factor = -0.20 + rand * 0.40;
        attackMod += factor;
        break;
      }
      case 'Professor':
        attackMod += 0.12;
        defenceMod += 0.12;
        break;
    }
    labels.push(`${resonance.name} (${count}× ${theme})`);
  }

  // Perfect Dressing Room: all 5 themes present
  const perfectDressingRoom = PERSONALITY_THEMES.every((t) => themesPresent.has(t));
  if (perfectDressingRoom) {
    attackMod *= 1.5;
    defenceMod *= 1.5;
    labels.push('Perfect Dressing Room');
  }

  return {
    attackMod,
    defenceMod,
    label: labels.length > 0 ? labels.join(' + ') : null,
    perfectDressingRoom,
  };
}

// ---------------------------------------------------------------------------
// 1. initMatch
// ---------------------------------------------------------------------------

export function initMatch(
  xi: Card[],
  bench: Card[],
  remainingDeck: Card[],
  formation: Formation,
  playingStyle: string,
  jokers: JokerCard[],
  seed: number,
  opponentRound: number,
  opponentStyle: string,
  opponentWeakness: string,
): MatchV5State {
  return {
    xi,
    bench,
    remainingDeck,
    attackerIds: new Set(),
    subsRemaining: 5,
    discardsRemaining: 3 + getExtraDiscards(jokers),
    subsUsed: [],
    currentIncrement: 0,
    isFirstHalf: true,
    scores: [],
    yourGoals: 0,
    opponentGoals: 0,
    formation,
    playingStyle,
    personalityBonus: calculatePersonalityBonus(xi, seed),
    opponentRound,
    opponentStyle,
    opponentWeakness,
    seed,
  };
}

// ---------------------------------------------------------------------------
// 2. commitAttackers
// ---------------------------------------------------------------------------

export function commitAttackers(state: MatchV5State, cardIds: number[]): MatchV5State {
  const xiIds = new Set(state.xi.map((c) => c.id));
  const validIds = new Set<number>();

  for (const id of cardIds) {
    if (!xiIds.has(id)) continue;
    const card = state.xi.find((c) => c.id === id);
    if (card?.injured) continue; // injured cards cannot attack
    validIds.add(id);
  }

  return { ...state, attackerIds: validIds };
}

// ---------------------------------------------------------------------------
// 3. evaluateSplit — the core scoring function
// ---------------------------------------------------------------------------

export function evaluateSplit(
  state: MatchV5State,
  jokers: JokerCard[],
  tacticSlots: TacticSlots,
): AttackDefenceSplit {
  const { xi, formation, playingStyle, personalityBonus, opponentWeakness } = state;
  const maxAtk = formation.maxAttackers;

  // Partition into attackers and defenders
  const attackers: Card[] = [];
  const defenders: Card[] = [];
  for (const card of xi) {
    if (state.attackerIds.has(card.id)) {
      attackers.push(card);
    } else {
      defenders.push(card);
    }
  }

  const attackBreakdown: CascadeLine[] = [];
  const defenceBreakdown: CascadeLine[] = [];

  // --- Base power ---
  // Sort attackers by power descending — weakest get diminished if over cap
  const sortedAttackers = [...attackers].sort((a, b) => b.power - a.power);
  let baseAttack = 0;
  for (let i = 0; i < sortedAttackers.length; i++) {
    const card = sortedAttackers[i];
    let power = card.power;

    // Engine: 70% to assigned side
    if (isEngine(card)) power = Math.round(power * 0.70);

    // Soft cap diminishing
    if (i >= maxAtk) {
      power = Math.round(power * 0.50);
    }

    baseAttack += power;
  }

  let baseDefence = 0;
  for (const card of defenders) {
    let power = card.power;
    // Injured defenders at 50%
    if (card.injured) power = Math.round(power * 0.50);
    // Engine: 70% to assigned side
    if (isEngine(card)) power = Math.round(power * 0.70);
    baseDefence += power;
  }

  attackBreakdown.push({ label: 'Base power', value: baseAttack, type: 'base' });
  defenceBreakdown.push({ label: 'Base power', value: baseDefence, type: 'base' });

  // --- Dual-role contributions ---
  let dualAttack = 0;
  let dualDefence = 0;

  // Engine cross-contributions (30% to other side)
  for (const card of attackers) {
    if (isEngine(card)) {
      const contrib = Math.round(card.power * 0.30);
      dualDefence += contrib;
    }
  }
  for (const card of defenders) {
    if (isEngine(card)) {
      const contrib = Math.round(card.power * 0.30);
      dualAttack += contrib;
    }
  }

  // Non-engine dual roles
  for (const card of defenders) {
    if (isEngine(card)) continue;
    const rule = getDualRole(card);
    if (rule && rule.attackWhenDefending > 0) {
      dualAttack += Math.round(card.power * rule.attackWhenDefending);
    }
  }
  for (const card of attackers) {
    if (isEngine(card)) continue;
    const rule = getDualRole(card);
    if (rule && rule.defenceWhenAttacking > 0) {
      dualDefence += Math.round(card.power * rule.defenceWhenAttacking);
    }
  }

  if (dualAttack > 0) {
    attackBreakdown.push({ label: 'Dual-role contribution', value: dualAttack, type: 'dual-role' });
  }
  if (dualDefence > 0) {
    defenceBreakdown.push({ label: 'Dual-role contribution', value: dualDefence, type: 'dual-role' });
  }

  // --- Positional synergies ---
  const attackerSlotted = attackers.map((c) => cardToSlotted(c, formation));
  const defenderSlotted = defenders.map((c) => cardToSlotted(c, formation));
  const { attackSynergies, defenceSynergies, crossSynergies } =
    findPositionalConnections(attackerSlotted, defenderSlotted);

  let synergyAttack = 0;
  for (const syn of attackSynergies) {
    synergyAttack += syn.bonus;
    attackBreakdown.push({ label: syn.name, value: syn.bonus, type: 'synergy' });
  }

  let synergyDefence = 0;
  for (const syn of defenceSynergies) {
    synergyDefence += syn.bonus;
    defenceBreakdown.push({ label: syn.name, value: syn.bonus, type: 'synergy' });
  }

  let crossAttack = 0;
  let crossDefence = 0;
  for (const syn of crossSynergies) {
    crossAttack += syn.attackBonus;
    crossDefence += syn.defenceBonus;
    if (syn.attackBonus > 0) {
      attackBreakdown.push({ label: `${syn.name} (cross)`, value: syn.attackBonus, type: 'synergy' });
    }
    if (syn.defenceBonus > 0) {
      defenceBreakdown.push({ label: `${syn.name} (cross)`, value: syn.defenceBonus, type: 'synergy' });
    }
  }

  // --- Style bonus (attackers only) ---
  const style = PLAYING_STYLES[playingStyle];
  let styleAttack = 0;
  if (style) {
    const isTotal = style.bonusArchetypes.length === 0; // Total Football
    const matchingCount = isTotal
      ? attackers.length
      : attackers.filter((c) => style.bonusArchetypes.includes(c.archetype)).length;
    styleAttack = Math.round(baseAttack * style.multiplier * matchingCount);
    if (styleAttack > 0) {
      attackBreakdown.push({ label: `${style.name} bonus`, value: styleAttack, type: 'style' });
    }
  }

  // --- Weakness exploitation ---
  let weaknessBonus = 0;
  if (opponentWeakness) {
    const weaknessCount = attackers.filter((c) => c.archetype === opponentWeakness).length;
    if (weaknessCount >= 2) {
      weaknessBonus = Math.round(baseAttack * 0.15);
      attackBreakdown.push({ label: 'Weakness exploited', value: weaknessBonus, type: 'ability' });
    }
  }

  // --- Tactic bonus (full XI, Phase 1) ---
  let tacticBonus = 0;
  for (const slot of tacticSlots.slots) {
    if (!slot) continue;
    tacticBonus += slot.compute(xi, state.currentIncrement);
  }
  if (tacticBonus > 0) {
    attackBreakdown.push({ label: 'Tactics', value: tacticBonus, type: 'tactic' });
  }

  // --- Manager bonus (full XI, Phase 1) ---
  const allConnections: Connection[] = [...attackSynergies, ...defenceSynergies, ...crossSynergies];
  let managerBonus = 0;
  for (const joker of jokers) {
    managerBonus += applyJoker(joker, xi, allConnections);
  }
  if (managerBonus > 0) {
    attackBreakdown.push({ label: 'Manager', value: managerBonus, type: 'manager' });
  }

  // --- Subtotals before personality ---
  let attackTotal = baseAttack + dualAttack + synergyAttack + crossAttack + styleAttack + weaknessBonus + tacticBonus + managerBonus;
  let defenceTotal = baseDefence + dualDefence + synergyDefence + crossDefence;

  // --- Personality multipliers (applied last) ---
  const personalityAttackBonus = Math.round(attackTotal * (personalityBonus.attackMod - 1));
  const personalityDefenceBonus = Math.round(defenceTotal * (personalityBonus.defenceMod - 1));

  if (personalityAttackBonus !== 0 && personalityBonus.label) {
    attackBreakdown.push({ label: personalityBonus.label, value: personalityAttackBonus, type: 'personality' });
  }
  if (personalityDefenceBonus !== 0 && personalityBonus.label) {
    defenceBreakdown.push({ label: personalityBonus.label, value: personalityDefenceBonus, type: 'personality' });
  }

  attackTotal += personalityAttackBonus;
  defenceTotal += personalityDefenceBonus;

  return {
    attackScore: Math.max(0, attackTotal),
    defenceScore: Math.max(0, defenceTotal),
    attackBreakdown,
    defenceBreakdown,
    attackSynergies,
    defenceSynergies,
    crossSynergies,
    attackerCount: attackers.length,
    maxAttackers: maxAtk,
  };
}

// ---------------------------------------------------------------------------
// 4. resolveIncrement
// ---------------------------------------------------------------------------

export function resolveIncrement(
  state: MatchV5State,
  split: AttackDefenceSplit,
  opponentAttack: number,
  opponentDefence: number,
  seed: number,
): IncrementResult {
  const minute = INCREMENT_MINUTES[state.currentIncrement];

  // Goal chances
  const attackRatio = opponentDefence > 0 ? split.attackScore / opponentDefence : 2.0;
  let yourGoalChance = clamp(0.08 + (attackRatio - 1.0) * 0.20, 0.03, 0.45);

  const theirAttackRatio = split.defenceScore > 0 ? opponentAttack / split.defenceScore : 2.0;
  let opponentGoalChance = clamp(0.08 + (theirAttackRatio - 1.0) * 0.20, 0.03, 0.35);

  // 90th minute drama
  if (state.currentIncrement === 4) {
    yourGoalChance *= 1.3;
    opponentGoalChance *= 1.3;
  }

  // Seeded random for deterministic results
  const yourRoll = seededRandom(seed * 71 + state.currentIncrement * 13 + 1);
  const theirRoll = seededRandom(seed * 83 + state.currentIncrement * 17 + 2);

  const yourScored = yourRoll < yourGoalChance;
  const opponentScored = theirRoll < opponentGoalChance;

  // Generate commentary
  const allConnections = [...split.attackSynergies, ...split.defenceSynergies, ...split.crossSynergies];
  let eventText: string;
  let eventType: MatchEvent['type'];

  if (yourScored && opponentScored) {
    eventText = `${minute}' — GOAL! ${generateGoalText(allConnections, seed + state.currentIncrement)} But the opponent strikes back!`;
    eventType = 'goal-yours';
  } else if (yourScored) {
    eventText = `${minute}' — GOAL! ${generateGoalText(allConnections, seed + state.currentIncrement)}`;
    eventType = 'goal-yours';
  } else if (opponentScored) {
    eventText = `${minute}' — Opponent scores. ${generateChanceText(seed + state.currentIncrement + 100)}`;
    eventType = 'goal-opponent';
  } else {
    eventText = `${minute}' — ${generateChanceText(seed + state.currentIncrement + 200)}`;
    eventType = 'chance';
  }

  return {
    minute,
    split,
    opponentAttack,
    opponentDefence,
    yourGoalChance,
    opponentGoalChance,
    yourScored,
    opponentScored,
    event: { minute, text: eventText, type: eventType },
  };
}

// ---------------------------------------------------------------------------
// 5. getOpponentBaselines (private)
// ---------------------------------------------------------------------------

export function getOpponentBaselines(
  round: number,
  style: string,
  increment: number,
  state: MatchV5State,
): { attack: number; defence: number } {
  const idx = clamp(round - 1, 0, OPPONENT_BASELINES.length - 1);
  let { attack, defence } = OPPONENT_BASELINES[idx];

  switch (style) {
    case 'Passive':
      // Flat baselines
      break;
    case 'Balanced':
      // Slight increase in attack if losing
      if (state.opponentGoals < state.yourGoals) {
        attack = Math.round(attack * 1.10);
      }
      break;
    case 'Attacking':
      attack = Math.round(attack * 1.20);
      defence = Math.round(defence * 0.90);
      break;
    case 'Counter':
      // +30% attack after conceding
      if (state.scores.length > 0 && state.scores[state.scores.length - 1].yourScored) {
        attack = Math.round(attack * 1.30);
      }
      break;
    case 'Adaptive': {
      // Mirror player's split ratio
      const atkCount = state.attackerIds.size;
      const totalCards = state.xi.length;
      const atkRatio = totalCards > 0 ? atkCount / totalCards : 0.5;
      // Opponent attacks heavier when player defends heavier
      attack = Math.round(attack * (0.5 + (1 - atkRatio)));
      defence = Math.round(defence * (0.5 + atkRatio));
      break;
    }
  }

  return { attack, defence };
}

// ---------------------------------------------------------------------------
// 6. advanceIncrement
// ---------------------------------------------------------------------------

export function advanceIncrement(state: MatchV5State, result: IncrementResult): MatchV5State {
  const newScores = [...state.scores, result];
  const newYourGoals = state.yourGoals + (result.yourScored ? 1 : 0);
  const newOpponentGoals = state.opponentGoals + (result.opponentScored ? 1 : 0);
  const nextIncrement = state.currentIncrement + 1;
  const isFirstHalf = nextIncrement <= 1;

  // Fatigue check on cards that attacked
  let newXi = [...state.xi];
  const fatigueSeed = state.seed * 97 + state.currentIncrement * 31;

  for (let i = 0; i < newXi.length; i++) {
    const card = newXi[i];
    if (!state.attackerIds.has(card.id)) continue;

    let fatigueChance = 0;
    if (card.durability === 'glass') fatigueChance = 0.15;
    else if (card.durability === 'phoenix') fatigueChance = 0.12;

    if (fatigueChance > 0) {
      const roll = seededRandom(fatigueSeed + card.id);
      if (roll < fatigueChance) {
        newXi[i] = { ...card, injured: true };
      }
    }
  }

  return {
    ...state,
    xi: newXi,
    scores: newScores,
    yourGoals: newYourGoals,
    opponentGoals: newOpponentGoals,
    currentIncrement: nextIncrement,
    isFirstHalf,
    attackerIds: new Set(), // clear for next increment
  };
}

// ---------------------------------------------------------------------------
// 7. makeSub
// ---------------------------------------------------------------------------

export function makeSub(state: MatchV5State, xiCardId: number, benchCardId: number): MatchV5State {
  if (state.subsRemaining <= 0) return state;

  const xiCard = state.xi.find((c) => c.id === xiCardId);
  const benchCard = state.bench.find((c) => c.id === benchCardId);
  if (!xiCard || !benchCard) return state;

  // First half: injury subs only
  if (state.isFirstHalf && !xiCard.injured) return state;

  const minute = INCREMENT_MINUTES[state.currentIncrement] ?? 90;
  const newXi = state.xi.map((c) => (c.id === xiCardId ? benchCard : c));
  const newBench = state.bench.filter((c) => c.id !== benchCardId);

  return {
    ...state,
    xi: newXi,
    bench: newBench,
    subsRemaining: state.subsRemaining - 1,
    subsUsed: [...state.subsUsed, { outId: xiCardId, inId: benchCardId, minute }],
  };
}

// ---------------------------------------------------------------------------
// 8. discardFromBench
// ---------------------------------------------------------------------------

export function discardFromBench(state: MatchV5State, benchCardIds: number[]): MatchV5State {
  if (state.discardsRemaining <= 0) return state;
  if (benchCardIds.length === 0) return state;

  const discardSet = new Set(benchCardIds);
  const keptBench = state.bench.filter((c) => !discardSet.has(c.id));
  const discardCount = state.bench.length - keptBench.length;

  if (discardCount === 0) return state;

  // Draw replacements from remaining deck
  const drawCount = Math.min(discardCount, state.remainingDeck.length);
  const drawn = state.remainingDeck.slice(0, drawCount);
  const newRemainingDeck = state.remainingDeck.slice(drawCount);

  return {
    ...state,
    bench: [...keptBench, ...drawn],
    remainingDeck: newRemainingDeck,
    discardsRemaining: state.discardsRemaining - 1,
  };
}

// ---------------------------------------------------------------------------
// 9. getMatchResult
// ---------------------------------------------------------------------------

export function getMatchResult(state: MatchV5State): MatchV5Result {
  const { yourGoals, opponentGoals } = state;
  let result: 'win' | 'draw' | 'loss';
  if (yourGoals > opponentGoals) result = 'win';
  else if (yourGoals < opponentGoals) result = 'loss';
  else result = 'draw';

  return {
    yourGoals,
    opponentGoals,
    result,
    scores: state.scores,
    matchState: state,
  };
}
