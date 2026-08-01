'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import type { JokerCard } from '../../lib/jokers';
import {
  MANAGER_RARITY_TO_FRAME,
  handoffClassColor,
  handoffMgrTier,
  managerClass,
} from '../cards/cardTokens';
import ClassGlyph from '../cards/ClassGlyph';
import { managerPortraitSrc, portraitArtStyle } from '../cards/portrait';
import styles from './ManagerCard.module.css';

export type ManagerCardSize = 'grid' | 'hero';

export interface ManagerCardProps {
  manager: JokerCard;
  size?: ManagerCardSize;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
}

function frameRarity(manager: JokerCard): string {
  return MANAGER_RARITY_TO_FRAME[manager.rarity] ?? 'Rare';
}

function cardContents(manager: JokerCard, size: ManagerCardSize, portraitOk: boolean, setPortraitOk: (ok: boolean) => void) {
  const rarity = frameRarity(manager);
  const tier = handoffMgrTier(rarity);
  const managerClassName = managerClass(manager.id);
  const classColour = handoffClassColor(managerClassName);
  const portrait = managerPortraitSrc(manager.id);
  const formation = manager.preferredFormation ?? 'ANY SHAPE';
  const signature = manager.traits[0] ?? manager.archetype;

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
          className={styles.identityCrest}
          style={{ '--manager-class': classColour } as CSSProperties}
          aria-label={`${managerClassName} manager style`}
        >
          <ClassGlyph cls={managerClassName} size={size === 'hero' ? 28 : 17} color="#fff7df" />
          <small>{rarity.toUpperCase()}</small>
        </div>

        <div className={styles.formationBadge} aria-label={`Preferred formation ${formation}`}>
          <small>PREFERS</small>
          <strong>{formation}</strong>
        </div>

        <div className={styles.identityPlate}>
          <strong className={styles.name}>{manager.name.toUpperCase()}</strong>
          <span className={styles.archetype}>{manager.archetype.toUpperCase()}</span>
          <div className={styles.signature}>
            <i aria-hidden="true">◆</i>
            <b>{signature.toUpperCase()}</b>
          </div>
        </div>

        <div className={styles.raritySeam} style={{ '--manager-edge': tier.edge } as CSSProperties} />
      </div>
    </>
  );
}

export default function ManagerCard({
  manager,
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
  const style = {
    '--manager-frame': tier.frame,
    '--manager-edge': tier.edge,
    '--manager-glow': tier.glow,
    '--manager-inner': tier.inner,
  } as CSSProperties;
  const contents = cardContents(manager, size, portraitOk, setPortraitOk);
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
    'aria-label': `${manager.name}, ${manager.archetype}, prefers ${manager.preferredFormation ?? 'any formation'}, signature ${manager.traits[0] ?? manager.archetype}`,
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
