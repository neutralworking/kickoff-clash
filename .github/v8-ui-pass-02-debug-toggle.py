from pathlib import Path

component_path = Path('src/components/match-v8/V8CalibrationLab.tsx')
css_path = Path('src/components/match-v8/v8lab.css')
test_path = Path('tests/v8-match-lab.spec.ts')

component = component_path.read_text()
css = css_path.read_text()
tests = test_path.read_text()

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing expected block: {label}')
    return text.replace(old, new, 1)

component = replace_once(
    component,
    "  const [finished, setFinished] = useState(false);\n  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);",
    "  const [finished, setFinished] = useState(false);\n  const [debugOpen, setDebugOpen] = useState(false);\n  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);",
    'debug state',
)
component = replace_once(
    component,
    "    setMatchTelemetry(null);\n    setFinished(false);\n  };",
    "    setMatchTelemetry(null);\n    setFinished(false);\n    setDebugOpen(false);\n  };",
    'reset debug state',
)
component = replace_once(
    component,
    "    <main className={`v8-shell${handDrag ? ' is-dragging' : ''}`}>",
    "    <main className={`v8-shell${handDrag ? ' is-dragging' : ''}${debugOpen ? ' is-debug-open' : ''}`}>",
    'debug main class',
)
component = replace_once(
    component,
    '<div className="v8-condition">',
    '<div className="v8-condition" hidden={!debugOpen}>',
    'hide condition',
)
component = replace_once(
    component,
    '<section className="v8-lab-controls v8-lab-controls--squads" aria-label="Calibration squads">',
    '<section className="v8-lab-controls v8-lab-controls--squads" aria-label="Calibration squads" hidden={!debugOpen}>',
    'hide squad controls',
)
component = replace_once(
    component,
    '<section className="v8-totals">',
    '<section className="v8-totals" hidden={!debugOpen}>',
    'hide totals',
)
component = replace_once(
    component,
    '<details className="v8-telemetry" data-testid="v8-telemetry" open={finished}>',
    '<details className="v8-telemetry" data-testid="v8-telemetry" open={finished} hidden={!debugOpen}>',
    'hide telemetry',
)
component = replace_once(
    component,
    '<section className="v8-log">',
    '<section className="v8-log" hidden={!debugOpen}>',
    'hide log',
)

anchor = """      {handDrag?.moved && (\n        <div"""
insert = """      <button\n        type=\"button\"\n        className=\"v8-debug-toggle\"\n        aria-expanded={debugOpen}\n        onClick={() => setDebugOpen((open) => !open)}\n      >\n        {debugOpen ? 'CLOSE LAB TOOLS' : 'OPEN LAB TOOLS'}\n      </button>\n\n      {handDrag?.moved && (\n        <div"""
component = replace_once(component, anchor, insert, 'debug toggle')

css += r'''

/* Explicit lab drawer boundary: the playable match does not depend on spacing tricks. */
.v8-shell [hidden] { display: none !important; }
.v8-debug-toggle {
  order: 70;
  align-self: center;
  min-height: 28px;
  margin: 118px auto 0;
  padding: 0 12px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 99px;
  background: rgba(255,255,255,.025);
  color: rgba(255,255,255,.34);
  font-size: 6px;
  font-weight: 900;
  letter-spacing: .12em;
  cursor: pointer;
}
.v8-debug-toggle[aria-expanded="true"] {
  border-color: rgba(255, 205, 104, .18);
  color: rgba(255, 213, 123, .62);
}
.v8-condition {
  margin-top: 8px !important;
}
'''

# The first viewport acceptance now checks that the lab is genuinely hidden and even its
# opt-in control starts below the screen rather than measuring a hidden element's geometry.
tests = replace_once(
    tests,
    """      firstCard: rect('.v8-hand .v8-card'),\n      labTools: rect('.v8-condition'),\n    };""",
    """      firstCard: rect('.v8-hand .v8-card'),\n      debugToggle: rect('.v8-debug-toggle'),\n    };""",
    'test debug geometry target',
)
tests = replace_once(
    tests,
    "expect(positions.labTools.top).toBeGreaterThanOrEqual(positions.viewportHeight);",
    "expect(positions.debugToggle.top).toBeGreaterThanOrEqual(positions.viewportHeight);",
    'debug toggle below fold assertion',
)
tests = replace_once(
    tests,
    """    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).toBeVisible();\n    await expect(page.locator('.v8-hand .v8-card__art img').first()).toBeVisible();""",
    """    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).not.toBeVisible();\n    await expect(page.locator('.v8-hand .v8-card__art img').first()).toBeVisible();""",
    'lab hidden acceptance',
)

helper_anchor = """async function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {"""
helper = """async function openLabTools(page: Page) {\n  const toggle = page.getByRole('button', { name: 'OPEN LAB TOOLS' });\n  if (await toggle.count()) {\n    await toggle.click();\n    await expect(page.getByRole('button', { name: 'CLOSE LAB TOOLS' })).toBeVisible();\n  }\n}\n\nasync function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {"""
tests = replace_once(tests, helper_anchor, helper, 'open lab helper')

# Tests that intentionally exercise calibration/debug surfaces explicitly open them first.
tests = replace_once(
    tests,
    """  test('selects coherent calibration squads and exposes their compressed Cost profiles', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n\n    const homeSquad""",
    """  test('selects coherent calibration squads and exposes their compressed Cost profiles', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n    await openLabTools(page);\n\n    const homeSquad""",
    'squad test lab open',
)
tests = replace_once(
    tests,
    """  test('uses calibrated player costs and releases the Manager slot after reveal', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n\n    await expect(page.getByText('0–22'""",
    """  test('uses calibrated player costs and releases the Manager slot after reveal', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n    await openLabTools(page);\n\n    await expect(page.getByText('0–22'""",
    'manager test lab open',
)
# Telemetry is inspected after period resolution, so open the drawer immediately before inspection.
tests = replace_once(
    tests,
    """    const telemetry = page.getByTestId('v8-telemetry');\n    await expect(telemetry).toContainText('2/4 periods');""",
    """    await openLabTools(page);\n    const telemetry = page.getByTestId('v8-telemetry');\n    await expect(telemetry).toContainText('2/4 periods');""",
    'telemetry drawer open',
)
tests = replace_once(
    tests,
    """  test('shows and applies Sinclair action decay after the scoring window', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n    await page.getByTestId('home-squad-select').selectOption('control_defence');""",
    """  test('shows and applies Sinclair action decay after the scoring window', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n    await openLabTools(page);\n    await page.getByTestId('home-squad-select').selectOption('control_defence');""",
    'sinclair lab open',
)
tests = replace_once(
    tests,
    """  test('completes a match with final matchup telemetry and no horizontal overflow', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n    await page.getByTestId('home-squad-select').selectOption('balanced_midrange');""",
    """  test('completes a match with final matchup telemetry and no horizontal overflow', async ({ page }) => {\n    await page.goto('/lab/match-v8');\n    await openLabTools(page);\n    await page.getByTestId('home-squad-select').selectOption('balanced_midrange');""",
    'full match lab open',
)

component_path.write_text(component)
css_path.write_text(css)
test_path.write_text(tests)
