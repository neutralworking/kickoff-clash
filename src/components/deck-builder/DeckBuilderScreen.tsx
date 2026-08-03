'use client';

import { useMemo, useState } from 'react';
import type { Card } from '../../lib/scoring';
import TeamSelectionPlayerCard from '../player-cards/TeamSelectionPlayerCard';
import styles from './DeckBuilderScreen.module.css';

export const ACTIVE_DECK_SIZE = 18;

interface DeckBuilderScreenProps {
  collection: Card[];
  initialDeckIds: number[];
  onCancel: () => void;
  onSave: (deckIds: number[]) => void;
}

export default function DeckBuilderScreen({
  collection,
  initialDeckIds,
  onCancel,
  onSave,
}: DeckBuilderScreenProps) {
  const validInitial = useMemo(() => {
    const valid = new Set(collection.map((card) => card.id));
    const unique = [...new Set(initialDeckIds)].filter((id) => valid.has(id)).slice(0, ACTIVE_DECK_SIZE);
    for (const card of collection) {
      if (unique.length >= ACTIVE_DECK_SIZE) break;
      if (!unique.includes(card.id)) unique.push(card.id);
    }
    return unique;
  }, [collection, initialDeckIds]);

  const [deckIds, setDeckIds] = useState<number[]>(validInitial);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const byId = useMemo(() => new Map(collection.map((card) => [card.id, card])), [collection]);
  const deckCards = deckIds.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card));
  const available = collection.filter((card) => !deckIds.includes(card.id));

  function chooseCollection(cardId: number) {
    if (deckIds.includes(cardId)) return;
    if (deckIds.length < ACTIVE_DECK_SIZE) {
      setDeckIds((current) => [...current, cardId]);
      setPendingId(null);
      return;
    }
    setPendingId((current) => (current === cardId ? null : cardId));
  }

  function chooseDeckSlot(index: number) {
    const currentId = deckIds[index];
    if (pendingId != null) {
      setDeckIds((current) => current.map((id, slot) => (slot === index ? pendingId : id)));
      setPendingId(null);
      return;
    }
    if (currentId != null) setDeckIds((current) => current.filter((_, slot) => slot !== index));
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h1>DECK BUILDER</h1>
        <span className={styles.counter}>{deckIds.length}/{ACTIVE_DECK_SIZE}</span>
      </header>

      <div className={styles.activeSection}>
        <div className={styles.sectionHeader}>
          <strong>ACTIVE DECK</strong>
          <span>3 ROWS OF 6</span>
        </div>
        <div className={`${styles.deckGrid} ${pendingId != null ? styles.replaceMode : ''}`}>
          {Array.from({ length: ACTIVE_DECK_SIZE }).map((_, index) => {
            const card = deckCards[index];
            return (
              <button
                key={card?.id ?? `empty-${index}`}
                type="button"
                className={styles.deckSlot}
                onClick={() => chooseDeckSlot(index)}
                aria-label={card ? `Remove or replace ${card.name}` : 'Empty deck slot'}
              >
                {card
                  ? <TeamSelectionPlayerCard card={card} size="deck" />
                  : <span className={styles.emptySlot}>+</span>}
              </button>
            );
          })}
        </div>
        <div className={styles.hint}>
          {pendingId != null
            ? 'CHOOSE A DECK CARD TO REPLACE'
            : deckIds.length < ACTIVE_DECK_SIZE
              ? `ADD ${ACTIVE_DECK_SIZE - deckIds.length} MORE`
              : 'TAP A COLLECTION CARD, THEN THE DECK CARD TO REPLACE'}
        </div>
      </div>

      <div className={styles.collectionSection}>
        <div className={styles.sectionHeader}>
          <strong>COLLECTION</strong>
          <span>{available.length} AVAILABLE</span>
        </div>
        <div className={styles.collectionGrid}>
          {available.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`${styles.collectionCard} ${pendingId === card.id ? styles.pending : ''}`}
              onClick={() => chooseCollection(card.id)}
              aria-label={`Add ${card.name} to deck`}
            >
              <TeamSelectionPlayerCard card={card} size="collection" highlighted={pendingId === card.id} />
            </button>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>CANCEL</button>
        <button
          type="button"
          className={styles.save}
          disabled={deckIds.length !== ACTIVE_DECK_SIZE}
          onClick={() => onSave(deckIds)}
        >
          SAVE DECK →
        </button>
      </footer>
    </section>
  );
}
