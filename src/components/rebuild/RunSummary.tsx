'use client';

/**
 * Run summary / death screen: the honest ledger — every fixture, the seed
 * (visible + copyable, KC_REBUILD_PLAN_V1 §P7 ahead of schedule), and the
 * next-season door.
 */

import type { RunState } from '../../engine/run';
import { getManager } from '../../engine/data/managers';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';

export default function RunSummary({ run, onNewSeason }: { run: RunState; onNewSeason: () => void }) {
  const manager = getManager(run.managerId);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <RPanel style={{ textAlign: 'center', padding: 18, marginTop: 16 }}>
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 16,
            color: run.completed ? 'var(--gold)' : 'var(--kit-red)',
            letterSpacing: 1,
          }}
        >
          {run.completed ? 'SEASON SURVIVED' : 'RUN OVER'}
        </div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 10, color: 'var(--dust)', marginTop: 8 }}>
          {manager?.name.toUpperCase()} · {run.history.filter((h) => h.met).length} FIXTURES WON · £{run.cash}
        </div>
      </RPanel>

      <RPanel style={{ padding: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {run.history.map((h) => (
          <div key={h.fixture} className="flex items-center justify-between" style={{ padding: '5px 0' }}>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)' }}>F{h.fixture}</span>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--cream)' }}>
              {h.score[0]}–{h.score[1]}
            </span>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: h.met ? 'var(--success)' : 'var(--kit-red)' }}>
              {h.points.toFixed(1)}/{h.target.toFixed(1)}
            </span>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--gold)' }}>
              {h.met ? `+£${h.reward}` : '—'}
            </span>
          </div>
        ))}
      </RPanel>

      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(String(run.seed))}
        style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        SEED {run.seed} (tap to copy)
      </button>

      <RButton accent onClick={onNewSeason}>
        NEW SEASON
      </RButton>
    </div>
  );
}
