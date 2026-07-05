'use client';

/**
 * Post-match dashboard (SM §9): trait uptime, windows generated vs converted,
 * streak peaks + break reasons, cash — aggregated straight off the event log.
 * Losses must diagnose themselves into next-run hypotheses: the one-line
 * diagnosis heuristic sits on top.
 */

import { useMemo } from 'react';
import type { RunState } from '../../engine/run';
import type { ManagerDef } from '../../engine/data/managers';
import type { EngineCard } from '../../engine/cards';
import type { MatchState } from '../../engine/match';
import { managerSignatures } from '../../engine/draft';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';

export default function RebuildPostMatch({
  run,
  manager,
  xi,
  match,
  onContinue,
}: {
  run: RunState;
  manager: ManagerDef;
  xi: EngineCard[];
  match: MatchState;
  onContinue: () => void;
}) {
  const outcome = run.history[run.history.length - 1];
  const stats = useMemo(() => aggregate(match, xi), [match, xi]);
  useMemo(() => managerSignatures(manager), [manager]); // reserved for red/lit recap

  const diagnosis = !outcome.met
    ? stats.generated < 4
      ? 'Too few windows — your engine never generated chances. Reshape the matchup (tactics, formation).'
      : stats.conversion < 0.4
        ? 'Windows came but did not convert — buy consistency (charge on your engine’s windows).'
        : stats.streakPeak < 3
          ? 'Chances converted but chains kept breaking — protect the streak (denies, defensive calls).'
          : 'The engine ran; the target outpaced the payout — buy amplification.'
    : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
      <RPanel style={{ textAlign: 'center', padding: 16 }}>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 10, color: outcome.met ? 'var(--success)' : 'var(--kit-red)', letterSpacing: 1 }}>
          {outcome.met ? 'TARGET MET' : 'TARGET MISSED — RUN OVER'}
        </div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 26, color: 'var(--cream)', marginTop: 6 }}>
          {outcome.score[0]}–{outcome.score[1]}
        </div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 12, color: 'var(--gold)', marginTop: 4 }}>
          {outcome.points.toFixed(1)} / {outcome.target.toFixed(1)} PTS
        </div>
        {outcome.met && (
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 10, color: 'var(--gold)', marginTop: 6 }}>+£{outcome.reward}</div>
        )}
      </RPanel>

      {diagnosis && (
        <RPanel style={{ padding: 12 }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)', letterSpacing: 1 }}>WHY</div>
          <p style={{ fontSize: 12, color: 'var(--cream)', lineHeight: 1.45, marginTop: 4 }}>{diagnosis}</p>
        </RPanel>
      )}

      <div className="flex" style={{ gap: 8 }}>
        <Stat label="WINDOWS" value={`${stats.converted}/${stats.generated}`} />
        <Stat label="PEAK STREAK" value={`×${stats.streakPeak}`} />
        <Stat label="CASH" value={`£${stats.cash}`} />
      </div>

      {stats.breaks.length > 0 && (
        <RPanel style={{ padding: 10 }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)', letterSpacing: 1 }}>STREAK BREAKS</div>
          {stats.breaks.map((b, i) => (
            <div key={i} style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--kit-red)', marginTop: 4 }}>
              ×{b.atStreak} — {b.reason}
            </div>
          ))}
        </RPanel>
      )}

      <RPanel style={{ padding: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)', letterSpacing: 1 }}>
          TRAIT UPTIME (procs this match)
        </div>
        {stats.uptime.map(([name, count]) => (
          <div key={name} className="flex items-center justify-between" style={{ marginTop: 5 }}>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: count > 0 ? 'var(--cream-soft)' : 'var(--ink)' }}>{name}</span>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: count > 0 ? 'var(--gold)' : 'var(--ink)' }}>
              {count > 0 ? `×${count}` : 'never fired'}
            </span>
          </div>
        ))}
      </RPanel>

      <RButton accent onClick={onContinue}>
        CONTINUE →
      </RButton>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <RPanel style={{ flex: 1, padding: 10, textAlign: 'center' }}>
      <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: PIXEL_FONT, fontSize: 14, color: 'var(--cream)', marginTop: 4 }}>{value}</div>
    </RPanel>
  );
}

function aggregate(match: MatchState, xi: EngineCard[]) {
  let generated = 0;
  let committed = 0;
  let converted = 0;
  let streakPeak = 0;
  let cash = 0;
  const breaks: { reason: string; atStreak: number }[] = [];
  const procs = new Map<string, number>();
  for (const e of match.log) {
    if (e.type === 'window-generated' && e.side === 0) generated += 1;
    if (e.type === 'window-resolved' && e.side === 0) {
      committed += 1;
      if (e.converted) converted += 1;
    }
    if (e.type === 'streak-extended' && e.side === 0) streakPeak = Math.max(streakPeak, e.streak);
    if (e.type === 'streak-broken' && e.side === 0) breaks.push({ reason: e.reason, atStreak: e.atStreak });
    if (e.type === 'cash-banked' && e.side === 0) cash += e.value;
    if (e.type === 'early-whistle') cash += e.surplusCash;
    if (e.type === 'trait-proc' && e.side === 0) procs.set(e.trait, (procs.get(e.trait) ?? 0) + 1);
  }
  // Trait uptime over the XI's actual traits (dead cards visible), procs first.
  const xiTraits = new Set(xi.flatMap((c) => c.traits.map((t) => t.name)));
  const uptime: [string, number][] = [...xiTraits]
    .map((name): [string, number] => [name, procs.get(name) ?? 0])
    .sort((a, b) => b[1] - a[1]);
  return {
    generated,
    committed,
    converted,
    conversion: committed > 0 ? converted / committed : 0,
    streakPeak,
    cash,
    breaks,
    uptime,
  };
}
