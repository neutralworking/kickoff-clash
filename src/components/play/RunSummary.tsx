'use client';

/**
 * KC six-contest UI (NW-143) — the run summary / death screen.
 *
 * The end of a run: how far you got, the per-fixture ledger, and the SEED so a
 * run is reproducible/shareable. Reads the settled RunState; computes nothing.
 */

import { type Manager, type RunState, RUN_FIXTURES } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, PIXEL } from './ui';

export default function RunSummary({ run, manager, onNewRun }: { run: RunState; manager: Manager; onNewRun: () => void }) {
  const cleared = run.log.filter((r) => r.beaten).length;
  const won = run.completed;
  const totalPoints = run.log.reduce((s, r) => s + r.points, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 12 }}>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <div style={{ fontFamily: PIXEL, fontSize: 26, color: won ? 'var(--success)' : 'var(--kit-red)' }}>{won ? 'CHAMPIONS' : 'RUN OVER'}</div>
        <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)', marginTop: 4 }}>
          {manager.name} · {cleared} / {RUN_FIXTURES} FIXTURES CLEARED
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <PPanel style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 20, color: 'var(--gold)' }}>{cleared}</div>
            <Eyebrow>CLEARED</Eyebrow>
          </PPanel>
          <PPanel style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 20, color: 'var(--cream)' }}>{totalPoints.toFixed(0)}</div>
            <Eyebrow>TOTAL PTS</Eyebrow>
          </PPanel>
          <PPanel style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 20, color: 'var(--gold)' }}>£{Math.floor(run.cash)}</div>
            <Eyebrow>BANKED</Eyebrow>
          </PPanel>
        </div>

        <PPanel style={{ padding: 12 }}>
          <Eyebrow>THE LEDGER</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {run.log.map((r) => (
              <div key={r.fixture} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', width: 44 }}>FIX {r.fixture}{r.boss ? '★' : ''}</span>
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: r.beaten ? 'var(--success)' : 'var(--kit-red)', flex: 1 }}>
                  {r.points.toFixed(1)} / {r.target.toFixed(1)} · {r.score[0]}–{r.score[1]}
                </span>
                <Chip color={r.beaten ? 'var(--success)' : 'var(--kit-red)'}>{r.beaten ? 'CLEARED' : 'FAILED'}</Chip>
              </div>
            ))}
          </div>
        </PPanel>

        <PPanel style={{ padding: 12 }}>
          <Eyebrow>SEED</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--cream)', marginTop: 4, userSelect: 'all' }}>{run.seed}</div>
          <div style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', marginTop: 3 }}>Same seed + manager + XI → the same run. Reproducible.</div>
        </PPanel>
      </div>

      <PButton accent onClick={onNewRun}>NEW RUN →</PButton>
    </div>
  );
}
