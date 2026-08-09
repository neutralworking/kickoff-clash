from pathlib import Path

path = Path('tests/v8-match-lab.spec.ts')
text = path.read_text()
old = """async function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {
  const cardBox = await card.boundingBox();"""
new = """async function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {
  // A real mobile user scrolls the horizontal hand until the card is on-screen before lifting it.
  // Do the same here so the gesture vector tests vertical drag rather than an artificial
  // hundreds-of-pixels horizontal move from an off-screen card.
  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();"""
if old not in text:
    raise SystemExit('shared drag helper not found')
path.write_text(text.replace(old, new, 1))
