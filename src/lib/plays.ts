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

/** Emission kinds that read as forward commitment. Creation alone is build-up. */
const COMMIT_ZONES: ReadonlySet<ZoneName> = new Set(['attack', 'finishing']);

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
    // A named non-commit zone (defence/creation) is not an attacking commitment;
    // an attack/finishing zone — or an un-zoned card amplify (touches everything
    // the card emits, attack included) — commits everywhere.
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
    if ((r.verb === 'amplify' || r.verb === 'generate') && zone === 'defence' && amount > 0) return true;
    return false;
  });
}

/** Is this play an attacking commitment at all? (Used e.g. by Counter Trap's gate.) */
export function isAttackingPlay(records: TraitRecord[]): boolean {
  return attackLanes(records).size > 0;
}

/** The lanes your play can ANSWER in: a deny covers every lane (conversion is
 *  global); a defensive amplify/generate covers every lane; a relocate answers
 *  in its destination lane. */
function answerLanes(records: TraitRecord[]): Set<Lane> {
  const lanes = new Set<Lane>();
  for (const r of records) {
    const amount = r.params.amount ?? r.params.fraction ?? 0;
    if (amount <= 0) continue;
    const zone = recordZone(r);
    if (r.verb === 'deny') for (const l of LANES) lanes.add(l);
    else if ((r.verb === 'amplify' || r.verb === 'generate') && zone === 'defence') for (const l of LANES) lanes.add(l);
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

  // Countered: you committed forward into a play that was PURELY a prepared
  // denial (their own commitment would make it a trade, not a trap).
  const yourCommit = attackLanes(yourPlayRecords);
  const yourDefence = hasDefensiveSurface(yourPlayRecords);
  if (
    hasDefensiveSurface(oppPlayRecords) && theirCommit.size === 0
    && yourCommit.size > 0 && !yourDefence
  ) return 'countered';

  return 'neutral';
}
