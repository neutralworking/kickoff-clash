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
import type { MatchVerdict } from '../lib/match-v5';
import { cupSize, MAX_CUPS } from '../lib/run';
import { PIXEL } from './cards/cardTokens';

interface EndScreenProps {
  state: RunState;
  onNewRun: () => void;
}

export default function EndScreen({ state, onNewRun }: EndScreenProps) {
  const won = state.status === 'won';
  const history = state.matchHistory;
  const totalGoals = history.reduce((s, m) => s + m.yourGoals, 0);
  const totalRevenue = history.reduce((s, m) => s + m.revenue, 0);
  // The run is a 5-cup gauntlet of CUP_SIZES ties (20 matches total), not 5 fixtures.
  const totalCups = MAX_CUPS;
  const totalMatches = Array.from({ length: totalCups }, (_, i) => cupSize(i + 1)).reduce((a, b) => a + b, 0);

  // The fatal / final match is the last one played.
  const finalMatch = history[history.length - 1];
  const matchesSurvived = won ? totalMatches : Math.max(history.length - 1, 0);
  // The engine's verdict on that match: for a LOST run it is why the run ended;
  // for a WON run, how the final was won. Absent on pre-verdict saves.
  const finalVerdict = finalMatch?.verdict;

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
    ? `All ${totalMatches} matches survived across ${totalCups} cups. One life, no defeats — the run is yours.`
    : finalMatch
      ? `Beaten by ${finalMatch.opponentName} in Cup ${finalMatch.round} — match ${history.length} of ${totalMatches}. One loss, run gone.`
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

        {/* Why the run ended (lost) / how the final was won (won) — the engine's
            verdict on the last match. Renders nothing on pre-verdict saves. */}
        {finalVerdict && <VerdictCard verdict={finalVerdict} won={won} />}
      </div>

      <div className="shrink-0" style={{ flex: 1 }} />

      {/* ── Fixture run — every match played, coloured by outcome ─────────── */}
      <div className="relative shrink-0">
        <SectionLabel text={won ? 'Cups Cleared' : 'The Cups'} />
        <div className="flex items-stretch justify-center" style={{ gap: 6, marginTop: 9 }}>
          {Array.from({ length: totalCups }, (_, i) => {
            const cupNo = i + 1;
            const results = history.filter((h) => h.round === cupNo);
            const deathCup = won ? Infinity : state.round;
            const status: 'cleared' | 'died' | 'pending' =
              cupNo < deathCup ? 'cleared' : cupNo === deathCup ? 'died' : 'pending';
            return <CupCell key={cupNo} cupNo={cupNo} results={results} status={status} />;
          })}
        </div>
      </div>

      <div className="shrink-0" style={{ flex: 1 }} />

      {/* ── Run summary — scrolls internally only if it ever overflows ─────── */}
      <div className="shrink min-h-0 overflow-y-auto relative" style={{ overscrollBehavior: 'contain' }}>
        <SectionLabel text="Run Summary" />
        <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 9 }}>
          <StatBox label="Matches Survived" value={`${matchesSurvived}/${totalMatches}`} color={won ? 'var(--gold)' : 'var(--cream)'} />
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
                Cup {bestWin.round} — beat {bestWin.opponentName}
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

/** Subtle for/against tone from a verdict factor's signed swing (+ favours you,
 *  − the opponent); near-zero swings stay neutral. Colour only — never copy. */
function factorTone(swing: number): string {
  if (swing > 0.12) return 'var(--success)';
  if (swing < -0.12) return 'var(--danger)';
  return 'var(--dust)';
}

/** The engine's verdict on the final match. On a LOST run it is why the run
 *  ended — prominent, danger-railed, headline + top factors. On a WON run it
 *  shows quietly as a headline one-liner. Headline / labels / details render
 *  VERBATIM from the engine; the only added string is the plain section label. */
function VerdictCard({ verdict, won }: { verdict: MatchVerdict; won: boolean }) {
  if (won) {
    return (
      <div
        className="flex items-start text-left w-full"
        style={{
          marginTop: 3,
          maxWidth: 336,
          gap: 9,
          padding: '9px 11px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2, flexShrink: 0 }}>
          WHY
        </span>
        <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{verdict.headline}</span>
      </div>
    );
  }

  // Some headline branches restate the decisive factor's detail word-for-word —
  // skip that duplicate row (presentation only, no copy altered).
  const headline = verdict.headline.toLowerCase();
  const top = verdict.factors
    .filter((f) => !headline.includes(f.detail.toLowerCase()))
    .slice(0, 2);
  return (
    <div
      className="flex items-stretch text-left w-full"
      style={{
        marginTop: 3,
        maxWidth: 336,
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        border: '2px solid var(--ink-black)',
        background: 'var(--surface)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
      }}
    >
      <span style={{ width: 4, background: 'var(--danger)', borderRadius: 1, flexShrink: 0, boxShadow: '0 0 8px var(--danger)' }} />
      <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)' }}>WHY</span>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream)' }}>{verdict.headline}</span>
        {top.map((f) => {
          const tone = factorTone(f.swing);
          return (
            <div key={f.key} className="flex items-start" style={{ gap: 7 }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  marginTop: 4.5,
                  borderRadius: 1,
                  background: tone,
                  boxShadow: tone === 'var(--dust)' ? 'none' : `0 0 6px ${tone}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--cream-soft)' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.7, color: tone, marginRight: 6 }}>
                  {f.label.toUpperCase()}
                </span>
                {f.detail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One cup in the run strip: a glyph for whether the cup was cleared (✓), where the
 *  run died (✕), or never reached (—). The cup's W/D record rides in the aria-label. */
function CupCell({ cupNo, results, status }: { cupNo: number; results: MatchResult[]; status: 'cleared' | 'died' | 'pending' }) {
  const pending = status === 'pending';
  const color = status === 'cleared' ? 'var(--success)' : status === 'died' ? 'var(--danger)' : 'var(--ink)';
  const glyph = status === 'cleared' ? '✓' : status === 'died' ? '✕' : '—';
  const w = results.filter((m) => m.result === 'win').length;
  const d = results.filter((m) => m.result === 'draw').length;
  return (
    <div
      className="flex flex-col items-center justify-center"
      aria-label={`Cup ${cupNo}: ${status}${pending ? '' : ` — ${w}W ${d}D over ${results.length}`}`}
      style={{
        flex: 1,
        minWidth: 0,
        height: 48,
        borderRadius: 'var(--radius-sm)',
        border: pending ? '1px dashed var(--border)' : '2px solid var(--ink-black)',
        background: pending ? 'rgba(0,0,0,0.2)' : `${color}1f`,
        boxShadow: pending ? 'none' : `inset 0 0 0 1px ${color}`,
        gap: 2,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 14, color, lineHeight: 1 }}>{glyph}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 7, color: pending ? 'var(--ink)' : 'var(--cream-soft)' }}>
        CUP {cupNo}
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
