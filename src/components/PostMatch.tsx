'use client';

/**
 * Kickoff Clash — PostMatch (FULL TIME)
 *
 * The result screen, in the canonical Sensible-Soccer pixel house style.
 * Mobile-first, no document scroll: a fixed result head + economy tiles, a
 * single internally-scrolling "squad aftermath" panel of real GameCards, and a
 * fixed CONTINUE-to-shop footer. A short staged reveal layers it in without
 * blocking interaction. Tapping any aftermath card opens the shared CardModal.
 *
 * Contract (PostMatchProps) is byte-identical — GameShell wiring is untouched.
 */

import { useState, useEffect } from 'react';
import type { Card } from '../lib/scoring';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL } from './cards/cardTokens';

interface PostMatchProps {
  matchResult: {
    opponentName: string;
    yourGoals: number;
    opponentGoals: number;
    result: 'win' | 'draw' | 'loss';
    pointsEarned: number;
    seasonPoints: number;
    attendance: number;
    revenue: number;
  };
  durabilityResult: {
    shattered: Card[];
    injured: Card[];
    promoted: Card[];
    commentary: string[];
  };
  onContinue: () => void;
}

// Per-result presentation: accent colour + verb + tagline.
const RESULT_META: Record<
  PostMatchProps['matchResult']['result'],
  { label: string; color: string; tag: string }
> = {
  win: { label: 'WIN', color: 'var(--success)', tag: 'Three points' },
  draw: { label: 'DRAW', color: 'var(--dust)', tag: 'A point apiece' },
  loss: { label: 'LOSS', color: 'var(--danger)', tag: 'Back to the drawing board' },
};

// Aftermath groups: shattered (gone) → injured → promoted.
type GroupTone = { key: string; title: string; color: string; bg: string; marker: string };
const GROUP_META: Record<'shattered' | 'injured' | 'promoted', GroupTone> = {
  shattered: { key: 'shattered', title: 'Shattered', color: 'var(--danger)', bg: 'rgba(232,54,47,0.12)', marker: '✕' },
  injured: { key: 'injured', title: 'Injured', color: 'var(--amber)', bg: 'rgba(255,122,31,0.12)', marker: '+' },
  promoted: { key: 'promoted', title: 'Promoted', color: 'var(--gold)', bg: 'rgba(245,197,66,0.12)', marker: '★' },
};

export default function PostMatch({ matchResult, durabilityResult, onContinue }: PostMatchProps) {
  const [step, setStep] = useState(0);
  const [modal, setModal] = useState<GameCardModel | null>(null);

  // Quick, non-blocking staged reveal: head → tiles → aftermath → footer.
  useEffect(() => {
    if (step < 3) {
      const t = setTimeout(() => setStep((s) => s + 1), 280);
      return () => clearTimeout(t);
    }
  }, [step]);

  const meta = RESULT_META[matchResult.result];
  const { shattered, injured, promoted, commentary } = durabilityResult;

  const groups: { tone: GroupTone; cards: Card[] }[] = [
    { tone: GROUP_META.shattered, cards: shattered },
    { tone: GROUP_META.injured, cards: injured },
    { tone: GROUP_META.promoted, cards: promoted },
  ].filter((g) => g.cards.length > 0);

  const hasAftermath = groups.length > 0;

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
      {/* ── Result head: FULL TIME · scoreline · verdict ──────────────────── */}
      <div
        className="shrink-0 px-3"
        style={{
          opacity: step >= 0 ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 3px 0 0 var(--ink-black)',
            background: 'var(--surface)',
            padding: '12px 14px 14px',
          }}
        >
          {/* result-tinted glow wash behind the verdict */}
          <div
            className="absolute inset-0 -z-0"
            style={{
              background: `radial-gradient(ellipse at 50% 120%, ${meta.color}22 0%, transparent 62%)`,
              pointerEvents: 'none',
            }}
          />
          {/* accent rail in the result colour */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: meta.color,
            }}
          />

          <div className="relative flex items-center justify-between" style={{ gap: 8 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 1.4, color: 'var(--dust)' }}>
              FULL TIME
            </span>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.8, color: 'var(--dust)' }}>
              {meta.tag.toUpperCase()}
            </span>
          </div>

          {/* Scoreline: YOU — OPP */}
          <div className="relative flex items-end justify-center" style={{ gap: 14, marginTop: 8 }}>
            <ScoreNum value={matchResult.yourGoals} win={matchResult.result === 'win'} />
            <span
              style={{
                fontFamily: PIXEL,
                fontSize: 20,
                color: 'var(--ink)',
                lineHeight: 1,
                paddingBottom: 8,
              }}
            >
              {'–'}
            </span>
            <ScoreNum value={matchResult.opponentGoals} win={matchResult.result === 'loss'} />
          </div>

          {/* Verdict + opponent */}
          <div className="relative flex items-center justify-center" style={{ gap: 10, marginTop: 6 }}>
            <span
              className={step >= 0 ? 'score-pop' : ''}
              style={{
                fontFamily: PIXEL,
                fontSize: 26,
                letterSpacing: 1,
                color: meta.color,
                lineHeight: 1,
                textShadow: `0 0 18px ${meta.color}`,
              }}
            >
              {meta.label}
            </span>
          </div>
          <div className="relative text-center" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--cream-soft)' }}>
              vs <b style={{ color: 'var(--cream)' }}>{matchResult.opponentName}</b>
            </span>
          </div>
        </div>
      </div>

      {/* ── Economy / standing tiles ──────────────────────────────────────── */}
      <div
        className="shrink-0 px-3"
        style={{
          marginTop: 10,
          opacity: step >= 1 ? 1 : 0,
          transform: step >= 1 ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          <StatTile
            label="Points"
            value={`+${matchResult.pointsEarned}`}
            sub={`${matchResult.seasonPoints} total`}
            color="var(--success)"
          />
          <StatTile
            label="Revenue"
            value={`£${compact(matchResult.revenue)}`}
            sub="this gate"
            color="var(--gold)"
          />
          <StatTile
            label="Attendance"
            value={compact(matchResult.attendance)}
            sub="in seats"
            color="var(--cream)"
          />
        </div>
      </div>

      {/* ── Squad aftermath — the ONLY scrolling region ───────────────────── */}
      <div
        className="flex-1 min-h-0 px-3"
        style={{
          marginTop: 10,
          opacity: step >= 2 ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          className="h-full flex flex-col overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '2px solid var(--ink-black)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 2px 0 0 var(--ink-black)',
          }}
        >
          {/* panel header */}
          <div className="shrink-0 flex items-center" style={{ gap: 8, padding: '9px 11px' }}>
            <span style={{ width: 4, height: 12, background: 'var(--amber)', borderRadius: 1, flexShrink: 0 }} />
            <span
              className="mr-auto"
              style={{ fontFamily: PIXEL, fontSize: 9.5, letterSpacing: 0.8, color: 'var(--cream)', textTransform: 'uppercase' }}
            >
              Durability Check
            </span>
            {hasAftermath && (
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.4 }}>
                {groups.reduce((n, g) => n + g.cards.length, 0)} AFFECTED
              </span>
            )}
          </div>

          {/* scroll body */}
          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ overscrollBehavior: 'contain', padding: '0 11px 11px' }}
          >
            {!hasAftermath ? (
              <div
                className="flex flex-col items-center justify-center text-center"
                style={{
                  minHeight: 120,
                  padding: 16,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border)',
                  background: 'rgba(0,0,0,0.18)',
                }}
              >
                <span style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--success)', letterSpacing: 0.5 }}>
                  SQUAD INTACT
                </span>
                <span style={{ fontSize: 11, color: 'var(--dust)', marginTop: 6, lineHeight: 1.4, maxWidth: 220 }}>
                  No shatters, no injuries — everyone came through ninety minutes unscathed.
                </span>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 12 }}>
                {groups.map(({ tone, cards }) => (
                  <AftermathGroup
                    key={tone.key}
                    tone={tone}
                    cards={cards}
                    onOpen={(card) => setModal({ variant: 'player', card })}
                  />
                ))}
              </div>
            )}

            {/* Commentary — secondary to the cards */}
            {commentary.length > 0 && (
              <div className="flex flex-col" style={{ gap: 5, marginTop: hasAftermath ? 12 : 14 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--dust)' }}>
                  REPORT
                </span>
                {commentary.map((line, i) => {
                  const t = lineTone(line);
                  return (
                    <div
                      key={i}
                      style={{
                        fontSize: 11,
                        lineHeight: 1.4,
                        color: t ? t.color : 'var(--cream-soft)',
                        background: t ? t.bg : 'rgba(0,0,0,0.2)',
                        border: `1px solid ${t ? t.color : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        padding: '7px 9px',
                        display: 'flex',
                        gap: 7,
                        alignItems: 'flex-start',
                      }}
                    >
                      {t && (
                        <span
                          style={{
                            fontFamily: PIXEL,
                            fontSize: 10,
                            color: t.color,
                            lineHeight: 1.2,
                            flexShrink: 0,
                          }}
                        >
                          {t.marker}
                        </span>
                      )}
                      <span>{line}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Continue CTA ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-3"
        style={{
          paddingTop: 10,
          opacity: step >= 3 ? 1 : 0,
          transform: step >= 3 ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
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
// Pieces
// ===========================================================================

/** A large scoreline digit; the winning side reads in --line-white, the loser dimmed. */
function ScoreNum({ value, win }: { value: number; win: boolean }) {
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: 44,
        lineHeight: 0.9,
        color: win ? 'var(--line-white)' : 'var(--cream-soft)',
        textShadow: win ? '0 3px 0 var(--ink-black)' : '0 2px 0 var(--ink-black)',
      }}
    >
      {value}
    </span>
  );
}

/** Economy stat tile: pixel label · big value · soft sub. */
function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        minHeight: 62,
        padding: '8px 6px',
        borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--ink-black)',
        background: 'var(--surface)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)' }}>
        {label.toUpperCase()}
      </span>
      <span
        className="truncate"
        style={{ fontFamily: PIXEL, fontSize: 16, lineHeight: 1.1, color, marginTop: 4, maxWidth: '100%' }}
      >
        {value}
      </span>
      <span style={{ fontSize: 8, color: 'var(--ink)', marginTop: 3, letterSpacing: 0.2 }}>{sub}</span>
    </div>
  );
}

/** A coloured group header + a grid of tappable GameCards for that fate. */
function AftermathGroup({
  tone,
  cards,
  onOpen,
}: {
  tone: GroupTone;
  cards: Card[];
  onOpen: (card: Card) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {/* group header chip */}
      <div className="flex items-center" style={{ gap: 7 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: PIXEL,
            fontSize: 9,
            letterSpacing: 0.6,
            color: tone.color,
            background: tone.bg,
            border: `1px solid ${tone.color}`,
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            lineHeight: 1,
          }}
        >
          <span style={{ fontSize: 10 }}>{tone.marker}</span>
          {tone.title.toUpperCase()}
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)' }}>×{cards.length}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* card grid */}
      <div className="grid grid-cols-3" style={{ gap: 8 }}>
        {cards.map((card, i) => (
          <GameCard
            key={card.id}
            model={{ variant: 'player', card }}
            onClick={() => onOpen(card)}
            delay={i * 50}
            ariaLabel={`${card.name} — ${tone.title}`}
          />
        ))}
      </div>
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
