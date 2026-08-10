import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

async function openChosenSquad(page: Page) {
  await page.getByRole('button', { name: /new season/i }).click();

  await expect(page.getByRole('heading', { name: /choose a manager pack/i })).toBeVisible();
  const managerPacks = page.getByRole('button', { name: /choose manager pack/i });
  await expect(managerPacks).toHaveCount(3);

  await managerPacks.nth(1).click();
  await expect(page.getByTestId('chosen-manager-reveal')).toBeVisible();
  await expect(page.getByTestId('chosen-manager-reveal').getByRole('button')).toHaveCount(1);

  await page.getByRole('button', { name: /choose player pack/i }).click();
  await expect(page.getByRole('heading', { name: /choose your squad/i })).toBeVisible();
  const playerPacks = page.getByRole('button', { name: /choose player pack/i });
  await expect(playerPacks).toHaveCount(3);

  await playerPacks.nth(2).click();
  await expect(page.getByTestId('chosen-player-pack')).toBeVisible();
  await expect(page.getByTestId('starter-player-card')).toHaveCount(18);
  await expect(page.getByRole('button', { name: /build your xi/i })).toBeVisible();
}

test.describe('390 × 844 opening', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('chooses and reveals one manager pack, then one complete player pack', async ({ page }) => {
    await page.goto('/');
    await openChosenSquad(page);

    await page.getByRole('button', { name: /build your xi/i }).click();
    await expect(page.getByText(/name your squad/i).first()).toBeVisible();
  });
});

test.describe('375 × 667 opening', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('keeps both choices and the reveal CTA inside the phone width', async ({ page }) => {
    await page.goto('/');
    await openChosenSquad(page);

    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

    const cta = page.getByRole('button', { name: /build your xi/i });
    await expect(cta).toBeInViewport();
  });
});
