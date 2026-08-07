import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

type TypedChanceScenario = 'cross' | 'through-ball' | 'corner' | undefined;
type ChanceOrigin = 'calculated' | 'action';
type BrowserChanceType = 'box' | 'cross' | 'through_ball' | 'corner';

async function startPausedPeriod(page: Page, scenario: TypedChanceScenario) {
  await page.goto(scenario ? `/lab/match-v7?chance=${scenario}` : '/lab/match-v7');
  await expect(page.getByRole('heading', { name: /kickoff clash — v7 match lab/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^kick off/i })).toBeVisible();
  await page.getByRole('button', { name: /^kick off/i }).click();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await page.getByRole('button', { name: /^pause$/i }).click();
}

async function advanceUntilVisible(page: Page, locator: Locator, maxSteps = 48) {
  for (let step = 0; step < maxSteps; step += 1) {
    if (await locator.isVisible()) return;
    const next = page.getByRole('button', { name: /^next$/i });
    await expect(next).toBeVisible();
    await next.click();
  }
  await expect(locator).toBeVisible();
}

async function expectMobileFit(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport);
}

async function verifyTypedChance(
  page: Page,
  scenario: TypedChanceScenario,
  origin: ChanceOrigin,
  typeClass: BrowserChanceType,
  accessibleType: 'Box' | 'Cross' | 'Through Ball' | 'Corner',
) {
  await startPausedPeriod(page, scenario);

  const originLabel = origin === 'action' ? 'Action-created' : 'ATT-created';
  const shortType = accessibleType === 'Through Ball' ? 'THRU' : accessibleType.toUpperCase();
  const chanceToken = page.locator(`.v7-chance-token.origin-${origin}.type-${typeClass}`).first();
  await advanceUntilVisible(page, chanceToken);
  await expect(chanceToken).toHaveAttribute('aria-label', new RegExp(`${originLabel} ${accessibleType} chance`, 'i'));
  await expect(chanceToken.locator('small')).toHaveText(shortType);
  await expectMobileFit(page);

  const rollingToken = page.locator(`.v7-resolution-strip.kind-roll .v7-active-chance-token.origin-${origin}.type-${typeClass}`);
  await advanceUntilVisible(page, rollingToken);
  const rollStrip = page.locator('.v7-resolution-strip.kind-roll');
  await expect(rollStrip).toContainText(accessibleType);
  await expect(rollStrip.locator('small')).toContainText(/needs [3-7]\+/i);
  await expect(rollStrip.locator('small')).not.toHaveText(/^\s*$/);
  await expectMobileFit(page);
}

test.describe('V7 typed chances on a mobile viewport', () => {
  test('Box exposes calculated origin and names its finisher before the roll', async ({ page }) => {
    await verifyTypedChance(page, undefined, 'calculated', 'box', 'Box');
  });

  test('Cross keeps calculated origin, exposes type, and names its finisher before the roll', async ({ page }) => {
    await verifyTypedChance(page, 'cross', 'calculated', 'cross', 'Cross');
  });

  test('Through Ball keeps calculated origin, exposes type, and names its finisher before the roll', async ({ page }) => {
    await verifyTypedChance(page, 'through-ball', 'calculated', 'through_ball', 'Through Ball');
  });

  test('Corner exposes Action origin separately from its type and names its finisher before the roll', async ({ page }) => {
    await verifyTypedChance(page, 'corner', 'action', 'corner', 'Corner');
  });
});
