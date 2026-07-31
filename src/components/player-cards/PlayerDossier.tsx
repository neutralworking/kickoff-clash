'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import type { Card } from '../../lib/scoring';
import type { V6Card } from '../../lib/match-v6';
import { toDisplayV6Card } from '../../lib/v6-bridge';
import type { UiPlayerView } from '@/game-v7';
import type {
  ActionTarget,
  V7ActionDefinition,
  V7PlayerCard as V7PlayerDefinition,
} from '@/engine-v7';
import {
  eligiblePositions,
  handoffTier,
  lastName,
  playerActions,
  POSITION_COLOR,
} from '../cards/cardTokens';
import { portraitSrc } from '../cards/portrait';
import styles from './PlayerDossier.module.css';

const PIP_CELLS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export interface PlayerDossierAction {
  name: string;
  trigger: string;
  effect: string;
  target: string;
  duration: string;
  charges?: number;
}

export interface PlayerDossierRecord {
  appearances: number;
  goals: number;
  assists: number;
}

export interface PlayerDossierData {
  id: string;
  name: string;
  portrait?: string;
  primaryPosition: string;
  secondaryPositions: string[];
  role: string;
  rarity: string;
  cost: number;
  printedAttack: number;
  printedDefence: number;
  currentAttack?: number;
  currentDefence?: number;
  contextLabel?: string;
  contextNotes?: string[];
  actions: PlayerDossierAction[];
  record?: PlayerDossierRecord;
}

function displayToken(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normaliseRarity(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Common';
}

function clampStat(value: number): number {
  return Math.max(-5, Math.min(25, Math.round(value)));
}

function formatTarget(target: ActionTarget): string {
  switch (target.type) {
    case 'self':
      return 'This player';
    case 'selected_player':
      return `${displayToken(target.side)} selected player${target.zone ? ` · ${displayToken(target.zone)}` : ''}`;
    case 'team':
      return `${displayToken(target.side)} team${target.zone ? ` · ${displayToken(target.zone)}` : ''}`;
    case 'sector':
      return `${displayToken(target.side)} ${target.sector ? displayToken(target.sector) : 'selected'} sector`;
    case 'slot':
      return `${displayToken(target.side)} ${target.slotKey ? target.slotKey.toUpperCase() : 'selected'} slot`;
    case 'position_group':
      return `${displayToken(target.side)} ${target.positions.join(' / ')}`;
    case 'adjacent_player':
      return `${displayToken(target.side)} adjacent player`;
    case 'partner':
      return `${displayToken(target.mode)} linked partner`;
    case 'ranked_players':
      return `${displayToken(target.side)} ${displayToken(target.direction)} ${displayToken(target.measure)} player${target.count && target.count > 1 ? 's' : ''}`;
    case 'chance':
      return `${displayToken(target.side)} ${displayToken(target.selector)} chance${target.sector ? ` · ${displayToken(target.sector)}` : ''}`;
    default:
      return 'Match target';
  }
}

export function collectionPlayerDossier(card: Card, supplied?: V6Card): PlayerDossierData {
  const v6 = supplied ?? toDisplayV6Card(card);
  const actions = playerActions(card);

  return {
    id: String(card.id),
    name: card.name,
    portrait: v6.portrait ?? portraitSrc(card) ?? undefined,
    primaryPosition: card.position,
    secondaryPositions: eligiblePositions(card.position).slice(1),
    role: card.tacticalRole ?? card.archetype,
    rarity: normaliseRarity(card.rarity),
    cost: Math.max(1, Math.min(6, v6.cost)),
    printedAttack: clampStat(v6.attack),
    printedDefence: clampStat(v6.defence),
    actions: actions.map((action) => ({
      name: action.label,
      trigger: 'Card trait',
      effect: action.text,
      target: 'This player or its contribution',
      duration: 'Ongoing',
    })),
    record: {
      appearances: card.matchesPlayed ?? 0,
      goals: card.goals ?? 0,
      assists: card.assists ?? 0,
    },
  };
}

export function v7PlayerDossier(
  player: UiPlayerView,
  card: V7PlayerDefinition | undefined,
  definitions: readonly V7ActionDefinition[],
  contextLabel?: string,
): PlayerDossierData {
  const primaryPosition = card?.positionCodes[0] ?? player.position ?? '—';
  const actionDefinitions = card
    ? card.actionIds.map((id) => definitions.find((definition) => definition.id === id)).filter((definition): definition is V7ActionDefinition => Boolean(definition))
    : [];
  const contextNotes = [
    player.position && player.position !== primaryPosition ? `Deployed as ${player.position}` : null,
    player.outOfPosition ? 'Out of position penalty active' : null,
    player.emergencyGoalkeeper ? 'Emergency goalkeeper treatment active' : null,
  ].filter((note): note is string => Boolean(note));

  return {
    id: player.cardId,
    name: player.name,
    portrait: portraitSrc({ id: player.cardId, name: player.name, position: primaryPosition }) ?? undefined,
    primaryPosition,
    secondaryPositions: card?.positionCodes.slice(1) ?? [],
    role: card?.role ?? 'Player',
    rarity: normaliseRarity(card?.rarity ?? 'common'),
    cost: Math.max(1, Math.min(6, card?.printedCost ?? 1)),
    printedAttack: clampStat(card?.printedAttack ?? player.attack),
    printedDefence: clampStat(card?.printedDefence ?? player.defence),
    currentAttack: clampStat(player.attack),
    currentDefence: clampStat(player.defence),
    contextLabel: contextLabel ?? 'Current match',
    contextNotes,
    actions: actionDefinitions.map((action) => ({
      name: action.name,
      trigger: displayToken(action.timing),
      effect: action.displayText,
      target: formatTarget(action.target),
      duration: displayToken(action.duration),
      charges: action.printedCharges,
    })),
  };
}

function pipStyle(cell: number): CSSProperties {
  const index = cell - 1;
  return {
    gridColumn: (index % 3) + 1,
    gridRow: Math.floor(index / 3) + 1,
  };
}

function deltaLabel(current: number, printed: number): string {
  const delta = current - printed;
  if (delta === 0) return 'UNCHANGED';
  return `${delta > 0 ? '+' : ''}${delta}`;
}

export default function PlayerDossier({
  data,
  onClose,
}: {
  data: PlayerDossierData;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const marker = `kc-player-dossier:${data.id}:${Date.now()}`;
    const previousState = window.history.state;
    window.history.pushState({ ...previousState, __kcPlayerDossier: marker }, '');
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
      if (!closedByBack && window.history.state?.__kcPlayerDossier === marker) {
        window.history.back();
      }
    };
  }, [data.id]);

  const tier = handoffTier(normaliseRarity(data.rarity));
  const actionName = data.actions[0]?.name ?? 'NO ACTION';
  const attack = clampStat(data.printedAttack);
  const defence = clampStat(data.printedDefence);
  const currentAttack = data.currentAttack;
  const currentDefence = data.currentDefence;
  const hasMatchContext = currentAttack !== undefined || currentDefence !== undefined || Boolean(data.contextNotes?.length);
  const style = {
    '--pd-frame': tier.frame,
    '--pd-edge': tier.edge,
    '--pd-glow': tier.glow,
  } as CSSProperties;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${data.name} player dossier`}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <span>PLAYER DOSSIER</span>
          <strong>{data.name}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close player dossier">×</button>
      </header>

      <div className={styles.scroll}>
        <main className={styles.content}>
          <section className={styles.heroSection}>
            <div className={styles.card} style={style} aria-label={`${data.name}, ${data.primaryPosition}, cost ${data.cost}, ${attack} attack, ${defence} defence`}>
              <div className={styles.frameMaterial} />
              <div className={styles.cardInterior}>
                <div className={styles.kcMonogram} aria-hidden="true">KC</div>
                <div className={styles.portrait}>
                  {data.portrait
                    ? <img src={data.portrait} alt="" draggable={false} />
                    : <span>{lastName(data.name).slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className={styles.costCorner} aria-label={`Cost ${data.cost}`}>
                  <span className={styles.pipCluster}>
                    {(PIP_CELLS[data.cost] ?? PIP_CELLS[1]).map((cell) => <i key={cell} style={pipStyle(cell)} />)}
                  </span>
                </div>
                <div className={styles.positionCorner}>{data.primaryPosition}</div>
                <div className={styles.nameplate}>{lastName(data.name).toUpperCase()}</div>
                <div className={styles.actionPanel}>{actionName.toUpperCase()}</div>
                <div className={`${styles.statBadge} ${styles.statLeft}`} aria-label={`${attack} attack`}><b>{attack}</b></div>
                <div className={`${styles.statBadge} ${styles.statRight}`} aria-label={`${defence} defence`}><b>{defence}</b></div>
              </div>
            </div>
            <div className={styles.identityLine}>
              <span>{normaliseRarity(data.rarity)}</span>
              <b>{data.role}</b>
            </div>
          </section>

          {hasMatchContext && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{data.contextLabel ?? 'CURRENT MATCH'}</span>
                <strong>LIVE STATE</strong>
              </div>
              <div className={styles.currentStats}>
                <div>
                  <span>CURRENT ATT</span>
                  <strong className={currentAttack !== undefined && currentAttack > attack ? styles.boosted : currentAttack !== undefined && currentAttack < attack ? styles.reduced : ''}>{currentAttack ?? attack}</strong>
                  <small>{deltaLabel(currentAttack ?? attack, attack)}</small>
                </div>
                <div>
                  <span>CURRENT DEF</span>
                  <strong className={currentDefence !== undefined && currentDefence > defence ? styles.boosted : currentDefence !== undefined && currentDefence < defence ? styles.reduced : ''}>{currentDefence ?? defence}</strong>
                  <small>{deltaLabel(currentDefence ?? defence, defence)}</small>
                </div>
              </div>
              {data.contextNotes && data.contextNotes.length > 0 && (
                <div className={styles.contextNotes}>
                  {data.contextNotes.map((note) => <span key={note}>{note}</span>)}
                </div>
              )}
            </section>
          )}

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>ACTIONS</span>
              <strong>{data.actions.length || 'NO'} PRINTED</strong>
            </div>
            <div className={styles.actionList}>
              {data.actions.length > 0 ? data.actions.map((action, index) => (
                <article key={`${action.name}:${index}`}>
                  <div className={styles.actionTitle}>
                    <span>⚡</span>
                    <strong>{action.name}</strong>
                    {action.charges !== undefined && <i>{action.charges} CHARGE{action.charges === 1 ? '' : 'S'}</i>}
                  </div>
                  <p>{action.effect}</p>
                  <dl>
                    <div><dt>TRIGGER</dt><dd>{action.trigger}</dd></div>
                    <div><dt>TARGET</dt><dd>{action.target}</dd></div>
                    <div><dt>DURATION</dt><dd>{action.duration}</dd></div>
                  </dl>
                </article>
              )) : <div className={styles.emptyAction}>No printed action.</div>}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <span>IDENTITY</span>
              <strong>POSITIONS & ROLE</strong>
            </div>
            <div className={styles.positionRow}>
              <span className={styles.primaryPosition} style={{ '--position-colour': POSITION_COLOR[data.primaryPosition] ?? '#9aa0a8' } as CSSProperties}>{data.primaryPosition}</span>
              {data.secondaryPositions.map((position) => (
                <span key={position} style={{ '--position-colour': POSITION_COLOR[position] ?? '#9aa0a8' } as CSSProperties}>{position}</span>
              ))}
            </div>
            <div className={styles.roleRow}><span>ROLE</span><strong>{data.role}</strong></div>
          </section>

          {data.record && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>RUN RECORD</span>
                <strong>CAREER THIS RUN</strong>
              </div>
              <div className={styles.recordGrid}>
                <div><strong>{data.record.appearances}</strong><span>APPS</span></div>
                <div><strong>{data.record.goals}</strong><span>GOALS</span></div>
                <div><strong>{data.record.assists}</strong><span>ASSISTS</span></div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
