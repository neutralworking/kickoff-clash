from pathlib import Path
import re

component = Path('src/components/match-v8/V8CalibrationLab.tsx')
text = component.read_text()

pattern = re.compile(
    r"function PlayerHandCard\(\{ card, selected, onClick \}: \{ card: V8CalibrationPlayerCard; selected: boolean; onClick: \(\) => void \}\) \{\n"
    r"  return \(\n"
    r"    <button className=\{`v8-card\$\{selected \? ' is-selected' : ''\}`\} onClick=\{onClick\}>"
)
replacement = (
    "function PlayerHandCard({ card, selected, affordable, onClick }: { card: V8CalibrationPlayerCard; selected: boolean; affordable: boolean; onClick: () => void }) {\n"
    "  return (\n"
    "    <button className={`v8-card${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`} onClick={onClick}>"
)
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, 'PlayerHandCard signature not found'

old = """  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedTactical = selection?.kind === 'tactical' ? homeTacticals.find((card) => card.id === selection.cardId) ?? null : null;
"""
new = """  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerAffordable = selectedPlayerCost !== null && selectedPlayerCost <= state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? homeTacticals.find((card) => card.id === selection.cardId) ?? null : null;
"""
assert old in text, 'selectedPlayer block not found'
text = text.replace(old, new, 1)

hand_marker = """      <section className="v8-hand-wrap">
        <div className="v8-hand-heading"><strong>HAND</strong><span>{state.teams.home.drawPile.length} XI cards unseen</span></div>
        <div className="v8-hand">
"""
detail = """      <section className="v8-hand-wrap">
        <div className="v8-hand-heading"><strong>HAND</strong><span>{state.teams.home.drawPile.length} XI cards unseen</span></div>
        {selectedPlayer && selectedPlayerCost !== null && (
          <div className="v8-card-detail" data-testid="selected-player-detail">
            <div className="v8-card-detail__identity">
              <small>{selectedPlayer.realName}</small>
              <strong>{selectedPlayer.fullCardName}</strong>
              <span>{selectedPlayer.position} · {selectedPlayerCost} ENERGY · {selectedPlayer.printedAttack} ATT · {selectedPlayer.printedDefence} DEF</span>
            </div>
            <div className="v8-card-detail__action">
              <b>{selectedPlayer.actionName}</b>
              <span>{selectedPlayer.actionText}</span>
            </div>
            <div className="v8-card-detail__zones" aria-label={`Play ${selectedPlayer.realName}`}>
              {ZONES.map((zone) => {
                const penalty = outOfPositionPenalty(selectedPlayer, zone);
                const full = occupiedPlayerSlots(state, 'home', zone, pending) >= 4;
                return (
                  <button
                    type="button"
                    key={zone}
                    data-testid={`play-selected-${zone.toLowerCase()}`}
                    disabled={!selectedPlayerAffordable || full || finished || Boolean(windowPhase)}
                    onClick={() => queueToZone(zone)}
                  >
                    <b>PLAY {zone}</b>
                    <span>{full ? 'FULL' : penalty === 0 ? 'NATURAL' : `−${penalty} OOP`}</span>
                  </button>
                );
              })}
            </div>
            {!selectedPlayerAffordable && (
              <small className="v8-card-detail__warning">{selectedPlayerCost} ENERGY required · {state.teams.home.energy} available</small>
            )}
          </div>
        )}
        <div className="v8-hand">
"""
assert hand_marker in text, 'hand marker not found'
text = text.replace(hand_marker, detail, 1)

old_call = """            <PlayerHandCard key={card.id} card={card} selected={selection?.kind === 'player' && selection.cardId === card.id} onClick={() => setSelection({ kind: 'player', cardId: card.id })} />
"""
new_call = """            <PlayerHandCard
              key={card.id}
              card={card}
              selected={selection?.kind === 'player' && selection.cardId === card.id}
              affordable={calibrationPlayCost(card) <= state.teams.home.energy}
              onClick={() => setSelection({ kind: 'player', cardId: card.id })}
            />
"""
assert old_call in text, 'PlayerHandCard usage not found'
text = text.replace(old_call, new_call, 1)
component.write_text(text)

css = Path('src/components/match-v8/v8lab.css')
styles = css.read_text()
marker = ".v8-hand::-webkit-scrollbar { display: none; }\n\n"
detail_css = """.v8-hand::-webkit-scrollbar { display: none; }

.v8-card-detail {
  display: grid;
  gap: 8px;
  margin: 4px 2px 7px;
  padding: 10px;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 13px;
  background: linear-gradient(155deg, rgba(44,91,62,.98), rgba(12,31,20,.98));
  box-shadow: 0 9px 26px rgba(0,0,0,.28);
}
.v8-card-detail__identity small,
.v8-card-detail__identity strong,
.v8-card-detail__identity span,
.v8-card-detail__action b,
.v8-card-detail__action span { display: block; }
.v8-card-detail__identity small { font-size: 8px; opacity: .55; }
.v8-card-detail__identity strong { margin-top: 1px; font-size: 15px; line-height: 1.05; }
.v8-card-detail__identity span { margin-top: 3px; font-size: 8px; font-weight: 800; opacity: .7; }
.v8-card-detail__action { padding-top: 7px; border-top: 1px solid rgba(255,255,255,.11); }
.v8-card-detail__action b { font-size: 10px; letter-spacing: .055em; }
.v8-card-detail__action span { margin-top: 3px; font-size: 10px; line-height: 1.3; opacity: .86; }
.v8-card-detail__zones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.v8-card-detail__zones button {
  min-width: 0;
  padding: 8px 4px;
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 9px;
  background: rgba(255,255,255,.08);
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.v8-card-detail__zones button b,
.v8-card-detail__zones button span { display: block; }
.v8-card-detail__zones button b { font-size: 9px; }
.v8-card-detail__zones button span { margin-top: 2px; font-size: 7px; opacity: .66; }
.v8-card-detail__zones button:disabled { opacity: .3; cursor: default; }
.v8-card-detail__warning {
  display: block;
  padding: 6px 7px;
  border-radius: 8px;
  background: rgba(255,184,84,.12);
  font-size: 8px;
  font-weight: 800;
  line-height: 1.2;
}

"""
assert marker in styles, 'hand scrollbar marker not found'
styles = styles.replace(marker, detail_css, 1)
marker = ".v8-card.is-pending { opacity: .3; }\n"
assert marker in styles, 'pending card marker not found'
styles = styles.replace(marker, marker + ".v8-card.is-unaffordable:not(.is-selected) { opacity: .42; filter: saturate(.55); }\n", 1)
css.write_text(styles)

tests = Path('tests/v8-match-lab.spec.ts')
spec = tests.read_text()
start = spec.index("  test('expands a selected player and queues them by tapping the pitch'")
end = spec.index("\n\n  test('uses calibrated player costs", start)
replacement_test = """  test('places a default-hand player through explicit zone controls', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.locator('.v8-card').filter({ hasText: 'Billy Bremner' });
    await expect(bremner).toHaveCount(1);
    await expect(bremner.locator('.v8-card__cost')).toHaveText('1');
    await bremner.click();

    const detail = page.getByTestId('selected-player-detail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('CRUNCHING TACKLE');
    await expect(detail).toContainText('On Reveal');

    const playMid = page.getByTestId('play-selected-mid');
    await expect(playMid).toBeEnabled();
    await expect(playMid).toContainText('NATURAL');
    await playMid.click();

    const midfieldZone = page.locator('.v8-zone').nth(1);
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ENERGY', { exact: true })).toBeVisible();
    await expect(midfieldZone.locator('.v8-chip--transient')).toContainText('Billy Bremner');
    await expect(bremner).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('explains unaffordable players instead of silently rejecting placement', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const iniesta = page.locator('.v8-card').filter({ hasText: 'Andrés Iniesta' });
    await expect(iniesta.locator('.v8-card__cost')).toHaveText('4');
    await iniesta.click();

    const detail = page.getByTestId('selected-player-detail');
    await expect(detail).toContainText('4 ENERGY required · 2 available');
    await expect(page.getByTestId('play-selected-mid')).toBeDisabled();
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expectMobileFit(page);
  });"""
spec = spec[:start] + replacement_test + spec[end:]
tests.write_text(spec)
