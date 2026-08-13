import { expect, test, type Page } from '@playwright/test';
import { ALL_FORMATIONS, getFormation } from '../src/lib/formations';
import { ripStarterPacks } from '../src/lib/packs';
import { createRun, type RunState } from '../src/lib/run';
import { autoFillXI } from '../src/lib/team-select';

const STORAGE_KEY = 'kickoff-clash-v4-run';

function serializeRun(state: RunState): string {
  const { jokers, tacticsDeck, ...rest } = state;
  return JSON.stringify({
    ...rest,
    jokerIds: jokers.map((joker) => joker.id),
    tacticIds: tacticsDeck.map((tactic) => tactic.id),
  });
}

function teamTalkRun(formationId: string): RunState {
  const contents = ripStarterPacks(8082042);
  const formation = getFormation(formationId);
  const selection = autoFillXI(contents.players, formation, false);
  const run = createRun({
    players: contents.players,
    startingXI: selection.xi.map((card) => card.id),
    benchIds: selection.bench.slice(0, 7).map((card) => card.id),
    manager: null,
    tactics: [],
    formationId,
    intent: 'balanced',
  }, 8082042);

  return {
    ...run,
    status: 'teamTalk',
    formation: formationId,
    activeFormation: formationId,
    ownedFormations: ALL_FORMATIONS.map(({ id }) => id),
  };
}

async function openTeamTalk(page: Page, formationId: string) {
  await page.goto('/');
  await page.evaluate(({ key, value }) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: serializeRun(teamTalkRun(formationId)) });
  await page.reload();
  await page.getByRole('button', { name: /continue run/i }).click();
  await expect(page.getByText(formationId, { exact: true })).toBeVisible();
}

async function expectReadablePitch(page: Page, formationId: string) {
  const pitch = page.locator('[data-kc="pitch"]');
  const slots = pitch.locator('[data-slot-index]');
  await expect(slots).toHaveCount(11);

  const geometry = await pitch.evaluate((pitchElement) => {
    const pitchRect = pitchElement.getBoundingClientRect();
    const cards = Array.from(pitchElement.querySelectorAll<HTMLElement>('[data-slot-index]')).map((element) => {
      const visualCard = element.querySelector<HTMLElement>('[data-player-id]') ?? element;
      const rect = visualCard.getBoundingClientRect();
      return {
        index: Number(element.dataset.slotIndex),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    return {
      pitch: { left: pitchRect.left, top: pitchRect.top, right: pitchRect.right, bottom: pitchRect.bottom },
      cards,
    };
  });

  for (const card of geometry.cards) {
    expect(card.left, `${formationId} slot ${card.index} left`).toBeGreaterThanOrEqual(geometry.pitch.left - 1);
    expect(card.right, `${formationId} slot ${card.index} right`).toBeLessThanOrEqual(geometry.pitch.right + 1);
    expect(card.top, `${formationId} slot ${card.index} top`).toBeGreaterThanOrEqual(geometry.pitch.top - 1);
    expect(card.bottom, `${formationId} slot ${card.index} bottom`).toBeLessThanOrEqual(geometry.pitch.bottom + 1);
  }

  for (let first = 0; first < geometry.cards.length; first += 1) {
    for (let second = first + 1; second < geometry.cards.length; second += 1) {
      const a = geometry.cards[first]!;
      const b = geometry.cards[second]!;
      const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const overlapRatio = (overlapWidth * overlapHeight) / Math.min(a.width * a.height, b.width * b.height);
      expect(overlapRatio, `${formationId} slots ${a.index}/${b.index} overlap`).toBeLessThan(0.12);
    }
  }
}

for (const viewport of [
  { name: '390 × 844', width: 390, height: 844 },
  { name: '375 × 667', width: 375, height: 667 },
]) {
  test(`keeps all eight formations readable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const formation of ALL_FORMATIONS) {
      await test.step(formation.id, async () => {
        await openTeamTalk(page, formation.id);
        await expectReadablePitch(page, formation.id);
      });
    }
  });
}
