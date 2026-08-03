'use client';

/**
 * V1 starter opening: manager first, one grouped player reveal, then the
 * initial 18-card active-deck overview.
 *
 * Tactic cards are intentionally absent. The callback keeps its legacy second
 * argument only while GameShell is migrated; a non-matching sentinel makes the
 * existing adapter carry zero tactics into the run.
 */

import { useMemo, useState } from 'react';
import type { PackContents } from '../lib/packs';
import type { Card } from '../lib/scoring';
import type { JokerCard } from '../lib/jokers';
import { managerFormationsV1 } from '../lib/manager-v1';
import {
  ACTIVE_DECK_SIZE,
  normaliseActiveDeckIds,
  saveActiveDeckIds,
} from '../lib/active-deck';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL } from './cards/cardTokens';
import ManagerCard from './manager-cards/ManagerCard';
import ManagerDossier from './manager-cards/ManagerDossier';
import TeamSelectionPlayerCard from './player-cards/TeamSelectionPlayerCard';

const NO_TACTIC_V1_ID = '__v1_no_tactic__';
const SCREEN_BG = 'radial-gradient(ellipse at 50% 16%, #18301f 0%, #0a0f0b 58%, #060806 100%)';
const GOLD = '#f5c542';
const BLUE = '#72b7ff';

const STAGES = ['manager', 'players', 'deck'] as const;
type Stage = typeof STAGES[number];
type Phase = 'sealed' | 'open';

const ANIMATION_CSS = `
@keyframes kcv1PackPulse {
  0%, 100% { transform: scale(1) rotate(-1.4deg); }
  50% { transform: scale(1.025) rotate(-1.4deg); }
}
@keyframes kcv1PackShimmer {
  0% { background-position: -180% 0; }
  100% { background-position: 260% 0; }
}
@keyframes kcv1Deal {
  from { opacity: 0; transform: translateY(14px) scale(.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .kcv1-pack, .kcv1-pack * { animation: none !important; }
}
`;

function SealedPack({
  label,
  count,
  accent,
  onOpen,
}: {
  label: string;
  count: string;
  accent: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center" style={{ gap: 'clamp(12px, 2.2dvh, 18px)' }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${label}`}
        style={{
          position: 'relative',
          width: 'clamp(154px, 46vw, 184px)',
          maxHeight: '40dvh',
          aspectRatio: '2 / 3',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          color: 'var(--cream)',
          background: 'linear-gradient(155deg, #2b1c10, #100805)',
          border: `3px solid ${accent}`,
          borderRadius: 14,
          boxShadow: `0 10px 24px rgba(0,0,0,.62), 0 0 26px ${accent}55`,
          cursor: 'pointer',
          animation: 'kcv1PackPulse 1.8s ease-in-out infinite',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: .42,
            background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.65) 48%, transparent 66%)',
            backgroundSize: '250% 100%',
            animation: 'kcv1PackShimmer 3.6s linear infinite',
          }}
        />
        <span style={{ position: 'relative', fontFamily: PIXEL, fontSize: 48, lineHeight: .9, transform: 'rotate(-10deg)', textShadow: '3px 3px 0 #000' }}>KC</span>
        <strong style={{ position: 'relative', fontFamily: PIXEL, fontSize: 10, letterSpacing: '.13em', color: accent }}>{label}</strong>
        <span style={{ position: 'relative', paddingInline: 8, fontFamily: PIXEL, fontSize: 7.5, lineHeight: 1.35, letterSpacing: '.08em', textAlign: 'center', color: 'var(--cream-soft)' }}>{count}</span>
      </button>
      <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: '.18em', color: 'var(--cream)' }}>TAP TO OPEN</span>
    </div>
  );
}

function PickButton({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="active:scale-95"
      style={{
        width: '100%',
        minHeight: 38,
        color: selected ? '#160d04' : 'var(--cream)',
        background: selected ? 'linear-gradient(180deg, #ffe49b, #c9922f)' : 'linear-gradient(180deg, #2d2416, #171006)',
        border: selected ? '2px solid #f0cb70' : '2px solid #070401',
        borderRadius: 7,
        boxShadow: '0 3px 0 #070401',
        fontFamily: PIXEL,
        fontSize: 7.5,
        lineHeight: 1.2,
        cursor: 'pointer',
      }}
    >
      {selected ? 'SELECTED ✓' : 'PICK MANAGER'}
    </button>
  );
}

function ManagerSelection({
  managers,
  pickedId,
  onPick,
  onInspect,
}: {
  managers: JokerCard[];
  pickedId: string | null;
  onPick: (id: string) => void;
  onInspect: (manager: JokerCard) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex items-center overflow-hidden" style={{ padding: '4px 0 8px' }}>
      <div
        className="flex w-full overflow-x-auto"
        style={{
          gap: 12,
          padding: '0 clamp(30px, 12vw, 50px) 8px',
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: '12vw',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {managers.map((manager, index) => {
          const selected = pickedId === manager.id;
          return (
            <article
              key={manager.id}
              className="flex flex-col"
              style={{
                minWidth: 0,
                flex: '0 0 clamp(230px, 68vw, 270px)',
                gap: 6,
                opacity: pickedId && !selected ? .54 : 1,
                animation: `kcv1Deal 280ms ease-out ${index * 70}ms both`,
                scrollSnapAlign: 'center',
              }}
            >
              <ManagerCard
                manager={manager}
                formations={managerFormationsV1(manager)}
                selected={selected}
                onClick={() => onInspect(manager)}
              />
              <PickButton selected={selected} onClick={() => onPick(manager.id)} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PlayerReveal({ players, onInspect }: { players: Card[]; onInspect: (card: Card) => void }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '4px 0 8px', overscrollBehavior: 'contain' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, alignItems: 'start' }}>
        {players.map((card, index) => (
          <div key={card.id} style={{ minWidth: 0, animation: `kcv1Deal 260ms ease-out ${index * 34}ms both` }}>
            <GameCard model={{ variant: 'player', card }} size="grid" onClick={() => onInspect(card)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function InitialDeckOverview({
  players,
  manager,
  onInspect,
}: {
  players: Card[];
  manager: JokerCard | null;
  onInspect: (card: Card) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ padding: '2px 0 6px' }}>
      <div
        className="shrink-0 flex items-center"
        style={{
          minHeight: 28,
          padding: '0 8px',
          marginBottom: 5,
          border: '1px solid rgba(245,197,66,.28)',
          borderRadius: 7,
          background: 'rgba(0,0,0,.24)',
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: '.08em', color: 'var(--dust)' }}>MANAGER</span>
        <strong className="truncate" style={{ marginLeft: 8, fontSize: 10, color: 'var(--cream)' }}>{manager?.name ?? 'SELECTED MANAGER'}</strong>
        <span style={{ marginLeft: 'auto', fontFamily: PIXEL, fontSize: 7, color: GOLD }}>{players.length}/{ACTIVE_DECK_SIZE}</span>
      </div>

      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
          gap: 4,
        }}
      >
        {Array.from({ length: ACTIVE_DECK_SIZE }).map((_, index) => {
          const card = players[index];
          return card ? (
            <button
              key={card.id}
              type="button"
              onClick={() => onInspect(card)}
              aria-label={`Inspect ${card.name}`}
              style={{
                minWidth: 0,
                padding: 0,
                border: 0,
                background: 'transparent',
                animation: `kcv1Deal 220ms ease-out ${index * 24}ms both`,
              }}
            >
              <TeamSelectionPlayerCard card={card} size="deck" />
            </button>
          ) : (
            <div
              key={`empty-${index}`}
              style={{
                minWidth: 0,
                aspectRatio: '2 / 3',
                border: '1px dashed rgba(245,197,66,.35)',
                borderRadius: 5,
                background: 'rgba(0,0,0,.18)',
              }}
            />
          );
        })}
      </div>

      <div
        className="shrink-0"
        style={{
          marginTop: 6,
          padding: '7px 9px',
          borderRadius: 7,
          background: 'rgba(245,197,66,.09)',
          border: '1px solid rgba(245,197,66,.24)',
          color: 'var(--cream-soft)',
          fontSize: 9.5,
          lineHeight: 1.3,
          textAlign: 'center',
        }}
      >
        These 18 players are your active deck. Pick the XI and seven substitutes next; you can edit the deck at any time.
      </div>
    </div>
  );
}

interface PackRevealProps {
  contents: PackContents;
  onContinue: (managerId: string | null, tacticId: string | null) => void;
}

export default function PackReveal({ contents, onContinue }: PackRevealProps) {
  const [stage, setStage] = useState<Stage>('manager');
  const [phase, setPhase] = useState<Phase>('sealed');
  const [pickedManagerId, setPickedManagerId] = useState<string | null>(null);
  const [playerModal, setPlayerModal] = useState<GameCardModel | null>(null);
  const [managerModal, setManagerModal] = useState<JokerCard | null>(null);

  const sortedPlayers = useMemo(
    () => [...contents.players].sort((a, b) => b.power - a.power),
    [contents.players],
  );
  const initialDeck = useMemo(
    () => normaliseActiveDeckIds(contents.players, contents.players.map((card) => card.id))
      .map((id) => contents.players.find((card) => card.id === id))
      .filter((card): card is Card => Boolean(card)),
    [contents.players],
  );
  const pickedManager = contents.managers.find((manager) => manager.id === pickedManagerId) ?? null;
  const accent = stage === 'manager' ? BLUE : GOLD;
  const title = stage === 'manager'
    ? 'PICK YOUR MANAGER'
    : stage === 'players'
      ? 'YOUR PLAYER PACK'
      : 'YOUR FIRST DECK';
  const info = stage === 'manager'
    ? 'Your manager sets your formations, starting-XI cost and run action.'
    : stage === 'players'
      ? 'All 18 players reveal together. Tap any card to inspect it.'
      : 'Your whole opening pack becomes the first active deck.';
  const managerGated = stage === 'manager' && pickedManagerId === null;
  const deckReady = initialDeck.length === ACTIVE_DECK_SIZE;

  function continueFlow() {
    if (stage === 'manager') {
      if (!pickedManagerId) return;
      setStage('players');
      setPhase('sealed');
      return;
    }

    if (stage === 'players') {
      saveActiveDeckIds(initialDeck.map((card) => card.id));
      setStage('deck');
      setPhase('open');
      return;
    }

    if (!deckReady) return;
    saveActiveDeckIds(initialDeck.map((card) => card.id));
    onContinue(pickedManagerId, NO_TACTIC_V1_ID);
  }

  const stageIndex = STAGES.indexOf(stage);

  return (
    <div
      className="kcv1-pack flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        color: 'var(--cream)',
        background: SCREEN_BG,
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      <style>{ANIMATION_CSS}</style>

      <header className="shrink-0 px-3" style={{ textAlign: 'center' }}>
        <div className="flex items-center justify-center" style={{ gap: 6, marginBottom: 6 }}>
          {STAGES.map((key, index) => (
            <span
              key={key}
              style={{
                width: index === stageIndex ? 24 : 7,
                height: 7,
                borderRadius: 99,
                background: index === stageIndex ? accent : index < stageIndex ? `${accent}88` : 'rgba(244,236,216,.2)',
                boxShadow: index === stageIndex ? `0 0 10px ${accent}88` : undefined,
                transition: 'width 160ms ease',
              }}
            />
          ))}
        </div>
        <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: '.13em', color: 'var(--dust)' }}>STEP {stageIndex + 1} / {STAGES.length}</span>
        <h1 style={{ margin: '5px 0 0', color: accent, fontFamily: 'var(--font-heavy, sans-serif)', fontSize: 'clamp(20px, 5.8vw, 23px)', lineHeight: 1 }}>{title}</h1>
        <p style={{ margin: '6px auto 0', maxWidth: 340, color: 'var(--cream-soft)', fontSize: 10.5, lineHeight: 1.3 }}>{info}</p>
      </header>

      <main className="flex-1 min-h-0 flex flex-col px-3" style={{ marginTop: 7 }}>
        {phase === 'sealed' ? (
          <SealedPack
            label={stage === 'manager' ? 'MANAGER PACK' : 'PLAYER PACK'}
            count={stage === 'manager' ? `${contents.managers.length} MANAGERS · PICK 1` : `${contents.players.length} PLAYERS · ACTIVE DECK`}
            accent={accent}
            onOpen={() => setPhase('open')}
          />
        ) : stage === 'manager' ? (
          <ManagerSelection
            managers={contents.managers}
            pickedId={pickedManagerId}
            onPick={setPickedManagerId}
            onInspect={setManagerModal}
          />
        ) : stage === 'players' ? (
          <PlayerReveal players={sortedPlayers} onInspect={(card) => setPlayerModal({ variant: 'player', card })} />
        ) : (
          <InitialDeckOverview
            players={initialDeck}
            manager={pickedManager}
            onInspect={(card) => setPlayerModal({ variant: 'player', card })}
          />
        )}
      </main>

      {phase === 'open' && (
        <footer className="shrink-0 px-3 pt-1.5">
          <button
            type="button"
            onClick={continueFlow}
            disabled={managerGated || (stage === 'deck' && !deckReady)}
            className="active:scale-95"
            style={{
              width: '100%',
              height: 44,
              color: managerGated || (stage === 'deck' && !deckReady) ? 'var(--dust)' : '#160d04',
              background: managerGated || (stage === 'deck' && !deckReady)
                ? 'rgba(255,255,255,.06)'
                : `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 72%, #6b4300))`,
              border: managerGated || (stage === 'deck' && !deckReady) ? '1px solid var(--border)' : '2px solid #080501',
              borderRadius: 8,
              boxShadow: managerGated || (stage === 'deck' && !deckReady) ? 'none' : '0 3px 0 #080501',
              fontFamily: PIXEL,
              fontSize: 10,
              cursor: managerGated || (stage === 'deck' && !deckReady) ? 'default' : 'pointer',
            }}
          >
            {stage === 'manager'
              ? managerGated ? 'PICK A MANAGER' : 'OPEN PLAYER PACK →'
              : stage === 'players'
                ? 'VIEW YOUR DECK →'
                : deckReady ? 'TEAM SELECTION →' : `DECK NEEDS ${ACTIVE_DECK_SIZE} PLAYERS`}
          </button>
        </footer>
      )}

      <CardModal model={playerModal} onClose={() => setPlayerModal(null)} />
      {managerModal && (
        <ManagerDossier
          manager={managerModal}
          formations={managerFormationsV1(managerModal)}
          onClose={() => setManagerModal(null)}
        />
      )}
    </div>
  );
}
