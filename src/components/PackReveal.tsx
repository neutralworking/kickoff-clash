'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import type { PackContents } from '../lib/packs';
import type { Card } from '../lib/scoring';
import type { JokerCard } from '../lib/jokers';
import type { TacticCard } from '../lib/tactics';
import { toDisplayV6Card } from '../lib/v6-bridge';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import { POSITION_COLOR } from './cards/cardTokens';
import TeamSelectionPlayerCard from './player-cards/TeamSelectionPlayerCard';
import PlayerDossier, {
  collectionPlayerDossier,
  type PlayerDossierData,
} from './player-cards/PlayerDossier';
import styles from './PackReveal.module.css';

type Stage = 'managers' | 'rare' | 'common' | 'tactics' | 'overview';
type PlayerStage = 'rare' | 'common';
type Phase = 'sealed' | 'open';

interface StageMeta {
  title: string;
  shortLabel: string;
  accent: string;
  info: string;
  packNumber?: number;
}

const STAGE_ORDER: Stage[] = ['managers', 'rare', 'common', 'tactics', 'overview'];
const PACK_COUNT = 4;

const STAGE_META: Record<Stage, StageMeta> = {
  managers: {
    title: 'MANAGER PACK',
    shortLabel: 'MANAGER',
    accent: '#e84f47',
    info: 'Meet both managers, then pick the one who will lead the run.',
    packNumber: 1,
  },
  rare: {
    title: 'RARE PLAYER PACK',
    shortLabel: 'RARE PLAYERS',
    accent: '#d8e2ee',
    info: 'Six anchors for your first XI. Reveal them one at a time.',
    packNumber: 2,
  },
  common: {
    title: 'COMMON PLAYER PACK',
    shortLabel: 'COMMON PLAYERS',
    accent: '#c88a4a',
    info: 'Ten squad players, including the goalkeeper needed for a legal XI.',
    packNumber: 3,
  },
  tactics: {
    title: 'TACTICAL PACK',
    shortLabel: 'TACTICS',
    accent: '#b06cff',
    info: 'Inspect the three plays, then choose one to carry into the run.',
    packNumber: 4,
  },
  overview: {
    title: 'DRAFT OVERVIEW',
    shortLabel: 'OVERVIEW',
    accent: '#f5c542',
    info: 'Review the shape of your collection before naming the starting XI.',
  },
};

function SealedPack({
  meta,
  count,
  noun,
  onOpen,
}: {
  meta: StageMeta;
  count: number;
  noun: string;
  onOpen: () => void;
}) {
  return (
    <div className={styles.sealedStage}>
      <button type="button" className={styles.sealedButton} onClick={onOpen} aria-label={`Open ${meta.title}`}>
        <div className={styles.packBack}>
          <div className={styles.packMark}>
            <b>KC</b>
            <span>{meta.shortLabel}</span>
            <small>{count} {noun.toUpperCase()}</small>
          </div>
        </div>
        <span className={styles.openHint}>TAP TO OPEN</span>
      </button>
    </div>
  );
}

function PickButton({
  picked,
  label,
  onClick,
}: {
  picked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.pickButton} ${picked ? styles.pickButtonPicked : ''}`}
      onClick={onClick}
    >
      {picked ? 'PICKED ✓' : label}
    </button>
  );
}

function ManagerChoices({
  managers,
  pickedId,
  onPick,
  onInspect,
}: {
  managers: JokerCard[];
  pickedId: string | null;
  onPick: (id: string) => void;
  onInspect: (manager: JokerCard) => void;
}) {
  return (
    <div className={styles.choiceScroll}>
      <div className={styles.managerGrid}>
        {managers.map((manager, index) => {
          const picked = pickedId === manager.id;
          return (
            <div key={manager.id} className={styles.choice}>
              <GameCard
                model={{ variant: 'manager', manager }}
                delay={index * 110}
                selected={picked}
                onClick={() => onInspect(manager)}
                ariaLabel={`Inspect ${manager.name}`}
              />
              <PickButton picked={picked} label="PICK MANAGER" onClick={() => onPick(manager.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TacticChoices({
  tactics,
  pickedId,
  onPick,
  onInspect,
}: {
  tactics: TacticCard[];
  pickedId: string | null;
  onPick: (id: string) => void;
  onInspect: (tactic: TacticCard) => void;
}) {
  return (
    <div className={styles.choiceScroll}>
      <div className={styles.tacticGrid}>
        {tactics.map((tactic, index) => {
          const picked = pickedId === tactic.id;
          return (
            <div key={tactic.id} className={styles.choice}>
              <GameCard
                model={{ variant: 'tactic', tactic, charges: 1 }}
                size="grid"
                delay={index * 90}
                selected={picked}
                onClick={() => onInspect(tactic)}
                ariaLabel={`Inspect ${tactic.name}`}
              />
              <PickButton picked={picked} label="PICK" onClick={() => onPick(tactic.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerRevealStage({
  players,
  revealedCount,
  focusedIndex,
  onFocus,
  onRevealNext,
  onInspect,
}: {
  players: Card[];
  revealedCount: number;
  focusedIndex: number;
  onFocus: (index: number) => void;
  onRevealNext: () => void;
  onInspect: (card: Card) => void;
}) {
  const safeFocus = Math.min(Math.max(0, focusedIndex), Math.max(0, revealedCount - 1));
  const focusedCard = revealedCount > 0 ? players[safeFocus] : null;

  return (
    <div className={styles.playerStage}>
      <div className={styles.revealArea}>
        {focusedCard ? (
          <button
            key={focusedCard.id}
            type="button"
            className={styles.revealButton}
            onClick={() => onInspect(focusedCard)}
            aria-label={`Open ${focusedCard.name} dossier`}
          >
            <TeamSelectionPlayerCard
              card={focusedCard}
              v6card={toDisplayV6Card(focusedCard)}
              size="reveal"
            />
          </button>
        ) : (
          <button type="button" className={styles.cardBackButton} onClick={onRevealNext} aria-label="Reveal first player">
            <div className={styles.firstBack}>KC</div>
          </button>
        )}
      </div>

      <div className={styles.trayShell}>
        <div className={styles.trayMeta}>
          <span>{revealedCount} REVEALED</span>
          <span>{players.length - revealedCount} REMAINING</span>
        </div>
        <div className={styles.tray}>
          {players.map((card, index) => {
            const revealed = index < revealedCount;
            return revealed ? (
              <button
                key={card.id}
                type="button"
                className={`${styles.miniButton} ${index === safeFocus ? styles.miniSelected : ''}`}
                onClick={() => onFocus(index)}
                aria-label={`Focus ${card.name}`}
              >
                <TeamSelectionPlayerCard card={card} v6card={toDisplayV6Card(card)} size="mini" />
              </button>
            ) : (
              <div key={card.id} className={styles.cardBackButton} aria-hidden="true">
                <div className={styles.miniBack}>KC</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DraftOverview({
  players,
  manager,
  tactic,
  onInspect,
}: {
  players: Card[];
  manager: JokerCard | null;
  tactic: TacticCard | null;
  onInspect: (card: Card) => void;
}) {
  const positions = [...new Set(players.map((card) => card.position))];
  const rareCount = players.filter((card) => card.rarity === 'Rare').length;
  const commonCount = players.filter((card) => card.rarity === 'Common').length;

  return (
    <div className={styles.overviewScroll}>
      <section className={styles.overviewHero}>
        <div>
          <span>YOUR MANAGER</span>
          <strong>{manager?.name ?? 'Not selected'}</strong>
        </div>
        <b>{tactic ? `TACTIC · ${tactic.name.toUpperCase()}` : 'NO TACTIC'}</b>
      </section>

      <section className={styles.summaryGrid}>
        <div><strong>{players.length}</strong><span>PLAYERS</span></div>
        <div><strong>{rareCount}</strong><span>RARE</span></div>
        <div><strong>{commonCount}</strong><span>COMMON</span></div>
        <div><strong>{positions.length}</strong><span>POSITIONS</span></div>
      </section>

      <section className={styles.coveragePanel}>
        <span>POSITION COVERAGE</span>
        <div className={styles.coverageChips}>
          {positions.map((position) => (
            <i
              key={position}
              style={{ '--chip-colour': POSITION_COLOR[position] ?? '#9aa0a8' } as CSSProperties}
            >
              {position}
            </i>
          ))}
        </div>
      </section>

      <section className={styles.squadStrip}>
        <span>YOUR PLAYER CARDS · TAP TO INSPECT</span>
        <div className={styles.overviewCards}>
          {players.map((card) => (
            <button
              key={card.id}
              type="button"
              className={styles.miniButton}
              onClick={() => onInspect(card)}
              aria-label={`Open ${card.name} dossier`}
            >
              <TeamSelectionPlayerCard card={card} v6card={toDisplayV6Card(card)} size="mini" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

interface PackRevealProps {
  contents: PackContents;
  onContinue: (managerId: string | null, tacticId: string | null) => void;
}

export default function PackReveal({ contents, onContinue }: PackRevealProps) {
  const [stage, setStage] = useState<Stage>('managers');
  const [phase, setPhase] = useState<Phase>('sealed');
  const [pickedManagerId, setPickedManagerId] = useState<string | null>(null);
  const [pickedTacticId, setPickedTacticId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<PlayerStage, number>>({ rare: 0, common: 0 });
  const [focused, setFocused] = useState<Record<PlayerStage, number>>({ rare: 0, common: 0 });
  const [modal, setModal] = useState<GameCardModel | null>(null);
  const [dossier, setDossier] = useState<PlayerDossierData | null>(null);

  const rarePlayers = useMemo(
    () => contents.players.filter((card) => card.rarity === 'Rare'),
    [contents.players],
  );
  const commonPlayers = useMemo(
    () => contents.players.filter((card) => card.rarity === 'Common'),
    [contents.players],
  );

  const meta = STAGE_META[stage];
  const stageIndex = STAGE_ORDER.indexOf(stage);
  const playerStage = stage === 'rare' || stage === 'common' ? stage : null;
  const stagePlayers = stage === 'rare' ? rarePlayers : stage === 'common' ? commonPlayers : [];
  const selectedManager = contents.managers.find((manager) => manager.id === pickedManagerId) ?? null;
  const selectedTactic = contents.tactics.find((tactic) => tactic.id === pickedTacticId) ?? null;

  const packCount = stage === 'managers'
    ? contents.managers.length
    : stage === 'rare'
      ? rarePlayers.length
      : stage === 'common'
        ? commonPlayers.length
        : contents.tactics.length;
  const packNoun = stage === 'managers' ? 'managers' : stage === 'tactics' ? 'tactics' : 'players';

  function openPlayerDossier(card: Card) {
    setDossier(collectionPlayerDossier(card, toDisplayV6Card(card)));
  }

  function advanceStage() {
    const nextStage = STAGE_ORDER[stageIndex + 1];
    if (!nextStage) {
      onContinue(pickedManagerId, pickedTacticId);
      return;
    }
    setStage(nextStage);
    setPhase(nextStage === 'overview' ? 'open' : 'sealed');
  }

  function revealNext(key: PlayerStage) {
    const cards = key === 'rare' ? rarePlayers : commonPlayers;
    setRevealed((current) => {
      const nextCount = Math.min(cards.length, current[key] + 1);
      setFocused((focus) => ({ ...focus, [key]: Math.max(0, nextCount - 1) }));
      return { ...current, [key]: nextCount };
    });
  }

  function revealAll(key: PlayerStage) {
    const cards = key === 'rare' ? rarePlayers : commonPlayers;
    setRevealed((current) => ({ ...current, [key]: cards.length }));
    setFocused((current) => ({ ...current, [key]: 0 }));
  }

  const managerGated = stage === 'managers' && !pickedManagerId;
  const tacticGated = stage === 'tactics' && !pickedTacticId;
  const playerComplete = playerStage ? revealed[playerStage] >= stagePlayers.length : false;

  let primaryLabel = 'NEXT PACK →';
  let primaryDisabled = false;
  let primaryAction = advanceStage;

  if (stage === 'managers') {
    primaryLabel = managerGated ? 'PICK A MANAGER' : 'NEXT PACK →';
    primaryDisabled = managerGated;
  } else if (playerStage) {
    if (!playerComplete) {
      primaryLabel = revealed[playerStage] === 0 ? 'REVEAL FIRST CARD' : 'REVEAL NEXT CARD';
      primaryAction = () => revealNext(playerStage);
    }
  } else if (stage === 'tactics') {
    primaryLabel = tacticGated ? 'PICK A TACTIC' : 'VIEW DRAFT →';
    primaryDisabled = tacticGated;
  } else {
    primaryLabel = 'PICK YOUR TEAM →';
    primaryAction = () => onContinue(pickedManagerId, pickedTacticId);
  }

  return (
    <div
      className={styles.screen}
      style={{ '--pack-accent': meta.accent } as CSSProperties}
    >
      {phase === 'open' && stage !== 'overview' && <div key={`flash:${stage}`} className={styles.flash} aria-hidden="true" />}

      <header className={styles.header}>
        <div className={styles.steps} aria-label={`Step ${stageIndex + 1} of ${STAGE_ORDER.length}`}>
          {STAGE_ORDER.map((key, index) => (
            <span
              key={key}
              className={`${styles.step} ${index < stageIndex ? styles.stepDone : ''} ${index === stageIndex ? styles.stepActive : ''}`}
            />
          ))}
        </div>
        <h1>{meta.title}</h1>
        <p>{meta.packNumber ? `PACK ${meta.packNumber} / ${PACK_COUNT}` : 'YOUR STARTING COLLECTION'}</p>
      </header>

      <div className={styles.body}>
        {phase === 'sealed' ? (
          <SealedPack meta={meta} count={packCount} noun={packNoun} onOpen={() => setPhase('open')} />
        ) : (
          <>
            <div className={styles.info}>{meta.info}</div>

            {stage === 'managers' ? (
              <ManagerChoices
                managers={contents.managers}
                pickedId={pickedManagerId}
                onPick={setPickedManagerId}
                onInspect={(manager) => setModal({ variant: 'manager', manager })}
              />
            ) : playerStage ? (
              <PlayerRevealStage
                players={stagePlayers}
                revealedCount={revealed[playerStage]}
                focusedIndex={focused[playerStage]}
                onFocus={(index) => setFocused((current) => ({ ...current, [playerStage]: index }))}
                onRevealNext={() => revealNext(playerStage)}
                onInspect={openPlayerDossier}
              />
            ) : stage === 'tactics' ? (
              <TacticChoices
                tactics={contents.tactics}
                pickedId={pickedTacticId}
                onPick={setPickedTacticId}
                onInspect={(tactic) => setModal({ variant: 'tactic', tactic, charges: 1 })}
              />
            ) : (
              <DraftOverview
                players={contents.players}
                manager={selectedManager}
                tactic={selectedTactic}
                onInspect={openPlayerDossier}
              />
            )}
          </>
        )}
      </div>

      {phase === 'open' && (
        <footer className={styles.footer}>
          {playerStage && !playerComplete && (
            <button type="button" className={styles.secondaryButton} onClick={() => revealAll(playerStage)}>
              REVEAL ALL
            </button>
          )}
          <button
            type="button"
            className={styles.primaryButton}
            disabled={primaryDisabled}
            onClick={primaryAction}
          >
            {primaryLabel}
          </button>
        </footer>
      )}

      <CardModal model={modal} onClose={() => setModal(null)} />
      {dossier && <PlayerDossier data={dossier} onClose={() => setDossier(null)} />}
    </div>
  );
}
