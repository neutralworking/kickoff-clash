from pathlib import Path

component_path = Path('src/components/match-v8/V8CalibrationLab.tsx')
test_path = Path('tests/v8-match-lab.spec.ts')

text = component_path.read_text()

old = """  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  card: V8CalibrationPlayerCard;
  selected: boolean;
  affordable: boolean;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
"""
new = """  onPointerDown,
}: {
  card: V8CalibrationPlayerCard;
  selected: boolean;
  affordable: boolean;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
"""
assert old in text
text = text.replace(old, new, 1)

old = """      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
"""
new = """      onPointerDown={onPointerDown}
"""
assert old in text
text = text.replace(old, new, 1)

start = text.index("  const startPlayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, card: V8CalibrationPlayerCard) => {")
end = text.index("  const undo = () => {", start)
old_block = text[start:end]
new_block = """  const startPlayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, card: V8CalibrationPlayerCard) => {
    setSelection({ kind: 'player', cardId: card.id });
    if (finished || windowPhase || calibrationPlayCost(card) > state.teams.home.energy) return;

    const pointerId = event.pointerId;
    setDrag({
      cardId: card.id,
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
      const current = playerDragRef.current;
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
      const current = playerDragRef.current;
      cleanup();
      if (!current) return;
      const zone = current.moved ? zoneAtPoint(pointerEvent.clientX, pointerEvent.clientY) ?? current.overZone : null;
      setDrag(null);
      if (!current.moved) return;
      suppressPlayerClick.current = current.cardId;
      if (zone) queuePlayerToZone(current.cardId, zone);
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

"""
text = text[:start] + new_block + text[end:]

old = """              onPointerDown={(event) => startPlayerDrag(event, card)}
              onPointerMove={movePlayerDrag}
              onPointerUp={finishPlayerDrag}
              onPointerCancel={cancelPlayerDrag}
"""
new = """              onPointerDown={(event) => startPlayerDrag(event, card)}
"""
assert old in text
text = text.replace(old, new, 1)
component_path.write_text(text)

spec = test_path.read_text()
spec = spec.replace("toContainText('POST-REVEAL WINDOW')", "toContainText('TACTICAL WINDOW')")
test_path.write_text(spec)
