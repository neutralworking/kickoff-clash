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

component = replace_once(component, """type PlayerDragState = {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overZone: V8Zone | null;
  moved: boolean;
};""", """type HandDragState = {
  kind: 'player' | 'tactical' | 'manager';
  cardId: string;
  label: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overZone: V8Zone | null;
  moved: boolean;
};""", 'drag state type')

old_tactical = """function TacticalHandCard({ card, cost, selected, onClick }: { card: V8TacticalCardInstance; cost: number; selected: boolean; onClick: () => void }) {
  return (
    <button className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}`} onClick={onClick}>
      <span className=\"v8-card__cost\">{cost}</span>
      <span className=\"v8-card__position\">TACTICAL</span>
      <strong>{card.name}</strong>
      <small>{tacticalDefinition(card.type).text}<br />{tacticalLabel(card)}</small>
    </button>
  );
}"""
new_tactical = """function TacticalHandCard({
  card,
  cost,
  selected,
  affordable,
  onClick,
  onPointerDown,
}: {
  card: V8TacticalCardInstance;
  cost: number;
  selected: boolean;
  affordable: boolean;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type=\"button\"
      data-testid={`tactical-card-${card.id}`}
      className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`}
      aria-pressed={selected}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className=\"v8-card__cost\">{cost}</span>
      <span className=\"v8-card__position\">TACTICAL</span>
      <strong>{card.name}</strong>
      <small>{tacticalDefinition(card.type).text}<br />{tacticalLabel(card)}</small>
    </button>
  );
}"""
component = replace_once(component, old_tactical, new_tactical, 'tactical hand card')

component = replace_once(component, """  const [playerDrag, setPlayerDrag] = useState<PlayerDragState | null>(null);
  const playerDragRef = useRef<PlayerDragState | null>(null);
  const suppressPlayerClick = useRef<string | null>(null);""", """  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);
  const handDragRef = useRef<HandDragState | null>(null);
  const suppressHandClick = useRef<string | null>(null);""", 'drag state hooks')

start = component.index('  const queueToZone = (zone: V8Zone) => {')
end = component.index('  const undo = () => {', start)
new_drag_logic = r'''  const queueManagerToZone = (zone: V8Zone): boolean => {
    if (finished || windowPhase || !homeManagerAvailable || state.teams.home.energy < MANAGER_COST) return false;
    if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
    rememberUndo();
    setState({
      ...state,
      teams: { ...state.teams, home: { ...state.teams.home, energy: state.teams.home.energy - MANAGER_COST } },
    });
    setPending((plays) => [...plays, { kind: 'manager', side: 'home', zone, cost: MANAGER_COST }]);
    setHomeManagerAvailable(false);
    setSelection(null);
    return true;
  };

  const queueTacticalToZone = (cardId: string, zone: V8Zone): boolean => {
    if (finished) return false;

    if (windowPhase) {
      if (windowPhase.queued.some((play) => play.cardId === cardId)) return false;
      const tactical = windowEligibleCalibrationTacticals(windowPhase.resolved, 'home').find((card) => card.id === cardId);
      if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
      const remainingEnergy = windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0);
      const cost = previewCalibrationTacticalCost(windowPhase.resolved, 'home', tactical, zone);
      if (cost > remainingEnergy) return false;
      setWindowPhase((phase) => (phase ? {
        ...phase,
        queued: [...phase.queued, { cardId: tactical.id, name: tactical.name, zone, cost }],
      } : phase));
      setSelection(null);
      return true;
    }

    const tactical = homeTacticals.find((card) => card.id === cardId);
    if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
    const cost = previewCalibrationTacticalCost(state, 'home', tactical, zone);
    if (cost > state.teams.home.energy) return false;
    rememberUndo();
    try {
      const spent = spendCalibrationTacticalFromHand(state, 'home', tactical.id, zone);
      setState(spent.state);
      setPending((plays) => [...plays, { kind: 'tactical', side: 'home', card: spent.card, zone, cost: spent.cost }]);
      setSelection(null);
      return true;
    } catch {
      return false;
    }
  };

  const queueToZone = (zone: V8Zone) => {
    if (!selection || finished) return;

    if (selection.kind === 'move') {
      if (windowPhase) return;
      const player = state.players[selection.runtimeId];
      if (!player) return;
      try {
        setState(moveCalibrationPlayer(state, 'home', player.cardId, zone));
      } catch {
        return;
      }
      setSelection(null);
      return;
    }

    if (selection.kind === 'manager') {
      queueManagerToZone(zone);
      return;
    }

    if (selection.kind === 'player') {
      queuePlayerToZone(selection.cardId, zone);
      return;
    }

    queueTacticalToZone(selection.cardId, zone);
  };

  const setDrag = (next: HandDragState | null) => {
    handDragRef.current = next;
    setHandDrag(next);
  };

  const zoneAtPoint = (x: number, y: number): V8Zone | null => {
    const element = document.elementFromPoint(x, y);
    const zoneElement = element?.closest<HTMLElement>('[data-v8-zone]');
    const zone = zoneElement?.dataset.v8Zone as V8Zone | undefined;
    return zone && ZONES.includes(zone) ? zone : null;
  };

  const isHandDragZoneLegal = (drag: Pick<HandDragState, 'kind' | 'cardId'>, zone: V8Zone): boolean => {
    if (drag.kind === 'player') {
      if (windowPhase || occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
      return calibrationPlayCost(getV8CalibrationPlayer(drag.cardId)) <= state.teams.home.energy;
    }

    if (drag.kind === 'manager') {
      return !windowPhase
        && homeManagerAvailable
        && state.teams.home.energy >= MANAGER_COST
        && occupiedPlayerSlots(state, 'home', zone, pending) < 4;
    }

    const sourceState = windowPhase?.resolved ?? state;
    const tactical = calibrationHandTacticals(sourceState, 'home').find((card) => card.id === drag.cardId);
    if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
    if (windowPhase?.queued.some((play) => play.cardId === drag.cardId)) return false;
    const remainingEnergy = windowPhase
      ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
      : state.teams.home.energy;
    return previewCalibrationTacticalCost(sourceState, 'home', tactical, zone) <= remainingEnergy;
  };

  const startHandDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    drag: Pick<HandDragState, 'kind' | 'cardId' | 'label'>,
  ) => {
    setSelection(drag.kind === 'manager' ? { kind: 'manager' } : { kind: drag.kind, cardId: drag.cardId });
    if (finished || !ZONES.some((zone) => isHandDragZoneLegal(drag, zone))) return;

    const pointerId = event.pointerId;
    setDrag({
      ...drag,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      overZone: null,
      moved: false,
    });

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleFinish);
      window.removeEventListener('pointercancel', handleCancel);
    };

    const handleMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const current = handDragRef.current;
      if (!current) return;
      const dx = pointerEvent.clientX - current.startX;
      const dy = pointerEvent.clientY - current.startY;
      const startsVerticalDrag = Math.abs(dy) > 7 && Math.abs(dy) >= Math.abs(dx) * .72;
      const moved = current.moved || startsVerticalDrag;
      if (moved) pointerEvent.preventDefault();
      setDrag({
        ...current,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        overZone: moved ? zoneAtPoint(pointerEvent.clientX, pointerEvent.clientY) : null,
        moved,
      });
    };

    const handleFinish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const current = handDragRef.current;
      cleanup();
      if (!current) return;
      const zone = current.moved ? zoneAtPoint(pointerEvent.clientX, pointerEvent.clientY) ?? current.overZone : null;
      setDrag(null);
      if (!current.moved) return;
      suppressHandClick.current = `${current.kind}:${current.cardId}`;
      if (!zone || !isHandDragZoneLegal(current, zone)) return;
      if (current.kind === 'player') queuePlayerToZone(current.cardId, zone);
      else if (current.kind === 'tactical') queueTacticalToZone(current.cardId, zone);
      else queueManagerToZone(zone);
    };

    const handleCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleFinish);
    window.addEventListener('pointercancel', handleCancel);
  };

  const consumeSuppressedClick = (kind: HandDragState['kind'], cardId: string): boolean => {
    const key = `${kind}:${cardId}`;
    if (suppressHandClick.current !== key) return false;
    suppressHandClick.current = null;
    return true;
  };

'''
component = component[:start] + new_drag_logic + component[end:]

old_selection_start = component.index('  const selectedPlayer = selection?.kind')
old_selection_end = component.index('\n\n  return (', old_selection_start)
new_selection = r'''  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerUnaffordable = selectedPlayerCost !== null && selectedPlayerCost > state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? calibrationHandTacticals(windowPhase?.resolved ?? state, 'home').find((card) => card.id === selection.cardId) ?? null : null;
  const draggedPlayer = handDrag?.kind === 'player' ? getV8CalibrationPlayer(handDrag.cardId) : null;
  const draggedTactical = handDrag?.kind === 'tactical' ? calibrationHandTacticals(windowPhase?.resolved ?? state, 'home').find((card) => card.id === handDrag.cardId) ?? null : null;
  const interactionLabel = handDrag?.moved
    ? handDrag.overZone
      ? isHandDragZoneLegal(handDrag, handDrag.overZone)
        ? `DROP ${handDrag.label} IN ${handDrag.overZone}`
        : `${handDrag.overZone} IS NOT AVAILABLE`
      : 'DRAG OVER A HIGHLIGHTED ZONE'
    : pending.length
      ? `${pending.length} committed`
      : selection?.kind === 'move'
        ? 'CHOOSE DESTINATION ZONE'
        : selectedPlayerUnaffordable
          ? `${selectedPlayerCost} ENERGY REQUIRED · ${state.teams.home.energy} AVAILABLE`
          : selection?.kind === 'manager'
            ? state.teams.home.energy < MANAGER_COST
              ? `${MANAGER_COST} ENERGY REQUIRED · ${state.teams.home.energy} AVAILABLE`
              : 'DRAG MANAGER SKILL TO A ZONE'
            : selectedTactical
              ? `DRAG ${selectedTactical.name.toUpperCase()} TO A HIGHLIGHTED ZONE`
              : selectedPlayer
                ? `DRAG ${selectedPlayer.matchName} TO A ZONE`
                : windowPhase
                  ? 'DRAG A TACTICAL TO THE PITCH'
                  : 'DRAG A CARD TO THE PITCH';'''
component = component[:old_selection_start] + new_selection + component[old_selection_end:]

component = component.replace('<main className={`v8-shell${playerDrag ? \' is-dragging\' : \'\'}`}>', '<main className={`v8-shell${handDrag ? \' is-dragging\' : \'\'}`}>')

component = replace_once(component, """          if (selectedTactical) guide = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone) ? `TACTICAL · ${tacticalLabel(selectedTactical, zone)}` : 'NO';
          if (selection?.kind === 'move') guide = 'MOVE';""", """          if (selectedTactical) {
            const sourceState = windowPhase?.resolved ?? state;
            const remainingEnergy = windowPhase
              ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
              : state.teams.home.energy;
            const eligible = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone);
            const tacticalCost = eligible ? previewCalibrationTacticalCost(sourceState, 'home', selectedTactical, zone) : Number.POSITIVE_INFINITY;
            guide = !eligible ? 'NO' : tacticalCost > remainingEnergy ? 'NO ENERGY' : `TACTICAL · ${tacticalLabel(selectedTactical, zone)}`;
          }
          if (selection?.kind === 'manager') guide = playerOccupancy >= 4 ? 'FULL' : state.teams.home.energy < MANAGER_COST ? 'NO ENERGY' : 'MANAGER';
          if (selection?.kind === 'move') guide = 'MOVE';""", 'zone guide')

component = replace_once(component, """              className={`v8-zone${playerDrag ? ' is-drag-target' : ''}${playerDrag?.overZone === zone ? ' is-drag-over' : ''}`}""", """              className={`v8-zone${handDrag ? isHandDragZoneLegal(handDrag, zone) ? ' is-drag-target' : ' is-drag-disabled' : ''}${handDrag?.overZone === zone && isHandDragZoneLegal(handDrag, zone) ? ' is-drag-over' : ''}`}""", 'zone drag classes')

hand_start = component.index('      <section className="v8-hand-wrap">')
hand_end_marker = """      {state.events.length > 0 && ("""
hand_end = component.index(hand_end_marker, hand_start)
new_hand = r'''      <section className="v8-hand-wrap">
        <div className="v8-hand-heading"><strong>HAND</strong><span>{windowPhase ? 'DRAG TACTICAL TO PITCH' : 'DRAG CARD TO PITCH'} · {state.teams.home.drawPile.length} UNSEEN</span></div>
        <div className="v8-hand">
          {homePlayers.map((card) => (
            <PlayerHandCard
              key={card.id}
              card={card}
              selected={selection?.kind === 'player' && selection.cardId === card.id}
              affordable={!windowPhase && calibrationPlayCost(card) <= state.teams.home.energy}
              onClick={() => {
                if (consumeSuppressedClick('player', card.id)) return;
                setSelection({ kind: 'player', cardId: card.id });
              }}
              onPointerDown={(event) => startHandDrag(event, { kind: 'player', cardId: card.id, label: card.matchName })}
            />
          ))}
          {homeTacticals.map((card) => {
            const sourceState = windowPhase?.resolved ?? state;
            const eligible = tacticalDefinition(card.type).eligibleZones;
            const costs = eligible.map((zone) => previewCalibrationTacticalCost(sourceState, 'home', card, zone));
            const minimumCost = Math.min(...costs);
            const remainingEnergy = windowPhase
              ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
              : state.teams.home.energy;
            const windowEligible = !windowPhase || windowEligibleCalibrationTacticals(windowPhase.resolved, 'home').some((candidate) => candidate.id === card.id);
            const affordable = windowEligible && !windowPhase?.queued.some((play) => play.cardId === card.id) && minimumCost <= remainingEnergy;
            return (
              <TacticalHandCard
                key={card.id}
                card={card}
                cost={minimumCost}
                selected={selection?.kind === 'tactical' && selection.cardId === card.id}
                affordable={affordable}
                onClick={() => {
                  if (consumeSuppressedClick('tactical', card.id)) return;
                  setSelection({ kind: 'tactical', cardId: card.id });
                }}
                onPointerDown={(event) => startHandDrag(event, { kind: 'tactical', cardId: card.id, label: card.name.toUpperCase() })}
              />
            );
          })}
          {homeManagerAvailable && (
            <button
              type="button"
              data-testid="manager-card"
              className={`v8-card v8-card--manager${selection?.kind === 'manager' ? ' is-selected' : ''}${!windowPhase && state.teams.home.energy >= MANAGER_COST ? '' : ' is-unaffordable'}`}
              aria-pressed={selection?.kind === 'manager'}
              onClick={() => {
                if (consumeSuppressedClick('manager', 'manager')) return;
                setSelection({ kind: 'manager' });
              }}
              onPointerDown={(event) => startHandDrag(event, { kind: 'manager', cardId: 'manager', label: 'MANAGER SKILL' })}
            >
              <span className="v8-card__cost">{MANAGER_COST}</span>
              <span className="v8-card__position">MANAGER</span>
              <strong>{MANAGER_NAME}</strong>
              <small>Occupies a player slot while committed. On reveal: DEF +2 DEF/player · MID +1/+1 · ATT +2 ATT/player. Then disappears.</small>
            </button>
          )}
        </div>
      </section>

      {handDrag?.moved && (
        <div
          className={`v8-drag-ghost${handDrag.kind === 'tactical' ? ' v8-card--chance' : handDrag.kind === 'manager' ? ' v8-card--manager' : ''}`}
          data-testid="v8-drag-ghost"
          style={{ left: handDrag.x, top: handDrag.y }}
          aria-hidden="true"
        >
          <span className="v8-card__art"><i>{handDrag.kind === 'player' ? draggedPlayer?.matchName.slice(0, 2).toUpperCase() : handDrag.kind === 'tactical' ? 'TX' : 'CO'}</i></span>
          <span className="v8-card__cost">{handDrag.kind === 'player' && draggedPlayer
            ? calibrationPlayCost(draggedPlayer)
            : handDrag.kind === 'tactical' && draggedTactical
              ? Math.min(...tacticalDefinition(draggedTactical.type).eligibleZones.map((zone) => previewCalibrationTacticalCost(windowPhase?.resolved ?? state, 'home', draggedTactical, zone)))
              : MANAGER_COST}</span>
          <span className="v8-card__position">{handDrag.kind === 'player' ? draggedPlayer?.position : handDrag.kind === 'tactical' ? 'TACTICAL' : 'MANAGER'}</span>
          <strong>{handDrag.kind === 'player' ? draggedPlayer?.matchName : handDrag.kind === 'tactical' ? draggedTactical?.name : MANAGER_NAME}</strong>
          <small><b>{handDrag.kind === 'player' ? draggedPlayer?.actionName : handDrag.kind === 'tactical' ? draggedTactical ? tacticalLabel(draggedTactical) : '' : 'MANAGER SKILL'}</b></small>
          {handDrag.kind === 'player' && draggedPlayer && (
            <>
              <span className="v8-card__att">{draggedPlayer.printedAttack}<i>ATT</i></span>
              <span className="v8-card__def">{draggedPlayer.printedDefence}<i>DEF</i></span>
            </>
          )}
        </div>
      )}

'''
component = component[:hand_start] + new_hand + component[hand_end:]

# Remove any stale player-drag references that would indicate an incomplete transform.
for stale in ['playerDrag', 'playerDragRef', 'suppressPlayerClick', 'startPlayerDrag', 'PlayerDragState']:
    if stale in component:
        raise SystemExit(f'Stale player-only drag identifier remains: {stale}')

css = replace_once(css, ".v8-card--chance,\n.v8-card--manager { touch-action: manipulation; }", ".v8-card--chance,\n.v8-card--manager { touch-action: pan-x; }", 'tactical manager touch action')
css = replace_once(css, ".v8-zone.is-drag-target { border-color: rgba(255,211,99,.32); background: rgba(255,211,99,.035); }", ".v8-zone.is-drag-target { border-color: rgba(255,211,99,.32); background: rgba(255,211,99,.035); }\n.v8-zone.is-drag-disabled { opacity: .42; filter: saturate(.55); }", 'disabled drop target style')

# Shared pointer-event drag helper for browser coverage.
tests = replace_once(tests, "import { expect, test, type Page } from '@playwright/test';", "import { expect, test, type Locator, type Page } from '@playwright/test';", 'test locator import')
insert_at = tests.index("\ntest.describe('V8 real-card calibration lab'")
helper = r'''
async function dragCardToZone(page: Page, card: Locator, zone: Locator, pointerId: number) {
  const cardBox = await card.boundingBox();
  const zoneBox = await zone.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(zoneBox).not.toBeNull();
  const startX = cardBox!.x + cardBox!.width / 2;
  const startY = cardBox!.y + cardBox!.height / 2;
  const endX = zoneBox!.x + zoneBox!.width / 2;
  const endY = zoneBox!.y + zoneBox!.height * 0.74;
  const pointer = { pointerId, pointerType: 'touch', isPrimary: true, bubbles: true };

  await card.dispatchEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 });
  await page.locator('body').dispatchEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 });
  await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
  await expect(zone).toHaveClass(/is-drag-over/);
  await page.locator('body').dispatchEvent('pointerup', { ...pointer, clientX: endX, clientY: endY, buttons: 0 });
  await expect(page.getByTestId('v8-drag-ghost')).toHaveCount(0);
}
'''
tests = tests[:insert_at] + helper + tests[insert_at:]

old_player_drag = r'''    const cardBox = await bremner.boundingBox();
    const zoneBox = await midfieldZone.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(zoneBox).not.toBeNull();
    const startX = cardBox!.x + cardBox!.width / 2;
    const startY = cardBox!.y + cardBox!.height / 2;
    const endX = zoneBox!.x + zoneBox!.width / 2;
    const endY = zoneBox!.y + zoneBox!.height * 0.74;
    const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };

    await bremner.dispatchEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 });
    await page.locator('body').dispatchEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 });
    await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
    await expect(midfieldZone).toHaveClass(/is-drag-over/);
    await page.locator('body').dispatchEvent('pointerup', { ...pointer, clientX: endX, clientY: endY, buttons: 0 });'''
tests = replace_once(tests, old_player_drag, "    await dragCardToZone(page, bremner, midfieldZone, 7);", 'player drag test helper')

tests = replace_once(tests, """    await page.locator('.v8-card--manager').click();
    const defenceZone = page.locator('.v8-zone').first();
    await defenceZone.click();""", """    const defenceZone = page.locator('.v8-zone').first();
    await dragCardToZone(page, page.getByTestId('manager-card'), defenceZone, 8);""", 'manager drag test')

tests = replace_once(tests, """    await window.locator('.v8-window__choices button').filter({ hasText: 'Cross → ATT' }).click();
    await expect(window).toContainText('Post-reveal: Cross (1) → ATT');""", """    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    await expect(crossCard).toBeVisible();
    await dragCardToZone(page, crossCard, page.locator('.v8-zone').nth(2), 9);
    await expect(window).toContainText('Post-reveal: Cross (1) → ATT');""", 'window tactical drag test')

normal_tactical_test = r'''
  test('drags a held Tactical from the hand during normal commitment', async ({ page }) => {
    await page.goto('/lab/match-v8');

    await page.getByRole('button', { name: 'END PERIOD' }).click();
    await page.locator('.v8-card').filter({ hasText: 'Ángel Di María' }).click();
    await page.locator('.v8-zone').nth(1).click();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const window = page.getByTestId('v8-window');
    await expect(window).toContainText('TACTICAL WINDOW');
    await page.getByRole('button', { name: 'SKIP WINDOW' }).click();
    await expect(page.getByText('HT–66', { exact: true })).toBeVisible();

    const crossCard = page.locator('.v8-card--chance').filter({ hasText: 'Cross' });
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await expect(crossCard).toBeVisible();
    await dragCardToZone(page, crossCard, midfieldZone, 10);

    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.locator('.v8-commit')).toContainText('Cross → MID');
    await expect(page.getByText('5 ENERGY', { exact: true })).toBeVisible();
    await expect(crossCard).toHaveCount(0);
    await expectMobileFit(page);
  });
'''
normal_insert = tests.index("\n  test('shows and applies Sinclair action decay")
tests = tests[:normal_insert] + normal_tactical_test + tests[normal_insert:]

component_path.write_text(component)
css_path.write_text(css)
test_path.write_text(tests)
