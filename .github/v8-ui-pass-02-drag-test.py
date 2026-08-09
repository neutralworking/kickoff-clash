from pathlib import Path

path = Path('tests/v8-match-lab.spec.ts')
text = path.read_text()
old = """  const cardBox = await card.boundingBox();
  const zoneBox = await zone.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(zoneBox).not.toBeNull();
  const startX = cardBox!.x + cardBox!.width / 2;
  const startY = cardBox!.y + cardBox!.height / 2;
  const endX = zoneBox!.x + zoneBox!.width / 2;
  const endY = zoneBox!.y + zoneBox!.height * 0.74;"""
new = """  const cardBox = await card.boundingBox();
  const pitchBox = await page.locator('.v8-pitch').boundingBox();
  const zoneName = await zone.getAttribute('data-v8-zone');
  expect(cardBox).not.toBeNull();
  expect(pitchBox).not.toBeNull();
  expect(zoneName).toMatch(/^(DEF|MID|ATT)$/);
  const startX = cardBox!.x + cardBox!.width / 2;
  const startY = cardBox!.y + cardBox!.height / 2;
  const endX = pitchBox!.x + pitchBox!.width / 2;
  const depth = zoneName === 'ATT' ? 1 / 6 : zoneName === 'MID' ? 1 / 2 : 5 / 6;
  const endY = pitchBox!.y + pitchBox!.height * depth;"""
if old not in text:
    raise SystemExit('drag helper geometry block not found')
path.write_text(text.replace(old, new, 1))
