'use client';

import { useState } from 'react';
import type { Card } from '../lib/scoring';
import { seededRandom } from '../lib/scoring';
import type { RunState } from '../lib/run';
import { getShopCards, ALL_CARDS } from '../lib/run';
import {
  SHOP_ITEMS, getTransferFee, ACADEMY_UPGRADE_COST, getAcademyTier,
  generateAcademyDurability,
} from '../lib/economy';
import type { JokerCard as JokerCardType } from '../lib/jokers';
import { getShopJokers } from '../lib/jokers';
import { ALL_FORMATIONS } from '../lib/formations';
import PlayerCard from './PlayerCard';
import JokerCard from './JokerCard';

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

export default function ShopPhase({
  state,
  onBuyCard,
  onSellCard,
  onBuyJoker,
  onBuyAcademy,
  onUpgradeAcademy,
  onBuyTacticPack,
  onBuyFormation,
  onTrainPlayer,
  onNext,
  shopSeed,
}: ShopPhaseProps) {
  const [shopCards] = useState(() => getShopCards(shopSeed, false));
  const [rareCards] = useState(() => getShopCards(shopSeed + 1, true));
  const [shopJokers] = useState(() => getShopJokers(shopSeed + 2, 3));
  const [showCardPick, setShowCardPick] = useState<'normal' | 'rare' | null>(null);
  const [sellMode, setSellMode] = useState(false);
  const [trainMode, setTrainMode] = useState(false);

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

  // Formations the player doesn't own yet
  const unownedFormations = ALL_FORMATIONS.filter(
    f => !state.ownedFormations.includes(f.id)
  );

  return (
    <div className="phase-shop max-w-2xl mx-auto p-4 space-y-5 overflow-y-auto max-h-screen">
      {/* Header + Stats Bar */}
      <div
        className="rounded-[var(--radius)] p-4"
        style={{
          background: 'var(--leather)',
          border: '1px solid rgba(212,160,53,0.25)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-2xl uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
          >
            Transfer Window
          </h2>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.15em]" style={{ color: 'var(--dust)' }}>
              Cash
            </div>
            <div
              className="text-2xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
            >
              {'\u00a3'}{state.cash.toLocaleString()}
            </div>
          </div>
        </div>
        {/* Quick stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <StatChip label="Deck" value={`${state.deck.length} cards`} />
          <StatChip label="Tactics" value={`${state.tacticsDeck.length} cards`} />
          <StatChip
            label="Formations"
            value={state.ownedFormations.length > 0 ? state.ownedFormations.join(', ') : 'None'}
          />
        </div>
        {/* Active jokers inline */}
        {state.jokers.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-3">
            {state.jokers.map(j => (
              <JokerCard key={j.id} joker={j} compact />
            ))}
          </div>
        )}
      </div>

      {/* Joker Shop */}
      {state.jokers.length < 3 && shopJokers.length > 0 && (
        <Section title="Joker Shop">
          <div className="flex gap-3 flex-wrap justify-center">
            {shopJokers
              .filter(j => !state.jokers.some(owned => owned.id === j.id))
              .map(j => (
                <div key={j.id} className="text-center">
                  <JokerCard
                    joker={j}
                    onClick={() => {
                      if (state.cash >= JOKER_COST) onBuyJoker(j);
                    }}
                  />
                  <div
                    className="text-[10px] font-bold mt-1"
                    style={{
                      color: state.cash >= JOKER_COST ? 'var(--gold)' : 'var(--ink)',
                    }}
                  >
                    {'\u00a3'}{JOKER_COST.toLocaleString()}
                  </div>
                </div>
              ))}
          </div>
        </Section>
      )}

      {/* Card Pick Modal */}
      {showCardPick && (
        <div
          className="rounded-[var(--radius-lg)] p-6"
          style={{
            background: 'var(--leather-light)',
            border: '2px solid var(--amber)',
            boxShadow: '0 0 30px var(--amber-glow)',
          }}
        >
          <h3
            className="text-sm uppercase tracking-[0.2em] mb-4 text-center"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--dust)' }}
          >
            Pick 1 of 3
          </h3>
          <div className="flex gap-4 justify-center">
            {(showCardPick === 'rare' ? rareCards : shopCards).map(card => (
              <div key={card.id} className="text-center">
                <PlayerCard
                  card={card}
                  onClick={() => {
                    onBuyCard(card, showCardPick === 'rare' ? RARE_PICK_COST : CARD_PICK_COST);
                    setShowCardPick(null);
                  }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowCardPick(null)}
            className="mt-4 text-sm transition-colors block mx-auto"
            style={{ color: 'var(--dust)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Transfer Market */}
      {!showCardPick && (
        <Section title="Transfer Market">
          <div className="grid grid-cols-2 gap-2">
            <ShopButton
              label="Card Pick"
              desc="Choose 1 of 3"
              cost={CARD_PICK_COST}
              cash={state.cash}
              onClick={() => setShowCardPick('normal')}
            />
            <ShopButton
              label="Rare+ Pick"
              desc="Rare or better"
              cost={RARE_PICK_COST}
              cash={state.cash}
              onClick={() => setShowCardPick('rare')}
            />
          </div>
        </Section>
      )}

      {/* Tactic Pack */}
      <Section title="Tactical Intelligence">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
              Tactic Pack
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--dust)' }}>
              2 random tactics added to your deck
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--dust)' }}>
              Tactics: {state.tacticsDeck.length} cards
            </div>
          </div>
          <button
            disabled={state.cash < TACTIC_PACK_COST}
            onClick={onBuyTacticPack}
            className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-bold uppercase transition-all"
            style={{
              background: state.cash >= TACTIC_PACK_COST ? 'rgba(212,160,53,0.15)' : 'var(--leather)',
              color: state.cash >= TACTIC_PACK_COST ? 'var(--gold)' : 'var(--ink)',
              border: `1px solid ${state.cash >= TACTIC_PACK_COST ? 'rgba(212,160,53,0.3)' : 'rgba(154,139,115,0.15)'}`,
              cursor: state.cash >= TACTIC_PACK_COST ? 'pointer' : 'not-allowed',
            }}
          >
            {'\u00a3'}{TACTIC_PACK_COST.toLocaleString()}
          </button>
        </div>
      </Section>

      {/* Formation Cards */}
      <Section title="Formation Scouting">
        {unownedFormations.length === 0 ? (
          <div
            className="text-sm text-center py-2"
            style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}
          >
            All formations owned ✓
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {unownedFormations.map(f => (
              <div
                key={f.id}
                className="rounded-[var(--radius-sm)] p-3"
                style={{
                  background: 'var(--leather-light)',
                  border: '1px solid rgba(154,139,115,0.15)',
                }}
              >
                <div
                  className="text-sm font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
                >
                  {f.name}
                </div>
                <div
                  className="text-[9px] mt-1 mb-2 leading-snug"
                  style={{ color: 'var(--dust)' }}
                >
                  {f.description}
                </div>
                <button
                  disabled={state.cash < FORMATION_COST}
                  onClick={() => onBuyFormation(f.id)}
                  className="w-full px-2 py-1 rounded text-[10px] font-bold uppercase transition-all"
                  style={{
                    background: state.cash >= FORMATION_COST ? 'rgba(212,160,53,0.15)' : 'transparent',
                    color: state.cash >= FORMATION_COST ? 'var(--gold)' : 'var(--ink)',
                    border: `1px solid ${state.cash >= FORMATION_COST ? 'rgba(212,160,53,0.3)' : 'rgba(154,139,115,0.1)'}`,
                    cursor: state.cash >= FORMATION_COST ? 'pointer' : 'not-allowed',
                  }}
                >
                  Buy — {'\u00a3'}{FORMATION_COST.toLocaleString()}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Academy */}
      <Section title={`Academy (Tier ${state.academyTier} \u2014 ${academy.name})`}>
        <div className="flex items-center justify-between mb-3">
          <div />
          {state.academyTier < 4 && (
            <button
              disabled={state.cash < ACADEMY_UPGRADE_COST}
              onClick={onUpgradeAcademy}
              className="px-3 py-1 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase transition-all"
              style={{
                background:
                  state.cash >= ACADEMY_UPGRADE_COST
                    ? 'rgba(212,160,53,0.15)'
                    : 'var(--leather)',
                color:
                  state.cash >= ACADEMY_UPGRADE_COST
                    ? 'var(--gold)'
                    : 'var(--ink)',
                border: `1px solid ${
                  state.cash >= ACADEMY_UPGRADE_COST
                    ? 'rgba(212,160,53,0.3)'
                    : 'rgba(154,139,115,0.15)'
                }`,
                cursor: state.cash >= ACADEMY_UPGRADE_COST ? 'pointer' : 'not-allowed',
              }}
            >
              Upgrade {'\u00a3'}{ACADEMY_UPGRADE_COST.toLocaleString()}
            </button>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          {academyCards.map(card => (
            <div key={card.id} className="text-center">
              <PlayerCard
                card={card}
                size="mini"
                onClick={() => {
                  if (academy.cost === 0 || state.cash >= academy.cost) {
                    onBuyAcademy(card);
                  }
                }}
              />
              <div
                className="text-[10px] font-bold mt-1"
                style={{ color: 'var(--gold)' }}
              >
                {academy.cost === 0 ? 'FREE' : `\u00a3${academy.cost.toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Training */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setTrainMode(!trainMode);
              if (sellMode) setSellMode(false);
            }}
            className="text-sm font-bold uppercase tracking-[0.15em] transition-colors"
            style={{ color: trainMode ? 'var(--amber)' : 'var(--dust)' }}
          >
            {trainMode ? '\u2716 Cancel Training' : '\ud83c\udfd8\ufe0f Train Players'}
          </button>
          {trainMode && (
            <div className="text-[9px]" style={{ color: 'var(--dust)' }}>
              +{TRAINING_INCREMENT} power — {'\u00a3'}{TRAINING_COST.toLocaleString()} each
            </div>
          )}
        </div>
        {trainMode && (
          <div className="flex flex-wrap gap-2 justify-center">
            {state.deck.map(card => {
              const applied = state.trainingApplied[card.id] ?? 0;
              const isMax = applied >= TRAINING_MAX;
              const canAfford = state.cash >= TRAINING_COST;
              return (
                <div key={card.id} className="relative text-center">
                  <PlayerCard
                    card={card}
                    size="mini"
                    onClick={() => {
                      if (!isMax && canAfford) {
                        onTrainPlayer(card.id);
                      }
                    }}
                  />
                  {/* Training badge */}
                  <div
                    className="absolute top-0 right-0 text-[8px] font-bold px-1 rounded-bl"
                    style={{
                      background: isMax ? 'var(--amber)' : 'var(--gold)',
                      color: 'var(--felt)',
                      opacity: (!isMax && !canAfford) ? 0.4 : 1,
                    }}
                  >
                    {isMax ? 'MAX' : applied > 0 ? `+${applied}` : '+0'}
                  </div>
                  {isMax && (
                    <div
                      className="absolute inset-0 rounded flex items-end justify-center pb-1"
                      style={{ background: 'rgba(0,0,0,0.3)' }}
                    />
                  )}
                </div>
              );
            })}
            {state.deck.length === 0 && (
              <div className="text-sm py-4" style={{ color: 'var(--dust)' }}>
                No cards to train
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sell Cards */}
      <div className="space-y-2">
        <button
          onClick={() => {
            setSellMode(!sellMode);
            if (trainMode) setTrainMode(false);
          }}
          className="text-sm font-bold uppercase tracking-[0.15em] transition-colors"
          style={{ color: sellMode ? 'var(--amber)' : 'var(--dust)' }}
        >
          {sellMode ? '\u2716 Cancel Selling' : '\uD83D\uDCB0 Sell Cards'}
        </button>
        {sellMode && (
          <div className="flex flex-wrap gap-2 justify-center">
            {state.deck.map(card => (
              <PlayerCard
                key={card.id}
                card={card}
                size="mini"
                showSellPrice
                onClick={() => {
                  if (confirm(`Sell ${card.name} for \u00a3${getTransferFee(card).toLocaleString()}?`)) {
                    onSellCard(card);
                  }
                }}
              />
            ))}
            {state.deck.length === 0 && (
              <div className="text-sm py-4" style={{ color: 'var(--dust)' }}>
                No cards to sell
              </div>
            )}
          </div>
        )}
      </div>

      {/* Next Match */}
      <div className="flex justify-center pt-4 pb-8">
        <button
          onClick={onNext}
          className="px-10 py-4 rounded-[var(--radius)] text-lg uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
          style={{
            fontFamily: 'var(--font-display)',
            background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
            color: 'var(--cream)',
            boxShadow: '0 4px 20px var(--amber-glow)',
          }}
        >
          Next Match {'\u2192'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius)] p-4"
      style={{
        background: 'var(--leather)',
        border: '1px solid rgba(154,139,115,0.15)',
      }}
    >
      <h3
        className="text-xs font-bold uppercase tracking-[0.2em] mb-3"
        style={{ color: 'var(--dust)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[9px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--dust)' }}
      >
        {label}:
      </span>
      <span
        className="text-[10px] font-bold"
        style={{ color: 'var(--cream)' }}
      >
        {value}
      </span>
    </div>
  );
}

function ShopButton({
  label,
  desc,
  cost,
  cash,
  onClick,
}: {
  label: string;
  desc: string;
  cost: number;
  cash: number;
  onClick: () => void;
}) {
  const canAfford = cash >= cost;
  return (
    <button
      disabled={!canAfford}
      onClick={onClick}
      className="p-3 rounded-[var(--radius-sm)] text-left transition-all"
      style={{
        background: canAfford ? 'var(--leather-light)' : 'var(--leather)',
        border: `1px solid ${canAfford ? 'rgba(154,139,115,0.2)' : 'rgba(154,139,115,0.08)'}`,
        opacity: canAfford ? 1 : 0.4,
        cursor: canAfford ? 'pointer' : 'not-allowed',
      }}
    >
      <div
        className="text-xs font-bold"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
      >
        {label}
      </div>
      <div className="text-[9px]" style={{ color: 'var(--dust)' }}>
        {desc}
      </div>
      <div
        className="text-xs font-bold mt-1"
        style={{ color: 'var(--gold)' }}
      >
        {'\u00a3'}{cost.toLocaleString()}
      </div>
    </button>
  );
}
