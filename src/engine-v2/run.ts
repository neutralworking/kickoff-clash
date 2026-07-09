/**
 * KC six-contest engine (NW-142) — the run loop, economy, and opponents.
 *
 * A 9-fixture Balatro-style run over the six-contest engine: each fixture you
 * must BANK ≥ the fixture's points target (the blind, `1.42^f` growth) or the
 * run ends (v1 permadeath). Beating a fixture pays cash → deck quality, so a
 * committed build+manager (the reweight compounds) outpaces the rising bar while
 * an uncommitted squad falls behind and dies mid-run. Bosses land every third
 * fixture; challenge rules (data/challenges.ts) bite from fixture 2.
 *
 * The opponent is MODELLED (CARD_SYSTEM_V2 §8): a real drafted squad + posture,
 * scaled per fixture, committed under a manager at bosses. Deterministic under
 * the run seed; RunState is serialisable (autosave/resume).
 *
 * Constants are calibrated to the engine-v2 points scale (the SM §8 curve's
 * 1.42 growth survives; its base is re-based) — the run-distribution harness
 * (__tests__/run.test.ts) is the gate.
 */

import { type Position, type Contest, contestDials } from './contests';
import { simulateMatch, type Squad } from './match';
import { type Manager, MANAGERS, COMMIT_MIN } from './managers';
import { FORMATIONS, type FormationId } from './adherence';
import { type KCCard, squadTraits } from './cards';
import { draftForManager } from './draft';
import { type ChallengeRule, challengeForFixture } from './data/challenges';

export const RUN_FIXTURES = 9;

// ---- tunables (calibrated to the engine-v2 points scale) -------------------
const TARGET_BASE = 0.5; // the blind's base; grows 1.42^f (SM §8 growth)
const TARGET_GROWTH = 1.42;
const OPP_BASE = 3; // opponent squad quality at fixture 0
const OPP_GROWTH = 4.2; // + per fixture (overtakes the player mid/late)
const BOSS_BONUS = 5; // extra opponent quality on a boss fixture (every 3rd)
const PLAYER_BASE_Q = 11; // starting deck quality (ATT/DEF boost) — ahead early
const CASH_WIN = 2;
const CASH_DRAW = 0.4; // a draw advances but pays little (§4.2 soft economic drag)
const CASH_PER_POINT = 0.38; // win margin compounds — committed wins bigger, grows faster
const K_QUALITY = 0.55; // cash → deck-quality growth

export const fixtureTarget = (f: number): number => round1(TARGET_BASE * Math.pow(TARGET_GROWTH, f));
const oppQuality = (f: number): number => OPP_BASE + OPP_GROWTH * f + (f % 3 === 0 ? BOSS_BONUS : 0);
const isBoss = (f: number): boolean => f % 3 === 0;
const round1 = (x: number) => Math.round(x * 10) / 10;

export interface FixtureResult {
  fixture: number;
  boss: boolean;
  challenge: string | null;
  target: number;
  points: number;
  oppPoints: number;
  score: [number, number];
  beaten: boolean;
  cashEarned: number;
}

export interface RunState {
  seed: number;
  managerId: string;
  fixture: number; // last completed fixture (0 = none)
  quality: number; // deck ATT/DEF boost
  cash: number;
  alive: boolean;
  completed: boolean;
  log: FixtureResult[];
  /** Permanent collection unlocks (store purchases). */
  collection: string[];
}

export function createRun(seed: number, manager: Manager): RunState {
  return {
    seed,
    managerId: manager.id,
    fixture: 0,
    quality: PLAYER_BASE_Q,
    cash: 0,
    alive: true,
    completed: false,
    log: [],
    collection: [],
  };
}

const clip = (x: number) => Math.max(1, Math.min(99, Math.round(x)));

function boost(cards: KCCard[], q: number): KCCard[] {
  return cards.map((c) => ({ ...c, att: clip(c.att + q), def: clip(c.def + q) }));
}

function sample(pool: KCCard[], seed: number, n: number): KCCard[] {
  // deterministic shuffle (mulberry-ish xorshift), take n
  const a = [...pool];
  let s = seed | 0;
  for (let i = a.length - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * Fill a formation with a NATURAL role spread — a random card per position
 * (contest-blind), so the squad's dials land where the positions naturally sit
 * (a balanced team), not stacked on whichever contest the best-statted cards
 * happen to carry. Difficulty is the quality boost, not an accidental dial wall.
 */
function fillBalanced(pool: KCCard[], formation: Position[], seed: number): KCCard[] | null {
  const byPos = new Map<Position, KCCard[]>();
  for (const c of pool) (byPos.get(c.pos) ?? byPos.set(c.pos, []).get(c.pos)!).push(c);
  let s = seed | 0;
  const used = new Set<string>();
  const xi: KCCard[] = [];
  for (const pos of formation) {
    const cand = (byPos.get(pos) ?? []).filter((c) => !used.has(c.id));
    if (!cand.length) return null;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const pick = cand[Math.abs(s) % cand.length];
    used.add(pick.id);
    xi.push(pick);
  }
  return xi;
}

const SET_PIECE_ROLES = new Set(['Advanced Winger', 'Wide Playmaker', 'Wide Target Forward', 'Colossus', 'Incursore']);
const hasKit = (xi: KCCard[]) => xi.filter((c) => SET_PIECE_ROLES.has(c.role)).length >= 2;

/**
 * A VIABLE committed build (not a glass-cannon mono): a balanced spine that then
 * swaps favoured-contest cards into compatible slots only until the commitment
 * gate opens. Keeps the CREATE/DEF the build needs to actually function while
 * reaching the manager's contest (a pure mono gets shut out — 0 CREATE = 0
 * chances vs any BREAK).
 */
function draftViable(pool: KCCard[], manager: Manager, seed: number): KCCard[] | null {
  const xi = fillBalanced(pool, FORMATIONS[manager.formation], seed);
  if (!xi) return null;
  const fav = manager.favoured;
  const used = new Set(xi.map((c) => c.id));
  const favCards = pool
    .filter((c) => c.contest === fav)
    .sort((a, b) => b.tilt - a.tilt || b.att + b.def - (a.att + a.def));
  let guard = 0;
  while (contestDials(xi)[fav] < COMMIT_MIN[fav] && guard++ < 11) {
    let swapped = false;
    for (let i = 0; i < xi.length; i++) {
      if (xi[i].contest === fav) continue;
      const repl = favCards.find((c) => c.pos === xi[i].pos && !used.has(c.id));
      if (repl) {
        used.delete(xi[i].id);
        used.add(repl.id);
        xi[i] = repl;
        swapped = true;
        break;
      }
    }
    if (!swapped) break;
  }
  return xi;
}

function playerSquad(pool: KCCard[], manager: Manager, quality: number, committed: boolean, seed: number): Squad | null {
  const stream = sample(pool, seed, 200);
  const xi = committed ? draftViable(stream, manager, seed) : fillBalanced(stream, FORMATIONS[manager.formation], seed);
  if (!xi) return null;
  return {
    cards: boost(xi, quality),
    manager,
    formation: manager.formation,
    traits: squadTraits(xi),
    hasTaker: hasKit(xi),
    hasCarrier: hasKit(xi),
    // deck quality lifts possession + creation (a strong squad controls the ball),
    // not just conversion — so a stronger deck gets MORE chances, not just better ones.
    dialBonus: qualityBonus(quality),
  };
}

/** Deck/opponent quality → a flat dial bonus (possession + creation weighted). */
function qualityBonus(q: number): Partial<Record<Contest, number>> {
  return { KEEP: q * 0.4, CREATE: q * 0.4, STOP: q * 0.2, BREAK: q * 0.2 };
}

function opponentSquad(pool: KCCard[], f: number, seed: number, challenge: ChallengeRule | null): Squad {
  const q = oppQuality(f) + (challenge?.oppQuality ?? 0);
  const stream = sample(pool, seed ^ 0x5bd1e995, 200);
  // a boss commits to a (seeded) manager; a regular opponent plays a shape blind
  const boss = isBoss(f);
  const mgr: Manager | undefined = boss ? MANAGERS[Math.abs(seed + f) % MANAGERS.length] : undefined;
  const form: FormationId = mgr?.formation ?? '4-3-3';
  const xi = mgr ? draftForManager(stream, mgr)?.xi : fillBalanced(stream, FORMATIONS[form], seed);
  const cards = boost(xi ?? fillBalanced(stream, FORMATIONS['4-3-3'], seed)!, q);
  return {
    cards,
    posture: boss ? 'attack' : 'balanced',
    manager: mgr, // a boss keeps its manager reweight...
    formation: form,
    traits: [], // ...but card ACTIONS are player-only (the modelled opponent opts out)
    dialBonus: qualityBonus(q),
  };
}

/** Play the next fixture; returns the updated run (mutation-free). A real run
 *  always drafts a committed build for its manager (the shop-bot); the
 *  `committed=false` path is a harness control (an uncommitted squad). */
export function playFixture(run: RunState, pool: KCCard[], committed = true): RunState {
  if (!run.alive || run.completed) return run;
  const manager = MANAGERS.find((m) => m.id === run.managerId)!;
  return applyFixture(run, pool, run.fixture + 1, manager, committed);
}

function applyFixture(run: RunState, pool: KCCard[], f: number, manager: Manager, committed: boolean): RunState {
  const challenge = challengeForFixture(run.seed, f);
  const target = round1(fixtureTarget(f) * (challenge?.targetMult ?? 1));
  const ps = playerSquad(pool, manager, run.quality, committed, run.seed + f * 101);
  const os = opponentSquad(pool, f, run.seed + f * 977, challenge);
  if (!ps) {
    // cannot field a squad → forfeit (attrition death)
    return { ...run, alive: false, log: [...run.log, deadFixture(f, target, challenge)] };
  }
  if (challenge?.noSetPieces) {
    ps.hasTaker = false;
    ps.hasCarrier = false;
  }
  const res = simulateMatch(ps, os, { seed: run.seed + f, target });
  const points = round1(res.points[0]);
  // v1 permadeath: a match LOSS ends the run; a WIN or DRAW advances (a draw pays
  // less). This keeps every archetype viable — attackers win, walls draw — where
  // a pure points-blind would lock out defensive builds.
  const won = res.score[0] > res.score[1];
  const drew = res.score[0] === res.score[1];
  const beaten = won || drew;
  const cashEarned = won ? round1(CASH_WIN + points * CASH_PER_POINT) : drew ? round1(CASH_DRAW + points * CASH_PER_POINT) : 0;
  const fr: FixtureResult = {
    fixture: f,
    boss: isBoss(f),
    challenge: challenge?.id ?? null,
    target,
    points,
    oppPoints: round1(res.points[1]),
    score: res.score,
    beaten,
    cashEarned,
  };
  const log = [...run.log, fr];
  if (!beaten) return { ...run, fixture: f - 1, alive: false, log };
  return {
    ...run,
    fixture: f,
    cash: round1(run.cash + cashEarned + res.cash[0]),
    quality: round1(run.quality + cashEarned * K_QUALITY),
    completed: f >= RUN_FIXTURES,
    alive: true,
    log,
  };
}

function deadFixture(f: number, target: number, challenge: ChallengeRule | null): FixtureResult {
  return { fixture: f, boss: isBoss(f), challenge: challenge?.id ?? null, target, points: 0, oppPoints: 0, score: [0, 0], beaten: false, cashEarned: 0 };
}

/** Simulate a full run for a manager; `committed` picks a matched vs random build. */
export function simulateRun(seed: number, manager: Manager, pool: KCCard[], committed = true): RunState {
  let run = createRun(seed, manager);
  for (let f = 1; f <= RUN_FIXTURES && run.alive && !run.completed; f++) {
    run = applyFixture(run, pool, f, manager, committed);
  }
  return run;
}

/** The fixture a run died at (RUN_FIXTURES+1 if it completed). */
export function deathFixture(run: RunState): number {
  if (run.completed) return RUN_FIXTURES + 1;
  const lost = run.log.find((r) => !r.beaten);
  return lost ? lost.fixture : run.fixture;
}

// ---- persistence (autosave / resume) --------------------------------------

export function serializeRun(run: RunState): string {
  return JSON.stringify(run);
}

export function deserializeRun(json: string): RunState {
  return JSON.parse(json) as RunState;
}
