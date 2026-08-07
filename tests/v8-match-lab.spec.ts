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

test.describe('V8 three-zone match lab', () => {
  test('shows 1-cost tempo and releases the Manager slot after reveal on mobile', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await expect(page.getByText('0–22', { exact: true })).toBeVisible();
    await expect(page.getByText('3/3 ENERGY', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-zone')).toHaveCount(3);
    await expect(page.locator('.v8-card')).toHaveCount(6);

    const oneCostTempo = page.locator('.v8-card').filter({ hasText: 'FRONT FOOT' });
    await expect(oneCostTempo).toHaveCount(1);
    await expect(oneCostTempo.locator('.v8-card__cost')).toHaveText('1');
    await expectMobileFit(page);

    await page.locator('.v8-card--manager').click();
    const defenceZone = page.locator('.v8-zone').first();
    await defenceZone.click();
    await expect(page.getByText('1 queued', { exact: true })).toBeVisible();
    await expect(page.getByText('0/3 ENERGY', { exact: true })).toBeVisible();
    await expect(defenceZone.locator('.v8-chip--transient')).toContainText('CONTROL');
    await expect(defenceZone.locator('.v8-zone__heading span')).toHaveText('1/4');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    await expect(page.getByText('5/5 ENERGY', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-card--manager')).toHaveCount(0);
    await expect(defenceZone.locator('.v8-chip--transient')).toHaveCount(0);
    await expect(page.locator('.v8-log')).toContainText('0–22:');
    await expectMobileFit(page);
  });
});
