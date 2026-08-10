from pathlib import Path

component_path = Path('src/components/match-v8/V8CalibrationLab.tsx')
css_path = Path('src/components/match-v8/v8lab.css')
test_path = Path('tests/v8-match-lab.spec.ts')

component = component_path.read_text()
css = css_path.read_text()
tests = test_path.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

component = replace_once(
    component,
    "import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';",
    "import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';",
    'react import',
)

old_window = """/**
 * The Generated-Tactical Window pause: reveals have resolved, scoring has not run yet, and the
 * human side holds at least one affordable this-period-generated Tactical. CPU window plays were
 * already chosen from the same post-reveal state, so both sides' choices are blind.
 */
type WindowPhase = {
  resolved: V8CalibrationState;
  allPending: PendingPlay[];
  cpuPlays: V8CalibrationWindowPlay[];
  cpuManagerAvailable: boolean;
  queued: Array<{ cardId: string; name: string; zone: V8Zone; cost: number }>;
};"""
new_window = """type RevealOrder = { first: V8CalibrationSide; reason: string };

type ResolutionMoment = {
  id: number;
  period: number;
  label: string;
  reveal: RevealOrder;
  actionLine: string | null;
  tacticalLine: string | null;
  homeGoals: number;
  awayGoals: number;
  homeAttack: number;
  awayDefence: number;
  awayAttack: number;
  homeDefence: number;
  nextHomeScore: number;
  nextAwayScore: number;
  nextLabel: string;
  nextEnergy: number | null;
  revealedPlayerIds: string[];
  final: boolean;
};

/**
 * The Generated-Tactical Window pause: reveals have resolved, scoring has not run yet, and the
 * human side holds at least one affordable this-period-generated Tactical. CPU window plays were
 * already chosen from the same post-reveal state, so both sides' choices are blind.
 */
type WindowPhase = {
  resolved: V8CalibrationState;
  allPending: PendingPlay[];
  cpuPlays: V8CalibrationWindowPlay[];
  cpuManagerAvailable: boolean;
  reveal: RevealOrder;
  queued: Array<{ cardId: string; name: string; zone: V8Zone; cost: number }>;
};"""
component = replace_once(component, old_window, new_window, 'resolution types')

component = replace_once(
    component,
    "function priority(state: V8CalibrationState, homeScore: number, awayScore: number, seed: number): { first: V8CalibrationSide; reason: string } {",
    "function priority(state: V8CalibrationState, homeScore: number, awayScore: number, seed: number): RevealOrder {",
    'priority type',
)

component = replace_once(
    component,
    """function TacticalHandCard({
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
}) {""",
    """function TacticalHandCard({
  card,
  cost,
  selected,
  affordable,
  fresh,
  onClick,
  onPointerDown,
}: {
  card: V8TacticalCardInstance;
  cost: number;
  selected: boolean;
  affordable: boolean;
  fresh: boolean;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {""",
    'tactical fresh prop',
)
component = replace_once(
    component,
    "className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`}",
    "className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}${fresh ? ' is-fresh' : ''}${affordable ? '' : ' is-unaffordable'}`}",
    'tactical fresh class',
)

component = replace_once(
    component,
    "function DeployedChip({ state, side, runtimeId, onMove }: { state: V8CalibrationState; side: V8CalibrationSide; runtimeId: string; onMove?: () => void }) {",
    "function DeployedChip({ state, side, runtimeId, fresh = false, onMove }: { state: V8CalibrationState; side: V8CalibrationSide; runtimeId: string; fresh?: boolean; onMove?: () => void }) {",
    'deployed fresh prop',
)
component = replace_once(
    component,
    "className={`v8-chip${side === 'away' ? ' v8-chip--away' : ''}${suppressed ? ' is-suppressed' : ''}`}",
    "className={`v8-chip${side === 'away' ? ' v8-chip--away' : ''}${fresh ? ' is-fresh' : ''}${suppressed ? ' is-suppressed' : ''}`}",
    'deployed fresh class',
)

component = replace_once(
    component,
    """  const [debugOpen, setDebugOpen] = useState(false);
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);
  const handDragRef = useRef<HandDragState | null>(null);
  const suppressHandClick = useRef<string | null>(null);""",
    """  const [debugOpen, setDebugOpen] = useState(false);
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);
  const [resolutionMoment, setResolutionMoment] = useState<ResolutionMoment | null>(null);
  const handDragRef = useRef<HandDragState | null>(null);
  const suppressHandClick = useRef<string | null>(null);
  const resolutionSequence = useRef(0);""",
    'resolution state',
)

component = replace_once(
    component,
    """  const latestRecap = recaps.at(-1);
  const latestTelemetry = telemetryPeriods.at(-1);

  const reset =""",
    """  const latestRecap = recaps.at(-1);
  const latestTelemetry = telemetryPeriods.at(-1);

  useEffect(() => {
    if (!resolutionMoment) return;
    const timeout = window.setTimeout(() => setResolutionMoment(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [resolutionMoment]);

  const reset =""",
    'resolution timeout',
)
component = replace_once(
    component,
    """    setMatchTelemetry(null);
    setFinished(false);
  };""",
    """    setMatchTelemetry(null);
    setFinished(false);
    setResolutionMoment(null);
  };""",
    'reset resolution',
)

component = replace_once(
    component,
    "setWindowPhase({ resolved, allPending, cpuPlays: cpuWindowPlays, cpuManagerAvailable: cpu.managerAvailable, queued: [] });",
    "setWindowPhase({ resolved, allPending, cpuPlays: cpuWindowPlays, cpuManagerAvailable: cpu.managerAvailable, reveal, queued: [] });",
    'window reveal metadata',
)
component = replace_once(
    component,
    "finishPeriod(resolved, allPending, cpuWindowPlays, [], cpu.managerAvailable);",
    "finishPeriod(resolved, allPending, cpuWindowPlays, [], cpu.managerAvailable, reveal);",
    'direct finish reveal',
)
component = replace_once(
    component,
    """      windowPhase.cpuManagerAvailable,
    );""",
    """      windowPhase.cpuManagerAvailable,
      windowPhase.reveal,
    );""",
    'window finish reveal',
)
component = replace_once(
    component,
    """    humanPlays: V8CalibrationWindowPlay[],
    cpuManagerAvailable: boolean,
  ) => {""",
    """    humanPlays: V8CalibrationWindowPlay[],
    cpuManagerAvailable: boolean,
    reveal: RevealOrder,
  ) => {""",
    'finish signature',
)

component = replace_once(
    component,
    """    const period = resolved.period;
    const periodLabel = PERIOD_LABELS[period - 1];
    const telemetryPlays = [""",
    """    const period = resolved.period;
    const periodLabel = PERIOD_LABELS[period - 1];
    const actionLine = [...resolved.events].reverse().find((event) => (
      event.period === period
      && event.type === 'action_triggered'
      && !event.text.includes(' REVEAL:')
    ))?.text ?? null;
    const lastWindowTactical = window.plays.at(-1);
    const lastCommittedTactical = [...allPending].reverse().find((play) => play.kind === 'tactical');
    const tacticalLine = lastWindowTactical
      ? `${lastWindowTactical.card.name} → ${lastWindowTactical.zone}`
      : lastCommittedTactical?.kind === 'tactical'
        ? `${lastCommittedTactical.card.name} → ${lastCommittedTactical.zone}`
        : null;
    const revealedPlayerIds = allPending.flatMap((play) => play.kind === 'player' ? [play.cardId] : []);
    const wasFinal = resolved.period === 4;
    const telemetryPlays = [""",
    'resolution source data',
)

component = replace_once(
    component,
    """    const wasFinal = resolved.period === 4;
    let ended = endV8CalibrationPeriod(resolved, { home: nextHomeScore, away: nextAwayScore });""",
    """    setResolutionMoment({
      id: resolutionSequence.current += 1,
      period,
      label: periodLabel,
      reveal,
      actionLine,
      tacticalLine,
      homeGoals: scoredHome,
      awayGoals: scoredAway,
      homeAttack: home.attack,
      awayDefence: away.defence,
      awayAttack: away.attack,
      homeDefence: home.defence,
      nextHomeScore,
      nextAwayScore,
      nextLabel: wasFinal ? 'FULL TIME' : PERIOD_LABELS[period] ?? 'NEXT PERIOD',
      nextEnergy: wasFinal ? null : calibrationEnergyForPeriod(period + 1),
      revealedPlayerIds,
      final: wasFinal,
    });

    let ended = endV8CalibrationPeriod(resolved, { home: nextHomeScore, away: nextAwayScore });""",
    'resolution moment creation',
)

component = replace_once(
    component,
    "<main className={`v8-shell${handDrag ? ' is-dragging' : ''}${debugOpen ? ' is-debug-open' : ''}`}>",
    "<main className={`v8-shell${handDrag ? ' is-dragging' : ''}${debugOpen ? ' is-debug-open' : ''}${resolutionMoment ? ' is-resolving' : ''}${resolutionMoment?.homeGoals ? ' has-home-goal' : ''}${resolutionMoment?.awayGoals ? ' has-away-goal' : ''}`}>",
    'shell resolution classes',
)
component = replace_once(
    component,
    """        <div><small>YOU</small><strong>{homeScore}</strong></div>
        <section>
          <b>{finished ? 'FULL TIME' : PERIOD_LABELS[state.period - 1]}</b>
          <span>{finished ? 'MATCH COMPLETE' : `${state.teams.home.energy} ENERGY`}</span>
        </section>
        <div><small>CPU</small><strong>{awayScore}</strong></div>""",
    """        <div className={resolutionMoment?.homeGoals ? 'is-scoring' : ''}><small>YOU</small><strong key={`home-${resolutionMoment?.id ?? 0}-${homeScore}`}>{homeScore}</strong></div>
        <section>
          <b key={`period-${state.period}-${finished}`}>{finished ? 'FULL TIME' : PERIOD_LABELS[state.period - 1]}</b>
          <span>{finished ? 'MATCH COMPLETE' : `${state.teams.home.energy} ENERGY`}</span>
        </section>
        <div className={resolutionMoment?.awayGoals ? 'is-scoring' : ''}><small>CPU</small><strong key={`away-${resolutionMoment?.id ?? 0}-${awayScore}`}>{awayScore}</strong></div>""",
    'scoreboard motion hooks',
)
component = replace_once(
    component,
    '<section className="v8-pitch" aria-label="DEF MID ATT board"><div className="v8-pitch__stadium" aria-hidden="true"><i /><i /><i /></div>',
    '<section className={`v8-pitch${resolutionMoment ? \' is-resolving\' : \'\'}`} aria-label="DEF MID ATT board"><div className="v8-pitch__stadium" aria-hidden="true"><i /><i /><i /></div>',
    'pitch resolution class',
)
component = replace_once(
    component,
    "{awayZone.map((player) => <DeployedChip key={player.runtimeId} state={state} side=\"away\" runtimeId={player.runtimeId} />)}",
    "{awayZone.map((player) => <DeployedChip key={player.runtimeId} state={state} side=\"away\" runtimeId={player.runtimeId} fresh={resolutionMoment?.revealedPlayerIds.includes(player.cardId) === true} />)}",
    'away fresh chips',
)
component = replace_once(
    component,
    "<DeployedChip key={player.runtimeId} state={state} side=\"home\" runtimeId={player.runtimeId} onMove={() => setSelection({ kind: 'move', runtimeId: player.runtimeId })} />",
    "<DeployedChip key={player.runtimeId} state={state} side=\"home\" runtimeId={player.runtimeId} fresh={resolutionMoment?.revealedPlayerIds.includes(player.cardId) === true} onMove={() => setSelection({ kind: 'move', runtimeId: player.runtimeId })} />",
    'home fresh chips',
)

pitch_close = """        })}
      </section>

      {windowPhase ? ("""
pitch_with_moment = """        })}
        {resolutionMoment && (
          <aside className="v8-resolution" data-testid="v8-resolution" key={resolutionMoment.id} aria-live="polite">
            <div className="v8-resolution__beat v8-resolution__beat--reveal">
              <small>{resolutionMoment.label}</small>
              <strong>{resolutionMoment.reveal.first === 'home' ? 'YOU' : 'CPU'} REVEAL FIRST</strong>
              <span>{resolutionMoment.reveal.reason}</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--action">
              <small>{resolutionMoment.tacticalLine ? 'TACTICAL' : resolutionMoment.actionLine ? 'ACTION' : 'BOARD'}</small>
              <strong>{resolutionMoment.tacticalLine ?? resolutionMoment.actionLine ?? 'BOARD RESOLVED'}</strong>
              <span>{resolutionMoment.tacticalLine ? 'PLAY RESOLVED' : resolutionMoment.actionLine ? 'ACTION FIRED' : 'POSITIONS LOCKED'}</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--score">
              <div className="v8-resolution__matchups">
                <span>YOU <b>{resolutionMoment.homeAttack}</b> ATT <i>vs</i> {resolutionMoment.awayDefence} DEF</span>
                <span>CPU <b>{resolutionMoment.awayAttack}</b> ATT <i>vs</i> {resolutionMoment.homeDefence} DEF</span>
              </div>
              <strong>{resolutionMoment.homeGoals + resolutionMoment.awayGoals === 0
                ? 'NO GOALS'
                : resolutionMoment.homeGoals > 0 && resolutionMoment.awayGoals > 0
                  ? `${resolutionMoment.homeGoals + resolutionMoment.awayGoals} GOALS`
                  : resolutionMoment.homeGoals > 0
                    ? `+${resolutionMoment.homeGoals} ${resolutionMoment.homeGoals === 1 ? 'GOAL' : 'GOALS'} · YOU`
                    : `+${resolutionMoment.awayGoals} ${resolutionMoment.awayGoals === 1 ? 'GOAL' : 'GOALS'} · CPU`}</strong>
              <span>FULL +7 ATT MARGINS CONVERT</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--next">
              <small>{resolutionMoment.final ? 'FULL TIME' : 'NEXT PERIOD'}</small>
              <strong>{resolutionMoment.nextHomeScore}–{resolutionMoment.nextAwayScore}</strong>
              <span>{resolutionMoment.nextLabel}{resolutionMoment.nextEnergy !== null ? ` · ${resolutionMoment.nextEnergy} ENERGY` : ''}</span>
            </div>
          </aside>
        )}
      </section>

      {windowPhase ? ("""
component = replace_once(component, pitch_close, pitch_with_moment, 'resolution overlay')

component = replace_once(
    component,
    '<details className="v8-recap" open>',
    '<details className="v8-recap">',
    'collapse recap',
)
component = replace_once(
    component,
    """                selected={selection?.kind === 'tactical' && selection.cardId === card.id}
                affordable={affordable}
                onClick={() => {""",
    """                selected={selection?.kind === 'tactical' && selection.cardId === card.id}
                affordable={affordable}
                fresh={Boolean(windowPhase && windowEligible)}
                onClick={() => {""",
    'tactical fresh render',
)

css_append = r'''

/* ========================================================================== */
/* V8 UI PASS 03 — GAME FEEL                                                  */
/* Reveal, Action/Tactical consequence, scoring and next-period state are     */
/* staged on the pitch. These are presentation hooks only; engine rules stay  */
/* authoritative and unchanged.                                               */
/* ========================================================================== */

/* Lifting a card now leaves its hand slot behind instead of showing two full cards. */
.v8-shell.is-dragging .v8-card.is-selected {
  opacity: .16;
  filter: saturate(.35) brightness(.7);
  transform: translateY(-2px) scale(.94) rotate(0);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
}

.v8-chip--transient {
  animation: v8-commit-lock .32s cubic-bezier(.2,.9,.25,1.15) both;
}
.v8-chip.is-fresh {
  z-index: 7;
  animation: v8-chip-reveal .72s cubic-bezier(.16,.9,.24,1.18) both;
}
.v8-chip.is-fresh::after {
  content: '';
  position: absolute;
  inset: -3px;
  border: 1px solid rgba(255, 222, 127, .72);
  border-radius: 9px;
  opacity: 0;
  pointer-events: none;
  animation: v8-chip-halo .9s ease-out both;
}
.v8-chip--away.is-fresh::after { border-color: rgba(111, 210, 255, .66); }

.v8-card--chance.is-fresh {
  animation: v8-tactical-arrive .78s cubic-bezier(.16,.86,.22,1.16) both;
  box-shadow: 0 0 0 1px rgba(115, 218, 255, .32), 0 0 24px rgba(74, 198, 255, .24), 0 10px 22px rgba(0,0,0,.62);
}
.v8-window {
  animation: v8-window-arrive .36s cubic-bezier(.16,.86,.25,1.08) both;
}

.v8-scorebar > div.is-scoring strong {
  animation: v8-score-pop .72s cubic-bezier(.16,.9,.22,1.2) both;
}
.v8-scorebar section b {
  animation: v8-period-tick .42s ease-out both;
}

.v8-pitch.is-resolving::before {
  animation: v8-centre-pulse 2.7s ease-out both;
}
.v8-resolution {
  position: absolute;
  z-index: 40;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  isolation: isolate;
}
.v8-resolution::before {
  content: '';
  position: absolute;
  z-index: -2;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(6,8,12,.08), rgba(4,6,9,.76) 58%, rgba(3,4,7,.9));
  opacity: 0;
  animation: v8-resolution-shade 2.8s ease both;
}
.v8-resolution::after {
  content: '';
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 50%;
  width: 170px;
  height: 170px;
  border: 1px solid rgba(255, 216, 115, .18);
  border-radius: 50%;
  box-shadow: 0 0 70px rgba(255, 183, 49, .08), inset 0 0 50px rgba(255,255,255,.025);
  transform: translate(-50%,-50%) scale(.72);
  opacity: 0;
  animation: v8-resolution-ring 2.8s ease-out both;
}
.v8-resolution__beat {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(84%, 318px);
  display: grid;
  justify-items: center;
  gap: 5px;
  padding: 12px 14px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 14px;
  background: rgba(8,10,14,.78);
  box-shadow: 0 18px 42px rgba(0,0,0,.46), inset 0 1px rgba(255,255,255,.035);
  text-align: center;
  transform: translate(-50%,-50%) scale(.92);
  opacity: 0;
  backdrop-filter: blur(7px);
}
.v8-resolution__beat small {
  color: rgba(255, 214, 112, .72);
  font-size: 6px;
  font-weight: 1000;
  letter-spacing: .17em;
  text-transform: uppercase;
}
.v8-resolution__beat strong {
  max-width: 100%;
  overflow: hidden;
  color: #fff8eb;
  font-size: 18px;
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.035em;
  text-overflow: ellipsis;
  text-shadow: 0 2px 9px #000;
  white-space: nowrap;
}
.v8-resolution__beat span {
  color: rgba(231,233,238,.62);
  font-size: 6px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.v8-resolution__beat--reveal { animation: v8-beat-reveal 2.8s ease both; }
.v8-resolution__beat--action { animation: v8-beat-action 2.8s ease both; }
.v8-resolution__beat--score { animation: v8-beat-score 2.8s ease both; }
.v8-resolution__beat--next { animation: v8-beat-next 2.8s ease both; }
.v8-resolution__beat--action strong {
  font-size: 12px;
  line-height: 1.15;
}
.v8-resolution__beat--score {
  width: min(88%, 326px);
  gap: 8px;
  border-color: rgba(255, 204, 92, .18);
  background: linear-gradient(180deg, rgba(31,24,13,.88), rgba(8,10,14,.88));
}
.v8-resolution__beat--score strong {
  color: #ffd66c;
  font-size: 21px;
}
.v8-resolution__matchups {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.v8-resolution__matchups span {
  display: block;
  padding: 5px 4px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 7px;
  background: rgba(255,255,255,.025);
  color: rgba(243,245,248,.66);
  font-size: 5.6px;
  letter-spacing: .02em;
}
.v8-resolution__matchups b { color: #fff; font-size: 9px; }
.v8-resolution__matchups i { color: rgba(255,255,255,.3); font-style: normal; }
.v8-resolution__beat--next strong { font-size: 35px; letter-spacing: -.08em; }

.v8-shell.has-home-goal .v8-resolution__beat--score {
  box-shadow: 0 18px 46px rgba(0,0,0,.48), 0 0 44px rgba(255, 167, 47, .12);
}
.v8-shell.has-away-goal .v8-resolution__beat--score {
  border-color: rgba(100, 201, 255, .2);
}

@keyframes v8-commit-lock {
  0% { transform: translateY(10px) scale(.86); opacity: .15; }
  70% { transform: translateY(-2px) scale(1.035); opacity: 1; }
  100% { transform: none; opacity: 1; }
}
@keyframes v8-chip-reveal {
  0% { transform: perspective(220px) rotateY(78deg) scale(.78); filter: brightness(1.8); opacity: .1; }
  58% { transform: perspective(220px) rotateY(-5deg) scale(1.08); filter: brightness(1.32); opacity: 1; }
  100% { transform: perspective(220px) rotateY(0) scale(1); filter: none; opacity: 1; }
}
@keyframes v8-chip-halo {
  0% { opacity: 0; transform: scale(.82); }
  35% { opacity: .9; }
  100% { opacity: 0; transform: scale(1.32); }
}
@keyframes v8-tactical-arrive {
  0% { transform: translateY(38px) rotate(5deg) scale(.78); opacity: 0; }
  65% { transform: translateY(-7px) rotate(-1deg) scale(1.045); opacity: 1; }
  100% { transform: none; opacity: 1; }
}
@keyframes v8-window-arrive {
  0% { transform: translateY(8px) scale(.985); opacity: 0; }
  100% { transform: none; opacity: 1; }
}
@keyframes v8-score-pop {
  0% { transform: scale(.72); color: #fff; }
  45% { transform: scale(1.34); color: #ffd86e; text-shadow: 0 0 20px rgba(255,190,55,.55); }
  100% { transform: none; color: inherit; }
}
@keyframes v8-period-tick {
  0% { opacity: .2; transform: translateY(3px); }
  100% { opacity: 1; transform: none; }
}
@keyframes v8-centre-pulse {
  0%,100% { box-shadow: none; }
  42% { box-shadow: 0 0 0 25px rgba(255,255,255,.025), 0 0 65px rgba(255,197,82,.12); }
}
@keyframes v8-resolution-shade {
  0%,100% { opacity: 0; }
  8%,88% { opacity: 1; }
}
@keyframes v8-resolution-ring {
  0% { opacity: 0; transform: translate(-50%,-50%) scale(.62); }
  12% { opacity: .8; }
  80% { opacity: .28; }
  100% { opacity: 0; transform: translate(-50%,-50%) scale(1.26); }
}
@keyframes v8-beat-reveal {
  0% { opacity: 0; transform: translate(-50%,-44%) scale(.9); }
  6%,20% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  27%,100% { opacity: 0; transform: translate(-50%,-55%) scale(.97); }
}
@keyframes v8-beat-action {
  0%,19% { opacity: 0; transform: translate(-50%,-43%) scale(.91); }
  27%,40% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  47%,100% { opacity: 0; transform: translate(-50%,-56%) scale(.97); }
}
@keyframes v8-beat-score {
  0%,40% { opacity: 0; transform: translate(-50%,-45%) scale(.9); }
  48%,69% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  76%,100% { opacity: 0; transform: translate(-50%,-54%) scale(.98); }
}
@keyframes v8-beat-next {
  0%,69% { opacity: 0; transform: translate(-50%,-46%) scale(.9); }
  77%,92% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%,-54%) scale(.98); }
}

@media (prefers-reduced-motion: reduce) {
  .v8-chip--transient,
  .v8-chip.is-fresh,
  .v8-chip.is-fresh::after,
  .v8-card--chance.is-fresh,
  .v8-window,
  .v8-scorebar > div.is-scoring strong,
  .v8-scorebar section b,
  .v8-pitch.is-resolving::before,
  .v8-resolution::before,
  .v8-resolution::after,
  .v8-resolution__beat { animation-duration: .01ms !important; animation-delay: 0ms !important; }
  .v8-resolution__beat--score { opacity: 1; }
}
'''
if 'V8 UI PASS 03 — GAME FEEL' in css:
    raise SystemExit('game-feel CSS already present')
css = css.rstrip() + css_append + '\n'

anchor = """  test('selects coherent calibration squads and exposes their compressed Cost profiles', async ({ page }) => {"""
new_test = """  test('stages reveal, consequence and score directly on the pitch', async ({ page }) => {
    await page.goto('/lab/match-v8');

    const bremner = page.getByTestId('player-card-bremner');
    const midfieldZone = page.locator('.v8-zone').nth(1);
    await bremner.click();
    await midfieldZone.click();
    await page.getByRole('button', { name: 'END PERIOD' }).click();

    const moment = page.getByTestId('v8-resolution');
    await expect(moment).toBeVisible();
    await expect(moment).toContainText(/REVEAL FIRST/);
    await expect(moment).toContainText(/ATT/);
    await expect(moment).toContainText(/FULL \+7 ATT MARGINS CONVERT/);
    await expect(midfieldZone.locator('.v8-chip').filter({ hasText: 'Billy Bremner' })).toHaveClass(/is-fresh/);
    await expect(page.locator('.v8-recap')).not.toHaveAttribute('open', '');
    await expectMobileFit(page);
  });

""" + anchor
tests = replace_once(tests, anchor, new_test, 'game-feel browser test')

component_path.write_text(component)
css_path.write_text(css)
test_path.write_text(tests)
