'use client';

import { useMemo, useState } from 'react';
import { ALL_JOKERS, type JokerCard } from '../../lib/jokers';
import ManagerCard from './ManagerCard';
import ManagerDossier from './ManagerDossier';
import styles from './ManagerCardLab.module.css';

interface ManagerExample {
  manager: JokerCard;
  formations: string[];
}

/**
 * Representative 1/2/3-formation states for card grooming only. Final formation
 * pools are roster/balance data and are not being decided by this lab.
 */
const EXAMPLES = [
  { id: 'tiki_taka', formations: ['4-3-3'] },
  { id: 'gegenpress', formations: ['4-3-3', '4-2-3-1'] },
  { id: 'box_office', formations: ['4-2-3-1', '4-3-3', '4-4-2'] },
] as const;

export default function ManagerCardLab() {
  const examples = useMemo<ManagerExample[]>(
    () => EXAMPLES.flatMap(({ id, formations }) => {
      const manager = ALL_JOKERS.find((candidate) => candidate.id === id);
      return manager ? [{ manager, formations: Array.from(formations) }] : [];
    }),
    [],
  );
  const packManagers = examples.slice(0, 2);
  const [selectedId, setSelectedId] = useState<string | null>(packManagers[0]?.manager.id ?? null);
  const [inspected, setInspected] = useState<ManagerExample | null>(null);

  return (
    <main className={styles.lab}>
      <header className={styles.header}>
        <span>KC CARD LAB</span>
        <h1>MANAGER CARDS</h1>
        <p>Portrait, manager-owned formation pool and complete action text. No manager styles.</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>REAL PACK CONTEXT</span>
            <h2>PICK YOUR MANAGER</h2>
          </div>
          <small>2 OPTIONS · PICK 1</small>
        </div>

        <div className={styles.packGrid}>
          {packManagers.map((example) => {
            const { manager, formations } = example;
            const selected = selectedId === manager.id;
            return (
              <article key={manager.id} className={styles.choice}>
                <ManagerCard
                  manager={manager}
                  formations={formations}
                  selected={selected}
                  onClick={() => setInspected(example)}
                />
                <button
                  type="button"
                  className={selected ? styles.picked : ''}
                  onClick={() => setSelectedId(manager.id)}
                >
                  {selected ? 'SELECTED ✓' : 'PICK MANAGER'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>FORMATION CAPACITY</span>
            <h2>ONE · TWO · THREE</h2>
          </div>
          <small>REPRESENTATIVE STATES</small>
        </div>

        <div className={styles.familyRow}>
          {examples.map((example) => (
            <div key={example.manager.id} className={styles.familyCard}>
              <ManagerCard
                manager={example.manager}
                formations={example.formations}
                onClick={() => setInspected(example)}
              />
              <span>{example.formations.length} FORMATION{example.formations.length === 1 ? '' : 'S'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.rules}>
        <strong>V1 FACE RULES</strong>
        <p>The manager determines which formations can be selected. The normal card shows the available pool and action text; store consumables can expand that pool. No style, archetype, ATT, DEF, cost or tactic charges.</p>
      </section>

      {inspected && (
        <ManagerDossier
          manager={inspected.manager}
          formations={inspected.formations}
          onClose={() => setInspected(null)}
        />
      )}
    </main>
  );
}
