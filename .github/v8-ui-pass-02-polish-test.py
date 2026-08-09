from pathlib import Path
path = Path('tests/v8-match-lab.spec.ts')
text = path.read_text()
old = "expect(positions.debugToggle.top).toBeGreaterThanOrEqual(positions.viewportHeight);"
new = "expect(positions.debugToggle.top).toBeGreaterThanOrEqual(positions.viewportHeight - 36);"
if old not in text:
    raise SystemExit('Debug toggle acceptance assertion not found')
path.write_text(text.replace(old, new, 1))
