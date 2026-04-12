/**
 * Kickoff Clash — Data Bridge
 *
 * Transforms kc_characters.json → Card[] for the game engine.
 * 500 fictional characters with bios, tags, quirks.
 */

import type { Card, Durability } from './scoring';
import { seededRandom } from './scoring';

// ---------------------------------------------------------------------------
// Raw character type (from kc_characters.json)
// ---------------------------------------------------------------------------

export interface KCCharacter {
  name: string;
  nation: string;
  position: string;       // "Central Defender", "Keeper", etc.
  model: string;          // "Regista", "Shield", etc.
  primary: string;        // "Stopper", "Engine", etc.
  secondary: string;
  level: number;          // 71-95
  character: string;      // "Intelligent", "Mercurial", etc.
  physique: string;
  bio: string;
  tags: string[];
  strengths: string[];
  weaknesses: string[];
  quirk: string;
}

// ---------------------------------------------------------------------------
// Position mapping
// ---------------------------------------------------------------------------

const POSITION_MAP: Record<string, string> = {
  'Central Defender': 'CD',
  'Central Forward': 'CF',
  'Central Midfielder': 'CM',
  'Keeper': 'GK',
  'Wide Defender': 'WD',
  'Wide Forward': 'WF',
  'Wide Midfielder': 'WM',
};

// ---------------------------------------------------------------------------
// Model → Archetype mapping
// ---------------------------------------------------------------------------

const MODEL_TO_ARCHETYPE: Record<string, string> = {
  // Strikers
  Assassin: 'Striker', Attacker: 'Striker', Hitman: 'Striker',
  Poacher: 'Striker', Rifle: 'Striker', Sniper: 'Striker', Spearhead: 'Striker',
  // Creators
  Catalyst: 'Creator', Maestro: 'Creator', Magician: 'Creator',
  Trequartista: 'Creator', Wizard: 'Creator',
  // Engine
  'Box-To-Box': 'Engine', Driver: 'Engine', Dynamo: 'Engine',
  Fullback: 'Engine', Motor: 'Engine', Presser: 'Engine',
  Tornate: 'Engine', Wingback: 'Engine',
  // Destroyers
  Anchor: 'Destroyer', Destroyer: 'Destroyer', Enforcer: 'Destroyer',
  // Cover
  Bulwark: 'Cover', Cornerback: 'Cover', Rock: 'Cover',
  Sentinel: 'Cover', Sentry: 'Cover', Shield: 'Cover',
  // Controller
  Lynchpin: 'Controller', Metronome: 'Controller', Regista: 'Controller',
  // Commander
  General: 'Commander', Leader: 'Commander', Libero: 'Commander',
  // Passer
  Playmaker: 'Passer', Provider: 'Passer',
  // Sprinter
  Flash: 'Sprinter', Marauder: 'Sprinter', Outlet: 'Sprinter', Rocket: 'Sprinter',
  // Target
  Presence: 'Target', Target: 'Target', Tower: 'Target',
  // Powerhouse
  Bison: 'Powerhouse', Bulldozer: 'Powerhouse', Gladiator: 'Powerhouse',
  Juggernaut: 'Powerhouse', Titan: 'Powerhouse',
  // Dribbler
  Winger: 'Dribbler',
  // GK
  Cat: 'GK', 'Libero GK': 'GK', Shotstopper: 'GK', Wall: 'GK',
};

// ---------------------------------------------------------------------------
// Secondary → Archetype mapping (secondary uses role/archetype names, not model names)
// ---------------------------------------------------------------------------

const SECONDARY_TO_ARCHETYPE: Record<string, string> = {
  // Already archetype names — pass through
  Commander: 'Commander', Controller: 'Controller', Cover: 'Cover',
  Creator: 'Creator', Dribbler: 'Dribbler', Engine: 'Engine',
  Passer: 'Passer', Powerhouse: 'Powerhouse', Sprinter: 'Sprinter',
  Striker: 'Striker',
  // Role names → archetype
  Acrobat: 'GK', Aerial: 'Target', Distributor: 'Passer',
  Orthodox: 'GK', Stopper: 'Destroyer', Sweeper: 'Cover',
};

// ---------------------------------------------------------------------------
// Character → Personality Theme mapping
// ---------------------------------------------------------------------------

const CHARACTER_TO_THEME: Record<string, string> = {
  // Captain — leadership, heart
  Charismatic: 'Captain', Committed: 'Captain', Determined: 'Captain',
  ' Determined': 'Captain', // data has a leading space variant
  Influential: 'Captain', Passionate: 'Captain', Reliable: 'Captain',
  Resolute: 'Captain', Talismanic: 'Captain',
  // Catalyst — flair, chaos energy
  Aggressive: 'Catalyst', Antagonistic: 'Catalyst', Combative: 'Catalyst',
  Eccentric: 'Catalyst', Energetic: 'Catalyst', Flamboyant: 'Catalyst',
  Mercurial: 'Catalyst', Unpredictable: 'Catalyst',
  // Maestro — technical elegance
  Classy: 'Maestro', Composed: 'Maestro', Crafty: 'Maestro',
  Creative: 'Maestro', Elegant: 'Maestro', Laidback: 'Maestro',
  // Professor — intelligence, reading the game
  Focused: 'Professor', Icy: 'Professor', Intelligent: 'Professor',
  'No-Nonsense': 'Professor',
  // General — work, physicality
  'Box-to-Box': 'General', Competitive: 'General', 'Hard-Tackling': 'General',
  Industrious: 'General', Physical: 'General', Relentless: 'General',
  Tenacious: 'General', Tireless: 'General',
};

// ---------------------------------------------------------------------------
// Personality Type codes (4-letter: A/I + N/X + S/L + C/P)
// ---------------------------------------------------------------------------

function derivePersonalityType(name: string, theme: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  const first = hash % 2 === 0 ? 'A' : 'I';
  const second = (hash >> 2) % 2 === 0 ? 'N' : 'X';

  // Theme influences 3rd/4th letter
  let third: string, fourth: string;
  switch (theme) {
    case 'Captain':    third = 'L'; fourth = 'C'; break;
    case 'Catalyst':   third = (hash >> 4) % 2 === 0 ? 'L' : 'S'; fourth = 'C'; break;
    case 'Maestro':    third = 'S'; fourth = 'P'; break;
    case 'Professor':  third = (hash >> 4) % 2 === 0 ? 'S' : 'L'; fourth = 'P'; break;
    default:           third = (hash >> 4) % 2 === 0 ? 'S' : 'L'; fourth = (hash >> 6) % 2 === 0 ? 'C' : 'P'; break;
  }

  return `${first}${second}${third}${fourth}`;
}

// ---------------------------------------------------------------------------
// Rarity from level
// ---------------------------------------------------------------------------

function levelToRarity(level: number): string {
  if (level >= 89) return 'Legendary';
  if (level >= 83) return 'Epic';
  if (level >= 77) return 'Rare';
  return 'Common';
}

// ---------------------------------------------------------------------------
// Durability — seeded random per rarity tier
// ---------------------------------------------------------------------------

const DURABILITY_BY_RARITY: Record<string, { options: Durability[]; weights: number[] }> = {
  Common:    { options: ['standard', 'iron', 'fragile'],            weights: [0.55, 0.30, 0.15] },
  Rare:      { options: ['standard', 'iron', 'fragile', 'phoenix'], weights: [0.40, 0.25, 0.20, 0.15] },
  Epic:      { options: ['iron', 'standard', 'glass', 'phoenix'],   weights: [0.35, 0.30, 0.20, 0.15] },
  Legendary: { options: ['glass', 'titanium', 'phoenix', 'iron'],   weights: [0.35, 0.25, 0.25, 0.15] },
};

function rollDurability(rarity: string, seed: number): Durability {
  const tier = DURABILITY_BY_RARITY[rarity] ?? DURABILITY_BY_RARITY.Common;
  const roll = seededRandom(seed);
  let cumulative = 0;
  for (let i = 0; i < tier.options.length; i++) {
    cumulative += tier.weights[i];
    if (roll < cumulative) return tier.options[i];
  }
  return tier.options[0];
}

// ---------------------------------------------------------------------------
// Gate pull from archetype
// ---------------------------------------------------------------------------

const GATE_PULL_MAP: Record<string, number> = {
  Dribbler: 30, Creator: 25, Striker: 20, Sprinter: 15,
  Engine: 5, Target: 10, Powerhouse: 10, Passer: 5,
  Cover: 0, Destroyer: 0, Controller: 0, Commander: 0, GK: 0,
};

// Personality theme bonus fans
const THEME_FAN_BONUS: Record<string, number> = {
  Catalyst: 40, Maestro: 20, Captain: 10, Professor: 0, General: 5,
};

function gatePullFor(archetype: string, theme: string): number {
  return (GATE_PULL_MAP[archetype] ?? 0) + (THEME_FAN_BONUS[theme] ?? 0);
}

// ---------------------------------------------------------------------------
// Transform a single character → Card
// ---------------------------------------------------------------------------

export function transformCharacter(char: KCCharacter, index: number): Card {
  const position = POSITION_MAP[char.position] ?? 'CM';
  const archetype = MODEL_TO_ARCHETYPE[char.model] ?? 'Engine';
  const theme = CHARACTER_TO_THEME[char.character?.trim()] ?? 'General';
  const personalityType = derivePersonalityType(char.name, theme);
  const rarity = levelToRarity(char.level);
  const durability = rollDurability(rarity, index * 7919 + char.level * 31);
  const gatePull = gatePullFor(archetype, theme);

  return {
    id: index + 1,
    name: char.name,
    position,
    archetype,
    secondaryArchetype: SECONDARY_TO_ARCHETYPE[char.secondary] ?? MODEL_TO_ARCHETYPE[char.secondary] ?? undefined,
    tacticalRole: char.primary,
    personalityType,
    personalityTheme: theme,
    power: char.level,
    rarity,
    gatePull,
    durability,
    // Extended fields
    bio: char.bio,
    tags: char.tags,
    quirk: char.quirk,
    strengths: char.strengths,
    weaknesses: char.weaknesses,
    nation: char.nation,
  };
}

// ---------------------------------------------------------------------------
// Transform all characters
// ---------------------------------------------------------------------------

export function transformAllCharacters(characters: KCCharacter[]): Card[] {
  return characters.map((char, i) => transformCharacter(char, i));
}
