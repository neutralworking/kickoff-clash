'use client';

/**
 * The between-fixture shop (SM §4, law 5): dual-axis stock, reroll, sell, and
 * — post-boss only — the manager pivot slot at ~2 shops of player spend.
 * Purchases are permanent collection unlocks (starter-pack eligible).
 */

import { useMemo, useState } from 'react';
import type { RunState, CollectionState } from '../../engine/run';
import { buyCard, sellCard, rerollShop, buyManager } from '../../engine/run';
import { getManager, type ManagerDef } from '../../engine/data/managers';
import { ENGINE_CARDS } from '../../engine/data/cards.gen';
import { REROLL_COST, MANAGER_PRICE, sellPrice } from '../../engine/data/economy';
import { managerSignatures } from '../../engine/draft';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';
import { Chip } from './ManagerPick';
import RCard from './RCard';

const cardById = new Map(ENGINE_CARDS.map((c) => [c.id, c]));

export default function ShopScreen({
  run,
  manager,
  collection,
  onUpdate,
  onUpdateCollection,
  onDone,
}: {
  run: RunState;
  manager: ManagerDef;
  collection: CollectionState;
  onUpdate: (run: RunState) => void;
  onUpdateCollection: (c: CollectionState) => void;
  onDone: (run: RunState) => void;
}) {
  const sigs = useMemo(() => managerSignatures(manager), [manager]);
  const [selling, setSelling] = useState(false);
  const shop = run.shop;
  const pivotManager = shop?.managerId ? getManager(shop.managerId) : null;

  const handleBuy = (cardId: number) => {
    const nextCollection = { unlocked: [...collection.unlocked] };
    onUpdate(buyCard(run, cardId, nextCollection));
    onUpdateCollection(nextCollection);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 16, paddingBottom: 8, minHeight: 0 }}>
      <header className="flex items-center justify-between">
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 11, color: 'var(--dust)' }}>
          {shop?.postBoss ? 'POST-BOSS MARKET' : 'TRANSFER MARKET'}
        </div>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 12, color: 'var(--gold)' }}>£{run.cash}</div>
      </header>

      {pivotManager && (
        <RPanel style={{ padding: 12, borderColor: 'var(--gold)' }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--gold)', letterSpacing: 1 }}>MANAGER AVAILABLE</div>
          <div className="flex items-center justify-between" style={{ gap: 8, marginTop: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: 12, color: 'var(--cream)' }}>{pivotManager.name.toUpperCase()}</div>
              <p style={{ fontSize: 11, color: 'var(--cream-soft)', marginTop: 2 }}>{pivotManager.winCondition}</p>
              <div className="flex" style={{ gap: 6, marginTop: 6 }}>
                <Chip label={pivotManager.defaultPosture.toUpperCase()} dim />
                <Chip label={pivotManager.preferredFormation} dim />
              </div>
            </div>
            <RButton
              accent
              disabled={run.cash < MANAGER_PRICE}
              onClick={() => onUpdate(buyManager(run))}
              style={{ flexShrink: 0 }}
            >
              £{MANAGER_PRICE}
            </RButton>
          </div>
          <p style={{ fontSize: 10, color: 'var(--dust)', marginTop: 6 }}>
            Pivoting swaps your engine — squad traits that fed {manager.name} may go dormant.
          </p>
        </RPanel>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!selling && (
          <>
            {(shop?.offers ?? []).map((o) => {
              const card = cardById.get(o.cardId)!;
              return (
                <RCard
                  key={o.cardId}
                  card={card}
                  sigs={sigs}
                  tag={`£${o.price}`}
                  onClick={run.cash >= o.price ? () => handleBuy(o.cardId) : undefined}
                />
              );
            })}
            {(shop?.offers ?? []).length === 0 && (
              <div style={{ fontFamily: PIXEL_FONT, fontSize: 10, color: 'var(--dust)', textAlign: 'center', marginTop: 20 }}>
                SOLD OUT
              </div>
            )}
          </>
        )}
        {selling &&
          run.squad.map((id) => {
            const card = cardById.get(id)!;
            return (
              <RCard
                key={id}
                card={card}
                sigs={sigs}
                tag={`SELL £${sellPrice(card.rarity)}`}
                onClick={run.squad.length > 12 ? () => onUpdate(sellCard(run, id)) : undefined}
              />
            );
          })}
      </div>

      <div className="flex" style={{ gap: 8 }}>
        <RButton onClick={() => setSelling(!selling)} style={{ flex: 1 }}>
          {selling ? 'BUY' : 'SELL'}
        </RButton>
        <RButton disabled={run.cash < REROLL_COST || selling} onClick={() => onUpdate(rerollShop(run))} style={{ flex: 1 }}>
          REROLL £{REROLL_COST}
        </RButton>
        <RButton accent onClick={() => onDone({ ...run, shop: null })} style={{ flex: 1 }}>
          DONE →
        </RButton>
      </div>
    </div>
  );
}
