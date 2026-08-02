'use client';

import { useMemo, useState } from 'react';
import { ALL_JOKERS, type JokerCard } from '../../lib/jokers';
import ManagerCard from './ManagerCard';
import ManagerDossier from './ManagerDossier';
import styles from './ManagerCardLab.module.css';

const EXAMPLE_IDS = ['tiki_taka', 'gegenpress', 'box_office'];

export default function ManagerCardLab() {
  const managers = useMemo(
    () => EXAMPLE_IDS.map((id) => ALL_JOKERS.find((manager) => manager.id === id)).filter((manager): manager is JokerCard => Boolean(manager)),
    [],
  );
  const packManagers = managers.slice(0, 2);
  const [selectedId, setSelectedId] = useState<string | null>(packManagers[0]?.id ?? null);
  const [inspected, setInspected] = useState<JokerCard | null>(null);

  return (
    <main className={styles.lab}>
      <header className={styles.header}>
        <span>KC CARD LAB</span>
        <h1>MANAGER CARDS</h1>
        <p>Portrait, identity, preferred shape and one signature trait. Full rules live in the dossier.</p>
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
          {packManagers.map((manager) => {
            const selected = selectedId === manager.id;
            return (
              <article key={manager.id} className={styles.choice}>
                <ManagerCard manager={manager} selected={selected} onClick={() => setInspected(manager)} />
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
            <span>RARITY CHECK</span>
            <h2>CARD FAMILY</h2>
          </div>
          <small>COMMON · UNCOMMON · RARE</small>
        </div>

        <div className={styles.familyRow}>
          {managers.map((manager) => (
            <div key={manager.id} className={styles.familyCard}>
              <ManagerCard manager={manager} onClick={() => setInspected(manager)} />
              <span>{manager.rarity.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.rules}>
        <strong>V1 FACE RULES</strong>
        <p>No ATT, DEF, cost, tactic charges or generic MGR badge. The face communicates who the manager is, the shape they want and the signature behaviour they bring.</p>
      </section>

      {inspected && <ManagerDossier manager={inspected} onClose={() => setInspected(null)} />}
    </main>
  );
}
