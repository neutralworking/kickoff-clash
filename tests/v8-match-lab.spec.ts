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

test.describe('V8 real-card calibration lab', () => {
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
});
