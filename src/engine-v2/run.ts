/**
 * KC six-contest engine (NW-142) — the run loop, economy, and opponents.
 *
 * A 9-fixture run over the six-contest engine, judged on the SCORELINE (owner
 * call, 2026-07 — the points blind is gone): WIN a fixture and bank the full
 * purse, DRAW and survive on half, LOSE and the run ends (v1 permadeath).
 * Difficulty is carried entirely by opponent quality growth (it overtakes the
 * player late), so a committed build+manager — whose cash compounds into deck
 * quality — outscores the curve while an uncommitted squad draws, starves, and
 * dies. Bosses land every third fixture; challenge rules bite from fixture 2.
 *
 * EVERY opponent is a managed, modelled team (CARD_SYSTEM_V2 §8): a real
 * drafted squad under a seeded manager, playing its tactical deck (autoTactics).
 * Bosses additionally DRAFT COMMITTED to their manager (the reweight fires).
 * Deterministic under the run seed; RunState is serialisable (autosave/resume).
 */

import { type Position, type Contest, contestDials } from './contests';
import { simulateMatch, type Squad, type MatchResult } from './match';
import type { MatchVerdict } from './events';
import type { TacticalPlay } from './tactics';
import { type Manager, MANAGERS, COMMIT_MIN } from './managers';
import { FORMATIONS, type FormationId } from './adherence';
import { type KCCard, squadTraits } from './cards';
import { draftForManager } from './draft';
import { type ChallengeRule, challengeForFixture } from './data/challenges';

export const RUN_FIXTURES = 9;

// ---- tunables (difficulty = opponent quality growth; no points bar) ---------
const OPP_BASE = 4; // opponent squad quality at fixture 0 — fixture 1 is a real match
const OPP_GROWTH = 2.5; // opponent quality + per fixture. Must outpace a DRAW-parker's
// deck growth (half purse ≈ +1.6 quality/fixture) or "never lose, always draw" becomes
// free survival — the divergence between committed (wins → full purse → keeps pace)
// and uncommitted (draws → starves → the curve catches it) lives in this gap.
const BOSS_BONUS = 2; // extra opponent quality on a boss fixture (every 3rd)
const PLAYER_BASE_Q = 18; // starting deck quality (ATT/DEF boost) — ahead early
const CASH_WIN = 3; // flat cash for a WIN
const CASH_PER_GOAL = 1.0; // each goal scored in a win adds to the purse
const DRAW_FACTOR = 0.5; // a draw survives on half the purse (classic v1 rule)
const K_QUALITY = 1.15; // cash → deck-quality growth. High on purpose: winning is the
// only income that keeps pace with OPP_GROWTH, so the committed build (more wins,
// bigger purses) compounds away from the draw-parker — the divergence lever.

const oppQuality = (f: number): number => OPP_BASE + OPP_GROWTH * f + (f % 3 === 0 ? BOSS_BONUS : 0);
const isBoss = (f: number): boolean => f % 3 === 0;
const round1 = (x: number) => Math.round(x * 10) / 10;

export interface FixtureResult {
  fixture: number;
  boss: boolean;
  challenge: string | null;
  score: [number, number];
  /** Judged on the scoreline, nothing else. */
  verdict: MatchVerdict;
  /** Win or draw → the run continues; a loss ends it. */
  survived: boolean;
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

/** Deck/opponent quality → a flat dial bonus (possession + creation weighted).
 *  Deliberately MODEST: raw quality must not drown out the committed manager
 *  reweight (+3..10 dials) — synergy, not power level, is the determining
 *  factor (design north star). Quality's other half rides on card stats. */
function qualityBonus(q: number): Partial<Record<Contest, number>> {
  return { KEEP: q * 0.22, CREATE: q * 0.22, STOP: q * 0.11, BREAK: q * 0.11 };
}

function opponentSquad(pool: KCCard[], f: number, seed: number, challenge: ChallengeRule | null): Squad {
  const q = oppQuality(f) + (challenge?.oppQuality ?? 0);
  const stream = sample(pool, seed ^ 0x5bd1e995, 200);
  // EVERY opponent is a managed team with an identity and a tactical deck
  // (owner call, 2026-07). A regular opponent fields a balanced draft under its
  // manager (the reweight stays shut without commitment — the law); a BOSS
  // drafts COMMITTED to its manager, so the reweight fires and it plays its
  // manager's game at full tilt.
  const boss = isBoss(f);
  const mgr: Manager = MANAGERS[Math.abs(seed + f) % MANAGERS.length];
  const form: FormationId = mgr.formation;
  const xi = boss ? draftForManager(stream, mgr)?.xi : fillBalanced(stream, FORMATIONS[form], seed);
  const cards = boost(xi ?? fillBalanced(stream, FORMATIONS['4-3-3'], seed)!, q);
  return {
    cards,
    posture: mgr.posture,
    manager: mgr,
    autoTactics: true, // the manager's reactive brain plays the tactical deck
    formation: form,
    // the opponent is MODELLED with its card actions too (CARD_SYSTEM_V2 §8) —
    // deny-chance actions are bounded saves in the engine, so they defend without
    // erasing the player's game.
    traits: xi ? squadTraits(xi) : [],
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

/** The purse for a result: a WIN pays flat + per goal; a DRAW survives on half;
 *  a LOSS pays nothing (and ends the run). */
function purse(verdict: MatchVerdict, goalsFor: number): number {
  if (verdict === 'loss') return 0;
  const winPurse = CASH_WIN + CASH_PER_GOAL * goalsFor;
  return round1(verdict === 'win' ? winPurse : winPurse * DRAW_FACTOR);
}

function applyFixture(run: RunState, pool: KCCard[], f: number, manager: Manager, committed: boolean): RunState {
  const challenge = challengeForFixture(run.seed, f);
  const ps = playerSquad(pool, manager, run.quality, committed, run.seed + f * 101);
  const os = opponentSquad(pool, f, run.seed + f * 977, challenge);
  if (!ps) {
    // cannot field a squad → forfeit (attrition death)
    return { ...run, alive: false, log: [...run.log, deadFixture(f, challenge)] };
  }
  if (challenge?.noSetPieces) {
    ps.hasTaker = false;
    ps.hasCarrier = false;
  }
  const res = simulateMatch(ps, os, { seed: run.seed + f });
  // Judged on the scoreline, nothing else: win → survive on the full purse,
  // draw → survive on half, loss → the run ends (v1 permadeath).
  const survived = res.verdict !== 'loss';
  const cashEarned = purse(res.verdict, res.score[0]);
  const fr: FixtureResult = {
    fixture: f,
    boss: isBoss(f),
    challenge: challenge?.id ?? null,
    score: res.score,
    verdict: res.verdict,
    survived,
    cashEarned,
  };
  const log = [...run.log, fr];
  if (!survived) return { ...run, fixture: f - 1, alive: false, log };
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

function deadFixture(f: number, challenge: ChallengeRule | null): FixtureResult {
  return { fixture: f, boss: isBoss(f), challenge: challenge?.id ?? null, score: [0, 0], verdict: 'loss', survived: false, cashEarned: 0 };
}

/** Simulate a full run for a manager; `committed` picks a matched vs random build. */
export function simulateRun(seed: number, manager: Manager, pool: KCCard[], committed = true): RunState {
  let run = createRun(seed, manager);
  for (let f = 1; f <= RUN_FIXTURES && run.alive && !run.completed; f++) {
    run = applyFixture(run, pool, f, manager, committed);
  }
  return run;
}

// ---- interactive entry points (the P5 UI drives the loop, NW-143) ----------
// The headless path above (simulateRun/applyFixture) auto-drafts and auto-plays.
// An interactive run lets the PLAYER pick the XI and watch the match, so the UI
// needs the fixture set up (opponent + target + a draft pool) and then the
// fixture resolved from the XI it chose. Both stay in the engine — the UI never
// computes game state, it renders what these return (SYNERGY_MODEL §9).

export interface FixtureSetup {
  fixture: number;
  boss: boolean;
  challenge: ChallengeRule | null;
  /** The modelled opponent for this fixture (posture + drafted XI + actions). */
  opponent: Squad;
  /** The shop stream the player drafts their XI from (same sample the bot uses). */
  pool: KCCard[];
  /** The shop-bot's committed XI — the default the player can tweak. */
  suggestedXI: KCCard[];
  formation: FormationId;
}

/** Everything the fixture + squad screens need, computed by the engine. */
export function fixtureSetup(run: RunState, pool: KCCard[]): FixtureSetup {
  const manager = MANAGERS.find((m) => m.id === run.managerId)!;
  const f = run.fixture + 1;
  const challenge = challengeForFixture(run.seed, f);
  const stream = sample(pool, run.seed + f * 101, 200);
  const suggestedXI =
    draftViable(stream, manager, run.seed + f * 101) ??
    fillBalanced(stream, FORMATIONS[manager.formation], run.seed + f * 101) ??
    [];
  const opponent = opponentSquad(pool, f, run.seed + f * 977, challenge);
  return { fixture: f, boss: isBoss(f), challenge, opponent, pool: stream, suggestedXI, formation: manager.formation };
}

/**
 * Resolve a fixture from the PLAYER's chosen XI: build the squad (quality boost +
 * traits + set-piece kit + dial bonus), simulate, then bank the economy /
 * permadeath exactly as the headless `applyFixture` does. Returns the updated run
 * AND the match result (its event log is what the match/post-match screens render).
 * NB: the settlement tail is kept in sync with applyFixture by hand.
 */
export function resolveFixture(
  run: RunState,
  playerXI: KCCard[],
  setup: FixtureSetup,
  /** Tactical plays scheduled so far. The match UI re-resolves with an amended
   *  schedule when the player calls a play between batches — same seed, so the
   *  already-revealed batches replay byte-identically and only the future
   *  re-rolls (determinism is the interactivity mechanism). */
  plays: TacticalPlay[] = []
): { run: RunState; result: MatchResult } {
  const manager = MANAGERS.find((m) => m.id === run.managerId)!;
  const f = setup.fixture;
  const setPieces = !setup.challenge?.noSetPieces && hasKit(playerXI);
  const ps: Squad = {
    cards: boost(playerXI, run.quality),
    manager,
    formation: manager.formation,
    traits: squadTraits(playerXI),
    hasTaker: setPieces,
    hasCarrier: setPieces,
    dialBonus: qualityBonus(run.quality),
    tacticalPlays: plays,
  };
  const res = simulateMatch(ps, setup.opponent, { seed: run.seed + f });
  const survived = res.verdict !== 'loss';
  const cashEarned = purse(res.verdict, res.score[0]);
  const fr: FixtureResult = {
    fixture: f,
    boss: isBoss(f),
    challenge: setup.challenge?.id ?? null,
    score: res.score,
    verdict: res.verdict,
    survived,
    cashEarned,
  };
  const log = [...run.log, fr];
  const nextRun: RunState = survived
    ? {
        ...run,
        fixture: f,
        cash: round1(run.cash + cashEarned + res.cash[0]),
        quality: round1(run.quality + cashEarned * K_QUALITY),
        completed: f >= RUN_FIXTURES,
        alive: true,
        log,
      }
    : { ...run, fixture: f - 1, alive: false, log };
  return { run: nextRun, result: res };
}

/** Deck quality → the flat dial bonus a squad of that quality fields (the shop
 *  preview shows what a purchase buys on the pitch). Mirrors playerSquad. */
export function deckDialBonus(quality: number): Partial<Record<Contest, number>> {
  return qualityBonus(quality);
}

/** Invest cash into the deck (shop): spend `amount`, gain quality at the run's
 *  rate. Clamped to available cash. Pure — returns the updated run. */
export function investCash(run: RunState, amount: number): RunState {
  const spend = Math.max(0, Math.min(amount, Math.floor(run.cash)));
  if (spend <= 0) return run;
  return { ...run, cash: round1(run.cash - spend), quality: round1(run.quality + spend * K_QUALITY) };
}

/** The fixture a run died at (RUN_FIXTURES+1 if it completed). */
export function deathFixture(run: RunState): number {
  if (run.completed) return RUN_FIXTURES + 1;
  const lost = run.log.find((r) => !r.survived);
  return lost ? lost.fixture : run.fixture;
}

// ---- persistence (autosave / resume) --------------------------------------

export function serializeRun(run: RunState): string {
  return JSON.stringify(run);
}

export function deserializeRun(json: string): RunState {
  return JSON.parse(json) as RunState;
}
