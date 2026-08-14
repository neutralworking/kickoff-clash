import { expect, test, type Locator, type Page } from '@playwright/test';
import { V8_GOAL_BAND } from '../src/engine-v8/core';

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
  const pitchHeight = positions.pitch.bottom - positions.pitch.top;
  expect(pitchHeight).toBeGreaterThanOrEqual(positions.viewportHeight * .4);
  expect(pitchHeight).toBeLessThanOrEqual(positions.viewportHeight * .5);
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

async function expectEnergy(page: Page, current: number, maximum: number) {
  await expect(page.getByTestId('v8-energy')).toBeVisible();
  await expect(page.getByTestId('v8-energy')).toHaveAttribute('aria-label', `${current} of ${maximum} Energy available`);
}

async function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {
  // Keep the gesture anchored to the rendered card so it exercises the same lift-and-drop
  // path whether the card sits in the first or second hand row.
  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const pitchBox = await page.locator('.v8-pitch').boundingBox();
  const zoneName = await zone.getAttribute('data-v8-zone');
  expect(cardBox).not.toBeNull();
  expect(pitchBox).not.toBeNull();
  expect(zoneName).toMatch(/^(DEF|MID|ATT)$/);
  const startX = cardBox!.x + cardBox!.width / 2;
  const startY = cardBox!.y + cardBox!.height / 2;
  const depth = zoneName === 'DEF' ? 1 / 6 : zoneName === 'MID' ? 1 / 2 : 5 / 6;
  const endX = pitchBox!.x + pitchBox!.width * depth;
  const endY = pitchBox!.y + pitchBox!.height * .78;
  const pointer = { pointerId, pointerType: 'touch', isPrimary: true, bubbles: true };

  await card.dispatchEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 });
  await page.locator('body').dispatchEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 });
  await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
  await expect(zone).toHaveClass(/is-drag-over/);
  await page.locator('body').dispatchEvent('pointerup', { ...pointer, clientX: endX, clientY: endY, buttons: 0 });
  await expect(page.getByTestId('v8-drag-ghost')).toHaveCount(0);
}

test.describe('V8 real-card calibration lab', () => {
  test('opens with a skippable versus card, then presents three left-to-right locations', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const intro = page.getByTestId('v8-match-intro');
    await expect(intro).toHaveCount(1);
    const introText = await intro.textContent();
    expect(introText).toContain('YOU');
    expect(introText).toContain('VS');
    expect(introText).toContain('CPU');
    expect(introText).not.toContain('KICKOFF CLASH');
    if (await intro.isVisible()) await intro.click();
    await expect(intro).toHaveCount(0);

    await expect(page.getByText('PERIOD 1/4', { exact: true }).first()).toBeVisible();
    await expectEnergy(page, 2, 2);
    const locations = await page.locator('.v8-zone').evaluateAll((zones) => zones.map((zone) => {
      const box = zone.getBoundingClientRect();
      const away = zone.querySelector('.v8-zone__side--away')!.getBoundingClientRect();
      const heading = zone.querySelector('.v8-zone__heading')!.getBoundingClientRect();
      const home = zone.querySelector('.v8-zone__side:not(.v8-zone__side--away)')!.getBoundingClientRect();
      return { name: zone.getAttribute('data-v8-zone'), left: box.left, top: box.top, awayBottom: away.bottom, headingTop: heading.top, headingBottom: heading.bottom, homeTop: home.top };
    }));
    expect(locations.map(({ name }) => name)).toEqual(['DEF', 'MID', 'ATT']);
    expect(locations[0]!.left).toBeLessThan(locations[1]!.left);
    expect(locations[1]!.left).toBeLessThan(locations[2]!.left);
    expect(locations[0]!.top).toBe(locations[1]!.top);
    for (const location of locations) {
      expect(location.awayBottom).toBeLessThanOrEqual(location.headingTop);
      expect(location.headingBottom).toBeLessThanOrEqual(location.homeTop);
    }

    const liveContests = page.getByTestId('v8-live-contests');
    await expect(liveContests).toBeVisible();
    const attackContest = liveContests.locator('.v8-contest-comparison').nth(0);
    const defenceContest = liveContests.locator('.v8-contest-comparison').nth(1);
    await expect(attackContest.locator('header')).toHaveText('ATT');
    await expect(defenceContest.locator('header')).toHaveText('DEF');
    await expect(attackContest.locator(':scope > strong')).toHaveText(/^[+-]?\d+$/);
    await expect(defenceContest.locator(':scope > strong')).toHaveText(/^[+-]?\d+$/);
    await expect(attackContest.locator(':scope > strong > small')).toHaveCount(0);
    await expect(defenceContest.locator(':scope > strong > small')).toHaveCount(0);
    await expect(page.locator('.v8-priority-ball')).toHaveCount(1);
    await expect(page.locator('.v8-commit')).not.toContainText(/REVEAL FIRST/);
    const comparisonPositions = await liveContests.locator('.v8-contest-comparison').first().evaluate((contest) => {
      const numbers = Array.from(contest.querySelectorAll('span > b')).map((node) => node.getBoundingClientRect());
      return { attackRight: numbers[0]!.right, defenceLeft: numbers[1]!.left };
    });
    expect(comparisonPositions.attackRight).toBeLessThan(comparisonPositions.defenceLeft);
    await expectMobileFit(page);
  });

  test('keeps the core testing surface in one phone viewport', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await expectEnergy(page, 2, 2);
    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).not.toBeVisible();
    await expect(page.locator('.v8-hand .v8-card__art img')).toHaveCount(0);
    const handLayout = await page.getByTestId('v8-hand').evaluate((hand) => {
      const cards = Array.from(hand.querySelectorAll<HTMLElement>(':scope > .v8-card'));
      return {
        overflow: hand.scrollWidth - hand.clientWidth,
        rows: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
        firstIsManager: cards[0]?.classList.contains('v8-card--manager') ?? false,
      };
    });
    expect(handLayout.overflow).toBeLessThanOrEqual(1);
    expect(handLayout.rows).toBe(2);
    expect(handLayout.firstIsManager).toBe(true);
    await expectTestingSurfaceAboveFold(page);
    await expectMobileFit(page);
  });

  test('stages reveal, consequence and score directly on the pitch', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await bremner.click();
    await midfieldZone.click();
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();

    const actionFlash = page.getByTestId('v8-action-flash');
    await expect(actionFlash).toBeVisible();
    await expect(actionFlash).not.toContainText(/REVEAL/i);
    await expect(actionFlash).toHaveAttribute('data-action-stage', 'source');
    await expect(actionFlash.locator('strong')).not.toHaveText('');

    const consequence = page.getByTestId('v8-consequence').filter({ hasText: /YOU [+-]\d+ (ATT|DEF)/ }).first();
    await expect(consequence).toBeVisible();
    const destination = await consequence.getAttribute('data-destination');
    const side = await consequence.getAttribute('data-side');
    const delta = Number(await consequence.getAttribute('data-value'));
    expect(destination).toMatch(/^(ATT|DEF)$/);
    expect(side).toBe('home');
    expect(delta).not.toBe(0);

    const destinationContest = page.locator(`.v8-contest-comparison[data-axis="${destination}"]`);
    const destinationValue = destinationContest.locator(':scope > span > b').nth(side === 'home' ? 0 : 1);
    const heldValue = Number(await destinationValue.textContent());
    await expect(midfieldZone.locator('.v8-chip').filter({ hasText: 'Billy Bremner' })).toHaveClass(/is-fresh/);
    await expect(midfieldZone.locator('[data-action-source="true"]').filter({ hasText: 'Billy Bremner' })).toBeVisible();
    await expect(midfieldZone).toHaveAttribute('data-consequence-target', 'true');
    await expect(midfieldZone.locator('[data-consequence-target="true"]')).toBeVisible();

    await expect(destinationContest).toHaveClass(/is-updating/);
    await expect(destinationValue).toHaveText(String(heldValue + delta));

    const moment = page.getByTestId('v8-resolution');
    await expect(moment).toBeVisible();
    await expect(moment).not.toContainText(/REVEAL FIRST/);
    await expect(moment).toContainText(/ATT/);
    await expect(moment).toContainText(`FULL +${V8_GOAL_BAND} ATT MARGINS CONVERT`);
    await expect(page.getByTestId('v8-period-result')).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('reveals committed cards one at a time in the advertised priority order', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    await bremner.click();
    await page.locator('.v8-zone').nth(1).click();

    const expectedFirst = await page.getByTestId('v8-priority-ball-home').count() ? 'home' : 'away';
    const pitch = page.locator('.v8-pitch');
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();

    const firstAction = page.getByTestId('v8-action-flash');
    await expect(firstAction).toBeVisible();
    await expect(firstAction).not.toContainText(/REVEAL/i);
    await expect(pitch).toHaveAttribute('data-reveal-index', '1');
    await expect(pitch).toHaveAttribute('data-reveal-side', expectedFirst);
    const revealTotal = Number(await pitch.getAttribute('data-reveal-total'));
    const opponentCommitments = Number(await pitch.getAttribute('data-opponent-commitments'));
    expect(revealTotal).toBeGreaterThan(1);
    const firstZone = await pitch.getAttribute('data-reveal-zone');
    expect(firstZone).toMatch(/^(DEF|MID|ATT)$/);
    await expect(page.locator(`[data-v8-zone="${firstZone}"]`)).toHaveClass(/is-resolving-zone/);

    await expect(page.getByTestId('v8-opponent-commitment')).toHaveCount(0);
    await expect(page.getByTestId('v8-reveal-stage')).toHaveCount(0);
    const cardBacks = page.getByTestId('v8-opponent-card-back');
    const initialCardBacks = await cardBacks.count();
    expect(initialCardBacks).toBeGreaterThan(0);
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

    await expect(page.getByTestId('v8-opponent-card-back')).toHaveCount(opponentCommitments - (expectedFirst === 'away' ? 1 : 0));

    const skip = page.getByRole('button', { name: 'Skip reveal sequence' });
    await expect(skip).toBeVisible();
    await expect(pitch).toHaveAttribute('data-reveal-index', '2');
    await expect(skip).toBeVisible();
    await skip.click();

    await expect(page.getByTestId('v8-resolution')).toBeVisible();
    await expect(page.getByTestId('v8-opponent-card-back')).toHaveCount(0);
    expect(await page.locator('.v8-chip--away').count()).toBeGreaterThan(0);
    await expectMobileFit(page);
  });

  test(`turns real full +${V8_GOAL_BAND} margins into chained goal payoff without inventing a scorer`, async ({ page }) => {
    await page.goto('/lab/match-v8');

    let foundGoal = false;
    for (let period = 1; period <= 4; period += 1) {
      await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
      const payoff = page.getByTestId('v8-score-payoff');
      await expect(payoff).toBeVisible();
      const totalGoals = Number(await payoff.getAttribute('data-goals'));
      if (totalGoals > 0) {
        const goalPayoff = page.getByTestId('v8-goal-payoff');
        await expect(goalPayoff).toContainText('⚽');
        await expect(goalPayoff).not.toContainText(/Bremner|Ramos|Jostle|scorer/i);

        const converted = page.locator('.v8-goal-contest.is-converted');
        expect(await converted.count()).toBeGreaterThan(0);
        for (let index = 0; index < await converted.count(); index += 1) {
          const contest = converted.nth(index);
          const margin = Number(await contest.getAttribute('data-margin'));
          const goals = Number(await contest.getAttribute('data-goals'));
          expect(margin).toBeGreaterThanOrEqual(goals * V8_GOAL_BAND);
        }
        await expect(page.locator('.v8-goal-burst > span')).toHaveCount(totalGoals);
        const nextHomeScore = await payoff.getAttribute('data-next-home-score');
        const nextAwayScore = await payoff.getAttribute('data-next-away-score');
        await expect(page.locator('.v8-scoreteam--home > span > strong')).toHaveText(nextHomeScore!);
        await expect(page.locator('.v8-scoreteam--away > span > strong')).toHaveText(nextAwayScore!);
        await expectMobileFit(page);
        foundGoal = true;
        break;
      }
      await expect(payoff).toBeHidden();
    }
    expect(foundGoal).toBe(true);
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
    await expectEnergy(page, 1, 2);
    await expect(midfieldZone.locator('.v8-chip--transient')).toContainText('Billy Bremner');
    await expect(bremner).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('previews placement contribution, Action, OOP and goal thresholds before commitment', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    await bremner.click();

    const preview = page.getByTestId('v8-placement-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-zone', 'MID');
    await expect(preview).toContainText(/BRAHMA → MID/i);
    await expect(preview).toContainText(/ATT \d+→\d+ [+-]\d+/);
    await expect(preview).toContainText(/DEF \d+→\d+ [+-]\d+/);
    await expect(preview).toContainText('CRUNCHING TACKLE');
    await expect(page.getByTestId('v8-placement-action-effect')).toContainText(/highest-ATT opposing player/i);
    await expect(preview).toContainText(/NATURAL/);
    await expect(preview).toContainText(/NO GOAL CHANGE|[+-]\d+G/);

    await expect(page.getByTestId('v8-placement-zone-DEF')).toHaveAttribute('data-penalty', '2');
    await expect(page.getByTestId('v8-placement-zone-MID')).toHaveAttribute('data-penalty', '0');
    await expect(page.getByTestId('v8-placement-zone-ATT')).toHaveAttribute('data-penalty', '2');

    const cardBox = await bremner.boundingBox();
    const pitchBox = await page.locator('.v8-pitch').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(pitchBox).not.toBeNull();
    const pointer = { pointerId: 17, pointerType: 'touch', isPrimary: true, bubbles: true };
    const startX = cardBox!.x + cardBox!.width / 2;
    const startY = cardBox!.y + cardBox!.height / 2;
    const endX = pitchBox!.x + pitchBox!.width * 5 / 6;
    const endY = pitchBox!.y + pitchBox!.height * .78;
    await bremner.dispatchEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 });
    await page.locator('body').dispatchEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 });
    await expect(preview).toHaveAttribute('data-zone', 'ATT');
    await expect(page.locator('[data-v8-zone="ATT"]')).toHaveClass(/is-placement-focus/);
    await page.locator('body').dispatchEvent('pointercancel', { ...pointer, clientX: endX, clientY: endY, buttons: 0 });

    await expectMobileFit(page);
  });

  test('keeps placement evidence readable on a 375 × 667 phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/lab/match-v8');

    await page.getByTestId('player-card-bremner').click();
    const preview = page.getByTestId('v8-placement-preview');
    const actionEffect = page.getByTestId('v8-placement-action-effect');
    await expect(preview).toBeVisible();
    await expect(actionEffect).toBeVisible();
    const layout = await preview.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const heading = element.querySelector('strong');
      const stats = element.querySelector('span');
      return {
        top: box.top,
        bottom: box.bottom,
        headingSize: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
        statsSize: stats ? Number.parseFloat(getComputedStyle(stats).fontSize) : 0,
      };
    });
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(667);
    expect(layout.headingSize).toBeGreaterThanOrEqual(7);
    expect(layout.statsSize).toBeGreaterThanOrEqual(6);
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
    await expectEnergy(page, 2, 2);
    await expectMobileFit(page);
  });

  test('uses calibrated player costs and releases the Manager slot after reveal', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await openLabTools(page);

    await expect(page.getByText('PERIOD 1/4', { exact: true }).first()).toBeVisible();
    await expectEnergy(page, 2, 2);
    await expect(page.getByText(/player Costs −1 \(min 1\)/)).toBeVisible();
    await expect(page.locator('.v8-zone')).toHaveCount(3);
    await expect(page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).locator('.v8-card__cost')).toHaveText('3');

    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await expect(page.getByText('PERIOD 2/4', { exact: true }).first()).toBeVisible();
    await expectEnergy(page, 4, 4);

    const defenceZone = page.locator('.v8-zone').first();
    await dragCardToZone(page, page.getByTestId('manager-card'), defenceZone, 8);
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expectEnergy(page, 1, 4);
    await expect(defenceZone.locator('.v8-chip--transient')).toContainText('CONTROL');
    await expect(defenceZone.locator('.v8-zone__heading span')).toHaveText('1/4');

    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await expect(page.getByText('PERIOD 3/4', { exact: true }).first()).toBeVisible();
    await expectEnergy(page, 6, 6);
    await expect(page.locator('.v8-card--manager')).toHaveCount(0);
    await expect(defenceZone.locator('.v8-chip--transient')).toHaveCount(0);
    await expect(page.locator('.v8-log')).toContainText('reveal CONTROL');
    await expectMobileFit(page);
  });

  test('generates a literal Cross for the next period, keeps it slotless and records useful period evidence', async ({ page }) => {
    await page.goto('/lab/match-v8');

    // P1 passes so P2 can afford Di María at her accepted printed 3-Energy calibration Cost.
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await expect(page.getByText('PERIOD 2/4', { exact: true }).first()).toBeVisible();
    await expectEnergy(page, 4, 4);

    const diMaria = page.locator('.v8-card').filter({ hasText: 'Ángel Di María' });
    await diMaria.click();
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await midfieldZone.click();
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expectEnergy(page, 1, 4);
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();

    const createdCross = page.getByTestId('v8-consequence').filter({ hasText: 'CROSS CREATED' });
    await expect(createdCross).toBeVisible({ timeout: 15_000 });
    await expect(createdCross).toHaveAttribute('data-destination', 'HAND');

    await expect(page.getByText('PERIOD 3/4', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('v8-window')).toHaveCount(0);
    await expectEnergy(page, 6, 6);
    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    await expect(crossCard).toBeVisible();
    await expect(page.getByTestId('v8-period-result')).toHaveCount(0);
    await expect(page.getByText('LAST PERIOD', { exact: true })).toHaveCount(0);

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

  test('does not reopen a post-reveal decision window for a Tactical generated this period', async ({ page }) => {
    await page.goto('/lab/match-v8');

    // P1 passes so P2 can afford Di María (3) and still retain 1 Energy for the Cross window.
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await expectEnergy(page, 4, 4);

    await page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).click();
    await page.locator('.v8-zone').nth(1).click();
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();

    await expect(page.getByText('PERIOD 3/4', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('v8-window')).toHaveCount(0);
    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    await expect(crossCard).toBeVisible();
    await dragCardToZone(page, crossCard, page.locator('.v8-zone').nth(2), 9);
    await expect(page.locator('.v8-commit')).toContainText('Cross → ATT');
    await expectEnergy(page, 5, 6);
    await expect(page.locator('.v8-card--chance').filter({ hasText: 'Cross' })).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('drags a held Tactical from the hand during normal commitment', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    await page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).click();
    await page.locator('.v8-zone').nth(1).click();
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();

    await expect(page.getByText('PERIOD 3/4', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('v8-window')).toHaveCount(0);

    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await expect(crossCard).toBeVisible();
    await dragCardToZone(page, crossCard, midfieldZone, 10);

    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-commit')).toContainText('Cross → MID');
    await expectEnergy(page, 5, 6);
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
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();

    const deployed = attackZone.locator('.v8-chip').filter({ hasText: 'Christine Sinclair' });
    await expect(deployed.locator('.v8-chip__stats > b')).toHaveText(['13', '1']);
    await expect(deployed.locator('.v8-chip__modifier')).toHaveText('+3A');
    await expect(deployed.locator('.v8-chip__modifier')).toHaveClass(/is-positive/);
    await expect(page.locator('.v8-log')).toContainText('ARRIVE UNMARKED fades: +4 ATT → +3 ATT');
    await expectMobileFit(page);
  });

  test('completes a match with final matchup telemetry and no horizontal overflow', async ({ page }) => {
    await page.goto('/lab/match-v8');
    await openLabTools(page);
    await page.getByTestId('home-squad-select').selectOption('balanced_midrange');
    await page.getByTestId('away-squad-select').selectOption('through_ball');

    for (let period = 1; period <= 4; period += 1) {
      await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
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
