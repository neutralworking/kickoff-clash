/**
 * KC rebuild — dataset regeneration (KC_REBUILD_PLAN_V1 §P3, SM §5).
 *
 * Reads the LIVE 540-card pool (public/data/kc_cards.json — the V3.1 data
 * port; the plan's kc_characters.json reference predates it, see
 * docs/MIGRATION_NOTES.md), assigns 1–2 trait templates per card by
 * position/skillset heuristics (magnitude tier from rarity; Commons draw only
 * broad templates), merges the hand-authored Legendary signatures over the
 * top, and emits src/engine/data/cards.gen.ts.
 *
 * Deterministic and seeded: per-card mulberry32 streams keyed on
 * (REGEN_SEED, card.id), so a re-run is byte-identical and adding a card
 * never reshuffles the rest.
 *
 * The coverage validation post-pass is the build gate (law 5 executable):
 * per-rarity per-context card shares vs REQUIRED_COVERAGE, plus the pool-level
 * dual-axis check. Gaps → docs/coverage_report.md marked FAILED + exit 1.
 *
 *   npx tsx scripts/regenerate_cards.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/engine/rng';
import type { CardTrait, ClusterTag, EngineCard, Rarity } from '../src/engine/cards';
import {
  TRAIT_TEMPLATES,
  REQUIRED_COVERAGE,
  type CoverageContext,
  type TraitTemplate,
} from '../src/engine/data/trait-templates';
import { LEGENDARY_SIGNATURES } from '../src/engine/data/legendaries';

const REGEN_SEED = 7;

// ---------------------------------------------------------------------------
// Source pool
// ---------------------------------------------------------------------------

interface SourceCard {
  id: number;
  name: string;
  position: string;
  skillset: string;
  secondarySkillset?: string;
  role?: string;
  nickname?: string;
  brs: number;
  rarity: Rarity;
  nation?: string;
}

const source: SourceCard[] = JSON.parse(readFileSync('public/data/kc_cards.json', 'utf8'));

// ---------------------------------------------------------------------------
// Heuristics: position + skillset → weighted coverage-context pool
// ---------------------------------------------------------------------------

const POSITION_WEIGHTS: Record<string, Partial<Record<CoverageContext, number>>> = {
  GK: { 'deep-block': 3, 'set-piece': 2, fitness: 1, 'goal-event': 1 },
  CD: { 'deep-block': 3, 'set-piece': 3, transition: 2, scoreline: 1 },
  WD: { transition: 2, 'deep-block': 2, fitness: 2, clock: 1 },
  DM: { possession: 2, 'deep-block': 2, transition: 2, streak: 1 },
  CM: { possession: 3, transition: 2, fitness: 2, 'set-piece': 1, clock: 1, streak: 2 },
  WM: { transition: 2, possession: 2, clock: 2, scoreline: 2, substitution: 2 },
  AM: { possession: 2, 'set-piece': 2, 'goal-event': 2, scoreline: 1, streak: 2 },
  WF: { transition: 3, scoreline: 2, clock: 2, 'goal-event': 1, substitution: 2 },
  CF: { 'goal-event': 3, 'set-piece': 2, streak: 3, scoreline: 2, substitution: 2 },
};

const SKILLSET_BOOST: Record<string, CoverageContext> = {
  Sprinter: 'transition',
  Dribbler: 'transition',
  Passer: 'possession',
  Controller: 'possession',
  Creator: 'possession',
  Target: 'set-piece',
  Powerhouse: 'set-piece',
  Engine: 'fitness',
  Destroyer: 'deep-block',
  Cover: 'deep-block',
  Striker: 'goal-event',
  Shotstopper: 'deep-block',
  Commander: 'deep-block',
};

function contextWeights(card: SourceCard): [CoverageContext, number][] {
  const weights = new Map<CoverageContext, number>();
  for (const [ctx, w] of Object.entries(POSITION_WEIGHTS[card.position] ?? { possession: 1 })) {
    weights.set(ctx as CoverageContext, (weights.get(ctx as CoverageContext) ?? 0) + (w as number));
  }
  for (const skill of [card.skillset, card.secondarySkillset]) {
    const boost = skill && SKILLSET_BOOST[skill];
    if (boost) weights.set(boost, (weights.get(boost) ?? 0) + 2);
  }
  return [...weights.entries()];
}

// ---------------------------------------------------------------------------
// Assignment: 1 trait for Commons (broad only), 2 for Rare+ (narrow-weighted
// at Epic/Legendary). Seeded per card; no duplicate template on one card.
// ---------------------------------------------------------------------------

const TRAIT_COUNT: Record<Rarity, number> = { Common: 1, Rare: 2, Epic: 2, Legendary: 2 };

function eligibleTemplates(context: CoverageContext, rarity: Rarity, pickIndex: number): TraitTemplate[] {
  return TRAIT_TEMPLATES.filter((t) => {
    if (t.covers !== context) return false;
    if (rarity === 'Common') return t.breadth === 'broad';
    if (rarity === 'Rare' && pickIndex === 0) return t.breadth === 'broad';
    return true;
  });
}

function pickWeighted<T>(items: [T, number][], roll: number): T {
  const total = items.reduce((acc, [, w]) => acc + w, 0);
  let cursor = roll * total;
  for (const [item, w] of items) {
    cursor -= w;
    if (cursor < 0) return item;
  }
  return items[items.length - 1][0];
}

function assignTraits(card: SourceCard): CardTrait[] {
  const rng = mulberry32((REGEN_SEED * 1000003 + card.id) | 0);
  const weights = contextWeights(card);
  const picked: CardTrait[] = [];
  const usedTemplates = new Set<string>();
  const count = TRAIT_COUNT[card.rarity];

  for (let i = 0; i < count; i++) {
    // Up to 8 attempts to land a context with an eligible, unused template.
    let template: TraitTemplate | undefined;
    for (let attempt = 0; attempt < 8 && !template; attempt++) {
      const context = pickWeighted(weights, rng());
      const pool = eligibleTemplates(context, card.rarity, i).filter((t) => !usedTemplates.has(t.id));
      if (pool.length === 0) continue;
      // Narrow-weighted for Epic/Legendary second picks; otherwise uniform.
      const narrowBias = (card.rarity === 'Epic' || card.rarity === 'Legendary') && i > 0;
      const weighted: [TraitTemplate, number][] = pool.map((t) => [
        t,
        narrowBias && t.breadth === 'narrow' ? 2 : 1,
      ]);
      template = pickWeighted(weighted, rng());
    }
    if (!template) continue; // exhausted — card keeps fewer traits (validation will tell)
    usedTemplates.add(template.id);
    picked.push({
      templateId: template.id,
      name: template.name,
      verb: template.verb,
      context: template.context,
      magnitude: template.magnitudes[card.rarity],
      ...(template.resource ? { resource: template.resource } : {}),
    });
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Cluster + base contribution
// ---------------------------------------------------------------------------

function clusterOf(card: SourceCard, rng: () => number): ClusterTag {
  if (card.brs < 58) return 'bench';
  if (['GK', 'CD', 'DM', 'CM'].includes(card.position)) return 'spine';
  if (['AM', 'CF'].includes(card.position)) return 'front-line';
  return rng() < 0.5 ? 'left-flank' : 'right-flank';
}

/** brs 52–95 → 0.05–0.25: deliberately mediocre at every rarity (SM §5). */
function baseContribution(brs: number): number {
  return Math.round((0.05 + ((brs - 52) / (95 - 52)) * 0.2) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Build + legendary merge
// ---------------------------------------------------------------------------

const cards: EngineCard[] = source.map((c) => {
  const rng = mulberry32((REGEN_SEED * 7000003 + c.id) | 0);
  return {
    id: c.id,
    name: c.name,
    position: c.position,
    rarity: c.rarity,
    baseContribution: baseContribution(c.brs),
    traits: assignTraits(c),
    cluster: clusterOf(c, rng),
    nation: c.nation,
    role: c.role,
    nickname: c.nickname,
  };
});

for (const sig of LEGENDARY_SIGNATURES) {
  const card = cards.find((c) => c.id === sig.cardId);
  if (!card) throw new Error(`legendary signature for unknown card id ${sig.cardId}`);
  if (card.rarity !== 'Legendary') throw new Error(`signature card ${sig.cardId} is not Legendary`);
  card.traits = sig.traits.map(([templateId, name]) => {
    const t = TRAIT_TEMPLATES.find((x) => x.id === templateId);
    if (!t) throw new Error(`signature references unknown template ${templateId}`);
    return {
      templateId,
      name,
      verb: t.verb,
      context: t.context,
      magnitude: t.magnitudes.Legendary,
      ...(t.resource ? { resource: t.resource } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Coverage validation (the build gate) + report
// ---------------------------------------------------------------------------

const RARITIES: Rarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];
const failures: string[] = [];
const reportRows: string[] = [];

// Pool-level dual-axis check (law 5).
for (const req of REQUIRED_COVERAGE) {
  for (const axis of req.axes) {
    if (!TRAIT_TEMPLATES.some((t) => t.covers === req.context && t.axis === axis)) {
      failures.push(`template pool: no ${axis} template covers '${req.context}'`);
    }
  }
}

// Card-share check per rarity band.
const byRarity = new Map<Rarity, EngineCard[]>(RARITIES.map((r) => [r, cards.filter((c) => c.rarity === r)]));
const coversOf = (c: EngineCard): Set<CoverageContext> =>
  new Set(c.traits.map((t) => TRAIT_TEMPLATES.find((x) => x.id === t.templateId)!.covers));

for (const req of REQUIRED_COVERAGE) {
  for (const rarity of RARITIES) {
    const min = req.minShare[rarity];
    const band = byRarity.get(rarity)!;
    const share = band.filter((c) => coversOf(c).has(req.context)).length / Math.max(1, band.length);
    if (min !== undefined && share < min) {
      failures.push(`coverage: ${req.context} @ ${rarity} = ${(share * 100).toFixed(1)}% < ${(min * 100).toFixed(0)}%`);
    }
    reportRows.push(
      `| ${req.context} | ${rarity} | ${(share * 100).toFixed(1)}% | ${min !== undefined ? `${(min * 100).toFixed(0)}%` : '—'} | ${
        min === undefined ? 'n/a' : share >= min ? 'OK' : '**FAIL**'
      } |`
    );
  }
}

const traitless = cards.filter((c) => c.traits.length === 0);
if (traitless.length > 0) failures.push(`${traitless.length} cards ended up traitless`);

const report = `# Coverage report — generated dataset

Generated by \`scripts/regenerate_cards.ts\` (seed ${REGEN_SEED}) over ${cards.length} cards
(${RARITIES.map((r) => `${byRarity.get(r)!.length} ${r}`).join(' / ')}).
Status: **${failures.length === 0 ? 'PASSED' : 'FAILED'}**${failures.length ? `\n\n${failures.map((f) => `- ${f}`).join('\n')}` : ''}

| Context | Rarity | Share | Min | Check |
|---|---|---|---|---|
${reportRows.join('\n')}
`;

writeFileSync('docs/coverage_report.md', report);

if (failures.length > 0) {
  console.error(`coverage FAILED (${failures.length} gaps) — see docs/coverage_report.md`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const header = `/**
 * GENERATED by scripts/regenerate_cards.ts — DO NOT EDIT.
 * Seed ${REGEN_SEED} over public/data/kc_cards.json (${cards.length} cards); coverage-validated
 * (docs/coverage_report.md). Regenerate: npx tsx scripts/regenerate_cards.ts
 */

import type { EngineCard } from '../cards';

export const ENGINE_CARDS: EngineCard[] = `;

writeFileSync('src/engine/data/cards.gen.ts', header + JSON.stringify(cards, null, 1) + ';\n');
console.log(`wrote src/engine/data/cards.gen.ts (${cards.length} cards) — coverage PASSED`);
