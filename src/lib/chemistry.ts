/**
 * Kickoff Clash — Chemistry / Synergy System (v2)
 *
 * Finds connections between cards in a lineup across four tiers.
 * Unchanged from v1 except: Card type now imported from scoring.ts (includes durability).
 */

import type { Card, SlottedCard } from './scoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Connection {
  name: string;
  tier: number; // 1-4
  cards: string[]; // card names involved
  bonus: number; // flat points added to score
  key: string; // unique synergy key for Chemistry Book
}

// ---------------------------------------------------------------------------
// Constants — Archetype Pair Names (Tier 1)
// ---------------------------------------------------------------------------

export const ARCHETYPE_PAIR_NAMES: Record<string, string> = {
  Engine: "Pressing Trap",
  Destroyer: "Brick Wall",
  Creator: "Creative Spark",
  Cover: "Fortress",
  Passer: "Passing Carousel",
  Sprinter: "Lightning Strike",
  Striker: "Double Trouble",
  Dribbler: "Skill Show",
  Target: "Aerial Dominance",
  Powerhouse: "Muscle Memory",
  Controller: "Puppet Masters",
  Commander: "Chain of Command",
  GK: "Glove Affair",
};

// ---------------------------------------------------------------------------
// Constants — Role Combos (Tier 2)
// ---------------------------------------------------------------------------

export const ROLE_COMBOS: {
  name: string;
  role1: string;
  role2: string;
  multiplier: number;
}[] = [
  { name: "The Pirlo-Barella", role1: "Regista", role2: "Mezzala", multiplier: 1.3 },
  { name: "Shield & Sword", role1: "Anchor", role2: "Trequartista", multiplier: 1.3 },
  { name: "Overlap", role1: "Lateral", role2: "Inverted Winger", multiplier: 1.2 },
  { name: "The Guardiola", role1: "Falso Nove", role2: "Winger", multiplier: 1.2 },
  { name: "The Double Pivot", role1: "Anchor", role2: "Volante", multiplier: 1.2 },
  { name: "Counter Punch", role1: "Volante", role2: "Extremo", multiplier: 1.2 },
  { name: "Total Control", role1: "Metodista", role2: "Regista", multiplier: 1.3 },
  { name: "The Wall", role1: "Stopper", role2: "Zagueiro", multiplier: 1.2 },
  { name: "Wing Play", role1: "Lateral", role2: "Winger", multiplier: 1.2 },
  { name: "Inside Out", role1: "Invertido", role2: "Fantasista", multiplier: 1.2 },
  { name: "The Link", role1: "Enganche", role2: "Poacher", multiplier: 1.3 },
  { name: "Space Creation", role1: "Inverted Winger", role2: "Falso Nove", multiplier: 1.2 },
  { name: "Engine Room", role1: "Tuttocampista", role2: "Relayeur", multiplier: 1.2 },
  { name: "The Provider", role1: "Libero", role2: "Prima Punta", multiplier: 1.2 },
  { name: "Last Line", role1: "Torwart", role2: "Sweeper", multiplier: 1.2 },
  { name: "Modern GK", role1: "Ball-Playing GK", role2: "Libero", multiplier: 1.2 },
  { name: "Wide Overload", role1: "Fluidificante", role2: "Tornante", multiplier: 1.2 },
  { name: "Second Wave", role1: "Mezzala", role2: "Seconda Punta", multiplier: 1.2 },
  { name: "Creative Hub", role1: "Fantasista", role2: "Trequartista", multiplier: 1.3 },
  { name: "The Destroyer Duo", role1: "Volante", role2: "Stopper", multiplier: 1.2 },
];

// ---------------------------------------------------------------------------
// Personality theme constants (Tier 3)
// ---------------------------------------------------------------------------

export const PERSONALITY_THEMES = ["General", "Catalyst", "Maestro", "Captain", "Professor"] as const;
type PersonalityTheme = (typeof PERSONALITY_THEMES)[number];

interface ThemeResonance {
  name: string;
  key: string;
  /** Returns bonus points given total lineup power and a deterministic seed. */
  computeBonus: (lineupPower: number, seed: number) => number;
}

export type { PersonalityTheme };

export const THEME_RESONANCES: Record<PersonalityTheme, ThemeResonance> = {
  General: {
    name: "Chain of Command",
    key: "t3_general",
    computeBonus: (lp) => Math.round(lp * 0.1),
  },
  Catalyst: {
    name: "Chaos Factor",
    key: "t3_catalyst",
    computeBonus: (lp, seed) => {
      const rand = Math.abs(Math.sin(seed * 9301 + 49297) % 1);
      const factor = -0.2 + rand * 0.6;
      return Math.round(lp * factor);
    },
  },
  Maestro: {
    name: "Silk",
    key: "t3_maestro",
    computeBonus: (lp) => Math.round(lp * 0.15),
  },
  Captain: {
    name: "Siege Mentality",
    key: "t3_captain",
    computeBonus: (lp) => Math.round(lp * 0.2),
  },
  Professor: {
    name: "System Player",
    key: "t3_professor",
    computeBonus: (lp) => Math.round(lp * 0.12),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function lineupPower(cards: SlottedCard[]): number {
  return cards.reduce((sum, sc) => sum + sc.card.power, 0);
}

// ---------------------------------------------------------------------------
// Tier 1 — Archetype Pairs
// ---------------------------------------------------------------------------

export function findArchetypePairs(cards: SlottedCard[]): Connection[] {
  const connections: Connection[] = [];
  const groups = new Map<string, SlottedCard[]>();
  for (const sc of cards) {
    const arch = sc.card.archetype;
    if (!arch) continue;
    const list = groups.get(arch) || [];
    list.push(sc);
    groups.set(arch, list);
  }

  for (const [archetype, group] of groups) {
    if (group.length < 2) continue;
    const combinedPower = group.reduce((s, sc) => s + sc.card.power, 0);
    const cardNames = group.map((sc) => sc.card.name);

    if (group.length >= 3) {
      const bonus = Math.round(combinedPower * 0.25);
      connections.push({
        name: `The ${archetype} Room`,
        tier: 1,
        cards: cardNames,
        bonus,
        key: `t1_${slugify(archetype)}_trio`,
      });
    } else {
      const bonus = Math.round(combinedPower * 0.15);
      const pairName = ARCHETYPE_PAIR_NAMES[archetype] || `${archetype} Duo`;
      connections.push({
        name: pairName,
        tier: 1,
        cards: cardNames,
        bonus,
        key: `t1_${slugify(archetype)}_duo`,
      });
    }
  }

  return connections;
}

// ---------------------------------------------------------------------------
// Tier 2 — Role Combos
// ---------------------------------------------------------------------------

export function findRoleCombos(cards: SlottedCard[]): Connection[] {
  const connections: Connection[] = [];
  const roleMap = new Map<string, SlottedCard[]>();
  for (const sc of cards) {
    const role = sc.card.tacticalRole;
    if (!role) continue;
    const list = roleMap.get(role) || [];
    list.push(sc);
    roleMap.set(role, list);
  }

  for (const combo of ROLE_COMBOS) {
    const group1 = roleMap.get(combo.role1);
    const group2 = roleMap.get(combo.role2);
    if (!group1 || !group2) continue;

    for (const sc1 of group1) {
      for (const sc2 of group2) {
        if (sc1.card.id === sc2.card.id) continue;
        const sumPower = sc1.card.power + sc2.card.power;
        const bonus = Math.round(sumPower * (combo.multiplier - 1));
        connections.push({
          name: combo.name,
          tier: 2,
          cards: [sc1.card.name, sc2.card.name],
          bonus,
          key: `t2_${slugify(combo.name)}`,
        });
      }
    }
  }

  return connections;
}

// ---------------------------------------------------------------------------
// Tier 3 — Personality Resonance
// ---------------------------------------------------------------------------

function findPersonalityResonance(cards: SlottedCard[]): Connection[] {
  const connections: Connection[] = [];
  const totalPower = lineupPower(cards);
  const themeCounts = new Map<string, SlottedCard[]>();
  for (const sc of cards) {
    const theme = sc.card.personalityTheme;
    if (!theme) continue;
    const list = themeCounts.get(theme) || [];
    list.push(sc);
    themeCounts.set(theme, list);
  }

  for (const theme of PERSONALITY_THEMES) {
    const group = themeCounts.get(theme);
    if (!group || group.length < 3) continue;
    const resonance = THEME_RESONANCES[theme];
    const seed = group.reduce((s, sc) => s + sc.card.id, 0);
    const bonus = resonance.computeBonus(totalPower, seed);
    connections.push({
      name: resonance.name,
      tier: 3,
      cards: group.map((sc) => sc.card.name),
      bonus,
      key: resonance.key,
    });
  }

  return connections;
}

// ---------------------------------------------------------------------------
// Tier 4 — The Perfect Dressing Room
// ---------------------------------------------------------------------------

function findPerfectDressingRoom(cards: SlottedCard[]): Connection[] {
  const themes = new Set<string>();
  for (const sc of cards) {
    if (sc.card.personalityTheme) themes.add(sc.card.personalityTheme);
  }
  const hasAll = PERSONALITY_THEMES.every((t) => themes.has(t));
  if (!hasAll) return [];

  const totalPower = lineupPower(cards);
  return [
    {
      name: "The Perfect Dressing Room",
      tier: 4,
      cards: cards.map((sc) => sc.card.name),
      bonus: totalPower,
      key: "t4_perfect_dressing_room",
    },
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scans a lineup for all chemistry connections across four tiers.
 */
export function findConnections(cards: SlottedCard[], _round?: number): Connection[] {
  if (!cards || cards.length === 0) return [];

  const connections: Connection[] = [
    ...findArchetypePairs(cards),
    ...findRoleCombos(cards),
    ...findPersonalityResonance(cards),
    ...findPerfectDressingRoom(cards),
  ];

  connections.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.bonus - a.bonus;
  });

  return connections;
}

// ---------------------------------------------------------------------------
// Cross Synergy Types (v5)
// ---------------------------------------------------------------------------

export interface CrossSynergy extends Connection {
  attackBonus: number;  // points added to attack score
  defenceBonus: number; // points added to defence score
}

interface CrossSynergyDef {
  name: string;
  key: string;
  defenceArchetype: string | string[]; // archetype(s) required in defence
  attackArchetype: string | null;       // archetype required in attack (null = any)
  defenderBonusPct: number;
  attackerBonusPct: number;
}

const CROSS_SYNERGY_DEFS: CrossSynergyDef[] = [
  {
    name: 'Counter Punch',
    key: 'cross_counter_punch',
    defenceArchetype: 'Destroyer',
    attackArchetype: 'Sprinter',
    defenderBonusPct: 0,
    attackerBonusPct: 0.25,
  },
  {
    name: 'The Link',
    key: 'cross_the_link',
    defenceArchetype: ['Creator', 'Passer'],
    attackArchetype: 'Striker',
    defenderBonusPct: 0,
    attackerBonusPct: 0.20,
  },
  {
    name: 'Pressing Trap',
    key: 'cross_pressing_trap',
    defenceArchetype: 'Engine',
    attackArchetype: 'Engine',
    defenderBonusPct: 0.15,
    attackerBonusPct: 0.15,
  },
  {
    name: 'Shield & Sword',
    key: 'cross_shield_sword',
    defenceArchetype: 'Cover',
    attackArchetype: null, // any attacker
    defenderBonusPct: 0.15,
    attackerBonusPct: 0.10,
  },
];

function findCrossSynergies(
  attackers: SlottedCard[],
  defenders: SlottedCard[],
): CrossSynergy[] {
  const synergies: CrossSynergy[] = [];

  for (const def of CROSS_SYNERGY_DEFS) {
    const defArchetypes = Array.isArray(def.defenceArchetype)
      ? def.defenceArchetype
      : [def.defenceArchetype];

    const matchingDefenders = defenders.filter(
      (sc) => defArchetypes.includes(sc.card.archetype),
    );
    if (matchingDefenders.length === 0) continue;

    const matchingAttackers = def.attackArchetype === null
      ? attackers
      : attackers.filter((sc) => sc.card.archetype === def.attackArchetype);
    if (matchingAttackers.length === 0) continue;

    // Take first matching pair
    const defender = matchingDefenders[0];
    const attacker = matchingAttackers[0];

    const attackBonus = Math.round(attacker.card.power * def.attackerBonusPct);
    const defenceBonus = Math.round(defender.card.power * def.defenderBonusPct);

    synergies.push({
      name: def.name,
      tier: 1,
      cards: [defender.card.name, attacker.card.name],
      bonus: attackBonus + defenceBonus,
      key: def.key,
      attackBonus,
      defenceBonus,
    });
  }

  return synergies;
}

// ---------------------------------------------------------------------------
// Positional Connections (v5)
// ---------------------------------------------------------------------------

/**
 * Detects synergies based on attack/defence card assignment.
 * Attack synergies fire when all participants are attacking.
 * Defence synergies fire when all participants are defending.
 * Cross synergies fire when participants are split across sides.
 */
export function findPositionalConnections(
  attackers: SlottedCard[],
  defenders: SlottedCard[],
  _round?: number,
): {
  attackSynergies: Connection[];
  defenceSynergies: Connection[];
  crossSynergies: CrossSynergy[];
} {
  return {
    attackSynergies: [
      ...findArchetypePairs(attackers),
      ...findRoleCombos(attackers),
    ],
    defenceSynergies: [
      ...findArchetypePairs(defenders),
      ...findRoleCombos(defenders),
    ],
    crossSynergies: findCrossSynergies(attackers, defenders),
  };
}

// Re-export Card/SlottedCard for backward compatibility
export type { Card, SlottedCard };
