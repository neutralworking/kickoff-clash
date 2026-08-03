'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import type { JokerCard } from '../../lib/jokers';
import { managerMaxStartingXiCost } from '../../lib/manager-v1';
import {
  MANAGER_RARITY_TO_FRAME,
  handoffMgrTier,
} from '../cards/cardTokens';
import { managerPortraitSrc, portraitArtStyle } from '../cards/portrait';
import {
  managerActionName,
  managerActionText,
  resolveManagerFormations,
} from './managerCardPresentation';
import styles from './ManagerCard.module.css';

export type ManagerCardSize = 'grid' | 'hero';

export interface ManagerCardProps {
  manager: JokerCard;
  /** V1 manager-owned formation pool. One to three formations. */
  formations?: string[];
  /** Manager-owned maximum total cost for the starting XI. */
  maxStartingXiCost?: number;
  size?: ManagerCardSize;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
}

function frameRarity(manager: JokerCard): string {
  return MANAGER_RARITY_TO_FRAME[manager.rarity] ?? 'Rare';
}

function cardContents(
  manager: JokerCard,
  formations: string[] | undefined,
  maxStartingXiCost: number,
  portraitOk: boolean,
  setPortraitOk: (ok: boolean) => void,
) {
  const rarity = frameRarity(manager);
  const tier = handoffMgrTier(rarity);
  const portrait = managerPortraitSrc(manager.id);
  const availableFormations = resolveManagerFormations(manager, formations);
  const actionName = managerActionName(manager);
  const actionText = managerActionText(manager);

  return (
    <>
      <div className={styles.frameMaterial} />
      <div className={styles.interior}>
        <div className={styles.kcMonogram} aria-hidden="true">KC</div>

        <div className={styles.portrait}>
          {portrait && portraitOk ? (
            // eslint-disable-next-line @next/next/no-img-element -- manager portraits use the existing static portrait resolver and need an onError fallback.
            <img src={portrait} alt="" draggable={false} onError={() => setPortraitOk(false)} />
          ) : (
            <div className="pixelated" aria-hidden style={portraitArtStyle(manager.id, { suit: true })} />
          )}
        </div>

        <div className={styles.topScrim} />
        <div className={styles.bottomScrim} />
        <div className={styles.sheen} aria-hidden="true" />

        <div
          className={styles.formationBadge}
          aria-label={`Available formations: ${availableFormations.join(', ') || 'not assigned'}`}
        >
          <div
            className={styles.formationList}
            data-count={availableFormations.length || 1}
          >
            {availableFormations.length > 0
              ? availableFormations.map((formation) => <strong key={formation}>{formation}</strong>)
              : <strong>UNASSIGNED</strong>}
          </div>
        </div>

        <div className={styles.identityPlate}>
          <strong className={styles.name}>{manager.name.toUpperCase()}</strong>
          <span className={styles.actionLabel}>{actionName.toUpperCase()}</span>
          <p className={styles.actionText}>{actionText}</p>
          <div className={styles.cardFooter}>
            <span className={styles.xiCostBadge}>
              <small>START XI</small>
              <strong>{maxStartingXiCost}</strong>
            </span>
          </div>
        </div>

        <div className={styles.raritySeam} style={{ '--manager-edge': tier.edge } as CSSProperties} />
      </div>
    </>
  );
}

export default function ManagerCard({
  manager,
  formations,
  maxStartingXiCost,
  size = 'grid',
  selected = false,
  dimmed = false,
  onClick,
  className,
}: ManagerCardProps) {
  const [portraitOk, setPortraitOk] = useState(true);
  const rarity = frameRarity(manager);
  const tier = handoffMgrTier(rarity);
  const Component = onClick ? 'button' : 'div';
  const availableFormations = resolveManagerFormations(manager, formations);
  const resolvedXiCost = maxStartingXiCost ?? managerMaxStartingXiCost(manager);
  const actionName = managerActionName(manager);
  const actionText = managerActionText(manager);
  const style = {
    '--manager-frame': tier.frame,
    '--manager-edge': tier.edge,
    '--manager-glow': tier.glow,
    '--manager-inner': tier.inner,
  } as CSSProperties;
  const contents = cardContents(manager, formations, resolvedXiCost, portraitOk, setPortraitOk);
  const classes = [
    styles.card,
    size === 'hero' ? styles.hero : styles.grid,
    selected ? styles.selected : '',
    dimmed ? styles.dimmed : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  const commonProps = {
    className: classes,
    style,
    'aria-label': `${manager.name}. Available formations: ${availableFormations.join(', ') || 'not assigned'}. Maximum starting XI cost ${resolvedXiCost}. ${actionName}: ${actionText}.`,
  };

  if (Component === 'button') {
    return (
      <button type="button" onClick={onClick} {...commonProps}>
        {contents}
      </button>
    );
  }

  return <div {...commonProps}>{contents}</div>;
}

export function ManagerCardFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frameSlot}>{children}</div>;
}
