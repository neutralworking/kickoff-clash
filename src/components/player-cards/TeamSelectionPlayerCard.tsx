'use client';

import type { CSSProperties } from 'react';
import type { Card } from '../../lib/scoring';
import type { V6Card } from '../../lib/match-v6';
import type { Competence } from '../../lib/team-select';
import { v6Cost } from '../../lib/v6-bridge';
import { deriveStats } from '../../lib/funnel';
import { handoffTier, lastName, playerActions } from '../cards/cardTokens';
import { portraitSrc } from '../cards/portrait';
import styles from './TeamSelectionPlayerCard.module.css';

const PIP_CELLS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export interface TeamSelectionPlayerCardProps {
  card: Card;
  v6card?: V6Card;
  size: 'pitch' | 'bench';
  competence?: Competence;
  dimmed?: boolean;
  highlighted?: boolean;
  showMisfitReceipt?: boolean;
}

function pipStyle(cell: number): CSSProperties {
  const index = cell - 1;
  return {
    gridColumn: (index % 3) + 1,
    gridRow: Math.floor(index / 3) + 1,
  };
}

function clampStat(value: number): number {
  return Math.max(-5, Math.min(25, Math.round(value)));
}

export default function TeamSelectionPlayerCard({
  card,
  v6card,
  size,
  competence = 'primary',
  dimmed = false,
  highlighted = false,
  showMisfitReceipt = false,
}: TeamSelectionPlayerCardProps) {
  const tier = handoffTier(card.rarity);
  const portrait = v6card?.portrait ?? portraitSrc(card);
  const fallback = deriveStats(card);
  const attack = clampStat(v6card?.attack ?? fallback.atk);
  const defence = clampStat(v6card?.defence ?? fallback.def);
  const cost = Math.max(1, Math.min(6, v6card?.cost ?? v6Cost(card)));
  const actionName = playerActions(card)[0]?.label ?? card.abilityName ?? 'NO ACTION';
  const fitClass = competence === 'incompetent'
    ? styles.fitMisfit
    : competence === 'secondary'
      ? styles.fitSecondary
      : styles.fitPrimary;

  const style = {
    '--pc-frame': tier.frame,
    '--pc-edge': tier.edge,
    '--pc-glow': tier.glow,
  } as CSSProperties;

  return (
    <div
      className={[
        styles.card,
        size === 'pitch' ? styles.pitch : styles.bench,
        fitClass,
        dimmed ? styles.dimmed : '',
        highlighted ? styles.highlighted : '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-label={`${card.name}, ${card.position}, cost ${cost}, ${attack} attack, ${defence} defence, ${actionName}`}
    >
      <div className={styles.frameMaterial} />
      <div className={styles.interior}>
        <div className={styles.kcMonogram} aria-hidden="true">KC</div>

        <div className={styles.portrait}>
          {portrait ? <img src={portrait} alt="" draggable={false} /> : <span>{lastName(card.name).slice(0, 2).toUpperCase()}</span>}
        </div>

        <div className={styles.costCorner} aria-label={`Cost ${cost}`}>
          <span className={styles.pipCluster}>
            {PIP_CELLS[cost].map((cell) => <i key={cell} style={pipStyle(cell)} />)}
          </span>
        </div>

        <div className={styles.positionCorner}>{card.position}</div>

        <div className={styles.nameplate} title={card.name}>{lastName(card.name).toUpperCase()}</div>
        <div className={styles.actionPanel} title={actionName}>{actionName.toUpperCase()}</div>

        <div className={`${styles.statBadge} ${styles.statLeft}`} aria-label={`${attack} attack`}>
          <b>{attack}</b>
        </div>
        <div className={`${styles.statBadge} ${styles.statRight}`} aria-label={`${defence} defence`}>
          <b>{defence}</b>
        </div>
      </div>

      {competence === 'incompetent' && showMisfitReceipt && (
        <span className={styles.misfitReceipt}>−2 ATT · −2 DEF</span>
      )}
    </div>
  );
}
