'use client';

import { useMemo, useRef, useState } from 'react';
import type { Card } from '../../lib/scoring';
import { ACTIVE_DECK_SIZE } from '../../lib/active-deck';
import { v6Cost } from '../../lib/v6-bridge';
import CardModal from '../cards/CardModal';
import type { GameCardModel } from '../cards/GameCard';
import TeamSelectionPlayerCard from '../player-cards/TeamSelectionPlayerCard';
import styles from './DeckBuilderScreen.module.css';

export { ACTIVE_DECK_SIZE } from '../../lib/active-deck';

const HOLD_TO_REMOVE_MS = 450;

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
  const [positionFilter, setPositionFilter] = useState('all');
  const [costFilter, setCostFilter] = useState<number | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<GameCardModel | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useRef<number | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => new Map(collection.map((card) => [card.id, card])), [collection]);
  const deckCards = deckIds.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card));
  const deckSet = useMemo(() => new Set(deckIds), [deckIds]);

  const positions = useMemo(
    () => [...new Set(collection.map((card) => card.position))].sort(),
    [collection],
  );
  const costs = useMemo(
    () => [...new Set(collection.map((card) => v6Cost(card)))].sort((a, b) => a - b),
    [collection],
  );
  const filteredCollection = useMemo(
    () => collection.filter((card) => {
      if (positionFilter !== 'all' && card.position !== positionFilter) return false;
      if (costFilter !== 'all' && v6Cost(card) !== costFilter) return false;
      return true;
    }),
    [collection, positionFilter, costFilter],
  );

  function showNotice(message: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 1600);
  }

  function inspect(card: Card) {
    setModal({ variant: 'player', card });
  }

  function addCollectionCard(card: Card) {
    if (deckSet.has(card.id)) {
      inspect(card);
      return;
    }
    if (deckIds.length >= ACTIVE_DECK_SIZE) {
      showNotice('DECK FULL · HOLD A DECK CARD TO REMOVE');
      return;
    }
    setDeckIds((current) => [...current, card.id]);
  }

  function removeDeckCard(cardId: number) {
    setDeckIds((current) => current.filter((id) => id !== cardId));
    suppressNextClick.current = cardId;
    showNotice('CARD REMOVED');
  }

  function startHold(cardId: number) {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => removeDeckCard(cardId), HOLD_TO_REMOVE_MS);
  }

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function tapDeckCard(card: Card) {
    if (suppressNextClick.current === card.id) {
      suppressNextClick.current = null;
      return;
    }
    inspect(card);
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
          <span>HOLD TO REMOVE</span>
        </div>
        <div className={styles.deckGrid}>
          {Array.from({ length: ACTIVE_DECK_SIZE }).map((_, index) => {
            const card = deckCards[index];
            return (
              <button
                key={card?.id ?? `empty-${index}`}
                type="button"
                className={styles.deckSlot}
                onClick={() => card && tapDeckCard(card)}
                onPointerDown={() => card && startHold(card.id)}
                onPointerUp={cancelHold}
                onPointerCancel={cancelHold}
                onPointerLeave={cancelHold}
                onContextMenu={(event) => {
                  if (!card) return;
                  event.preventDefault();
                  removeDeckCard(card.id);
                }}
                onKeyDown={(event) => {
                  if (!card || (event.key !== 'Delete' && event.key !== 'Backspace')) return;
                  event.preventDefault();
                  removeDeckCard(card.id);
                }}
                aria-label={card ? `${card.name}. Tap to inspect. Hold to remove from deck.` : 'Empty deck slot'}
              >
                {card
                  ? <TeamSelectionPlayerCard card={card} size="deck" />
                  : <span className={styles.emptySlot}>+</span>}
              </button>
            );
          })}
        </div>
        <div className={`${styles.hint} ${notice ? styles.notice : ''}`} aria-live="polite">
          {notice
            ?? (deckIds.length < ACTIVE_DECK_SIZE
              ? `ADD ${ACTIVE_DECK_SIZE - deckIds.length} MORE · TAP A COLLECTION CARD`
              : 'DECK FULL · TAP TO INSPECT · HOLD TO REMOVE')}
        </div>
      </div>

      <div className={styles.collectionSection}>
        <div className={styles.collectionHeading}>
          <div className={styles.sectionHeader}>
            <strong>COLLECTION</strong>
            <span>{filteredCollection.length}/{collection.length}</span>
          </div>
          <div className={styles.filters} aria-label="Collection filters">
            <label>
              <span>POSITION</span>
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
                <option value="all">ALL</option>
                {positions.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <label>
              <span>COST</span>
              <select
                value={costFilter === 'all' ? 'all' : String(costFilter)}
                onChange={(event) => setCostFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              >
                <option value="all">ALL</option>
                {costs.map((cost) => <option key={cost} value={cost}>{cost}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.collectionGrid}>
          {filteredCollection.map((card) => {
            const inDeck = deckSet.has(card.id);
            return (
              <button
                key={card.id}
                type="button"
                className={`${styles.collectionCard} ${inDeck ? styles.inDeck : ''}`}
                onClick={() => addCollectionCard(card)}
                aria-label={inDeck
                  ? `${card.name} is already in the active deck. Tap to inspect.`
                  : `Add ${card.name} to active deck.`}
              >
                <TeamSelectionPlayerCard card={card} size="collection" dimmed={inDeck} />
                {inDeck && <span className={styles.inDeckBadge}>IN DECK</span>}
              </button>
            );
          })}
          {filteredCollection.length === 0 && (
            <div className={styles.emptyCollection}>NO CARDS MATCH THESE FILTERS</div>
          )}
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

      <CardModal model={modal} onClose={() => setModal(null)} />
    </section>
  );
}
