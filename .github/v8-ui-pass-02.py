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

# Reuse the existing V7/player-card portrait infrastructure rather than initials-only placeholders.
component = replace_once(
    component,
    "import { calibrationEnergyForPeriod, calibrationPlayCost } from '@/engine-v8/calibration-balance';\nimport './v8lab.css';",
    "import { calibrationEnergyForPeriod, calibrationPlayCost } from '@/engine-v8/calibration-balance';\nimport { managerPortraitSrc, portraitSrc } from '../cards/portrait';\nimport './v8lab.css';",
    'portrait import',
)

player_sig = """  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;\n}) {\n  return ("""
player_new = """  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;\n}) {\n  const portrait = portraitSrc({ id: card.sourceCardId ?? card.id, name: card.realName, position: card.position });\n  return ("""
component = replace_once(component, player_sig, player_new, 'player portrait variable')
component = replace_once(
    component,
    '<span className="v8-card__art" aria-hidden="true"><i>{card.matchName.slice(0, 2).toUpperCase()}</i></span>',
    '<span className="v8-card__art" aria-hidden="true"><i>{card.matchName.slice(0, 2).toUpperCase()}</i>{portrait && <img src={portrait} alt="" draggable={false} />}</span>',
    'player portrait art',
)

# Tactical cards get a proper visual face rather than being text-only rectangles.
tactical_start = component.index('function TacticalHandCard(')
tactical_end = component.index('\nfunction DeployedChip', tactical_start)
tactical = component[tactical_start:tactical_end]
tactical = replace_once(
    tactical,
    '      onPointerDown={onPointerDown}\n    >\n      <span className="v8-card__cost">{cost}</span>',
    '      onPointerDown={onPointerDown}\n    >\n      <span className="v8-card__art v8-card__art--tactical" aria-hidden="true"><i>{card.name.slice(0, 1)}</i><em>TACTICAL</em></span>\n      <span className="v8-card__cost">{cost}</span>',
    'tactical face',
)
component = component[:tactical_start] + tactical + component[tactical_end:]

# Deployed players become visual pitch pieces with portraits, match names and live stats.
component = replace_once(
    component,
    "  const card = calibrationPlayerCard(player);\n  const attack = currentCalibrationAttack(state, runtimeId);",
    "  const card = calibrationPlayerCard(player);\n  const portrait = portraitSrc({ id: card.sourceCardId ?? card.id, name: card.realName, position: card.position });\n  const attack = currentCalibrationAttack(state, runtimeId);",
    'deployed portrait variable',
)
component = replace_once(
    component,
    """      <span className=\"v8-card__sr\">{card.realName}</span>\n      {card.matchName}\n      <b>{attack}/{defence}</b>\n      <small>{suppressed ? 'NO ACTION' : moveable ? (moved ? 'MOVE USED' : 'MOVEABLE') : card.actionName}</small>""",
    """      <span className=\"v8-card__sr\">{card.realName}</span>\n      <span className=\"v8-chip__portrait\" aria-hidden=\"true\"><i>{card.matchName.slice(0, 1)}</i>{portrait && <img src={portrait} alt=\"\" draggable={false} />}</span>\n      <span className=\"v8-chip__name\">{card.matchName}</span>\n      <b>{attack}/{defence}</b>\n      <small>{suppressed ? 'NO ACTION' : moveable ? (moved ? 'MOVE USED' : 'MOVEABLE') : card.actionName}</small>""",
    'deployed visual content',
)

# Manager art uses the existing dedicated manager portrait pool.
component = replace_once(
    component,
    "  const draggedTactical = handDrag?.kind === 'tactical' ? calibrationHandTacticals(windowPhase?.resolved ?? state, 'home').find((card) => card.id === handDrag.cardId) ?? null : null;\n  const interactionLabel =",
    "  const draggedTactical = handDrag?.kind === 'tactical' ? calibrationHandTacticals(windowPhase?.resolved ?? state, 'home').find((card) => card.id === handDrag.cardId) ?? null : null;\n  const draggedPlayerPortrait = draggedPlayer ? portraitSrc({ id: draggedPlayer.sourceCardId ?? draggedPlayer.id, name: draggedPlayer.realName, position: draggedPlayer.position }) : null;\n  const managerPortrait = managerPortraitSrc('control');\n  const interactionLabel =",
    'manager and drag portrait vars',
)
component = replace_once(
    component,
    """            >\n              <span className=\"v8-card__cost\">{MANAGER_COST}</span>\n              <span className=\"v8-card__position\">MANAGER</span>""",
    """            >\n              <span className=\"v8-card__art v8-card__art--manager\" aria-hidden=\"true\"><i>CO</i>{managerPortrait && <img src={managerPortrait} alt=\"\" draggable={false} />}</span>\n              <span className=\"v8-card__cost\">{MANAGER_COST}</span>\n              <span className=\"v8-card__position\">MANAGER</span>""",
    'manager art',
)
component = replace_once(
    component,
    """          <span className=\"v8-card__art\"><i>{handDrag.kind === 'player' ? draggedPlayer?.matchName.slice(0, 2).toUpperCase() : handDrag.kind === 'tactical' ? 'TX' : 'CO'}</i></span>""",
    """          <span className={`v8-card__art${handDrag.kind === 'tactical' ? ' v8-card__art--tactical' : handDrag.kind === 'manager' ? ' v8-card__art--manager' : ''}`}><i>{handDrag.kind === 'player' ? draggedPlayer?.matchName.slice(0, 2).toUpperCase() : handDrag.kind === 'tactical' ? 'TX' : 'CO'}</i>{handDrag.kind === 'player' && draggedPlayerPortrait && <img src={draggedPlayerPortrait} alt=\"\" draggable={false} />}{handDrag.kind === 'manager' && managerPortrait && <img src={managerPortrait} alt=\"\" draggable={false} />}</span>""",
    'drag portrait art',
)

# Add stronger board semantics without touching engine state or zone hooks.
component = replace_once(
    component,
    '<section className="v8-pitch" aria-label="DEF MID ATT board">',
    '<section className="v8-pitch" aria-label="DEF MID ATT board"><div className="v8-pitch__stadium" aria-hidden="true"><i /><i /><i /></div>',
    'pitch stadium layer',
)

# Visual acceptance checks: the playable stage is the first viewport; lab tools are below it.
test_old = """      firstCard: rect('.v8-hand .v8-card'),\n    };\n  });\n\n  expect(positions.pitch.top).toBeGreaterThanOrEqual(0);\n  expect(positions.pitch.bottom).toBeLessThan(positions.viewportHeight);\n  expect(positions.commit.bottom).toBeLessThan(positions.viewportHeight);\n  expect(positions.firstCard.top).toBeLessThan(positions.viewportHeight);\n  expect(positions.firstCard.bottom).toBeLessThanOrEqual(positions.viewportHeight);"""
test_new = """      firstCard: rect('.v8-hand .v8-card'),\n      labTools: rect('.v8-condition'),\n    };\n  });\n\n  expect(positions.pitch.top).toBeGreaterThanOrEqual(0);\n  expect(positions.pitch.bottom).toBeLessThan(positions.viewportHeight);\n  expect(positions.pitch.bottom - positions.pitch.top).toBeGreaterThanOrEqual(380);\n  expect(positions.commit.bottom).toBeLessThan(positions.viewportHeight);\n  expect(positions.firstCard.top).toBeLessThan(positions.viewportHeight);\n  expect(positions.firstCard.bottom).toBeLessThanOrEqual(positions.viewportHeight);\n  expect(positions.labTools.top).toBeGreaterThanOrEqual(positions.viewportHeight);"""
tests = replace_once(tests, test_old, test_new, 'mobile visual acceptance')
tests = replace_once(
    tests,
    "    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).toBeVisible();\n    await expectTestingSurfaceAboveFold(page);",
    "    await expect(page.getByText('V8 SQUAD CALIBRATION', { exact: true })).toBeVisible();\n    await expect(page.locator('.v8-hand .v8-card__art img').first()).toBeVisible();\n    await expectTestingSurfaceAboveFold(page);",
    'portrait acceptance',
)

# Pass 02 is intentionally a decisive visual override. Existing class hooks stay intact so engine/browser
# regression coverage remains useful while the playable first viewport is rebuilt around the game.
css += r'''

/* ========================================================================== */
/* V8 UI PASS 02 — MOBILE MATCH STAGE                                         */
/* The engine stays untouched. The first viewport now presents a game, not a */
/* calibration form. Debug/calibration surfaces remain available below fold. */
/* ========================================================================== */

.v8-shell {
  --v8-bg: #07080d;
  --v8-panel: #11131a;
  --v8-ink: #fff7e8;
  --v8-muted: #9299a8;
  --v8-gold: #f5a82d;
  --v8-gold-2: #ffd56b;
  --v8-orange: #ff7045;
  --v8-blue: #59c9ff;
  --v8-pitch: #123d29;
  width: min(100vw, 500px);
  max-width: 500px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: max(6px, env(safe-area-inset-top)) 6px max(16px, env(safe-area-inset-bottom));
  overflow-x: hidden;
  background:
    radial-gradient(circle at 50% -12%, rgba(255, 182, 60, .14), transparent 32%),
    radial-gradient(circle at 8% 36%, rgba(42, 94, 69, .14), transparent 26%),
    linear-gradient(180deg, #0c0d13 0%, var(--v8-bg) 52%, #05060a 100%);
  color: var(--v8-ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.v8-shell * { box-sizing: border-box; }
.v8-shell button { -webkit-tap-highlight-color: transparent; }

/* --- scoreboard: broadcast information, not a dashboard ------------------ */
.v8-scorebar {
  position: relative;
  top: auto;
  z-index: 30;
  grid-template-columns: minmax(68px, 1fr) 116px minmax(68px, 1fr);
  min-height: 62px;
  margin: 0 0 5px;
  padding: 5px 9px;
  overflow: hidden;
  border: 1px solid rgba(255, 205, 104, .2);
  border-radius: 13px;
  background:
    linear-gradient(120deg, rgba(255, 131, 53, .08), transparent 36%, rgba(76, 175, 226, .05)),
    linear-gradient(180deg, #1a1716, #0e1016);
  box-shadow: 0 10px 26px rgba(0,0,0,.36), inset 0 1px rgba(255,255,255,.04);
  backdrop-filter: none;
}
.v8-scorebar::before {
  content: 'KICKOFF CLASH';
  position: absolute;
  left: 50%;
  top: 3px;
  color: rgba(255, 211, 99, .46);
  font-size: 5px;
  font-weight: 1000;
  letter-spacing: .22em;
  transform: translateX(-50%);
}
.v8-scorebar > div { text-align: left; }
.v8-scorebar > div:last-child { text-align: right; }
.v8-scorebar small {
  color: #d7c7ab;
  font-size: 6px;
  font-weight: 950;
  letter-spacing: .14em;
  opacity: .72;
}
.v8-scorebar strong {
  margin-top: 1px;
  font-size: 33px;
  line-height: .88;
  font-weight: 1000;
  letter-spacing: -.07em;
  text-shadow: 0 2px #000;
}
.v8-scorebar section {
  border: 0;
  align-self: center;
  padding-top: 5px;
}
.v8-scorebar section b {
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: .09em;
}
.v8-scorebar section span {
  display: inline-block;
  margin-top: 4px;
  padding: 3px 7px;
  border: 1px solid rgba(255, 210, 94, .36);
  border-radius: 99px;
  background: rgba(244, 166, 44, .1);
  color: var(--v8-gold-2);
  font-size: 7px;
  font-weight: 1000;
  letter-spacing: .08em;
  opacity: 1;
}

/* --- one continuous pitch ------------------------------------------------- */
.v8-pitch {
  position: relative;
  isolation: isolate;
  height: 414px;
  min-height: 414px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 13px 8px 10px;
  overflow: hidden;
  border: 1px solid rgba(217, 255, 225, .19);
  border-radius: 18px;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.019) 0 12.5%, rgba(0,0,0,.035) 12.5% 25%),
    radial-gradient(ellipse at 50% 53%, rgba(98, 211, 132, .13), transparent 48%),
    linear-gradient(180deg, #153f2b 0%, #123a27 48%, #103622 52%, #133c28 100%);
  box-shadow:
    inset 0 0 46px rgba(0,0,0,.28),
    inset 0 1px rgba(255,255,255,.07),
    0 12px 30px rgba(0,0,0,.38);
}
.v8-pitch::before {
  content: '';
  position: absolute;
  z-index: 0;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 92px;
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 50%;
  box-shadow:
    -250px 0 0 -44px transparent,
    250px 0 0 -44px transparent;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.v8-pitch::after {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 50% 0 auto;
  border-top: 1px solid rgba(255,255,255,.14);
  pointer-events: none;
}
.v8-pitch__stadium {
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
}
.v8-pitch__stadium::before,
.v8-pitch__stadium::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 48%;
  height: 13%;
  border: 1px solid rgba(255,255,255,.14);
  transform: translateX(-50%);
}
.v8-pitch__stadium::before { top: -1px; border-top: 0; }
.v8-pitch__stadium::after { bottom: -1px; border-bottom: 0; }
.v8-pitch__stadium > i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(180deg, transparent 5%, rgba(255,255,255,.09) 14% 86%, transparent 95%);
}
.v8-pitch__stadium > i:nth-child(1) { left: 33.333%; }
.v8-pitch__stadium > i:nth-child(2) { left: 66.666%; }
.v8-pitch__stadium > i:nth-child(3) {
  left: 50%;
  top: 50%;
  bottom: auto;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255,255,255,.35);
  transform: translate(-50%,-50%);
}

.v8-zone {
  position: relative;
  z-index: 2;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 23px minmax(0, 1fr);
  gap: 2px;
  padding: 4px 3px;
  border: 0;
  border-right: 1px solid rgba(255,255,255,.035);
  border-radius: 0;
  background: transparent;
  overflow: visible;
  transition: background .16s ease, filter .16s ease, box-shadow .16s ease;
}
.v8-zone:last-child { border-right: 0; }
.v8-zone:hover { border-color: rgba(255,255,255,.035); }
.v8-zone:active { transform: none; }
.v8-zone__heading {
  order: 2;
  position: relative;
  z-index: 5;
  min-height: 23px;
  margin: 0;
  padding: 0 3px;
  border: 0;
  border-radius: 99px;
  background: rgba(4, 14, 9, .42);
  backdrop-filter: blur(3px);
}
.v8-zone__heading strong {
  color: rgba(243, 255, 245, .58);
  font-size: 7px;
  font-weight: 1000;
  letter-spacing: .18em;
}
.v8-zone__heading span {
  max-width: 70%;
  overflow: hidden;
  color: var(--v8-gold-2);
  font-size: 5.5px;
  font-weight: 1000;
  letter-spacing: .03em;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
}
.v8-shell:has(.v8-card.is-selected) .v8-zone__heading span,
.v8-shell.is-dragging .v8-zone__heading span { opacity: 1; }
.v8-shell:has(.v8-card.is-selected) .v8-pitch,
.v8-shell:has(.v8-card.is-selected) .v8-zone,
.v8-shell:has(.v8-card.is-selected) .v8-zone__heading {
  border-color: inherit;
  background-color: inherit;
  box-shadow: inherit;
}

.v8-zone__side {
  order: 3;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  place-items: center;
  gap: 4px;
  padding: 5px 2px;
}
.v8-zone__side--away { order: 1; opacity: .88; }
.v8-zone__side i {
  display: block;
  width: 32px;
  height: 38px;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(255,255,255,.055);
  border-radius: 9px;
  background: rgba(0,0,0,.035);
  box-shadow: none;
}
.v8-zone__side--away i { border-color: rgba(255, 142, 105, .055); }

.v8-zone.is-drag-disabled { filter: saturate(.25) brightness(.62); }
.v8-zone.is-drag-target {
  background: linear-gradient(180deg, rgba(255, 214, 106, .025), rgba(255, 214, 106, .075));
  box-shadow: inset 0 0 0 1px rgba(255, 214, 106, .16);
}
.v8-zone.is-drag-over {
  background: linear-gradient(180deg, rgba(255, 217, 112, .13), rgba(255, 181, 48, .18));
  box-shadow: inset 0 0 0 2px rgba(255, 222, 126, .68), inset 0 0 38px rgba(255, 183, 50, .15);
}
.v8-zone.is-drag-over .v8-zone__heading {
  background: rgba(37, 26, 9, .82);
}

/* --- deployed pieces ------------------------------------------------------ */
.v8-chip {
  position: relative;
  width: min(100%, 49px);
  min-width: 0;
  height: 70px;
  min-height: 0;
  display: grid;
  grid-template-rows: 40px auto auto;
  align-content: start;
  justify-items: stretch;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 210, 112, .36);
  border-radius: 8px;
  background: linear-gradient(180deg, #25201b, #111319 72%);
  box-shadow: 0 5px 9px rgba(0,0,0,.43), inset 0 0 0 1px rgba(0,0,0,.42);
  color: var(--v8-ink);
  font-size: 6px;
  line-height: 1;
  text-align: center;
}
.v8-chip--away {
  border-color: rgba(95, 193, 238, .35);
  background: linear-gradient(180deg, #15232b, #11151a 72%);
}
.v8-chip__portrait {
  position: relative;
  width: 100%;
  height: 40px;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(255,111,66,.52), rgba(45,112,202,.38)), #3a2b20;
}
.v8-chip__portrait i {
  position: absolute;
  left: 50%;
  top: 50%;
  color: rgba(255,255,255,.42);
  font-style: normal;
  font-size: 12px;
  font-weight: 1000;
  transform: translate(-50%,-50%);
}
.v8-chip__portrait img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 18%;
}
.v8-chip__name {
  display: block;
  overflow: hidden;
  padding: 2px 2px 0;
  color: #fff8ea;
  font-size: 6.5px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v8-chip b {
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: 2px;
  margin: 0;
  color: #e5d7bd;
  font-size: 7px;
  font-weight: 1000;
  font-variant-numeric: tabular-nums;
}
.v8-chip small { display: none; }
.v8-chip--transient {
  border-style: solid;
  border-color: rgba(255, 214, 104, .56);
  background:
    repeating-linear-gradient(135deg, rgba(255,202,73,.09) 0 5px, transparent 5px 10px),
    linear-gradient(180deg, rgba(48, 35, 18, .96), rgba(17, 18, 22, .96));
  color: #fff4d4;
}
.v8-chip--transient::before {
  content: 'LOCKED';
  display: block;
  padding: 7px 2px 3px;
  color: var(--v8-gold-2);
  font-size: 5px;
  font-weight: 1000;
  letter-spacing: .1em;
}
.v8-chip--transient > span.v8-card__sr { display: none; }
.v8-chip--transient b { position: static; display: block; margin-top: 4px; padding: 0 2px; font-size: 5px; }
.v8-chip.is-suppressed { filter: grayscale(.65) brightness(.65); opacity: .65; }

/* --- decision strip: controls, not narration ----------------------------- */
.v8-commit {
  position: relative;
  z-index: 18;
  min-height: 48px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 55px 116px;
  gap: 5px;
  align-items: center;
  margin: 4px 3px 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.v8-commit > div {
  min-width: 0;
  padding-left: 3px;
}
.v8-commit strong {
  overflow: hidden;
  color: #c9c4b8;
  font-size: 7px;
  font-weight: 950;
  letter-spacing: .04em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.v8-commit > div > span { display: none; }
.v8-commit button {
  min-height: 38px;
  padding: 0 8px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  background: #11141b;
  color: #c8cbd3;
  font-size: 7px;
  font-weight: 1000;
  letter-spacing: .05em;
}
.v8-commit .v8-primary {
  border-color: rgba(255, 210, 104, .62);
  background: linear-gradient(180deg, #ffcb59, #ee9726);
  color: #241304;
  box-shadow: 0 5px 16px rgba(238, 151, 38, .19), inset 0 1px rgba(255,255,255,.42);
  font-size: 8px;
}
.v8-commit button:disabled { filter: grayscale(1); opacity: .35; }

/* Tactical window is the exception: it is a real decision state. */
.v8-window {
  grid-template-columns: minmax(0, 1fr) 108px;
  min-height: 62px;
  margin-top: 4px;
  padding: 5px;
  border: 1px solid rgba(95, 196, 255, .22);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(30, 58, 78, .86), rgba(14, 17, 24, .96));
  box-shadow: 0 9px 22px rgba(0,0,0,.28);
}
.v8-window > div { padding-left: 2px; }
.v8-window strong { color: #8bdcff; font-size: 8px; }
.v8-window > div > span { display: none; }
.v8-window__choices {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  margin-top: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.v8-window__choices::-webkit-scrollbar { display: none; }
.v8-window__choices button {
  flex: 0 0 auto;
  min-height: 27px;
  padding: 4px 6px;
  border-color: rgba(105, 203, 255, .24);
  background: rgba(84, 187, 239, .08);
  color: #daf3ff;
  font-size: 6px;
}
.v8-window__remove { display: none; }

/* --- hand: overlapping collectible cards --------------------------------- */
.v8-hand-wrap {
  position: relative;
  z-index: 12;
  height: 205px;
  min-height: 205px;
  margin: 0;
  padding: 0;
}
.v8-hand-heading {
  position: absolute;
  z-index: 4;
  left: 7px;
  right: 7px;
  top: 0;
  height: 19px;
  margin: 0;
  align-items: center;
  pointer-events: none;
}
.v8-hand-heading strong {
  color: rgba(255, 211, 107, .62);
  font-size: 6px;
  font-weight: 1000;
  letter-spacing: .15em;
}
.v8-hand-heading span {
  color: rgba(255,255,255,.29);
  font-size: 5px;
  font-weight: 850;
}
.v8-hand {
  height: 205px;
  min-height: 205px;
  display: flex;
  align-items: flex-end;
  gap: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 25px 22px 8px 28px;
  scroll-padding-inline: 28px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.v8-hand::-webkit-scrollbar { display: none; }

.v8-card {
  position: relative;
  flex: 0 0 108px;
  width: 108px;
  height: 166px;
  min-width: 108px;
  margin-left: -20px;
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(255, 209, 108, .58);
  border-radius: 10px;
  background: linear-gradient(180deg, #34281c 0 58%, #111319 58% 100%);
  color: var(--v8-ink);
  box-shadow: 0 8px 17px rgba(0,0,0,.62), inset 0 0 0 1px rgba(0,0,0,.5);
  text-align: left;
  transform-origin: 50% 92%;
  transition: transform .14s ease, filter .14s ease, opacity .14s ease, border-color .14s ease, box-shadow .14s ease;
  scroll-snap-align: center;
  touch-action: pan-x;
}
.v8-card:first-child { margin-left: 0; }
.v8-card:nth-child(2n) { transform: rotate(.7deg); }
.v8-card:nth-child(3n) { transform: rotate(-.65deg); }
.v8-card:active { transform: translateY(-5px) scale(.99); }
.v8-card.is-selected {
  z-index: 20;
  border-color: var(--v8-gold-2);
  transform: translateY(-17px) scale(1.055) rotate(0);
  box-shadow: 0 0 0 2px rgba(255, 211, 99, .2), 0 0 24px rgba(255, 176, 42, .24), 0 15px 28px rgba(0,0,0,.67);
}
.v8-card.is-unaffordable {
  filter: grayscale(.72) brightness(.61) saturate(.45);
  opacity: .7;
}
.v8-card__art {
  position: absolute;
  inset: 0 0 59px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 22%, rgba(255, 207, 110, .15), transparent 42%),
    linear-gradient(145deg, #714526, #27425b 76%);
}
.v8-card__art::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 46%;
  background: linear-gradient(180deg, transparent, rgba(11, 12, 17, .93));
}
.v8-card__art > i {
  position: absolute;
  left: 50%;
  top: 46%;
  color: rgba(255,255,255,.16);
  font-size: 28px;
  font-style: normal;
  font-weight: 1000;
  letter-spacing: -.08em;
  transform: translate(-50%,-50%);
}
.v8-card__art img {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 16%;
}
.v8-card__cost,
.v8-card__position,
.v8-card__att,
.v8-card__def { z-index: 5; }
.v8-card__cost {
  left: 4px;
  top: 4px;
  width: 25px;
  min-width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #ffe8a6;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 27%, #ffe69b, #efa528 61%, #9d570b);
  color: #1b0e02;
  font-size: 12px;
  font-weight: 1000;
  box-shadow: 0 3px 7px rgba(0,0,0,.55);
}
.v8-card__position {
  right: 4px;
  top: 5px;
  max-width: 56px;
  padding: 3px 5px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 5px;
  background: rgba(7,8,12,.86);
  color: var(--v8-gold-2);
  font-size: 6px;
  font-weight: 1000;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v8-card > strong {
  position: absolute;
  z-index: 5;
  left: 6px;
  right: 6px;
  bottom: 43px;
  overflow: hidden;
  color: #fff9ee;
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: -.025em;
  text-overflow: ellipsis;
  text-shadow: 0 1px 3px #000;
  white-space: nowrap;
}
.v8-card > small {
  position: absolute;
  z-index: 5;
  left: 6px;
  right: 6px;
  bottom: 26px;
  overflow: hidden;
  color: var(--v8-gold-2);
  font-size: 6px;
  font-weight: 950;
  letter-spacing: .045em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.v8-card__att,
.v8-card__def {
  position: absolute;
  bottom: 4px;
  font-size: 15px;
  line-height: .9;
  font-weight: 1000;
  letter-spacing: -.06em;
}
.v8-card__att { left: 6px; color: var(--v8-orange); }
.v8-card__def { right: 6px; color: var(--v8-blue); text-align: right; }
.v8-card__att i,
.v8-card__def i {
  margin-left: 2px;
  color: rgba(255,255,255,.43);
  font-size: 5px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: .02em;
}
.v8-card__sr { position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; clip: rect(0 0 0 0) !important; white-space: nowrap !important; }

/* Tacticals: electric-blue play cards, visually separate from footballers. */
.v8-card--chance {
  border-color: rgba(104, 207, 255, .56);
  background: linear-gradient(180deg, #163549 0 58%, #0e151d 58% 100%);
}
.v8-card__art--tactical {
  background:
    repeating-linear-gradient(135deg, rgba(96, 213, 255, .08) 0 8px, transparent 8px 16px),
    radial-gradient(circle at 50% 45%, rgba(100, 220, 255, .32), transparent 42%),
    linear-gradient(145deg, #174963, #17243d);
}
.v8-card__art--tactical::before {
  content: '◆';
  position: absolute;
  left: 50%;
  top: 47%;
  color: #9fe7ff;
  font-size: 48px;
  line-height: 1;
  opacity: .52;
  transform: translate(-50%,-50%) rotate(45deg);
  text-shadow: 0 0 22px rgba(85, 210, 255, .45);
}
.v8-card__art--tactical > i { z-index: 2; color: #e0f8ff; font-size: 30px; }
.v8-card__art--tactical > em {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 8px;
  color: rgba(219, 246, 255, .62);
  font-size: 5px;
  font-style: normal;
  font-weight: 1000;
  letter-spacing: .17em;
  transform: translateX(-50%);
}
.v8-card--chance > strong { bottom: 39px; }
.v8-card--chance > small {
  bottom: 7px;
  max-height: 27px;
  color: #b9edff;
  font-size: 5.8px;
  line-height: 1.35;
  white-space: normal;
}

/* Manager: warm, portrait-led and unmistakably not a player slot card. */
.v8-card--manager {
  border-color: rgba(220, 155, 255, .62);
  background: linear-gradient(180deg, #3e2849 0 58%, #151019 58% 100%);
}
.v8-card__art--manager {
  background: radial-gradient(circle at 50% 25%, rgba(238, 177, 255, .22), transparent 42%), linear-gradient(145deg, #543361, #211c33);
}
.v8-card--manager > strong { bottom: 39px; }
.v8-card--manager > small {
  bottom: 7px;
  max-height: 27px;
  color: #e7c8f2;
  font-size: 5.5px;
  line-height: 1.32;
  white-space: normal;
}

/* --- actual lifted card during pointer/touch drag ------------------------- */
.v8-drag-ghost {
  width: 118px;
  height: 178px;
  margin: 0;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--v8-gold-2);
  border-radius: 11px;
  background: linear-gradient(180deg, #34281c 0 58%, #111319 58% 100%);
  color: var(--v8-ink);
  box-shadow: 0 19px 42px rgba(0,0,0,.67), 0 0 31px rgba(255, 188, 60, .28);
  transform: translate(-50%, -72%) rotate(-2deg) scale(1.04);
}
.v8-drag-ghost.v8-card--chance { border-color: #8edfff; background: linear-gradient(180deg, #163549 0 58%, #0e151d 58% 100%); }
.v8-drag-ghost.v8-card--manager { border-color: #daa0f4; background: linear-gradient(180deg, #3e2849 0 58%, #151019 58% 100%); }
.v8-drag-ghost .v8-card__art { inset: 0 0 62px; }
.v8-drag-ghost > strong { position:absolute; z-index:5; left:6px; right:6px; bottom:45px; overflow:hidden; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.v8-drag-ghost > small { position:absolute; z-index:5; left:6px; right:6px; bottom:27px; overflow:hidden; color:var(--v8-gold-2); font-size:6px; text-overflow:ellipsis; white-space:nowrap; }
.v8-shell.is-dragging .v8-hand { filter: brightness(.72); }

/* --- everything below here is testing/support, deliberately below fold ---- */
.v8-recap { margin-top: 8px; }
.v8-condition {
  margin-top: 54px;
  padding: 11px 4px 0;
  border-top: 1px solid rgba(255,255,255,.07);
}
.v8-condition::before { content: 'CALIBRATION / DEBUG'; color: #777f8d; opacity: .65; }
.v8-condition button,
.v8-lab-controls button,
.v8-result button { background: #10131a; }
.v8-lab-controls--squads,
.v8-totals,
.v8-telemetry,
.v8-log { opacity: .82; }
.v8-totals { margin-top: 5px; }

/* Full-time is a payoff, not another panel at the bottom. */
.v8-result {
  position: fixed;
  z-index: 80;
  left: 50%;
  top: 50%;
  width: min(calc(100vw - 28px), 360px);
  margin: 0;
  padding: 24px 20px;
  border: 1px solid rgba(255, 211, 99, .52);
  border-radius: 18px;
  background: radial-gradient(circle at 50% 18%, rgba(255, 184, 57, .17), transparent 38%), rgba(9,10,14,.96);
  box-shadow: 0 28px 70px rgba(0,0,0,.78), 0 0 60px rgba(255, 184, 57, .09);
  text-align: center;
  transform: translate(-50%,-50%);
  backdrop-filter: blur(12px);
}
.v8-result small { color: var(--v8-gold); font-size: 7px; font-weight: 1000; letter-spacing: .16em; }
.v8-result strong { display:block; margin:7px 0 2px; font-size:64px; line-height:.9; letter-spacing:-.09em; }
.v8-result b { display:block; color:var(--v8-gold-2); font-size:15px; letter-spacing:.08em; }
.v8-result button { margin-top:14px; min-width:130px; border-color:rgba(255,211,99,.42); background:linear-gradient(180deg,#ffcb59,#ee9726); color:#251303; font-weight:1000; }

@media (max-width: 420px) {
  .v8-shell { padding-inline: 5px; }
  .v8-scorebar { grid-template-columns: minmax(62px, 1fr) 108px minmax(62px, 1fr); }
  .v8-pitch { height: 404px; min-height: 404px; padding-inline: 5px; }
  .v8-chip { width: 46px; height: 67px; grid-template-rows: 38px auto auto; }
  .v8-chip__portrait { height: 38px; }
  .v8-card { flex-basis: 105px; width:105px; min-width:105px; height:162px; margin-left:-19px; }
  .v8-hand-wrap, .v8-hand { height: 199px; min-height: 199px; }
  .v8-hand { padding-top:24px; }
  .v8-commit { grid-template-columns:minmax(0,1fr) 50px 111px; }
}

@media (max-height: 760px) {
  .v8-scorebar { min-height: 56px; }
  .v8-pitch { height: 348px; min-height:348px; }
  .v8-hand-wrap, .v8-hand { height:184px; min-height:184px; }
  .v8-card { height:149px; }
  .v8-card__art { inset-bottom:55px; }
  .v8-commit { min-height:43px; }
}
'''

component_path.write_text(component)
css_path.write_text(css)
test_path.write_text(tests)
