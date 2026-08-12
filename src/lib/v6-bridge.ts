/**
 * Live-card → V6-card bridge (migration Phase 2).
 *
 * The live roguelike keeps its 540-card collection, packs, run and real
 * portraits; the MATCH becomes V6. This maps a live `Card` onto the V6 engine's
 * `V6Card` so the card-deployment match can run on the real squad:
 *   • cost    — 1–6 from power (same bands as the card face).
 *   • sector  — centre for central roles, left/right for wide roles.
 *   • ATT/DEF — the V6 stat budget for the cost, split by the card's live
 *     ATK/DEF lean (so the six-contest ranges never leak into V6 thresholds).
 *   • action  — one V6 action from the card's rarity + attacking/defensive lean.
 *
 * This is a faithful-enough first pass; a bespoke trait→action catalogue can
 * replace `v6Action` later without changing callers.
 */

import type { Card } from './scoring';
import type { Formation } from './formations';
import { deriveStats } from './funnel';
import { generateOpponentXI } from './opponent';
import { STAT_BUDGET_BY_COST, scaleV6Squad, TRIGGER_LABELS, type Rarity, type Sector, type V6Action, type V6Card } from './match-v6';

const WIDE = new Set(['WD', 'WM', 'WF']);

/** A card's V6 action as display copy — the same on every surface (token + full card).
 *  `short` fits a token line; `full` is a sentence for the big card; `icon` is a glyph. */
export function actionLabel(a?: V6Action): { short: string; full: string; icon: string } {
  if (!a) return { short: '—', full: 'No special action.', icon: '·' };
  const t = TRIGGER_LABELS[a.trigger] ?? '';
  switch (a.kind) {
    case 'modify_attack': return { short: `${a.amount >= 0 ? '+' : ''}${a.amount} ATT`, full: `${t}: ${a.amount >= 0 ? '+' : ''}${a.amount} attack to its sector.`, icon: '⚔' };
    case 'modify_defence': return { short: `${a.amount >= 0 ? '+' : ''}${a.amount} DEF`, full: `${t}: ${a.amount >= 0 ? '+' : ''}${a.amount} defence to its sector.`, icon: '🛡' };
    case 'modify_enemy_attack': return { short: `${a.amount} FOE ATT`, full: `${t}: ${a.amount} to the opposing sector's attack.`, icon: '🕸' };
    case 'modify_enemy_defence': return { short: `${a.amount} FOE DEF`, full: `${t}: ${a.amount} to the opposing sector's defence.`, icon: '🕸' };
    case 'improve_die_faces': return { short: `SCORES ${a.faces.join('·')}`, full: `${t}: a chance in its sector also scores on ${a.faces.join(', ')}.`, icon: '🎯' };
    case 'reroll_die': return { short: `REROLL ×${a.count}`, full: `${t}: reroll a missed chance in its sector (×${a.count}).`, icon: '🔄' };
    case 'add_chance': return { short: `+${a.count} CHANCE`, full: `${t}: create ${a.count} extra chance in its sector.`, icon: '⚽' };
    case 'cancel_chance': return { short: `DENY ×${a.count}`, full: `${t}: cancel ${a.count} of the opponent's chances in its sector.`, icon: '🧤' };
    case 'discount_cost': return { short: `−${a.amount} COST`, full: `${t}: incoming subs cost ${a.amount} less.`, icon: '💰' };
    case 'move_sector': return { short: `→ ${a.target.toUpperCase()}`, full: `${t}: moves to the ${a.target} sector.`, icon: '↔' };
    default: return { short: '—', full: 'No special action.', icon: '·' };
  }
}

/** V6 cost (1–6) from power — matches the card-face badge. */
export function v6Cost(card: Card): number {
  if (card.printedCost != null) return card.printedCost;
  const p = card.power ?? 60;
  if (p < 60) return 1;
  if (p < 68) return 2;
  if (p < 76) return 3;
  if (p < 84) return 4;
  if (p < 90) return 5;
  return 6;
}

/** Central roles play centre; wide roles split left/right deterministically by id. */
export function v6Sector(card: Card): Sector {
  if (WIDE.has(card.position)) return card.id % 2 === 0 ? 'left' : 'right';
  return 'centre';
}

export function v6Rarity(rarity: string): Rarity {
  const s = (rarity ?? '').toLowerCase();
  if (s.includes('legend')) return 'legendary';
  if (s.includes('epic')) return 'epic';
  if (s.includes('rare')) return 'rare';
  if (s.includes('uncommon')) return 'uncommon';
  return 'common';
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
}

/** V6 attack/defence: the cost's stat budget, split by the live ATK/DEF lean. */
export function v6Stats(card: Card, cost: number): { attack: number; defence: number } {
  if (card.printedAttack != null && card.printedDefence != null) {
    return { attack: card.printedAttack, defence: card.printedDefence };
  }
  const live = deriveStats(card);
  const budget = STAT_BUDGET_BY_COST[cost] ?? 7;
  const la = Math.max(0, live.atk);
  const ld = Math.max(0, live.def);
  const total = Math.max(1, la + ld);
  const attack = Math.max(0, Math.min(budget, Math.round((budget * la) / total)));
  return { attack, defence: Math.max(0, budget - attack) };
}

/** One V6 action from rarity + attacking/defensive lean. */
function v6Action(card: Card, attack: number, defence: number, rarity: Rarity): V6Action[] {
  const attacker = attack >= defence;
  const elite = rarity === 'legendary' || rarity === 'epic';
  if (elite) {
    return attacker
      ? [{ kind: 'improve_die_faces', trigger: 'ongoing', faces: [5, 6], target: { which: 'first_in_sector' }, duration: 'ongoing' }]
      : [{ kind: 'cancel_chance', trigger: 'on_reveal', target: {}, count: 1 }];
  }
  return attacker
    ? [{ kind: 'modify_attack', trigger: 'ongoing', amount: 1, target: { scope: 'sector' }, duration: 'ongoing' }]
    : [{ kind: 'modify_defence', trigger: 'ongoing', amount: 1, target: { scope: 'sector' }, duration: 'ongoing' }];
}

/** Map a live `Card` to a V6 engine `V6Card`. */
export function toV6Card(card: Card): V6Card {
  const cost = v6Cost(card);
  const { attack, defence } = v6Stats(card, cost);
  const rarity = v6Rarity(card.rarity);
  return {
    id: `live_${card.id}`,
    name: card.name,
    shortName: shortName(card.name),
    position: card.position,
    role: card.tacticalRole ?? card.archetype,
    sector: v6Sector(card),
    cost,
    attack,
    defence,
    rarity,
    actions: v6Action(card, attack, defence, rarity),
  };
}

/** A live card as the V6 token shows it OFF the pitch (team select / pack): the
 *  bridged V6 card with attack damped exactly as the match plays it, so the
 *  numbers on the card match the numbers in the game. Portrait is added by the UI. */
export function toDisplayV6Card(card: Card): V6Card {
  const v6 = toV6Card(card);
  if (card.printedAttack != null && card.printedDefence != null) return v6;
  return { ...v6, attack: Math.max(0, Math.round(v6.attack * LIVE_RUN_BALANCE.attackDamp)) };
}

/** Sector from a formation slot's left–right geometry (x 0–100). */
export function sectorFromSlot(x: number): Sector {
  return x < 33 ? 'left' : x > 67 ? 'right' : 'centre';
}

/**
 * The starting XI as V6 cards, sectored by FORMATION GEOMETRY (the slot's x) —
 * not the card's nominal wide/central role — so the XI spreads across the three
 * lanes instead of piling every central role into centre. Bench cards keep their
 * natural `v6Sector` (they get a lane when subbed on). Index-aligned to `xi`, so
 * callers can zip portraits back on by position.
 */
export function toV6Starters(xi: Card[], formation: Formation): V6Card[] {
  return xi.map((c, i) => {
    const v6 = toV6Card(c);
    const slot = formation.slots[i];
    return slot ? { ...v6, sector: sectorFromSlot(slot.x) } : v6;
  });
}

/**
 * Live-run balance for the V6 match (migration Phase 4). Two problems to fix:
 *  1. the ENGINE runs hot (~2× the goal target) even fixture-vs-fixture, and the
 *     bridged player XI is hotter still (centre-stacked real-card attack);
 *  2. difficulty didn't scale with the run.
 *
 * The fix keeps to bridge-level knobs (the handoff pins the engine threshold at 5):
 *  • the opponent is the SCORING_V2 generator's named XI (the same side the scout
 *    screen shows) bridged through the identical pipeline as the player, so
 *    difficulty is the already-tuned power curve (`ROUND_POWER`/`cupMatchPower`),
 *    not a fixture-deck quirk — no separate strength multiplier needed;
 *  • `attackDamp` cools BOTH sides' attack toward the 2.2–3.2 goal band (defence
 *    is left intact, so cooling attack doesn't also open the game up).
 * This is the ONLY live-run knob; tune it with `scripts/kc_v6_runsim.ts`.
 */
export const LIVE_RUN_BALANCE = {
  /**
   * Multiplier on BOTH sides' ATT — cools the hot engine toward the goal band.
   * 0.7 lands run-average total goals at ~3.0 (in the 2.2–3.2 target) in
   * `kc_v6_runsim.ts`; lower over-cools and hands defensive shapes the game.
   */
  attackDamp: 0.7,
  /**
   * V6 opponent-power softening. Above `powerKnee`, only `powerSlope` of each extra
   * point of the SCORING_V2 power curve counts. V6's coarse cost-banding turns the
   * raw top-end (`CUP_FINAL_POWER` 90 → cost-6 budget-13 defence) into a near-wall,
   * so this keeps boss finals HARD but not hopeless (it lifts the cup-4 final from
   * ~17%→~25% in-sim) while leaving the well-balanced low/mid cups (below the knee)
   * exactly as the curve sets them. NB: the cup-5 boss remains a known wall for the
   * crude sim AI — see `docs/kc_v6_runsim_report.md`.
   */
  powerKnee: 76,
  powerSlope: 0.35,
};

/** Soften raw SCORING_V2 opponent power for V6's cost-banded stat model (see `powerKnee`). */
export function v6OpponentPower(rawPower: number): number {
  const { powerKnee, powerSlope } = LIVE_RUN_BALANCE;
  return rawPower <= powerKnee ? rawPower : powerKnee + (rawPower - powerKnee) * powerSlope;
}

/** A named, bridged squad ready for `startMatchFromSquads` / `simulateMatchFromSquads`. */
export interface LiveV6Squad {
  name: string;
  /** The formation this squad lines up in — so the match screen can render it on a
   *  top-down formation pitch (the team-selection look). */
  formationId: string;
  xi: V6Card[];
  bench: V6Card[];
}

/** Cool a squad's attack (defence intact) — the symmetric engine damper. */
function dampAttack(squad: LiveV6Squad): LiveV6Squad {
  return scaleV6Squad(squad, LIVE_RUN_BALANCE.attackDamp, 1);
}

/**
 * The player's bridged squad for a live V6 match: real starters sectored by
 * formation geometry, real bench, attack damped. The UI zips real portraits back
 * on by index (see `toV6Starters`); ids stay `live_<n>` so the scorer can map goals
 * back to the collection.
 */
export function bridgePlayerSquad(name: string, xi: Card[], bench: Card[], formation: Formation): LiveV6Squad {
  return dampAttack({ name, formationId: formation.id, xi: toV6Starters(xi, formation), bench: bench.map(toV6Card) });
}

/**
 * The opponent for a cup tie: the SCORING_V2 generator's XI (opponent.ts) bridged
 * through the same pipeline, so it's balanced against the player by construction and
 * scales via the tuned power curve. A 7-card bench is generated from a salted seed;
 * every opponent id lives in a private `opp_*` namespace (never `live_<n>`, which the
 * goal-scorer parser owns), so player and opponent can never collide in the pool.
 */
export function bridgeOpponentSquad(opts: { name: string; round: number; style: string; seed: number; power: number }): LiveV6Squad {
  const { name, round, style, seed } = opts;
  const power = v6OpponentPower(opts.power);
  const main = generateOpponentXI(round, style, seed, power);
  const benchGen = generateOpponentXI(round, style, seed + 7919, power);
  const xi = toV6Starters(main.xi, main.formation).map((c, i) => ({ ...c, id: `opp_s${i}` }));
  const bench = benchGen.xi.slice(0, 7).map((c, i) => ({ ...toV6Card(c), id: `opp_b${i}` }));
  return dampAttack({ name, formationId: main.formation.id, xi, bench });
}

/**
 * Assign a team's currently-active cards to its formation slots for the pitch
 * display. Starts from the kickoff order (slot i → the i-th starter id); when a
 * starter has been subbed off, its slot is filled by a subbed-on card in the SAME
 * sector (V6 subs inherit the outgoing card's sector), so the formation shape holds
 * across subs without tracking sub events. Returns a card id per slot (or null).
 */
export function assignSlots(
  starterIds: string[],
  slotSectors: Sector[],
  active: { cardId: string; sector: Sector }[],
): (string | null)[] {
  const activeIds = new Set(active.map((c) => c.cardId));
  const slots: (string | null)[] = starterIds.map((id) => (activeIds.has(id) ? id : null));
  // Cards on now that weren't kickoff starters (subbed on) — fill the vacated slots.
  const placed = new Set(slots.filter((id): id is string => id !== null));
  const extra = active.filter((c) => !placed.has(c.cardId));
  const takeExtra = (sector?: Sector): string | null => {
    const i = sector ? extra.findIndex((c) => c.sector === sector) : extra.length ? 0 : -1;
    if (i < 0) return null;
    return extra.splice(i, 1)[0].cardId;
  };
  for (let s = 0; s < slots.length; s++) {
    if (slots[s] !== null) continue;
    slots[s] = takeExtra(slotSectors[s]) ?? takeExtra();
  }
  return slots;
}

/** The team-selection readout for a chosen XI: total damped ATT and total DEF —
 *  the same V6 numbers the match plays with, so selection and match never disagree. */
export function xiV6Totals(xi: Card[], formation: Formation): { att: number; def: number } {
  const squad = bridgePlayerSquad('', xi, [], formation);
  return {
    att: squad.xi.reduce((n, c) => n + c.attack, 0),
    def: squad.xi.reduce((n, c) => n + c.defence, 0),
  };
}
