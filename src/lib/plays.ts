/**
 * Kickoff Clash — call grading for the Called Plays rework.
 *
 * `gradeCall` reads the two plays' TraitRecords and grades the player's call
 * against the opponent's telegraphed play. Data-driven — no matchup table:
 *
 *   answered  — your defensive surface (a `deny`, a defence amplify/generate,
 *               or a relocate) intersects the lanes of their attacking
 *               commitment (their generate/amplify into attack/finishing).
 *   countered — you committed forward (attack/finishing generate/amplify, with
 *               no defensive surface) into their prepared denial.
 *   neutral   — everything else (both attacking, both defensive, no overlap,
 *               or your play's records did not fire this spell).
 */

import type { TacticCard } from './tactics';
import type { TraitRecord, ZoneName } from './verbs';
import type { Lane } from './field';
import { LANES } from './field';

export type CallGrade = 'answered' | 'neutral' | 'countered';

/** Funnel lanes that read as forward commitment. Under the funnel, creation IS the
 *  lane threat (it drives shot volume in a channel); possession alone is build-up. */
const COMMIT_ZONES: ReadonlySet<ZoneName> = new Set(['creation', 'finishing']);

/** Funnel lanes that read as a defensive surface. */
const DEFENSIVE_ZONES: ReadonlySet<ZoneName> = new Set(['defence', 'destruction', 'pressing']);

function recordZone(r: TraitRecord): ZoneName | null {
  return r.target.kind === 'zone' || r.target.kind === 'criterion' || r.target.kind === 'enemyCard'
    ? r.target.zone ?? null
    : null;
}

/** The lanes a record's forward commitment lands in (empty set = not attacking). */
function commitLanes(r: TraitRecord): Set<Lane> {
  const amount = r.params.amount ?? 0;
  if (amount <= 0) return new Set();
  const zone = recordZone(r);
  if (r.verb === 'generate') {
    if (!zone || !COMMIT_ZONES.has(zone)) return new Set();
    return new Set([r.to?.lane ?? 'C']);
  }
  if (r.verb === 'amplify') {
    // A named non-commit lane (defence/destruction/pressing/possession) is not an
    // attacking commitment; a creation/finishing lane — or an un-zoned card amplify
    // (touches everything the card emits) — commits everywhere.
    // (amplify-inverse-power is a lift-the-weak utility, never read as commitment.)
    if (zone && !COMMIT_ZONES.has(zone)) return new Set();
    return new Set(LANES);
  }
  return new Set();
}

/** Union of a play's attacking-commitment lanes. */
export function attackLanes(records: TraitRecord[]): Set<Lane> {
  const lanes = new Set<Lane>();
  for (const r of records) for (const lane of commitLanes(r)) lanes.add(lane);
  return lanes;
}

/** Does this play carry a prepared denial / defensive posture? */
export function hasDefensiveSurface(records: TraitRecord[]): boolean {
  return records.some((r) => {
    const amount = r.params.amount ?? 0;
    if (r.verb === 'deny' && amount > 0) return true;
    const zone = recordZone(r);
    if ((r.verb === 'amplify' || r.verb === 'generate') && zone && DEFENSIVE_ZONES.has(zone) && amount > 0) return true;
    return false;
  });
}

/** Is this play an attacking commitment at all? (Used e.g. by Counter Trap's gate.) */
export function isAttackingPlay(records: TraitRecord[]): boolean {
  return attackLanes(records).size > 0;
}

/** Bodies-forward commitment: loads CREATION (shot volume into lanes). Finishing-
 *  only quality (a rehearsed set piece) is NOT a committed shape — a prepared trap
 *  has nothing to catch, so it cannot be 'countered' (it also answers nothing). */
export function commitsBodiesForward(records: TraitRecord[]): boolean {
  return records.some((r) => {
    const amount = r.params.amount ?? 0;
    if (amount <= 0) return false;
    const zone = recordZone(r);
    if (r.verb === 'generate') return zone === 'creation';
    if (r.verb === 'amplify') return zone === null || zone === 'creation';
    return false;
  });
}

/** Materiality floors: 'answered' must mean MECHANICALLY effective (the magnitude
 *  contract), so a token deny (a nibble like Dark Arts) or a trace defensive amp
 *  does not grade as an answer. */
const ANSWER_DENY_MIN = 0.15;
const ANSWER_AMP_MIN = 0.10;

/** The lanes your play can ANSWER in: a material deny covers every lane (conversion
 *  is global); a material defensive amplify covers every lane; a defensive generate
 *  answers in the lane it reinforces (aimed cover is shot-volume denial THERE); a
 *  relocate answers in its destination lane. */
function answerLanes(records: TraitRecord[]): Set<Lane> {
  const lanes = new Set<Lane>();
  for (const r of records) {
    const amount = r.params.amount ?? r.params.fraction ?? 0;
    if (amount <= 0) continue;
    const zone = recordZone(r);
    if (r.verb === 'deny' && amount >= ANSWER_DENY_MIN) for (const l of LANES) lanes.add(l);
    else if (r.verb === 'amplify' && zone && DEFENSIVE_ZONES.has(zone) && amount >= ANSWER_AMP_MIN) for (const l of LANES) lanes.add(l);
    else if (r.verb === 'generate' && zone && DEFENSIVE_ZONES.has(zone)) lanes.add(r.to?.lane ?? 'C');
    else if (r.verb === 'relocate') lanes.add(r.to?.lane ?? 'C');
  }
  return lanes;
}

/**
 * Grade the player's called play against the opponent's play, from the records
 * both actually carry this spell. `yourPlayRecords` should be the records the
 * play PRODUCED for this spell (producer gating applied) — a play whose gate
 * did not fire grades neutral.
 */
export function gradeCall(
  yourPlay: TacticCard | null,
  oppPlayRecords: TraitRecord[],
  yourPlayRecords: TraitRecord[],
): CallGrade {
  if (!yourPlay || yourPlayRecords.length === 0) return 'neutral';

  const theirCommit = attackLanes(oppPlayRecords);
  const yourAnswers = answerLanes(yourPlayRecords);
  if (theirCommit.size > 0 && yourAnswers.size > 0) {
    for (const lane of theirCommit) {
      if (yourAnswers.has(lane)) return 'answered';
    }
  }

  const theirTrap = hasDefensiveSurface(oppPlayRecords) && theirCommit.size === 0;

  // Countered: you committed BODIES forward into a play that was PURELY a
  // prepared denial (their own commitment would make it a trade, not a trap).
  // Finishing-only quality (dead balls) commits no bodies — nothing to catch.
  const yourDefence = hasDefensiveSurface(yourPlayRecords);
  if (theirTrap && commitsBodiesForward(yourPlayRecords) && !yourDefence) return 'countered';

  return 'neutral';
}
