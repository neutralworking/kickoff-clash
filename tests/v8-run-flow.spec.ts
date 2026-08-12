import { expect, test, type Page } from '@playwright/test';
import { createRun, type RunState } from '../src/lib/run';
import { ripStarterPacks } from '../src/lib/packs';

const STORAGE_KEY = 'kickoff-clash-v4-run';

function serializeRun(state: RunState): string {
  const { jokers, tacticsDeck, ...rest } = state;
  return JSON.stringify({
    ...rest,
    jokerIds: jokers.map((joker) => joker.id),
    tacticIds: tacticsDeck.map((tactic) => tactic.id),
  });
}

function seededStarterRun(seed = 8082026): RunState {
  const contents = ripStarterPacks(seed);
  return createRun({
    players: contents.players,
    startingXI: contents.players.slice(0, 11).map((card) => card.id),
    benchIds: contents.players.slice(11).map((card) => card.id),
    manager: null,
    tactics: [],
    formationId: '4-3-3',
    intent: 'balanced',
  }, seed);
}

async function playFourPeriods(page: Page) {
  const intro = page.getByTestId('v8-match-intro');
  if (await intro.isVisible()) await intro.click();

  for (let period = 1; period <= 4; period += 1) {
    for (let play = 0; play < 4; play += 1) {
      const affordable = page.locator('.v8-hand .v8-card:not(.is-unaffordable):not(.v8-card--chance):not(.v8-card--manager)').first();
      if (await affordable.count() === 0) break;
      await affordable.click();
      const preview = page.getByTestId('v8-placement-preview');
      if (await preview.count() === 0) break;
      const zone = await preview.getAttribute('data-zone');
      if (!zone) break;
      await page.locator(`[data-v8-zone="${zone}"]`).click();
    }
    await page.getByRole('button', { name: 'END PERIOD' }).click();
    const skip = page.getByRole('button', { name: 'Skip reveal sequence' });
    await expect(skip).toBeVisible();
    await skip.click();
    if (period < 4) {
      await expect(page.getByText(`PERIOD ${period + 1}/4`, { exact: true }).first()).toBeVisible();
    }
  }

  await expect(page.locator('.v8-result')).toBeVisible();
  await expect(page.locator('.v8-result')).toContainText('FULL TIME');
}

async function expectPhoneWidth(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  expect(width.body).toBeLessThanOrEqual(width.viewport);
}

test.describe('V8 production run handoff', () => {
  test('plays a fresh opening through V8 and into the existing post-match flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.clear();
      Date.now = () => 8082026;
    });
    await page.goto('/');

    await page.getByRole('button', { name: /new season/i }).click();
    await page.getByRole('button', { name: /choose manager pack/i }).nth(1).click();
    await page.getByRole('button', { name: /choose player pack/i }).click();
    await page.getByRole('button', { name: /choose player pack/i }).nth(2).click();
    await page.getByRole('button', { name: /build your xi/i }).click();
    await page.getByRole('button', { name: 'AUTO', exact: true }).click();
    await page.getByRole('button', { name: /kick off/i }).click();

    await expect(page.getByTestId('v8-match-intro')).toBeVisible();
    await expect(page.getByRole('button', { name: /open lab tools/i })).toHaveCount(0);
    await playFourPeriods(page);
    await expectPhoneWidth(page);

    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await expect(page.locator('.phase-postmatch')).toBeVisible();
    await expect(page.locator('.phase-postmatch')).toContainText(/VICTORY|STALEMATE/);
  });

  test('keeps the production match playable on a 375 × 667 phone', async ({ page }) => {
    const run = seededStarterRun();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    }, { key: STORAGE_KEY, value: serializeRun(run) });
    await page.goto('/');
    await page.getByRole('button', { name: /continue run/i }).click();

    await expect(page.getByTestId('v8-match-intro')).toBeVisible();
    await playFourPeriods(page);
    await expectPhoneWidth(page);
    await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeInViewport();
  });
});
