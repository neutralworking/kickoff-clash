/**
 * Kickoff Clash V6 — period resolution.
 *
 * The pure threshold/dice core (commit 1) PLUS the 10-step period orchestration
 * (handoff §`resolver.ts`, spec A1/B1/B2):
 *   1 build the effective board after reveals   6 roll remaining tokens
 *   2 create natural chance tokens by sector     7 attribute (presentation only)
 *   3 cancel with opposing DEF                    8 update score
 *   4 apply post-cancellation action effects      9 next reveal priority
 *   5 cap natural chances                        10 immutable state + receipt
 *
 * Conversion is d6-only (A2): the only scoring levers are dice count, scoring
 * faces and rerolls. Attribution runs on a SEPARATE derived RNG so it can never
 * shift a goal result (spec B2); the main stream rolls tokens in a fixed order
 * (sector left→centre→right, player then opponent, creation order).
 */

import type {
  ActiveEffect,
  ChanceRoll,
  ChanceToken,
  ChanceTarget,
  Die,
  MatchLogEvent,
  PeriodResult,
  Sector,
  TeamSide,
  V6MatchState,
} from './types';
import { SECTORS } from './types';
import { V6_BALANCE, type V6Balance } from './balance';
import { makeRng, rollD6, weightedPick, type RngState } from './random';
import { activePlacements, buildBoard, type ActivePlacement } from './board';
import { teamOf, otherSide } from './actions';
import { nextPriority } from './priority';

// ── Pure threshold core (commit 1) ───────────────────────────────────────────

export interface ChanceCount {
  created: number;
  cancelled: number;
  remaining: number;
}

/** Natural chances for one sector (handoff §"ATT/DEF chance resolution"). */
export function naturalChances(
  sectorAttack: number,
  opponentSectorDefence: number,
  balance: V6Balance = V6_BALANCE,
): ChanceCount {
  const created = Math.floor(Math.max(0, sectorAttack) / balance.threshold);
  const cancelled = Math.floor(Math.max(0, opponentSectorDefence) / balance.threshold);
  const remaining = Math.max(0, created - cancelled);
  return { created, cancelled, remaining };
}

/** Apply the natural soft-cap to a per-sector remaining count. */
export function capNaturalChances(remaining: number, balance: V6Balance = V6_BALANCE): number {
  return Math.min(remaining, balance.naturalChanceCapPerSector);
}

/** Absolute per-sector ceiling; action chances may exceed the natural cap by one. */
export function sectorCeiling(hasActionChances: boolean, balance: V6Balance = V6_BALANCE): number {
  return balance.naturalChanceCapPerSector + (hasActionChances ? balance.actionChanceCapBonus : 0);
}

/** No-op kept for API stability — token ids are now deterministic per period. */
export function resetTokenIds(): void {
  /* deterministic ids: no shared counter to reset */
}

/** Build `count` chance tokens for a sector with deterministic ids. */
export function makeTokens(
  side: TeamSide,
  sector: Sector,
  count: number,
  opts: { origin?: 'natural' | 'action'; faces?: Die[]; rerolls?: number; sourceCardId?: string } = {},
  balance: V6Balance = V6_BALANCE,
): ChanceToken[] {
  const origin = opts.origin ?? 'natural';
  const faces = opts.faces ?? [...balance.naturalGoalFaces];
  const tokens: ChanceToken[] = [];
  for (let k = 0; k < count; k++) {
    tokens.push({
      id: `${side}-${sector}-${origin[0]}-${k}`,
      side,
      sector,
      origin,
      faces: [...faces],
      rerolls: opts.rerolls ?? 0,
      sourceCardId: opts.sourceCardId,
    });
  }
  return tokens;
}

/** Roll one chance to a goal (A2): d6, scoring faces, one reroll per available reroll. */
export function rollChanceToGoal(token: ChanceToken, rng: RngState): [ChanceRoll, RngState] {
  let [die, state] = rollD6(rng);
  const rolls: Die[] = [die];
  let scored = token.faces.includes(die);
  let rerolls = token.rerolls;
  while (!scored && rerolls > 0) {
    [die, state] = rollD6(state);
    rolls.push(die);
    scored = token.faces.includes(die);
    rerolls -= 1;
  }
  const roll: ChanceRoll = {
    tokenId: token.id,
    side: token.side,
    sector: token.sector,
    rolls,
    scored,
    attackerCardId: token.attackerCardId,
  };
  return [roll, state];
}

// ── Effect routing ───────────────────────────────────────────────────────────

/** Stat effects that apply to one side's board: own buffs + the enemy's onEnemy debuffs. */
function statEffectsFor(state: V6MatchState, side: TeamSide): ActiveEffect[] {
  const mine = teamOf(state, side).effects.filter((e) => e.kind === 'stat' && !e.onEnemy);
  const enemyDebuffs = teamOf(state, otherSide(side)).effects.filter((e) => e.kind === 'stat' && e.onEnemy);
  return [...mine, ...enemyDebuffs];
}

/** Which tokens a die-modifying effect touches, within the sector being built. */
function selectTokens(tokens: ChanceToken[], sel: ChanceTarget | undefined, sector: Sector, sourceCardId: string): ChanceToken[] {
  if (!sel) return tokens;
  if ('sector' in sel && sel.sector && sel.sector !== sector) return [];
  switch (sel.which) {
    case 'first_in_sector':
      return tokens.slice(0, 1);
    case 'all_in_sector':
      return tokens;
    case 'own':
      return tokens.filter((t) => t.sourceCardId === sourceCardId);
  }
}

/** Widen faces / add rerolls to a sector's tokens from the acting side's ledger. */
function applyChanceMods(tokens: ChanceToken[], effects: readonly ActiveEffect[], sector: Sector): ChanceToken[] {
  const out = tokens.map((t) => ({ ...t, faces: [...t.faces] }));
  for (const eff of effects) {
    if (eff.kind !== 'faces' && eff.kind !== 'reroll') continue;
    for (const t of selectTokens(out, eff.chanceSelector, sector, eff.sourceCardId)) {
      if (eff.kind === 'faces' && eff.faces) {
        t.faces = Array.from(new Set([...t.faces, ...eff.faces])).sort((a, b) => a - b) as Die[];
      } else if (eff.kind === 'reroll') {
        t.rerolls += eff.rerollCount ?? 0;
      }
    }
  }
  return out;
}

/** Natural + action chance tokens for one side in one sector (steps 2–5). */
function buildSectorTokens(
  state: V6MatchState,
  side: TeamSide,
  sector: Sector,
  myAttack: number,
  theirDefence: number,
  balance: V6Balance,
): ChanceToken[] {
  let natural = capNaturalChances(naturalChances(myAttack, theirDefence, balance).remaining, balance);

  // enemy cancel_chance actions (onEnemy) remove my chances in this sector
  const enemyCancels = teamOf(state, otherSide(side))
    .effects.filter((e) => e.kind === 'cancel_chance' && e.onEnemy && e.targetSector === sector)
    .reduce((n, e) => n + (e.count ?? 0), 0);
  natural = Math.max(0, natural - enemyCancels);

  // my add_chance actions add chances in this sector
  const myAdds = teamOf(state, side)
    .effects.filter((e) => e.kind === 'add_chance' && e.targetSector === sector)
    .reduce((n, e) => n + (e.count ?? 0), 0);

  const naturalTokens = makeTokens(side, sector, natural, { origin: 'natural' }, balance);
  const actionTokens = makeTokens(side, sector, myAdds, { origin: 'action' }, balance);
  let toks = [...naturalTokens, ...actionTokens].slice(0, sectorCeiling(actionTokens.length > 0, balance));
  toks = applyChanceMods(toks, teamOf(state, side).effects, sector);
  return toks;
}

// ── Attribution (separate RNG — never affects the result, spec B2) ────────────

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function attribute(state: V6MatchState, roll: ChanceRoll, side: TeamSide): ChanceRoll {
  const sector = roll.sector;
  const mine: ActivePlacement[] = activePlacements(teamOf(state, side).cards, state.cardPool).filter((p) => p.sector === sector);
  let attackerCardId = roll.attackerCardId;
  if (!attackerCardId && mine.length > 0) {
    const [p] = weightedPick(mine, mine.map((c) => Math.max(1, c.card.attack)), makeRng(hashSeed(state.seed, state.period, sector, roll.tokenId, 'att')));
    attackerCardId = p.card.id;
  }
  let saverCardId: string | undefined;
  if (!roll.scored) {
    const theirs = activePlacements(teamOf(state, otherSide(side)).cards, state.cardPool).filter((p) => p.sector === sector);
    if (theirs.length > 0) {
      const [p] = weightedPick(theirs, theirs.map((c) => Math.max(1, c.card.defence)), makeRng(hashSeed(state.seed, state.period, sector, roll.tokenId, 'def')));
      saverCardId = p.card.id;
    }
  }
  return { ...roll, attackerCardId, saverCardId };
}

/**
 * Per-side per-sector stat-driven chance count (the "threshold" the mockup
 * shows). Used by the match loop to tell whether a break changed a threshold —
 * action add/cancel are excluded on purpose; this is the stat threshold only.
 */
export function chanceOutlook(state: V6MatchState, balance: V6Balance = V6_BALANCE): Record<TeamSide, Record<Sector, number>> {
  const pB = buildBoard(activePlacements(state.player.cards, state.cardPool), statEffectsFor(state, 'player'), balance);
  const oB = buildBoard(activePlacements(state.opponent.cards, state.cardPool), statEffectsFor(state, 'opponent'), balance);
  const outlook = (mine: typeof pB, theirs: typeof pB): Record<Sector, number> => {
    const r = { left: 0, centre: 0, right: 0 } as Record<Sector, number>;
    for (const sec of SECTORS) r[sec] = capNaturalChances(naturalChances(mine[sec].attack, theirs[sec].defence, balance).remaining, balance);
    return r;
  };
  return { player: outlook(pB, oB), opponent: outlook(oB, pB) };
}

// ── The period ───────────────────────────────────────────────────────────────

export interface PeriodResolution {
  state: V6MatchState;
  result: PeriodResult;
  rng: RngState;
}

/** Resolve the current period end-to-end (assumes reveals already applied). */
export function resolvePeriod(state: V6MatchState, rng: RngState, balance: V6Balance = V6_BALANCE): PeriodResolution {
  const period = state.period;
  const log: MatchLogEvent[] = [];

  // 1. effective boards after reveals
  const playerBoard = buildBoard(activePlacements(state.player.cards, state.cardPool), statEffectsFor(state, 'player'), balance);
  const oppBoard = buildBoard(activePlacements(state.opponent.cards, state.cardPool), statEffectsFor(state, 'opponent'), balance);
  for (const sec of SECTORS) {
    log.push({ type: 'sector_totals', period, side: 'player', sector: sec, attack: playerBoard[sec].attack, defence: playerBoard[sec].defence });
    log.push({ type: 'sector_totals', period, side: 'opponent', sector: sec, attack: oppBoard[sec].attack, defence: oppBoard[sec].defence });
  }

  // 2–5. tokens per side per sector
  const tokens: ChanceToken[] = [];
  for (const sec of SECTORS) {
    tokens.push(...buildSectorTokens(state, 'player', sec, playerBoard[sec].attack, oppBoard[sec].defence, balance));
    tokens.push(...buildSectorTokens(state, 'opponent', sec, oppBoard[sec].attack, playerBoard[sec].defence, balance));
  }
  for (const t of tokens) log.push({ type: 'chance_created', token: t });

  // 6–8. roll in canonical order, attribute, score
  const rolls: ChanceRoll[] = [];
  let r = rng;
  let playerGoals = 0;
  let opponentGoals = 0;
  for (const sec of SECTORS) {
    for (const side of ['player', 'opponent'] as TeamSide[]) {
      for (const tok of tokens.filter((t) => t.side === side && t.sector === sec)) {
        const [raw, next] = rollChanceToGoal(tok, r);
        r = next;
        const roll = attribute(state, raw, side);
        rolls.push(roll);
        log.push({ type: 'chance_rolled', roll });
        if (roll.scored) {
          if (side === 'player') playerGoals += 1;
          else opponentGoals += 1;
          log.push({ type: 'goal', side, sector: sec, scorerCardId: roll.attackerCardId, roll: roll.rolls });
        }
      }
    }
  }

  // 9. next priority (from the end-of-period boards)
  const nextP = nextPriority(playerBoard, oppBoard, state.priority);
  log.push({ type: 'period_end', period, playerGoals, opponentGoals, nextPriority: nextP });

  // 10. immutable state + receipt
  const next: V6MatchState = {
    ...state,
    player: { ...state.player, score: state.player.score + playerGoals },
    opponent: { ...state.opponent, score: state.opponent.score + opponentGoals },
    log: [...state.log, ...log],
  };
  const result: PeriodResult = { period, chances: tokens, rolls, playerGoals, opponentGoals, nextPriority: nextP, log };
  return { state: next, result, rng: r };
}
