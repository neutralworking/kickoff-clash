'use client';

import { useEffect, useRef } from 'react';
import type { JokerCard, ManagerGate } from '../../lib/jokers';
import ManagerCard from './ManagerCard';
import styles from './ManagerDossier.module.css';

function gateCopy(gate: ManagerGate): { label: string; value: string } {
  if (gate.kind === 'commit') {
    return {
      label: 'ACTIVATION',
      value: `Active when the XI commits to ${gate.key.toUpperCase()}.`,
    };
  }

  if (gate.kind === 'buildCount') {
    return {
      label: 'ACTIVATION',
      value: `Active with ${gate.n}+ ${gate.what} players in the selected XI.`,
    };
  }

  return {
    label: 'ACTIVATION',
    value: 'Applied through results and the run economy rather than a tactical commitment.',
  };
}

function formationCopy(manager: JokerCard): string {
  if (!manager.preferredFormation) {
    return 'All formations count as native. No adherence penalty applies.';
  }

  return `${manager.preferredFormation} pays the full package. Adjacent shapes pay half; foreign shapes pay one quarter, rounded.`;
}

function economyHooks(manager: JokerCard): string[] {
  const hooks: string[] = [];
  if (manager.winPayoutMult && manager.winPayoutMult !== 1) {
    hooks.push(`Result payouts ×${manager.winPayoutMult.toFixed(2)}`);
  }
  if (manager.refreshDiscount) {
    hooks.push(`${Math.round(manager.refreshDiscount * 100)}% cheaper shop refreshes`);
  }
  return hooks;
}

export default function ManagerDossier({ manager, onClose }: { manager: JokerCard; onClose: () => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const marker = `kc-manager-dossier:${manager.id}:${Date.now()}`;
    const previousState = window.history.state;
    window.history.pushState({ ...previousState, __kcManagerDossier: marker }, '');
    let closedByBack = false;

    const close = () => closeRef.current();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPopState = () => {
      closedByBack = true;
      close();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPopState);
      document.body.style.overflow = oldOverflow;
      if (!closedByBack && window.history.state?.__kcManagerDossier === marker) {
        window.history.back();
      }
    };
  }, [manager.id]);

  const gate = gateCopy(manager.gate);
  const hooks = economyHooks(manager);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${manager.name} manager dossier`}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <span>MANAGER DOSSIER</span>
          <strong>{manager.name}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close manager dossier">×</button>
      </header>

      <div className={styles.scroll}>
        <main className={styles.content}>
          <section className={styles.hero}>
            <ManagerCard manager={manager} size="hero" />
            <div className={styles.metaLine}>
              {manager.nation && <span>{manager.nation.toUpperCase()}</span>}
              <b>{manager.rarity.toUpperCase()}</b>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>PHILOSOPHY</span>
              <strong>{manager.archetype.toUpperCase()}</strong>
            </div>
            <blockquote>“{manager.philosophy}”</blockquote>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>MANAGER ACTION</span>
              <strong>{(manager.traits[0] ?? manager.archetype).toUpperCase()}</strong>
            </div>
            <p className={styles.effect}>{manager.effect}</p>
            <dl className={styles.rules}>
              <div><dt>{gate.label}</dt><dd>{gate.value}</dd></div>
              <div><dt>FORMATION</dt><dd>{formationCopy(manager)}</dd></div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>TRAITS</span>
              <strong>{manager.traits.length} PRINTED</strong>
            </div>
            <div className={styles.traits}>
              {manager.traits.map((trait, index) => (
                <span key={trait} className={index === 0 ? styles.signature : ''}>{trait}</span>
              ))}
            </div>
          </section>

          {hooks.length > 0 && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>BOARDROOM</span>
                <strong>RUN EFFECTS</strong>
              </div>
              <div className={styles.hooks}>
                {hooks.map((hook) => <span key={hook}>{hook}</span>)}
              </div>
            </section>
          )}

          <section className={styles.flavour}>{manager.flavour}</section>
        </main>
      </div>
    </div>
  );
}
