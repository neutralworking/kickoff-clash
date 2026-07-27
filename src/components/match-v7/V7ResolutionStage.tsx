'use client';

import type { TeamSide } from '@/engine-v7';
import type { PresentationBeat, PressurePresentation } from '@/game-v7';

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

function meterWidth(difference: number, scale: number): string {
  return `${Math.max(0, Math.min(100, (difference / scale) * 100))}%`;
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

  return (
    <div className="v7-pressure-board">
      {(['player', 'opponent'] as const).map((side) => {
        const copy = sideCopy(side);
        const data = pressure?.[side];
        const pressureShown = hasBeat(visibleBeats, side, 'pressure');
        const chancesShown = hasBeat(visibleBeats, side, 'chances');
        const reached = thresholdCount(visibleBeats, side);
        const active = currentBeat?.side === side && ['pressure', 'threshold', 'chances'].includes(currentBeat.kind);
        const totalPips = data?.chances ?? 0;

        return (
          <div className={`v7-pressure-row ${copy.className}${active ? ' active' : ''}`} key={side}>
            <span className="v7-pressure-side">{copy.short}</span>
            <div className="v7-pressure-main">
              <div className={`v7-pressure-equation${pressureShown ? ' visible' : ''}`}>
                {data ? (
                  <><b>{data.attack}</b><small>ATT</small><i>−</i><b>{data.enemyDefence}</b><small>DEF</small><em>= {data.difference >= 0 ? '+' : ''}{data.difference}</em></>
                ) : <span>Waiting for kick-off</span>}
              </div>
              <div className="v7-pressure-meter">
                <i
                  key={`${side}:${pressureShown ? currentBeat?.period ?? 0 : 0}`}
                  className={`${copy.className}${active && currentBeat?.kind === 'pressure' ? ' resolving' : ''}`}
                  style={{ width: data && pressureShown ? meterWidth(data.difference, maxDifference) : '0%' }}
                />
              </div>
              <div className="v7-threshold-track" aria-label={`${reached} of ${totalPips} chance thresholds revealed`}>
                {totalPips > 0 ? Array.from({ length: totalPips }, (_, index) => (
                  <span className={index < reached ? 'reached' : ''} key={index}>◆</span>
                )) : <span className="empty">NO THRESHOLD</span>}
              </div>
            </div>
            <strong className={chancesShown ? 'revealed' : ''}>{chancesShown && data ? data.chances : '–'}<small>CH</small></strong>
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

export function V7ResolutionStrip({ beat }: { beat: PresentationBeat }) {
  const copy = beat.side ? sideCopy(beat.side) : null;
  const data = beat.side && beat.pressure ? beat.pressure[beat.side] : null;

  if (beat.kind === 'pressure' || beat.kind === 'threshold' || beat.kind === 'chances') {
    return (
      <section className={`v7-resolution-strip kind-${beat.kind} ${copy?.className ?? ''}`} aria-live="polite">
        <div className="v7-resolution-lead">
          <span>{copy?.possessive} PRESSURE</span>
          <Formula beat={beat} />
          {beat.kind === 'threshold' && <strong>THRESHOLD {beat.thresholdIndex}<i>◆</i></strong>}
          {beat.kind === 'chances' && <strong>{data?.chances ?? 0} {data?.chances === 1 ? 'CHANCE' : 'CHANCES'}</strong>}
        </div>
        <div className="v7-resolution-causes">
          {data?.modifiers.length ? data.modifiers.slice(0, 3).map((modifier) => (
            <div className={modifier.tone} key={modifier.id}>
              <span>{modifier.label}</span><b>{modifier.detail}</b>
            </div>
          )) : <div className="neutral"><span>Base lineup</span><b>No active modifier changed this calculation</b></div>}
        </div>
      </section>
    );
  }

  if (beat.kind === 'overview') {
    return (
      <section className="v7-resolution-strip kind-overview" aria-live="polite">
        <div><span>PERIOD SHAPE</span><strong>{beat.pressure?.player.chances ?? 0}<i>–</i>{beat.pressure?.opponent.chances ?? 0}</strong></div>
        <p>You created {beat.pressure?.player.chances ?? 0}; they created {beat.pressure?.opponent.chances ?? 0}. Now every chance rolls.</p>
      </section>
    );
  }

  if (beat.kind === 'roll') {
    return (
      <section className={`v7-resolution-strip kind-roll ${copy?.className ?? ''}`} aria-live="polite">
        <div>
          <span>{copy?.possessive} CHANCE {beat.chanceIndex} OF {beat.chanceTotal}</span>
          <strong>{beat.sector?.toUpperCase()} ATTACK</strong>
        </div>
        <div className="v7-roll-target"><span>NEEDS</span><b>{beat.threshold}+</b></div>
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
