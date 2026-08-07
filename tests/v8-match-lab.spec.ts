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
  test('commits a manager play and advances one football period on mobile', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await expect(page.getByText('0–22', { exact: true })).toBeVisible();
    await expect(page.getByText('4/4 ENERGY', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-zone')).toHaveCount(3);
    await expect(page.locator('.v8-card')).toHaveCount(6);
    await expectMobileFit(page);

    await page.locator('.v8-card--manager').click();
    await page.locator('.v8-zone').first().click();
    await expect(page.getByText('1 queued', { exact: true })).toBeVisible();
    await expect(page.getByText('1/4 ENERGY', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-log')).toContainText('0–22:');
    await expectMobileFit(page);
  });
});
