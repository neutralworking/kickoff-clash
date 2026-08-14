import { expect, test, type Page } from '@playwright/test';
import { lastName } from '../src/components/cards/cardTokens';
import { createRun, getPlayerPickCards, type RunState } from '../src/lib/run';
import { ripStarterPackChoices, ripStarterPacks } from '../src/lib/packs';

const STORAGE_KEY = 'kickoff-clash-v4-run';

function serializeRun(state: RunState): string {
  const { jokers, tacticsDeck, ...rest } = state;
  return JSON.stringify({
    ...rest,
    jokerIds: jokers.map((joker) => joker.id),
    tacticIds: tacticsDeck.map((tactic) => tactic.id),
  });
}

function seededStarterRun(seed = 8082026): RunState {
  const contents = ripStarterPacks(seed);
  return createRun({
    players: contents.players,
    startingXI: contents.players.slice(0, 11).map((card) => card.id),
    benchIds: contents.players.slice(11).map((card) => card.id),
    manager: null,
    tactics: [],
    formationId: '4-3-3',
    intent: 'balanced',
  }, seed);
}

async function playFourPeriods(page: Page) {
  const intro = page.getByTestId('v8-match-intro');
  if (await intro.isVisible()) await intro.click();

  for (let period = 1; period <= 4; period += 1) {
    for (let play = 0; play < 4; play += 1) {
      const affordable = page.locator('.v8-hand .v8-card:not(.is-unaffordable):not(.v8-card--chance):not(.v8-card--manager)').first();
      if (await affordable.count() === 0) break;
      await affordable.click();
      const preview = page.getByTestId('v8-placement-preview');
      if (await preview.count() === 0) break;
      const zone = await preview.getAttribute('data-zone');
      if (!zone) break;
      await page.locator(`[data-v8-zone="${zone}"]`).click();
    }
    await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
    const skip = page.getByRole('button', { name: 'Skip reveal sequence' });
    await expect(skip).toBeVisible();
    await skip.click();
    if (period < 4) {
      await expect(page.getByText(`PERIOD ${period + 1}/4`, { exact: true }).first()).toBeVisible();
    }
  }

  await expect(page.locator('.v8-result')).toBeVisible();
  await expect(page.locator('.v8-result')).toContainText('FULL TIME');
}

async function expectPhoneWidth(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  expect(width.body).toBeLessThanOrEqual(width.viewport);
}

test.describe('V8 production run handoff', () => {
  test('plays a fresh opening through V8 and into the existing post-match flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.clear();
      Date.now = () => 8082026;
    });
    await page.goto('/');

    await expect(page.getByText('BUILD AN XI. WIN THE CUP.', { exact: true })).toBeVisible();
    await expect(page.getByText(/six-contest rebuild/i)).toHaveCount(0);

    await page.getByRole('button', { name: /new season/i }).click();
    await page.getByRole('button', { name: /choose manager pack/i }).nth(1).click();
    await page.getByRole('button', { name: /choose player pack/i }).click();
    await page.getByRole('button', { name: /choose player pack/i }).nth(2).click();
    await page.getByRole('button', { name: /build your xi/i }).click();

    await expect(page.getByText('TEAM SELECTION v FC Warm-Up', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'HOME', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(DEF|BAL|ATT)$/ })).toHaveCount(0);
    await expect(page.getByText('COST / MAX', { exact: true })).toHaveCount(0);
    await expect(page.getByText('AVG COST', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/XI \d+\/11 · BENCH \d+\/7/)).toHaveCount(0);
    await expect(page.getByTestId('team-selection-controls').locator(':scope > button')).toHaveCount(4);

    const selectedPack = ripStarterPackChoices(8082026).playerPacks[2];
    const multiPositionCard = selectedPack.find((card) => (card.positionLabels?.length ?? 0) > 1)!;
    await page.locator('.slot-pulse').first().click();
    const option = page.locator(`[data-testid="team-selection-player-option"][data-player-id="${multiPositionCard.id}"]`);
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute('data-player-positions', multiPositionCard.positionLabels!.join('/'));
    await expect(option).toHaveAttribute('data-player-action', multiPositionCard.abilityName!);
    await expect(option).toHaveAttribute('data-player-attack', String(multiPositionCard.printedAttack));
    await expect(option).toHaveAttribute('data-player-defence', String(multiPositionCard.printedDefence));
    await expect(option.locator('[data-position-chip]')).toHaveCount(multiPositionCard.positionLabels!.length);
    await page.getByRole('button', { name: 'CLOSE', exact: true }).click();

    await page.getByRole('button', { name: 'AUTO SELECT', exact: true }).click();
    await expect(page.locator('[aria-label^="Inspect "]')).toHaveCount(0);
    const pitchCard = page.locator('[data-kc="pitch"] [data-player-action]').first();
    await expect(pitchCard.locator('[data-position-chip]')).toHaveCount(1);
    await expect(pitchCard.locator('small')).toHaveCount(0);
    await expect(page.locator('[data-kc="pitch"] img, [data-kc="bench"] img')).toHaveCount(0);
    await pitchCard.click();
    const currentPlayer = page.getByTestId('team-selection-current-player');
    await expect(currentPlayer).toBeVisible();
    await expect(currentPlayer.locator('[data-position-chip]')).toHaveCount(await currentPlayer.getAttribute('data-player-positions').then((positions) => positions?.split('/').length ?? 0));
    await expect(currentPlayer).toHaveAttribute('data-player-action', /.+/);
    await page.getByRole('button', { name: 'CLOSE', exact: true }).click();

    await expect(page.getByRole('button', { name: /remove .* from bench/i })).toHaveCount(0);
    await page.getByRole('button', { name: /bench 7\/7.*edit/i }).click();
    const benchEditor = page.getByTestId('bench-editor');
    await expect(benchEditor).toBeVisible();
    const benchEditorSheet = page.getByTestId('bench-editor-sheet');
    await benchEditorSheet.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const editorBox = await benchEditorSheet.boundingBox();
    expect(editorBox?.height ?? 0).toBeGreaterThan(830);
    const currentBench = page.getByTestId('bench-editor-current');
    const reservePool = page.getByTestId('bench-editor-reserves');
    await expect(currentBench).toBeVisible();
    await expect(reservePool).toBeVisible();
    const draggedBenchCard = currentBench.getByRole('button', { name: /^Drag / }).first();
    const from = await draggedBenchCard.boundingBox();
    const to = await reservePool.boundingBox();
    if (!from || !to) throw new Error('Bench editor drag targets were not laid out');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 8 });
    await page.mouse.up();
    await expect(currentBench.getByRole('button', { name: /^Drag / })).toHaveCount(6);
    await expect(reservePool.getByRole('button', { name: /^Drag / })).toHaveCount(1);
    await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
    await page.getByRole('button', { name: /kick off/i }).click();

    await expect(page.getByTestId('v8-match-intro')).toBeVisible();
    await expect(page.getByRole('button', { name: /open lab tools/i })).toHaveCount(0);
    const matchManager = page.getByTestId('manager-card');
    await expect(matchManager).toHaveAttribute('data-manager-id', /^(?!control$).+/);
    await expect(matchManager).toHaveAttribute('data-manager-action', /.+/);
    await expect(matchManager).not.toContainText('CONTROL');
    await playFourPeriods(page);
    await expectPhoneWidth(page);

    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await expect(page.locator('.phase-postmatch')).toBeVisible();
    await expect(page.locator('.phase-postmatch')).toContainText(/VICTORY|STALEMATE/);
    await expect(page.locator('.phase-postmatch')).not.toContainText(/fitness|contests|durability/i);
  });

  test('keeps the production match playable on a 375 × 667 phone', async ({ page }) => {
    const run = seededStarterRun();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    }, { key: STORAGE_KEY, value: serializeRun(run) });
    await page.goto('/');
    await page.getByRole('button', { name: /continue run/i }).click();

    await expect(page.getByTestId('v8-match-intro')).toBeVisible();
    await playFourPeriods(page);
    await expectPhoneWidth(page);
    await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeInViewport();
  });

  test('offers authored V8 players in the between-match shop', async ({ page }) => {
    const starter = seededStarterRun(8082029);
    const run: RunState = { ...starter, status: 'shop', cash: 100_000 };
    const shopSeed = run.seed + run.round * 999;
    const expectedCards = getPlayerPickCards(shopSeed + 77);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ key, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    }, { key: STORAGE_KEY, value: serializeRun(run) });
    await page.goto('/');
    await page.getByRole('button', { name: /continue run/i }).click();

    await expect(page.locator('.phase-shop')).toBeVisible();
    await page.getByRole('button', { name: /^Player Pick/ }).click();
    const picker = page.getByRole('dialog');
    await expect(picker.getByRole('button', { name: /^Sign/ })).toHaveCount(3);
    for (const card of expectedCards) {
      await expect(picker.getByText(lastName(card.name), { exact: false }).first()).toBeVisible();
    }
    await expectPhoneWidth(page);
  });
});
