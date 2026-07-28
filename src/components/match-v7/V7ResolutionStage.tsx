'use client';

import type { TeamSide } from '@/engine-v7';
import type { PresentationBeat, PressurePresentation, PressureSidePresentation } from '@/game-v7';
import './v7chancecalc.css';

function sideCopy(side: TeamSide): { short: string; possessive: string; className: string } {
  return side === 'player'
    ? { short: 'YOU', possessive: 'YOUR', className: 'home' }
    : { short: 'THEM', possessive: 'THEIR', className: 'away' };
}

function hasBeat(beats: readonly PresentationBeat[], side: TeamSide, kind: PresentationBeat['kind']): boolean {
  return beats.some((beat) => beat.side === side && beat.kind === kind);
}

function thresholdCount(beats: readonly PresentationBeat[], side: TeamSide): number {
  return beats.filter((beat) => beat.side === side && beat.kind === 'threshold').length;
}

function meterWidth(value: number, scale: number): string {
  return `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;
}

function pressureProgress(data: PressureSidePresentation, reached: number, baseShown: boolean): number {
  const positiveDifference = Math.max(0, data.difference);
  // Each threshold beat advances through one complete five-point band. The base
  // result beat then fills any remainder without turning it into another chance.
  if (baseShown) return positiveDifference;
  if (reached > 0) return Math.min(positiveDifference, reached * 5);
  return 0;
}

function adjustmentText(data: PressureSidePresentation): string | null {
  const parts = [
    data.addedChances !== 0 ? `${data.addedChances >= 0 ? '+' : ''}${data.addedChances} added` : null,
    data.cancelledChances > 0 ? `−${data.cancelledChances} blocked` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function V7PressureBoard({
  currentBeat,
  visibleBeats,
  pressure,
}: {
  currentBeat: PresentationBeat | null;
  visibleBeats: readonly PresentationBeat[];
  pressure?: PressurePresentation;
}) {
  const maxDifference = pressure
    ? Math.max(20, Math.ceil(Math.max(0, pressure.player.difference, pressure.opponent.difference) / 5) * 5)
    : 20;
  const overviewShown = visibleBeats.some((beat) => beat.kind === 'overview');

  return (
    <div className="v7-pressure-board">
      {(['player', 'opponent'] as const).map((side) => {
        const copy = sideCopy(side);
        const data = pressure?.[side];
        const pressureShown = hasBeat(visibleBeats, side, 'pressure');
        const baseShown = hasBeat(visibleBeats, side, 'chances');
        const adjustmentShown = hasBeat(visibleBeats, side, 'adjustment');
        const reached = thresholdCount(visibleBeats, side);
        const active = currentBeat?.side === side && ['pressure', 'threshold', 'chances', 'adjustment'].includes(currentBeat.kind);
        const totalPips = data?.baseChances ?? 0;
        const progress = data && pressureShown ? pressureProgress(data, reached, baseShown) : 0;
        const finalShown = adjustmentShown || overviewShown;
        const displayedChances = data && (baseShown || finalShown)
          ? finalShown ? data.finalChances : data.baseChances
          : null;
        const adjustment = data ? adjustmentText(data) : null;

        return (
          <div className={`v7-pressure-row ${copy.className}${active ? ' active' : ''}`} key={side}>
            <span className="v7-pressure-side">{copy.short}</span>
            <div className="v7-pressure-main">
              <div className={`v7-pressure-equation${pressureShown ? ' visible' : ''}`}>
                {data ? (
                  <><b>{data.attack}</b><small>ATT</small><i>−</i><b>{data.enemyDefence}</b><small>DEF</small><em>= {data.difference >= 0 ? '+' : ''}{data.difference}</em></>
                ) : <span>Waiting for kick-off</span>}
              </div>
              <div className="v7-pressure-meter" aria-label={`${progress} of ${Math.max(0, data?.difference ?? 0)} pressure counted`}>
                <i
                  className={`${copy.className}${active ? ' resolving' : ''}`}
                  style={{ width: data ? meterWidth(progress, maxDifference) : '0%' }}
                />
                {data && Array.from({ length: data.baseChances }, (_, index) => {
                  const boundary = (index + 1) * 5;
                  return <span className={index < reached ? 'crossed' : ''} style={{ left: meterWidth(boundary, maxDifference) }} key={index} />;
                })}
              </div>
              <div className="v7-threshold-track" aria-label={`${reached} of ${totalPips} base chance bands revealed`}>
                {totalPips > 0 ? Array.from({ length: totalPips }, (_, index) => (
                  <span className={index < reached ? 'reached' : ''} key={index}>◆</span>
                )) : <span className="empty">NO BASE CHANCE</span>}
                {adjustment && finalShown && <b className="v7-pressure-adjustment">{adjustment}</b>}
              </div>
            </div>
            <strong className={displayedChances !== null ? 'revealed' : ''}>{displayedChances ?? '–'}<small>{finalShown ? 'FINAL' : 'BASE'}</small></strong>
          </div>
        );
      })}
    </div>
  );
}

function Formula({ beat }: { beat: PresentationBeat }) {
  if (!beat.side || !beat.pressure) return null;
  const data = beat.pressure[beat.side];
  return (
    <div className="v7-resolution-formula">
      <b>{data.attack}</b><small>ATT</small><i>−</i><b>{data.enemyDefence}</b><small>DEF</small><em>= {data.difference >= 0 ? '+' : ''}{data.difference}</em>
    </div>
  );
}

function CauseList({ data, chanceOnly = false }: { data: PressureSidePresentation; chanceOnly?: boolean }) {
  const modifiers = chanceOnly
    ? data.modifiers.filter((modifier) => modifier.detail.includes('chance'))
    : data.modifiers;
  return (
    <div className="v7-resolution-causes">
      {modifiers.length ? modifiers.slice(0, 3).map((modifier) => (
        <div className={modifier.tone} key={modifier.id}>
          <span>{modifier.label}</span><b>{modifier.detail}</b>
        </div>
      )) : <div className="neutral"><span>Base lineup</span><b>No modifier changed this stage</b></div>}
    </div>
  );
}

export function V7ResolutionStrip({ beat }: { beat: PresentationBeat }) {
  const copy = beat.side ? sideCopy(beat.side) : null;
  const data = beat.side && beat.pressure ? beat.pressure[beat.side] : null;

  if ((beat.kind === 'pressure' || beat.kind === 'threshold' || beat.kind === 'chances') && data) {
    const counted = beat.kind === 'threshold'
      ? Math.min(Math.max(0, data.difference), (beat.thresholdIndex ?? 0) * 5)
      : null;
    return (
      <section className={`v7-resolution-strip kind-${beat.kind} ${copy?.className ?? ''}`} aria-live="polite">
        <div className="v7-resolution-lead">
          <span>{copy?.possessive} BASE PRESSURE</span>
          <Formula beat={beat} />
          {beat.kind === 'pressure' && <strong>CALCULATING…</strong>}
          {beat.kind === 'threshold' && <strong>+{counted} COUNTED <i>◆</i></strong>}
          {beat.kind === 'chances' && <strong>{data.baseChances} BASE {data.baseChances === 1 ? 'CHANCE' : 'CHANCES'}</strong>}
        </div>
        <CauseList data={data} />
      </section>
    );
  }

  if (beat.kind === 'adjustment' && data) {
    return (
      <section className={`v7-resolution-strip kind-adjustment ${copy?.className ?? ''}`} aria-live="polite">
        <div className="v7-resolution-lead">
          <span>{copy?.possessive} CHANCE ADJUSTMENTS</span>
          <strong>{data.baseChances}<i>→</i>{data.finalChances} FINAL</strong>
          <small>{adjustmentText(data)}</small>
        </div>
        <CauseList data={data} chanceOnly />
      </section>
    );
  }

  if (beat.kind === 'overview') {
    return (
      <section className="v7-resolution-strip kind-overview" aria-live="polite">
        <div><span>FINAL CHANCES</span><strong>{beat.pressure?.player.finalChances ?? 0}<i>–</i>{beat.pressure?.opponent.finalChances ?? 0}</strong></div>
        <p>Base ATT–DEF pressure is complete. Added and cancelled chances are applied. Now every surviving chance rolls.</p>
      </section>
    );
  }

  if (beat.kind === 'roll') {
    const total = Math.max(1, beat.chanceTotal ?? 1);
    const current = Math.max(1, beat.chanceIndex ?? 1);
    return (
      <section className={`v7-resolution-strip kind-roll ${copy?.className ?? ''}`} aria-live="polite">
        <div className="v7-roll-progress">
          <div>
            <span>{copy?.possessive} CHANCE {current} OF {total}</span>
            <strong>{beat.sector?.toUpperCase()} attack resolving on the pitch</strong>
          </div>
          <div className="v7-roll-pips" aria-label={`Chance ${current} of ${total}`}>
            {Array.from({ length: total }, (_, index) => (
              <i className={index < current - 1 ? 'done' : index === current - 1 ? 'current' : ''} key={index} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`v7-resolution-strip kind-${beat.kind} ${copy?.className ?? ''}`} aria-live="polite">
      <div><span>{copy?.short ?? 'MATCH'}</span><strong>{beat.title}</strong></div>
      {beat.detail && <p>{beat.detail}</p>}
    </section>
  );
}
