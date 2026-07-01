'use client';

import { useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import { seededRandom } from '../lib/scoring';
import type { RunState } from '../lib/run';
import { getShopCards, ALL_CARDS } from '../lib/run';
import {
  CARD_PICK_COST, RARE_PICK_COST, getTransferFee, getAcademyTier,
  generateAcademyDurability, JOKER_COST, getStadiumInvestment,
  getAcademyInvestment, BOX_OFFICE_INVESTMENT,
} from '../lib/economy';
import type { InvestmentCard } from '../lib/economy';
import type { JokerCard as JokerCardType } from '../lib/jokers';
import { getShopJokers } from '../lib/jokers';
import type { OpponentBuild } from '../lib/run';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import SquadGallery from './SquadGallery';
import { PIXEL } from './cards/cardTokens';

interface ShopPhaseProps {
  state: RunState;
  onBuyCard: (card: Card, cost: number) => void;
  onSellCard: (card: Card) => void;
  onBuyJoker: (joker: JokerCardType) => void;
  onBuyAcademy: (card: Card) => void;
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
  onBuyAcademy,
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
  const [showCardPick, setShowCardPick] = useState<'normal' | 'rare' | null>(null);
  const [tab, setTab] = useState<Tab>('market');
  const [sellSheet, setSellSheet] = useState(false);
  const [sellConfirm, setSellConfirm] = useState<Card | null>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const academy = getAcademyTier(state.academyTier);
  const acSeed = shopSeed + 777;
  const academyDurabilities = generateAcademyDurability(state.academyTier, academy.playersOffered, acSeed);

  // Generate academy cards
  const academyPool = ALL_CARDS.filter(c => {
    if (academy.maxRarity === 'Common') return c.rarity === 'Common';
    if (academy.maxRarity === 'Rare') return c.rarity === 'Common' || c.rarity === 'Rare';
    return c.rarity !== 'Legendary';
  });
  const academyCards: Card[] = [];
  for (let i = 0; i < academy.playersOffered && i < academyPool.length; i++) {
    const idx = Math.floor(seededRandom(acSeed + i * 31) * academyPool.length);
    const base = academyPool[idx];
    academyCards.push({
      ...base,
      id: state.seed + 90000 + state.round * 100 + i,
      durability: academyDurabilities[i],
    });
  }

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
            openSell={() => setSellSheet(true)}
            openGallery={() => setShowGallery(true)}
          />
        )}

        {tab === 'backroom' && (
          <BackroomTab
            state={state}
            academy={academy}
            academyCards={academyCards}
            scoutedOpponent={scoutedOpponent}
            onBuyAcademy={onBuyAcademy}
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
            {(showCardPick === 'rare' ? rareCards : shopCards).map(card => {
              const cost = showCardPick === 'rare' ? RARE_PICK_COST : CARD_PICK_COST;
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

      {/* ── Sell bottom sheet (replaces confirm()) ──────────────────────── */}
      {sellSheet && (
        <BottomSheet
          title={sellConfirm ? 'Confirm Sale' : 'Sell Players'}
          onClose={() => { setSellSheet(false); setSellConfirm(null); }}
        >
          {sellConfirm ? (
            <div className="flex flex-col items-center" style={{ gap: 14 }}>
              <div style={{ width: 128 }}>
                <GameCard model={{ variant: 'player', card: sellConfirm }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--cream-soft)', textAlign: 'center', lineHeight: 1.4 }}>
                Sell <b style={{ color: 'var(--cream)' }}>{sellConfirm.name}</b> for{' '}
                <b style={{ color: 'var(--gold)' }}>{'£'}{getTransferFee(sellConfirm).toLocaleString()}</b>?
              </p>
              <div className="flex gap-2 w-full">
                <SheetButton
                  label="Cancel"
                  tone="muted"
                  onClick={() => setSellConfirm(null)}
                />
                <SheetButton
                  label="Confirm Sale"
                  tone="danger"
                  onClick={() => {
                    onSellCard(sellConfirm);
                    setSellConfirm(null);
                  }}
                />
              </div>
            </div>
          ) : state.deck.length === 0 ? (
            <EmptyState text="No players to sell." />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {state.deck.map(card => (
                <CardCell
                  key={card.id}
                  model={{ variant: 'player', card }}
                  priceLabel={`£${getTransferFee(card).toLocaleString()}`}
                  affordable
                  actionLabel="Sell"
                  actionTone="danger"
                  onAction={() => setSellConfirm(card)}
                  onInspect={() => setModal({ variant: 'player', card })}
                />
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {/* Single CardModal mounted at shop root (renders absolute inset-0). */}
      <CardModal model={modal} onClose={() => setModal(null)} />

      {/* Squad Gallery — full-screen overlay over the shop (renders absolute inset-0). */}
      {showGallery && (
        <SquadGallery deck={state.deck} onClose={() => setShowGallery(false)} title="YOUR SQUAD" />
      )}
    </div>
  );
}

// ===========================================================================
// MARKET TAB
// ===========================================================================

function MarketTab({
  state, offeredJokers, canPickJoker,
  setShowCardPick, onBuyJoker, onRerollShop, setRerollCount, openModal,
}: {
  state: RunState;
  offeredJokers: JokerCardType[];
  canPickJoker: boolean;
  setShowCardPick: (v: 'normal' | 'rare' | null) => void;
  onBuyJoker: (joker: JokerCardType) => void;
  onRerollShop: () => boolean;
  setRerollCount: React.Dispatch<React.SetStateAction<number>>;
  openModal: (m: GameCardModel) => void;
}) {
  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Card picks */}
      <SectionCard title="Player Market" accent="var(--gold)">
        <div className="grid grid-cols-2 gap-2">
          <BuyTile
            label="Card Pick"
            sub="Choose 1 of 3"
            cost={CARD_PICK_COST}
            affordable={state.cash >= CARD_PICK_COST}
            onClick={() => setShowCardPick('normal')}
          />
          <BuyTile
            label="Rare+ Pick"
            sub="Rare or better"
            cost={RARE_PICK_COST}
            affordable={state.cash >= RARE_PICK_COST}
            onClick={() => setShowCardPick('rare')}
          />
        </div>
      </SectionCard>

      {/* Gaffer signings */}
      <SectionCard title="Gaffer Signings" accent="var(--kit-red)">
        {!canPickJoker ? (
          <EmptyState
            text={state.jokers.length >= 3
              ? 'Backroom full — 3 gaffers signed.'
              : 'No gaffers available this window.'}
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
  state, trainableCards, injuredCards, onTrainPlayer, onHealPlayer, openModal, openSell, openGallery,
}: {
  state: RunState;
  trainableCards: { card: Card; applied: number }[];
  injuredCards: Card[];
  onTrainPlayer: (cardId: number) => void;
  onHealPlayer: (cardId: number) => boolean;
  openModal: (m: GameCardModel) => void;
  openSell: () => void;
  openGallery: () => void;
}) {
  const canHeal = state.cash >= 12000;
  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Squad gallery shortcut — browse every owned card in the full overlay. */}
      <SectionCard title="Your Squad" accent="var(--kit-blue)">
        <RowAction
          title="View all cards"
          sub={`${state.deck.length} owned · filter & inspect`}
          actionLabel="View All"
          affordable={state.deck.length > 0}
          onClick={openGallery}
        />
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

      {/* Sell */}
      <SectionCard title="Asset Management" accent="var(--gold)">
        <RowAction
          title="Sell players"
          sub={`${state.deck.length} in squad`}
          actionLabel="Open"
          affordable={state.deck.length > 0}
          onClick={openSell}
        />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// BACKROOM TAB
// ===========================================================================

function BackroomTab({
  state, academy, academyCards, scoutedOpponent,
  onBuyAcademy, onBuyTacticPack, onBuyInvestment, onScoutOpponent, openModal,
}: {
  state: RunState;
  academy: ReturnType<typeof getAcademyTier>;
  academyCards: Card[];
  scoutedOpponent: OpponentBuild | null;
  onBuyAcademy: (card: Card) => void;
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

      {/* Academy — sign prospects; tier upgrades live in the Boardroom (Youth Academy) */}
      <SectionCard
        title={`Academy · Tier ${state.academyTier}`}
        accent="var(--success)"
        right={
          state.academyTier >= 4
            ? <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--gold)' }}>MAX TIER</span>
            : undefined
        }
      >
        <p style={{ fontSize: 10, color: 'var(--dust)', lineHeight: 1.4, marginBottom: 8 }}>
          {academy.name} intake — {academy.cost === 0 ? 'free' : `£${academy.cost.toLocaleString()}`} per prospect.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {academyCards.map(card => {
            const affordable = academy.cost === 0 || state.cash >= academy.cost;
            return (
              <CardCell
                key={card.id}
                model={{ variant: 'player', card }}
                priceLabel={academy.cost === 0 ? 'FREE' : `£${academy.cost.toLocaleString()}`}
                affordable={affordable}
                actionLabel="Sign"
                onAction={() => { if (affordable) onBuyAcademy(card); }}
                onInspect={() => openModal({ variant: 'player', card })}
              />
            );
          })}
        </div>
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
              position: 'absolute',
              top: 4,
              right: 4,
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

function SheetButton({
  label, tone, onClick,
}: {
  label: string;
  tone: 'muted' | 'danger';
  onClick: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <button
      onClick={onClick}
      className={`flex-1 active:scale-[0.98] relative overflow-hidden ${danger ? 'sheen-strong' : 'glass-raised sheen'}`}
      style={{
        height: 46,
        borderRadius: 'var(--radius-sm)',
        border: danger ? '2px solid var(--ink-black)' : undefined,
        background: danger ? 'linear-gradient(135deg, var(--kit-red), #c0241e)' : undefined,
        boxShadow: danger
          ? 'inset 0 1px 0 0 var(--glass-highlight), 0 2px 0 0 var(--ink-black)'
          : 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
        fontFamily: PIXEL,
        fontSize: 11,
        letterSpacing: 0.4,
        color: danger ? 'var(--line-white)' : 'var(--cream)',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
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
