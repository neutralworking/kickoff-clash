# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playtest.spec.ts >> wide play can be reordered into a wing overload with an intended finisher
- Location: tests/playtest.spec.ts:408:5

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.dragTo: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('.match-card-rail').first().locator('[role="button"]').filter({ hasText: 'Brandon Baker' }).first()

```

# Test source

```ts
  36  | 
  37  |   return card;
  38  | }
  39  | 
  40  | function takeCard(usedIds: number[], position: string, archetype?: string): Card {
  41  |   const card = pickCard(position, archetype, usedIds);
  42  |   usedIds.push(card.id);
  43  |   return card;
  44  | }
  45  | 
  46  | function serializeRun(state: RunState): string {
  47  |   const { jokers, tacticsDeck, ...rest } = state;
  48  |   const serialized: SerializedRunState = {
  49  |     ...rest,
  50  |     jokerIds: jokers.map((joker) => joker.id),
  51  |     tacticIds: tacticsDeck.map((tactic) => tactic.id),
  52  |   };
  53  |   return JSON.stringify(serialized);
  54  | }
  55  | 
  56  | function buildRunState(overrides: Partial<RunState> & Pick<RunState, 'deck' | 'playingStyle' | 'activeFormation' | 'formation'>): RunState {
  57  |   return {
  58  |     formation: overrides.formation,
  59  |     playingStyle: overrides.playingStyle,
  60  |     deck: overrides.deck,
  61  |     bench: overrides.deck,
  62  |     jokers: [],
  63  |     ownedFormations: [overrides.activeFormation],
  64  |     tacticsDeck: [],
  65  |     activeFormation: overrides.activeFormation,
  66  |     trainingApplied: {},
  67  |     cash: 18_000,
  68  |     stadiumTier: 1,
  69  |     ticketPriceBonus: 0,
  70  |     academyTier: 1,
  71  |     scoutedOpponentRound: null,
  72  |     round: 1,
  73  |     seasonPoints: 0,
  74  |     boardTargetPoints: 10,
  75  |     wins: 0,
  76  |     losses: 0,
  77  |     status: 'match',
  78  |     matchHistory: [],
  79  |     modifiers: [],
  80  |     seed: 10101,
  81  |     ...overrides,
  82  |   };
  83  | }
  84  | 
  85  | async function seedRun(page: Page, state: RunState) {
  86  |   await page.addInitScript(
  87  |     ({ runKey, historyKey, payload }) => {
  88  |       window.localStorage.removeItem(historyKey);
  89  |       window.localStorage.setItem(runKey, payload);
  90  |     },
  91  |     { runKey: STORAGE_KEY, historyKey: HISTORY_KEY, payload: serializeRun(state) },
  92  |   );
  93  | }
  94  | 
  95  | async function gotoMatchFromSavedRun(page: Page) {
  96  |   await page.goto('/');
  97  |   await page.getByRole('button', { name: /continue run/i }).click();
  98  |   await expect(page.getByText(/play call/i)).toBeVisible();
  99  | }
  100 | 
  101 | async function gotoShopFromSavedRun(page: Page) {
  102 |   await page.goto('/');
  103 |   await page.getByRole('button', { name: /continue run/i }).click();
  104 |   await expect(page.getByText(/transfer window/i)).toBeVisible();
  105 | }
  106 | 
  107 | async function quickReveal(page: Page) {
  108 |   const readyButton = page.getByRole('button', { name: /^ready$/i });
  109 |   for (let i = 0; i < 30; i += 1) {
  110 |     if (await readyButton.isVisible()) break;
  111 |     await page.locator('body').click({ position: { x: 40, y: 40 } });
  112 |     await page.waitForTimeout(150);
  113 |   }
  114 |   await expect(readyButton).toBeVisible();
  115 |   await readyButton.click();
  116 | }
  117 | 
  118 | async function startNewSeason(page: Page, packName: RegExp, styleName: RegExp) {
  119 |   await page.goto('/');
  120 |   await page.getByRole('button', { name: /new season/i }).click();
  121 |   await page.getByRole('button', { name: packName }).click();
  122 |   await page.getByRole('button', { name: styleName }).click();
  123 |   await page.getByRole('button', { name: /^open pack$/i }).click();
  124 |   await quickReveal(page);
  125 |   await expect(page.getByText(/play call/i)).toBeVisible();
  126 | }
  127 | 
  128 | async function commitCardsByName(page: Page, names: string[]) {
  129 |   for (const name of names) {
  130 |     await page.locator('.match-card-rail').nth(1).getByText(name, { exact: false }).click();
  131 |   }
  132 | }
  133 | 
  134 | async function dragAttackerByName(page: Page, source: string, target: string) {
  135 |   const attackRail = page.locator('.match-card-rail').first();
> 136 |   await attackRail.locator('[role="button"]').filter({ hasText: source }).first().dragTo(
      |                                                                                   ^ Error: locator.dragTo: Test timeout of 90000ms exceeded.
  137 |     attackRail.locator('[role="button"]').filter({ hasText: target }).first(),
  138 |   );
  139 | }
  140 | 
  141 | async function kickoffAndSkip(page: Page) {
  142 |   await page.getByRole('button', { name: /^kick off$/i }).click();
  143 |   await page.getByRole('button', { name: /skip/i }).click({ force: true });
  144 |   await page.waitForTimeout(250);
  145 | }
  146 | 
  147 | async function reachHalftime(page: Page) {
  148 |   for (let i = 0; i < 2; i += 1) {
  149 |     if (await page.getByRole('button', { name: /^kick off$/i }).isVisible()) {
  150 |       await kickoffAndSkip(page);
  151 |       continue;
  152 |     }
  153 | 
  154 |     if (await page.getByRole('button', { name: /continue/i }).isVisible()) {
  155 |       await page.getByRole('button', { name: /continue/i }).click();
  156 |       i -= 1;
  157 |       continue;
  158 |     }
  159 |   }
  160 |   await expect(page.getByText(/half time/i)).toBeVisible();
  161 | }
  162 | 
  163 | async function advanceMatchUntilPostmatch(page: Page) {
  164 |   for (let step = 0; step < 12; step += 1) {
  165 |     if (await page.getByRole('button', { name: /^continue to shop$/i }).isVisible()) {
  166 |       return;
  167 |     }
  168 | 
  169 |     if (await page.getByRole('button', { name: /^kick off$/i }).isVisible()) {
  170 |       const defenderButtons = page.locator('.match-card-rail').nth(1).locator('[role="button"]');
  171 |       const available = await defenderButtons.count();
  172 |       for (let i = 0; i < Math.min(3, available); i += 1) {
  173 |         await defenderButtons.nth(i).click();
  174 |       }
  175 |       await kickoffAndSkip(page);
  176 |       continue;
  177 |     }
  178 | 
  179 |     if (await page.getByRole('button', { name: /second half/i }).isVisible()) {
  180 |       await page.getByRole('button', { name: /second half/i }).click();
  181 |       continue;
  182 |     }
  183 | 
  184 |     const betweenContinue = page.getByRole('button', { name: /continue/i }).filter({
  185 |       hasNot: page.getByText(/continue to shop/i),
  186 |     });
  187 |     if (await betweenContinue.first().isVisible()) {
  188 |       await betweenContinue.first().click();
  189 |       continue;
  190 |     }
  191 | 
  192 |     if (await page.getByRole('button', { name: /^continue$/i }).isVisible()) {
  193 |       await page.getByRole('button', { name: /^continue$/i }).click();
  194 |       continue;
  195 |     }
  196 | 
  197 |     await page.waitForTimeout(300);
  198 |   }
  199 | 
  200 |   await expect(page.getByRole('button', { name: /^continue to shop$/i })).toBeVisible();
  201 | }
  202 | 
  203 | function rail(page: Page, index: number): Locator {
  204 |   return page.locator('.match-card-rail').nth(index);
  205 | }
  206 | 
  207 | async function readPlanningMetrics(page: Page): Promise<{
  208 |   playCall: string;
  209 |   create: number;
  210 |   finish: number;
  211 | }> {
  212 |   const bodyText = await page.locator('body').innerText();
  213 |   const playCallMatch = bodyText.match(/Play Call \|\s*([^\n]+)/);
  214 |   const chanceMatch = bodyText.match(/Create\s+(\d+)\s+\|\s+Finish\s+(\d+)/);
  215 | 
  216 |   if (!playCallMatch || !chanceMatch) {
  217 |     throw new Error('Unable to read planning metrics from UI');
  218 |   }
  219 | 
  220 |   return {
  221 |     playCall: playCallMatch[1].trim(),
  222 |     create: Number(chanceMatch[1]),
  223 |     finish: Number(chanceMatch[2]),
  224 |   };
  225 | }
  226 | 
  227 | async function applyNamedPlan(page: Page, names: string[]) {
  228 |   const defenceRail = rail(page, 1);
  229 |   for (const name of names) {
  230 |     const candidate = defenceRail.locator('[role="button"]').filter({ hasText: name }).first();
  231 |     if (await candidate.count()) {
  232 |       await candidate.click();
  233 |     }
  234 |   }
  235 | }
  236 | 
```