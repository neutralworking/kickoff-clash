'use client';

import { useEffect, useRef } from 'react';
import type { JokerCard, ManagerGate } from '../../lib/jokers';
import ManagerCard from './ManagerCard';
import { managerActionText, resolveManagerFormations } from './managerCardPresentation';
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

export default function ManagerDossier({
  manager,
  formations,
  onClose,
}: {
  manager: JokerCard;
  formations?: string[];
  onClose: () => void;
}) {
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
  const availableFormations = resolveManagerFormations(manager, formations);
  const actionText = managerActionText(manager);

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
            <ManagerCard manager={manager} formations={availableFormations} size="hero" />
            <div className={styles.metaLine}>
              {manager.nation && <span>{manager.nation.toUpperCase()}</span>}
              <b>{manager.rarity.toUpperCase()}</b>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>PHILOSOPHY</span>
              <strong>MANAGER IDENTITY</strong>
            </div>
            <blockquote>“{manager.philosophy}”</blockquote>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>MANAGER ACTION</span>
              <strong>FULL EFFECT</strong>
            </div>
            <p className={styles.effect}>{actionText}</p>
            <dl className={styles.rules}>
              <div><dt>{gate.label}</dt><dd>{gate.value}</dd></div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>FORMATIONS</span>
              <strong>{availableFormations.length} AVAILABLE</strong>
            </div>
            <div className={styles.traits}>
              {availableFormations.map((formation) => <span key={formation}>{formation}</span>)}
            </div>
            <p style={{ margin: 0, padding: '0 14px 15px', color: '#cfc3aa', fontSize: 11, lineHeight: 1.45 }}>
              This manager determines the formation selector. Formation-unlock consumables bought in the store can add another shape to this manager’s pool.
            </p>
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
