import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function expectMobileFit(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport);
}

async function expectTestingSurfaceAboveFold(page: Page) {
  const positions = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    };
    return {
      viewportHeight: window.innerHeight,
      pitch: rect('.v8-pitch'),
      commit: rect('.v8-commit'),
      firstCard: rect('.v8-hand .v8-card'),
    };
  });

  expect(positions.pitch.top).toBeGreaterThanOrEqual(0);
  expect(positions.pitch.bottom).toBeLessThan(positions.viewportHeight);
  expect(positions.commit.bottom).toBeLessThan(positions.viewportHeight);
  expect(positions.firstCard.top).toBeLessThan(positions.viewportHeight);
  expect(positions.firstCard.bottom).toBeLessThanOrEqual(positions.viewportHeight);
}

test.describe('V8 real-card calibration lab', () => {
  test('keeps the core testing surface in one phone viewport', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await expectTestingSurfaceAboveFold(page);
    await expectMobileFit(page);
  });

  test('uses real tracker cards and releases the Manager player slot after reveal', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await expect(page.getByText('0–22', { exact: true })).toBeVisible();
    await expect(page.getByText('3 ENERGY', { exact: true })).toBeVisible();
    await expect(page.getByText('30-CARD V8 CALIBRATION', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-zone')).toHaveCount(3);
    await expect(page.locator('.v8-card')).toHaveCount(6);
    await expect(page.locator('.v8-card').filter({ hasText: 'Ángel Di María' })).toHaveCount(1);
    await expect(page.locator('.v8-card').filter({ hasText: 'RABONA' })).toContainText('If you have a Cross in your hand');
    await expect(page.getByText(/seeded tiebreak · Tacticals use no player slot/)).toBeVisible();
    await expectMobileFit(page);

    await page.locator('.v8-card--manager').click();
    const defenceZone = page.locator('.v8-zone').first();
    await defenceZone.click();
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.getByText('0 ENERGY', { exact: true })).toBeVisible();
    await expect(defenceZone.locator('.v8-chip--transient')).toContainText('CONTROL');
    await expect(defenceZone.locator('.v8-zone__heading span')).toHaveText('1/4');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    await expect(page.getByText('5 ENERGY', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-card--manager')).toHaveCount(0);
    await expect(defenceZone.locator('.v8-chip--transient')).toHaveCount(0);
    await expect(page.locator('.v8-log')).toContainText('reveal CONTROL');
    await expectMobileFit(page);
  });

  test('generates a literal Cross and committing it does not consume a player slot', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const diMaria = page.locator('.v8-card').filter({ hasText: 'Ángel Di María' });
    await diMaria.click();
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await midfieldZone.click();
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    const cross = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    await expect(cross).toHaveCount(1);
    await expect(cross.locator('.v8-card__cost')).toHaveText('1');
    await expect(cross).toContainText('+2 ATT this period');
    await expect(midfieldZone.locator('.v8-zone__heading span')).toHaveText('1/4');

    await cross.click();
    await midfieldZone.click();
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(midfieldZone.locator('.v8-zone__heading span')).toHaveText('1/4');
    await expect(page.getByText(/Cross → MID/)).toBeVisible();
    await expectMobileFit(page);
  });

  test('shows and applies Sinclair action decay after the scoring window', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await page.getByRole('button', { name: 'DRIBBLERS', exact: true }).click();

    const sinclair = page.locator('.v8-card').filter({ hasText: 'Christine Sinclair' });
    await expect(sinclair).toHaveCount(1);
    await expect(sinclair).toContainText('loses 1 ATT at the end of each period');

    await sinclair.click();
    const attackZone = page.locator('.v8-zone').nth(2);
    await attackZone.click();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const deployed = attackZone.locator('.v8-chip').filter({ hasText: 'Christine Sinclair' });
    await expect(deployed).toContainText('13/1');
    await expect(page.locator('.v8-log')).toContainText('ARRIVE UNMARKED fades: +4 ATT → +3 ATT');
    await expectMobileFit(page);
  });
});
