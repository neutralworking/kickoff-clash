'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { PackContents } from '../lib/packs';
import type { Card } from '../lib/scoring';
import type { JokerCard } from '../lib/jokers';
import type { TacticCard } from '../lib/tactics';

// ---------------------------------------------------------------------------
// Props (unchanged — three stages happen internally)
// ---------------------------------------------------------------------------

interface PackRevealProps {
  contents: PackContents;
  onContinue: () => void;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const RARITY_COLOR: Record<string, string> = {
  Common: '#9aa0a8',
  Rare: '#3d7bd6',
  Epic: '#a855f7',
  Legendary: '#e8a23a',
};

const RARITY_FLASH: Record<string, string> = {
  Epic: 'rgba(168,85,247,0.55)',
  Legendary: 'rgba(232,162,58,0.6)',
};

const POSITION_COLORS: Record<string, string> = {
  GK: '#e8621a',
  CD: '#3d7bd6',
  WD: '#3d7bd6',
  DM: '#22c55e',
  CM: '#22c55e',
  WM: '#22c55e',
  AM: '#a855f7',
  WF: '#f59e0b',
  CF: '#e23b35',
};

const NATION_FLAG: Record<string, string> = {
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  France: '\u{1F1EB}\u{1F1F7}',
  Sweden: '\u{1F1F8}\u{1F1EA}',
  Portugal: '\u{1F1F5}\u{1F1F9}',
  Brazil: '\u{1F1E7}\u{1F1F7}',
  Germany: '\u{1F1E9}\u{1F1EA}',
};

function lastName(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1];
}

type Stage = 'players' | 'managers' | 'tactics';
type SubPhase = 'sealed' | 'ripping' | 'reveal';

interface StageMeta {
  key: Stage;
  index: number;
  packLabel: string;
  packSub: string;
  packAccent: string;
  teach: string;
}

const STAGE_META: Record<Stage, StageMeta> = {
  players: {
    key: 'players',
    index: 1,
    packLabel: 'PLAYER PACK',
    packSub: 'The squad',
    packAccent: 'var(--gold)',
    teach: 'These cards are your squad. You’ll pick 11 to take the pitch.',
  },
  managers: {
    key: 'managers',
    index: 2,
    packLabel: 'MANAGER PACK',
    packSub: 'The gaffers',
    packAccent: 'var(--kit-red)',
    teach: 'A gaffer shapes the whole team through their traits. You’ll pick one.',
  },
  tactics: {
    key: 'tactics',
    index: 3,
    packLabel: 'TACTICAL PACK',
    packSub: 'The playbook',
    packAccent: 'var(--kit-blue)',
    teach: 'Tactics are your in-match hand — drawn and played as the game unfolds.',
  },
};

// ===========================================================================
// Sealed pack — tap to rip
// ===========================================================================

function SealedPack({
  meta,
  count,
  countNoun,
  ripping,
  onRip,
}: {
  meta: StageMeta;
  count: number;
  countNoun: string;
  ripping: boolean;
  onRip: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center" style={{ width: 200, height: 264 }}>
        {/* tear flash */}
        {ripping && (
          <div
            className="pack-flash absolute"
            style={{
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, var(--cream) 0%, rgba(245,240,224,0.4) 40%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        )}

        <button
          onClick={onRip}
          disabled={ripping}
          aria-label={`Open ${meta.packLabel}`}
          className={ripping ? 'pack-rip' : 'pack-idle'}
          style={{
            position: 'relative',
            width: 168,
            height: 232,
            border: '3px solid var(--ink-black)',
            borderRadius: 'var(--radius-lg)',
            background: `linear-gradient(160deg, var(--leather-light) 0%, var(--leather) 55%, #0f0b08 100%)`,
            boxShadow: `0 0 0 2px ${meta.packAccent}, 0 14px 30px rgba(0,0,0,0.55)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            cursor: ripping ? 'default' : 'pointer',
            padding: 12,
          }}
        >
          {/* perforation strip */}
          <div
            style={{
              position: 'absolute',
              top: 30,
              left: 8,
              right: 8,
              height: 0,
              borderTop: '2px dashed rgba(245,240,224,0.25)',
            }}
          />
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: `3px solid ${meta.packAccent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-pixel, monospace)',
              fontSize: 16,
              fontWeight: 700,
              color: meta.packAccent,
              boxShadow: `inset 0 0 12px ${meta.packAccent}33`,
            }}
          >
            KC
          </div>
          <div
            style={{
              fontFamily: 'var(--font-pixel, monospace)',
              fontSize: 13,
              lineHeight: 1.5,
              letterSpacing: 0.5,
              color: 'var(--cream)',
              textAlign: 'center',
              textShadow: '0 2px 0 var(--ink-black)',
            }}
          >
            {meta.packLabel.split(' ')[0]}
            <br />
            {meta.packLabel.split(' ')[1]}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-pixel, monospace)',
              fontSize: 9,
              color: meta.packAccent,
              letterSpacing: 0.5,
            }}
          >
            {count} {countNoun}
          </div>
        </button>
      </div>

      {!ripping && (
        <div
          className="chip-reveal"
          style={{
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 10,
            letterSpacing: 1,
            color: 'var(--dust)',
            animationDelay: '120ms',
          }}
        >
          TAP TO TEAR OPEN
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Player sprite chip
// ===========================================================================

function PlayerChip({ card, delay }: { card: Card; delay: number }) {
  const rarity = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.Common;
  const posColor = POSITION_COLORS[card.position] ?? '#71717a';
  return (
    <div
      className="chip-reveal pixel-edge"
      style={{
        animationDelay: `${delay}ms`,
        background: 'linear-gradient(160deg, #16140f, #0d0b07)',
        border: `2px solid ${rarity}`,
        borderRadius: 'var(--radius-sm)',
        padding: '5px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 4 }}>
        <span
          style={{
            background: posColor,
            color: '#fff',
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 8,
            lineHeight: 1,
            padding: '3px 4px',
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          {card.position}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 13,
            lineHeight: 1,
            color: rarity,
          }}
        >
          {card.power}
        </span>
      </div>
      <span
        className="truncate"
        style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', lineHeight: 1.15 }}
      >
        {lastName(card.name)}
      </span>
      <span
        className="truncate"
        style={{ fontSize: 8.5, color: 'var(--dust)', letterSpacing: 0.2, lineHeight: 1 }}
      >
        {card.archetype}
      </span>
      <div style={{ height: 2, background: rarity, borderRadius: 2, marginTop: 1 }} />
    </div>
  );
}

// ===========================================================================
// Player stage reveal — paginated grid (3 cols × 5 rows = 15/page → 2 pages)
// ===========================================================================

const PLAYERS_PER_PAGE = 15;

function PlayerReveal({ players }: { players: Card[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(players.length / PLAYERS_PER_PAGE);
  const start = page * PLAYERS_PER_PAGE;
  const pageCards = players.slice(start, start + PLAYERS_PER_PAGE);

  // Rarity flash on first paint if the page holds an Epic/Legendary.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const best = pageCards.find((c) => c.rarity === 'Legendary') ?? pageCards.find((c) => c.rarity === 'Epic');
    if (best && page === 0) {
      setFlash(RARITY_FLASH[best.rarity] ?? null);
      const t = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {flash && (
        <div
          className="pack-rarity-flash"
          style={{ position: 'absolute', inset: 0, background: flash, zIndex: 30, pointerEvents: 'none' }}
        />
      )}

      <div
        key={page}
        className="flex-1 min-h-0 grid"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridAutoRows: 'min-content',
          gap: 7,
          alignContent: 'start',
        }}
      >
        {pageCards.map((c, i) => (
          <PlayerChip key={c.id} card={c} delay={i * 28} />
        ))}
      </div>

      {/* Pager */}
      <div className="flex items-center justify-center gap-3 shrink-0" style={{ paddingTop: 10 }}>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          aria-label="Previous page"
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--ink-black)',
            background: page === 0 ? 'rgba(255,255,255,0.04)' : 'var(--leather-light)',
            color: page === 0 ? 'var(--ink)' : 'var(--cream)',
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 14,
            cursor: page === 0 ? 'default' : 'pointer',
          }}
        >
          {'‹'}
        </button>
        <div className="flex items-center gap-2">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span
              key={i}
              style={{
                width: i === page ? 22 : 8,
                height: 8,
                borderRadius: 4,
                background: i === page ? 'var(--gold)' : 'rgba(245,240,224,0.25)',
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--ink-black)',
            background: page >= pageCount - 1 ? 'rgba(255,255,255,0.04)' : 'var(--leather-light)',
            color: page >= pageCount - 1 ? 'var(--ink)' : 'var(--cream)',
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 14,
            cursor: page >= pageCount - 1 ? 'default' : 'pointer',
          }}
        >
          {'›'}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Manager stage reveal — two gaffer cards
// ===========================================================================

function ManagerReveal({ managers }: { managers: JokerCard[] }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center gap-3">
      {managers.map((m, i) => (
        <div
          key={m.id}
          className="chip-reveal pixel-edge"
          style={{
            animationDelay: `${i * 120}ms`,
            background: 'linear-gradient(160deg, var(--leather-light), var(--leather))',
            border: '2px solid var(--kit-red)',
            borderRadius: 'var(--radius)',
            padding: 14,
            display: 'flex',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          {/* Gaffer sprite badge */}
          <div
            style={{
              flexShrink: 0,
              width: 60,
              height: 60,
              borderRadius: 'var(--radius-sm)',
              background: 'radial-gradient(circle at 50% 35%, #2a221a, #14100b)',
              border: '2px solid var(--ink-black)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              alignSelf: 'center',
            }}
          >
            {'\u{1F454}'}
          </div>

          <div className="flex flex-col min-w-0" style={{ gap: 5, flex: 1 }}>
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <span
                className="truncate"
                style={{
                  fontFamily: 'var(--font-pixel, monospace)',
                  fontSize: 13,
                  color: 'var(--cream)',
                  textShadow: '0 1px 0 var(--ink-black)',
                }}
              >
                {m.name}
              </span>
              {m.nation && (
                <span style={{ fontSize: 15, flexShrink: 0 }} title={m.nation}>
                  {NATION_FLAG[m.nation] ?? '\u{1F3F3}'}
                </span>
              )}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-flavour, serif)',
                fontStyle: 'italic',
                fontSize: 11.5,
                lineHeight: 1.3,
                color: 'var(--cream-soft)',
                margin: 0,
              }}
            >
              {'“'}{m.philosophy}{'”'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {m.traits.map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: 'var(--font-pixel, monospace)',
                    fontSize: 8,
                    letterSpacing: 0.3,
                    color: 'var(--kit-red)',
                    background: 'rgba(226,59,53,0.14)',
                    border: '1px solid rgba(226,59,53,0.4)',
                    borderRadius: 4,
                    padding: '4px 6px',
                    lineHeight: 1,
                  }}
                >
                  {t.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Tactics stage reveal — grid of tactic cards
// ===========================================================================

const TACTIC_CAT_COLOR: Record<string, string> = {
  attacking: 'var(--kit-red)',
  defensive: 'var(--kit-blue)',
  specialist: 'var(--gold)',
};

function TacticReveal({ tactics }: { tactics: TacticCard[] }) {
  return (
    <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gridAutoRows: '1fr', gap: 8 }}>
      {tactics.map((t, i) => {
        const accent = TACTIC_CAT_COLOR[t.category] ?? 'var(--gold)';
        return (
          <div
            key={t.id}
            className="chip-reveal pixel-edge"
            style={{
              animationDelay: `${i * 35}ms`,
              background: 'linear-gradient(160deg, #16140f, #0d0b07)',
              border: `2px solid var(--ink-black)`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 'var(--radius-sm)',
              padding: '8px 9px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <span
              className="truncate"
              style={{
                fontFamily: 'var(--font-pixel, monospace)',
                fontSize: 10,
                color: 'var(--cream)',
                lineHeight: 1.2,
              }}
            >
              {t.name}
            </span>
            <span
              style={{
                fontSize: 9,
                lineHeight: 1.3,
                color: 'var(--dust)',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {t.effect}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export default function PackReveal({ contents, onContinue }: PackRevealProps) {
  const [stage, setStage] = useState<Stage>('players');
  const [phase, setPhase] = useState<SubPhase>('sealed');
  const ripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Players sorted strongest-first so pulls feel rewarding (display only).
  const sortedPlayers = useMemo(
    () => [...contents.players].sort((a, b) => b.power - a.power),
    [contents.players],
  );

  const meta = STAGE_META[stage];

  useEffect(() => () => { if (ripTimer.current) clearTimeout(ripTimer.current); }, []);

  function rip() {
    if (phase !== 'sealed') return;
    setPhase('ripping');
    ripTimer.current = setTimeout(() => setPhase('reveal'), 560);
  }

  function advanceStage() {
    if (stage === 'players') {
      setStage('managers');
      setPhase('sealed');
    } else if (stage === 'managers') {
      setStage('tactics');
      setPhase('sealed');
    } else {
      onContinue();
    }
  }

  const count =
    stage === 'players' ? contents.players.length : stage === 'managers' ? contents.managers.length : contents.tactics.length;
  const countNoun = stage === 'players' ? 'players' : stage === 'managers' ? 'gaffers' : 'tactics';

  const continueLabel = stage === 'tactics' ? 'Pick Your Team →' : 'Next Pack →';

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        background: 'var(--felt)',
        paddingTop: 'max(env(safe-area-inset-top), 14px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
        paddingLeft: 14,
        paddingRight: 14,
      }}
    >
      {/* Subtle mown-pitch wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 22%, rgba(45,138,78,0.16) 0%, transparent 55%)',
        }}
      />

      {/* Header: stage progress + title */}
      <div className="shrink-0 relative" style={{ zIndex: 2 }}>
        <div className="flex items-center justify-center gap-2" style={{ marginBottom: 8 }}>
          {(['players', 'managers', 'tactics'] as Stage[]).map((s) => {
            const active = STAGE_META[s].index === meta.index;
            const done = STAGE_META[s].index < meta.index;
            return (
              <span
                key={s}
                style={{
                  width: active ? 26 : 9,
                  height: 9,
                  borderRadius: 5,
                  background: active
                    ? STAGE_META[s].packAccent
                    : done
                      ? 'rgba(245,240,224,0.5)'
                      : 'rgba(245,240,224,0.18)',
                  transition: 'all 0.3s ease',
                }}
              />
            );
          })}
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 17,
            letterSpacing: 0.5,
            color: 'var(--cream)',
            textShadow: '0 2px 0 var(--ink-black)',
            margin: 0,
          }}
        >
          {meta.packLabel}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: 'var(--font-pixel, monospace)',
            fontSize: 9,
            letterSpacing: 1,
            color: meta.packAccent,
            marginTop: 4,
          }}
        >
          PACK {meta.index} / 3 {'·'} {meta.packSub.toUpperCase()}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col relative" style={{ zIndex: 2, marginTop: 12, marginBottom: 10 }}>
        {phase !== 'reveal' ? (
          <SealedPack meta={meta} count={count} countNoun={countNoun} ripping={phase === 'ripping'} onRip={rip} />
        ) : stage === 'players' ? (
          <PlayerReveal players={sortedPlayers} />
        ) : stage === 'managers' ? (
          <ManagerReveal managers={contents.managers} />
        ) : (
          <TacticReveal tactics={contents.tactics} />
        )}
      </div>

      {/* Teaching line + continue (only after reveal) */}
      <div className="shrink-0 relative" style={{ zIndex: 2 }}>
        {phase === 'reveal' && (
          <>
            <div
              className="chip-reveal"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(245,240,224,0.12)',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 12px',
                marginBottom: 10,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>{'\u{1F4A1}'}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.35, color: 'var(--cream-soft)' }}>{meta.teach}</span>
            </div>
            <button
              onClick={advanceStage}
              className="w-full active:scale-95"
              style={{
                fontFamily: 'var(--font-pixel, monospace)',
                fontSize: 14,
                letterSpacing: 0.5,
                color: 'var(--cream)',
                padding: '15px 0',
                borderRadius: 'var(--radius)',
                border: '2px solid var(--ink-black)',
                background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
                boxShadow: '0 4px 0 0 var(--ink-black), 0 6px 18px var(--amber-glow)',
                transition: 'transform 0.12s ease',
                cursor: 'pointer',
              }}
            >
              {continueLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
