/**
 * Kickoff Clash — Squad transforms (engine v1, step 3; Called Plays rework)
 *
 * Tactic cards are now per-spell CALLED PLAYS (tactics.ts): the one play the
 * player calls this spell is authored here as TraitRecords over the closed verb
 * palette (verbs.ts) and joins the Manager + intent records on the squad source
 * for THIS spell only. Squad-level gating (archetype counts, the opponent's
 * telegraphed play, the scoreline, per-increment gates) is resolved here, in the
 * producer — the records themselves only use palette verbs.
 *
 * Magnitudes are the rework's starting bands, sized toward the "a clean
 * counter-call swings ~±0.35 xG per spell" contract; a later balance pass tunes.
 *
 * Targeting note (reported deviation): the `deny` verb is a flat conversion
 * suppression — there is no per-card denial, and enemy-targeted `amplify`
 * records are a no-op against the zero-emit opponent shadows the dispatcher
 * sees. Man-Marking therefore uses a stronger flat deny + own-defence amp
 * instead of a star-targeted deny. Enemy-targeted STATE effects (drain-fitness)
 * DO work through the shadows — Dark Arts drains the opponent's best player.
 */

import type { Card } from './scoring';
import type { TacticCard } from './tactics';
import type { JokerCard } from './jokers';
import type { Connection } from './chemistry';
import type { TraitRecord, ZoneName } from './verbs';
import type { TeamIntent } from './run';
import type { Band, Lane } from './field';
import { LANES } from './field';
import { getOpponentPlayById } from './opponent';
import { attackLanes, isAttackingPlay } from './plays';

export interface SquadContext {
  xi: Card[];
  increment: number;      // 0–4
  opponentGoals: number;  // for "after conceding" style conditions
  yourGoals: number;      // for "trailing" gates (Counter Attack)
  connections: Connection[];
  intent?: TeamIntent;    // pre-match attacking/balanced/defensive lean (§ intent)
  /** The opponent's play this spell (the telegraph) — producer-level gating. */
  opponentPlayId?: string;
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

/** Manufacture attacking threat down ONE flank (a lane overload) — `generate` deposits
 *  into the explicit destination cell, so a squad-source record can stack a single lane.
 *  Attack lands up top in the lane; the build-up creation feeds it from midfield. */
function overloadLane(name: string, lane: 'L' | 'R', attack: number, creation: number): TraitRecord[] {
  return [
    { name, verb: 'generate', params: { amount: attack }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, to: { band: 'ATT', lane } },
    { name, verb: 'generate', params: { amount: creation }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane } },
  ];
}

/** Drain fitness from every card of an archetype on the OWN side (the press cost). */
function drainArchetype(name: string, amount: number, archetype: string): TraitRecord {
  return { name, verb: 'drain-fitness', params: { amount }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype } };
}

// A "power lift" touches the score and the chance mix together.
function powerLift(name: string, amount: number): TraitRecord[] {
  return [ampZone(name, amount, 'attack'), ampZone(name, amount, 'creation'), ampZone(name, amount, 'finishing')];
}

/** Is the opponent's telegraphed play an attacking commitment? (Data-driven.) */
function opponentIsAttacking(ctx: SquadContext): boolean {
  const play = ctx.opponentPlayId ? getOpponentPlayById(ctx.opponentPlayId) : undefined;
  return play ? isAttackingPlay(play.records) : false;
}

// ---------------------------------------------------------------------------
// Called plays — all 16 (per-spell records)
// ---------------------------------------------------------------------------

export function tacticTraits(tactic: TacticCard, ctx: SquadContext): TraitRecord[] {
  const n = tactic.name;

  switch (tactic.id) {
    // ---- attacking ----
    case 'high_line':
      // Commit forward: attack + creation up, your own back line thins.
      return [ampZone(n, 0.15, 'attack'), ampZone(n, 0.15, 'creation'), ampZone(n, -0.10, 'defence')];
    case 'press_high':
      // Suppress their conversion; the pressers (Engine/Destroyer) lift but tire.
      return [
        denyOpponent(n, 0.15),
        ampArchetype(n, 0.20, 'Engine'), ampArchetype(n, 0.20, 'Destroyer'),
        drainArchetype(n, 0.5, 'Engine'), drainArchetype(n, 0.5, 'Destroyer'),
      ];
    case 'wing_play':
      // Threat down BOTH wings (a squad source cannot relocate — it has no
      // emission of its own — so the wide shift is manufactured with generate).
      return [
        { name: n, verb: 'generate', params: { amount: 22 }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, to: { band: 'ATT', lane: 'L' } },
        { name: n, verb: 'generate', params: { amount: 22 }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, to: { band: 'ATT', lane: 'R' } },
        { name: n, verb: 'generate', params: { amount: 12 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane: 'L' } },
        { name: n, verb: 'generate', params: { amount: 12 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane: 'R' } },
        ampArchetype(n, 0.10, 'Dribbler'), ampArchetype(n, 0.10, 'Sprinter'),
      ];
    case 'narrow':
      // Threat through the middle; the central combiners lift.
      return [
        { name: n, verb: 'generate', params: { amount: 20 }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, to: { band: 'ATT', lane: 'C' } },
        { name: n, verb: 'generate', params: { amount: 20 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane: 'C' } },
        ampArchetype(n, 0.10, 'Controller'), ampArchetype(n, 0.10, 'Passer'),
      ];
    case 'overload_left':
      // Stack the LEFT lane — concentrate threat where their cover is thin.
      return overloadLane(n, 'L', 38, 20);
    case 'overload_right':
      // Stack the RIGHT lane.
      return overloadLane(n, 'R', 38, 20);
    case 'route_one':
      // Bypass the midfield: a direct ball makes a central finishing chance up top.
      return [
        { name: n, verb: 'generate', params: { amount: 26 }, scope: 'global', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' } },
        { name: n, verb: 'generate', params: { amount: 16 }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, to: { band: 'ATT', lane: 'C' } },
      ];

    // ---- defensive ----
    case 'low_block':
      return [denyOpponent(n, 0.20), ampZone(n, -0.10, 'attack')];
    case 'sit_deep': {
      // Counter Trap: absorb, then spring the runners — doubled against an
      // attacking opponent play (the trap they walked into).
      const amp = opponentIsAttacking(ctx) ? 0.30 : 0.15;
      return [denyOpponent(n, 0.10), ampArchetype(n, amp, 'Sprinter'), ampArchetype(n, amp, 'Dribbler')];
    }
    case 'fortress':
      return [denyOpponent(n, 0.25)];
    case 'man_marking':
      // Reported deviation: no per-card denial exists in the palette wiring, so
      // the star-targeted deny is a stronger flat deny + an own-back-line amp.
      return [denyOpponent(n, 0.20), ampZone(n, 0.12, 'defence')];

    // ---- specialist ----
    case 'counter_attack': {
      // Fires when they committed forward this spell, or you trail.
      const sprung = opponentIsAttacking(ctx) || ctx.yourGoals < ctx.opponentGoals;
      return sprung ? [ampZone(n, 0.15, 'attack'), ampZone(n, 0.15, 'finishing')] : [];
    }
    case 'possession':
      // Keep the ball: more creation, a steadier spell.
      return [
        ampZone(n, 0.12, 'creation'),
        { name: n, verb: 'dampen-variance', params: { amount: 0.10 }, scope: 'global', target: { kind: 'zone', zone: 'attack' } },
      ];
    case 'set_piece':
      // A central dead-ball chance; the aerial threats sharpen it.
      return [
        { name: n, verb: 'generate', params: { amount: 18 }, scope: 'global', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' } },
        ampArchetype(n, 0.15, 'Target'), ampArchetype(n, 0.15, 'Commander'),
      ];
    case 'dark_arts':
      // A nibble off their conversion + their best player takes a knock
      // (drain-fitness reaches the opponent via the zero-emit shadows).
      return [
        denyOpponent(n, 0.08),
        { name: n, verb: 'drain-fitness', params: { amount: 1.0 }, scope: 'global', target: { kind: 'enemyCard', criterion: 'highest-power' } },
      ];
    case 'youth_policy':
      // Fresh Legs: late on, lift the whole XI — weakest players most.
      return ctx.increment >= 3
        ? [{ name: n, verb: 'amplify-inverse-power', params: { amount: 0.5 }, scope: 'global', target: { kind: 'criterion', criterion: 'all-teammates' } }]
        : [];

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
      // Squad depth — a modest all-round lift (the old +1-discard bonus fed an
      // unsurfaced mechanic, so it now does something the player can actually see).
      return [ampZone(n, 0.05, 'attack'), ampZone(n, 0.05, 'defence')];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Intent — the pre-match attacking/balanced/defensive lean (a squad-wide record,
// like a soft, always-on tactic). It sways the point distribution: Attacking
// pushes output up top while thinning the back line; Defensive solidifies the
// rear and suppresses the opponent at the cost of your own attack. Magnitudes
// are deliberately gentle (smaller than a called play) — a lean, not a commitment.
// ---------------------------------------------------------------------------

export function intentTraits(intent: TeamIntent | undefined, _ctx: SquadContext): TraitRecord[] {
  switch (intent) {
    case 'attacking':
      return [
        ampZone('Attacking intent', 0.12, 'attack'),
        ampZone('Attacking intent', 0.12, 'creation'),
        ampZone('Attacking intent', 0.12, 'finishing'),
        ampZone('Attacking intent', -0.12, 'defence'),
      ];
    case 'defensive':
      return [
        ampZone('Defensive intent', 0.15, 'defence'),
        denyOpponent('Defensive intent', 0.10),
        ampZone('Defensive intent', -0.10, 'attack'),
        ampZone('Defensive intent', -0.10, 'creation'),
      ];
    case 'balanced':
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Combined squad records for a side: the CALLED play (this spell only) + the
// Manager + the pre-match intent.
// ---------------------------------------------------------------------------

export function squadTraits(
  calledPlay: TacticCard | null,
  jokers: JokerCard[],
  ctx: SquadContext,
): TraitRecord[] {
  const records: TraitRecord[] = [];
  if (calledPlay) records.push(...tacticTraits(calledPlay, ctx));
  for (const joker of jokers) {
    records.push(...managerTraits(joker, ctx));
  }
  records.push(...intentTraits(ctx.intent, ctx));
  return records;
}
