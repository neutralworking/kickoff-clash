/**
 * KC six-contest engine (NW-141) — card dataset regeneration (Fork A).
 *
 * The Fork A counterpart to the SM-era regenerate_cards.ts: reads the live pool
 * (public/data/kc_cards.json), assigns each card a six-contest ROLE (position ×
 * contest) by a deterministic position/profile heuristic, computes
 * role-correlated ATT/DEF (§4.1) shaded by the card's BRS, carries rarity → the
 * action tier, and attaches the role's action from the catalogue (data/actions).
 * Writes public/data/kc_v2_cards.json (the live kc_cards.json is untouched) and
 * docs/coverage_report_v2.md. Runs coverage validation and EXITS NON-ZERO on a
 * gap, so the dataset can gate CI.
 *
 *   npx tsx scripts/kc_v2_regenerate.ts [seed]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RngStream } from '../src/engine-v2/rng';
import { ROLES_BY_POS, tiltValue, type RoleDef } from '../src/engine-v2/data/roles';
import { CATALOGUE, type Rarity } from '../src/engine-v2/data/actions';
import { CONTESTS, type Contest, type Position } from '../src/engine-v2/contests';
import type { KCCardJSON } from '../src/engine-v2/cards';

const ROOT = join(__dirname, '..');
const SEED = Number(process.argv[2] ?? 20260709);

interface SrcCard {
  id: number;
  name: string;
  position: Position;
  skillset: string;
  role: string;
  nickname?: string;
  brs: number;
  rarity: Rarity;
  pillars: { technical: number; tactical: number; mental: number; physical: number };
}

// role-correlated stat profiles (§4.1) — contest → (ATT μ, DEF μ)
const PROFILE: Record<Contest, [number, number]> = {
  FINISH: [72, 34],
  CREATE: [66, 38],
  KEEP: [52, 52],
  PRESS: [42, 62],
  BREAK: [40, 63],
  STOP: [32, 68],
};

// skillset → its natural contest lean
const SKILL_CONTEST: Record<string, Contest> = {
  Shotstopper: 'STOP',
  Cover: 'STOP',
  Commander: 'STOP',
  Powerhouse: 'BREAK',
  Destroyer: 'BREAK',
  Engine: 'PRESS',
  Sprinter: 'PRESS',
  Passer: 'KEEP',
  Controller: 'KEEP',
  Creator: 'CREATE',
  Dribbler: 'CREATE',
  Striker: 'FINISH',
  Target: 'FINISH',
};

// pillar → contest affinity (dot with the card's pillars)
const PILLAR_AFFINITY: Record<Contest, [number, number, number, number]> = {
  // [technical, tactical, mental, physical]
  CREATE: [3, 1, 0, 0],
  KEEP: [2, 2, 0, 0],
  FINISH: [2, 0, 1, 1],
  PRESS: [0, 2, 1, 2],
  BREAK: [0, 1, 2, 2],
  STOP: [0, 1, 2, 3],
};

const AERIAL_ROLES = new Set(['Colossus', 'Wide Target Forward', 'Incursore', 'Prima Punta']);
const clip = (x: number) => Math.max(1, Math.min(99, Math.round(x)));

function contestScore(card: SrcCard, contest: Contest): number {
  const p = card.pillars;
  const [wt, wta, wm, wp] = PILLAR_AFFINITY[contest];
  const pillar = (wt * p.technical + wta * p.tactical + wm * p.mental + wp * p.physical) / 50;
  const skill = SKILL_CONTEST[card.skillset] === contest ? 6 : 0;
  return skill + pillar;
}

function main() {
  const src: SrcCard[] = JSON.parse(readFileSync(join(ROOT, 'public/data/kc_cards.json'), 'utf8'));
  const rng = new RngStream(SEED);

  // pass 1 — assign each card the best-affinity role available at its position,
  // round-robining within a (pos, contest) cell so its roles all get fed.
  const cellCursor = new Map<string, number>();
  const assigned: { card: SrcCard; role: RoleDef }[] = [];
  // deterministic order: by id
  for (const card of [...src].sort((a, b) => a.id - b.id)) {
    const roles = ROLES_BY_POS[card.position] ?? [];
    if (!roles.length) continue;
    const contestsHere = [...new Set(roles.map((r) => r.contest))];
    // pick the highest-scoring available contest (deterministic tiebreak by CONTESTS order)
    let best = contestsHere[0];
    let bestScore = -Infinity;
    for (const c of contestsHere) {
      const s = contestScore(card, c) + rng.float() * 0.001; // stable jitter to break exact ties
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    const cellRoles = roles.filter((r) => r.contest === best);
    const key = `${card.position}:${best}`;
    const cur = cellCursor.get(key) ?? 0;
    cellCursor.set(key, cur + 1);
    assigned.push({ card, role: cellRoles[cur % cellRoles.length] });
  }

  // pass 2 — coverage repair: every role must have ≥1 card. Pull from the
  // most-populous sibling role at the same position.
  const byRole = new Map<string, { card: SrcCard; role: RoleDef }[]>();
  for (const a of assigned) (byRole.get(a.role.name) ?? byRole.set(a.role.name, []).get(a.role.name)!).push(a);
  for (const [pos, roles] of Object.entries(ROLES_BY_POS)) {
    for (const role of roles) {
      if ((byRole.get(role.name)?.length ?? 0) > 0) continue;
      // find the largest sibling role at this position and steal one
      const siblings = roles
        .map((r) => ({ r, list: byRole.get(r.name) ?? [] }))
        .filter((s) => s.list.length > 1)
        .sort((a, b) => b.list.length - a.list.length);
      if (!siblings.length) continue;
      const donor = siblings[0];
      const moved = donor.list.pop()!;
      moved.role = role;
      (byRole.get(role.name) ?? byRole.set(role.name, []).get(role.name)!).push(moved);
    }
  }

  // build the output rows
  const out: KCCardJSON[] = assigned
    .sort((a, b) => a.card.id - b.card.id)
    .map(({ card, role }) => {
      const [ma, md] = PROFILE[role.contest];
      const shade = (card.brs - 69) * 0.6;
      return {
        id: `v2-${card.id}`,
        name: card.name,
        nickname: card.nickname,
        pos: card.position,
        role: role.name,
        contest: role.contest,
        tilt: tiltValue(role.tilt),
        rarity: card.rarity,
        att: clip(ma + shade),
        def: clip(md + shade),
        ...(AERIAL_ROLES.has(role.name) ? { aerial: true } : {}),
      };
    });

  // ---- coverage validation ----
  const gaps: string[] = [];
  const roleCount = new Map<string, number>();
  const contestCards = new Map<Contest, number>();
  const contestCommons = new Map<Contest, number>();
  for (const r of out) {
    roleCount.set(r.role, (roleCount.get(r.role) ?? 0) + 1);
    contestCards.set(r.contest, (contestCards.get(r.contest) ?? 0) + 1);
    if (r.rarity === 'Common') contestCommons.set(r.contest, (contestCommons.get(r.contest) ?? 0) + 1);
  }
  // 1. all 45 roles present
  for (const roles of Object.values(ROLES_BY_POS))
    for (const role of roles) if (!roleCount.get(role.name)) gaps.push(`role ${role.name} has 0 cards`);
  // 2. every contest has enough cards to field a build
  for (const c of CONTESTS) if ((contestCards.get(c) ?? 0) < 20) gaps.push(`contest ${c} has <20 cards (${contestCards.get(c) ?? 0})`);
  // 3. every contest is draftable from Commons (new-player fuel)
  for (const c of CONTESTS) if ((contestCommons.get(c) ?? 0) < 8) gaps.push(`contest ${c} has <8 Common cards (${contestCommons.get(c) ?? 0})`);
  // 4. dual-axis per pool (design law 5): each contest carries both axes
  for (const c of CONTESTS) {
    const pool = Object.values(CATALOGUE).filter((a) => {
      const role = Object.values(ROLES_BY_POS).flat().find((r) => r.name === a.role);
      return role?.contest === c;
    });
    if (!pool.some((a) => a.axis === 'amplify')) gaps.push(`pool ${c} has no amplification action`);
    if (!pool.some((a) => a.axis === 'consistency')) gaps.push(`pool ${c} has no consistency action`);
    if (!pool.some((a) => a.buildAround)) gaps.push(`pool ${c} has no build-around`);
  }

  // ---- report ----
  const lines: string[] = [
    '# Coverage report — kc_v2_cards.json (NW-141, Fork A)',
    '',
    `Generated by \`scripts/kc_v2_regenerate.ts\` (seed ${SEED}). ${out.length} cards.`,
    '',
    '## Cards per contest',
    '',
    '| Contest | Cards | Commons | Roles |',
    '|---|--:|--:|--:|',
    ...CONTESTS.map((c) => {
      const roles = Object.values(ROLES_BY_POS).flat().filter((r) => r.contest === c);
      return `| ${c} | ${contestCards.get(c) ?? 0} | ${contestCommons.get(c) ?? 0} | ${roles.length} |`;
    }),
    '',
    '## Cards per role',
    '',
    '| Role | Pos | Contest | Cards |',
    '|---|---|---|--:|',
    ...Object.values(ROLES_BY_POS)
      .flat()
      .map((r) => `| ${r.name} | ${r.pos} | ${r.contest} | ${roleCount.get(r.name) ?? 0} |`),
    '',
    `## Validation: ${gaps.length ? '❌ FAIL' : '✅ PASS'}`,
    '',
    ...(gaps.length ? gaps.map((g) => `- ${g}`) : ['All coverage thresholds met (roles, contest supply, Commons fuel, dual-axis, build-arounds).']),
    '',
  ];

  writeFileSync(join(ROOT, 'public/data/kc_v2_cards.json'), JSON.stringify(out, null, 0));
  writeFileSync(join(ROOT, 'docs/coverage_report_v2.md'), lines.join('\n'));
  console.log(`wrote public/data/kc_v2_cards.json (${out.length} cards) + docs/coverage_report_v2.md`);
  console.log(gaps.length ? `COVERAGE FAIL:\n  ${gaps.join('\n  ')}` : 'COVERAGE PASS');
  if (gaps.length) process.exit(1);
}

main();
