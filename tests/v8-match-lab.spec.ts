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
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).toBeVisible();
    await expectTestingSurfaceAboveFold(page);
    await expectMobileFit(page);
  });

  test('selects coherent calibration squads and exposes their compressed Cost profiles', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const homeSquad = page.getByTestId('home-squad-select');
    const awaySquad = page.getByTestId('away-squad-select');
    await expect(homeSquad).toHaveValue('cross');
    await expect(awaySquad).toHaveValue('balanced_midrange');

    await homeSquad.selectOption('control_defence');
    await expect(homeSquad).toHaveValue('control_defence');
    await expect(page.locator('.v8-lab-controls--squads')).toContainText('C27 · avg 2.45');
    await expect(page.locator('.v8-card').filter({ hasText: 'Christine Sinclair' })).toHaveCount(1);
    await expectMobileFit(page);
  });

  test('expands a selected player and queues them by tapping the pitch', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await page.getByTestId('home-squad-select').selectOption('control_defence');

    const sinclair = page.locator('.v8-card').filter({ hasText: 'Christine Sinclair' });
    await expect(sinclair.locator('.v8-card__cost')).toHaveText('2');
    await sinclair.click();
    await expect(sinclair).toHaveClass(/is-selected/);
    await expect(sinclair.locator('small')).toContainText('ARRIVE UNMARKED');
    await expect(sinclair.locator('small')).toContainText('On Reveal');

    const selectedTextSize = await sinclair.locator('small').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(selectedTextSize).toBeGreaterThan(0);

    const attackZone = page.locator('.v8-zone').nth(2);
    await expect(attackZone.locator('.v8-zone__heading span')).toHaveText('NATURAL');
    await attackZone.click();

    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(attackZone.locator('.v8-chip--transient')).toContainText('Christine Sinclair');
    await expect(sinclair).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('uses calibrated player costs and releases the Manager slot after reveal', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await expect(page.getByText('0–22', { exact: true })).toBeVisible();
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expect(page.getByText(/player Costs −1 \(min 1\)/)).toBeVisible();
    await expect(page.locator('.v8-zone')).toHaveCount(3);
    await expect(page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).locator('.v8-card__cost')).toHaveText('3');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    await expect(page.getByText('4 ENERGY', { exact: true })).toBeVisible();

    await page.locator('.v8-card--manager').click();
    const defenceZone = page.locator('.v8-zone').first();
    await defenceZone.click();
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ENERGY', { exact: true })).toBeVisible();
    await expect(defenceZone.locator('.v8-chip--transient')).toContainText('CONTROL');
    await expect(defenceZone.locator('.v8-zone__heading span')).toHaveText('1/4');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('HT–66', { exact: true })).toBeVisible();
    await expect(page.getByText('6 ENERGY', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-card--manager')).toHaveCount(0);
    await expect(defenceZone.locator('.v8-chip--transient')).toHaveCount(0);
    await expect(page.locator('.v8-log')).toContainText('reveal CONTROL');
    await expectMobileFit(page);
  });

  test('generates a literal Cross, keeps it slotless, explains the score and records period telemetry', async ({ page }) => {
    await page.goto('/lab/match-v8');

    // P1 passes so P2 can afford Di María at her accepted printed 3-Energy calibration Cost.
    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    await expect(page.getByText('4 ENERGY', { exact: true })).toBeVisible();

    const diMaria = page.locator('.v8-card').filter({ hasText: 'Ángel Di María' });
    await diMaria.click();
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await midfieldZone.click();
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ENERGY', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const window = page.getByTestId('v8-window');
    await expect(window).toContainText('POST-REVEAL WINDOW');
    const crossChoice = window.locator('.v8-window__choices button').filter({ hasText: 'Cross → MID' });
    await expect(crossChoice).toBeVisible();
    await crossChoice.click();
    await expect(midfieldZone.locator('.v8-zone__heading span')).toHaveText('1/4');
    await page.getByRole('button', { name: 'RESOLVE WINDOW' }).click();

    await expect(page.getByText('HT–66', { exact: true })).toBeVisible();
    await expect(page.getByText('6 ENERGY', { exact: true })).toBeVisible();
    const recap = page.locator('.v8-recap');
    await expect(recap).toBeVisible();
    await expect(recap).toContainText('PERIOD RECAP');
    await expect(recap).toContainText(/YOU: \d+ ATT vs \d+ DEF → \d+ goals/);
    await expect(recap).toContainText(/CPU: \d+ ATT vs \d+ DEF → \d+ goals/);
    await expect(recap).toContainText('Post-reveal: Cross (1, RABONA) → MID.');

    const telemetry = page.getByTestId('v8-telemetry');
    await expect(telemetry).toContainText('2/4 periods');
    await telemetry.locator('summary').click();
    await expect(page.getByTestId('telemetry-period-2')).toBeVisible();
    await expect(page.getByTestId('telemetry-period-2')).toContainText('Tactical ATT');
    await expect(page.getByTestId('telemetry-period-2')).toContainText('Energy unused');
    await expect(midfieldZone.locator('.v8-zone__heading span')).toHaveText('1/4');
    await expectMobileFit(page);
  });

  test('opens the post-reveal window for a Tactical generated this period and recaps it as its own step', async ({ page }) => {
    await page.goto('/lab/match-v8');

    // P1 passes so P2 can afford Di María (3) and still retain 1 Energy for the Cross window.
    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('4 ENERGY', { exact: true })).toBeVisible();

    await page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).click();
    await page.locator('.v8-zone').nth(1).click();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const window = page.getByTestId('v8-window');
    await expect(window).toContainText('POST-REVEAL WINDOW');
    await expectMobileFit(page);

    await window.locator('.v8-window__choices button').filter({ hasText: 'Cross → ATT' }).click();
    await expect(window).toContainText('Post-reveal: Cross (1) → ATT');
    await page.getByRole('button', { name: 'RESOLVE WINDOW' }).click();

    await expect(page.locator('.v8-recap')).toContainText('Post-reveal: Cross (1, RABONA) → ATT.');
    await expect(page.locator('.v8-card--chance').filter({ hasText: 'Cross' })).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('shows and applies Sinclair action decay after the scoring window', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await page.getByTestId('home-squad-select').selectOption('control_defence');

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

  test('completes a match with final matchup telemetry and no horizontal overflow', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await page.getByTestId('home-squad-select').selectOption('balanced_midrange');
    await page.getByTestId('away-squad-select').selectOption('through_ball');

    for (let period = 1; period <= 4; period += 1) {
      await page.getByRole('button', { name: 'END PERIOD' }).click();
    }

    await expect(page.getByText('FULL TIME', { exact: true }).first()).toBeVisible();
    const finalTelemetry = page.getByTestId('match-telemetry-final');
    await expect(finalTelemetry).toBeVisible();
    await expect(finalTelemetry).toContainText('FULL MATCH');
    await expect(finalTelemetry).toContainText('total goals');
    await expect(finalTelemetry).toContainText('deployed /');
    await expect(finalTelemetry).toContainText('unused Energy');
    await expect(finalTelemetry).toContainText('Tactical ATT');
    await expectMobileFit(page);
  });
});