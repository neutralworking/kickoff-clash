'use client';

import { useMemo, useState } from 'react';
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
import type { OpponentBuild } from '../lib/run';
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
          <StatChip label="Points" value={`${state.seasonPoints}/${state.boardTargetPoints}`} />
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

      {/* Featured actions */}
      {!showCardPick && (
        <Section title="Do Something Useful">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FeatureCard
              title="Buy Prospects"
              subtitle={`${academy.playersOffered} academy players waiting`}
              accent="var(--pitch-green)"
              active
            >
              <div className="text-[11px]" style={{ color: 'var(--cream-soft)' }}>
                Academy players are purchaseable here right now.
              </div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--gold)' }}>
                {academy.cost === 0 ? 'Each prospect is FREE' : `Each prospect costs £${academy.cost.toLocaleString()}`}
              </div>
            </FeatureCard>

            <FeatureCard
              title="Train Core"
              subtitle={`${trainableCards.filter(({ applied }) => applied < TRAINING_MAX).length} players can still improve`}
              accent="var(--amber)"
              active={state.deck.length > 0}
            >
              <div className="text-[11px]" style={{ color: 'var(--cream-soft)' }}>
                Spend £{TRAINING_COST.toLocaleString()} for +{TRAINING_INCREMENT} power, up to +{TRAINING_MAX}.
              </div>
              <button
                onClick={() => {
                  setTrainMode(true);
                  setSellMode(false);
                }}
                className="mt-2 px-3 py-1 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase"
                style={{
                  background: 'rgba(232,98,26,0.16)',
                  color: 'var(--cream)',
                  border: '1px solid rgba(232,98,26,0.35)',
                }}
              >
                Open Training
              </button>
            </FeatureCard>

            <FeatureCard
              title="Change Shape"
              subtitle={`${state.tacticsDeck.length} tactics, ${unownedFormations.length} formations left`}
              accent="var(--gold)"
              active
            >
              <div className="text-[11px]" style={{ color: 'var(--cream-soft)' }}>
                Add systems, not just bodies.
              </div>
            </FeatureCard>
          </div>
        </Section>
      )}

      <Section title="Utility Room">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FeatureCard
            title="Reroll Market"
            subtitle="Refresh transfer and joker offers"
            accent="var(--gold)"
            active={state.cash >= 8000}
          >
            <div className="text-[11px]" style={{ color: 'var(--cream-soft)' }}>
              Burn cash to hunt for a better tactical fit.
            </div>
            <button
              onClick={() => {
                if (onRerollShop()) {
                  setRerollCount((prev) => prev + 1);
                  setShowCardPick(null);
                }
              }}
              disabled={state.cash < 8000}
              className="mt-2 px-3 py-2 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase"
              style={{
                background: state.cash >= 8000 ? 'rgba(212,160,53,0.16)' : 'rgba(0,0,0,0.16)',
                color: state.cash >= 8000 ? 'var(--cream)' : 'var(--ink)',
                border: `1px solid ${state.cash >= 8000 ? 'rgba(212,160,53,0.35)' : 'rgba(154,139,115,0.12)'}`,
                cursor: state.cash >= 8000 ? 'pointer' : 'not-allowed',
              }}
            >
              Reroll
              <div style={{ fontSize: 9, marginTop: 2 }}>£8,000</div>
            </button>
          </FeatureCard>

          <FeatureCard
            title="Medical Room"
            subtitle={injuredCards.length > 0 ? `${injuredCards.length} injured player${injuredCards.length > 1 ? 's' : ''}` : 'Squad fully fit'}
            accent="var(--danger)"
            active={injuredCards.length > 0 && state.cash >= 12000}
          >
            <div className="text-[11px]" style={{ color: 'var(--cream-soft)' }}>
              Restore one injured player before the next fixture.
            </div>
            {injuredCards.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {injuredCards.slice(0, 3).map((card) => (
                  <button
                    key={card.id}
                    onClick={() => onHealPlayer(card.id)}
                    className="px-2 py-1 rounded-[var(--radius-sm)] text-[10px] font-bold"
                    style={{
                      background: state.cash >= 12000 ? 'rgba(192,57,43,0.16)' : 'rgba(0,0,0,0.16)',
                      color: state.cash >= 12000 ? 'var(--cream)' : 'var(--ink)',
                      border: `1px solid ${state.cash >= 12000 ? 'rgba(192,57,43,0.35)' : 'rgba(154,139,115,0.12)'}`,
                    }}
                  >
                    Heal {card.name}
                  </button>
                ))}
              </div>
            ) : null}
          </FeatureCard>

          <FeatureCard
            title="Scout Report"
            subtitle={scoutedOpponent ? `Report ready on ${scoutedOpponent.name}` : 'Reveal next opponent plan'}
            accent="var(--pitch-light)"
            active={!scoutedOpponent && state.cash >= 10000}
          >
            <div className="text-[11px]" style={{ color: 'var(--cream-soft)' }}>
              Buy intel before you shape the squad.
            </div>
            {!scoutedOpponent ? (
              <button
                onClick={onScoutOpponent}
                disabled={state.cash < 10000}
                className="mt-2 px-3 py-2 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase"
                style={{
                  background: state.cash >= 10000 ? 'rgba(59,165,93,0.16)' : 'rgba(0,0,0,0.16)',
                  color: state.cash >= 10000 ? 'var(--cream)' : 'var(--ink)',
                  border: `1px solid ${state.cash >= 10000 ? 'rgba(59,165,93,0.35)' : 'rgba(154,139,115,0.12)'}`,
                  cursor: state.cash >= 10000 ? 'pointer' : 'not-allowed',
                }}
              >
                Scout
                <div style={{ fontSize: 9, marginTop: 2 }}>£10,000</div>
              </button>
            ) : (
              <div className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--dust)' }}>
                {scoutedOpponent.style}. Weakness: {scoutedOpponent.weakness}. Star: {scoutedOpponent.starPlayer.name}.
              </div>
            )}
          </FeatureCard>
        </div>
      </Section>

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

      {/* Academy */}
      <Section title={`Academy (Tier ${state.academyTier} — ${academy.name})`}>
        <div
          className="rounded-[var(--radius)] p-3 mb-3"
          style={{
            background: 'linear-gradient(135deg, rgba(45,138,78,0.16), rgba(0,0,0,0.08))',
            border: '1px solid rgba(59,165,93,0.22)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
                Prospect intake
              </div>
              <div className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--dust)' }}>
                Cheap depth, durability variance, and a route to train hidden value into your squad.
              </div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--gold)' }}>
                Cost per player: {academy.cost === 0 ? 'FREE' : `£${academy.cost.toLocaleString()}`}
              </div>
            </div>
            {state.academyTier < 4 && (
              <button
                disabled={state.cash < ACADEMY_UPGRADE_COST}
                onClick={onUpgradeAcademy}
                className="px-3 py-2 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase transition-all"
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
                  flexShrink: 0,
                }}
              >
                Upgrade
                <div style={{ fontSize: 9, marginTop: 2 }}>
                  £{ACADEMY_UPGRADE_COST.toLocaleString()}
                </div>
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {academyCards.map(card => (
            <div
              key={card.id}
              className="text-center shrink-0 rounded-[var(--radius)] p-2"
              style={{
                background: 'rgba(0,0,0,0.12)',
                border: '1px solid rgba(59,165,93,0.14)',
              }}
            >
              <PlayerCard
                card={card}
                onClick={() => {
                  if (academy.cost === 0 || state.cash >= academy.cost) {
                    onBuyAcademy(card);
                  }
                }}
              />
              <button
                onClick={() => {
                  if (academy.cost === 0 || state.cash >= academy.cost) {
                    onBuyAcademy(card);
                  }
                }}
                disabled={academy.cost > 0 && state.cash < academy.cost}
                className="mt-2 w-full px-2 py-2 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase transition-all"
                style={{
                  background: academy.cost === 0 || state.cash >= academy.cost ? 'rgba(59,165,93,0.16)' : 'rgba(0,0,0,0.16)',
                  color: academy.cost === 0 || state.cash >= academy.cost ? 'var(--cream)' : 'var(--ink)',
                  border: `1px solid ${academy.cost === 0 || state.cash >= academy.cost ? 'rgba(59,165,93,0.35)' : 'rgba(154,139,115,0.12)'}`,
                  cursor: academy.cost === 0 || state.cash >= academy.cost ? 'pointer' : 'not-allowed',
                }}
              >
                Sign
                <div style={{ fontSize: 9, marginTop: 2 }}>
                  {academy.cost === 0 ? 'FREE' : `£${academy.cost.toLocaleString()}`}
                </div>
              </button>
            </div>
          ))}
        </div>
      </Section>

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

      {/* Training */}
      <Section title="Training Ground">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              setTrainMode(!trainMode);
              if (sellMode) setSellMode(false);
            }}
            className="text-sm font-bold uppercase tracking-[0.15em] transition-colors"
            style={{ color: trainMode ? 'var(--amber)' : 'var(--dust)' }}
          >
            {trainMode ? '\u2716 Close Training' : '\ud83c\udfd8\ufe0f Open Training'}
          </button>
        </div>
        <div
          className="rounded-[var(--radius)] p-3"
          style={{
            background: 'linear-gradient(135deg, rgba(232,98,26,0.12), rgba(0,0,0,0.08))',
            border: '1px solid rgba(232,98,26,0.16)',
          }}
        >
          <div className="text-[10px] leading-snug mb-3" style={{ color: 'var(--dust)' }}>
            Training is available now. Upgrade key players by +{TRAINING_INCREMENT} each session for £{TRAINING_COST.toLocaleString()}, up to +{TRAINING_MAX}.
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {trainableCards.map(({ card, applied }) => {
              const isMax = applied >= TRAINING_MAX;
              const canAfford = state.cash >= TRAINING_COST;
              return (
                <div
                  key={card.id}
                  className="relative text-center shrink-0 rounded-[var(--radius)] p-2"
                  style={{
                    background: 'rgba(0,0,0,0.12)',
                    border: '1px solid rgba(232,98,26,0.12)',
                  }}
                >
                  <PlayerCard
                    card={card}
                    onClick={() => {
                      if (!isMax && canAfford) {
                        onTrainPlayer(card.id);
                      }
                    }}
                  />
                  <div
                    className="mt-2 text-[10px] font-bold"
                    style={{
                      color: isMax ? 'var(--amber)' : 'var(--gold)',
                    }}
                  >
                    {isMax ? 'MAX' : applied > 0 ? `+${applied}` : '+0'}
                  </div>
                  <button
                    onClick={() => {
                      if (!isMax && canAfford) {
                        onTrainPlayer(card.id);
                      }
                    }}
                    disabled={isMax || !canAfford}
                    className="mt-2 w-full px-2 py-2 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase transition-all"
                    style={{
                      background: !isMax && canAfford ? 'rgba(232,98,26,0.16)' : 'rgba(0,0,0,0.16)',
                      color: !isMax && canAfford ? 'var(--cream)' : 'var(--ink)',
                      border: `1px solid ${!isMax && canAfford ? 'rgba(232,98,26,0.35)' : 'rgba(154,139,115,0.12)'}`,
                      cursor: !isMax && canAfford ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isMax ? 'Finished' : 'Train'}
                    {!isMax && <div style={{ fontSize: 9, marginTop: 2 }}>£{TRAINING_COST.toLocaleString()}</div>}
                  </button>
                </div>
              );
            })}
            {state.deck.length === 0 && (
              <div className="text-sm py-4" style={{ color: 'var(--dust)' }}>
                No cards to train
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Sell Cards */}
      <Section title="Asset Management">
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
          <div className="flex flex-wrap gap-2 justify-center mt-3">
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
      </Section>

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

function FeatureCard({
  title,
  subtitle,
  accent,
  active,
  children,
}: {
  title: string;
  subtitle: string;
  accent: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--radius)] p-3"
      style={{
        background: 'var(--leather-light)',
        border: `1px solid ${active ? accent : 'rgba(154,139,115,0.12)'}`,
        boxShadow: active ? `inset 0 0 0 1px color-mix(in srgb, ${accent} 25%, transparent)` : undefined,
      }}
    >
      <div className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
        {title}
      </div>
      <div className="text-[10px] mt-1 mb-2" style={{ color: 'var(--dust)' }}>
        {subtitle}
      </div>
      {children}
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
