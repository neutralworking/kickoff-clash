import { expect, test, type Locator, type Page } from '@playwright/test';

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
      debugToggle: rect('.v8-debug-toggle'),
    };
  });

  expect(positions.pitch.top).toBeGreaterThanOrEqual(0);
  expect(positions.pitch.bottom).toBeLessThan(positions.viewportHeight);
  expect(positions.pitch.bottom - positions.pitch.top).toBeGreaterThanOrEqual(380);
  expect(positions.commit.bottom).toBeLessThan(positions.viewportHeight);
  expect(positions.firstCard.top).toBeLessThan(positions.viewportHeight);
  expect(positions.firstCard.bottom).toBeLessThanOrEqual(positions.viewportHeight);
  expect(positions.debugToggle.top).toBeGreaterThanOrEqual(positions.viewportHeight);
}

async function openLabTools(page: Page) {
  const toggle = page.getByRole('button', { name: 'OPEN LAB TOOLS' });
  if (await toggle.count()) {
    await toggle.click();
    await expect(page.getByRole('button', { name: 'CLOSE LAB TOOLS' })).toBeVisible();
  }
}

async function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {
  // A real mobile user scrolls the horizontal hand until the card is on-screen before lifting it.
  // Do the same here so the gesture vector tests vertical drag rather than an artificial
  // hundreds-of-pixels horizontal move from an off-screen card.
  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const pitchBox = await page.locator('.v8-pitch').boundingBox();
  const zoneName = await zone.getAttribute('data-v8-zone');
  expect(cardBox).not.toBeNull();
  expect(pitchBox).not.toBeNull();
  expect(zoneName).toMatch(/^(DEF|MID|ATT)$/);
  const startX = cardBox!.x + cardBox!.width / 2;
  const startY = cardBox!.y + cardBox!.height / 2;
  const endX = pitchBox!.x + pitchBox!.width / 2;
  const depth = zoneName === 'ATT' ? 1 / 6 : zoneName === 'MID' ? 1 / 2 : 5 / 6;
  const endY = pitchBox!.y + pitchBox!.height * depth;
  const pointer = { pointerId, pointerType: 'touch', isPrimary: true, bubbles: true };

  await card.dispatchEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 });
  await page.locator('body').dispatchEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 });
  await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
  await expect(zone).toHaveClass(/is-drag-over/);
  await page.locator('body').dispatchEvent('pointerup', { ...pointer, clientX: endX, clientY: endY, buttons: 0 });
  await expect(page.getByTestId('v8-drag-ghost')).toHaveCount(0);
}

test.describe('V8 real-card calibration lab', () => {
  test('keeps the core testing surface in one phone viewport', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).not.toBeVisible();
    await expect(page.locator('.v8-hand .v8-card__art img').first()).toBeVisible();
    await expectTestingSurfaceAboveFold(page);
    await expectMobileFit(page);
  });

  test('stages reveal, consequence and score directly on the pitch', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await bremner.click();
    await midfieldZone.click();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const moment = page.getByTestId('v8-resolution');
    await expect(moment).toBeVisible();
    await expect(moment).toContainText(/REVEAL FIRST/);
    await expect(moment).toContainText(/ATT/);
    await expect(moment).toContainText(/FULL \+7 ATT MARGINS CONVERT/);
    await expect(midfieldZone.locator('.v8-chip').filter({ hasText: 'Billy Bremner' })).toHaveClass(/is-fresh/);
    await expect(page.locator('.v8-recap')).not.toHaveAttribute('open', '');
    await expectMobileFit(page);
  });

  test('shows zone-correct hidden CPU commitments before revealing in real priority order', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const commitStrip = page.locator('.v8-commit');
    const expectedFirst = (await commitStrip.textContent())?.includes('CPU REVEALS FIRST') ? 'CPU' : 'YOU';
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const locked = page.getByTestId('v8-opponent-commitment');
    await expect(locked).toBeVisible();
    await expect(locked).toContainText('OPPONENT LOCKED IN');
    const cardBacks = page.getByTestId('v8-opponent-card-back');
    expect(await cardBacks.count()).toBeGreaterThan(0);
    await expect(cardBacks.first()).toHaveText('KC');
    await expect(cardBacks.first()).not.toHaveAttribute('data-card-id');

    const hiddenGroups = page.locator('.v8-opponent-commitments');
    expect(await hiddenGroups.count()).toBeGreaterThan(0);
    for (let index = 0; index < await hiddenGroups.count(); index += 1) {
      const group = hiddenGroups.nth(index);
      const zone = await group.getAttribute('data-zone');
      expect(zone).toMatch(/^(DEF|MID|ATT)$/);
      await expect(group).toBeVisible();
      await expect(group.locator('xpath=ancestor::*[@data-v8-zone][1]')).toHaveAttribute('data-v8-zone', zone!);
    }

    const firstReveal = page.getByTestId('v8-reveal-stage');
    await expect(firstReveal).toContainText('REVEAL 1/2');
    await expect(firstReveal).toContainText(expectedFirst);
    await expect(page.getByTestId('v8-opponent-card-back')).toHaveCount(expectedFirst === 'CPU' ? 0 : await cardBacks.count());

    await expect(page.getByTestId('v8-resolution')).toBeVisible();
    await expect(page.getByTestId('v8-opponent-card-back')).toHaveCount(0);
    expect(await page.locator('.v8-chip--away').count()).toBeGreaterThan(0);
    await expectMobileFit(page);
  });

  test('selects coherent calibration squads and exposes their compressed Cost profiles', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await openLabTools(page);

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

  test('drags a default-hand player directly onto the pitch', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await expect(bremner.locator('.v8-card__cost')).toHaveText('1');

    await dragCardToZone(page, bremner, midfieldZone, 7);

    await expect(page.getByTestId('selected-player-detail')).toHaveCount(0);
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ENERGY', { exact: true })).toBeVisible();
    await expect(midfieldZone.locator('.v8-chip--transient')).toContainText('Billy Bremner');
    await expect(bremner).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('keeps unaffordable players in-hand and explains the Energy constraint in the decision strip', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const iniesta = page.getByTestId('player-card-iniesta');
    await expect(iniesta.locator('.v8-card__cost')).toHaveText('4');
    await iniesta.click();

    await expect(iniesta).toHaveClass(/is-unaffordable/);
    await expect(page.locator('.v8-commit')).toContainText('4 ENERGY REQUIRED · 2 AVAILABLE');
    await expect(page.getByTestId('selected-player-detail')).toHaveCount(0);
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expectMobileFit(page);
  });

  test('uses calibrated player costs and releases the Manager slot after reveal', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await openLabTools(page);

    await expect(page.getByText('0–22', { exact: true })).toBeVisible();
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expect(page.getByText(/player Costs −1 \(min 1\)/)).toBeVisible();
    await expect(page.locator('.v8-zone')).toHaveCount(3);
    await expect(page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).locator('.v8-card__cost')).toHaveText('3');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await expect(page.getByText('22–HT', { exact: true })).toBeVisible();
    await expect(page.getByText('4 ENERGY', { exact: true })).toBeVisible();

    const defenceZone = page.locator('.v8-zone').first();
    await dragCardToZone(page, page.getByTestId('manager-card'), defenceZone, 8);
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
    await expect(window).toContainText('TACTICAL WINDOW');
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

    await openLabTools(page);
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
    await expect(window).toContainText('TACTICAL WINDOW');
    await expectMobileFit(page);

    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    await expect(crossCard).toBeVisible();
    await dragCardToZone(page, crossCard, page.locator('.v8-zone').nth(2), 9);
    await expect(window).toContainText('Post-reveal: Cross (1) → ATT');
    await page.getByRole('button', { name: 'RESOLVE WINDOW' }).click();

    await expect(page.locator('.v8-recap')).toContainText('Post-reveal: Cross (1, RABONA) → ATT.');
    await expect(page.locator('.v8-card--chance').filter({ hasText: 'Cross' })).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('drags a held Tactical from the hand during normal commitment', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).click();
    await page.locator('.v8-zone').nth(1).click();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const window = page.getByTestId('v8-window');
    await expect(window).toContainText('TACTICAL WINDOW');
    await page.getByRole('button', { name: 'SKIP WINDOW' }).click();
    await expect(page.getByText('HT–66', { exact: true })).toBeVisible();

    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await expect(crossCard).toBeVisible();
    await dragCardToZone(page, crossCard, midfieldZone, 10);

    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-commit')).toContainText('Cross → MID');
    await expect(page.getByText('5 ENERGY', { exact: true })).toBeVisible();
    await expect(crossCard).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('shows and applies Sinclair action decay after the scoring window', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await openLabTools(page);
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
    await openLabTools(page);
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
