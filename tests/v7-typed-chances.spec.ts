import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function startPausedPeriod(page: Page, scenario: 'cross' | 'through-ball') {
  await page.goto(`/lab/match-v7?chance=${scenario}`);
  await expect(page.getByRole('heading', { name: /kickoff clash — v7 match lab/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^kick off/i })).toBeVisible();
  await page.getByRole('button', { name: /^kick off/i }).click();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await page.getByRole('button', { name: /^pause$/i }).click();
}

async function advanceUntilVisible(page: Page, locator: Locator, maxSteps = 36) {
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
  scenario: 'cross' | 'through-ball',
  typeClass: 'cross' | 'through_ball',
  accessibleType: 'Cross' | 'Through Ball',
) {
  await startPausedPeriod(page, scenario);

  const chanceToken = page.locator(`.v7-chance-token.origin-calculated.type-${typeClass}`).first();
  await advanceUntilVisible(page, chanceToken);
  await expect(chanceToken).toHaveAttribute('aria-label', new RegExp(`ATT-created ${accessibleType} chance`, 'i'));
  await expect(chanceToken.locator('small')).toHaveText(accessibleType === 'Through Ball' ? 'THRU' : accessibleType.toUpperCase());
  await expectMobileFit(page);

  const rollingToken = page.locator(`.v7-resolution-strip.kind-roll .v7-active-chance-token.origin-calculated.type-${typeClass}`);
  await advanceUntilVisible(page, rollingToken);
  const rollStrip = page.locator('.v7-resolution-strip.kind-roll');
  await expect(rollStrip).toContainText(accessibleType);
  await expect(rollStrip.locator('small')).toContainText(/needs [3-7]\+/i);
  await expect(rollStrip.locator('small')).not.toHaveText(/^\s*$/);
  await expectMobileFit(page);
}

test.describe('V7 typed chances on a mobile viewport', () => {
  test('Cross keeps calculated origin, exposes type, and names its finisher before the roll', async ({ page }) => {
    await verifyTypedChance(page, 'cross', 'cross', 'Cross');
  });

  test('Through Ball keeps calculated origin, exposes type, and names its finisher before the roll', async ({ page }) => {
    await verifyTypedChance(page, 'through-ball', 'through_ball', 'Through Ball');
  });
});
