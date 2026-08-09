from pathlib import Path

css_path = Path('src/components/match-v8/v8lab.css')
test_path = Path('tests/v8-match-lab.spec.ts')
css = css_path.read_text()
tests = test_path.read_text()

css += r'''

/* Final Pass 02 review corrections. */
.v8-zone {
  height: auto;
  align-self: stretch;
}
.v8-card.is-unaffordable {
  filter: saturate(.74) brightness(.78);
  opacity: .88;
}
.v8-debug-toggle { margin-top: 118px; }
'''

old = "expect(positions.debugToggle.top).toBeGreaterThanOrEqual(positions.viewportHeight - 36);"
new = "expect(positions.debugToggle.top).toBeGreaterThanOrEqual(positions.viewportHeight);"
if old not in tests:
    raise SystemExit('Expected lab-toggle visual assertion not found')
tests = tests.replace(old, new, 1)

css_path.write_text(css)
test_path.write_text(tests)
