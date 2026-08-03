/**
 * Kickoff Clash V7 — simulation harness (NW-153).
 *
 *   npx tsx scripts/v7-sim.ts [matchesPerConfig]   # default 10000
 *
 * Headless, deterministic AI-v-AI instrument for the shipped `engine-v7`. It
 * shares the exact test fixture (`v7Fixture()` from `src/game-v7/fixtures.ts`) so
 * the sim can never drift from what the suite exercises, and drives the engine
 * primitives directly (period → boundary → break) so BOTH sides can be held to the
 * same break-plan regime — the only way to measure a decision's worth symmetrically.
 *
 * The question (NW-153): does a decision move the result more than the dice do?
 * It answers with a decision delta — the same matched squads played with (a) empty
 * break plans, (b) a naive greedy plan, (c) the strongest plan available — expressed
 * against the goal standard deviation. It also reports per-action goal value and a
 * priority-sensitivity swing.
 *
 * Output: markdown tables to stdout. The headline decision-delta figure is the
 * deliverable recorded on the ticket; this script is how it is produced.
 */

import {
  boardChances,
  calculatedChanceCount,
  effectivePlayers,
  processBoundary,
  resolveBreak,
  resolvePeriod,
  BREAK_ENERGY,
  FINAL_PERIOD,
  type BreakIndex,
  type BreakPlan,
  type CardRegistry,
  type EffectivePlayer,
  type LedgerEffect,
  type PeriodNumber,
  type PeriodSnapshot,
  type TeamSide,
  type V7MatchState,
  type V7TeamState,
} from '../src/engine-v7/index';
import {
  buildBreakPlan,
  buildInitialMatch,
  expect as expectResult,
  noopBreakPlan,
  v7Fixture,
  type BreakDecision,
  type GameRegistry,
  type V7Fixture,
} from '../src/game-v7/index';

const MATCHES = Number(process.argv[2] ?? 10000);

// ── Break-plan regimes ────────────────────────────────────────────────────────
// A regime turns (side, live state) into a legal BreakPlan. All three are applied
// symmetrically to both sides so the decision delta is not confounded by squad edge.

type Regime = 'empty' | 'greedy' | 'strongest';

const teamOf = (state: V7MatchState, side: TeamSide): V7TeamState => (side === 'player' ? state.player : state.opponent);

const sumStat = (players: readonly EffectivePlayer[], key: 'attack' | 'defence'): number =>
  players.reduce((total, p) => total + Math.max(0, p[key]), 0);

/** Naive greedy: the single affordable substitution that most improves this side's
 *  net chance balance (own chances created − chances conceded), respecting the
 *  engine's floor(/5) granularity, or no change if none crosses a boundary. This is
 *  the objective the engine actually rewards, so a sub only "counts" when it moves a
 *  chance count — a raw stat-sum greedy would over-stack attack and inflate the delta. */
function greedySubs(side: TeamSide, state: V7MatchState, registry: CardRegistry, ledger: readonly LedgerEffect[], breakIndex: BreakIndex): BreakDecision['subs'] {
  const own = effectivePlayers(teamOf(state, side), registry, ledger);
  const enemySide: TeamSide = side === 'player' ? 'opponent' : 'player';
  const enemy = effectivePlayers(teamOf(state, enemySide), registry, ledger);
  const ownActive = own.filter((p) => p.zone === 'active');
  const enemyActive = enemy.filter((p) => p.zone === 'active');
  const budget = BREAK_ENERGY[breakIndex] ?? 0;
  const bench = own.filter((p) => p.zone === 'bench' && p.cost <= budget);

  const ownAtt = sumStat(ownActive, 'attack');
  const ownDef = sumStat(ownActive, 'defence');
  const enemyAtt = sumStat(enemyActive, 'attack');
  const enemyDef = sumStat(enemyActive, 'defence');
  const ownChancesBefore = calculatedChanceCount(ownAtt, enemyDef);
  const concededBefore = calculatedChanceCount(enemyAtt, ownDef);

  let best: { outCardId: string; inCardId: string } | null = null;
  let bestNet = 0;
  let bestStat = 0;
  for (const incoming of bench) {
    for (const outgoing of ownActive) {
      const penalty = incoming.naturalSector === outgoing.sector ? 0 : 2;
      const aDelta = Math.max(0, incoming.attack - penalty) - outgoing.attack;
      const dDelta = Math.max(0, incoming.defence - penalty) - outgoing.defence;
      const net = (calculatedChanceCount(ownAtt + aDelta, enemyDef) - ownChancesBefore)
        - (calculatedChanceCount(enemyAtt, ownDef + dDelta) - concededBefore);
      const stat = aDelta + dDelta;
      if (net > bestNet || (net === bestNet && net > 0 && stat > bestStat)) {
        best = { outCardId: outgoing.cardId, inCardId: incoming.cardId };
        bestNet = net;
        bestStat = stat;
      }
    }
  }
  return best && bestNet > 0 ? [best] : [];
}

/** Every legal `activated`-timing action on a still-present active card, each fired
 *  once. In the dev fixture that is Spark (reroll) and Lockdown (cancel enemy chance). */
function allActivations(side: TeamSide, state: V7MatchState, registry: CardRegistry, outgoing: readonly string[]): NonNullable<BreakDecision['activations']> {
  const team = teamOf(state, side);
  const gone = new Set(outgoing);
  const out: NonNullable<BreakDecision['activations']> = [];
  for (const player of team.players) {
    if (player.zone !== 'active' || gone.has(player.cardId)) continue;
    for (const instance of player.actionInstances) {
      const action = registry.actions.get(instance.printedActionId);
      if (!action || action.timing !== 'activated') continue;
      if (instance.remainingCharges !== null && instance.remainingCharges !== undefined && instance.remainingCharges <= 0) continue;
      out.push({ actionInstanceId: instance.instanceId, sourceId: player.cardId });
    }
  }
  return out;
}

function planFor(regime: Regime, side: TeamSide, state: V7MatchState, registry: GameRegistry, ledger: readonly LedgerEffect[], breakIndex: BreakIndex): BreakPlan {
  const team = teamOf(state, side);
  if (regime === 'empty') return noopBreakPlan(side, team, breakIndex);

  const subs = greedySubs(side, state, registry, ledger, breakIndex);
  const activations = regime === 'strongest' ? allActivations(side, state, registry, subs.map((s) => s.outCardId)) : [];
  const decision: BreakDecision = { subs, activations };
  const built = buildBreakPlan(side, team, decision, breakIndex, registry, state.seed);
  if (built.ok) return built.value;
  // Fall back to the sub-only plan, then to a no-op — never feed the engine an illegal plan.
  if (activations.length > 0) {
    const subOnly = buildBreakPlan(side, team, { subs, activations: [] }, breakIndex, registry, state.seed);
    if (subOnly.ok) return subOnly.value;
  }
  return noopBreakPlan(side, team, breakIndex);
}

// ── One match ─────────────────────────────────────────────────────────────────

interface MatchStats {
  home: number;
  away: number;
  // per side: chances created, cancelled, rerolled, scored (summed over the match)
  created: Record<TeamSide, number>;
  cancelled: Record<TeamSide, number>;
  rerolled: Record<TeamSide, number>;
}

interface MatchOptions {
  regime: Regime;
  forcePriority?: TeamSide;
}

function playOne(fixture: V7Fixture, options: MatchOptions): MatchStats {
  const init = expectResult(buildInitialMatch(fixture));
  const registry = init.registry;
  let state = init.state;
  let ledger: LedgerEffect[] = [...init.ledger];
  let chances = boardChances(state, ledger, registry, state.period);

  const created: Record<TeamSide, number> = { player: 0, opponent: 0 };
  const cancelled: Record<TeamSide, number> = { player: 0, opponent: 0 };
  const rerolled: Record<TeamSide, number> = { player: 0, opponent: 0 };

  while (state.period <= FINAL_PERIOD) {
    created.player += chances.player.length;
    created.opponent += chances.opponent.length;
    const period = state.period;

    const resolved = resolvePeriod({ state, ledger, chances, registry });
    state = resolved.state;
    ledger = resolved.ledger;
    for (const token of (resolved.snapshot as PeriodSnapshot).tokenOutcomes) {
      if (token.cancelled) cancelled[token.side] += 1;
      if (token.rerollsUsed > 0) rerolled[token.side] += 1;
    }

    const boundary = processBoundary(state, ledger, registry);
    state = boundary.state;
    ledger = boundary.ledger;
    if (boundary.matchOver) break;

    const breakIndex = period as BreakIndex;
    const upcomingPeriod = (period + 1) as PeriodNumber;
    if (options.forcePriority) state = { ...state, priority: options.forcePriority };
    const plans: Record<TeamSide, BreakPlan> = {
      player: planFor(options.regime, 'player', state, registry, ledger, breakIndex),
      opponent: planFor(options.regime, 'opponent', state, registry, ledger, breakIndex),
    };
    const broken = resolveBreak({ state, ledger, plans, registry, breakIndex, upcomingPeriod });
    state = broken.state;
    ledger = broken.ledger;
    chances = broken.chances;
  }

  return { home: state.player.score, away: state.opponent.score, created, cancelled, rerolled };
}

// ── Aggregation over N deterministic seeds ────────────────────────────────────

interface Aggregate {
  n: number;
  goalsMean: number;
  goalsStd: number;
  homeMean: number;
  awayMean: number;
  zeroPct: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  createdPerPeriod: Record<TeamSide, number>;
  cancelledPct: number; // share of created chances cancelled
  rerolledPct: number; // share of created chances that used a reroll
  topScorelines: string;
}

const seedFor = (i: number): number => 1_000_003 + i * 7919;

function aggregate(fixture: V7Fixture, options: MatchOptions, n: number): Aggregate {
  let goals = 0, goalsSq = 0, home = 0, away = 0, zero = 0, hw = 0, dr = 0, aw = 0;
  let created = 0, createdHome = 0, createdAway = 0, cancelled = 0, rerolled = 0;
  const scorelines = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    const s = playOne({ ...fixture, seed: seedFor(i) }, options);
    const total = s.home + s.away;
    goals += total; goalsSq += total * total; home += s.home; away += s.away;
    if (s.home === 0 && s.away === 0) zero += 1;
    if (s.home > s.away) hw += 1; else if (s.home < s.away) aw += 1; else dr += 1;
    createdHome += s.created.player; createdAway += s.created.opponent;
    created += s.created.player + s.created.opponent;
    cancelled += s.cancelled.player + s.cancelled.opponent;
    rerolled += s.rerolled.player + s.rerolled.opponent;
    const key = `${s.home}-${s.away}`;
    scorelines.set(key, (scorelines.get(key) ?? 0) + 1);
  }
  const mean = goals / n;
  const variance = Math.max(0, goalsSq / n - mean * mean);
  const top = [...scorelines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join('  ');
  return {
    n,
    goalsMean: mean,
    goalsStd: Math.sqrt(variance),
    homeMean: home / n,
    awayMean: away / n,
    zeroPct: (100 * zero) / n,
    homeWinPct: (100 * hw) / n,
    drawPct: (100 * dr) / n,
    awayWinPct: (100 * aw) / n,
    createdPerPeriod: { player: createdHome / n / FINAL_PERIOD, opponent: createdAway / n / FINAL_PERIOD },
    cancelledPct: created > 0 ? (100 * cancelled) / created : 0,
    rerolledPct: created > 0 ? (100 * rerolled) / created : 0,
    topScorelines: top,
  };
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** A fixture copy with one action stripped from every card (and the registry). */
function withoutAction(fixture: V7Fixture, actionId: string): V7Fixture {
  return {
    ...fixture,
    cards: fixture.cards.map((card) => ({ ...card, actionIds: card.actionIds.filter((id) => id !== actionId) })),
    actions: fixture.actions.filter((action) => action.id !== actionId),
  };
}

// ── Report ────────────────────────────────────────────────────────────────────

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

function main(): void {
  const fixture = v7Fixture();
  const n = MATCHES;
  const out: string[] = [];
  const log = (line = '') => out.push(line);

  log(`# V7 simulation — decision vs dice (NW-153)`);
  log('');
  log(`Fixture: \`v7Fixture()\` (shared with \`src/engine-v7/__tests__\`). ${n.toLocaleString()} deterministic matches per configuration. 4 periods, 3 breaks (energy 3/5/7). Both sides held to the same regime.`);
  log('');

  // 1) The three regimes, symmetric.
  const empty = aggregate(fixture, { regime: 'empty' }, n);
  const greedy = aggregate(fixture, { regime: 'greedy' }, n);
  const strongest = aggregate(fixture, { regime: 'strongest' }, n);

  log('## Regime comparison (both sides same plan)');
  log('');
  log('| regime | goals/match | goal σ | 0-0 % | home win % | draw % | away win % | chances/side/period | cancelled % | rerolled % |');
  log('| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |');
  for (const [label, a] of [['empty', empty], ['greedy', greedy], ['strongest', strongest]] as const) {
    const ch = `${f2(a.createdPerPeriod.player)}/${f2(a.createdPerPeriod.opponent)}`;
    log(`| ${label} | ${f2(a.goalsMean)} | ${f2(a.goalsStd)} | ${f1(a.zeroPct)} | ${f1(a.homeWinPct)} | ${f1(a.drawPct)} | ${f1(a.awayWinPct)} | ${ch} | ${f1(a.cancelledPct)} | ${f1(a.rerolledPct)} |`);
  }
  log('');
  log(`Top scorelines (strongest): ${strongest.topScorelines}`);
  log('');

  // 2) Decision delta headline.
  const goalsSpread = Math.max(empty.goalsMean, greedy.goalsMean, strongest.goalsMean) - Math.min(empty.goalsMean, greedy.goalsMean, strongest.goalsMean);
  const winSpread = Math.max(empty.homeWinPct, greedy.homeWinPct, strongest.homeWinPct) - Math.min(empty.homeWinPct, greedy.homeWinPct, strongest.homeWinPct);
  const sigma = empty.goalsStd; // dice-only per-match goal spread = the yardstick
  const ratio = sigma > 0 ? goalsSpread / sigma : 0;

  // Asymmetric cut: one side plans, the other stays empty. This is the sharpest
  // "does a decision beat the dice?" — the win-rate lift over the empty baseline.
  const baseHomeWin = empty.homeWinPct;
  const homeGreedyVsEmpty = asymmetric(fixture, 'greedy', n).homeWinPct;
  const homeStrongVsEmpty = asymmetric(fixture, 'strongest', n).homeWinPct;

  const subValue = greedy.goalsMean - empty.goalsMean;
  const activationValue = strongest.goalsMean - greedy.goalsMean;

  log('## Decision delta — the headline');
  log('');
  log(`- **Goals/match spread across empty→greedy→strongest: ${f2(goalsSpread)} goals**, against a per-match goal σ of ${f2(sigma)} → **${f2(ratio)}σ**.`);
  log(`- Decomposed: substitutions (empty→greedy) = **${subValue >= 0 ? '+' : ''}${f2(subValue)} goals**; activations (greedy→strongest) = **${activationValue >= 0 ? '+' : ''}${f2(activationValue)} goals**.`);
  log(`- Home win% spread across the three symmetric regimes: **${f1(winSpread)} pts** (both sides plan, so squad edge dominates).`);
  log(`- Asymmetric (one side plans, other empty): home win% ${f1(baseHomeWin)}% (empty baseline) → ${f1(homeGreedyVsEmpty)}% greedy → ${f1(homeStrongVsEmpty)}% strongest. **Decision advantage = +${f1(homeStrongVsEmpty - baseHomeWin)} pts** at strongest.`);
  log('');
  log(`> Read: if the goals σ ratio is well below 1 and the win-rate lift is small, a d6 needing a 6 moves the result more than the plan does.`);
  log('');
  log('### Answer — does a decision beat the dice?');
  log('');
  const verdict = ratio >= 1
    ? `**Yes.** On this fixture the plan moves total goals by ${f2(ratio)}σ of the dice-only spread, and a side that plans against a passive opponent lifts its win rate by ${f1(homeStrongVsEmpty - baseHomeWin)} points. Substitutions carry it (${subValue >= 0 ? '+' : ''}${f2(subValue)} goals); the fixture's activations add only ${activationValue >= 0 ? '+' : ''}${f2(activationValue)}.`
    : `**Marginally.** The plan moves total goals by ${f2(ratio)}σ of the dice-only spread and lifts a planning side's win rate by ${f1(homeStrongVsEmpty - baseHomeWin)} points — the dice still dominate.`;
  log(verdict);
  log('');
  log(`Note on the empty baseline: \`empty\` here is **both** sides passive (${f2(empty.goalsMean)} goals). The NW-152 reference of 3.31 was measured through \`V7MatchController\`, which always plays a greedy opponent — i.e. player-passive vs greedy-opponent, which sits between \`empty\` and \`greedy\` here.`);
  log('');

  // 3) Per-action goal value (strongest regime, action removed vs present).
  log('## Per-action value (strongest regime)');
  log('');
  log('| action | goals/match with | without | Δ goals | note |');
  log('| --- | --: | --: | --: | --- |');
  const notes: Record<string, string> = {
    act_talisman: 'game_start +2 ATT (auto)',
    act_wall: 'ongoing +2 DEF (auto)',
    act_spark: 'activated reroll',
    act_lockdown: 'activated cancel enemy chance',
  };
  for (const action of fixture.actions) {
    const without = aggregate(withoutAction(fixture, action.id), { regime: 'strongest' }, n);
    const delta = strongest.goalsMean - without.goalsMean;
    log(`| ${action.name} | ${f2(strongest.goalsMean)} | ${f2(without.goalsMean)} | ${delta >= 0 ? '+' : ''}${f2(delta)} | ${notes[action.id] ?? action.timing} |`);
  }
  log('');

  // 4) Priority sensitivity (strongest regime, priority forced each way).
  const priPlayer = aggregate(fixture, { regime: 'strongest', forcePriority: 'player' }, n);
  const priOpponent = aggregate(fixture, { regime: 'strongest', forcePriority: 'opponent' }, n);
  log('## Priority sensitivity (strongest regime)');
  log('');
  log('| priority forced to | home win % | draw % | away win % |');
  log('| --- | --: | --: | --: |');
  log(`| home (player) | ${f1(priPlayer.homeWinPct)} | ${f1(priPlayer.drawPct)} | ${f1(priPlayer.awayWinPct)} |`);
  log(`| away (opponent) | ${f1(priOpponent.homeWinPct)} | ${f1(priOpponent.drawPct)} | ${f1(priOpponent.awayWinPct)} |`);
  log(`| **swing (home win%)** | **${f1(priPlayer.homeWinPct - priOpponent.homeWinPct)} pts** | | |`);
  log('');
  const prioritySwing = priPlayer.homeWinPct - priOpponent.homeWinPct;
  if (Math.abs(prioritySwing) < 0.5) {
    log(`Priority is **inert here**: with locked plans and the fixture's unconditional actions, resolution order (who reveals first) never changes the outcome. Priority's A1 edge is informational — it only bites when the trailing side plans *reactively* to the leader's revealed board (the interactive scanner flow), or when an action's condition reads the enemy board. A headless locked-plan sim cannot exercise that, so this figure is a floor, not the ceiling of priority's value.`);
    log('');
  }
  log(`Baseline (tilted dev fixture, no decisions, from NW-152): avgHome≈1.57 avgAway≈1.74 goals≈3.31 0-0≈2.8%.`);

  process.stdout.write(out.join('\n') + '\n');
}

/** Home side plays `regime`, away side stays empty. */
function asymmetric(fixture: V7Fixture, regime: Regime, n: number): { homeWinPct: number } {
  let hw = 0;
  for (let i = 0; i < n; i += 1) {
    const s = playOneAsym({ ...fixture, seed: seedFor(i) }, regime);
    if (s.home > s.away) hw += 1;
  }
  return { homeWinPct: (100 * hw) / n };
}

function playOneAsym(fixture: V7Fixture, homeRegime: Regime): MatchStats {
  const init = expectResult(buildInitialMatch(fixture));
  const registry = init.registry;
  let state = init.state;
  let ledger: LedgerEffect[] = [...init.ledger];
  let chances = boardChances(state, ledger, registry, state.period);
  const zero: Record<TeamSide, number> = { player: 0, opponent: 0 };

  while (state.period <= FINAL_PERIOD) {
    const period = state.period;
    const resolved = resolvePeriod({ state, ledger, chances, registry });
    state = resolved.state;
    ledger = resolved.ledger;
    const boundary = processBoundary(state, ledger, registry);
    state = boundary.state;
    ledger = boundary.ledger;
    if (boundary.matchOver) break;
    const breakIndex = period as BreakIndex;
    const upcomingPeriod = (period + 1) as PeriodNumber;
    const plans: Record<TeamSide, BreakPlan> = {
      player: planFor(homeRegime, 'player', state, registry, ledger, breakIndex),
      opponent: noopBreakPlan('opponent', state.opponent, breakIndex),
    };
    const broken = resolveBreak({ state, ledger, plans, registry, breakIndex, upcomingPeriod });
    state = broken.state;
    ledger = broken.ledger;
    chances = broken.chances;
  }
  return { home: state.player.score, away: state.opponent.score, created: zero, cancelled: zero, rerolled: zero };
}

main();
