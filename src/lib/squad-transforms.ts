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
import { attackLanes, hasDefensiveSurface, isAttackingPlay } from './plays';

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

/** Scale every card of an archetype (all the kinds it emits, or one named kind). */
function ampArchetype(name: string, amount: number, archetype: string, zone?: ZoneName): TraitRecord {
  return { name, verb: 'amplify', params: { amount }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype, zone } };
}

/** Suppress the opponent's conversion (capped downstream in resolveIncrement). */
function denyOpponent(name: string, amount: number): TraitRecord {
  return { name, verb: 'deny', params: { amount }, scope: 'zone', target: { kind: 'zone', zone: 'finishing' } };
}

/** Manufacture attacking threat down ONE flank (a lane overload) — `generate` deposits
 *  into the explicit destination cell, so a squad-source record can stack a single lane.
 *  Both deposits are CREATION (the lane-contest stat): threat up top plus build-up
 *  behind it, in the same channel. */
function overloadLane(name: string, lane: 'L' | 'R', attack: number, creation: number): TraitRecord[] {
  return [
    { name, verb: 'generate', params: { amount: attack }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'ATT', lane } },
    { name, verb: 'generate', params: { amount: creation }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane } },
  ];
}

/** Drain fitness from every card of an archetype on the OWN side (the press cost). */
function drainArchetype(name: string, amount: number, archetype: string): TraitRecord {
  return { name, verb: 'drain-fitness', params: { amount }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype } };
}

/** Reinforce the back line where the opponent's telegraphed play loads: `generate`
 *  DESTRUCTION into the DEF-band cell(s) of their committed lane(s). laneCover feeds
 *  the shot contest directly (possession.ts pShot = SHOT_BASE × push/cover), so this
 *  is shot-VOLUME denial — the structural counterpart to `deny`'s conversion
 *  suppression. A telegraph with no lane commitment (or none at all) falls back to an
 *  even spread, so the same play is materially stronger as a READ than as a blind call. */
function coverLoadedLanes(name: string, ctx: SquadContext, total: number): TraitRecord[] {
  const play = ctx.opponentPlayId ? getOpponentPlayById(ctx.opponentPlayId) : undefined;
  const loaded = play ? [...attackLanes(play.records)] : [];
  // No forward commitment to set against → the block is a scramble, not a set
  // trap: spread at reduced budget. The read premium is the point of the telegraph.
  const lanes: Lane[] = loaded.length > 0 ? loaded : [...LANES];
  const budget = loaded.length > 0 ? total : total * 0.25;
  const amount = budget / lanes.length;
  return lanes.map((lane): TraitRecord => ({
    name, verb: 'generate', params: { amount }, scope: 'global',
    target: { kind: 'zone', zone: 'destruction' }, to: { band: 'DEF', lane },
  }));
}

// A "power lift" raises the whole attacking funnel (possession → creation → finishing).
function powerLift(name: string, amount: number): TraitRecord[] {
  return [ampZone(name, amount, 'possession'), ampZone(name, amount, 'creation'), ampZone(name, amount, 'finishing')];
}

/** Is the opponent's telegraphed play an attacking commitment? (Data-driven.) */
function opponentIsAttacking(ctx: SquadContext): boolean {
  const play = ctx.opponentPlayId ? getOpponentPlayById(ctx.opponentPlayId) : undefined;
  return play ? isAttackingPlay(play.records) : false;
}

/** Is the opponent's telegraphed play a PREPARED DENIAL (a set trap: defensive
 *  surface, no forward commitment)? Mirrors gradeCall's 'countered' read. */
function opponentIsTrap(ctx: SquadContext): boolean {
  const play = ctx.opponentPlayId ? getOpponentPlayById(ctx.opponentPlayId) : undefined;
  if (!play) return false;
  return hasDefensiveSurface(play.records) && attackLanes(play.records).size === 0;
}

/** The cost of committing bodies forward into a set trap: you get caught on the
 *  break — the back line you left is exposed. Appended to a forward commitment
 *  when the telegraph shows a prepared denial, so a 'countered' call carries a
 *  REAL negative (the magnitude contract's downside), not just a wasted charge. */
function breakExposure(name: string, ctx: SquadContext): TraitRecord[] {
  return opponentIsTrap(ctx) ? [ampZone(name, -0.15, 'defence')] : [];
}

// ---------------------------------------------------------------------------
// Called plays — all 16 (per-spell records)
// ---------------------------------------------------------------------------

export function tacticTraits(tactic: TacticCard, ctx: SquadContext): TraitRecord[] {
  const n = tactic.name;

  switch (tactic.id) {
    // ---- attacking ----
    case 'high_line':
      // Commit forward: possession + creation up, your own back line thins.
      return [ampZone(n, 0.26, 'possession'), ampZone(n, 0.26, 'creation'), ampZone(n, -0.12, 'defence'), ...breakExposure(n, ctx)];
    case 'press_high':
      // Turn the pressing lane up (stage 1's counter — erases their possession) and
      // nibble their conversion; the runners (Sprinter/Engine) tire for it.
      return [
        denyOpponent(n, 0.15),
        ampZone(n, 0.35, 'pressing'),
        drainArchetype(n, 0.5, 'Sprinter'), drainArchetype(n, 0.5, 'Engine'),
      ];
    case 'wing_play':
      // Threat down BOTH wings (a squad source cannot relocate — it has no
      // emission of its own — so the wide shift is manufactured with generate).
      return [
        { name: n, verb: 'generate', params: { amount: 50 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'ATT', lane: 'L' } },
        { name: n, verb: 'generate', params: { amount: 50 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'ATT', lane: 'R' } },
        { name: n, verb: 'generate', params: { amount: 25 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane: 'L' } },
        { name: n, verb: 'generate', params: { amount: 25 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane: 'R' } },
        ampArchetype(n, 0.12, 'Dribbler'), ampArchetype(n, 0.12, 'Sprinter'),
        ...breakExposure(n, ctx),
      ];
    case 'narrow':
      // Threat through the middle; the central combiners lift.
      return [
        { name: n, verb: 'generate', params: { amount: 50 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'ATT', lane: 'C' } },
        { name: n, verb: 'generate', params: { amount: 50 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'MID', lane: 'C' } },
        ampArchetype(n, 0.12, 'Controller'), ampArchetype(n, 0.12, 'Passer'),
        ...breakExposure(n, ctx),
      ];
    case 'overload_left':
      // Stack the LEFT lane — concentrate threat where their cover is thin.
      return [...overloadLane(n, 'L', 95, 50), ...breakExposure(n, ctx)];
    case 'overload_right':
      // Stack the RIGHT lane.
      return [...overloadLane(n, 'R', 95, 50), ...breakExposure(n, ctx)];
    case 'route_one':
      // Bypass the midfield: a direct ball makes a central finishing chance up top.
      return [
        { name: n, verb: 'generate', params: { amount: 50 }, scope: 'global', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' } },
        { name: n, verb: 'generate', params: { amount: 45 }, scope: 'global', target: { kind: 'zone', zone: 'creation' }, to: { band: 'ATT', lane: 'C' } },
        ...breakExposure(n, ctx),
      ];

    // ---- defensive ----
    // Every block now pairs `deny` (conversion suppression) with AIMED shot-volume
    // denial (coverLoadedLanes): laneCover feeds the shot contest, so reinforcing
    // the lane their telegraphed play loads cuts their whole spell — the clean
    // counter the magnitude contract prices at ~±0.25–0.40 xG.
    case 'low_block': {
      // Soak-and-break: against a forward commitment the block wins the ball and
      // springs (no attack cost, a break lift); called blind it just sits off.
      const sprung = opponentIsAttacking(ctx);
      return [
        denyOpponent(n, 0.20), ...coverLoadedLanes(n, ctx, 130),
        sprung ? ampZone(n, 0.26, 'creation') : ampZone(n, -0.08, 'possession'),
      ];
    }
    case 'sit_deep': {
      // Counter Trap: absorb, then spring the runners — doubled against an
      // attacking opponent play (the trap they walked into).
      const amp = opponentIsAttacking(ctx) ? 0.38 : 0.15;
      return [
        denyOpponent(n, 0.10), ...coverLoadedLanes(n, ctx, 130),
        ampArchetype(n, amp, 'Sprinter'), ampArchetype(n, amp, 'Dribbler'),
      ];
    }
    case 'fortress':
      return [denyOpponent(n, 0.25), ...coverLoadedLanes(n, ctx, 260)];
    case 'man_marking':
      // Reported deviation: no per-card denial exists in the palette wiring, so
      // the star-targeted deny is a stronger flat deny + an own-back-line amp.
      // Duels won against a committed attack feed a transition lift.
      return [
        denyOpponent(n, 0.18), ...coverLoadedLanes(n, ctx, 75), ampZone(n, 0.10, 'defence'),
        ...(opponentIsAttacking(ctx) ? [ampZone(n, 0.18, 'creation')] : []),
      ];

    // ---- specialist ----
    case 'counter_attack': {
      // Fires when they committed forward this spell, or you trail. Against a
      // forward commitment the whole side drops off before breaking — a real
      // defensive surface, so it ANSWERS the commitment (soak and break).
      if (opponentIsAttacking(ctx)) {
        return [denyOpponent(n, 0.15), ampZone(n, 0.28, 'creation'), ampZone(n, 0.28, 'finishing')];
      }
      return ctx.yourGoals < ctx.opponentGoals
        ? [ampZone(n, 0.28, 'creation'), ampZone(n, 0.28, 'finishing')]
        : [];
    }
    case 'possession':
      // Keep the ball: the possession lane lifts, a steadier spell.
      return [
        ampZone(n, 0.22, 'possession'),
        ampZone(n, 0.10, 'creation'),
        { name: n, verb: 'dampen-variance', params: { amount: 0.12 }, scope: 'global', target: { kind: 'zone', zone: 'possession' } },
      ];
    case 'set_piece': {
      // A central dead-ball chance; the aerial threats sharpen it (finishing only —
      // a rehearsed routine, not bodies committed forward). Against a telegraphed
      // parked bus the routine escalates: a bus concedes corners and free kicks,
      // and volume denial cannot blunt a dead ball — the trap-breaker read.
      const vsTrap = opponentIsTrap(ctx);
      return [
        { name: n, verb: 'generate', params: { amount: vsTrap ? 110 : 55 }, scope: 'global', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' } },
        ...(vsTrap
          ? [{ name: n, verb: 'generate' as const, params: { amount: 50 }, scope: 'global' as const, target: { kind: 'zone' as const, zone: 'creation' as const }, to: { band: 'MID' as const, lane: 'C' as const } }]
          : []),
        ampArchetype(n, vsTrap ? 0.28 : 0.20, 'Target', 'finishing'),
        ampArchetype(n, vsTrap ? 0.28 : 0.20, 'Commander', 'finishing'),
      ];
    }
    case 'dark_arts':
      // A nibble off their conversion + their best player takes a knock
      // (drain-fitness reaches the opponent via the zero-emit shadows).
      return [
        denyOpponent(n, 0.10),
        { name: n, verb: 'drain-fitness', params: { amount: 1.5 }, scope: 'global', target: { kind: 'enemyCard', criterion: 'highest-power' } },
      ];
    case 'youth_policy':
      // Fresh Legs: late on, lift the whole XI — weakest players most.
      return ctx.increment >= 3
        ? [{ name: n, verb: 'amplify-inverse-power', params: { amount: 0.7 }, scope: 'global', target: { kind: 'criterion', criterion: 'all-teammates' } }]
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
      return commons > 0 ? powerLift(n, Math.min(0.20, commons * 0.03)) : [];
    }
    case 'hairdryer':
      // A captain in the room lifts the whole side, both ends.
      return ctx.xi.some((c) => c.personalityTheme === 'Captain')
        ? [ampZone(n, 0.10, 'possession'), ampZone(n, 0.10, 'defence')]
        : [];
    case 'chemistry_set': {
      // Rewards a densely-connected XI (capped so it can't run away): a connected
      // side keeps the ball.
      const c = ctx.connections.length;
      return c > 0 ? [ampZone(n, Math.min(0.30, c * 0.02), 'possession')] : [];
    }
    case 'scouts_eye':
      // Squad depth — a modest all-round lift (the old +1-discard bonus fed an
      // unsurfaced mechanic, so it now does something the player can actually see).
      return [ampZone(n, 0.05, 'possession'), ampZone(n, 0.05, 'defence')];
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
        ampZone('Attacking intent', 0.12, 'possession'),
        ampZone('Attacking intent', 0.12, 'creation'),
        ampZone('Attacking intent', 0.12, 'finishing'),
        ampZone('Attacking intent', -0.12, 'defence'),
      ];
    case 'defensive':
      return [
        ampZone('Defensive intent', 0.15, 'defence'),
        ampZone('Defensive intent', 0.10, 'destruction'),
        denyOpponent('Defensive intent', 0.10),
        ampZone('Defensive intent', -0.10, 'possession'),
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
