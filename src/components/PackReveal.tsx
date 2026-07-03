'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { PackContents } from '../lib/packs';
import type { Card } from '../lib/scoring';
import type { JokerCard } from '../lib/jokers';
import type { TacticCard } from '../lib/tactics';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';

// ---------------------------------------------------------------------------
// Props — three stages happen internally. onContinue now surfaces the picked
// manager so GameShell can carry it into TeamSelect (pre-filled gaffer chip).
// ---------------------------------------------------------------------------

interface PackRevealProps {
  contents: PackContents;
  onContinue: (managerId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const RARITY_FLASH: Record<string, string> = {
  Epic: 'rgba(168,85,247,0.55)',
  Legendary: 'rgba(232,162,58,0.6)',
};

const PIXEL = 'var(--font-pixel, monospace)';

type Stage = 'players' | 'managers' | 'tactics';
type SubPhase = 'sealed' | 'ripping' | 'reveal';

interface StageMeta {
  key: Stage;
  index: number;
  packLabel: string;
  /** The named tagline shown under the title (was the generic category "The squad"). */
  packSub: string;
  packAccent: string;
  /** Short header above the revealed cards, framing the pick (fills the dead zone). */
  cardsHeader: string;
  /** Bottom teach pill — the tactile "tap to …" instruction. */
  teach: string;
}

const STAGE_META: Record<Stage, StageMeta> = {
  players: {
    key: 'players',
    index: 1,
    packLabel: 'PLAYER PACK',
    packSub: 'The squad',
    packAccent: 'var(--gold)',
    cardsHeader: 'YOUR SQUAD',
    teach: 'Tap any card to inspect it. Next up: the manager pack.',
  },
  managers: {
    key: 'managers',
    index: 2,
    packLabel: 'MANAGER PACK',
    packSub: 'The managers',
    packAccent: 'var(--kit-red)',
    cardsHeader: 'PICK 1 OF 2',
    teach: 'A manager shapes the whole team through their effect. Tap to inspect, then pick one.',
  },
  tactics: {
    key: 'tactics',
    index: 3,
    packLabel: 'TACTICAL PACK',
    packSub: 'The playbook',
    packAccent: 'var(--kit-blue)',
    cardsHeader: 'YOUR IN-MATCH HAND',
    teach: 'Tactics are your in-match hand — drawn and played as the game unfolds. Tap to inspect.',
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
              background: 'radial-gradient(circle, var(--line-white) 0%, rgba(255,250,240,0.4) 40%, transparent 70%)',
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
            background: `linear-gradient(160deg, var(--surface-raised) 0%, var(--surface) 55%, var(--felt) 100%)`,
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
              borderTop: '2px dashed rgba(26,17,8,0.22)',
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
              fontFamily: PIXEL,
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
              fontFamily: PIXEL,
              fontSize: 12,
              lineHeight: 1.5,
              letterSpacing: 0.5,
              color: 'var(--cream)',
              textAlign: 'center',
              textShadow: '0 2px 0 var(--ink-black)',
              padding: '0 4px',
            }}
          >
            {meta.packLabel}
          </div>
          <div
            style={{
              fontFamily: PIXEL,
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
            fontFamily: PIXEL,
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
// Player stage reveal — paginated grid of player GameCards (8/page → 4 pages)
// ===========================================================================

const PLAYERS_PER_PAGE = 8;

function PlayerReveal({ players, onOpen }: { players: Card[]; onOpen: (c: Card) => void }) {
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

      {/* Grid + pager sit directly under the run-context strip (top-aligned), so the
          squad reads as one block from the top and leftover space falls to the bottom
          above the CTA — no floating island / dead zone. */}
      <div className="flex-1 min-h-0 flex flex-col justify-start" style={{ gap: 12, paddingTop: 4 }}>
        <div
          key={page}
          className="grid shrink-0"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridAutoRows: 'min-content',
            gap: 8,
          }}
        >
          {pageCards.map((c, i) => (
            <GameCard
              key={c.id}
              model={{ variant: 'player', card: c }}
              delay={i * 28}
              onClick={() => onOpen(c)}
              ariaLabel={`Inspect ${c.name}`}
            />
          ))}
        </div>

        {/* Pager */}
        <div className="flex items-center justify-center gap-3 shrink-0">
        <PagerBtn dir="prev" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />
        <div className="flex items-center gap-2">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span
              key={i}
              style={{
                width: i === page ? 22 : 8,
                height: 8,
                borderRadius: 4,
                background: i === page ? 'var(--gold)' : 'rgba(26,17,8,0.20)',
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>
        <PagerBtn dir="next" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} />
        </div>
      </div>
    </div>
  );
}

function PagerBtn({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous page' : 'Next page'}
      style={{
        width: 40,
        height: 40,
        borderRadius: 'var(--radius-sm)',
        border: '2px solid var(--ink-black)',
        background: disabled ? 'rgba(26,17,8,0.05)' : 'var(--surface-raised)',
        color: disabled ? 'var(--ink)' : 'var(--cream)',
        fontFamily: PIXEL,
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

// ===========================================================================
// Manager stage reveal — two gaffer GameCards, tap to inspect, pick one
// ===========================================================================

function ManagerReveal({
  managers,
  pickedId,
  onOpen,
  onPick,
}: {
  managers: JokerCard[];
  pickedId: string | null;
  onOpen: (m: JokerCard) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-start" style={{ paddingTop: 4 }}>
      <div
        className="grid mx-auto w-full"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, alignContent: 'start', maxWidth: 340 }}
      >
        {managers.map((m, i) => {
          const picked = pickedId === m.id;
          return (
            <div key={m.id} className="flex flex-col" style={{ gap: 8, minWidth: 0 }}>
              <GameCard
                model={{ variant: 'manager', manager: m }}
                delay={i * 120}
                selected={picked}
                onClick={() => onOpen(m)}
                ariaLabel={`Inspect ${m.name}`}
              />
              <button
                onClick={() => onPick(m.id)}
                className="active:scale-95"
                style={{
                  fontFamily: PIXEL,
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: picked ? 'var(--ink-black)' : 'var(--cream)',
                  padding: '10px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: '2px solid var(--ink-black)',
                  background: picked
                    ? 'linear-gradient(135deg, var(--kit-red), #b62520)'
                    : 'var(--surface)',
                  boxShadow: picked
                    ? '0 3px 0 0 var(--ink-black), 0 5px 14px rgba(232,54,47,0.4)'
                    : '0 3px 0 0 var(--ink-black)',
                  transition: 'transform 0.12s ease',
                  cursor: 'pointer',
                }}
              >
                {picked ? 'PICKED ✓' : 'PICK MANAGER'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Tactics stage reveal — grid of tactic GameCards
// ===========================================================================

function TacticReveal({ tactics, onOpen }: { tactics: TacticCard[]; onOpen: (t: TacticCard) => void }) {
  return (
    <div
      className="flex-1 min-h-0 grid overflow-y-auto"
      style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gridAutoRows: 'min-content', gap: 8, alignContent: 'start', paddingTop: 4, overscrollBehavior: 'contain' }}
    >
      {tactics.map((t, i) => (
        <GameCard
          key={t.id}
          model={{ variant: 'tactic', tactic: t }}
          delay={i * 35}
          onClick={() => onOpen(t)}
          ariaLabel={`Inspect ${t.name}`}
        />
      ))}
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export default function PackReveal({ contents, onContinue }: PackRevealProps) {
  const [stage, setStage] = useState<Stage>('players');
  const [phase, setPhase] = useState<SubPhase>('sealed');
  const [pickedManagerId, setPickedManagerId] = useState<string | null>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);
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
      onContinue(pickedManagerId);
    }
  }

  const count =
    stage === 'players' ? contents.players.length : stage === 'managers' ? contents.managers.length : contents.tactics.length;
  const countNoun = stage === 'players' ? 'players' : stage === 'managers' ? 'managers' : 'tactics';

  // On the manager stage the continue button is gated on a pick.
  const managerGated = stage === 'managers' && pickedManagerId === null;
  const continueLabel =
    stage === 'tactics' ? 'Pick Your Team →' : stage === 'managers' ? (managerGated ? 'Pick a Manager' : 'Next Pack →') : 'Next Pack →';

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
            'radial-gradient(ellipse at 50% 22%, rgba(31,157,79,0.10) 0%, transparent 55%)',
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
                      ? 'rgba(26,17,8,0.45)'
                      : 'rgba(26,17,8,0.16)',
                  transition: 'all 0.3s ease',
                }}
              />
            );
          })}
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: PIXEL,
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
            fontFamily: PIXEL,
            fontSize: 9,
            letterSpacing: 1,
            color: meta.packAccent,
            marginTop: 4,
          }}
        >
          PACK {meta.index} / 3
        </p>
        <p
          className="text-center"
          style={{
            fontFamily: 'var(--font-flavour)',
            fontStyle: 'italic',
            fontSize: 12,
            letterSpacing: 0.2,
            color: 'var(--cream)',
            opacity: 0.62,
            marginTop: 3,
          }}
        >
          {meta.packSub}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col relative" style={{ zIndex: 2, marginTop: 10, marginBottom: 10 }}>
        {phase !== 'reveal' ? (
          <SealedPack meta={meta} count={count} countNoun={countNoun} ripping={phase === 'ripping'} onRip={rip} />
        ) : (
          <>
            {/* Run-context strip — PLAYER pack only. Pinned above the grid, matching
                the bottom hint pill: the starting draft is random and the lineup is
                improved in the shop (players can be bought and sold). */}
            {stage === 'players' && (
              <div
                className="chip-reveal glass-surface shrink-0 relative overflow-hidden"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(245,197,66,0.35)',
                  boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), 0 0 10px rgba(245,197,66,0.14), var(--depth-1)',
                  padding: '8px 11px',
                  marginBottom: 8,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span className="relative" style={{ fontSize: 15, flexShrink: 0, zIndex: 2 }}>{'\u{1F4A1}'}</span>
                <span className="relative flex flex-col" style={{ zIndex: 2, minWidth: 0 }}>
                  <span style={{ fontFamily: PIXEL, fontSize: 9.5, letterSpacing: 0.3, color: 'var(--gold)', lineHeight: 1.35 }}>
                    {count} players, drawn at random.
                  </span>
                  <span style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--cream-soft)', marginTop: 2 }}>
                    Pick your team from them — and buy, sell or improve your lineup in the store.
                  </span>
                </span>
              </div>
            )}

            {/* Card header — a small pixel kicker so managers/tactics stop looking
                empty and the pick is framed. */}
            {stage !== 'players' && (
              <div className="chip-reveal shrink-0 flex items-center justify-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 16, height: 2, borderRadius: 1, background: meta.packAccent, opacity: 0.55 }} />
                <span style={{ fontFamily: PIXEL, fontSize: 10, letterSpacing: 1.5, color: meta.packAccent }}>
                  {meta.cardsHeader}
                </span>
                <span style={{ width: 16, height: 2, borderRadius: 1, background: meta.packAccent, opacity: 0.55 }} />
              </div>
            )}

            {stage === 'players' ? (
              <PlayerReveal players={sortedPlayers} onOpen={(c) => setModal({ variant: 'player', card: c })} />
            ) : stage === 'managers' ? (
              <ManagerReveal
                managers={contents.managers}
                pickedId={pickedManagerId}
                onOpen={(m) => setModal({ variant: 'manager', manager: m })}
                onPick={(id) => setPickedManagerId(id)}
              />
            ) : (
              <TacticReveal tactics={contents.tactics} onOpen={(t) => setModal({ variant: 'tactic', tactic: t })} />
            )}
          </>
        )}
      </div>

      {/* Teaching line + continue (only after reveal) */}
      <div className="shrink-0 relative" style={{ zIndex: 2 }}>
        {phase === 'reveal' && (
          <>
            <div
              className="chip-reveal"
              style={{
                background: 'rgba(26,17,8,0.05)',
                border: '1px solid rgba(26,17,8,0.14)',
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
              disabled={managerGated}
              className={managerGated ? '' : 'w-full active:scale-95'}
              style={{
                width: '100%',
                fontFamily: PIXEL,
                fontSize: 14,
                letterSpacing: 0.5,
                color: managerGated ? 'var(--ink)' : 'var(--cream)',
                padding: '15px 0',
                borderRadius: 'var(--radius)',
                border: '2px solid var(--ink-black)',
                background: managerGated
                  ? 'var(--surface)'
                  : 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
                boxShadow: managerGated
                  ? '0 4px 0 0 var(--ink-black)'
                  : '0 4px 0 0 var(--ink-black), 0 6px 18px var(--amber-glow)',
                transition: 'transform 0.12s ease',
                cursor: managerGated ? 'default' : 'pointer',
              }}
            >
              {continueLabel}
            </button>
          </>
        )}
      </div>

      {/* Full-card overlay */}
      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}
