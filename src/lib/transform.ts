/**
 * Kickoff Clash — Data Bridge
 *
 * LIVE source (data port, V3.1 Chief Scout): kc_cards.json → Card[] via transformCards()
 * / transformCard(). 540 fictional cards carrying skillset, role, BRS-as-power, 4 pillars,
 * nickname and personality theme, generated from the real distributions (scripts/generate-cards.ts).
 *
 * LEGACY source (retained, no live callers): the kc_characters.json path below
 * (KCCharacter / transformAllCharacters) — the original 500 fictional characters with
 * bios/tags/quirks. Kept for reference; the engine no longer reads it.
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
// Model → tacticalRole mapping
// ---------------------------------------------------------------------------

// The engine's tactical-role vocabulary lives in getChanceProfile / chemistry
// ROLE_COMBOS / ROLE_TRANSFORMS. The data's `model` field is the role identity;
// map it onto that vocabulary. (Previously `tacticalRole` was fed `char.primary`,
// an archetype tag, so no role logic ever fired.) A few identities depend on
// where the card plays — see deriveTacticalRole. Tune in the authoring pass (CARDS §6).
const MODEL_TO_ROLE: Record<string, string> = {
  // Midfield
  Regista: 'Regista', Metronome: 'Regista', Lynchpin: 'Metodista',
  Driver: 'Mezzala', 'Box-To-Box': 'Tuttocampista', Dynamo: 'Tuttocampista',
  Motor: 'Relayeur', Presser: 'Volante',
  // Creators / attacking mid
  Playmaker: 'Enganche', Provider: 'Enganche', Maestro: 'Fantasista',
  Magician: 'Fantasista', Catalyst: 'Trequartista',
  // Wide
  Winger: 'Winger', Wizard: 'Inverted Winger', // inside-forward identity (wide dribbler, cuts in)
  Fullback: 'Lateral', Wingback: 'Lateral', Cornerback: 'Lateral',
  Tornate: 'Tornante', Outlet: 'Extremo', Flash: 'Extremo', Rocket: 'Extremo', Marauder: 'Extremo',
  // Strikers
  Poacher: 'Poacher', Hitman: 'Poacher', Assassin: 'Poacher', Sniper: 'Poacher',
  Rifle: 'Poacher', Attacker: 'Poacher',
  Spearhead: 'Prima Punta', Target: 'Prima Punta', Tower: 'Prima Punta', Presence: 'Prima Punta',
  // Defenders
  Anchor: 'Anchor', Libero: 'Libero', Shield: 'Sweeper', Sentinel: 'Sweeper', Sentry: 'Sweeper',
  Bulwark: 'Zagueiro', Rock: 'Zagueiro',
  // Goalkeepers
  Shotstopper: 'Torwart', Wall: 'Torwart', Cat: 'Sweeper Keeper', 'Libero GK': 'Ball-Playing GK',
};

/**
 * Resolve a card's tactical role from its data `model` and mapped position.
 * Position-aware identities are flagged — they are the natural homes for the
 * step-1 ROLE_TRANSFORMS and are the first dial to turn in authoring.
 */
function deriveTacticalRole(model: string, position: string): string | undefined {
  if (model === 'Trequartista') return position === 'CF' ? 'Falso Nove' : 'Trequartista';
  if (model === 'Destroyer') return position === 'CM' ? 'Volante' : 'Stopper';
  if (model === 'Enforcer') return position === 'CD' ? 'Stopper' : 'Volante';
  if (['Titan', 'Bison', 'Bulldozer', 'Juggernaut', 'Gladiator'].includes(model)) {
    return position === 'CF' ? 'Prima Punta' : 'Stopper';
  }
  // Leader / General carry no distinct tactical role (commander/personality flavour).
  return MODEL_TO_ROLE[model];
}

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
// Power from level — decompress the 71–95 source band to 50–99 (MATCH_ENGINE_V5
// §11.2 / Phase 3 Foundation). The raw levels are bunched in a 24-point band, which
// flattened deck-strength differences (adjacent decks resolved near-identically, so
// drafting barely registered). Spreading to a 49-point band re-opens the curve so a
// stronger XI is meaningfully stronger. Opponent ROUND_POWER is recalibrated to match.
// ---------------------------------------------------------------------------

const LEVEL_MIN = 71;
const LEVEL_MAX = 95;
const POWER_MIN = 50;
const POWER_MAX = 99;

export function levelToPower(level: number): number {
  const t = Math.max(0, Math.min(1, (level - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN)));
  return Math.round(POWER_MIN + t * (POWER_MAX - POWER_MIN));
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
    tacticalRole: deriveTacticalRole(char.model, position),
    personalityType,
    personalityTheme: theme,
    power: levelToPower(char.level),
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

// ---------------------------------------------------------------------------
// V3.1 card pool (Chief Scout data port) — kc_cards.json → Card[]
// ---------------------------------------------------------------------------
//
// The generated fictional pool already carries the canonical stack: Skillset (the 13,
// == the game's `archetype`), Role (best_role), the evocative Archetype `nickname`, BRS
// (== power directly, no decompression), and the 4-pillar block. Position codes match.

export interface KCCard {
  name: string;
  position: string;            // GK/CD/WD/DM/CM/AM/WM/WF/CF (already the game's codes)
  skillset: string;            // one of the 13 Skillsets
  secondarySkillset?: string;
  role: string;                // canonical Role (best_role)
  nickname: string;            // cross-role Archetype identity
  brs: number;                 // 50–99, the sanctioned power/rarity metric
  rarity: string;
  pillars: { technical: number; tactical: number; mental: number; physical: number };
  theme: string;               // personality theme (5-theme chemistry layer)
  nation: string;
}

export function transformCard(raw: KCCard, index: number): Card {
  // Keepers use the game's "GK" archetype convention; their Skillset is Shotstopper.
  const archetype = raw.skillset === 'Shotstopper' ? 'GK' : raw.skillset;
  return {
    id: index + 1,
    name: raw.name,
    position: raw.position,
    archetype,
    secondaryArchetype: raw.secondarySkillset,
    tacticalRole: raw.role,
    personalityType: derivePersonalityType(raw.name, raw.theme),
    personalityTheme: raw.theme,
    power: raw.brs,                              // BRS is the power scale — no levelToPower
    rarity: raw.rarity,
    gatePull: gatePullFor(archetype, raw.theme),
    durability: rollDurability(raw.rarity, index * 7919 + raw.brs * 31),
    nickname: raw.nickname,
    pillars: raw.pillars,
    nation: raw.nation,
    // Owned cards start fresh (6/6). Surfaces the fitness meter on the card/gallery
    // immediately; engine-neutral (fitnessOf already treated undefined as 6).
    fitness: 6,
  };
}

export function transformCards(cards: KCCard[]): Card[] {
  return cards.map((c, i) => transformCard(c, i));
}
