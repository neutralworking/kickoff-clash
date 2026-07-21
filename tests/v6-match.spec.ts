import { expect, test } from '@playwright/test';

/**
 * V6 lab happy path (handoff §7 "Playwright only for a small happy-path"). Plays
 * a full four-period match on a phone viewport through the three blind breaks —
 * plan, lock, reveal, chance roll — and asserts a verdict with no horizontal
 * overflow. Requires the dev/prod server on :3001 (the app lives under the
 * /kickoff-clash basePath). Run: PW_CHROMIUM=<binary> npm run playtest:v6
 */

const LAB = '/kickoff-clash/lab/match-v6/';

test.use({ viewport: { width: 390, height: 844 } });

test('plays a complete four-period V6 match on mobile', async ({ page }) => {
  await page.goto(LAB);
  await expect(page.locator('.v6-lab')).toBeVisible();
  await expect(page.locator('.v6-lane')).toHaveCount(3);

  // Fits a 390px phone (spec §6): no horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Period 1 summary → continue to the first break.
  await page.locator('.v6-cta').first().click();
  await expect(page.locator('.v6-break')).toBeVisible();

  // Make one substitution: tap the cheapest bench card, then a player on the pitch.
  const bench = page.locator('.v6-bench-card').last();
  await bench.click();
  await expect(bench).toHaveClass(/sel/);
  await page.locator('.v6-squad.you .v6-mini').first().click();
  await expect(page.locator('.v6-plan-row')).toHaveCount(1);

  // Drive to full time through every phase (reveal + chance sequences, breaks).
  // force:true bypasses the actionability "stable" wait — the sequence panels
  // animate continuously, so we click through them rather than wait them out.
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.v6-fulltime').count()) break;
    const skip = page.locator('.v6-skip');
    const lock = page.locator('.v6-lock');
    const cta = page.locator('.v6-cta');
    try {
      if (await skip.count()) await skip.first().click({ force: true, timeout: 2000 });
      else if (await lock.count()) await lock.first().click({ force: true, timeout: 2000 });
      else if (await cta.count()) await cta.first().click({ force: true, timeout: 2000 });
    } catch {
      /* transient during a phase transition — retry next tick */
    }
    await page.waitForTimeout(150);
  }

  await expect(page.locator('.v6-fulltime')).toBeVisible();
  await expect(page.locator('.v6-fulltime .verdict')).toContainText(/win|lose|draw/i);

  // Full time should show four resolved periods' worth of play — score is a number.
  const score = await page.locator('.v6-fulltime .big').textContent();
  expect(score).toMatch(/^\d+–\d+$/);
});
