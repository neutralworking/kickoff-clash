/**
 * Kickoff Clash — Squad transforms (engine v1, step 3)
 *
 * Tactical cards and the Manager were flat attack bonuses bolted onto the score
 * (match-v5 `compute` / `applyJoker`). DESIGN §2 says they must be the *same kind
 * of thing* as a player trait or an archetype identity: a record over the closed
 * verb palette (verbs.ts). This module is their authoring layer.
 *
 * Each producer takes the squad context and returns `TraitRecord[]`. Squad-level
 * gating (archetype counts, rarity, "is winning", per-increment ramps) is resolved
 * here, in the producer — the records themselves only use palette verbs, and the
 * dispatcher applies them squad-wide via a synthetic source owner (verbs.ts).
 *
 * Two deliberate divergences from the legacy numbers (DESIGN §7 — tuning-deferred):
 *   - The defensive denies (Low Block / Sit Deep / Fortress) were stubbed to 0 in
 *     match-v5; now that the palette has `deny`, they suppress the opponent for real.
 *   - Flat point bonuses are re-cast as percentages, the redesign's native unit
 *     (cf. the §9 examples — Regista +5%, Anchor +30%). Magnitudes are dials.
 *
 * The legacy `compute`/`applyJoker` functions are kept (hand.ts still scores through
 * them); this module is the match-v5 path.
 */

import type { Card } from './scoring';
import type { TacticCard, TacticSlots } from './tactics';
import type { JokerCard } from './jokers';
import type { Connection } from './chemistry';
import type { TraitRecord, ZoneName } from './verbs';

export interface SquadContext {
  xi: Card[];
  increment: number;      // 0–4
  opponentGoals: number;  // for "after conceding" style conditions
  connections: Connection[];
}

// ---------------------------------------------------------------------------
// Record builders (every squad effect is one of these palette verbs)
// ---------------------------------------------------------------------------

/** Scale an emission kind across the whole field (+/-). */
function ampZone(name: string, amount: number, zone: ZoneName): TraitRecord {
  return { name, verb: 'amplify', params: { amount }, scope: 'global', target: { kind: 'zone', zone } };
}

/** Scale every card of an archetype (all the kinds it emits). */
function ampArchetype(name: string, amount: number, archetype: string): TraitRecord {
  return { name, verb: 'amplify', params: { amount }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype } };
}

/** Suppress the opponent's conversion (capped downstream in resolveIncrement). */
function denyOpponent(name: string, amount: number): TraitRecord {
  return { name, verb: 'deny', params: { amount }, scope: 'zone', target: { kind: 'zone', zone: 'attack' } };
}

// A "power lift" touches the score and the chance mix together.
function powerLift(name: string, amount: number): TraitRecord[] {
  return [ampZone(name, amount, 'attack'), ampZone(name, amount, 'creation'), ampZone(name, amount, 'finishing')];
}

// ---------------------------------------------------------------------------
// Tactics — all 12
// ---------------------------------------------------------------------------

export function tacticTraits(tactic: TacticCard, ctx: SquadContext): TraitRecord[] {
  const n = tactic.name;
  const inc = ctx.increment;

  switch (tactic.id) {
    // ---- attacking ----
    case 'high_line':
      // +15% power up top (the opponent-gains-too downside was never coded).
      return powerLift(n, 0.15);
    case 'press_high':
      // The pressers (Engine / Destroyer) get +20%.
      return [ampArchetype(n, 0.20, 'Engine'), ampArchetype(n, 0.20, 'Destroyer')];
    case 'wing_play':
      // Reward the wide threats (pace + dribbling).
      return [ampArchetype(n, 0.10, 'Dribbler'), ampArchetype(n, 0.10, 'Sprinter')];
    case 'narrow':
      // Reward the central combiners.
      return [ampArchetype(n, 0.10, 'Controller'), ampArchetype(n, 0.10, 'Passer')];

    // ---- defensive (now wired through `deny`) ----
    case 'low_block':
      return [denyOpponent(n, 0.20), ampZone(n, -0.10, 'attack')];
    case 'sit_deep':
      // -15% opponent; your attack bleeds a compounding 5% per increment.
      return [denyOpponent(n, 0.15), ampZone(n, -0.05 * (inc + 1), 'attack')];
    case 'fortress': {
      // -25% opponent early, fading to nothing by 90'.
      const ramp = [0.25, 0.20, 0.15, 0.05, 0];
      const amount = ramp[Math.min(inc, ramp.length - 1)] ?? 0;
      return amount > 0 ? [denyOpponent(n, amount)] : [];
    }

    // ---- specialist ----
    case 'counter_attack':
      // Springs only once they've scored (the card's "after opponent scores").
      return ctx.opponentGoals > 0 ? [ampZone(n, 0.05, 'attack'), ampZone(n, 0.05, 'finishing')] : [];
    case 'possession':
      // Compounds as the game settles: +5% attack + creation per increment.
      return [ampZone(n, 0.05 * (inc + 1), 'attack'), ampZone(n, 0.05 * (inc + 1), 'creation')];
    case 'set_piece':
      // Aerial threats sharpen in front of goal.
      return [ampArchetype(n, 0.15, 'Target'), ampArchetype(n, 0.15, 'Commander')];
    case 'dark_arts':
      // A small edge to you and a nibble off them (the red-card risk is UI-side).
      return [ampZone(n, 0.04, 'attack'), denyOpponent(n, 0.10)];
    case 'youth_policy': {
      const commons = ctx.xi.filter((c) => c.rarity === 'Common').length;
      return commons > 0 ? [ampZone(n, Math.min(0.20, commons * 0.03), 'attack')] : [];
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Manager (jokers) — all 8
// ---------------------------------------------------------------------------

export function managerTraits(joker: JokerCard, ctx: SquadContext): TraitRecord[] {
  const n = joker.name;

  switch (joker.id) {
    case 'the_dinosaur':
      return [ampArchetype(n, 0.18, 'Target'), ampArchetype(n, 0.18, 'Powerhouse')];
    case 'the_professor':
      return [ampArchetype(n, 0.15, 'Controller'), ampArchetype(n, 0.15, 'Passer')];
    case 'the_mourinho':
      return [ampArchetype(n, 0.20, 'Destroyer'), ampArchetype(n, 0.20, 'Cover')];
    case 'the_gambler': {
      // High-variance cards (glass / phoenix) get a power lift.
      const n2 = ctx.xi.filter((c) => c.durability === 'glass' || c.durability === 'phoenix').length;
      return n2 > 0 ? powerLift(n, Math.min(0.20, n2 * 0.03)) : [];
    }
    case 'youth_developer': {
      const commons = ctx.xi.filter((c) => c.rarity === 'Common').length;
      return commons > 0 ? [ampZone(n, Math.min(0.20, commons * 0.03), 'attack')] : [];
    }
    case 'hairdryer':
      // A captain in the room lifts the whole side, both ends.
      return ctx.xi.some((c) => c.personalityTheme === 'Captain')
        ? [ampZone(n, 0.10, 'attack'), ampZone(n, 0.10, 'defence')]
        : [];
    case 'chemistry_set': {
      // Rewards a densely-connected XI (capped so it can't run away).
      const c = ctx.connections.length;
      return c > 0 ? [ampZone(n, Math.min(0.30, c * 0.02), 'attack')] : [];
    }
    case 'scouts_eye':
    default:
      return []; // +1 discard is a non-field effect (getExtraDiscards handles it)
  }
}

// ---------------------------------------------------------------------------
// Combined squad records for a side
// ---------------------------------------------------------------------------

export function squadTraits(
  tacticSlots: TacticSlots,
  jokers: JokerCard[],
  ctx: SquadContext,
): TraitRecord[] {
  const records: TraitRecord[] = [];
  for (const slot of tacticSlots.slots) {
    if (slot) records.push(...tacticTraits(slot, ctx));
  }
  for (const joker of jokers) {
    records.push(...managerTraits(joker, ctx));
  }
  return records;
}
