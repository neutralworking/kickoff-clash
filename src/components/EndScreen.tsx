'use client';

/**
 * Kickoff Clash — EndScreen (PERMADEATH terminal)
 *
 * v1 one-life model. There are exactly two ways here:
 *   • LOST  — a single defeat ended the run. RUN OVER. Lead with where it ended
 *     (Match X of 5), the fatal scoreline, a tight run summary, and a NEW RUN
 *     CTA. Permadeath must land — this run is gone for good.
 *   • WON   — survived all five fixtures. RUN COMPLETE / CHAMPIONS, a celebratory
 *     treatment, the run summary, and a NEW RUN CTA.
 *
 * No season-points / board-target framing — that concept is gone under
 * permadeath. House style: Sensible-Soccer pixel, mobile-first 390×844,
 * 100dvh + overflow-hidden, the run summary scrolls internally if it ever needs
 * to. Deterministic — reads only from run state, no Math.random / Date.
 */

import type { RunState, MatchResult } from '../lib/run';
import { PIXEL } from './cards/cardTokens';

interface EndScreenProps {
  state: RunState;
  onNewRun: () => void;
}

const RESULT_COLOR: Record<MatchResult['result'], string> = {
  win: 'var(--success)',
  draw: 'var(--gold)',
  loss: 'var(--danger)',
};

export default function EndScreen({ state, onNewRun }: EndScreenProps) {
  const won = state.status === 'won';
  const history = state.matchHistory;
  const totalGoals = history.reduce((s, m) => s + m.yourGoals, 0);
  const totalRevenue = history.reduce((s, m) => s + m.revenue, 0);
  const totalRounds = 5;

  // The fatal / final fixture is the last one played.
  const finalMatch = history[history.length - 1];
  const fixturesSurvived = won ? totalRounds : Math.max(history.length - 1, 0);

  // Best win by goal difference — the run's highlight.
  const bestWin = history
    .filter((m) => m.result === 'win')
    .reduce<MatchResult | null>((best, m) => {
      if (!best) return m;
      return m.yourGoals - m.opponentGoals > best.yourGoals - best.opponentGoals ? m : best;
    }, null);

  const accent = won ? 'var(--gold)' : 'var(--danger)';
  const heroWord = won ? 'CHAMPIONS' : 'RUN OVER';
  const headlineGlow = won
    ? `0 3px 0 var(--ink-black), 0 0 32px var(--gold-glow)`
    : `0 3px 0 var(--ink-black), 0 0 32px rgba(232,54,47,0.5)`;

  const subline = won
    ? `All ${totalRounds} fixtures survived. One life, no defeats — the run is yours.`
    : finalMatch
      ? `Beaten by ${finalMatch.opponentName} at Match ${finalMatch.round} of ${totalRounds}. One loss, run gone.`
      : `The run is over.`;

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        background: 'var(--felt)',
        paddingTop: 'max(env(safe-area-inset-top), 14px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/* result-tinted glow wash behind the whole terminal */}
      <div
        className="absolute inset-0 -z-0"
        style={{
          background: `radial-gradient(ellipse at 50% 16%, ${accent}1f 0%, transparent 58%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Three composed blocks distributed across the FULL height above the fixed
          CTA with equal flex spacers between them (space-around) — no bottom
          void: hero, the fixture run, and the run summary share the column. */}
      <div className="shrink-0" style={{ flex: 0.5 }} />

      {/* ── Hero — RUN OVER / CHAMPIONS ─────────────────────────────────── */}
      <div className="relative shrink-0 flex flex-col items-center text-center" style={{ gap: 9 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 1.6, color: 'var(--dust)' }}>
          {won ? 'RUN COMPLETE' : 'PERMADEATH'}
        </span>
        <span
          className="hero-pop"
          style={{
            fontFamily: PIXEL,
            fontSize: heroWord.length > 8 ? 'clamp(30px, 10vw, 42px)' : 'clamp(40px, 13vw, 54px)',
            letterSpacing: 1.5,
            lineHeight: 1,
            color: accent,
            textShadow: headlineGlow,
          }}
        >
          {heroWord}
        </span>
        <p
          style={{
            fontFamily: 'var(--font-flavour)',
            fontStyle: 'italic',
            fontSize: 12.5,
            lineHeight: 1.45,
            color: 'var(--cream-soft)',
            maxWidth: 300,
          }}
        >
          {subline}
        </p>
      </div>

      <div className="shrink-0" style={{ flex: 1 }} />

      {/* ── Fixture run — every match played, coloured by outcome ─────────── */}
      <div className="relative shrink-0">
        <SectionLabel text={won ? 'Unbeaten Run' : 'The Run'} />
        <div className="flex items-stretch justify-center" style={{ gap: 6, marginTop: 9 }}>
          {Array.from({ length: totalRounds }, (_, i) => {
            const fixtureNo = i + 1;
            const m = history.find((h) => h.round === fixtureNo);
            return <FixtureCell key={fixtureNo} fixtureNo={fixtureNo} match={m} />;
          })}
        </div>
      </div>

      <div className="shrink-0" style={{ flex: 1 }} />

      {/* ── Run summary — scrolls internally only if it ever overflows ─────── */}
      <div className="shrink min-h-0 overflow-y-auto relative" style={{ overscrollBehavior: 'contain' }}>
        <SectionLabel text="Run Summary" />
        <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 9 }}>
          <StatBox label="Fixtures Survived" value={`${fixturesSurvived}/${totalRounds}`} color={won ? 'var(--gold)' : 'var(--cream)'} />
          <StatBox label="Record" value={recordLine(history)} color="var(--cream)" />
          <StatBox label="Goals Scored" value={totalGoals.toString()} color="var(--success)" />
          <StatBox label="Gate Revenue" value={`£${compact(totalRevenue)}`} color="var(--gold)" />
        </div>

        {/* Highlight — the run's best result, when there was a win to show. */}
        {bestWin ? (
          <div
            className="flex items-center"
            style={{
              marginTop: 8,
              gap: 9,
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              border: '2px solid var(--ink-black)',
              background: 'var(--surface)',
              boxShadow: '0 2px 0 0 var(--ink-black)',
            }}
          >
            <span style={{ width: 4, alignSelf: 'stretch', background: 'var(--success)', borderRadius: 1, flexShrink: 0 }} />
            <div className="flex flex-col" style={{ gap: 3, minWidth: 0 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)' }}>HIGHLIGHT</span>
              <span className="truncate" style={{ fontSize: 11.5, color: 'var(--cream)' }}>
                Match {bestWin.round} — beat {bestWin.opponentName}
              </span>
            </div>
            <span style={{ fontFamily: PIXEL, fontSize: 17, color: 'var(--success)', marginLeft: 'auto', flexShrink: 0 }}>
              {bestWin.yourGoals}-{bestWin.opponentGoals}
            </span>
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-center"
            style={{
              marginTop: 8,
              padding: '12px',
              borderRadius: 'var(--radius)',
              border: '1px dashed var(--border)',
              background: 'rgba(0,0,0,0.18)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--cream-soft)', lineHeight: 1.45 }}>
              No wins to show — the campaign ended early.
            </span>
          </div>
        )}
      </div>

      <div className="shrink-0" style={{ flex: 0.5 }} />

      {/* ── New Run CTA ───────────────────────────────────────────────────── */}
      <div className="relative shrink-0" style={{ paddingTop: 12 }}>
        <button
          onClick={onNewRun}
          className="w-full active:scale-[0.99] advance-btn-pulse"
          style={{
            height: 54,
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            background: 'linear-gradient(180deg, var(--amber) 0%, var(--amber-soft) 100%)',
            boxShadow: '0 3px 0 0 var(--ink-black), 0 4px 14px var(--amber-glow)',
            fontFamily: PIXEL,
            fontSize: 15,
            letterSpacing: 0.8,
            color: 'var(--line-white)',
            textTransform: 'uppercase',
          }}
        >
          Start New Run {'→'}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Pieces
// ===========================================================================

/** A divider-flanked pixel section label. */
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1.2, color: 'var(--dust)', textTransform: 'uppercase' }}>
        {text}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

/** One fixture in the run strip: outcome letter + scoreline, coloured by result,
 *  or a hollow "—" for a fixture that was never reached. */
function FixtureCell({ fixtureNo, match }: { fixtureNo: number; match?: MatchResult }) {
  if (!match) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{
          flex: 1,
          minWidth: 0,
          height: 48,
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border)',
          background: 'rgba(0,0,0,0.2)',
          gap: 2,
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--ink)' }}>—</span>
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--ink)' }}>{fixtureNo}</span>
      </div>
    );
  }
  const color = RESULT_COLOR[match.result];
  const letter = match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D';
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        flex: 1,
        minWidth: 0,
        height: 48,
        borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--ink-black)',
        background: `${color}1f`,
        boxShadow: `inset 0 0 0 1px ${color}`,
        gap: 2,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 14, color, lineHeight: 1 }}>{letter}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--cream-soft)' }}>
        {match.yourGoals}-{match.opponentGoals}
      </span>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: 5,
        padding: '11px 12px',
        borderRadius: 'var(--radius)',
        border: '2px solid var(--ink-black)',
        background: 'var(--surface)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 18, lineHeight: 1.05, color: color ?? 'var(--cream)' }}>
        {value}
      </span>
    </div>
  );
}

/** "3W 1D" style record line from the history. */
function recordLine(history: MatchResult[]): string {
  const w = history.filter((m) => m.result === 'win').length;
  const d = history.filter((m) => m.result === 'draw').length;
  const l = history.filter((m) => m.result === 'loss').length;
  return [w ? `${w}W` : '', d ? `${d}D` : '', l ? `${l}L` : ''].filter(Boolean).join(' ') || '0';
}

/** Compact money: 12_345 → "12.3k", 1_200_000 → "1.2M". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString();
}
