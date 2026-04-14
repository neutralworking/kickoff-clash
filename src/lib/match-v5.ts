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
  attackerOrder: number[];    // ordered sequence for the attacking play; last card is the finisher
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
  chanceCreation: number;
  shotQuality: number;
  playName: string;
  playSummary: string;
  finisherId: number | null;
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
  yourChanceVolume: number;
  yourChanceQuality: number;
  yourGoalChance: number;
  opponentChanceVolume: number;
  opponentChanceQuality: number;
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

function isWideCard(card: Card): boolean {
  return ['WF', 'WM', 'WD'].includes(card.position)
    || ['Winger', 'Inverted Winger', 'Extremo', 'Lateral', 'Fluidificante', 'Tornante'].includes(card.tacticalRole ?? '');
}

function isPlaymaker(card: Card): boolean {
  return ['Creator', 'Controller', 'Passer'].includes(card.archetype)
    || ['Regista', 'Enganche', 'Trequartista', 'Fantasista', 'Metodista'].includes(card.tacticalRole ?? '');
}

function isFinisher(card: Card): boolean {
  return ['Striker', 'Target', 'Dribbler', 'Powerhouse'].includes(card.archetype)
    || ['Poacher', 'Prima Punta', 'Seconda Punta'].includes(card.tacticalRole ?? '');
}

function inferPlayPattern(
  orderedAttackers: Card[],
  defenders: Card[],
  tacticSlots: TacticSlots,
  playingStyle: string,
): { name: string; summary: string; creationBonus: number; qualityBonus: number; attackBonus: number; defenceBonus: number } {
  if (orderedAttackers.length === 0) {
    return {
      name: 'Hold Shape',
      summary: 'Protect the structure and wait for the next opening.',
      creationBonus: 0,
      qualityBonus: 0,
      attackBonus: 0,
      defenceBonus: 24,
    };
  }

  const tacticIds = tacticSlots.slots.filter(Boolean).map((t) => t!.id);
  const finisher = orderedAttackers[orderedAttackers.length - 1];
  const opener = orderedAttackers[0];
  const playmakers = orderedAttackers.filter(isPlaymaker).length;
  const wideCount = orderedAttackers.filter(isWideCard).length;
  const finishers = orderedAttackers.filter(isFinisher).length;
  const defendersHolding = defenders.length;

  if (
    orderedAttackers.length <= 2
    && opener.position === 'GK'
    && (finisher.archetype === 'Sprinter' || finisher.position === 'CF')
  ) {
    return {
      name: 'Route One',
      summary: `${opener.name} goes long early and ${finisher.name} attacks the space behind.`,
      creationBonus: 42 + (tacticIds.includes('counter_attack') ? 18 : 0),
      qualityBonus: 50 + (tacticIds.includes('set_piece') ? 10 : 0),
      attackBonus: 34,
      defenceBonus: -12,
    };
  }

  if (wideCount >= 2 && playmakers >= 1 && finishers >= 1) {
    return {
      name: 'Wing Overload',
      summary: `Stretch them wide, feed the flanks, and finish through ${finisher.name}.`,
      creationBonus: 46 + (tacticIds.includes('wing_play') ? 22 : 0),
      qualityBonus: 34 + (orderedAttackers.some((c) => c.archetype === 'Engine') ? 12 : 0),
      attackBonus: 30,
      defenceBonus: defendersHolding >= 4 ? 10 : -10,
    };
  }

  if ((playingStyle === 'Tiki-Taka' || tacticIds.includes('possession') || tacticIds.includes('narrow')) && orderedAttackers.length >= 5 && playmakers >= 2) {
    return {
      name: 'Tiki-Taka',
      summary: `Short combinations pull them apart before ${finisher.name} gets the final touch.`,
      creationBonus: 58,
      qualityBonus: 28,
      attackBonus: 36,
      defenceBonus: defendersHolding >= 4 ? 18 : 6,
    };
  }

  if (orderedAttackers.length >= 6 && defendersHolding >= 4) {
    return {
      name: 'Death by a Thousand Cuts',
      summary: `Sustain pressure with runners everywhere while the rest hold the counter shape.`,
      creationBonus: 62,
      qualityBonus: 24,
      attackBonus: 38,
      defenceBonus: 16,
    };
  }

  if (tacticIds.includes('counter_attack') && defendersHolding >= 5 && finishers >= 1) {
    return {
      name: 'Counter Trap',
      summary: `Absorb, spring out, and release ${finisher.name} into the break.`,
      creationBonus: 34,
      qualityBonus: 40,
      attackBonus: 24,
      defenceBonus: 26,
    };
  }

  return {
    name: 'Pattern Play',
    summary: `${opener.name} starts the move and ${finisher.name} is the intended end point.`,
    creationBonus: 18 + playmakers * 10,
    qualityBonus: 18 + finishers * 10,
    attackBonus: 18,
    defenceBonus: defendersHolding >= 4 ? 8 : 0,
  };
}

function getChanceProfile(card: Card): { creation: number; finishing: number } {
  let creation = 0.28;
  let finishing = 0.28;

  switch (card.archetype) {
    case 'Creator':
      creation = 0.85;
      finishing = 0.38;
      break;
    case 'Controller':
      creation = 0.78;
      finishing = 0.22;
      break;
    case 'Passer':
      creation = 0.72;
      finishing = 0.24;
      break;
    case 'Dribbler':
      creation = 0.60;
      finishing = 0.58;
      break;
    case 'Sprinter':
      creation = 0.42;
      finishing = 0.52;
      break;
    case 'Striker':
      creation = 0.34;
      finishing = 0.86;
      break;
    case 'Target':
      creation = 0.26;
      finishing = 0.78;
      break;
    case 'Powerhouse':
      creation = 0.24;
      finishing = 0.66;
      break;
    case 'Engine':
      creation = 0.48;
      finishing = 0.30;
      break;
    case 'Commander':
      creation = 0.34;
      finishing = 0.34;
      break;
  }

  switch (card.tacticalRole) {
    case 'Regista':
    case 'Enganche':
    case 'Trequartista':
    case 'Fantasista':
      creation += 0.12;
      break;
    case 'Winger':
    case 'Inverted Winger':
    case 'Extremo':
      creation += 0.08;
      finishing += 0.08;
      break;
    case 'Poacher':
    case 'Prima Punta':
    case 'Seconda Punta':
      finishing += 0.12;
      break;
  }

  return {
    creation: clamp(creation, 0.12, 1.0),
    finishing: clamp(finishing, 0.12, 1.0),
  };
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
    attackerOrder: [],
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
  const validOrder: number[] = [];

  for (const id of cardIds) {
    if (!xiIds.has(id)) continue;
    const card = state.xi.find((c) => c.id === id);
    if (card?.injured) continue; // injured cards cannot attack
    if (!validOrder.includes(id)) validOrder.push(id);
  }

  return { ...state, attackerIds: new Set(validOrder), attackerOrder: validOrder };
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

  const orderedAttackers = state.attackerOrder
    .map((id) => xi.find((card) => card.id === id))
    .filter((card): card is Card => !!card);

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
  const playPattern = inferPlayPattern(orderedAttackers, defenders, tacticSlots, playingStyle);

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

  attackBreakdown.push({ label: 'Forward commitment', value: baseAttack, type: 'base' });
  defenceBreakdown.push({ label: 'Back-line shape', value: baseDefence, type: 'base' });

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
    attackBreakdown.push({ label: 'Support from deep', value: dualAttack, type: 'dual-role' });
  }
  if (dualDefence > 0) {
    defenceBreakdown.push({ label: 'Recovery cover', value: dualDefence, type: 'dual-role' });
  }

  // --- Positional synergies ---
  const attackerSlotted = attackers.map((c) => cardToSlotted(c, formation));
  const defenderSlotted = defenders.map((c) => cardToSlotted(c, formation));
  const { attackSynergies, defenceSynergies, crossSynergies } =
    findPositionalConnections(attackerSlotted, defenderSlotted);

  let synergyAttack = 0;
  for (const syn of attackSynergies) {
    synergyAttack += syn.bonus;
    attackBreakdown.push({ label: `${syn.name} combo`, value: syn.bonus, type: 'synergy' });
  }

  let synergyDefence = 0;
  for (const syn of defenceSynergies) {
    synergyDefence += syn.bonus;
    defenceBreakdown.push({ label: `${syn.name} screen`, value: syn.bonus, type: 'synergy' });
  }

  let crossAttack = 0;
  let crossDefence = 0;
  for (const syn of crossSynergies) {
    crossAttack += syn.attackBonus;
    crossDefence += syn.defenceBonus;
    if (syn.attackBonus > 0) {
      attackBreakdown.push({ label: `${syn.name} release`, value: syn.attackBonus, type: 'synergy' });
    }
    if (syn.defenceBonus > 0) {
      defenceBreakdown.push({ label: `${syn.name} cover`, value: syn.defenceBonus, type: 'synergy' });
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
      attackBreakdown.push({ label: `${style.name} pattern`, value: styleAttack, type: 'style' });
    }
  }

  // --- Weakness exploitation ---
  let weaknessBonus = 0;
  if (opponentWeakness) {
    const weaknessCount = attackers.filter((c) => c.archetype === opponentWeakness).length;
    if (weaknessCount >= 2) {
      weaknessBonus = Math.round(baseAttack * 0.15);
      attackBreakdown.push({ label: 'Picked on their weak side', value: weaknessBonus, type: 'ability' });
    }
  }

  // --- Tactic bonus (full XI, Phase 1) ---
  let tacticBonus = 0;
  for (const slot of tacticSlots.slots) {
    if (!slot) continue;
    tacticBonus += slot.compute(xi, state.currentIncrement);
  }
  if (tacticBonus > 0) {
    attackBreakdown.push({ label: 'Playbook edge', value: tacticBonus, type: 'tactic' });
  }

  // --- Manager bonus (full XI, Phase 1) ---
  const allConnections: Connection[] = [...attackSynergies, ...defenceSynergies, ...crossSynergies];
  let managerBonus = 0;
  for (const joker of jokers) {
    managerBonus += applyJoker(joker, xi, allConnections);
  }
  if (managerBonus > 0) {
    attackBreakdown.push({ label: 'Touchline edge', value: managerBonus, type: 'manager' });
  }

  // --- Subtotals before personality ---
  let attackTotal = baseAttack + dualAttack + synergyAttack + crossAttack + styleAttack + weaknessBonus + tacticBonus + managerBonus;
  let defenceTotal = baseDefence + dualDefence + synergyDefence + crossDefence + playPattern.defenceBonus;
  const attackerPowerPool = attackers.reduce((sum, card) => sum + card.power, 0);
  let baseCreation = 0;
  let baseFinishing = 0;
  for (const card of attackers) {
    const profile = getChanceProfile(card);
    baseCreation += Math.round(card.power * profile.creation);
    baseFinishing += Math.round(card.power * profile.finishing);
  }
  const chemistryDensity = attackerPowerPool > 0
    ? (synergyAttack + crossAttack) / attackerPowerPool
    : 0;
  const compactAttackMultiplier = attackers.length > 0 && attackers.length <= 3
    ? 1 + Math.min(0.55, chemistryDensity * 1.4 + attackSynergies.length * 0.10 + crossSynergies.length * 0.06)
    : 1 + Math.min(0.18, chemistryDensity * 0.45);

  let chanceCreation = Math.round(
    (baseCreation + Math.round(dualAttack * 0.75) + Math.round(styleAttack * 0.45) + Math.round(tacticBonus * 0.55) + Math.round(managerBonus * 0.35))
      * compactAttackMultiplier,
  );
  let shotQuality = Math.round(
    (baseFinishing + Math.round(synergyAttack * 0.95) + Math.round(crossAttack * 0.55) + Math.round(weaknessBonus * 0.90) + Math.round(tacticBonus * 0.35))
      * compactAttackMultiplier,
  );
  attackTotal += playPattern.attackBonus;
  chanceCreation += playPattern.creationBonus;
  shotQuality += playPattern.qualityBonus;

  if (playPattern.attackBonus !== 0) {
    attackBreakdown.push({ label: playPattern.name, value: playPattern.attackBonus, type: 'tactic' });
  }
  if (playPattern.defenceBonus > 0) {
    defenceBreakdown.push({ label: `${playPattern.name} rest defence`, value: playPattern.defenceBonus, type: 'tactic' });
  }

  if (chanceCreation > 0) {
    attackBreakdown.push({
      label: attackers.length <= 3 && compactAttackMultiplier > 1.08 ? 'Compact move clicked' : 'Chance patterns',
      value: chanceCreation,
      type: 'ability',
    });
  }
  if (shotQuality > 0) {
    attackBreakdown.push({ label: 'Final-ball threat', value: shotQuality, type: 'ability' });
  }

  // --- Personality multipliers (applied last) ---
  const personalityAttackBonus = Math.round(attackTotal * (personalityBonus.attackMod - 1));
  const personalityDefenceBonus = Math.round(defenceTotal * (personalityBonus.defenceMod - 1));
  const personalityCreationBonus = Math.round(chanceCreation * (personalityBonus.attackMod - 1));
  const personalityFinishingBonus = Math.round(shotQuality * (personalityBonus.attackMod - 1));

  if (personalityAttackBonus !== 0 && personalityBonus.label) {
    attackBreakdown.push({ label: `Dressing room edge`, value: personalityAttackBonus, type: 'personality' });
  }
  if (personalityDefenceBonus !== 0 && personalityBonus.label) {
    defenceBreakdown.push({ label: `Dressing room edge`, value: personalityDefenceBonus, type: 'personality' });
  }

  attackTotal += personalityAttackBonus;
  defenceTotal += personalityDefenceBonus;
  chanceCreation += personalityCreationBonus;
  shotQuality += personalityFinishingBonus;

  return {
    attackScore: Math.max(0, attackTotal),
    defenceScore: Math.max(0, defenceTotal),
    chanceCreation: Math.max(0, chanceCreation),
    shotQuality: Math.max(0, shotQuality),
    playName: playPattern.name,
    playSummary: playPattern.summary,
    finisherId: orderedAttackers.at(-1)?.id ?? null,
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

  // Chance model: build chances, then turn them into shots worth scoring from.
  const pressureRatio = opponentDefence > 0 ? split.attackScore / opponentDefence : 2.0;
  const creationRatio = opponentDefence > 0 ? split.chanceCreation / (opponentDefence * 0.8) : 2.0;
  const finishingRatio = opponentDefence > 0 ? split.shotQuality / (opponentDefence * 0.68) : 2.0;

  let yourChanceVolume = clamp(
    0.08 + (creationRatio - 0.7) * 0.28 + (pressureRatio - 1.0) * 0.10,
    0.04,
    0.72,
  );
  let yourChanceQuality = clamp(
    0.16 + (finishingRatio - 0.6) * 0.26 + (pressureRatio - 1.0) * 0.08,
    0.08,
    0.78,
  );
  let yourGoalChance = clamp(yourChanceVolume * yourChanceQuality * 1.18, 0.02, 0.52);

  const theirPressureRatio = split.defenceScore > 0 ? opponentAttack / split.defenceScore : 2.0;
  let opponentChanceVolume = clamp(0.08 + (theirPressureRatio - 0.72) * 0.25, 0.04, 0.60);
  let opponentChanceQuality = clamp(0.17 + (theirPressureRatio - 0.72) * 0.18, 0.10, 0.62);
  let opponentGoalChance = clamp(opponentChanceVolume * opponentChanceQuality * 1.10, 0.02, 0.40);

  // 90th minute drama
  if (state.currentIncrement === 4) {
    yourChanceVolume *= 1.18;
    yourChanceQuality *= 1.08;
    yourGoalChance *= 1.3;
    opponentChanceVolume *= 1.15;
    opponentChanceQuality *= 1.05;
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
    yourChanceVolume,
    yourChanceQuality,
    yourGoalChance,
    opponentChanceVolume,
    opponentChanceQuality,
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
      const atkCount = state.attackerOrder.length;
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
    attackerOrder: [],
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
  const newAttackerOrder = state.attackerOrder.filter((id) => id !== xiCardId);

  return {
    ...state,
    xi: newXi,
    bench: newBench,
    attackerIds: new Set(newAttackerOrder),
    attackerOrder: newAttackerOrder,
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
