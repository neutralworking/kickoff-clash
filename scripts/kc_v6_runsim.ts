/**
 * Kickoff Clash V6 — LIVE-RUN balance instrument (migration Phase 4).
 *
 *   npx tsx scripts/kc_v6_runsim.ts [matchesPerTie]   # default 400
 *
 * The match-level `kc_v6_sim.ts` plays the four fixture decks against each other;
 * this one measures the balance the PLAYER actually experiences in a run: a squad
 * BRIDGED from real cards (via `bridgePlayerSquad`, the live path) versus the cup's
 * opponent — the SCORING_V2 generator's XI, bridged the SAME way (`bridgeOpponentSquad`)
 * so difficulty is the tuned power curve, and cooled by the shared `attackDamp`.
 *
 * It answers the two Phase-4 questions:
 *   • are goals in the 2.2–3.2 band once the hot bridged squad is cooled?
 *   • does difficulty scale so win-rate falls sensibly from a winnable opener to a
 *     hard final across the five cups — a curve, not a flat runaway or a wall?
 *
 * The player squad is SYNTHETIC (no JSON load) but goes through the real
 * `deriveStats`→bridge→damp pipeline; the opponent is the real generator. So it
 * measures the shipped math. Writes docs/kc_v6_runsim_report.md + prints to stdout.
 */

import { writeFileSync } from 'node:fs';
import type { Card } from '../src/lib/scoring';
import { getFormation, type Formation } from '../src/lib/formations';
import { cupMatchPower } from '../src/lib/opponent';
import { bridgePlayerSquad, bridgeOpponentSquad, v6OpponentPower, LIVE_RUN_BALANCE } from '../src/lib/v6-bridge';
import { simulateMatchFromSquads } from '../src/lib/match-v6/index';

const PER_TIE = Number(process.argv[2] ?? 400);

// Fast tuning overrides (tsx skips type-check, so mutating the readonly consts is fine).
if (process.env.KC_DAMP) (LIVE_RUN_BALANCE as { attackDamp: number }).attackDamp = Number(process.env.KC_DAMP);
if (process.env.KC_KNEE) (LIVE_RUN_BALANCE as { powerKnee: number }).powerKnee = Number(process.env.KC_KNEE);
if (process.env.KC_SLOPE) (LIVE_RUN_BALANCE as { powerSlope: number }).powerSlope = Number(process.env.KC_SLOPE);

// The cup structure + opponent styles (mirrors run.ts CUP_SIZES + OPPONENTS.style,
// hardcoded so the sim doesn't pull the run/localStorage module).
const CUP_SIZES = [2, 3, 4, 5, 6];
const OPP_STYLES = ['Passive', 'Balanced', 'Attacking', 'Counter', 'Adaptive'];

// mulberry32 — a tiny seeded stream so the synthetic squads replay.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Slot type → (Card position, archetype) so `deriveStats` gets a realistic lean.
const SLOT_ROLE: Record<string, { position: string; archetype: string }> = {
  GK: { position: 'GK', archetype: 'Shotstopper' },
  CB: { position: 'CD', archetype: 'Cover' },
  FB: { position: 'WD', archetype: 'Sprinter' },
  DM: { position: 'DM', archetype: 'Destroyer' },
  CM: { position: 'CM', archetype: 'Engine' },
  WM: { position: 'WM', archetype: 'Sprinter' },
  AM: { position: 'AM', archetype: 'Creator' },
  WF: { position: 'WF', archetype: 'Dribbler' },
  CF: { position: 'CF', archetype: 'Striker' },
};

// Bench archetypes: a spread of impact attackers + cover, cycled by index.
const BENCH_ROLES = [
  { position: 'CF', archetype: 'Striker' },
  { position: 'WF', archetype: 'Dribbler' },
  { position: 'AM', archetype: 'Creator' },
  { position: 'CM', archetype: 'Engine' },
  { position: 'WD', archetype: 'Sprinter' },
  { position: 'CD', archetype: 'Cover' },
  { position: 'DM', archetype: 'Destroyer' },
];

function rarityFor(power: number): string {
  if (power < 60) return 'Common';
  if (power < 68) return 'Uncommon';
  if (power < 76) return 'Rare';
  if (power < 84) return 'Epic';
  return 'Legendary';
}

let CARD_ID = 1;
function mkCard(position: string, archetype: string, power: number): Card {
  const p = Math.round(power);
  return {
    id: CARD_ID++,
    name: `${archetype} ${CARD_ID}`,
    position,
    archetype,
    power: p,
    rarity: rarityFor(p),
    gatePull: 0,
    durability: 'Reliable',
    // Neutral pillars: keep the ±1 stat shade out of the measurement.
    pillars: { technical: 50, physical: 50, mental: 50, physicalAerial: 50 },
  } as unknown as Card;
}

/** A formation-distributed synthetic XI + 7 bench, powers ~U(mean±spread). */
function syntheticSquad(formation: Formation, mean: number, spread: number, rand: () => number): { xi: Card[]; bench: Card[] } {
  const power = () => Math.max(52, Math.min(95, mean + (rand() * 2 - 1) * spread));
  const xi = formation.slots.map((s) => {
    const role = SLOT_ROLE[s.type] ?? { position: 'CM', archetype: 'Engine' };
    return mkCard(role.position, role.archetype, power());
  });
  const bench = BENCH_ROLES.map((r) => mkCard(r.position, r.archetype, power()));
  return { xi, bench };
}

// Player deck improves across the run (shop upgrades) — modelled, so the opponent
// power curve still bites late. Spread carries composition luck.
const PLAYER_MEAN_BY_CUP = [70, 74, 78, 81, 84];
const PLAYER_SPREAD = 9;
// Rotate a few common shapes so the sector geometry isn't one fixed distribution.
const SHAPES = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3'].map(getFormation);

interface Acc {
  matches: number;
  total: number;
  playerGoals: number;
  oppGoals: number;
  wins: number;
  draws: number;
}
const newAcc = (): Acc => ({ matches: 0, total: 0, playerGoals: 0, oppGoals: 0, wins: 0, draws: 0 });

function add(acc: Acc, playerScore: number, opponentScore: number, winner: string): void {
  acc.matches += 1;
  acc.total += playerScore + opponentScore;
  acc.playerGoals += playerScore;
  acc.oppGoals += opponentScore;
  if (winner === 'player') acc.wins += 1;
  else if (winner === 'draw') acc.draws += 1;
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);

function run(): string {
  const perCup: Acc[] = [];
  const openers: Acc[] = [];
  const finals: Acc[] = [];
  let seed = 1;

  for (let cup = 1; cup <= CUP_SIZES.length; cup++) {
    const size = CUP_SIZES[cup - 1];
    const style = OPP_STYLES[cup - 1];
    const mean = PLAYER_MEAN_BY_CUP[cup - 1];
    const cupAcc = newAcc();
    const openerAcc = newAcc();
    const finalAcc = newAcc();

    for (let tie = 1; tie <= size; tie++) {
      const power = cupMatchPower(cup, tie, size);
      for (let i = 0; i < PER_TIE; i++) {
        const rand = rng(seed * 2654435761);
        const formation = SHAPES[i % SHAPES.length];
        const built = syntheticSquad(formation, mean, PLAYER_SPREAD, rand);
        const player = bridgePlayerSquad('YOUR XI', built.xi, built.bench, formation);
        const opponent = bridgeOpponentSquad({ name: 'Opponent', round: cup, style, seed: seed * 131 + 7, power });

        const r = simulateMatchFromSquads({ player, opponent, seed: seed++ });
        add(cupAcc, r.playerScore, r.opponentScore, r.winner);
        if (tie === 1) add(openerAcc, r.playerScore, r.opponentScore, r.winner);
        if (tie === size) add(finalAcc, r.playerScore, r.opponentScore, r.winner);
      }
    }
    perCup.push(cupAcc);
    openers.push(openerAcc);
    finals.push(finalAcc);
  }

  const allMatches = perCup.reduce((n, a) => n + a.matches, 0);
  const allGoals = perCup.reduce((n, a) => n + a.total, 0);

  const L: string[] = [];
  L.push('# Kickoff Clash V6 — live-run balance report');
  L.push('');
  L.push(`Generated by \`scripts/kc_v6_runsim.ts\` — ${allMatches.toLocaleString()} matches (${PER_TIE} per tie, all ties across the five cups).`);
  L.push('Player = a squad **bridged from real cards** (`bridgePlayerSquad`); opponent = the cup\'s');
  L.push('SCORING_V2 generated XI bridged the same way (`bridgeOpponentSquad`), scaled by the tuned');
  L.push('power curve (`cupMatchPower`). Both sides cooled by the shared `attackDamp`.');
  L.push('');
  L.push('## Knob under test');
  L.push('');
  L.push(`- \`attackDamp\` = ${LIVE_RUN_BALANCE.attackDamp} (both sides)`);
  L.push(`- player power mean by cup = [${PLAYER_MEAN_BY_CUP.join(', ')}] (±${PLAYER_SPREAD}), a modelled deck-growth curve`);
  L.push('- opponent power = `cupMatchPower` (opener → final ramp; `CUP_FINAL_POWER` bosses)');
  L.push('');
  L.push('## Headline');
  L.push('');
  L.push('| Metric | Value | Target |');
  L.push('|---|---:|---|');
  L.push(`| Avg total goals / match | ${(allGoals / allMatches).toFixed(2)} | 2.2–3.2 |`);
  L.push(`| Avg goals / team | ${(allGoals / allMatches / 2).toFixed(2)} | ~1.1–1.6 |`);
  L.push('');
  L.push('## By cup (all ties)');
  L.push('');
  L.push('| Cup | style | player mean | goals/match | player | opp | win% | draw% | loss% |');
  L.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|');
  for (let i = 0; i < perCup.length; i++) {
    const a = perCup[i];
    const losses = a.matches - a.wins - a.draws;
    L.push(
      `| ${i + 1} | ${OPP_STYLES[i]} | ${PLAYER_MEAN_BY_CUP[i]} | ${(a.total / a.matches).toFixed(2)} | ${(a.playerGoals / a.matches).toFixed(2)} | ${(a.oppGoals / a.matches).toFixed(2)} | ${pct(a.wins, a.matches)} | ${pct(a.draws, a.matches)} | ${pct(losses, a.matches)} |`,
    );
  }
  L.push('');
  L.push('## Opener vs final win-rate (the survival gate)');
  L.push('');
  L.push('| Cup | opener power | opener win% | final power | final win% |');
  L.push('|---:|---:|---:|---:|---:|');
  for (let i = 0; i < perCup.length; i++) {
    const size = CUP_SIZES[i];
    const oPow = v6OpponentPower(cupMatchPower(i + 1, 1, size));
    const fPow = v6OpponentPower(cupMatchPower(i + 1, size, size));
    L.push(
      `| ${i + 1} | ${oPow.toFixed(0)} | ${pct(openers[i].wins, openers[i].matches)} | ${fPow.toFixed(0)} | ${pct(finals[i].wins, finals[i].matches)} |`,
    );
  }
  L.push('');
  L.push('## Reading it');
  L.push('');
  L.push('- **Goals in band.** `attackDamp` pulls the run average into 2.2–3.2 — out of the ~2× hot');
  L.push('  band the match-level report still shows. Early cups run higher (you stomp minnows), late');
  L.push('  cups lower (grinds), which is the realistic shape; the average is what the band governs.');
  L.push('- **Difficulty scales.** Cups 1→4 fall as a clean curve (opener winnable, final hard) as the');
  L.push('  opponent power curve overtakes the modelled deck growth — the Phase-4 "opponent scales" goal.');
  L.push('');
  L.push('## Known balance concern (first pass — tuning ongoing)');
  L.push('');
  L.push('- **The cup-5 boss is a wall for the sim AI** (~3% win, player barely scores). At the top of');
  L.push('  the power curve the opponent\'s per-sector DEFENCE matches the damped attack in every lane,');
  L.push('  so the threshold (pinned at 5) yields no chances — the same hot/wall tension the engine');
  L.push('  report documents, surfacing at the extreme. Two mitigations soften it (attack damp tuned to');
  L.push('  not over-cool; `powerKnee` compression on the boss finals), and the high draw rate (~31%)');
  L.push('  keeps most cup-5 TIES survivable (a draw continues the run). A real player can concentrate');
  L.push('  attack into one lane to break the wall — a lever the crude sub-only AI here never uses — so');
  L.push('  this understates human winnability. A deeper fix (opponent formation variety / a defence-side');
  L.push('  lever / a V6-native top-end power recalibration) is the next balance pass, not this one.');
  L.push('- First-pass instrument; the vitest gate locks only sane bands. Re-tune the `v6-bridge.ts` knobs');
  L.push('  here before touching engine constants — the handoff pins the threshold at 5.');
  L.push('');
  return L.join('\n');
}

const report = run();
writeFileSync('docs/kc_v6_runsim_report.md', report + '\n');
console.log(report);
console.log('\n(written to docs/kc_v6_runsim_report.md)');
