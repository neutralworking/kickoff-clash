'use client';

/**
 * Kickoff Clash — PostMatch (full-time report).
 *
 * v1 permadeath: a single LOSS ends the run and routes straight to the end
 * screen — so THIS screen is only ever reached after a WIN or a DRAW. It is the
 * "you got the result — on to the shop" beat.
 *
 * House style: near-black felt, gold chrome + green (win) / gold (draw) result
 * accent, Silkscreen pixel headers (PIXEL), DM Sans body, crisp pixel content.
 * The page NEVER scrolls: a fixed result header + tab bar + fixed CONTINUE
 * footer bracket one summary body that fills the slack and scrolls internally.
 * Fitness, durability and the legacy Contest report do not belong to V8.
 *
 * Everything is driven by the real engine props — no example copy.
 */

import { useState } from 'react';
import type { Card } from '../lib/scoring';
import type { MatchVerdict, VerdictFactor } from '../lib/match-v5';
import { cupSize } from '../lib/run';
import type { GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL, formatCash } from './cards/cardTokens';
import { portraitSrc, portraitDataUri } from './cards/portrait';

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
    /** Why the match went the way it did — engine-computed (match-v5). Absent on
     *  saves recorded before the verdict existed; render nothing then. */
    verdict?: MatchVerdict;
  };
  // --- Run context (one-life arc) — passed from GameShell ----------------------
  round: number;          // the CUP just played in (1–5)
  matchInCup: number;     // the tie within the cup that was just played
  totalRounds: number;    // number of cups in a run (5)
  /** Player of the match — top-rated XI card + its match line (engine
   *  playerMatchStats). Null if unavailable (old save / 0-increment edge). */
  playerOfMatch?: { card: Card; goals: number; assists: number; rating: number } | null;
  onContinue: () => void;
}

// Per-result presentation: accent colour + hero word + full-time verb.
type ResultKey = PostMatchProps['matchResult']['result'];
const RESULT_META: Record<ResultKey, { label: string; word: string; color: string }> = {
  win: { label: 'WIN', word: 'VICTORY', color: 'var(--success)' },
  draw: { label: 'DRAW', word: 'STALEMATE', color: 'var(--gold)' },
  loss: { label: 'LOSS', word: 'DEFEAT', color: 'var(--danger)' },
};

export default function PostMatch({
  matchResult,
  round,
  matchInCup,
  totalRounds,
  playerOfMatch,
  onContinue,
}: PostMatchProps) {
  const [modal, setModal] = useState<GameCardModel | null>(null);

  const meta = RESULT_META[matchResult.result];

  const ties = cupSize(round);
  const verdict = matchResult.verdict;
  // The factors ranked by absolute impact — the strongest reason first.
  const rankedFactors = verdict
    ? [...verdict.factors].sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))
    : [];

  return (
    <div
      className="phase-postmatch flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {/* ── Result header: cup/tie · scoreline · result verb ─────────────── */}
      <div className="shrink-0 px-3">
        <div
          className="glass-raised sheen relative overflow-hidden"
          style={{
            borderRadius: 'var(--radius)',
            border: '1px solid var(--glass-border)',
            boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 18px ${meta.color}2e, var(--depth-2)`,
            padding: '9px 14px 11px',
          }}
        >
          {/* result-tinted glow wash behind the verdict */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 130%, ${meta.color}24 0%, transparent 62%)`,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          {/* accent rail in the result colour */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: meta.color, boxShadow: `0 0 8px ${meta.color}`, zIndex: 2 }} />

          {/* Cup / tie context line */}
          <div className="relative flex justify-center" style={{ zIndex: 2 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 1.4, color: 'var(--dust)' }}>
              CUP {round}/{totalRounds} {'·'} TIE {matchInCup}/{ties}
            </span>
          </div>

          {/* YOUR XI  ·  goals – goals  ·  OPPONENT */}
          <div className="relative flex items-center justify-center" style={{ gap: 12, marginTop: 4, zIndex: 2 }}>
            <span className="text-right" style={{ flex: 1, fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.6, color: 'var(--cream-soft)' }}>
              YOUR XI
            </span>
            <span className="flex items-baseline shrink-0" style={{ gap: 8 }}>
              <ScoreNum value={matchResult.yourGoals} lit={matchResult.result === 'win'} />
              <span style={{ fontFamily: PIXEL, fontSize: 20, color: 'var(--ink)', lineHeight: 1 }}>{'–'}</span>
              <ScoreNum value={matchResult.opponentGoals} lit={false} />
            </span>
            <span className="truncate" style={{ flex: 1, fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.6, color: 'var(--cream-soft)', textTransform: 'uppercase' }}>
              {matchResult.opponentName}
            </span>
          </div>

          {/* Result line: — WIN · VICTORY — */}
          <div className="relative flex items-center justify-center" style={{ gap: 8, marginTop: 6, zIndex: 2 }}>
            <span style={{ width: 16, height: 2, background: meta.color, opacity: 0.5, borderRadius: 1 }} />
            <span style={{ fontFamily: PIXEL, fontSize: 11, letterSpacing: 1, color: meta.color, textShadow: `0 0 10px ${meta.color}66` }}>
              {meta.label} {'·'} {meta.word}
            </span>
            <span style={{ width: 16, height: 2, background: meta.color, opacity: 0.5, borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* ── V8 summary — the ONLY region that may scroll ─────────────────── */}
      <div className="flex-1 min-h-0 px-3" style={{ marginTop: 10 }}>
        <SummaryTab
          matchResult={matchResult}
          meta={meta}
          round={round}
          matchInCup={matchInCup}
          ties={ties}
          topFactor={rankedFactors[0] ?? null}
          playerOfMatch={playerOfMatch ?? null}
          onOpen={(card) => setModal({ variant: 'player', card })}
        />
      </div>

      {/* ── Continue CTA ─────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3" style={{ paddingTop: 10 }}>
        <button
          onClick={onContinue}
          className="sheen-strong glow-edge w-full active:scale-[0.99] advance-btn-pulse relative overflow-hidden"
          style={{
            height: 52,
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            background: 'linear-gradient(180deg, var(--gold) 0%, #c8901f 100%)',
            boxShadow:
              'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)',
            fontFamily: PIXEL,
            fontSize: 14,
            letterSpacing: 0.8,
            color: 'var(--ink-black)',
            textTransform: 'uppercase',
            ['--glow' as string]: 'var(--gold-glow)',
          }}
        >
          <span className="relative" style={{ zIndex: 2 }}>
            Continue to Shop {'→'}
          </span>
        </button>
      </div>

      {/* Single CardModal mounted at root (renders absolute inset-0). */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}

// ===========================================================================
// SUMMARY TAB — the hero: trophy + result word + narrative, the decisive
// tactical insight, the player of the match, and a reward / cup strip.
// ===========================================================================

function SummaryTab({
  matchResult,
  meta,
  round,
  matchInCup,
  ties,
  topFactor,
  playerOfMatch,
  onOpen,
}: {
  matchResult: PostMatchProps['matchResult'];
  meta: { label: string; word: string; color: string };
  round: number;
  matchInCup: number;
  ties: number;
  topFactor: VerdictFactor | null;
  playerOfMatch: { card: Card; goals: number; assists: number; rating: number } | null;
  onOpen: (card: Card) => void;
}) {
  const margin = matchResult.yourGoals - matchResult.opponentGoals;
  const subTag = resultSubTag(matchResult.result, margin, matchResult.yourGoals);

  return (
    <div
      key="summary"
      className="h-full overflow-y-auto stats-rise"
      style={{ overscrollBehavior: 'contain' }}
    >
      <div className="flex flex-col" style={{ gap: 10, paddingBottom: 4 }}>
        {/* (1) Result hero — trophy, big result word, sub-tag, narrative. */}
        <div
          className="glass-raised sheen relative overflow-hidden flex flex-col items-center text-center"
          style={{
            borderRadius: 'var(--radius)',
            border: '1px solid var(--glass-border)',
            boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 20px ${meta.color}26, var(--depth-2)`,
            padding: '18px 16px 16px',
          }}
        >
          {/* stadium-glow backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 4%, ${meta.color}30 0%, transparent 58%)`, pointerEvents: 'none', zIndex: 0 }}
          />

          <div className="relative" style={{ zIndex: 2 }}>
            <TrophyShield accent={meta.color} size={58} />
          </div>

          <span
            className="relative score-pop"
            style={{
              zIndex: 2,
              marginTop: 10,
              fontFamily: PIXEL,
              fontSize: meta.word.length > 8 ? 30 : 40,
              letterSpacing: 1.5,
              lineHeight: 1,
              color: meta.color,
              textShadow: `0 3px 0 var(--ink-black), 0 0 24px ${meta.color}`,
            }}
          >
            {meta.word}
          </span>

          <span
            className="relative"
            style={{
              zIndex: 2,
              marginTop: 8,
              fontFamily: PIXEL,
              fontSize: 8.5,
              letterSpacing: 1.2,
              color: 'var(--cream-soft)',
              background: `${meta.color}1c`,
              border: `1px solid ${meta.color}66`,
              borderRadius: 'var(--radius-sm)',
              padding: '4px 9px',
              lineHeight: 1,
            }}
          >
            {subTag}
          </span>

          {matchResult.verdict && (
            <span
              className="relative"
              style={{ zIndex: 2, marginTop: 11, fontSize: 12.5, lineHeight: 1.5, color: 'var(--cream-soft)', maxWidth: 300 }}
            >
              {matchResult.verdict.headline}
            </span>
          )}
        </div>

        {/* (2) Tactical insight — the single most decisive verdict factor. */}
        {topFactor && <InsightCard factor={topFactor} accent={meta.color} />}

        {/* (3) Player of the match. */}
        {playerOfMatch && <PlayerOfMatch pom={playerOfMatch} accent={meta.color} onOpen={onOpen} />}

        {/* (4) Reward / cup progress strip. */}
        <div
          className="glass-raised sheen relative overflow-hidden grid"
          style={{
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
            padding: '12px 8px',
          }}
        >
          <StripCell
            label="Reward"
            divider={false}
            value={<span style={{ fontFamily: PIXEL, fontSize: 17, color: 'var(--gold)' }}>{formatCash(matchResult.revenue)}</span>}
          />
          <StripCell
            label="Cup Progress"
            divider
            value={
              <span className="flex items-center justify-center" style={{ gap: 5 }}>
                <TrophyShield accent="var(--gold)" size={13} />
                <span style={{ fontFamily: PIXEL, fontSize: 15, color: 'var(--cream)' }}>
                  {matchInCup}/{ties}
                </span>
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}

/** Derive the result sub-tag from the goal margin. */
function resultSubTag(result: ResultKey, margin: number, yourGoals: number): string {
  if (result === 'draw') return yourGoals === 0 ? 'GOALLESS DRAW' : 'HARD-FOUGHT DRAW';
  if (result === 'loss') return 'DEFEAT';
  if (margin >= 3) return 'COMFORTABLE WIN';
  if (margin === 1) return 'NARROW WIN';
  return 'SOLID WIN';
}

/** The single decisive verdict factor as a tactical-insight card. */
function InsightCard({ factor, accent }: { factor: VerdictFactor; accent: string }) {
  const tone = factorTone(factor.swing);
  return (
    <div
      className="glass-raised sheen relative overflow-hidden flex items-start"
      style={{
        gap: 11,
        borderRadius: 'var(--radius)',
        border: '1px solid var(--glass-border)',
        boxShadow: `inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)`,
        padding: '11px 12px',
      }}
    >
      {/* icon tile — a tactics/arrow motif */}
      <span
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 'var(--radius-sm)',
          background: `${accent}18`,
          border: `1px solid ${accent}66`,
          boxShadow: `inset 0 1px 0 0 var(--glass-highlight)`,
        }}
      >
        <TacticsGlyph accent={accent} size={22} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center" style={{ gap: 6 }}>
          <span className="mr-auto truncate" style={{ fontFamily: PIXEL, fontSize: 9.5, letterSpacing: 0.6, color: 'var(--cream)', textTransform: 'uppercase' }}>
            {factor.label}
          </span>
          <SwingChip factor={factor} />
          <span style={{ color: 'var(--dust)', fontSize: 13, lineHeight: 1 }}>{'›'}</span>
        </div>
        <p style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{factor.detail}</p>
      </div>

      <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: tone, opacity: 0.7 }} />
    </div>
  );
}

/** Player of the match — portrait + surname + match line. */
function PlayerOfMatch({
  pom,
  accent,
  onOpen,
}: {
  pom: { card: Card; goals: number; assists: number; rating: number };
  accent: string;
  onOpen: (card: Card) => void;
}) {
  const { card, goals, assists, rating } = pom;
  return (
    <button
      onClick={() => onOpen(card)}
      className="glass-raised sheen relative overflow-hidden flex items-center w-full text-left active:scale-[0.99]"
      style={{
        gap: 12,
        borderRadius: 'var(--radius)',
        border: '1px solid var(--glass-border)',
        boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 16px var(--gold-glow), var(--depth-1)`,
        padding: '11px 12px',
      }}
    >
      <Portrait64 card={card} accent={accent} />
      <div className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontFamily: PIXEL, fontSize: 13, color: 'var(--cream)' }}>
          {surname(card.name)}
        </span>
        <span className="block" style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1, color: 'var(--gold)', marginTop: 3 }}>
          PLAYER OF THE MATCH
        </span>
        <span className="block" style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 6 }}>
          {goals} {goals === 1 ? 'goal' : 'goals'} {'·'} {assists} {assists === 1 ? 'assist' : 'assists'} {'·'}{' '}
          <b style={{ color: 'var(--success)' }}>{rating} rating</b>
        </span>
      </div>
      <span style={{ color: 'var(--dust)', fontSize: 14, lineHeight: 1, paddingRight: 2 }}>{'›'}</span>
    </button>
  );
}

/** A compact 64px pixel portrait window, framed in the result accent. */
function Portrait64({ card, accent }: { card: Card; accent: string }) {
  const fallback = portraitDataUri(card.id ?? card.name);
  const [src, setSrc] = useState<string>(() => portraitSrc(card) ?? fallback);
  return (
    <span
      className="shrink-0 relative overflow-hidden"
      style={{
        width: 60,
        height: 60,
        borderRadius: 'var(--radius-sm)',
        border: `1.5px solid ${accent}`,
        boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 10px ${accent}44`,
        background: 'linear-gradient(180deg, #15231a 0%, #21472d 100%)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={card.name}
        onError={() => setSrc(fallback)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          imageRendering: 'pixelated',
        }}
      />
    </span>
  );
}

/** The signed-swing chip: `KEY ±N`, colour-coded for/against. */
function SwingChip({ factor }: { factor: VerdictFactor }) {
  const tone = factorTone(factor.swing);
  const n = Math.round(factor.swing * 10);
  const label = `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
  return (
    <span
      className="shrink-0"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: PIXEL,
        fontSize: 8,
        letterSpacing: 0.5,
        color: tone,
        background: tone === 'var(--dust)' ? 'rgba(154,139,106,0.12)' : `${tone}1f`,
        border: `1px solid ${tone}`,
        borderRadius: 'var(--radius-sm)',
        padding: '3px 6px',
        lineHeight: 1,
      }}
    >
      {factor.key.toUpperCase()}
      <span style={{ opacity: 0.85 }}>{label}</span>
    </span>
  );
}

// ===========================================================================
// Pieces
// ===========================================================================

/** For/against tone from a verdict factor's signed swing. Colour only. */
function factorTone(swing: number): string {
  if (swing > 0.05) return 'var(--success)';
  if (swing < -0.05) return 'var(--danger)';
  return 'var(--dust)';
}

/** One stat-strip cell (label over a value), with an optional left divider. */
function StripCell({ label, value, divider }: { label: string; value: React.ReactNode; divider: boolean }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ gap: 6, padding: '0 4px', borderLeft: divider ? '1px solid var(--glass-border)' : undefined }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: 'var(--dust)', textTransform: 'uppercase' }}>{label}</span>
      <span className="flex items-center justify-center" style={{ minHeight: 18 }}>{value}</span>
    </div>
  );
}

/** A large scoreline digit; the winning side reads full-ink, the other dimmed. */
function ScoreNum({ value, lit }: { value: number; lit: boolean }) {
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: 34,
        lineHeight: 0.9,
        color: lit ? 'var(--cream)' : 'var(--cream-soft)',
        textShadow: lit ? '0 3px 0 var(--ink-black)' : '0 2px 0 var(--ink-black)',
      }}
    >
      {value}
    </span>
  );
}

// ===========================================================================
// Pixel glyphs (crisp — box-pixels, no blur, no soft shadow on the pixels)
// ===========================================================================

/** A pixel trophy sitting on a shield, drawn as crisp rects. The shield reads in
 *  the result accent; the cup is gold, so it reads premium against any accent. */
function TrophyShield({ accent, size }: { accent: string; size: number }) {
  const cup = 'var(--gold)';
  // Shield silhouette: horizontal spans on a 16-wide grid (accent, semi-fill).
  const shield: [number, number, number][] = [
    [3, 0, 10],
    [2, 1, 12],
    [2, 2, 12],
    [2, 3, 12],
    [2, 4, 12],
    [2, 5, 12],
    [3, 6, 10],
    [3, 7, 10],
    [4, 8, 8],
    [5, 9, 6],
    [6, 10, 4],
    [7, 11, 2],
  ];
  // Trophy cup rects (gold).
  const trophy: [number, number, number, number][] = [
    [4, 1, 8, 1],   // rim
    [3, 2, 1, 2],   // left handle
    [12, 2, 1, 2],  // right handle
    [5, 2, 6, 2],   // bowl upper
    [6, 4, 4, 1],   // bowl taper
    [7, 5, 2, 1],   // stem
    [6, 6, 4, 1],   // base upper
    [5, 7, 6, 1],   // base foot
  ];
  return (
    <svg
      width={size}
      height={(size * 13) / 16}
      viewBox="0 0 16 13"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated', display: 'block', filter: `drop-shadow(0 0 6px ${accent}55)` }}
    >
      {shield.map(([x, y, w], i) => (
        <rect key={`s${i}`} x={x} y={y} width={w} height={1} fill={accent} opacity={0.28} />
      ))}
      {/* shield top-edge highlight */}
      <rect x={3} y={0} width={10} height={1} fill={accent} opacity={0.6} />
      {trophy.map(([x, y, w, h], i) => (
        <rect key={`t${i}`} x={x} y={y} width={w} height={h} fill={cup} />
      ))}
      {/* cup inner highlight */}
      <rect x={5} y={2} width={1} height={2} fill="#fff2b0" />
    </svg>
  );
}

/** A tactics-board arrow motif (a run + arrowhead), crisp pixel rects. */
function TacticsGlyph({ accent, size }: { accent: string; size: number }) {
  const rects: [number, number, number, number][] = [
    [1, 8, 2, 2],   // start node
    [3, 7, 2, 2],
    [5, 6, 2, 2],
    [7, 5, 2, 2],
    [9, 4, 2, 2],   // shaft
    [8, 2, 4, 2],   // arrowhead top
    [11, 2, 2, 4],  // arrowhead side
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges" style={{ imageRendering: 'pixelated', display: 'block' }}>
      {rects.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={accent} />
      ))}
    </svg>
  );
}

// ===========================================================================
// Utils
// ===========================================================================

/** The player's surname (last whitespace-delimited token). */
function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}
