'use client';

/**
 * Kickoff Clash — Transfer Window / Shop
 *
 * One-viewport, no-page-scroll shop on the new pixel card system. A fixed
 * header (cash · points · deck) and a fixed NEXT MATCH footer bracket three
 * segmented tabs:
 *   • MARKET   — buy players (Card Pick / Rare+ Pick), sign gaffers, reroll.
 *   • SQUAD    — train, heal, sell from the deck you already own.
 *   • BACKROOM — academy intake + upgrade, tactic pack, formations, scouting.
 *
 * Every player/manager/tactic renders as a GameCard and taps to open CardModal.
 * Card picks and sell-confirms are bottom-sheet overlays — the only scroll is
 * internal to a tab body or a sheet, never the document.
 *
 * UI ONLY: behaviour comes entirely from the callback props + the seeded
 * generators; the prop contract and seed math are unchanged.
 */

import { useMemo, useState } from 'react';
import type { Card } from '../lib/scoring';
import { seededRandom } from '../lib/scoring';
import type { RunState, OpponentBuild } from '../lib/run';
import { getShopCards, ALL_CARDS } from '../lib/run';
import {
  getTransferFee, ACADEMY_UPGRADE_COST, getAcademyTier,
  generateAcademyDurability,
} from '../lib/economy';
import type { JokerCard as JokerCardType } from '../lib/jokers';
import { getShopJokers } from '../lib/jokers';
import { ALL_FORMATIONS } from '../lib/formations';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { PIXEL, RARITY_COLOR, lastName } from './cards/cardTokens';

interface ShopPhaseProps {
  state: RunState;
  onBuyCard: (card: Card, cost: number) => void;
  onSellCard: (card: Card) => void;
  onBuyJoker: (joker: JokerCardType) => void;
  onBuyAcademy: (card: Card) => void;
  onUpgradeAcademy: () => void;
  onBuyTacticPack: () => void;
  onBuyFormation: (formationId: string) => void;
  onTrainPlayer: (cardId: number) => void;
  onRerollShop: () => boolean;
  onHealPlayer: (cardId: number) => boolean;
  onScoutOpponent: () => boolean;
  scoutedOpponent: OpponentBuild | null;
  onNext: () => void;
  shopSeed: number;
}

const CARD_PICK_COST = 15_000;
const RARE_PICK_COST = 35_000;
const JOKER_COST = 25_000;
const TACTIC_PACK_COST = 10_000;
const FORMATION_COST = 20_000;
const TRAINING_COST = 8_000;
const TRAINING_INCREMENT = 5;
const TRAINING_MAX = 20;
const REROLL_COST = 8_000;
const HEAL_COST = 12_000;
const SCOUT_COST = 10_000;

type Tab = 'market' | 'squad' | 'backroom';

type Sheet =
  | { kind: 'pick'; rare: boolean }
  | { kind: 'sell'; card: Card }
  | null;

const fmt = (n: number) => '£' + n.toLocaleString();

export default function ShopPhase(props: ShopPhaseProps) {
  const {
    state, onBuyCard, onSellCard, onBuyJoker, onBuyAcademy, onUpgradeAcademy,
    onBuyTacticPack, onBuyFormation, onTrainPlayer, onRerollShop, onHealPlayer,
    onScoutOpponent, scoutedOpponent, onNext, shopSeed,
  } = props;

  const [tab, setTab] = useState<Tab>('market');
  const [rerollCount, setRerollCount] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);

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

  const academy = getAcademyTier(state.academyTier);
  const acSeed = shopSeed + 777;
  const academyDurabilities = generateAcademyDurability(state.academyTier, academy.playersOffered, acSeed);
  const academyPool = useMemo(() => ALL_CARDS.filter(c => {
    if (academy.maxRarity === 'Common') return c.rarity === 'Common';
    if (academy.maxRarity === 'Rare') return c.rarity === 'Common' || c.rarity === 'Rare';
    return c.rarity !== 'Legendary';
  }), [academy.maxRarity]);

  const academyCards: Card[] = useMemo(() => {
    const out: Card[] = [];
    for (let i = 0; i < academy.playersOffered && i < academyPool.length; i++) {
      const idx = Math.floor(seededRandom(acSeed + i * 31) * academyPool.length);
      const base = academyPool[idx];
      out.push({
        ...base,
        id: state.seed + 90000 + state.round * 100 + i,
        durability: academyDurabilities[i],
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyPool, academy.playersOffered, acSeed, state.seed, state.round]);

  const unownedFormations = ALL_FORMATIONS.filter(f => !state.ownedFormations.includes(f.id));

  const trainableCards = [...state.deck]
    .map((card) => ({ card, applied: state.trainingApplied[card.id] ?? 0 }))
    .sort((a, b) => {
      const aMax = a.applied >= TRAINING_MAX ? 1 : 0;
      const bMax = b.applied >= TRAINING_MAX ? 1 : 0;
      if (aMax !== bMax) return aMax - bMax;
      return b.card.power - a.card.power;
    });
  const injuredCards = state.deck.filter((card) => card.injured);

  const availableShopJokers = shopJokers.filter(
    j => !state.jokers.some(owned => owned.id === j.id),
  );

  function reroll() {
    if (state.cash < REROLL_COST) return;
    if (onRerollShop()) {
      setRerollCount((p) => p + 1);
      setSheet(null);
    }
  }

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      style={{
        height: '100dvh',
        background: 'var(--felt)',
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      <Header state={state} onInspectManager={(m) => setModal({ variant: 'manager', manager: m })} />

      {/* Tab bar */}
      <div className="shrink-0 px-3 mt-2">
        <div
          className="flex"
          style={{ borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)', overflow: 'hidden' }}
        >
          {([
            { id: 'market', label: 'MARKET' },
            { id: 'squad', label: 'SQUAD' },
            { id: 'backroom', label: 'BACKROOM' },
          ] as { id: Tab; label: string }[]).map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 active:scale-[0.98]"
                style={{
                  fontFamily: PIXEL,
                  fontSize: 11,
                  letterSpacing: 0.5,
                  height: 36,
                  background: on ? 'var(--amber)' : 'var(--surface)',
                  color: on ? 'var(--ink-black)' : 'var(--cream-soft)',
                  transition: 'background 0.15s ease',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab body — the only region that flexes / scrolls internally */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 mt-2.5"
        style={{ overscrollBehavior: 'contain' }}
      >
        {tab === 'market' && (
          <MarketTab
            state={state}
            availableShopJokers={availableShopJokers}
            onOpenPick={(rare) => setSheet({ kind: 'pick', rare })}
            onBuyJoker={onBuyJoker}
            onReroll={reroll}
            onInspectManager={(m) => setModal({ variant: 'manager', manager: m })}
          />
        )}
        {tab === 'squad' && (
          <SquadTab
            state={state}
            trainableCards={trainableCards}
            injuredCards={injuredCards}
            onTrainPlayer={onTrainPlayer}
            onHealPlayer={onHealPlayer}
            onSell={(card) => setSheet({ kind: 'sell', card })}
            onInspect={(card) => setModal({ variant: 'player', card })}
          />
        )}
        {tab === 'backroom' && (
          <BackroomTab
            state={state}
            academyCards={academyCards}
            academyName={academy.name}
            academyCost={academy.cost}
            unownedFormations={unownedFormations}
            scoutedOpponent={scoutedOpponent}
            onBuyAcademy={onBuyAcademy}
            onUpgradeAcademy={onUpgradeAcademy}
            onBuyTacticPack={onBuyTacticPack}
            onBuyFormation={onBuyFormation}
            onScoutOpponent={onScoutOpponent}
            onInspect={(card) => setModal({ variant: 'player', card })}
          />
        )}
      </div>

      {/* Footer CTA */}
      <div className="shrink-0 px-3 pt-2.5">
        <button
          onClick={onNext}
          className="w-full active:scale-[0.98]"
          style={{
            fontFamily: PIXEL,
            fontSize: 15,
            letterSpacing: 0.5,
            color: 'var(--cream)',
            height: 50,
            borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--ink-black)',
            background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
            boxShadow: '0 4px 0 0 var(--ink-black), 0 6px 18px var(--amber-glow)',
            transition: 'transform 0.12s ease',
          }}
        >
          NEXT MATCH {'→'}
        </button>
      </div>

      {/* ── Sheets ─────────────────────────────────────────────────────── */}
      {sheet?.kind === 'pick' && (
        <PickSheet
          rare={sheet.rare}
          cards={sheet.rare ? rareCards : shopCards}
          cost={sheet.rare ? RARE_PICK_COST : CARD_PICK_COST}
          cash={state.cash}
          onPick={(card, cost) => {
            onBuyCard(card, cost);
            setSheet(null);
          }}
          onInspect={(card) => setModal({ variant: 'player', card })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'sell' && (
        <SellSheet
          card={sheet.card}
          fee={getTransferFee(sheet.card)}
          onConfirm={() => {
            onSellCard(sheet.card);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />
    </div>
  );
}

// ===========================================================================
// Header
// ===========================================================================

function Header({ state, onInspectManager }: { state: RunState; onInspectManager: (m: JokerCardType) => void }) {
  return (
    <div className="shrink-0 px-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col mr-auto min-w-0">
          <span
            className="uppercase truncate"
            style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', textShadow: '0 2px 0 var(--ink-black)', letterSpacing: 0.5 }}
          >
            Transfer Window
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>
            MATCH {state.round} {'·'} {state.deck.length} IN SQUAD
          </span>
        </div>

        {/* Cash badge */}
        <div
          className="flex flex-col items-end justify-center shrink-0"
          style={{
            height: 40,
            padding: '0 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 2px 0 0 var(--ink-black)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)' }}>CASH</span>
          <span style={{ fontFamily: PIXEL, fontSize: 14, lineHeight: 1, color: 'var(--gold)', marginTop: 2 }}>
            {fmt(state.cash)}
          </span>
        </div>

        {/* Board target */}
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            width: 56,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '2px solid var(--ink-black)',
            boxShadow: '0 2px 0 0 var(--ink-black)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: 'var(--line-white)' }}>
            {state.seasonPoints}/{state.boardTargetPoints}
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: 'var(--dust)', marginTop: 2 }}>TARGET</span>
        </div>
      </div>

      {/* Active gaffers */}
      {state.jokers.length > 0 && (
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {state.jokers.map((j) => (
            <button
              key={j.id}
              onClick={() => onInspectManager(j)}
              className="flex items-center gap-1.5 px-2 active:scale-95"
              style={{
                height: 26,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '2px solid var(--kit-red)',
                transition: 'transform 0.12s ease',
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>{'\u{1F454}'}</span>
              <span className="truncate" style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream)', maxWidth: 110 }}>
                {j.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Shared primitives
// ===========================================================================

function Block({ title, hint, accent, children }: {
  title: string; hint?: string; accent?: string; children: React.ReactNode;
}) {
  return (
    <div
      className="mb-2.5"
      style={{
        background: 'var(--surface)',
        border: '2px solid var(--ink-black)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 2px 0 0 var(--ink-black)',
        padding: 10,
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span style={{ fontFamily: PIXEL, fontSize: 10, letterSpacing: 0.5, color: accent ?? 'var(--cream)' }}>
          {title}
        </span>
        {hint && (
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.5, color: 'var(--dust)' }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Price-bearing action button. Dim + non-interactive when unaffordable. */
function BuyButton({ label, cost, cash, accent = 'var(--amber)', onClick, disabled, fullWidth }: {
  label: string; cost: number | null; cash: number; accent?: string;
  onClick: () => void; disabled?: boolean; fullWidth?: boolean;
}) {
  const free = cost === 0;
  const canAfford = free || cost == null || cash >= cost;
  const enabled = canAfford && !disabled;
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={`active:scale-[0.97] ${fullWidth ? 'w-full' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        minHeight: 42,
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        border: `2px solid ${enabled ? 'var(--ink-black)' : 'rgba(7,16,11,0.5)'}`,
        background: enabled ? accent : 'var(--surface)',
        color: enabled ? 'var(--ink-black)' : 'var(--ink)',
        boxShadow: enabled ? '0 3px 0 0 var(--ink-black)' : 'none',
        opacity: enabled ? 1 : 0.5,
        transition: 'transform 0.12s ease',
        cursor: enabled ? 'pointer' : 'not-allowed',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 10, letterSpacing: 0.5, lineHeight: 1 }}>{label}</span>
      {cost != null && (
        <span style={{ fontFamily: PIXEL, fontSize: 8, lineHeight: 1, opacity: enabled ? 0.85 : 1 }}>
          {free ? 'FREE' : fmt(cost)}
        </span>
      )}
    </button>
  );
}

/** Small inspect pip placed over a GameCard so tap-to-buy keeps working. */
function InfoPip({ onClick }: { onClick: () => void }) {
  return (
    <span
      role="button"
      aria-label="Inspect"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute flex items-center justify-center active:scale-90"
      style={{
        top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
        background: 'var(--surface)', border: '2px solid var(--ink-black)',
        color: 'var(--cream)', fontFamily: PIXEL, fontSize: 9, lineHeight: 1,
        zIndex: 2, transition: 'transform 0.12s ease',
      }}
    >
      i
    </span>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-center"
      style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: 'var(--dust)', padding: '12px 0' }}
    >
      {children}
    </div>
  );
}

// ===========================================================================
// MARKET tab
// ===========================================================================

function MarketTab({ state, availableShopJokers, onOpenPick, onBuyJoker, onReroll, onInspectManager }: {
  state: RunState;
  availableShopJokers: JokerCardType[];
  onOpenPick: (rare: boolean) => void;
  onBuyJoker: (j: JokerCardType) => void;
  onReroll: () => void;
  onInspectManager: (m: JokerCardType) => void;
}) {
  const jokerSlotsFull = state.jokers.length >= 3;
  return (
    <>
      <Block title="TRANSFER MARKET" hint="PICK 1 OF 3">
        <div className="grid grid-cols-2 gap-2">
          <BuyButton label="CARD PICK" cost={CARD_PICK_COST} cash={state.cash} onClick={() => onOpenPick(false)} />
          <BuyButton label="RARE+ PICK" cost={RARE_PICK_COST} cash={state.cash} accent="var(--gold)" onClick={() => onOpenPick(true)} />
        </div>
      </Block>

      <Block title="GAFFER MARKET" accent="var(--kit-red)" hint={jokerSlotsFull ? 'BENCH FULL' : `${state.jokers.length}/3 SLOTS`}>
        {jokerSlotsFull ? (
          <EmptyNote>Gaffer slots full — 3/3 hired.</EmptyNote>
        ) : availableShopJokers.length === 0 ? (
          <EmptyNote>No gaffers available — reroll the market.</EmptyNote>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ overscrollBehavior: 'contain' }}>
            {availableShopJokers.map((j) => {
              const canAfford = state.cash >= JOKER_COST;
              return (
                <div key={j.id} className="shrink-0" style={{ width: 104 }}>
                  <div className="relative">
                    <GameCard
                      model={{ variant: 'manager', manager: j }}
                      dimmed={!canAfford}
                      onClick={() => onInspectManager(j)}
                    />
                  </div>
                  <BuyButton
                    label="SIGN" cost={JOKER_COST} cash={state.cash} accent="var(--kit-red)"
                    fullWidth onClick={() => onBuyJoker(j)}
                  />
                  <div style={{ height: 8 }} />
                </div>
              );
            })}
          </div>
        )}
      </Block>

      <Block title="REROLL MARKET" accent="var(--gold)" hint="REFRESH OFFERS">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.35, color: 'var(--cream-soft)', flex: 1 }}>
            Refresh the player picks and gaffer market to hunt a better fit.
          </span>
          <BuyButton label="REROLL" cost={REROLL_COST} cash={state.cash} accent="var(--gold)" onClick={onReroll} />
        </div>
      </Block>
    </>
  );
}

// ===========================================================================
// SQUAD tab
// ===========================================================================

function SquadTab({ state, trainableCards, injuredCards, onTrainPlayer, onHealPlayer, onSell, onInspect }: {
  state: RunState;
  trainableCards: { card: Card; applied: number }[];
  injuredCards: Card[];
  onTrainPlayer: (id: number) => void;
  onHealPlayer: (id: number) => boolean;
  onSell: (card: Card) => void;
  onInspect: (card: Card) => void;
}) {
  const improvable = trainableCards.filter(({ applied }) => applied < TRAINING_MAX).length;
  return (
    <>
      <Block title="TRAINING GROUND" accent="var(--amber)" hint={`+${TRAINING_INCREMENT} / SESSION · ${improvable} CAN IMPROVE`}>
        {state.deck.length === 0 ? (
          <EmptyNote>No players in the squad to train.</EmptyNote>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ overscrollBehavior: 'contain' }}>
            {trainableCards.map(({ card, applied }) => {
              const isMax = applied >= TRAINING_MAX;
              const canAfford = state.cash >= TRAINING_COST;
              return (
                <div key={card.id} className="shrink-0" style={{ width: 96 }}>
                  <div className="relative">
                    <GameCard model={{ variant: 'player', card }} dimmed={isMax} onClick={() => onInspect(card)} />
                    <span
                      className="absolute"
                      style={{
                        top: -6, left: -6, padding: '2px 5px', borderRadius: 'var(--radius-sm)',
                        background: isMax ? 'var(--gold)' : applied > 0 ? 'var(--amber)' : 'var(--surface)',
                        border: '2px solid var(--ink-black)',
                        fontFamily: PIXEL, fontSize: 8, lineHeight: 1, zIndex: 2,
                        color: applied > 0 || isMax ? 'var(--ink-black)' : 'var(--dust)',
                      }}
                    >
                      {isMax ? 'MAX' : `+${applied}`}
                    </span>
                  </div>
                  <BuyButton
                    label={isMax ? 'MAXED' : 'TRAIN'} cost={isMax ? null : TRAINING_COST} cash={state.cash}
                    accent="var(--amber)" fullWidth disabled={isMax} onClick={() => onTrainPlayer(card.id)}
                  />
                  <div style={{ height: 8 }} />
                </div>
              );
            })}
          </div>
        )}
      </Block>

      <Block title="MEDICAL ROOM" accent="var(--danger)" hint={injuredCards.length > 0 ? `${injuredCards.length} INJURED` : 'ALL FIT'}>
        {injuredCards.length === 0 ? (
          <EmptyNote>Squad fully fit — no treatment needed.</EmptyNote>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ overscrollBehavior: 'contain' }}>
            {injuredCards.map((card) => (
              <div key={card.id} className="shrink-0" style={{ width: 96 }}>
                <div className="relative">
                  <GameCard model={{ variant: 'player', card }} dimmed onClick={() => onInspect(card)} />
                </div>
                <BuyButton
                  label="HEAL" cost={HEAL_COST} cash={state.cash} accent="var(--danger)"
                  fullWidth onClick={() => onHealPlayer(card.id)}
                />
                <div style={{ height: 8 }} />
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block title="SELL PLAYERS" hint="RECOUP CASH">
        {state.deck.length === 0 ? (
          <EmptyNote>No players to sell.</EmptyNote>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ overscrollBehavior: 'contain' }}>
            {state.deck.map((card) => (
              <div key={card.id} className="shrink-0" style={{ width: 96 }}>
                <div className="relative">
                  <GameCard model={{ variant: 'player', card }} onClick={() => onInspect(card)} />
                </div>
                <BuyButton
                  label="SELL" cost={getTransferFee(card)} cash={Infinity} accent="var(--cream-soft)"
                  fullWidth onClick={() => onSell(card)}
                />
                <div style={{ height: 8 }} />
              </div>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}

// ===========================================================================
// BACKROOM tab
// ===========================================================================

function BackroomTab({
  state, academyCards, academyName, academyCost, unownedFormations, scoutedOpponent,
  onBuyAcademy, onUpgradeAcademy, onBuyTacticPack, onBuyFormation, onScoutOpponent, onInspect,
}: {
  state: RunState;
  academyCards: Card[];
  academyName: string;
  academyCost: number;
  unownedFormations: typeof ALL_FORMATIONS;
  scoutedOpponent: OpponentBuild | null;
  onBuyAcademy: (card: Card) => void;
  onUpgradeAcademy: () => void;
  onBuyTacticPack: () => void;
  onBuyFormation: (id: string) => void;
  onScoutOpponent: () => boolean;
  onInspect: (card: Card) => void;
}) {
  return (
    <>
      <Block
        title={`ACADEMY · ${academyName.toUpperCase()}`}
        accent="var(--pitch-light)"
        hint={`TIER ${state.academyTier}/4`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.35, color: 'var(--cream-soft)', flex: 1 }}>
            Cheap prospects with durability variance. {academyCost === 0 ? 'Intake is free.' : `${fmt(academyCost)} each.`}
          </span>
          {state.academyTier < 4 && (
            <BuyButton
              label="UPGRADE" cost={ACADEMY_UPGRADE_COST} cash={state.cash} accent="var(--pitch-light)"
              onClick={onUpgradeAcademy}
            />
          )}
        </div>
        {academyCards.length === 0 ? (
          <EmptyNote>No prospects this window.</EmptyNote>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ overscrollBehavior: 'contain' }}>
            {academyCards.map((card) => (
              <div key={card.id} className="shrink-0" style={{ width: 96 }}>
                <div className="relative">
                  <GameCard model={{ variant: 'player', card }} onClick={() => onInspect(card)} />
                </div>
                <BuyButton
                  label="SIGN" cost={academyCost} cash={state.cash} accent="var(--pitch-light)"
                  fullWidth onClick={() => onBuyAcademy(card)}
                />
                <div style={{ height: 8 }} />
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block title="TACTIC PACK" accent="var(--kit-blue)" hint={`${state.tacticsDeck.length} TACTICS OWNED`}>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.35, color: 'var(--cream-soft)', flex: 1 }}>
            Two random tactic cards added to your deck. Systems, not just bodies.
          </span>
          <BuyButton label="BUY PACK" cost={TACTIC_PACK_COST} cash={state.cash} accent="var(--kit-blue)" onClick={onBuyTacticPack} />
        </div>
      </Block>

      <Block title="FORMATION SCOUTING" hint={unownedFormations.length === 0 ? 'ALL OWNED' : `${unownedFormations.length} LEFT`}>
        {unownedFormations.length === 0 ? (
          <EmptyNote>All formations owned {'✓'}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {unownedFormations.map((f) => {
              const canAfford = state.cash >= FORMATION_COST;
              return (
                <div key={f.id} className="flex items-center gap-2">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream)', lineHeight: 1.1 }}>{f.name}</span>
                    <span className="truncate" style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--dust)', marginTop: 2 }}>
                      {f.description}
                    </span>
                  </div>
                  <BuyButton label="BUY" cost={FORMATION_COST} cash={state.cash} onClick={() => onBuyFormation(f.id)} disabled={!canAfford} />
                </div>
              );
            })}
          </div>
        )}
      </Block>

      <Block title="SCOUT REPORT" accent="var(--gold)" hint={scoutedOpponent ? 'REPORT READY' : 'NEXT OPPONENT'}>
        {scoutedOpponent ? (
          <div className="flex flex-col gap-1.5">
            <span style={{ fontFamily: PIXEL, fontSize: 11, color: 'var(--cream)' }}>{scoutedOpponent.name}</span>
            <ScoutRow label="STYLE" value={scoutedOpponent.style} />
            <ScoutRow label="WEAKNESS" value={scoutedOpponent.weakness} color="var(--success)" />
            <ScoutRow label="STAR" value={`${scoutedOpponent.starPlayer.name} (${scoutedOpponent.starPlayer.archetype})`} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.35, color: 'var(--cream-soft)', flex: 1 }}>
              Buy intel on your next opponent before you shape the squad.
            </span>
            <BuyButton label="SCOUT" cost={SCOUT_COST} cash={state.cash} accent="var(--gold)" onClick={onScoutOpponent} />
          </div>
        )}
      </Block>
    </>
  );
}

function ScoutRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--dust)', width: 64, flexShrink: 0, marginTop: 1 }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.3, color: color ?? 'var(--cream)' }}>
        {value}
      </span>
    </div>
  );
}

// ===========================================================================
// Sheets
// ===========================================================================

function SheetShell({ accent, title, hint, onClose, children }: {
  accent: string; title: string; hint?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col justify-end scrim-fade"
      style={{ background: 'rgba(0,0,0,0.55)', zIndex: 40 }}
      onClick={onClose}
    >
      <div
        className="sheet-rise rounded-t-[16px] flex flex-col"
        style={{
          background: 'var(--felt)',
          borderTop: `3px solid ${accent}`,
          maxHeight: '70%',
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-2 shrink-0">
          <span style={{ fontFamily: PIXEL, fontSize: 13, letterSpacing: 0.5, color: 'var(--cream)' }}>{title}</span>
          {hint ? (
            <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: 'var(--dust)' }}>{hint}</span>
          ) : (
            <button onClick={onClose} style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)', padding: '4px 6px' }}>CLOSE</button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function PickSheet({ rare, cards, cost, cash, onPick, onInspect, onClose }: {
  rare: boolean; cards: Card[]; cost: number; cash: number;
  onPick: (card: Card, cost: number) => void;
  onInspect: (card: Card) => void;
  onClose: () => void;
}) {
  const canAfford = cash >= cost;
  return (
    <SheetShell
      accent={rare ? 'var(--gold)' : 'var(--amber)'}
      title={rare ? 'RARE+ PICK' : 'CARD PICK'}
      hint={`PICK 1 · ${fmt(cost)}`}
      onClose={onClose}
    >
      <div className="px-3 pb-2 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        <div className="grid grid-cols-3 gap-2">
          {cards.map((card) => (
            <div key={card.id} className="relative">
              <GameCard
                model={{ variant: 'player', card }}
                dimmed={!canAfford}
                onClick={() => { if (canAfford) onPick(card, cost); }}
              />
              <InfoPip onClick={() => onInspect(card)} />
            </div>
          ))}
        </div>
        {!canAfford && (
          <div className="text-center" style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--danger)', paddingTop: 10 }}>
            NOT ENOUGH CASH
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full active:scale-[0.98]"
          style={{
            marginTop: 12, height: 40, borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--ink-black)', background: 'var(--surface)',
            color: 'var(--cream-soft)', fontFamily: PIXEL, fontSize: 11, letterSpacing: 0.5,
            transition: 'transform 0.12s ease',
          }}
        >
          CANCEL
        </button>
      </div>
    </SheetShell>
  );
}

function SellSheet({ card, fee, onConfirm, onClose }: {
  card: Card; fee: number; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <SheetShell accent={RARITY_COLOR[card.rarity] ?? 'var(--border)'} title="SELL PLAYER" onClose={onClose}>
      <div className="px-3 pb-3 flex flex-col items-center" style={{ gap: 12 }}>
        <div style={{ width: 120 }}>
          <GameCard model={{ variant: 'player', card }} />
        </div>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--cream-soft)', textAlign: 'center' }}>
          Sell <b style={{ color: 'var(--cream)' }}>{lastName(card.name)}</b> for{' '}
          <b style={{ color: 'var(--gold)' }}>{fmt(fee)}</b>? Their chemistry is lost.
        </span>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button
            onClick={onClose}
            className="active:scale-[0.98]"
            style={{
              height: 44, borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)',
              background: 'var(--surface)', color: 'var(--cream-soft)',
              fontFamily: PIXEL, fontSize: 11, letterSpacing: 0.5, transition: 'transform 0.12s ease',
            }}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="active:scale-[0.98]"
            style={{
              height: 44, borderRadius: 'var(--radius-sm)', border: '2px solid var(--ink-black)',
              background: 'var(--danger)', color: 'var(--line-white)',
              fontFamily: PIXEL, fontSize: 11, letterSpacing: 0.5,
              boxShadow: '0 3px 0 0 var(--ink-black)', transition: 'transform 0.12s ease',
            }}
          >
            SELL {fmt(fee)}
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
