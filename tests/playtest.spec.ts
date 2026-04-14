import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Card } from '../src/lib/scoring';
import type { RunState } from '../src/lib/run';
import { ALL_CARDS } from '../src/lib/run';

const STORAGE_KEY = 'kickoff-clash-v4-run';
const HISTORY_KEY = 'kickoff-clash-v4-history';
const REPORT_PATH = path.join(process.cwd(), 'test-results', 'playtest-report.json');
const REPORT_MD_PATH = path.join(process.cwd(), 'test-results', 'playtest-report.md');
const tuningReport: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  results: {},
};

interface SerializedRunState extends Omit<RunState, 'jokers' | 'tacticsDeck'> {
  jokerIds: string[];
  tacticIds: string[];
}

function cloneCard(card: Card, id: number, overrides: Partial<Card> = {}): Card {
  return { ...card, id, ...overrides };
}

function pickCard(position: string, archetype?: string, excludeIds: number[] = []): Card {
  const card = ALL_CARDS
    .filter((candidate) => candidate.position === position)
    .filter((candidate) => !archetype || candidate.archetype === archetype)
    .filter((candidate) => !excludeIds.includes(candidate.id))
    .sort((a, b) => b.power - a.power)[0];

  if (!card) {
    throw new Error(`Unable to find card for ${position}${archetype ? `/${archetype}` : ''}`);
  }

  return card;
}

function takeCard(usedIds: number[], position: string, archetype?: string): Card {
  const card = pickCard(position, archetype, usedIds);
  usedIds.push(card.id);
  return card;
}

function serializeRun(state: RunState): string {
  const { jokers, tacticsDeck, ...rest } = state;
  const serialized: SerializedRunState = {
    ...rest,
    jokerIds: jokers.map((joker) => joker.id),
    tacticIds: tacticsDeck.map((tactic) => tactic.id),
  };
  return JSON.stringify(serialized);
}

function buildRunState(overrides: Partial<RunState> & Pick<RunState, 'deck' | 'playingStyle' | 'activeFormation' | 'formation'>): RunState {
  return {
    formation: overrides.formation,
    playingStyle: overrides.playingStyle,
    deck: overrides.deck,
    bench: overrides.deck,
    jokers: [],
    ownedFormations: [overrides.activeFormation],
    tacticsDeck: [],
    activeFormation: overrides.activeFormation,
    trainingApplied: {},
    cash: 18_000,
    stadiumTier: 1,
    ticketPriceBonus: 0,
    academyTier: 1,
    scoutedOpponentRound: null,
    round: 1,
    seasonPoints: 0,
    boardTargetPoints: 10,
    wins: 0,
    losses: 0,
    status: 'match',
    matchHistory: [],
    modifiers: [],
    seed: 10101,
    ...overrides,
  };
}

async function seedRun(page: Page, state: RunState) {
  await page.addInitScript(
    ({ runKey, historyKey, payload }) => {
      window.localStorage.removeItem(historyKey);
      window.localStorage.setItem(runKey, payload);
    },
    { runKey: STORAGE_KEY, historyKey: HISTORY_KEY, payload: serializeRun(state) },
  );
}

async function gotoMatchFromSavedRun(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /continue run/i }).click();
  await expect(page.getByText(/play call/i)).toBeVisible();
}

async function gotoShopFromSavedRun(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /continue run/i }).click();
  await expect(page.getByText(/transfer window/i)).toBeVisible();
}

async function quickReveal(page: Page) {
  const readyButton = page.getByRole('button', { name: /^ready$/i });
  for (let i = 0; i < 30; i += 1) {
    if (await readyButton.isVisible()) break;
    await page.locator('body').click({ position: { x: 40, y: 40 } });
    await page.waitForTimeout(150);
  }
  await expect(readyButton).toBeVisible();
  await readyButton.click();
}

async function startNewSeason(page: Page, packName: RegExp, styleName: RegExp) {
  await page.goto('/');
  await page.getByRole('button', { name: /new season/i }).click();
  await page.getByRole('button', { name: packName }).click();
  await page.getByRole('button', { name: styleName }).click();
  await page.getByRole('button', { name: /^open pack$/i }).click();
  await quickReveal(page);
  await expect(page.getByText(/play call/i)).toBeVisible();
}

async function commitCardsByName(page: Page, names: string[]) {
  for (const name of names) {
    await page.locator('.match-card-rail').nth(1).getByText(name, { exact: false }).click();
  }
}

async function dragAttackerByName(page: Page, source: string, target: string) {
  const attackRail = page.locator('.match-card-rail').first();
  await attackRail.locator('[role="button"]').filter({ hasText: source }).first().dragTo(
    attackRail.locator('[role="button"]').filter({ hasText: target }).first(),
  );
}

async function kickoffAndSkip(page: Page) {
  await page.getByRole('button', { name: /^kick off$/i }).click();
  await page.getByRole('button', { name: /skip/i }).click({ force: true });
  await page.waitForTimeout(250);
}

async function reachHalftime(page: Page) {
  for (let i = 0; i < 2; i += 1) {
    if (await page.getByRole('button', { name: /^kick off$/i }).isVisible()) {
      await kickoffAndSkip(page);
      continue;
    }

    if (await page.getByRole('button', { name: /continue/i }).isVisible()) {
      await page.getByRole('button', { name: /continue/i }).click();
      i -= 1;
      continue;
    }
  }
  await expect(page.getByText(/half time/i)).toBeVisible();
}

async function advanceMatchUntilPostmatch(page: Page) {
  for (let step = 0; step < 12; step += 1) {
    if (await page.getByRole('button', { name: /^continue to shop$/i }).isVisible()) {
      return;
    }

    if (await page.getByRole('button', { name: /^kick off$/i }).isVisible()) {
      const defenderButtons = page.locator('.match-card-rail').nth(1).locator('[role="button"]');
      const available = await defenderButtons.count();
      for (let i = 0; i < Math.min(3, available); i += 1) {
        await defenderButtons.nth(i).click();
      }
      await kickoffAndSkip(page);
      continue;
    }

    if (await page.getByRole('button', { name: /second half/i }).isVisible()) {
      await page.getByRole('button', { name: /second half/i }).click();
      continue;
    }

    const betweenContinue = page.getByRole('button', { name: /continue/i }).filter({
      hasNot: page.getByText(/continue to shop/i),
    });
    if (await betweenContinue.first().isVisible()) {
      await betweenContinue.first().click();
      continue;
    }

    if (await page.getByRole('button', { name: /^continue$/i }).isVisible()) {
      await page.getByRole('button', { name: /^continue$/i }).click();
      continue;
    }

    await page.waitForTimeout(300);
  }

  await expect(page.getByRole('button', { name: /^continue to shop$/i })).toBeVisible();
}

function rail(page: Page, index: number): Locator {
  return page.locator('.match-card-rail').nth(index);
}

async function readPlanningMetrics(page: Page): Promise<{
  playCall: string;
  create: number;
  finish: number;
}> {
  const bodyText = await page.locator('body').innerText();
  const playCallMatch = bodyText.match(/Play Call \|\s*([^\n]+)/);
  const chanceMatch = bodyText.match(/Create\s+(\d+)\s+\|\s+Finish\s+(\d+)/);

  if (!playCallMatch || !chanceMatch) {
    throw new Error('Unable to read planning metrics from UI');
  }

  return {
    playCall: playCallMatch[1].trim(),
    create: Number(chanceMatch[1]),
    finish: Number(chanceMatch[2]),
  };
}

async function applyNamedPlan(page: Page, names: string[]) {
  const defenceRail = rail(page, 1);
  for (const name of names) {
    const candidate = defenceRail.locator('[role="button"]').filter({ hasText: name }).first();
    if (await candidate.count()) {
      await candidate.click();
    }
  }
}

async function playMatchWithPlan(page: Page, names: string[]) {
  for (let step = 0; step < 16; step += 1) {
    if (await page.getByRole('button', { name: /^continue to shop$/i }).isVisible()) {
      break;
    }

    if (await page.getByRole('button', { name: /^kick off$/i }).isVisible()) {
      await applyNamedPlan(page, names);
      await kickoffAndSkip(page);
      continue;
    }

    if (await page.getByRole('button', { name: /second half/i }).isVisible()) {
      await page.getByRole('button', { name: /second half/i }).click();
      continue;
    }

    const betweenContinue = page.getByRole('button', { name: /continue/i }).filter({
      hasNot: page.getByText(/continue to shop/i),
    });
    if (await betweenContinue.first().isVisible()) {
      await betweenContinue.first().click();
      continue;
    }

    if (await page.getByRole('button', { name: /^continue$/i }).isVisible()) {
      await page.getByRole('button', { name: /^continue$/i }).click();
      continue;
    }

    await page.waitForTimeout(200);
  }

  await expect(page.locator('.phase-postmatch')).toBeVisible();
}

async function readPostMatchSummary(page: Page): Promise<{
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
}> {
  const text = await page.locator('.phase-postmatch').innerText();
  const scoreMatch = text.match(/Full Time\s+(\d+)\s*-\s*(\d+)/i);
  const resultMatch = text.match(/\b(WIN|DRAW|LOSS)\b/);

  if (!scoreMatch || !resultMatch) {
    throw new Error('Unable to read post-match summary');
  }

  return {
    yourGoals: Number(scoreMatch[1]),
    opponentGoals: Number(scoreMatch[2]),
    result: resultMatch[1].toLowerCase() as 'win' | 'draw' | 'loss',
  };
}

function pointsForResult(result: 'win' | 'draw' | 'loss') {
  if (result === 'win') return 3;
  if (result === 'draw') return 1;
  return 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function recordReport(key: string, value: unknown) {
  (tuningReport.results as Record<string, unknown>)[key] = value;
}

function renderMarkdownReport(report: Record<string, unknown>) {
  const results = report.results as Record<string, unknown>;
  const lines = ['# Playtest Report', '', `Generated: ${report.generatedAt as string}`, ''];

  for (const [key, value] of Object.entries(results)) {
    lines.push(`## ${key}`);
    lines.push('```json');
    lines.push(JSON.stringify(value, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ runKey, historyKey }) => {
      window.localStorage.removeItem(runKey);
      window.localStorage.removeItem(historyKey);
    },
    { runKey: STORAGE_KEY, historyKey: HISTORY_KEY },
  );
});

test.afterAll(async () => {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(tuningReport, null, 2));
  fs.writeFileSync(REPORT_MD_PATH, renderMarkdownReport(tuningReport));
});

test('smoke playtest reaches match, post-match, and shop', async ({ page }) => {
  const notes: string[] = [];

  await startNewSeason(page, /the academy/i, /direct play/i);

  const defenderButtons = rail(page, 1).locator('[role="button"]');
  for (let i = 0; i < Math.min(3, await defenderButtons.count()); i += 1) {
    await defenderButtons.nth(i).click();
  }

  const sequenceLine = page.getByText(/^Sequence:/i);
  const before = (await sequenceLine.textContent()) ?? '';
  if (await rail(page, 0).locator('[role="button"]').count() >= 2) {
    await rail(page, 0).locator('[role="button"]').nth(0).dragTo(rail(page, 0).locator('[role="button"]').last());
    notes.push(`Smoke flow attempted drag from "${before}" to "${(await sequenceLine.textContent()) ?? ''}".`);
  }

  notes.push((await page.getByText(/play call/i).textContent()) ?? 'Play call unavailable');
  await kickoffAndSkip(page);
  await advanceMatchUntilPostmatch(page);

  const resultBanner = page.locator('.phase-postmatch').getByText(/win|draw|loss/i).first();
  await expect(resultBanner).toBeVisible();
  notes.push(`Post-match reached with banner "${(await resultBanner.textContent()) ?? 'unknown'}".`);

  await page.getByRole('button', { name: /^continue to shop$/i }).click();
  await expect(page.getByText(/transfer window/i)).toBeVisible();
  await expect(page.getByText(/prospect intake/i)).toBeVisible();
  await expect(page.getByText(/training ground/i)).toBeVisible();

  test.info().annotations.push({
    type: 'playtest-notes',
    description: notes.join(' '),
  });
  recordReport('smoke_flow', { notes });
});

test('compact route one play is surfaced from goalkeeper to striker sequence', async ({ page }) => {
  const used: number[] = [];
  const routeKeeper = takeCard(used, 'GK');
  const routeStriker = takeCard(used, 'CF', 'Sprinter');
  const deck = [
    cloneCard(routeKeeper, 5001),
    cloneCard(routeStriker, 5002),
    cloneCard(takeCard(used, 'CD'), 5003),
    cloneCard(takeCard(used, 'CD'), 5004),
    cloneCard(takeCard(used, 'CD'), 5005),
    cloneCard(takeCard(used, 'WD'), 5006),
    cloneCard(takeCard(used, 'WD'), 5007),
    cloneCard(takeCard(used, 'CM', 'Engine'), 5008),
    cloneCard(takeCard(used, 'CM', 'Controller'), 5009),
    cloneCard(takeCard(used, 'CM', 'Passer'), 5010),
    cloneCard(takeCard(used, 'CF', 'Target'), 5011),
  ];

  await seedRun(page, buildRunState({
    deck,
    activeFormation: '5-3-2',
    formation: '5-3-2',
    playingStyle: 'direct-play',
    seed: 1234,
  }));
  await gotoMatchFromSavedRun(page);

  await commitCardsByName(page, [routeKeeper.name, routeStriker.name]);
  await expect(page.getByText(/play call \| route one/i)).toBeVisible();
  await expect(page.getByText(new RegExp(`Finish through ${routeStriker.name}`, 'i'))).toBeVisible();
  await expect(page.getByText(/goes long early/i)).toBeVisible();
});

test('wide play can be reordered into a wing overload with an intended finisher', async ({ page }) => {
  const used: number[] = [];
  const leftWing = takeCard(used, 'WF', 'Dribbler');
  const playmaker = takeCard(used, 'CM', 'Creator');
  const rightWing = takeCard(used, 'WF', 'Sprinter');
  const striker = takeCard(used, 'CF', 'Striker');
  const engine = takeCard(used, 'CM', 'Engine');

  const deck = [
    cloneCard(takeCard(used, 'GK'), 6001),
    cloneCard(takeCard(used, 'WD'), 6002),
    cloneCard(takeCard(used, 'CD'), 6003),
    cloneCard(takeCard(used, 'CD'), 6004),
    cloneCard(takeCard(used, 'WD'), 6005),
    cloneCard(takeCard(used, 'CM', 'Controller'), 6006),
    cloneCard(engine, 6007),
    cloneCard(playmaker, 6008),
    cloneCard(leftWing, 6009),
    cloneCard(striker, 6010),
    cloneCard(rightWing, 6011),
  ];

  await seedRun(page, buildRunState({
    deck,
    activeFormation: '4-3-3',
    formation: '4-3-3',
    playingStyle: 'total-football',
    seed: 2222,
  }));
  await gotoMatchFromSavedRun(page);

  await commitCardsByName(page, [leftWing.name, playmaker.name, rightWing.name, engine.name, striker.name]);
  await expect(page.getByText(/play call \| wing overload/i)).toBeVisible();
  await expect(page.getByText(`Finish through ${striker.name}`, { exact: true })).toBeVisible();

  const before = (await page.getByText(/^Sequence:/i).textContent()) ?? '';
  await dragAttackerByName(page, engine.name, striker.name);
  await expect(page.getByText(/^Sequence:/i)).not.toHaveText(before);
  await expect(page.getByText(`Finish through ${engine.name}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/stretch them wide/i)).toBeVisible();
});

test('injured players are communicated as unavailable and bench flow works at halftime', async ({ page }) => {
  const used: number[] = [];
  const injuredMid = takeCard(used, 'CM', 'Engine');
  const wingerA = takeCard(used, 'WF');
  const striker = takeCard(used, 'CF');

  const deck = [
    cloneCard(takeCard(used, 'GK'), 7001),
    cloneCard(takeCard(used, 'WD'), 7002),
    cloneCard(takeCard(used, 'CD'), 7003),
    cloneCard(takeCard(used, 'CD'), 7004),
    cloneCard(takeCard(used, 'WD'), 7005),
    cloneCard(takeCard(used, 'CM', 'Controller'), 7006),
    cloneCard(injuredMid, 7007, { injured: true }),
    cloneCard(takeCard(used, 'CM', 'Passer'), 7008),
    cloneCard(wingerA, 7009),
    cloneCard(striker, 7010),
    cloneCard(takeCard(used, 'WF'), 7011),
    cloneCard(takeCard(used, 'CM', 'Creator'), 7012),
  ];

  await seedRun(page, buildRunState({
    deck,
    activeFormation: '4-3-3',
    formation: '4-3-3',
    playingStyle: 'gegenpressing',
    seed: 3333,
  }));
  await gotoMatchFromSavedRun(page);

  await expect(page.getByText(/injured player is unavailable for this move|injured players are unavailable for this move/i)).toBeVisible();
  await expect(page.getByText(/injured/i).first()).toBeVisible();

  const defenceRail = rail(page, 1);
  const injuredCard = defenceRail.getByText(injuredMid.name, { exact: false });
  await expect(injuredCard).toBeVisible();
  await injuredCard.click({ force: true });
  await expect(page.getByText(/select the cards for your move/i)).toBeVisible();

  await commitCardsByName(page, [wingerA.name, striker.name]);
  await reachHalftime(page);

  const xiSection = page.getByText(/XI —/i).locator('xpath=..');
  const benchSection = page.getByText(/Bench —/i).locator('xpath=..');

  await xiSection.locator('[role="button"]').filter({ hasText: injuredMid.name }).first().click();
  await expect(benchSection.locator('[role="button"]').first()).toBeVisible();
  await benchSection.locator('[role="button"]').first().click();
  await expect(page.getByText(/Subs: 4 \|/i)).toBeVisible();

  await page.getByRole('button', { name: /redraw mode/i }).click();
  const benchCards = benchSection.locator('[role="button"]');
  if (await benchCards.count() > 0) {
    await benchCards.first().click();
    await expect(page.getByRole('button', { name: /discard 1 card/i })).toBeVisible();
  }
});

test('balance probes show specialist plays beat generic live planning patterns', async ({ page }) => {
  const routeUsed: number[] = [];
  const routeKeeper = takeCard(routeUsed, 'GK');
  const routeSprinter = takeCard(routeUsed, 'CF', 'Sprinter');
  const routePasser = takeCard(routeUsed, 'CM', 'Passer');
  const routeTarget = takeCard(routeUsed, 'CF', 'Target');
  const routeDeck = [
    cloneCard(routeKeeper, 8001),
    cloneCard(routeSprinter, 8002),
    cloneCard(routePasser, 8003),
    cloneCard(routeTarget, 8004),
    cloneCard(takeCard(routeUsed, 'CD'), 8005),
    cloneCard(takeCard(routeUsed, 'CD'), 8006),
    cloneCard(takeCard(routeUsed, 'CD'), 8007),
    cloneCard(takeCard(routeUsed, 'WD'), 8008),
    cloneCard(takeCard(routeUsed, 'WD'), 8009),
    cloneCard(takeCard(routeUsed, 'CM', 'Engine'), 8010),
    cloneCard(takeCard(routeUsed, 'CM', 'Controller'), 8011),
  ];

  await seedRun(page, buildRunState({
    deck: routeDeck,
    activeFormation: '5-3-2',
    formation: '5-3-2',
    playingStyle: 'direct-play',
    seed: 4444,
  }));
  await gotoMatchFromSavedRun(page);
  await commitCardsByName(page, [routeKeeper.name, routeSprinter.name]);
  const specialistRoute = await readPlanningMetrics(page);
  expect(specialistRoute.playCall).toBe('Route One');

  await page.goto('/');
  await seedRun(page, buildRunState({
    deck: routeDeck,
    activeFormation: '5-3-2',
    formation: '5-3-2',
    playingStyle: 'direct-play',
    seed: 4444,
  }));
  await gotoMatchFromSavedRun(page);
  await commitCardsByName(page, [routePasser.name, routeTarget.name]);
  const genericRoute = await readPlanningMetrics(page);
  expect(genericRoute.playCall).toBe('Pattern Play');

  expect(specialistRoute.finish).toBeGreaterThan(genericRoute.finish);
  expect(specialistRoute.create).toBeGreaterThanOrEqual(genericRoute.create);

  const wideUsed: number[] = [];
  const leftWing = takeCard(wideUsed, 'WF', 'Dribbler');
  const rightWing = takeCard(wideUsed, 'WF', 'Sprinter');
  const creator = takeCard(wideUsed, 'CM', 'Creator');
  const engine = takeCard(wideUsed, 'CM', 'Engine');
  const striker = takeCard(wideUsed, 'CF', 'Striker');
  const controller = takeCard(wideUsed, 'CM', 'Controller');
  const wideDeck = [
    cloneCard(takeCard(wideUsed, 'GK'), 8101),
    cloneCard(takeCard(wideUsed, 'WD'), 8102),
    cloneCard(takeCard(wideUsed, 'CD'), 8103),
    cloneCard(takeCard(wideUsed, 'CD'), 8104),
    cloneCard(takeCard(wideUsed, 'WD'), 8105),
    cloneCard(controller, 8106),
    cloneCard(engine, 8107),
    cloneCard(creator, 8108),
    cloneCard(leftWing, 8109),
    cloneCard(striker, 8110),
    cloneCard(rightWing, 8111),
  ];

  await page.goto('/');
  await seedRun(page, buildRunState({
    deck: wideDeck,
    activeFormation: '4-3-3',
    formation: '4-3-3',
    playingStyle: 'total-football',
    seed: 5555,
  }));
  await gotoMatchFromSavedRun(page);
  await commitCardsByName(page, [leftWing.name, creator.name, rightWing.name, engine.name, striker.name]);
  const specialistWide = await readPlanningMetrics(page);
  expect(specialistWide.playCall).toBe('Wing Overload');

  await page.goto('/');
  await seedRun(page, buildRunState({
    deck: wideDeck,
    activeFormation: '4-3-3',
    formation: '4-3-3',
    playingStyle: 'total-football',
    seed: 5555,
  }));
  await gotoMatchFromSavedRun(page);
  await commitCardsByName(page, [creator.name, controller.name, engine.name, striker.name]);
  const genericWide = await readPlanningMetrics(page);
  expect(genericWide.playCall).toBe('Pattern Play');

  expect(specialistWide.create).toBeGreaterThan(genericWide.create);
  expect(specialistWide.finish).toBeGreaterThan(genericWide.finish);

  const report = {
    route: {
      specialist: specialistRoute,
      generic: genericRoute,
    },
    wide: {
      specialist: specialistWide,
      generic: genericWide,
    },
  };
  recordReport('planning_balance', report);
  test.info().annotations.push({
    type: 'planning-balance',
    description: JSON.stringify(report),
  });
});

test('outcome probes show specialist plans convert into stronger seeded match results', async ({ page }) => {
  test.setTimeout(240_000);
  const seeds = [6101, 6102, 6103, 6104, 6105];

  const routeUsed: number[] = [];
  const routeKeeper = takeCard(routeUsed, 'GK');
  const routeSprinter = takeCard(routeUsed, 'CF', 'Sprinter');
  const routePasser = takeCard(routeUsed, 'CM', 'Passer');
  const routeTarget = takeCard(routeUsed, 'CF', 'Target');
  const routeDeck = [
    cloneCard(routeKeeper, 9001),
    cloneCard(routeSprinter, 9002),
    cloneCard(routePasser, 9003),
    cloneCard(routeTarget, 9004),
    cloneCard(takeCard(routeUsed, 'CD'), 9005),
    cloneCard(takeCard(routeUsed, 'CD'), 9006),
    cloneCard(takeCard(routeUsed, 'CD'), 9007),
    cloneCard(takeCard(routeUsed, 'WD'), 9008),
    cloneCard(takeCard(routeUsed, 'WD'), 9009),
    cloneCard(takeCard(routeUsed, 'CM', 'Engine'), 9010),
    cloneCard(takeCard(routeUsed, 'CM', 'Controller'), 9011),
  ];

  const wideUsed: number[] = [];
  const leftWing = takeCard(wideUsed, 'WF', 'Dribbler');
  const rightWing = takeCard(wideUsed, 'WF', 'Sprinter');
  const creator = takeCard(wideUsed, 'CM', 'Creator');
  const engine = takeCard(wideUsed, 'CM', 'Engine');
  const striker = takeCard(wideUsed, 'CF', 'Striker');
  const controller = takeCard(wideUsed, 'CM', 'Controller');
  const wideDeck = [
    cloneCard(takeCard(wideUsed, 'GK'), 9101),
    cloneCard(takeCard(wideUsed, 'WD'), 9102),
    cloneCard(takeCard(wideUsed, 'CD'), 9103),
    cloneCard(takeCard(wideUsed, 'CD'), 9104),
    cloneCard(takeCard(wideUsed, 'WD'), 9105),
    cloneCard(controller, 9106),
    cloneCard(engine, 9107),
    cloneCard(creator, 9108),
    cloneCard(leftWing, 9109),
    cloneCard(striker, 9110),
    cloneCard(rightWing, 9111),
  ];

  const routeSpecialistResults: { seed: number; yourGoals: number; opponentGoals: number; result: 'win' | 'draw' | 'loss' }[] = [];
  const routeGenericResults: typeof routeSpecialistResults = [];
  const wideSpecialistResults: typeof routeSpecialistResults = [];
  const wideGenericResults: typeof routeSpecialistResults = [];

  for (const seed of seeds) {
    await seedRun(page, buildRunState({
      deck: routeDeck,
      activeFormation: '5-3-2',
      formation: '5-3-2',
      playingStyle: 'direct-play',
      seed,
    }));
    await gotoMatchFromSavedRun(page);
    await playMatchWithPlan(page, [routeKeeper.name, routeSprinter.name]);
    routeSpecialistResults.push({ seed, ...(await readPostMatchSummary(page)) });

    await seedRun(page, buildRunState({
      deck: routeDeck,
      activeFormation: '5-3-2',
      formation: '5-3-2',
      playingStyle: 'direct-play',
      seed,
    }));
    await gotoMatchFromSavedRun(page);
    await playMatchWithPlan(page, [routePasser.name, routeTarget.name]);
    routeGenericResults.push({ seed, ...(await readPostMatchSummary(page)) });

    await seedRun(page, buildRunState({
      deck: wideDeck,
      activeFormation: '4-3-3',
      formation: '4-3-3',
      playingStyle: 'total-football',
      seed: seed + 100,
    }));
    await gotoMatchFromSavedRun(page);
    await playMatchWithPlan(page, [leftWing.name, creator.name, rightWing.name, engine.name, striker.name]);
    wideSpecialistResults.push({ seed: seed + 100, ...(await readPostMatchSummary(page)) });

    await seedRun(page, buildRunState({
      deck: wideDeck,
      activeFormation: '4-3-3',
      formation: '4-3-3',
      playingStyle: 'total-football',
      seed: seed + 100,
    }));
    await gotoMatchFromSavedRun(page);
    await playMatchWithPlan(page, [creator.name, controller.name, engine.name, striker.name]);
    wideGenericResults.push({ seed: seed + 100, ...(await readPostMatchSummary(page)) });
  }

  const routeSpecialistGoals = sum(routeSpecialistResults.map((result) => result.yourGoals));
  const routeGenericGoals = sum(routeGenericResults.map((result) => result.yourGoals));
  const routeSpecialistPoints = sum(routeSpecialistResults.map((result) => pointsForResult(result.result)));
  const routeGenericPoints = sum(routeGenericResults.map((result) => pointsForResult(result.result)));

  const wideSpecialistGoals = sum(wideSpecialistResults.map((result) => result.yourGoals));
  const wideGenericGoals = sum(wideGenericResults.map((result) => result.yourGoals));
  const wideSpecialistPoints = sum(wideSpecialistResults.map((result) => pointsForResult(result.result)));
  const wideGenericPoints = sum(wideGenericResults.map((result) => pointsForResult(result.result)));

  expect(routeSpecialistGoals).toBeGreaterThanOrEqual(routeGenericGoals);
  expect(routeSpecialistPoints).toBeGreaterThanOrEqual(routeGenericPoints);
  expect(wideSpecialistGoals).toBeGreaterThanOrEqual(wideGenericGoals);
  expect(wideSpecialistPoints).toBeGreaterThanOrEqual(wideGenericPoints);

  test.info().annotations.push({
    type: 'outcome-probe',
    description: JSON.stringify({
      route: {
        specialist: routeSpecialistResults,
        generic: routeGenericResults,
        totals: {
          specialistGoals: routeSpecialistGoals,
          genericGoals: routeGenericGoals,
          specialistPoints: routeSpecialistPoints,
          genericPoints: routeGenericPoints,
        },
      },
      wide: {
        specialist: wideSpecialistResults,
        generic: wideGenericResults,
        totals: {
          specialistGoals: wideSpecialistGoals,
          genericGoals: wideGenericGoals,
          specialistPoints: wideSpecialistPoints,
          genericPoints: wideGenericPoints,
        },
      },
    }),
  });
  recordReport('seeded_outcomes', {
    route: {
      specialist: routeSpecialistResults,
      generic: routeGenericResults,
      totals: {
        specialistGoals: routeSpecialistGoals,
        genericGoals: routeGenericGoals,
        specialistPoints: routeSpecialistPoints,
        genericPoints: routeGenericPoints,
      },
    },
    wide: {
      specialist: wideSpecialistResults,
      generic: wideGenericResults,
      totals: {
        specialistGoals: wideSpecialistGoals,
        genericGoals: wideGenericGoals,
        specialistPoints: wideSpecialistPoints,
        genericPoints: wideGenericPoints,
      },
    },
  });
});

test('shop probe shows training improves the next match plan', async ({ page }) => {
  const used: number[] = [];
  const keyStriker = takeCard(used, 'CF', 'Striker');
  const winger = takeCard(used, 'WF', 'Sprinter');
  const creator = takeCard(used, 'CM', 'Creator');
  const deck = [
    cloneCard(keyStriker, 9201, { power: 95 }),
    cloneCard(winger, 9202, { power: 88 }),
    cloneCard(creator, 9203, { power: 86 }),
    cloneCard(takeCard(used, 'GK'), 9204),
    cloneCard(takeCard(used, 'WD'), 9205),
    cloneCard(takeCard(used, 'CD'), 9206),
    cloneCard(takeCard(used, 'CD'), 9207),
    cloneCard(takeCard(used, 'WD'), 9208),
    cloneCard(takeCard(used, 'CM', 'Controller'), 9209),
    cloneCard(takeCard(used, 'CM', 'Engine'), 9210),
    cloneCard(takeCard(used, 'WF', 'Dribbler'), 9211),
  ];

  const baseRun = buildRunState({
    deck,
    activeFormation: '4-3-3',
    formation: '4-3-3',
    playingStyle: 'total-football',
    status: 'shop',
    round: 1,
    cash: 30_000,
    seed: 7777,
  });

  await seedRun(page, baseRun);
  await gotoShopFromSavedRun(page);
  await page.getByRole('button', { name: /🏘️ open training/i }).click();
  await page.getByRole('button', { name: /^train/i }).nth(0).click();
  await page.getByRole('button', { name: /next match/i }).click();
  await expect(page.getByText(/play call/i)).toBeVisible();
  await commitCardsByName(page, [winger.name, creator.name, keyStriker.name]);
  const trainedMetrics = await readPlanningMetrics(page);

  await seedRun(page, baseRun);
  await gotoShopFromSavedRun(page);
  await page.getByRole('button', { name: /next match/i }).click();
  await expect(page.getByText(/play call/i)).toBeVisible();
  await commitCardsByName(page, [winger.name, creator.name, keyStriker.name]);
  const untrainedMetrics = await readPlanningMetrics(page);

  expect(trainedMetrics.finish).toBeGreaterThan(untrainedMetrics.finish);
  expect(trainedMetrics.create).toBeGreaterThanOrEqual(untrainedMetrics.create);

  const report = {
    trained: trainedMetrics,
    untrained: untrainedMetrics,
    delta: {
      create: trainedMetrics.create - untrainedMetrics.create,
      finish: trainedMetrics.finish - untrainedMetrics.finish,
    },
  };
  recordReport('shop_training_probe', report);
  test.info().annotations.push({
    type: 'shop-probe',
    description: JSON.stringify(report),
  });
});
