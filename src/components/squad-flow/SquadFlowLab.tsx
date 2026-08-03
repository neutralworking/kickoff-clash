'use client';

import { useMemo, useState } from 'react';
import { getFormation } from '../../lib/formations';
import { ALL_CARDS } from '../../lib/run';
import { ripStarterPacks } from '../../lib/packs';
import { autoFillXI } from '../../lib/team-select';
import { xiV6Totals, MAX_XI_COST } from '../../lib/v6-bridge';
import TeamSelectionPlayerCard from '../player-cards/TeamSelectionPlayerCard';
import styles from './SquadFlowLab.module.css';

const DECK_SIZE = 18;
const MATCH_BENCH_SIZE = 5;
const LAB_SEED = 21873;

const PITCH_POINTS = [
  { x: 18, y: 17 },
  { x: 50, y: 17 },
  { x: 82, y: 17 },
  { x: 22, y: 42 },
  { x: 50, y: 42 },
  { x: 78, y: 42 },
  { x: 12, y: 68 },
  { x: 37, y: 68 },
  { x: 63, y: 68 },
  { x: 88, y: 68 },
  { x: 50, y: 84 },
] as const;

export default function SquadFlowLab() {
  const starter = useMemo(() => ripStarterPacks(LAB_SEED), []);
  const collection = useMemo(() => {
    const starterIds = new Set(starter.players.map((card) => card.id));
    const extras = ALL_CARDS.filter((card) => !starterIds.has(card.id)).slice(0, 24);
    return [...starter.players, ...extras];
  }, [starter.players]);
  const initialIds = useMemo(() => starter.players.slice(0, DECK_SIZE).map((card) => card.id), [starter.players]);

  const [screen, setScreen] = useState<'deck' | 'team'>('deck');
  const [activeIds, setActiveIds] = useState<number[]>(initialIds);
  const [pendingReplacement, setPendingReplacement] = useState<number | null>(null);
  const [showReserves, setShowReserves] = useState(false);

  const byId = useMemo(() => new Map(collection.map((card) => [card.id, card])), [collection]);
  const activeCards = useMemo(
    () => activeIds.map((id) => byId.get(id)).filter((card): card is NonNullable<typeof card> => Boolean(card)),
    [activeIds, byId],
  );
  const availableCards = useMemo(
    () => collection.filter((card) => !activeIds.includes(card.id)),
    [collection, activeIds],
  );

  const formation = getFormation('4-3-3');
  const lineup = useMemo(() => autoFillXI(activeCards, formation, false), [activeCards, formation]);
  const starters = lineup.xi.slice(0, 11);
  const substitutes = lineup.bench.slice(0, MATCH_BENCH_SIZE);
  const reserves = lineup.bench.slice(MATCH_BENCH_SIZE, MATCH_BENCH_SIZE + 2);
  const totals = useMemo(() => xiV6Totals(starters, formation), [starters, formation]);
  const manager = starter.managers[0];

  function chooseCollectionCard(cardId: number) {
    if (activeIds.includes(cardId)) return;
    if (activeIds.length < DECK_SIZE) {
      setActiveIds((current) => [...current, cardId]);
      setPendingReplacement(null);
      return;
    }
    setPendingReplacement((current) => (current === cardId ? null : cardId));
  }

  function chooseDeckSlot(index: number) {
    const currentId = activeIds[index];
    if (currentId == null) {
      if (pendingReplacement != null) {
        setActiveIds((current) => {
          const next = [...current];
          next[index] = pendingReplacement;
          return next;
        });
        setPendingReplacement(null);
      }
      return;
    }

    if (pendingReplacement != null) {
      setActiveIds((current) => current.map((id, i) => (i === index ? pendingReplacement : id)));
      setPendingReplacement(null);
      return;
    }

    setActiveIds((current) => current.filter((_, i) => i !== index));
  }

  function resetDeck() {
    setActiveIds(initialIds);
    setPendingReplacement(null);
  }

  return (
    <main className={styles.lab}>
      <div className={styles.shell}>
        <div className={styles.labNav} aria-label="Squad flow screens">
          <button className={screen === 'deck' ? styles.activeTab : ''} onClick={() => setScreen('deck')}>
            DECK BUILDER
          </button>
          <button
            className={screen === 'team' ? styles.activeTab : ''}
            onClick={() => activeIds.length === DECK_SIZE && setScreen('team')}
          >
            TEAM SELECTION
          </button>
        </div>

        {screen === 'deck' ? (
          <section className={styles.deckBuilder}>
            <header className={styles.header}>
              <h1 className={styles.title}>DECK BUILDER</h1>
              <span className={styles.counter}>{activeIds.length}/{DECK_SIZE}</span>
            </header>

            <div className={styles.deckSection}>
              <div className={styles.sectionHeading}>
                <strong>ACTIVE DECK</strong>
                <span>3 ROWS OF 6</span>
              </div>
              <div className={`${styles.deckGrid} ${pendingReplacement != null ? styles.replaceMode : ''}`}>
                {Array.from({ length: DECK_SIZE }).map((_, index) => {
                  const card = activeCards[index];
                  return (
                    <button
                      key={card?.id ?? `empty-${index}`}
                      className={styles.deckSlot}
                      onClick={() => chooseDeckSlot(index)}
                      aria-label={card ? `Remove or replace ${card.name}` : 'Empty deck slot'}
                    >
                      {card ? <TeamSelectionPlayerCard card={card} size="deck" /> : <span className={styles.emptySlot}>+</span>}
                    </button>
                  );
                })}
              </div>
              <div className={styles.hint}>
                {pendingReplacement != null
                  ? 'CHOOSE A DECK CARD TO REPLACE'
                  : activeIds.length < DECK_SIZE
                    ? `ADD ${DECK_SIZE - activeIds.length} MORE CARD${DECK_SIZE - activeIds.length === 1 ? '' : 'S'}`
                    : 'TAP A DECK CARD TO REMOVE · TAP A COLLECTION CARD TO SWAP'}
              </div>
            </div>

            <div className={styles.collectionSection}>
              <div className={styles.sectionHeading}>
                <strong>COLLECTION</strong>
                <span>{availableCards.length} AVAILABLE</span>
              </div>
              <div className={styles.collectionGrid}>
                {availableCards.map((card) => (
                  <button
                    key={card.id}
                    className={`${styles.collectionCard} ${pendingReplacement === card.id ? styles.pending : ''}`}
                    onClick={() => chooseCollectionCard(card.id)}
                    aria-label={`Add ${card.name} to deck`}
                  >
                    <TeamSelectionPlayerCard card={card} size="collection" highlighted={pendingReplacement === card.id} />
                  </button>
                ))}
              </div>
            </div>

            <footer className={styles.footer}>
              <button className={styles.secondaryButton} onClick={resetDeck}>RESET</button>
              <button
                className={styles.doneButton}
                disabled={activeIds.length !== DECK_SIZE}
                onClick={() => setScreen('team')}
              >
                {activeIds.length === DECK_SIZE ? 'SAVE DECK →' : `DECK ${activeIds.length}/${DECK_SIZE}`}
              </button>
            </footer>
          </section>
        ) : (
          <section className={styles.teamSelection}>
            <header className={styles.header}>
              <h1 className={styles.title}>TEAM SELECTION</h1>
              <span className={styles.counter}>18-CARD DECK</span>
            </header>

            <div className={styles.compactStats}>
              <div className={styles.compactStat}><small>ATT</small><b style={{ color: '#ff9a54' }}>{totals.att}</b></div>
              <div className={styles.compactStat}><small>DEF</small><b style={{ color: '#72c9f2' }}>{totals.def}</b></div>
              <div className={styles.compactStat}><small>BUDGET</small><b>{totals.cost}/{MAX_XI_COST}</b></div>
            </div>

            <div className={styles.controls}>
              <button className={styles.control}>
                <small>MANAGER</small>
                <strong>{manager?.name ?? 'NO MANAGER'}</strong>
              </button>
              <button className={styles.control}>
                <small>FORMATION</small>
                <strong>{formation.name}</strong>
              </button>
              <button className={`${styles.control} ${styles.opponentControl}`}>
                <small>OPPOSITION</small>
                <strong>RIVERSIDE ROVERS</strong>
              </button>
            </div>

            <div className={styles.pitch}>
              <span className={styles.halfway} />
              <span className={styles.centreCircle} />
              {starters.map((card, index) => {
                const point = PITCH_POINTS[index];
                return (
                  <div
                    key={card.id}
                    className={styles.pitchCard}
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  >
                    <TeamSelectionPlayerCard card={card} size="pitch" />
                  </div>
                );
              })}
            </div>

            <div className={styles.benchHeader}>
              <span>SUBSTITUTES {substitutes.length}/{MATCH_BENCH_SIZE}</span>
              <button className={styles.reserveButton} onClick={() => setShowReserves(true)}>
                RESERVES {reserves.length}
              </button>
            </div>
            <div className={styles.benchRow}>
              {substitutes.map((card) => (
                <button key={card.id} className={styles.benchCard}>
                  <TeamSelectionPlayerCard card={card} size="bench" />
                </button>
              ))}
            </div>

            <footer className={`${styles.footer} ${styles.kickoff}`}>
              <button className={styles.secondaryButton} onClick={() => setScreen('deck')}>EDIT DECK</button>
              <button className={styles.doneButton}>KICK OFF →</button>
            </footer>

            {showReserves && (
              <div className={styles.reserveTray} onClick={() => setShowReserves(false)}>
                <div className={styles.reserveSheet} onClick={(event) => event.stopPropagation()}>
                  <div className={styles.reserveSheetHeader}>
                    <span>DECK RESERVES</span>
                    <button onClick={() => setShowReserves(false)}>CLOSE</button>
                  </div>
                  <div className={styles.reserveCards}>
                    {reserves.map((card) => <TeamSelectionPlayerCard key={card.id} card={card} size="collection" />)}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
