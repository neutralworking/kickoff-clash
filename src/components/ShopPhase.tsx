'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import type { RunState } from '../lib/run';
import { getShopCards, getPlayerPickCards } from '../lib/run';
import {
  CARD_PICK_COST, RARE_PICK_COST, PLAYER_PICK_COST, JOKER_COST, getStadiumInvestment,
  getAcademyInvestment, BOX_OFFICE_INVESTMENT, SCOUT_PACK_COST, ELITE_PACK_COST,
} from '../lib/economy';
import type { InvestmentCard } from '../lib/economy';
import type { PackTier } from '../lib/packs';
import type { JokerCard as JokerCardType } from '../lib/jokers';
import { getShopJokers } from '../lib/jokers';
import type { OpponentBuild } from '../lib/run';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import SquadGallery from './SquadGallery';
import { PIXEL, RARITY_COLOR } from './cards/cardTokens';
import { getFormation } from '../lib/formations';
import { LineupSlot, BenchTile } from './lineup';

interface ShopPhaseProps {
  state: RunState;
  onBuyCard: (card: Card, cost: number) => void;
  onSellCard: (card: Card) => void;
  onBuyJoker: (joker: JokerCardType) => void;
  /** Buy + rip a sealed card pack; returns the revealed cards (already added to
   *  the deck) so the shop can play the rip. []‑result means unaffordable. */
  onBuyPack: (tier: PackTier) => Card[];
  onBuyTacticPack: () => void;
  onBuyInvestment: (card: InvestmentCard) => void;
  onTrainPlayer: (cardId: number) => void;
  onRerollShop: () => boolean;
  onHealPlayer: (cardId: number) => boolean;
  onScoutOpponent: () => boolean;
  scoutedOpponent: OpponentBuild | null;
  onNext: () => void;
  shopSeed: number;
}

// Pick prices come from economy.ts (the single source of truth for the shop-every-match
// snowball dials); display and charge both read these, so they never desync.
const TACTIC_PACK_COST = 10_000;
const TRAINING_COST = 8_000;
const TRAINING_INCREMENT = 5;
const TRAINING_MAX = 20;

type Tab = 'market' | 'squad' | 'backroom';

export default function ShopPhase({
  state,
  onBuyCard,
  onSellCard,
  onBuyJoker,
  onBuyPack,
  onBuyTacticPack,
  onBuyInvestment,
  onTrainPlayer,
  onRerollShop,
  onHealPlayer,
  onScoutOpponent,
  scoutedOpponent,
  onNext,
  shopSeed,
}: ShopPhaseProps) {
  const [rerollCount, setRerollCount] = useState(0);
  const shopCards = useMemo(
    () => getShopCards(shopSeed + rerollCount * 17, false),
    [shopSeed, rerollCount],
  );
  const rareCards = useMemo(
    () => getShopCards(shopSeed + 1 + rerollCount * 17, true),
    [shopSeed, rerollCount],
  );
  const shopJokers = useMemo(
    () => getShopJokers(shopSeed + 2 + rerollCount * 17, 3),
    [shopSeed, rerollCount],
  );
  const [showCardPick, setShowCardPick] = useState<'budget' | 'normal' | 'rare' | null>(null);
  // Player Pick (budget): 3 Common/Rare candidates, choose one. Seeded per visit.
  const budgetCards = useMemo(() => getPlayerPickCards(shopSeed + 77), [shopSeed]);
  const [tab, setTab] = useState<Tab>('market');
  const [modal, setModal] = useState<GameCardModel | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  // Read-only XI view — see the current shape (gaps, fitness, depth) while shopping.
  const [showXI, setShowXI] = useState(false);
  // Sealed-pack rip: the tier + the returned cards (already in the deck) to celebrate.
  const [packReveal, setPackReveal] = useState<{ tier: PackTier; cards: Card[] } | null>(null);

  // Buy + rip a sealed pack. onBuyPack has already charged the cash and added the
  // pulls to the deck; a non-empty result means the buy landed, so play the reveal.
  const handleOpenPack = (tier: PackTier) => {
    const pulled = onBuyPack(tier);
    if (pulled.length > 0) setPackReveal({ tier, cards: pulled });
  };

  const trainableCards = [...state.deck]
    .map((card) => ({
      card,
      applied: state.trainingApplied[card.id] ?? 0,
    }))
    .sort((a, b) => {
      const aMax = a.applied >= TRAINING_MAX ? 1 : 0;
      const bMax = b.applied >= TRAINING_MAX ? 1 : 0;
      if (aMax !== bMax) return aMax - bMax;
      return b.card.power - a.card.power;
    });
  const injuredCards = state.deck.filter((card) => card.injured);

  const offeredJokers = shopJokers.filter(
    j => !state.jokers.some(owned => owned.id === j.id),
  );
  const canPickJoker = state.jokers.length < 3 && offeredJokers.length > 0;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'market', label: 'Market' },
    { id: 'squad', label: 'Squad' },
    { id: 'backroom', label: 'Backroom' },
  ];

  return (
    <div
      className="phase-shop flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {/* ── Header: Transfer Window · cash · points ─────────────────────── */}
      <div className="shrink-0 px-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col mr-auto min-w-0">
            <span
              className="uppercase truncate"
              style={{ fontFamily: PIXEL, fontSize: 15, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
            >
              Transfer Window
            </span>
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
              NEXT: CUP {Math.min(state.round + 1, 5)} {'·'} {state.deck.length} SQUAD
            </span>
          </div>

          <HeaderStat label="NEXT CUP" value={`${Math.min(state.round + 1, 5)}/5`} />
          <div
            className="glass-raised sheen flex flex-col items-end justify-center shrink-0 relative overflow-hidden"
            style={{
              minWidth: 84,
              height: 40,
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span style={{ fontFamily: PIXEL, fontSize: 14, lineHeight: 1, color: 'var(--gold)' }}>
              {'£'}{state.cash.toLocaleString()}
            </span>
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>CASH</span>
          </div>
        </div>

        {/* Active jokers strip */}
        {state.jokers.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
            {state.jokers.map(j => (
              <button
                key={j.id}
                onClick={() => setModal({ variant: 'manager', manager: j })}
                className="glass-surface shrink-0 active:scale-95 relative overflow-hidden"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 28,
                  padding: '0 9px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--kit-red)' }} />
                <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--cream)', maxWidth: 96 }}>{j.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex gap-1.5 px-3 mt-2.5">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 active:scale-[0.98] relative overflow-hidden ${active ? 'sheen-strong glow-edge' : 'glass-surface sheen'}`}
              style={{
                height: 38,
                borderRadius: 'var(--radius-sm)',
                background: active ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : undefined,
                border: active ? '1px solid var(--ink-black)' : undefined,
                boxShadow: active
                  ? 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)'
                  : 'var(--depth-1)',
                fontFamily: PIXEL,
                fontSize: 10,
                letterSpacing: 0.6,
                color: active ? 'var(--ink-black)' : 'var(--cream-soft)',
                textTransform: 'uppercase',
                ...(active ? { ['--glow' as string]: 'var(--amber-glow)' } : {}),
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Active tab body — the ONLY scrolling region ─────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3" style={{ overscrollBehavior: 'contain' }}>
        {tab === 'market' && (
          <MarketTab
            state={state}
            offeredJokers={offeredJokers}
            canPickJoker={canPickJoker}
            setShowCardPick={setShowCardPick}
            onBuyJoker={onBuyJoker}
            onOpenPack={handleOpenPack}
            onRerollShop={onRerollShop}
            setRerollCount={setRerollCount}
            openModal={setModal}
          />
        )}

        {tab === 'squad' && (
          <SquadTab
            state={state}
            trainableCards={trainableCards}
            injuredCards={injuredCards}
            onTrainPlayer={onTrainPlayer}
            onHealPlayer={onHealPlayer}
            openModal={setModal}
            openGallery={() => setShowGallery(true)}
            openXI={() => setShowXI(true)}
          />
        )}

        {tab === 'backroom' && (
          <BackroomTab
            state={state}
            scoutedOpponent={scoutedOpponent}
            onBuyTacticPack={onBuyTacticPack}
            onBuyInvestment={onBuyInvestment}
            onScoutOpponent={onScoutOpponent}
            openModal={setModal}
          />
        )}
      </div>

      {/* ── Footer: Next Match CTA ──────────────────────────────────────── */}
      <div className="shrink-0 px-3 pt-2.5">
        <button
          onClick={onNext}
          className="sheen-strong glow-edge w-full active:scale-[0.99] relative overflow-hidden"
          style={{
            height: 52,
            borderRadius: 'var(--radius)',
            border: '2px solid var(--ink-black)',
            background: 'linear-gradient(180deg, var(--amber) 0%, var(--amber-soft) 100%)',
            boxShadow:
              'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)',
            fontFamily: PIXEL,
            fontSize: 14,
            letterSpacing: 0.8,
            color: 'var(--line-white)',
            textTransform: 'uppercase',
            ['--glow' as string]: 'var(--amber-glow)',
          }}
        >
          Next Match {'→'}
        </button>
      </div>

      {/* ── Card-pick bottom sheet ──────────────────────────────────────── */}
      {showCardPick && (
        <BottomSheet title="Pick 1 of 3" onClose={() => setShowCardPick(null)}>
          <div className="grid grid-cols-3 gap-3">
            {(showCardPick === 'rare' ? rareCards : showCardPick === 'budget' ? budgetCards : shopCards).map(card => {
              const cost = showCardPick === 'rare' ? RARE_PICK_COST : showCardPick === 'budget' ? PLAYER_PICK_COST : CARD_PICK_COST;
              return (
                <CardCell
                  key={card.id}
                  model={{ variant: 'player', card }}
                  priceLabel={`£${cost.toLocaleString()}`}
                  affordable={state.cash >= cost}
                  actionLabel="Sign"
                  onAction={() => {
                    onBuyCard(card, cost);
                    setShowCardPick(null);
                  }}
                  onInspect={() => setModal({ variant: 'player', card })}
                />
              );
            })}
          </div>
        </BottomSheet>
      )}

      {/* Single CardModal mounted at shop root (renders absolute inset-0). */}
      <CardModal model={modal} onClose={() => setModal(null)} />

      {/* Squad Gallery — full-screen overlay over the shop (renders absolute inset-0).
          Selling now lives here (sell mode): tap a card's Sell for its transfer fee. */}
      {showGallery && (
        <SquadGallery
          deck={state.deck}
          onClose={() => setShowGallery(false)}
          title="YOUR SQUAD"
          onSellCard={onSellCard}
        />
      )}

      {/* Read-only XI pitch view — the current shape while shopping. */}
      {showXI && <XIOverlay state={state} onInspect={(c) => setModal({ variant: 'player', card: c })} onClose={() => setShowXI(false)} />}

      {/* Sealed-pack rip reveal — celebratory only; the pulls are already in the deck. */}
      {packReveal && (
        <PackRipReveal
          tier={packReveal.tier}
          cards={packReveal.cards}
          onInspect={(c) => setModal({ variant: 'player', card: c })}
          onClose={() => setPackReveal(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// MARKET TAB
// ===========================================================================

function MarketTab({
  state, offeredJokers, canPickJoker,
  setShowCardPick, onBuyJoker, onOpenPack, onRerollShop, setRerollCount, openModal,
}: {
  state: RunState;
  offeredJokers: JokerCardType[];
  canPickJoker: boolean;
  setShowCardPick: (v: 'budget' | 'normal' | 'rare' | null) => void;
  onBuyJoker: (joker: JokerCardType) => void;
  onOpenPack: (tier: PackTier) => void;
  onRerollShop: () => boolean;
  setRerollCount: React.Dispatch<React.SetStateAction<number>>;
  openModal: (m: GameCardModel) => void;
}) {
  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* TRANSFER MARKET — sign a KNOWN player: scout the board, pick one of three. */}
      <SectionCard
        title="Transfer Market"
        accent="var(--gold)"
        right={
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.5 }}>
            PICK YOUR MAN
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <BuyTile
            label="Player Pick"
            sub="Sign 1 of 3 — Common/Rare bodies"
            cost={PLAYER_PICK_COST}
            affordable={state.cash >= PLAYER_PICK_COST}
            onClick={() => setShowCardPick('budget')}
          />
          <BuyTile
            label="Card Pick"
            sub="Sign 1 of 3 — full board"
            cost={CARD_PICK_COST}
            affordable={state.cash >= CARD_PICK_COST}
            onClick={() => setShowCardPick('normal')}
          />
          <BuyTile
            label="Rare+ Pick"
            sub="Sign 1 of 3 — Rare or better"
            cost={RARE_PICK_COST}
            affordable={state.cash >= RARE_PICK_COST}
            onClick={() => setShowCardPick('rare')}
          />
        </div>
      </SectionCard>

      {/* CARD PACKS — the SEALED gamble: rip 3 unknown cards, no choosing. */}
      <SectionCard
        title="Card Packs"
        accent="var(--kit-blue)"
        right={
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.5 }}>
            SEALED · 3 CARDS
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2.5">
          <PackTile
            tier="scout"
            label="Scout Pack"
            sub="Mostly Common — squad depth."
            cost={SCOUT_PACK_COST}
            affordable={state.cash >= SCOUT_PACK_COST}
            onOpen={() => onOpenPack('scout')}
          />
          <PackTile
            tier="elite"
            label="Elite Pack"
            sub="Guaranteed Rare+ — the chase."
            cost={ELITE_PACK_COST}
            affordable={state.cash >= ELITE_PACK_COST}
            onOpen={() => onOpenPack('elite')}
          />
        </div>
      </SectionCard>

      {/* Manager signings */}
      <SectionCard title="Manager Signings" accent="var(--kit-red)">
        {!canPickJoker ? (
          <EmptyState
            text={state.jokers.length >= 3
              ? 'Backroom full — 3 managers signed.'
              : 'No managers available this window.'}
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {offeredJokers.map(j => (
              <CardCell
                key={j.id}
                model={{ variant: 'manager', manager: j }}
                priceLabel={`£${JOKER_COST.toLocaleString()}`}
                affordable={state.cash >= JOKER_COST}
                actionLabel="Sign"
                actionTone="danger"
                onAction={() => { if (state.cash >= JOKER_COST) onBuyJoker(j); }}
                onInspect={() => openModal({ variant: 'manager', manager: j })}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Reroll */}
      <SectionCard title="Refresh Market" accent="var(--amber)">
        <RowAction
          title="Reroll the board"
          sub="Hunt a better tactical fit"
          cost={8000}
          affordable={state.cash >= 8000}
          onClick={() => {
            if (onRerollShop()) {
              setRerollCount((prev) => prev + 1);
              setShowCardPick(null);
            }
          }}
        />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SQUAD TAB
// ===========================================================================

function SquadTab({
  state, trainableCards, injuredCards, onTrainPlayer, onHealPlayer, openModal, openGallery, openXI,
}: {
  state: RunState;
  trainableCards: { card: Card; applied: number }[];
  injuredCards: Card[];
  onTrainPlayer: (cardId: number) => void;
  onHealPlayer: (cardId: number) => boolean;
  openModal: (m: GameCardModel) => void;
  openGallery: () => void;
  openXI: () => void;
}) {
  const canHeal = state.cash >= 12000;
  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Squad shortcuts — the current XI on the pitch, and the full card list. */}
      <SectionCard title="Your Squad" accent="var(--kit-blue)">
        <div className="flex flex-col gap-2">
          <RowAction
            title="View XI"
            sub="Current lineup on the pitch"
            actionLabel="View XI"
            affordable
            onClick={openXI}
          />
          <RowAction
            title="View all cards"
            sub={`${state.deck.length} owned · inspect & sell`}
            actionLabel="View All"
            affordable={state.deck.length > 0}
            onClick={openGallery}
          />
        </div>
      </SectionCard>

      {/* Medical room */}
      <SectionCard title="Medical Room" accent="var(--danger)">
        {injuredCards.length === 0 ? (
          <EmptyState text="Squad fully fit." />
        ) : (
          <div className="flex flex-col gap-2">
            <p style={{ fontSize: 10, color: 'var(--dust)', lineHeight: 1.4 }}>
              Restore injured players before kick-off — {'£'}12,000 each.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {injuredCards.map(card => (
                <CardCell
                  key={card.id}
                  model={{ variant: 'player', card }}
                  priceLabel={`£${(12000).toLocaleString()}`}
                  affordable={canHeal}
                  actionLabel="Heal"
                  actionTone="danger"
                  onAction={() => onHealPlayer(card.id)}
                  onInspect={() => openModal({ variant: 'player', card })}
                />
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Training */}
      <SectionCard
        title="Training Ground"
        accent="var(--amber)"
        right={
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.5 }}>
            +{TRAINING_INCREMENT} / {'£'}{TRAINING_COST.toLocaleString()}
          </span>
        }
      >
        {state.deck.length === 0 ? (
          <EmptyState text="No players to train." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {trainableCards.map(({ card, applied }) => {
              const isMax = applied >= TRAINING_MAX;
              const canAfford = state.cash >= TRAINING_COST;
              return (
                <CardCell
                  key={card.id}
                  model={{ variant: 'player', card }}
                  badge={isMax ? 'MAX' : applied > 0 ? `+${applied}` : undefined}
                  badgeColor={isMax ? 'var(--amber)' : 'var(--gold)'}
                  priceLabel={isMax ? 'Maxed' : `£${TRAINING_COST.toLocaleString()}`}
                  affordable={!isMax && canAfford}
                  actionLabel={isMax ? 'Finished' : 'Train'}
                  actionDisabled={isMax}
                  onAction={() => { if (!isMax && canAfford) onTrainPlayer(card.id); }}
                  onInspect={() => openModal({ variant: 'player', card })}
                />
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// BACKROOM TAB
// ===========================================================================

function BackroomTab({
  state, scoutedOpponent,
  onBuyTacticPack, onBuyInvestment, onScoutOpponent, openModal,
}: {
  state: RunState;
  scoutedOpponent: OpponentBuild | null;
  onBuyTacticPack: () => void;
  onBuyInvestment: (card: InvestmentCard) => void;
  onScoutOpponent: () => boolean;
  openModal: (m: GameCardModel) => void;
}) {
  const stadiumInvestment = getStadiumInvestment(state.stadiumTier);
  const academyInvestment = getAcademyInvestment(state.academyTier);
  const boxOfficeInvestment = state.boxOffice ? null : BOX_OFFICE_INVESTMENT;
  const boardroomCards = [stadiumInvestment, academyInvestment, boxOfficeInvestment]
    .filter((c): c is InvestmentCard => c != null);
  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Boardroom — chairman's one-time-unlock Investments, rendered as cards. */}
      <SectionCard
        title="Boardroom"
        accent="var(--gold)"
        right={
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)', letterSpacing: 0.5 }}>
            BOARD DECISIONS
          </span>
        }
      >
        {boardroomCards.length === 0 ? (
          <EmptyState text="Every board lever pulled — the empire is built." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {boardroomCards.map((inv) => (
              <InvestmentCell
                key={inv.id}
                investment={inv}
                affordable={state.cash >= inv.cost}
                onAction={() => { if (state.cash >= inv.cost) onBuyInvestment(inv); }}
                onInspect={() => openModal({ variant: 'investment', investment: inv })}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Scout report */}
      <SectionCard title="Scout Report" accent="var(--kit-blue)">
        {scoutedOpponent ? (
          <div
            className="glass-surface relative overflow-hidden"
            style={{
              borderRadius: 'var(--radius-sm)',
              padding: 10,
            }}
          >
            <div className="flex items-center justify-between relative" style={{ gap: 8, zIndex: 2 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream)' }}>{scoutedOpponent.name}</span>
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--kit-blue)', letterSpacing: 0.4 }}>
                {scoutedOpponent.style.toUpperCase()}
              </span>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--cream-soft)', lineHeight: 1.45, marginTop: 6 }}>
              Weakness: <b style={{ color: 'var(--danger)' }}>{scoutedOpponent.weakness}</b>.
            </p>
            <p style={{ fontSize: 10.5, color: 'var(--dust)', lineHeight: 1.45, marginTop: 2 }}>
              Star: {scoutedOpponent.starPlayer.name} ({scoutedOpponent.starPlayer.position}).
            </p>
          </div>
        ) : (
          <RowAction
            title="Scout next opponent"
            sub="Reveal style, weakness & star"
            cost={10000}
            affordable={state.cash >= 10000}
            onClick={onScoutOpponent}
          />
        )}
      </SectionCard>

      {/* Tactic pack */}
      <SectionCard title="Tactical Intelligence" accent="var(--gold)">
        <RowAction
          title="Tactic Pack"
          sub={`2 random tactics · ${state.tacticsDeck.length} owned`}
          cost={TACTIC_PACK_COST}
          affordable={state.cash >= TACTIC_PACK_COST}
          onClick={onBuyTacticPack}
        />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// Shared primitives
// ===========================================================================

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="glass-surface flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
      style={{
        minWidth: 52,
        height: 40,
        padding: '0 8px',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: 'var(--cream)' }}>{value}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

function SectionCard({
  title, accent, right, children,
}: {
  title: string;
  accent: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="glass-raised sheen relative"
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center relative" style={{ gap: 8, padding: '10px 11px 0', zIndex: 2 }}>
        <span
          style={{
            width: 4, height: 12, background: accent, borderRadius: 1, flexShrink: 0,
            boxShadow: `0 0 8px ${accent}`,
          }}
        />
        <span className="mr-auto truncate" style={{ fontFamily: PIXEL, fontSize: 9.5, letterSpacing: 0.8, color: 'var(--cream)', textTransform: 'uppercase' }}>
          {title}
        </span>
        {right}
      </div>
      <div className="relative" style={{ padding: 11, zIndex: 2 }}>{children}</div>
    </div>
  );
}

/** A card token + price + buy button, used across every market grid. */
function CardCell({
  model, priceLabel, affordable, actionLabel, actionTone = 'default',
  actionDisabled = false, badge, badgeColor, onAction, onInspect,
}: {
  model: GameCardModel;
  priceLabel: string;
  affordable: boolean;
  actionLabel: string;
  actionTone?: 'default' | 'danger';
  actionDisabled?: boolean;
  badge?: string;
  badgeColor?: string;
  onAction: () => void;
  onInspect: () => void;
}) {
  const active = affordable && !actionDisabled;
  const accentBg =
    actionTone === 'danger' ? 'rgba(232,54,47,0.18)' : 'rgba(255,122,31,0.18)';
  const accentBorder =
    actionTone === 'danger' ? 'var(--kit-red)' : 'var(--amber)';
  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      <div style={{ position: 'relative' }}>
        <GameCard model={model} onClick={onInspect} dimmed={!active} />
        {badge && (
          <span
            style={{
              // Off the corner — the card's top-right is the rating; never cover it.
              position: 'absolute',
              top: -5,
              right: -5,
              fontFamily: PIXEL,
              fontSize: 8,
              color: 'var(--ink-black)',
              background: badgeColor ?? 'var(--gold)',
              border: '1.5px solid var(--ink-black)',
              borderRadius: 3,
              padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <button
        onClick={onAction}
        disabled={!active}
        className="active:scale-95"
        style={{
          height: 40,
          borderRadius: 'var(--radius-sm)',
          border: '2px solid var(--ink-black)',
          background: active ? accentBg : 'var(--surface-raised)',
          boxShadow: '0 2px 0 0 var(--ink-black)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          cursor: active ? 'pointer' : 'not-allowed',
          opacity: active ? 1 : 0.55,
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.4, color: active ? 'var(--cream)' : 'var(--ink)', textTransform: 'uppercase' }}>
          {actionLabel}
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: active ? accentBorder : 'var(--ink)' }}>{priceLabel}</span>
      </button>
    </div>
  );
}

/** A Boardroom investment card + a BUY action. The cost lives on the card face,
 *  so the button is a clean verb in the Boardroom gold. */
function InvestmentCell({
  investment, affordable, onAction, onInspect,
}: {
  investment: InvestmentCard;
  affordable: boolean;
  onAction: () => void;
  onInspect: () => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      <GameCard
        model={{ variant: 'investment', investment }}
        onClick={onInspect}
        dimmed={!affordable}
        ariaLabel={`Inspect ${investment.name}`}
      />
      <button
        onClick={onAction}
        disabled={!affordable}
        className="active:scale-95"
        style={{
          height: 40,
          borderRadius: 'var(--radius-sm)',
          border: '2px solid var(--ink-black)',
          background: affordable ? 'rgba(245,197,66,0.18)' : 'var(--surface-raised)',
          boxShadow: '0 2px 0 0 var(--ink-black)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          cursor: affordable ? 'pointer' : 'not-allowed',
          opacity: affordable ? 1 : 0.55,
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.4, color: affordable ? 'var(--cream)' : 'var(--ink)', textTransform: 'uppercase' }}>
          Buy
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: affordable ? 'var(--gold)' : 'var(--ink)' }}>
          {`£${investment.cost.toLocaleString()}`}
        </span>
      </button>
    </div>
  );
}

/** A wide button tile for picks (no card preview). */
function BuyTile({
  label, sub, cost, affordable, onClick,
}: {
  label: string;
  sub: string;
  cost: number;
  affordable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!affordable}
      className="glass-surface sheen text-left active:scale-[0.98] relative overflow-hidden"
      style={{
        padding: 11,
        borderRadius: 'var(--radius-sm)',
        boxShadow: affordable
          ? 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)'
          : 'inset 0 1px 0 0 var(--glass-highlight)',
        cursor: affordable ? 'pointer' : 'not-allowed',
        opacity: affordable ? 1 : 0.55,
      }}
    >
      <div className="relative" style={{ zIndex: 2 }}>
        <div style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)' }}>{label}</div>
        <div style={{ fontSize: 9, color: 'var(--dust)', marginTop: 3 }}>{sub}</div>
        <div style={{ fontFamily: PIXEL, fontSize: 9.5, color: affordable ? 'var(--gold)' : 'var(--ink)', marginTop: 6 }}>
          {'£'}{cost.toLocaleString()}
        </div>
      </div>
    </button>
  );
}

/** A horizontal title + sub on the left, price/action button on the right. */
function RowAction({
  title, sub, cost, affordable, actionLabel, onClick,
}: {
  title: string;
  sub: string;
  cost?: number;
  affordable: boolean;
  actionLabel?: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center" style={{ gap: 10 }}>
      <div className="min-w-0 mr-auto">
        <div className="truncate" style={{ fontFamily: PIXEL, fontSize: 9.5, color: 'var(--cream)' }}>{title}</div>
        <div className="truncate" style={{ fontSize: 9.5, color: 'var(--dust)', marginTop: 3, lineHeight: 1.3 }}>{sub}</div>
      </div>
      <button
        onClick={onClick}
        disabled={!affordable}
        className={`shrink-0 active:scale-95 relative overflow-hidden ${affordable ? 'sheen-strong' : 'glass-surface'}`}
        style={{
          minWidth: 70,
          height: 40,
          padding: '0 12px',
          borderRadius: 'var(--radius-sm)',
          border: affordable ? '2px solid var(--ink-black)' : undefined,
          background: affordable ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))' : undefined,
          boxShadow: affordable
            ? 'inset 0 1px 0 0 var(--glass-highlight), 0 2px 0 0 var(--ink-black)'
            : undefined,
          fontFamily: PIXEL,
          fontSize: 9.5,
          letterSpacing: 0.3,
          color: affordable ? 'var(--ink-black)' : 'var(--ink)',
          cursor: affordable ? 'pointer' : 'not-allowed',
          opacity: affordable ? 1 : 0.6,
        }}
      >
        {actionLabel ?? (cost != null ? `£${cost.toLocaleString()}` : 'Go')}
      </button>
    </div>
  );
}

function BottomSheet({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col justify-end scrim-fade"
      style={{ background: 'rgba(2,9,5,0.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 50 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-raised sheen sheet-rise flex flex-col relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderTop: '1px solid var(--glass-border)',
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-3)',
          maxHeight: '82dvh',
          padding: '12px 14px max(env(safe-area-inset-bottom), 14px)',
        }}
      >
        <div className="flex items-center shrink-0 relative" style={{ gap: 8, marginBottom: 12, zIndex: 2 }}>
          <span className="mr-auto" style={{ fontFamily: PIXEL, fontSize: 12, color: 'var(--cream)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="glass-surface active:scale-90 relative overflow-hidden"
            style={{
              width: 36, height: 36,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--cream)',
              fontFamily: PIXEL,
              fontSize: 15,
              lineHeight: 1,
            }}
          >
            {'×'}
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto relative" style={{ overscrollBehavior: 'contain', zIndex: 2 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// XIOverlay — the current lineup, read-only, while shopping: the pitch with the
// starting XI (fitness showing), the bench, and the reserves, so a buyer can
// see exactly where the squad is thin. Tap any player to inspect.
// ---------------------------------------------------------------------------

function XIOverlay({
  state, onInspect, onClose,
}: {
  state: RunState;
  onInspect: (c: Card) => void;
  onClose: () => void;
}) {
  const formation = getFormation(state.activeFormation);
  const byId = new Map(state.deck.map((c) => [c.id, c]));
  const xi = (state.startingXI ?? []).map((id) => byId.get(id));
  const benchCards = (state.benchIds ?? []).map((id) => byId.get(id)).filter((c): c is Card => !!c);
  const used = new Set([...(state.startingXI ?? []), ...(state.benchIds ?? [])]);
  const reserves = state.deck.filter((c) => !used.has(c.id));

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(4,10,7,0.94)', zIndex: 55, padding: '12px 12px max(env(safe-area-inset-bottom), 10px)' }}>
      <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 12, letterSpacing: 0.6, color: 'var(--cream)' }}>CURRENT XI</span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', background: 'var(--surface)', boxShadow: '0 2px 0 0 var(--ink-black)', color: 'var(--cream)', fontFamily: PIXEL, fontSize: 14, lineHeight: 1 }}
        >
          {'×'}
        </button>
      </div>
      {/* Pitch — LineupSlot uses % coords, so any container height works. */}
      <div className="relative shrink-0" style={{ height: '46vh', borderRadius: 'var(--radius)', border: '2px solid var(--ink-black)', background: 'linear-gradient(180deg, #1f7a37 0%, #17632c 100%)', overflow: 'hidden' }}>
        {formation.slots.map((slot, i) => (
          <LineupSlot
            key={i}
            slot={slot}
            card={xi[i]}
            justPlaced={false}
            onClick={xi[i] ? () => onInspect(xi[i]!) : undefined}
          />
        ))}
      </div>
      {/* Bench + reserves — same tiles as the squad screen, inspect-only. */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ marginTop: 8, overscrollBehavior: 'contain' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>BENCH {benchCards.length}</span>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: 4 }}>
          {benchCards.map((c) => (
            <BenchTile key={c.id} card={c} onPointerUp={() => onInspect(c)} />
          ))}
        </div>
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)', display: 'block', marginTop: 8 }}>RESERVES {reserves.length}</span>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: 4 }}>
          {reserves.map((c) => (
            <BenchTile key={c.id} card={c} onPointerUp={() => onInspect(c)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Packs — the SEALED gamble tile + its pixel wrapped-pack sprite, and the
// celebratory RIP reveal overlay. The pulls are already in the deck (the buy
// handler charged + added them); the reveal is pure theatre.
// ---------------------------------------------------------------------------

interface PackRamp {
  body: string; rim: string; shade: string;
  crimp: string; crimpHi: string; stripe: string; stripeHi: string; emblem: string;
}

const PACK_RAMP: Record<PackTier, PackRamp> = {
  // Scout — cool slate/steel foil: standard-issue depth, no shine.
  scout: { body: '#39485a', rim: '#59718c', shade: '#1f2a36', crimp: '#6f88a4', crimpHi: '#a3bcd6', stripe: '#232f3c', stripeHi: '#3c5064', emblem: '#a9cdec' },
  // Elite — gold foil: the chase, with a travelling foil sweep on the wrapper.
  elite: { body: '#6e5416', rim: '#a07f22', shade: '#3a2c0c', crimp: '#c8992f', crimpHi: '#ffe79a', stripe: '#4a3a10', stripeHi: '#7a5f18', emblem: '#ffe79a' },
};

/** A sealed, wrapped card-pack pixel sprite — foil wrapper, crimped top seam, a
 *  chalk-white football seal, and three pips (the 3 cards inside). Lit top-left,
 *  crispEdges. The foil sheen sits on the wrapper (chrome), never on a card. */
function SealedPackSprite({ ramp, height = 72 }: { ramp: PackRamp; height?: number }) {
  return (
    <svg
      className="pixelated"
      viewBox="0 0 22 30"
      preserveAspectRatio="xMidYMid meet"
      style={{ height, width: 'auto', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* drop shadow */}
      <rect x="4" y="5" width="16" height="24" fill="rgba(0,0,0,0.42)" />
      {/* wrapper body */}
      <rect x="3" y="3" width="16" height="25" fill={ramp.body} />
      <rect x="3" y="3" width="1" height="25" fill={ramp.rim} />
      <rect x="3" y="3" width="16" height="1" fill={ramp.rim} />
      <rect x="18" y="3" width="1" height="25" fill={ramp.shade} />
      <rect x="3" y="27" width="16" height="1" fill={ramp.shade} />
      {/* top crimp seam */}
      <rect x="3" y="3" width="16" height="4" fill={ramp.crimp} />
      <rect x="3" y="3" width="16" height="1" fill={ramp.crimpHi} />
      {/* crimp teeth biting down into the body */}
      <rect x="5" y="6" width="2" height="1" fill={ramp.body} />
      <rect x="9" y="6" width="2" height="1" fill={ramp.body} />
      <rect x="13" y="6" width="2" height="1" fill={ramp.body} />
      {/* football seal — chalk white, lit top-left, shaded base + a couple of panels */}
      <rect x="7" y="12" width="8" height="8" fill="#f2f6ef" />
      <rect x="7" y="12" width="8" height="1" fill="#ffffff" />
      <rect x="7" y="19" width="8" height="1" fill="#c2ccbc" />
      <rect x="14" y="13" width="1" height="6" fill="#c2ccbc" />
      <rect x="10" y="15" width="2" height="2" fill="#2a2f28" />
      <rect x="8" y="13" width="1" height="1" fill="#2a2f28" />
      <rect x="13" y="17" width="1" height="1" fill="#2a2f28" />
      {/* bottom rarity stripe — tier tint */}
      <rect x="3" y="22" width="16" height="4" fill={ramp.stripe} />
      <rect x="3" y="22" width="16" height="1" fill={ramp.stripeHi} />
      {/* three pips = three cards inside */}
      <rect x="6" y="23" width="2" height="2" fill={ramp.emblem} />
      <rect x="10" y="23" width="2" height="2" fill={ramp.emblem} />
      <rect x="14" y="23" width="2" height="2" fill={ramp.emblem} />
      {/* diagonal foil sheen on the wrapper (chrome, not a card) */}
      <polygon points="13,3 16,3 8,28 5,28" fill="rgba(255,255,255,0.12)" />
    </svg>
  );
}

/** A sealed-pack acquisition tile: pixel pack over glass, tier name, contents
 *  line, and a RIP price footer. Affordability-gated (dim + non-interactive). */
function PackTile({
  tier, label, sub, cost, affordable, onOpen,
}: {
  tier: PackTier;
  label: string;
  sub: string;
  cost: number;
  affordable: boolean;
  onOpen: () => void;
}) {
  const elite = tier === 'elite';
  const accent = elite ? 'var(--gold)' : 'var(--kit-blue)';
  const glow = elite ? 'var(--gold-glow)' : 'var(--glow-rare)';
  const ramp = PACK_RAMP[tier];
  return (
    <button
      onClick={affordable ? onOpen : undefined}
      disabled={!affordable}
      className={`glass-surface sheen active:scale-[0.98] relative overflow-hidden flex flex-col items-center ${affordable ? 'glow-edge' : ''}`}
      style={{
        padding: '12px 10px 0',
        borderRadius: 'var(--radius-sm)',
        boxShadow: affordable
          ? 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)'
          : 'inset 0 1px 0 0 var(--glass-highlight)',
        cursor: affordable ? 'pointer' : 'not-allowed',
        opacity: affordable ? 1 : 0.55,
        ...(affordable ? { ['--glow' as string]: glow } : {}),
      }}
    >
      {/* Tier-tinted glow wash rising behind the pack. */}
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 62% at 50% 4%, ${glow}, transparent 68%)`, opacity: affordable ? 0.55 : 0.2 }}
      />
      {/* Pack sprite (+ foil sweep on Elite). */}
      <div className="relative" style={{ height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        <div style={{ position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
          <SealedPackSprite ramp={ramp} />
          {elite && (
            <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              <div
                className="card-foil"
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '48%', background: 'linear-gradient(90deg, transparent, rgba(255,240,205,0.4), transparent)', mixBlendMode: 'screen' }}
              />
            </div>
          )}
        </div>
      </div>
      {/* Name + contents line. */}
      <div className="relative" style={{ zIndex: 2, width: '100%', textAlign: 'center', marginTop: 2 }}>
        <div style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--cream)' }}>{label}</div>
        <div style={{ fontSize: 8.5, color: 'var(--dust)', marginTop: 3, lineHeight: 1.35, minHeight: 24 }}>{sub}</div>
      </div>
      {/* RIP price footer — a seated band on the tile's foot. */}
      <div
        className="relative"
        style={{
          zIndex: 2, width: 'calc(100% + 20px)', marginLeft: -10, marginRight: -10, marginTop: 8,
          borderTop: '1px solid var(--glass-border)', padding: '8px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.8, color: affordable ? 'var(--cream)' : 'var(--ink)' }}>RIP</span>
        <span style={{ fontFamily: PIXEL, fontSize: 10, color: affordable ? accent : 'var(--ink)' }}>{'£'}{cost.toLocaleString()}</span>
      </div>
    </button>
  );
}

/** The celebratory pack rip: a beat of sealed-pack-tears-open theatre, then the
 *  three pulls fan up staggered. Each card is inspectable; the pulls are already
 *  in the deck, so the only action is to close. */
function PackRipReveal({
  tier, cards, onInspect, onClose,
}: {
  tier: PackTier;
  cards: Card[];
  onInspect: (c: Card) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'rip' | 'cards'>('rip');
  const ramp = PACK_RAMP[tier];
  const accent = tier === 'elite' ? 'var(--gold)' : 'var(--kit-blue)';

  // The best pull drives the celebratory flash + headline.
  const RANK: Record<string, number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };
  const best = cards.reduce((a, b) => (RANK[b.rarity] > RANK[a.rarity] ? b : a), cards[0]);
  const bestColor = RARITY_COLOR[best.rarity] ?? RARITY_COLOR.Common;
  const bigPull = RANK[best.rarity] >= 2;

  useEffect(() => {
    const t = setTimeout(() => setStage('cards'), 560);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0 scrim-fade flex flex-col"
      style={{
        background: 'rgba(2,9,5,0.86)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 60,
        padding: '16px 16px max(env(safe-area-inset-bottom), 14px)',
      }}
      role="dialog"
      aria-modal="true"
    >
      {stage === 'rip' ? (
        // ── RIP BEAT — the pack jolts, flares white, and tears upward. ──
        <div className="flex-1 flex items-center justify-center relative">
          <div aria-hidden className="pack-flash" style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${accent}, transparent 62%)` }} />
          <div className="pack-rip">
            <SealedPackSprite ramp={ramp} height={188} />
          </div>
        </div>
      ) : (
        // ── PULLS — headline, the three cards fanning up, and a close. ──
        <>
          {bigPull && <div aria-hidden className="pack-rarity-flash" style={{ position: 'absolute', inset: 0, background: bestColor, opacity: 0.55, pointerEvents: 'none', zIndex: 1 }} />}

          <div className="shrink-0 text-center phase-fade-in" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            <div style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1.5, color: 'var(--dust)' }}>
              {tier === 'elite' ? 'ELITE PACK' : 'SCOUT PACK'}
            </div>
            <div style={{ fontFamily: PIXEL, fontSize: 20, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', marginTop: 6 }}>
              {bigPull ? 'BIG PULL!' : 'NICE!'}
            </div>
            <div style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.6, color: 'var(--dust)', marginTop: 6 }}>
              3 CARDS ADDED TO YOUR SQUAD
            </div>
          </div>

          {/* The three pulls — inspectable, staggered up. */}
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto" style={{ overscrollBehavior: 'contain', position: 'relative', zIndex: 2 }}>
            <div className="grid grid-cols-3" style={{ gap: 8, width: '100%', maxWidth: 360 }}>
              {cards.map((card, i) => (
                <GameCard
                  key={`${card.id}-${i}`}
                  model={{ variant: 'player', card }}
                  onClick={() => onInspect(card)}
                  delay={i * 120}
                  ariaLabel={`Inspect ${card.name}`}
                />
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="sheen-strong glow-edge w-full shrink-0 active:scale-[0.99] relative overflow-hidden phase-fade-in"
            style={{
              height: 50,
              marginTop: 12,
              borderRadius: 'var(--radius)',
              border: '2px solid var(--ink-black)',
              background: 'linear-gradient(180deg, var(--amber) 0%, var(--amber-soft) 100%)',
              boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), 0 3px 0 0 var(--ink-black), var(--depth-2)',
              fontFamily: PIXEL,
              fontSize: 13,
              letterSpacing: 0.8,
              color: 'var(--line-white)',
              textTransform: 'uppercase',
              zIndex: 2,
              ['--glow' as string]: 'var(--amber-glow)',
            }}
          >
            Add to Squad
          </button>
        </>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        minHeight: 64,
        padding: 12,
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed var(--border)',
        background: 'rgba(0,0,0,0.18)',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)', letterSpacing: 0.4, textAlign: 'center', lineHeight: 1.5 }}>
        {text}
      </span>
    </div>
  );
}
