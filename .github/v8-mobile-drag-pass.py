from pathlib import Path
import re

component_path = Path('src/components/match-v8/V8CalibrationLab.tsx')
css_path = Path('src/components/match-v8/v8lab.css')
test_path = Path('tests/v8-match-lab.spec.ts')

text = component_path.read_text()

old = "import { useMemo, useState } from 'react';"
new = "import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';"
assert old in text
text = text.replace(old, new, 1)

old = """type Selection =
  | { kind: 'player'; cardId: string }
  | { kind: 'tactical'; cardId: string }
  | { kind: 'manager' }
  | { kind: 'move'; runtimeId: string }
  | null;
"""
new = old + """
type PlayerDragState = {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overZone: V8Zone | null;
  moved: boolean;
};
"""
assert old in text
text = text.replace(old, new, 1)

old = """function PlayerHandCard({ card, selected, affordable, onClick }: { card: V8CalibrationPlayerCard; selected: boolean; affordable: boolean; onClick: () => void }) {
  return (
    <button className={`v8-card${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`} onClick={onClick}>
      <span className=\"v8-card__cost\">{calibrationPlayCost(card)}</span>
      <span className=\"v8-card__position\">{card.position}</span>
      <strong>{card.realName}</strong>
      <small><b>{card.actionName}</b><br />{card.actionText}</small>
      <span className=\"v8-card__att\">{card.printedAttack} ATT</span>
      <span className=\"v8-card__def\">{card.printedDefence} DEF</span>
    </button>
  );
}
"""
new = """function PlayerHandCard({
  card,
  selected,
  affordable,
  onClick,
  onPointerDown,
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
  return (
    <button
      type=\"button\"
      data-testid={`player-card-${card.id}`}
      data-card-id={card.id}
      className={`v8-card${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`}
      aria-pressed={selected}
      aria-label={`${card.realName}, ${card.position}, ${calibrationPlayCost(card)} Energy, ${card.printedAttack} ATT, ${card.printedDefence} DEF, ${card.actionName}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className=\"v8-card__art\" aria-hidden=\"true\"><i>{card.matchName.slice(0, 2).toUpperCase()}</i></span>
      <span className=\"v8-card__cost\">{calibrationPlayCost(card)}</span>
      <span className=\"v8-card__position\">{card.position}</span>
      <strong>{card.matchName}</strong>
      <span className=\"v8-card__sr\">{card.realName}</span>
      <small><b>{card.actionName}</b><span className=\"v8-card__sr\">{card.actionText}</span></small>
      <span className=\"v8-card__att\">{card.printedAttack}<i>ATT</i></span>
      <span className=\"v8-card__def\">{card.printedDefence}<i>DEF</i></span>
    </button>
  );
}
"""
assert old in text
text = text.replace(old, new, 1)

old = """      {card.realName}
      <b>{attack}/{defence}</b>
"""
new = """      <span className=\"v8-card__sr\">{card.realName}</span>
      {card.matchName}
      <b>{attack}/{defence}</b>
"""
assert old in text
text = text.replace(old, new, 1)

old = """  const [matchTelemetry, setMatchTelemetry] = useState<V8CalibrationMatchTelemetry | null>(null);
  const [finished, setFinished] = useState(false);
"""
new = """  const [matchTelemetry, setMatchTelemetry] = useState<V8CalibrationMatchTelemetry | null>(null);
  const [finished, setFinished] = useState(false);
  const [playerDrag, setPlayerDrag] = useState<PlayerDragState | null>(null);
  const playerDragRef = useRef<PlayerDragState | null>(null);
  const suppressPlayerClick = useRef<string | null>(null);
"""
assert old in text
text = text.replace(old, new, 1)

old = """  const queueToZone = (zone: V8Zone) => {
"""
new = """  const queuePlayerToZone = (cardId: string, zone: V8Zone): boolean => {
    if (finished || windowPhase) return false;
    const card = getV8CalibrationPlayer(cardId);
    const cost = calibrationPlayCost(card);
    if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
    if (cost > state.teams.home.energy) return false;
    rememberUndo();
    try {
      const paid = payCalibrationPlayer(state, 'home', card);
      setState(paid);
      setPending((plays) => [...plays, { kind: 'player', side: 'home', cardId: card.id, zone, cost }]);
      setSelection(null);
      return true;
    } catch {
      return false;
    }
  };

  const queueToZone = (zone: V8Zone) => {
"""
assert old in text
text = text.replace(old, new, 1)

old = """    if (selection.kind === 'player') {
      const card = getV8CalibrationPlayer(selection.cardId);
      const cost = calibrationPlayCost(card);
      if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return;
      if (cost > state.teams.home.energy) return;
      rememberUndo();
      try {
        const paid = payCalibrationPlayer(state, 'home', card);
        setState(paid);
        setPending((plays) => [...plays, { kind: 'player', side: 'home', cardId: card.id, zone, cost }]);
        setSelection(null);
      } catch {
        return;
      }
      return;
    }
"""
new = """    if (selection.kind === 'player') {
      queuePlayerToZone(selection.cardId, zone);
      return;
    }
"""
assert old in text
text = text.replace(old, new, 1)

marker = """  const undo = () => {
"""
insert = """  const setDrag = (next: PlayerDragState | null) => {
    playerDragRef.current = next;
    setPlayerDrag(next);
  };

  const zoneAtPoint = (x: number, y: number): V8Zone | null => {
    const element = document.elementFromPoint(x, y);
    const zoneElement = element?.closest<HTMLElement>('[data-v8-zone]');
    const zone = zoneElement?.dataset.v8Zone as V8Zone | undefined;
    return zone && ZONES.includes(zone) ? zone : null;
  };

  const startPlayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, card: V8CalibrationPlayerCard) => {
    setSelection({ kind: 'player', cardId: card.id });
    if (finished || windowPhase || calibrationPlayCost(card) > state.teams.home.energy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      cardId: card.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      overZone: null,
      moved: false,
    });
  };

  const movePlayerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = playerDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6;
    if (moved) event.preventDefault();
    setDrag({
      ...current,
      x: event.clientX,
      y: event.clientY,
      overZone: moved ? zoneAtPoint(event.clientX, event.clientY) : null,
      moved,
    });
  };

  const finishPlayerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = playerDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const zone = current.moved ? zoneAtPoint(event.clientX, event.clientY) ?? current.overZone : null;
    setDrag(null);
    if (!current.moved) return;
    suppressPlayerClick.current = current.cardId;
    if (zone) queuePlayerToZone(current.cardId, zone);
  };

  const cancelPlayerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = playerDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setDrag(null);
  };

""" + marker
assert marker in text
text = text.replace(marker, insert, 1)

old = """  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerAffordable = selectedPlayerCost !== null && selectedPlayerCost <= state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? homeTacticals.find((card) => card.id === selection.cardId) ?? null : null;

  return (
    <main className=\"v8-shell\">
"""
new = """  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerUnaffordable = selectedPlayerCost !== null && selectedPlayerCost > state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? homeTacticals.find((card) => card.id === selection.cardId) ?? null : null;
  const draggedPlayer = playerDrag ? getV8CalibrationPlayer(playerDrag.cardId) : null;
  const interactionLabel = playerDrag?.moved
    ? playerDrag.overZone
      ? `DROP ${draggedPlayer?.matchName ?? 'PLAYER'} IN ${playerDrag.overZone}`
      : 'DRAG OVER DEF / MID / ATT'
    : pending.length
      ? `${pending.length} committed`
      : selection?.kind === 'move'
        ? 'CHOOSE DESTINATION ZONE'
        : selectedPlayerUnaffordable
          ? `${selectedPlayerCost} ENERGY REQUIRED · ${state.teams.home.energy} AVAILABLE`
          : selectedPlayer
            ? `DRAG ${selectedPlayer.matchName} TO A ZONE`
            : 'DRAG A PLAYER TO THE PITCH';

  return (
    <main className={`v8-shell${playerDrag ? ' is-dragging' : ''}`}>
"""
assert old in text
text = text.replace(old, new, 1)

text = text.replace("<span>{finished ? 'Calibration match complete' : `${state.teams.home.energy} ENERGY`}</span>", "<span>{finished ? 'MATCH COMPLETE' : `${state.teams.home.energy} ENERGY`}</span>", 1)

old = """          let guide = `${playerOccupancy}/4`;
          if (selectedPlayer) guide = outOfPositionPenalty(selectedPlayer, zone) === 0 ? 'NATURAL' : `-${outOfPositionPenalty(selectedPlayer, zone)}/-${outOfPositionPenalty(selectedPlayer, zone)}`;
          if (selectedTactical) guide = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone) ? `TACTICAL · ${tacticalLabel(selectedTactical, zone)}` : 'NO';
          if (selection?.kind === 'move') guide = 'MOVE';

          return (
            <button key={zone} className=\"v8-zone\" onClick={() => queueToZone(zone)}>
"""
new = """          let guide = `${playerOccupancy}/4`;
          if (playerOccupancy >= 4) guide = 'FULL';
          else if (selectedPlayer) {
            const penalty = outOfPositionPenalty(selectedPlayer, zone);
            guide = selectedPlayerUnaffordable ? 'NO ENERGY' : penalty === 0 ? 'NATURAL' : `−${penalty} OOP`;
          }
          if (selectedTactical) guide = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone) ? `TACTICAL · ${tacticalLabel(selectedTactical, zone)}` : 'NO';
          if (selection?.kind === 'move') guide = 'MOVE';

          return (
            <button
              key={zone}
              type=\"button\"
              data-v8-zone={zone}
              className={`v8-zone${playerDrag ? ' is-drag-target' : ''}${playerDrag?.overZone === zone ? ' is-drag-over' : ''}`}
              onClick={() => queueToZone(zone)}
            >
"""
assert old in text
text = text.replace(old, new, 1)

old = """                  <span key={`queued-${play.cardId}`} className=\"v8-chip v8-chip--transient\">{getV8CalibrationPlayer(play.cardId).realName}<b>PLAYER · QUEUED</b></span>
"""
new = """                  <span key={`queued-${play.cardId}`} className=\"v8-chip v8-chip--transient\"><span className=\"v8-card__sr\">{getV8CalibrationPlayer(play.cardId).realName}</span>{getV8CalibrationPlayer(play.cardId).matchName}<b>PLAYER · QUEUED</b></span>
"""
assert old in text
text = text.replace(old, new, 1)

text = text.replace('<strong>POST-REVEAL WINDOW</strong>', '<strong>TACTICAL WINDOW</strong>', 1)

old = """            <strong>{pending.length ? `${pending.length} committed` : selection?.kind === 'move' ? 'Choose destination zone' : 'Choose a card, then a zone'}</strong>
"""
new = """            <strong>{interactionLabel}</strong>
"""
assert old in text
text = text.replace(old, new, 1)

expanded = """        {selectedPlayer && selectedPlayerCost !== null && (
          <div className=\"v8-card-detail\" data-testid=\"selected-player-detail\">
            <div className=\"v8-card-detail__identity\">
              <small>{selectedPlayer.realName}</small>
              <strong>{selectedPlayer.fullCardName}</strong>
              <span>{selectedPlayer.position} · {selectedPlayerCost} ENERGY · {selectedPlayer.printedAttack} ATT · {selectedPlayer.printedDefence} DEF</span>
            </div>
            <div className=\"v8-card-detail__action\">
              <b>{selectedPlayer.actionName}</b>
              <span>{selectedPlayer.actionText}</span>
            </div>
            <div className=\"v8-card-detail__zones\" aria-label={`Play ${selectedPlayer.realName}`}>
              {ZONES.map((zone) => {
                const penalty = outOfPositionPenalty(selectedPlayer, zone);
                const full = occupiedPlayerSlots(state, 'home', zone, pending) >= 4;
                return (
                  <button
                    type=\"button\"
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
              <small className=\"v8-card-detail__warning\">{selectedPlayerCost} ENERGY required · {state.teams.home.energy} available</small>
            )}
          </div>
        )}
"""
assert expanded in text
text = text.replace(expanded, '', 1)

text = text.replace('<div className="v8-hand-heading"><strong>HAND</strong><span>{state.teams.home.drawPile.length} XI cards unseen</span></div>', '<div className="v8-hand-heading"><strong>HAND</strong><span>DRAG PLAYER TO PITCH · {state.teams.home.drawPile.length} UNSEEN</span></div>', 1)

old = """            <PlayerHandCard
              key={card.id}
              card={card}
              selected={selection?.kind === 'player' && selection.cardId === card.id}
              affordable={calibrationPlayCost(card) <= state.teams.home.energy}
              onClick={() => setSelection({ kind: 'player', cardId: card.id })}
            />
"""
new = """            <PlayerHandCard
              key={card.id}
              card={card}
              selected={selection?.kind === 'player' && selection.cardId === card.id}
              affordable={calibrationPlayCost(card) <= state.teams.home.energy}
              onClick={() => {
                if (suppressPlayerClick.current === card.id) {
                  suppressPlayerClick.current = null;
                  return;
                }
                setSelection({ kind: 'player', cardId: card.id });
              }}
              onPointerDown={(event) => startPlayerDrag(event, card)}
              onPointerMove={movePlayerDrag}
              onPointerUp={finishPlayerDrag}
              onPointerCancel={cancelPlayerDrag}
            />
"""
assert old in text
text = text.replace(old, new, 1)

marker = """      {state.events.length > 0 && (
"""
ghost = """      {playerDrag?.moved && draggedPlayer && (
        <div
          className=\"v8-drag-ghost\"
          data-testid=\"v8-drag-ghost\"
          style={{ left: playerDrag.x, top: playerDrag.y }}
          aria-hidden=\"true\"
        >
          <span className=\"v8-card__art\"><i>{draggedPlayer.matchName.slice(0, 2).toUpperCase()}</i></span>
          <span className=\"v8-card__cost\">{calibrationPlayCost(draggedPlayer)}</span>
          <span className=\"v8-card__position\">{draggedPlayer.position}</span>
          <strong>{draggedPlayer.matchName}</strong>
          <small><b>{draggedPlayer.actionName}</b></small>
          <span className=\"v8-card__att\">{draggedPlayer.printedAttack}<i>ATT</i></span>
          <span className=\"v8-card__def\">{draggedPlayer.printedDefence}<i>DEF</i></span>
        </div>
      )}

""" + marker
assert marker in text
text = text.replace(marker, ghost, 1)
component_path.write_text(text)

styles = css_path.read_text()
mobile_override = r'''

/* V8 mobile match surface — V7 visual baseline, V8 interaction model. */
.v8-shell {
  --v8-bg: #07090d;
  --v8-surface: #12151c;
  --v8-surface-2: #191e28;
  --v8-line: rgba(255, 255, 255, .1);
  --v8-gold: #f4a62c;
  --v8-gold-2: #ffd363;
  --v8-home: #ff7142;
  --v8-away: #57c7ff;
  --v8-ink: #fff8e9;
  --v8-muted: #9ba2b1;
  width: min(100vw, 500px);
  max-width: 500px;
  min-height: 100dvh;
  padding: max(5px, env(safe-area-inset-top)) 6px max(30px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% -8%, rgba(255, 184, 55, .14), transparent 31%),
    linear-gradient(180deg, #0c0e14, var(--v8-bg) 44%);
  color: var(--v8-ink);
  overflow-x: hidden;
}

.v8-scorebar {
  position: relative;
  top: auto;
  min-height: 62px;
  grid-template-columns: 76px minmax(0, 1fr) 76px;
  gap: 6px;
  margin: 0 0 5px;
  padding: 6px 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 199, 80, .22);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(255, 157, 48, .09), transparent 40%),
    linear-gradient(180deg, #1d1815, #101218);
  box-shadow: 0 10px 24px rgba(0, 0, 0, .34), inset 0 1px rgba(255, 255, 255, .04);
  backdrop-filter: none;
}
.v8-scorebar::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(112deg, transparent 35%, rgba(255,255,255,.035) 49%, transparent 63%);
}
.v8-scorebar > div,
.v8-scorebar > section { position: relative; z-index: 1; }
.v8-scorebar > div:first-child strong { color: var(--v8-home); }
.v8-scorebar > div:last-child strong { color: var(--v8-away); }
.v8-scorebar small { color: #d8cab2; font-size: 7px; font-weight: 950; letter-spacing: .13em; opacity: .9; }
.v8-scorebar strong { margin-top: 2px; font-size: clamp(30px, 9vw, 39px); font-weight: 1000; letter-spacing: -.07em; text-shadow: 0 2px #000; }
.v8-scorebar section { border-inline-color: rgba(255,255,255,.06); }
.v8-scorebar section b { color: var(--v8-gold-2); font-size: 11px; font-weight: 1000; letter-spacing: .12em; }
.v8-scorebar section span { color: var(--v8-muted); font-size: 8px; font-weight: 900; letter-spacing: .07em; }

.v8-pitch {
  height: clamp(340px, 44dvh, 390px);
  min-height: 340px;
  gap: 4px;
  padding: 5px;
  overflow: hidden;
  border: 1px solid rgba(255, 199, 80, .18);
  border-radius: 13px;
  background:
    radial-gradient(circle at 50% 50%, rgba(88, 205, 126, .11), transparent 34%),
    linear-gradient(90deg, transparent 33.1%, rgba(255,255,255,.12) 33.2%, rgba(255,255,255,.12) 33.45%, transparent 33.55%, transparent 66.45%, rgba(255,255,255,.12) 66.55%, rgba(255,255,255,.12) 66.8%, transparent 66.9%),
    repeating-linear-gradient(180deg, rgba(255,255,255,.024) 0 42px, rgba(0,0,0,.045) 42px 84px),
    #123d29;
  box-shadow: 0 12px 26px rgba(0,0,0,.35), inset 0 0 28px rgba(0,0,0,.22);
  isolation: isolate;
}
.v8-pitch::before {
  content: '';
  position: absolute;
  z-index: 0;
  left: 50%;
  top: 50%;
  width: 62px;
  height: 62px;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.v8-pitch::after { content: none; }

.v8-zone {
  position: relative;
  z-index: 1;
  min-height: 0;
  height: 100%;
  padding: 3px;
  border-color: rgba(255,255,255,.13);
  border-radius: 9px;
  background: rgba(5, 15, 10, .1);
  touch-action: manipulation;
  transition: transform 130ms ease, border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.v8-zone:hover { border-color: rgba(255,255,255,.2); }
.v8-zone__heading {
  min-height: 28px;
  margin: 3px -1px;
  padding: 4px 5px;
  border-color: rgba(255,255,255,.12);
  border-radius: 7px;
  background: rgba(6, 12, 9, .83);
}
.v8-zone__heading strong { color: #f8ecda; font-size: 9px; font-weight: 1000; letter-spacing: .16em; }
.v8-zone__heading span { color: var(--v8-gold-2); max-width: 68px; overflow: hidden; font-size: 6.5px; font-weight: 950; letter-spacing: .04em; text-overflow: ellipsis; white-space: nowrap; opacity: .76; }
.v8-zone__side { grid-template-rows: repeat(2, minmax(47px, 1fr)); min-height: 0; gap: 3px; padding: 2px 0; }
.v8-zone__side i { min-height: 47px; border-color: rgba(255,255,255,.085); border-radius: 6px; background: rgba(0,0,0,.035); }
.v8-zone__side--away { opacity: .72; }
.v8-zone__side--away i { border-color: rgba(87,199,255,.09); }

.v8-shell.is-dragging .v8-pitch { border-color: rgba(255,211,99,.44); box-shadow: 0 0 0 1px rgba(255,211,99,.08), 0 12px 28px rgba(0,0,0,.42), inset 0 0 28px rgba(0,0,0,.22); }
.v8-zone.is-drag-target { border-color: rgba(255,211,99,.32); background: rgba(255,211,99,.035); }
.v8-zone.is-drag-target .v8-zone__heading span { opacity: 1; }
.v8-zone.is-drag-over {
  z-index: 3;
  border-color: var(--v8-gold-2);
  background: rgba(255,211,99,.12);
  box-shadow: 0 0 0 2px rgba(255,211,99,.22), 0 0 24px rgba(255,177,50,.28);
  transform: scale(1.018);
}
.v8-zone.is-drag-over .v8-zone__heading { background: rgba(35, 28, 13, .92); }

.v8-chip {
  min-height: 47px;
  padding: 3px;
  border-color: rgba(255, 203, 99, .34);
  border-radius: 6px;
  background: linear-gradient(160deg, #234c34, #122a1d);
  box-shadow: 0 4px 9px rgba(0,0,0,.32), inset 0 1px rgba(255,255,255,.035);
  font-size: 6.5px;
  font-weight: 900;
}
.v8-chip--away { border-color: rgba(87,199,255,.24); background: linear-gradient(160deg, #263542, #15202a); }
.v8-chip--transient { border-color: rgba(255,211,99,.7); background: linear-gradient(165deg, #624c22, #2c2111); animation: v8-queued-pulse 900ms ease-in-out infinite alternate; }
.v8-chip b { margin-top: 3px; color: #fff4dc; font-size: 8px; }
.v8-chip small { color: #d9cdb9; font-size: 5.5px; opacity: .72; }

.v8-commit {
  min-height: 55px;
  margin: 5px 0;
  padding: 6px 7px;
  border-color: rgba(255,199,80,.13);
  border-radius: 11px;
  background: linear-gradient(180deg, rgba(29,31,39,.95), rgba(13,15,20,.97));
  box-shadow: 0 7px 18px rgba(0,0,0,.26);
}
.v8-commit strong { color: #fff4dc; font-size: 10px; font-weight: 1000; letter-spacing: .025em; }
.v8-commit span { color: var(--v8-muted); font-size: 7.5px; opacity: .82; }
.v8-commit button { border-color: rgba(255,255,255,.12); background: #171b23; font-size: 8px; font-weight: 1000; }
.v8-commit .v8-primary {
  border-color: rgba(255,211,99,.58);
  background: linear-gradient(180deg, #ffd363, #e79c28);
  color: #191106;
  box-shadow: 0 4px 14px rgba(223,143,22,.22), inset 0 1px rgba(255,255,255,.42);
}

.v8-hand-wrap {
  position: relative;
  margin-top: 0;
  padding: 3px 0 1px;
  border-top: 1px solid rgba(255,255,255,.055);
}
.v8-hand-heading { margin: 0 3px 1px; }
.v8-hand-heading strong { color: var(--v8-gold); font-size: 8px; font-weight: 1000; letter-spacing: .12em; }
.v8-hand-heading span { color: var(--v8-muted); font-size: 6.5px; font-weight: 850; letter-spacing: .06em; opacity: .7; }
.v8-hand {
  align-items: flex-end;
  gap: 4px;
  min-height: 126px;
  padding: 4px 3px 7px;
  overflow-x: auto;
  overflow-y: visible;
  touch-action: pan-x;
  scroll-padding-inline: 3px;
}

.v8-card {
  flex: 0 0 84px;
  height: 118px;
  padding: 51px 6px 25px;
  overflow: hidden;
  border: 1px solid rgba(255,203,99,.62);
  border-radius: 8px;
  background:
    linear-gradient(180deg, transparent 48%, rgba(5,8,7,.82) 72%),
    radial-gradient(circle at 50% 27%, rgba(255,162,57,.22), transparent 37%),
    linear-gradient(145deg, #26392d, #10151a 72%);
  box-shadow: 0 6px 13px rgba(0,0,0,.56), inset 0 0 0 1px rgba(0,0,0,.55);
  text-align: left;
  transform-origin: 50% 92%;
  touch-action: pan-x;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 140ms ease, opacity 140ms ease, filter 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.v8-card:hover { transform: none; }
.v8-card:active { transform: scale(.97); }
.v8-card.is-selected {
  z-index: 4;
  flex-basis: 84px;
  height: 118px;
  border-color: var(--v8-gold-2);
  transform: translateY(-5px) scale(1.025);
  box-shadow: 0 0 0 2px rgba(255,211,99,.25), 0 0 19px rgba(255,177,50,.34), 0 9px 18px rgba(0,0,0,.62);
}
.v8-card.is-unaffordable:not(.is-selected) { opacity: .34; filter: saturate(.3) brightness(.78); }
.v8-card--chance,
.v8-card--manager { touch-action: manipulation; }
.v8-card--chance { background: linear-gradient(180deg, transparent 45%, rgba(12,8,3,.84) 72%), radial-gradient(circle at 50% 24%, rgba(255,201,75,.27), transparent 37%), linear-gradient(145deg, #5b4319, #21170a 72%); }
.v8-card--manager { flex-basis: 88px; background: linear-gradient(180deg, transparent 45%, rgba(8,5,13,.86) 72%), radial-gradient(circle at 50% 24%, rgba(189,142,255,.24), transparent 37%), linear-gradient(145deg, #413055, #191321 72%); }
.v8-card--manager.is-selected { flex-basis: 88px; height: 118px; }
.v8-card__art {
  position: absolute;
  inset: 23px 5px auto;
  height: 42px;
  overflow: hidden;
  border-radius: 5px;
  background:
    radial-gradient(circle at 50% 25%, rgba(255,255,255,.18), transparent 18%),
    linear-gradient(145deg, rgba(255,113,66,.42), rgba(87,199,255,.22));
  box-shadow: inset 0 -14px 18px rgba(4,7,6,.55);
}
.v8-card__art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(112deg, transparent 25%, rgba(255,255,255,.08) 48%, transparent 67%); }
.v8-card__art i { position: absolute; right: 4px; bottom: -7px; color: rgba(255,255,255,.13); font-size: 35px; font-style: normal; font-weight: 1000; letter-spacing: -.1em; }
.v8-card__cost,
.v8-card__position,
.v8-card__att,
.v8-card__def { z-index: 2; }
.v8-card__cost {
  top: 5px;
  left: 5px;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(0,0,0,.42);
  background: linear-gradient(180deg, #ffd970, #e99b24);
  color: #211507;
  font-size: 10px;
  font-weight: 1000;
  box-shadow: 0 2px 7px rgba(0,0,0,.45), inset 0 1px rgba(255,255,255,.55);
}
.v8-card__position { top: 8px; right: 5px; color: #f6ead6; font-size: 7px; font-weight: 1000; letter-spacing: .04em; }
.v8-card__att,
.v8-card__def { bottom: 5px; display: flex; align-items: baseline; gap: 2px; font-size: 13px; font-weight: 1000; letter-spacing: -.04em; text-shadow: 0 1px #000; }
.v8-card__att { left: 6px; color: var(--v8-home); }
.v8-card__def { right: 6px; color: var(--v8-away); }
.v8-card__att i,
.v8-card__def i { font-size: 5px; font-style: normal; font-weight: 1000; letter-spacing: .04em; opacity: .72; }
.v8-card > strong { position: relative; z-index: 2; display: block; -webkit-line-clamp: 1; color: #fff7e8; font-size: 10px; font-weight: 1000; line-height: 1; text-overflow: ellipsis; white-space: nowrap; }
.v8-card small { position: relative; z-index: 2; display: block; max-height: none; margin-top: 4px; overflow: hidden; font-size: 0; line-height: 1; opacity: 1; }
.v8-card small b { display: block; overflow: hidden; color: #d8c9b2; font-size: 6.5px; font-weight: 950; letter-spacing: .035em; text-overflow: ellipsis; white-space: nowrap; }
.v8-card.is-selected small { max-height: none; margin-top: 4px; font-size: 0; line-height: 1; }
.v8-card.is-selected small b { margin: 0; font-size: 6.5px; }
.v8-card--chance small,
.v8-card--manager small { max-height: 28px; font-size: 6px; line-height: 1.15; }
.v8-card--chance.is-selected small,
.v8-card--manager.is-selected small { max-height: 28px; font-size: 6px; }
.v8-card__sr {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

.v8-drag-ghost {
  position: fixed;
  z-index: 200;
  width: 92px;
  height: 128px;
  padding: 55px 7px 27px;
  overflow: hidden;
  pointer-events: none;
  border: 1px solid var(--v8-gold-2);
  border-radius: 9px;
  background: linear-gradient(180deg, transparent 48%, rgba(5,8,7,.84) 72%), radial-gradient(circle at 50% 27%, rgba(255,162,57,.24), transparent 37%), linear-gradient(145deg, #2d4435, #11171b 72%);
  box-shadow: 0 0 0 2px rgba(255,211,99,.22), 0 18px 35px rgba(0,0,0,.62), 0 0 28px rgba(255,177,50,.24);
  color: var(--v8-ink);
  transform: translate(-50%, -72%) rotate(-2deg) scale(1.04);
  transform-origin: center;
  animation: v8-drag-lift 120ms ease-out both;
}
.v8-drag-ghost .v8-card__art { inset: 25px 5px auto; height: 45px; }
.v8-drag-ghost > strong { position: relative; z-index: 2; display: block; overflow: hidden; font-size: 10px; font-weight: 1000; text-overflow: ellipsis; white-space: nowrap; }
.v8-drag-ghost small { position: relative; z-index: 2; display: block; margin-top: 4px; }
.v8-drag-ghost small b { color: #d8c9b2; font-size: 6.5px; letter-spacing: .035em; }

.v8-condition,
.v8-lab-controls--squads,
.v8-totals,
.v8-telemetry,
.v8-log { max-width: 100%; }
.v8-condition { margin-top: 24px; opacity: .68; }
.v8-condition::before { content: 'CALIBRATION / DEBUG'; }

@keyframes v8-drag-lift { from { opacity: .7; transform: translate(-50%, -65%) scale(.9); } to { opacity: 1; transform: translate(-50%, -72%) rotate(-2deg) scale(1.04); } }
@keyframes v8-queued-pulse { from { box-shadow: 0 0 0 1px rgba(255,211,99,.1), 0 4px 9px rgba(0,0,0,.3); } to { box-shadow: 0 0 0 2px rgba(255,211,99,.28), 0 0 15px rgba(255,177,50,.2), 0 4px 9px rgba(0,0,0,.3); } }

@media (max-width: 480px) {
  .v8-shell { padding: max(5px, env(safe-area-inset-top)) 5px max(26px, env(safe-area-inset-bottom)); }
  .v8-scorebar { min-height: 58px; grid-template-columns: 68px minmax(0, 1fr) 68px; }
  .v8-pitch { height: clamp(340px, 44dvh, 380px); min-height: 340px; }
  .v8-zone__side { grid-template-rows: repeat(2, minmax(45px, 1fr)); }
  .v8-zone__side i,
  .v8-chip { min-height: 45px; }
  .v8-commit { grid-template-columns: 1fr auto; min-height: 51px; }
  .v8-commit > div { max-height: 35px; overflow: hidden; }
  .v8-commit .v8-primary { grid-column: auto; width: auto; }
  .v8-hand { min-height: 124px; }
  .v8-card { flex-basis: 82px; width: 82px; height: 115px; padding-top: 49px; }
  .v8-card.is-selected { flex-basis: 82px; width: 82px; height: 115px; }
  .v8-card--manager,
  .v8-card--manager.is-selected { flex-basis: 86px; width: 86px; height: 115px; }
}
'''
if '/* V8 mobile match surface — V7 visual baseline, V8 interaction model. */' not in styles:
    styles += mobile_override
css_path.write_text(styles)

spec = test_path.read_text()
old = """  test('places a default-hand player through explicit zone controls', async ({ page }) => {
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
  });
"""
new = """  test('drags a default-hand player directly onto the pitch', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await expect(bremner.locator('.v8-card__cost')).toHaveText('1');

    const cardBox = await bremner.boundingBox();
    const zoneBox = await midfieldZone.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(zoneBox).not.toBeNull();
    await page.mouse.move(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(zoneBox!.x + zoneBox!.width / 2, zoneBox!.y + zoneBox!.height * 0.74, { steps: 8 });
    await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
    await expect(midfieldZone).toHaveClass(/is-drag-over/);
    await page.mouse.up();

    await expect(page.getByTestId('selected-player-detail')).toHaveCount(0);
    await expect(page.getByText('1 committed', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ENERGY', { exact: true })).toBeVisible();
    await expect(midfieldZone.locator('.v8-chip--transient')).toContainText('Billy Bremner');
    await expect(bremner).toHaveCount(0);
    await expectMobileFit(page);
  });

  test('keeps unaffordable players in-hand and explains the Energy constraint in the decision strip', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const iniesta = page.getByTestId('player-card-iniesta');
    await expect(iniesta.locator('.v8-card__cost')).toHaveText('4');
    await iniesta.click();

    await expect(iniesta).toHaveClass(/is-unaffordable/);
    await expect(page.locator('.v8-commit')).toContainText('4 ENERGY REQUIRED · 2 AVAILABLE');
    await expect(page.getByTestId('selected-player-detail')).toHaveCount(0);
    await expect(page.getByText('2 ENERGY', { exact: true })).toBeVisible();
    await expectMobileFit(page);
  });
"""
assert old in spec
spec = spec.replace(old, new, 1)

test_path.write_text(spec)

for path in (component_path, css_path, test_path):
    data = path.read_text()
    if '\r\n' in data:
        path.write_text(data.replace('\r\n', '\n'))
