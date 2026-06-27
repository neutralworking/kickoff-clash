'use client';

/**
 * Kickoff Clash — PostMatch (SURVIVAL beat)
 *
 * v1 permadeath: a single LOSS ends the run and routes straight to the end
 * screen — so THIS screen is only ever reached after a WIN or a DRAW. It is the
 * "you survived — on to the next" beat, not a neutral full-time recap.
 *
 * In the canonical Sensible-Soccer pixel house style. TABBED layout (mirrors
 * ShopPhase): a compact, always-visible survival header (SURVIVED · scoreline ·
 * result · vs opponent), a two-tab body that each fills the viewport, and a
 * fixed CONTINUE-to-shop footer. The page never scrolls; only a tab body may
 * scroll internally when a group runs long.
 *
 *   • SURVIVAL — the "advanced" hero treatment carrying the result (WIN or
 *     DRAW), the one-life fixture arc (Match X of 5 + a pip strip of what's
 *     behind / ahead), and the REWARD EARNED (cash; a draw is flagged as a
 *     reduced gate). No season-points / board-target framing — that concept is
 *     gone under permadeath.
 *   • SQUAD — the durability aftermath: shattered / injured / promoted players
 *     as real GameCards under colour-coded headers (or a SQUAD INTACT state).
 *     In-run attrition still matters, so the aftermath stays.
 *
 * Tapping any aftermath card opens the shared CardModal.
 */

import { useState } from 'react';
import type { Card } from '../lib/scoring';
import type { MatchResult } from '../lib/run';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL } from './cards/cardTokens';

interface PostMatchProps {
  matchResult: {
    opponentName: string;
    yourGoals: number;
    opponentGoals: number;
    // Only 'win' | 'draw' reach this screen (a loss routes to the end screen),
    // but the union stays faithful to the source MatchResult shape.
    result: 'win' | 'draw' | 'loss';
    attendance: number;
    revenue: number; // the actual reward earned (a draw is already halved upstream)
  };
  durabilityResult: {
    shattered: Card[];
    injured: Card[];
    promoted: Card[];
    commentary: string[];
  };
  // --- Run context (one-life arc) — passed from GameShell ----------------------
  round: number;          // the match just played (1–5)
  totalRounds: number;    // fixtures in a run (5)
  wins: number;           // wins so far this run (incl. this one)
  matchHistory: MatchResult[]; // results so far this run (incl. this one)
  onContinue: () => void;
}

// Per-result presentation: accent colour + verb + survival tagline.
const RESULT_META: Record<
  PostMatchProps['matchResult']['result'],
  { label: string; color: string; tag: string }
> = {
  win: { label: 'WIN', color: 'var(--success)', tag: 'Full gate' },
  draw: { label: 'DRAW', color: 'var(--gold)', tag: 'Reduced gate' },
  loss: { label: 'LOSS', color: 'var(--danger)', tag: 'Run over' },
};

// Aftermath groups: shattered (gone) → injured → promoted.
// `badgeFg` is the foreground over the solid `color` fill (contrast law: white on
// the red/amber fates, ink on the bright gold one).
type GroupTone = { key: string; title: string; color: string; bg: string; marker: string; badgeFg: string };
const GROUP_META: Record<'shattered' | 'injured' | 'promoted', GroupTone> = {
  shattered: { key: 'shattered', title: 'Shattered', color: 'var(--danger)', bg: 'rgba(232,54,47,0.12)', marker: '✕', badgeFg: 'var(--line-white)' },
  injured: { key: 'injured', title: 'Injured', color: 'var(--amber)', bg: 'rgba(255,122,31,0.12)', marker: '+', badgeFg: 'var(--line-white)' },
  promoted: { key: 'promoted', title: 'Promoted', color: 'var(--gold)', bg: 'rgba(245,197,66,0.12)', marker: '★', badgeFg: 'var(--ink-black)' },
};

type Tab = 'survival' | 'squad';

export default function PostMatch({
  matchResult,
  durabilityResult,
  round,
  totalRounds,
  wins,
  matchHistory,
  onContinue,
}: PostMatchProps) {
  const [tab, setTab] = useState<Tab>('survival');
  const [modal, setModal] = useState<GameCardModel | null>(null);

  const meta = RESULT_META[matchResult.result];
  const { shattered, injured, promoted, commentary } = durabilityResult;

  const groups: { tone: GroupTone; cards: Card[] }[] = [
    { tone: GROUP_META.shattered, cards: shattered },
    { tone: GROUP_META.injured, cards: injured },
    { tone: GROUP_META.promoted, cards: promoted },
  ].filter((g) => g.cards.length > 0);

  const affected = groups.reduce((n, g) => n + g.cards.length, 0);

  // Find which group a commentary line refers to (for its accent tint).
  const lineTone = (line: string): GroupTone | null => {
    if (shattered.some((c) => line.includes(c.name))) return GROUP_META.shattered;
    if (injured.some((c) => line.includes(c.name))) return GROUP_META.injured;
    if (promoted.some((c) => line.includes(c.name))) return GROUP_META.promoted;
    return null;
  };

  return (
    <div
      className="phase-postmatch flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        background: 'var(--felt)',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {/* ── Survival head: SURVIVED · scoreline · result ──────────────────── */}
      <div className="shrink-0 px-3">
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 3px 0 0 var(--ink-black)',
            background: 'var(--surface)',
            padding: '10px 14px 12px',
          }}
        >
          {/* result-tinted glow wash behind the verdict */}
          <div
            className="absolute inset-0 -z-0"
            style={{
              background: `radial-gradient(ellipse at 50% 130%, ${meta.color}22 0%, transparent 60%)`,
              pointerEvents: 'none',
            }}
          />
          {/* accent rail in the result colour */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: meta.color }} />

          <div className="relative flex items-center justify-between" style={{ gap: 8 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 1.4, color: 'var(--dust)' }}>
              SURVIVED
            </span>
            <span className="truncate" style={{ fontSize: 11, color: 'var(--cream-soft)' }}>
              vs <b style={{ color: 'var(--cream)' }}>{matchResult.opponentName}</b>
            </span>
          </div>

          {/* Scoreline + result pill on one tight row */}
          <div className="relative flex items-center justify-center" style={{ gap: 12, marginTop: 6 }}>
            <ScoreNum value={matchResult.yourGoals} win={matchResult.result === 'win'} />
            <span style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--ink)', lineHeight: 1, paddingBottom: 6 }}>
              {'–'}
            </span>
            <ScoreNum value={matchResult.opponentGoals} win={false} />
          </div>

          <div className="relative flex items-center justify-center" style={{ marginTop: 6 }}>
            <span
              className="score-pop"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: PIXEL,
                fontSize: 13,
                letterSpacing: 1,
                color: meta.color,
                background: `${meta.color}1f`,
                border: `1.5px solid ${meta.color}`,
                borderRadius: 'var(--radius-sm)',
                padding: '5px 12px',
                lineHeight: 1,
              }}
            >
              {meta.label}
              <span style={{ width: 3, height: 11, background: meta.color, opacity: 0.55, borderRadius: 1 }} />
              <span style={{ fontSize: 8, letterSpacing: 0.6, color: 'var(--cream-soft)' }}>
                {meta.tag.toUpperCase()}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex gap-1.5 px-3" style={{ marginTop: 10 }}>
        <TabButton label="Survival" active={tab === 'survival'} onClick={() => setTab('survival')} />
        <TabButton
          label="Squad"
          active={tab === 'squad'}
          badge={affected > 0 ? affected : undefined}
          badgeColor={shattered.length > 0 ? 'var(--danger)' : injured.length > 0 ? 'var(--amber)' : 'var(--gold)'}
          onClick={() => setTab('squad')}
        />
      </div>

      {/* ── Active tab body — the ONLY region that may scroll ──────────────── */}
      <div className="flex-1 min-h-0 px-3" style={{ marginTop: 10 }}>
        {tab === 'survival' ? (
          <SurvivalTab
            matchResult={matchResult}
            meta={meta}
            round={round}
            totalRounds={totalRounds}
            wins={wins}
            matchHistory={matchHistory}
          />
        ) : (
          <SquadTab groups={groups} commentary={commentary} lineTone={lineTone} onOpen={(card) => setModal({ variant: 'player', card })} />
        )}
      </div>

      {/* ── Continue CTA ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3" style={{ paddingTop: 10 }}>
        <button
          onClick={onContinue}
          className="w-full active:scale-[0.99] advance-btn-pulse"
          style={{
            height: 52,
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            background: 'linear-gradient(180deg, var(--amber) 0%, var(--amber-soft) 100%)',
            boxShadow: '0 3px 0 0 var(--ink-black), 0 4px 14px var(--amber-glow)',
            fontFamily: PIXEL,
            fontSize: 14,
            letterSpacing: 0.8,
            color: 'var(--line-white)',
            textTransform: 'uppercase',
          }}
        >
          Continue to Shop {'→'}
        </button>
      </div>

      {/* Single CardModal mounted at root (renders absolute inset-0). */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}

// ===========================================================================
// SURVIVAL TAB — the "you advanced" beat: hero verdict + one-life fixture arc +
// reward earned.
//
// The panel is ONE vertically-centred composition: the survival poster, the
// fixture run, and the reward sit as a single stack pinned to the middle of the
// tab body, with equal flex spacers above and below so the slack is split evenly
// and the screen reads as deliberately composed — never two clusters shoved
// apart.
// ===========================================================================

function SurvivalTab({
  matchResult,
  meta,
  round,
  totalRounds,
  wins,
  matchHistory,
}: {
  matchResult: PostMatchProps['matchResult'];
  meta: { label: string; color: string; tag: string };
  round: number;
  totalRounds: number;
  wins: number;
  matchHistory: MatchResult[];
}) {
  const isFinal = round >= totalRounds;
  // Big survival verb — the run continues (unless this was the last fixture).
  const heroWord = isFinal ? 'CHAMPIONS' : 'SURVIVED';
  const arcLine = isFinal
    ? `All ${totalRounds} fixtures survived — the run is yours.`
    : survivalLine(matchResult, round, totalRounds);
  const rewardSub = matchResult.result === 'draw' ? 'reduced gate' : 'gate banked';

  return (
    <div
      key="survival"
      className="h-full flex flex-col relative overflow-hidden stats-rise"
      style={{
        background: 'var(--surface)',
        border: '2px solid var(--ink-black)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
      }}
    >
      {/* result-tinted wash + accent rail unify the panel under the verdict colour */}
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 12%, ${meta.color}22 0%, transparent 58%)`, pointerEvents: 'none' }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: meta.color }} />

      {/* Three composed regions distributed across the FULL panel height with
          equal flex spacers between them (space-around) — no concentrated void:
          (1) the match marker near the top, (2) the verdict poster + fixture arc
          in the upper-middle, (3) the books/reward grounded in the lower third. */}
      <div className="shrink-0" style={{ flex: 0.6 }} />

      {/* (1) Match marker */}
      <div className="relative shrink-0 flex justify-center" style={{ padding: '0 18px' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 1.4, color: 'var(--dust)' }}>
          MATCH {round} OF {totalRounds}
        </span>
      </div>

      <div className="shrink-0" style={{ flex: 1 }} />

      {/* (2) Verdict poster + summary line + one-life fixture arc */}
      <div className="relative shrink-0 flex flex-col items-center text-center" style={{ padding: '0 18px', gap: 14 }}>
        <span
          className="score-pop"
          style={{
            fontFamily: PIXEL,
            fontSize: heroWord.length > 8 ? 32 : 44,
            letterSpacing: 1.5,
            lineHeight: 1,
            color: meta.color,
            textShadow: `0 3px 0 var(--ink-black), 0 0 24px ${meta.color}`,
          }}
        >
          {heroWord}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--cream-soft)', lineHeight: 1.45, maxWidth: 280 }}>
          {arcLine}
        </span>

        {/* One-life fixture arc — a pip per fixture so the run's shape is legible
            at a glance: played results coloured by outcome, the rest pending. */}
        <FixtureArc round={round} totalRounds={totalRounds} matchHistory={matchHistory} />
      </div>

      <div className="shrink-0" style={{ flex: 1 }} />

      {/* (3) The books — divider + reward readout, grounded in the lower third */}
      <div className="relative shrink-0" style={{ padding: '0 14px' }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)' }}>THE BOOKS</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      </div>

      <div className="relative shrink-0 grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', padding: '16px 14px 0' }}>
        <EconStat label="Reward" value={`£${compact(matchResult.revenue)}`} sub={rewardSub} color="var(--gold)" delay={0} divider={false} />
        <EconStat label="Attendance" value={compact(matchResult.attendance)} sub="in seats" color="var(--cream)" delay={60} divider />
        <EconStat label="Survived" value={`${round}/${totalRounds}`} sub={`${wins} won`} color="var(--success)" delay={120} divider />
      </div>

      <div className="shrink-0" style={{ flex: 0.6 }} />
    </div>
  );
}

/** The one-life fixture arc: one pip per fixture in the run. Played fixtures are
 *  coloured by outcome (win green / draw gold), the most-recent one ringed, and
 *  upcoming fixtures show as hollow pending slots. Makes the survive-or-die arc
 *  readable in a glance. */
function FixtureArc({
  round,
  totalRounds,
  matchHistory,
}: {
  round: number;
  totalRounds: number;
  matchHistory: MatchResult[];
}) {
  const pips = Array.from({ length: totalRounds }, (_, i) => {
    const fixtureNo = i + 1;
    const played = matchHistory.find((m) => m.round === fixtureNo);
    const isCurrent = fixtureNo === round;
    return { fixtureNo, played, isCurrent };
  });

  return (
    <div className="flex items-center" style={{ gap: 6, marginTop: 2 }}>
      {pips.map(({ fixtureNo, played, isCurrent }) => {
        const color =
          played?.result === 'win'
            ? 'var(--success)'
            : played?.result === 'draw'
            ? 'var(--gold)'
            : 'transparent';
        const filled = Boolean(played);
        return (
          <div
            key={fixtureNo}
            className="flex flex-col items-center"
            style={{ gap: 4 }}
            aria-label={
              played
                ? `Fixture ${fixtureNo}: ${played.result} ${played.yourGoals}-${played.opponentGoals}`
                : `Fixture ${fixtureNo}: upcoming`
            }
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: filled ? color : 'rgba(0,0,0,0.32)',
                border: `2px solid ${isCurrent ? 'var(--line-white)' : 'var(--ink-black)'}`,
                boxShadow: filled ? `0 0 8px ${color}66` : 'none',
              }}
            />
            <span style={{ fontFamily: PIXEL, fontSize: 7, color: isCurrent ? 'var(--cream)' : 'var(--dust)' }}>
              {fixtureNo}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A one-line plain-language survival summary. */
function survivalLine(m: PostMatchProps['matchResult'], round: number, total: number): string {
  const opp = m.opponentName;
  const ahead = total - round;
  const tail = ahead === 1 ? '1 fixture stands between you and the title.' : `${ahead} fixtures to go.`;
  if (m.result === 'win') return `${opp} beaten — you live to fight on. ${tail}`;
  return `Honours even with ${opp} — but you survive. ${tail}`;
}

// ===========================================================================
// SQUAD TAB — durability aftermath (shattered / injured / promoted)
// ===========================================================================

function SquadTab({
  groups,
  commentary,
  lineTone,
  onOpen,
}: {
  groups: { tone: GroupTone; cards: Card[] }[];
  commentary: string[];
  lineTone: (line: string) => GroupTone | null;
  onOpen: (card: Card) => void;
}) {
  const hasAftermath = groups.length > 0;
  const affected = groups.reduce((n, g) => n + g.cards.length, 0);

  return (
    <div
      key="squad"
      className="h-full flex flex-col overflow-hidden stats-rise"
      style={{
        background: 'var(--surface)',
        border: '2px solid var(--ink-black)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
      }}
    >
      <PanelHeader
        accent="var(--amber)"
        title="Durability Check"
        right={
          hasAftermath ? (
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.4 }}>
              {affected} AFFECTED
            </span>
          ) : undefined
        }
      />

      {/* Compact fate legend — only the fates that actually occurred. */}
      {hasAftermath && (
        <div className="shrink-0 flex flex-wrap items-center" style={{ gap: 6, padding: '0 11px 9px' }}>
          {groups.map(({ tone, cards }) => (
            <span
              key={tone.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontFamily: PIXEL,
                fontSize: 8,
                letterSpacing: 0.5,
                color: tone.color,
                background: tone.bg,
                border: `1px solid ${tone.color}`,
                borderRadius: 'var(--radius-sm)',
                padding: '4px 7px',
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 9 }}>{tone.marker}</span>
              {tone.title.toUpperCase()}
              <span style={{ color: 'var(--dust)' }}>×{cards.length}</span>
            </span>
          ))}
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ overscrollBehavior: 'contain', padding: '0 11px 11px' }}
      >
        {!hasAftermath ? (
          <div
            className="flex flex-col items-center justify-center text-center h-full"
            style={{ minHeight: 200, padding: 20 }}
          >
            <span style={{ fontSize: 30, lineHeight: 1, marginBottom: 10 }}>{'🛡️'}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 13, color: 'var(--success)', letterSpacing: 0.6 }}>
              SQUAD INTACT
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--cream-soft)', marginTop: 8, lineHeight: 1.5, maxWidth: 240 }}>
              No shatters, no injuries — everyone came through ninety minutes unscathed and ready for the next fixture.
            </span>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 11 }}>
            {/* One dense grid so cards fill the width regardless of how many share
                a fate; each card carries a corner badge for its outcome. */}
            <div className="grid grid-cols-3" style={{ gap: 8 }}>
              {groups.flatMap(({ tone, cards }) =>
                cards.map((card, i) => (
                  <FateCard key={card.id} tone={tone} card={card} delay={i * 40} onOpen={onOpen} />
                )),
              )}
            </div>

            {/* Commentary tied to the aftermath — secondary to the cards. */}
            {commentary.length > 0 && (
              <div className="flex flex-col" style={{ gap: 6, marginTop: 1 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)' }}>
                  REPORT
                </span>
                {commentary.map((line, i) => (
                  <ReportLine key={i} line={line} tone={lineTone(line)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Pieces
// ===========================================================================

/** A tab toggle, matching the ShopPhase tab bar with an optional count badge. */
function TabButton({
  label,
  active,
  badge,
  badgeColor = 'var(--amber)',
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  badgeColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 active:scale-[0.98] relative"
      style={{
        height: 38,
        borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--ink-black)',
        background: active ? 'var(--amber)' : 'var(--surface)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
        fontFamily: PIXEL,
        fontSize: 10,
        letterSpacing: 0.6,
        color: active ? 'var(--ink-black)' : 'var(--dust)',
        textTransform: 'uppercase',
      }}
    >
      {label}
      {badge != null && (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -5,
            minWidth: 16,
            height: 16,
            padding: '0 3px',
            borderRadius: 8,
            border: '1.5px solid var(--ink-black)',
            background: badgeColor,
            color: 'var(--line-white)',
            fontFamily: PIXEL,
            fontSize: 8,
            lineHeight: '13px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Shared panel header chip: accent bar · pixel title · optional right slot. */
function PanelHeader({ accent, title, right }: { accent: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="shrink-0 flex items-center" style={{ gap: 8, padding: '9px 11px' }}>
      <span style={{ width: 4, height: 12, background: accent, borderRadius: 1, flexShrink: 0 }} />
      <span
        className="mr-auto truncate"
        style={{ fontFamily: PIXEL, fontSize: 9.5, letterSpacing: 0.8, color: 'var(--cream)', textTransform: 'uppercase' }}
      >
        {title}
      </span>
      {right}
    </div>
  );
}

/** A large scoreline digit; the winning side reads in --line-white, the other dimmed. */
function ScoreNum({ value, win }: { value: number; win: boolean }) {
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: 40,
        lineHeight: 0.9,
        color: win ? 'var(--line-white)' : 'var(--cream-soft)',
        textShadow: win ? '0 3px 0 var(--ink-black)' : '0 2px 0 var(--ink-black)',
      }}
    >
      {value}
    </span>
  );
}

/** A tinted commentary line; tone-coloured when it names an affected player. */
function ReportLine({ line, tone }: { line: string; tone: GroupTone | null }) {
  return (
    <div
      style={{
        fontSize: 11,
        lineHeight: 1.4,
        color: tone ? tone.color : 'var(--cream-soft)',
        background: tone ? tone.bg : 'rgba(0,0,0,0.2)',
        border: `1px solid ${tone ? tone.color : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '7px 9px',
        display: 'flex',
        gap: 7,
        alignItems: 'flex-start',
      }}
    >
      {tone && (
        <span style={{ fontFamily: PIXEL, fontSize: 10, color: tone.color, lineHeight: 1.2, flexShrink: 0 }}>
          {tone.marker}
        </span>
      )}
      <span>{line}</span>
    </div>
  );
}

/** A tappable GameCard tagged with a corner badge for its post-match fate. */
function FateCard({
  tone,
  card,
  delay,
  onOpen,
}: {
  tone: GroupTone;
  card: Card;
  delay: number;
  onOpen: (card: Card) => void;
}) {
  return (
    <div className="relative">
      <GameCard
        model={{ variant: 'player', card }}
        onClick={() => onOpen(card)}
        delay={delay}
        ariaLabel={`${card.name} — ${tone.title}`}
      />
      {/* fate badge — a corner ribbon pinned to the card's top-right corner,
          clear of the position tab (top-left) and rating (which it tucks beside). */}
      <span
        style={{
          position: 'absolute',
          top: -5,
          right: -5,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          fontFamily: PIXEL,
          fontSize: 7,
          letterSpacing: 0.3,
          color: tone.badgeFg,
          background: tone.color,
          border: '1.5px solid var(--ink-black)',
          borderRadius: 3,
          padding: '3px 5px',
          lineHeight: 1,
          boxShadow: '0 1px 0 0 var(--ink-black)',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 8 }}>{tone.marker}</span>
        {tone.title.toUpperCase()}
      </span>
    </div>
  );
}

// ===========================================================================
// Utils
// ===========================================================================

/** Compact money/attendance: 12_345 → "12.3k", 1_200_000 → "1.2M". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString();
}

/** One economy stat in the reward readout row (label · big value · sub), with an
 *  optional left hairline so the three columns read as a connected ledger. */
function EconStat({
  label,
  value,
  sub,
  color,
  delay,
  divider,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  delay: number;
  divider: boolean;
}) {
  return (
    <div
      className="stat-row-in flex flex-col items-center text-center"
      style={{
        gap: 7,
        padding: '0 4px',
        borderLeft: divider ? '1px solid var(--border)' : undefined,
        animationDelay: `${delay}ms`,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)' }}>{label.toUpperCase()}</span>
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 19, lineHeight: 1.05, color, maxWidth: '100%' }}>{value}</span>
      <span style={{ fontSize: 8.5, color: 'var(--cream-soft)', letterSpacing: 0.2 }}>{sub}</span>
    </div>
  );
}
