from pathlib import Path

path = Path('tests/v8-match-lab.spec.ts')
text = path.read_text()
old = """  const cardBox = await card.boundingBox();\n  const zoneBox = await zone.boundingBox();\n  expect(cardBox).not.toBeNull();\n  expect(zoneBox).not.toBeNull();\n  const startX = cardBox!.x + cardBox!.width / 2;\n  const startY = cardBox!.y + cardBox!.height / 2;\n  const endX = zoneBox!.x + zoneBox!.width / 2;\n  const endY = zoneBox!.y + zoneBox!.height / 2;"""
new = """  const cardBox = await card.boundingBox();\n  const pitchBox = await page.locator('.v8-pitch').boundingBox();\n  const zoneName = await zone.getAttribute('data-v8-zone');\n  expect(cardBox).not.toBeNull();\n  expect(pitchBox).not.toBeNull();\n  expect(zoneName).toMatch(/^(DEF|MID|ATT)$/);\n  const startX = cardBox!.x + cardBox!.width / 2;\n  const startY = cardBox!.y + cardBox!.height / 2;\n  const endX = pitchBox!.x + pitchBox!.width / 2;\n  const depth = zoneName === 'ATT' ? 1 / 6 : zoneName === 'MID' ? 1 / 2 : 5 / 6;\n  const endY = pitchBox!.y + pitchBox!.height * depth;"""
if old not in text:
    raise SystemExit('drag helper geometry block not found')
path.write_text(text.replace(old, new, 1))
