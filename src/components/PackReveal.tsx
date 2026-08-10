'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { PackContents, StarterPackChoices } from '../lib/packs';
import type { Card } from '../lib/scoring';
import type { JokerCard } from '../lib/jokers';
import { managerFormationsV1 } from '../lib/manager-v1';
import GameCard, { type GameCardModel } from './cards/GameCard';
import CardModal from './cards/CardModal';
import ManagerCard from './manager-cards/ManagerCard';
import ManagerDossier from './manager-cards/ManagerDossier';
import styles from './PackReveal.module.css';

type Stage =
  | 'manager-choice'
  | 'manager-opening'
  | 'manager-reveal'
  | 'player-choice'
  | 'player-opening'
  | 'player-reveal';

const PACK_LETTERS = ['A', 'B', 'C'];

function packLine(position: string): number {
  if (['GK', 'CD', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'WD'].includes(position)) return 0;
  if (['DM', 'CM', 'AM', 'LM', 'RM', 'WM'].includes(position)) return 1;
  return 2;
}

function orderSquad(players: Card[]): Card[] {
  return [...players].sort((a, b) => {
    const line = packLine(a.position) - packLine(b.position);
    if (line !== 0) return line;
    return b.power - a.power;
  });
}

function PackArt({
  kind,
  index,
  opening = false,
}: {
  kind: 'manager' | 'players';
  index: number;
  opening?: boolean;
}) {
  const label = kind === 'manager' ? 'MANAGER' : 'SQUAD';
  return (
    <div
      className={`${styles.packArt} ${styles[`packArt${index}`]} ${opening ? styles.packOpening : ''}`}
      aria-hidden="true"
    >
      <span className={styles.packShimmer} />
      <span className={styles.packLetter}>{PACK_LETTERS[index]}</span>
      <span className={styles.packMonogram}>KC</span>
      <strong>{label}</strong>
      <small>{kind === 'manager' ? 'ONE GAFFER' : '18 PLAYERS'}</small>
      <span className={styles.packSeal}>KICKOFF CLASH</span>
    </div>
  );
}

function PackChoice({
  kind,
  onChoose,
}: {
  kind: 'manager' | 'players';
  onChoose: (index: number) => void;
}) {
  return (
    <div className={styles.choiceStage} data-testid={`${kind}-pack-choice`}>
      <div className={styles.packChoices}>
        {PACK_LETTERS.map((letter, index) => (
          <button
            key={letter}
            type="button"
            className={styles.packChoice}
            onClick={() => onChoose(index)}
            aria-label={`Choose ${kind === 'manager' ? 'manager' : 'player'} pack ${letter}`}
          >
            <PackArt kind={kind} index={index} />
          </button>
        ))}
      </div>
      <p className={styles.pickPrompt}>PICK ONE</p>
    </div>
  );
}

function OpeningBeat({ kind, index }: { kind: 'manager' | 'players'; index: number }) {
  return (
    <div className={styles.openingStage} data-testid={`${kind}-pack-opening`}>
      <span className={styles.openingBurst} aria-hidden="true" />
      <PackArt kind={kind} index={index} opening />
    </div>
  );
}

function PlayerReveal({
  players,
  onInspect,
}: {
  players: Card[];
  onInspect: (card: Card) => void;
}) {
  const ordered = useMemo(() => orderSquad(players), [players]);

  return (
    <div className={styles.rosterViewport} data-testid="chosen-player-pack">
      <div className={styles.rosterGrid}>
        {ordered.map((card, index) => {
          const timing = { '--reveal-delay': `${120 + index * 54}ms` } as CSSProperties;
          return (
            <div key={card.id} className={styles.playerSlot} style={timing} data-testid="starter-player-card">
              <div className={styles.playerBack} aria-hidden="true">
                <span>KC</span>
              </div>
              <div className={styles.playerFront}>
                <GameCard
                  model={{ variant: 'player', card }}
                  size="grid"
                  onClick={() => onInspect(card)}
                  ariaLabel={`Inspect ${card.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PackRevealProps {
  choices: StarterPackChoices;
  onContinue: (contents: PackContents) => void;
}

export default function PackReveal({ choices, onContinue }: PackRevealProps) {
  const [stage, setStage] = useState<Stage>('manager-choice');
  const [managerIndex, setManagerIndex] = useState<number | null>(null);
  const [playerPackIndex, setPlayerPackIndex] = useState<number | null>(null);
  const [playerModal, setPlayerModal] = useState<GameCardModel | null>(null);
  const [managerModal, setManagerModal] = useState<JokerCard | null>(null);

  useEffect(() => {
    if (stage !== 'manager-opening' && stage !== 'player-opening') return;
    const nextStage = stage === 'manager-opening' ? 'manager-reveal' : 'player-reveal';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setStage(nextStage), reducedMotion ? 20 : 620);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const selectedManager = managerIndex === null ? null : choices.managers[managerIndex] ?? null;
  const selectedPlayers = playerPackIndex === null ? null : choices.playerPacks[playerPackIndex] ?? null;
  const isManagerStage = stage.startsWith('manager');

  function chooseManager(index: number) {
    setManagerIndex(index);
    setStage('manager-opening');
  }

  function choosePlayers(index: number) {
    setPlayerPackIndex(index);
    setStage('player-opening');
  }

  function finishOpening() {
    if (!selectedManager || !selectedPlayers) return;
    onContinue({
      players: selectedPlayers,
      managers: [selectedManager],
      tactics: [],
      formations: choices.formations,
    });
  }

  const title = stage === 'manager-choice'
    ? 'CHOOSE A MANAGER PACK'
    : stage === 'manager-reveal'
      ? 'YOUR GAFFER'
      : stage === 'player-choice'
        ? 'CHOOSE YOUR SQUAD'
        : stage === 'player-reveal'
          ? 'THE SQUAD'
          : 'OPENING…';

  const subtitle = stage === 'manager-choice'
    ? 'One pack. One gaffer. No take-backs.'
    : stage === 'manager-reveal'
      ? 'The run starts with this manager.'
      : stage === 'player-choice'
        ? 'Eighteen players are waiting in each pack.'
        : stage === 'player-reveal'
          ? '11 starters · 7 on the bench'
          : 'Hold your nerve.';

  return (
    <div className={`${styles.screen} ${isManagerStage ? styles.managerScreen : styles.playerScreen}`}>
      <header className={styles.header}>
        <div className={styles.progress} aria-label={`Opening step ${isManagerStage ? 1 : 2} of 2`}>
          <span className={isManagerStage ? styles.progressActive : styles.progressDone} />
          <span className={!isManagerStage ? styles.progressActive : ''} />
        </div>
        <span className={styles.eyebrow}>PACK {isManagerStage ? '1' : '2'} / 2</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>

      <main className={styles.main}>
        {stage === 'manager-choice' && <PackChoice kind="manager" onChoose={chooseManager} />}
        {stage === 'manager-opening' && managerIndex !== null && <OpeningBeat kind="manager" index={managerIndex} />}
        {stage === 'manager-reveal' && selectedManager && (
          <div className={styles.managerReveal} data-testid="chosen-manager-reveal">
            <span className={styles.revealHalo} aria-hidden="true" />
            <div className={styles.managerCardReveal}>
              <ManagerCard
                manager={selectedManager}
                formations={managerFormationsV1(selectedManager)}
                size="hero"
                onClick={() => setManagerModal(selectedManager)}
              />
            </div>
          </div>
        )}
        {stage === 'player-choice' && <PackChoice kind="players" onChoose={choosePlayers} />}
        {stage === 'player-opening' && playerPackIndex !== null && <OpeningBeat kind="players" index={playerPackIndex} />}
        {stage === 'player-reveal' && selectedPlayers && (
          <PlayerReveal players={selectedPlayers} onInspect={(card) => setPlayerModal({ variant: 'player', card })} />
        )}
      </main>

      {(stage === 'manager-reveal' || stage === 'player-reveal') && (
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.continueButton}
            onClick={() => stage === 'manager-reveal' ? setStage('player-choice') : finishOpening()}
          >
            {stage === 'manager-reveal' ? 'CHOOSE PLAYER PACK' : 'BUILD YOUR XI'}
          </button>
        </footer>
      )}

      <CardModal model={playerModal} onClose={() => setPlayerModal(null)} />
      {managerModal && (
        <ManagerDossier
          manager={managerModal}
          formations={managerFormationsV1(managerModal)}
          onClose={() => setManagerModal(null)}
        />
      )}
    </div>
  );
}
