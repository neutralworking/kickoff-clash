'use client';

import type { CSSProperties } from 'react';
import { cardNaturalPositions, cardPositionLabels, type Card } from '../../lib/scoring';
import type { V6Card } from '../../lib/match-v6';
import type { Competence } from '../../lib/team-select';
import { v6Cost } from '../../lib/v6-bridge';
import { deriveStats } from '../../lib/funnel';
import { handoffTier, lastName, playerActions, POSITION_COLOR } from '../cards/cardTokens';
import styles from './TeamSelectionPlayerCard.module.css';

export interface TeamSelectionPlayerCardProps {
  card: Card;
  v6card?: V6Card;
  size: 'pitch' | 'bench';
  competence?: Competence;
  dimmed?: boolean;
  highlighted?: boolean;
  showMisfitReceipt?: boolean;
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
  const fallback = deriveStats(card);
  const attack = clampStat(v6card?.attack ?? fallback.atk);
  const defence = clampStat(v6card?.defence ?? fallback.def);
  const cost = Math.max(1, Math.min(6, v6card?.cost ?? v6Cost(card)));
  const legacyAction = playerActions(card)[0];
  const actionName = card.abilityName ?? legacyAction?.label ?? 'NO ACTION';
  const positions = cardPositionLabels(card);
  const naturalPositions = cardNaturalPositions(card);
  const primaryPosition = positions[0] ?? card.position;
  const primaryPositionColor = POSITION_COLOR[naturalPositions[0] ?? card.position] ?? 'var(--dust)';
  const actionFontSize = actionName.length > 20 ? '5px' : actionName.length > 15 ? '6px' : actionName.length > 11 ? '7px' : '8px';
  const fitClass = competence === 'incompetent'
    ? styles.fitMisfit
    : competence === 'secondary'
      ? styles.fitSecondary
      : styles.fitPrimary;

  const style = {
    '--pc-frame': tier.frame,
    '--pc-edge': tier.edge,
    '--pc-glow': tier.glow,
    '--action-font': actionFontSize,
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
      data-player-id={card.id}
      data-player-positions={positions.join('/')}
      data-player-action={actionName}
      data-player-attack={attack}
      data-player-defence={defence}
      aria-label={`${card.name}, ${positions.join(' or ')}, cost ${cost}, ${attack} attack, ${defence} defence, ${actionName}`}
    >
      <div className={styles.frameMaterial} />
      <div className={styles.interior}>
        <div className={styles.topMeta}>
          <span className={styles.costCorner} aria-label={`Cost ${cost}`}>{cost}</span>
          <span className={styles.positions} aria-label={`Primary position ${primaryPosition}`}>
            <span
              data-position-chip={primaryPosition}
              className={`${styles.positionChip} ${styles.primaryPosition}`}
              style={{ '--position-color': primaryPositionColor } as CSSProperties}
            >
              {primaryPosition}
            </span>
          </span>
        </div>

        <div className={styles.nameplate} title={card.name}>{lastName(card.name).toUpperCase()}</div>
        <div className={styles.actionPanel} title={actionName}>{actionName.toUpperCase()}</div>

        <div className={styles.statRow}>
          <div className={`${styles.statBadge} ${styles.statLeft}`} aria-label={`${attack} attack`}>
            <b>{attack}</b>
          </div>
          <div className={`${styles.statBadge} ${styles.statRight}`} aria-label={`${defence} defence`}>
            <b>{defence}</b>
          </div>
        </div>
      </div>

      {competence === 'incompetent' && showMisfitReceipt && (
        <span className={styles.misfitReceipt}>−2 ATT · −2 DEF</span>
      )}
    </div>
  );
}
