'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { portraitSrc } from '@/components/cards/portrait';
import styles from './PlayerCardLab.module.css';

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
type FitState = 'primary' | 'secondary' | 'misfit';
type InteractionState = 'normal' | 'selected' | 'valid' | 'invalid';
type StatTone = 'neutral' | 'up' | 'down';
type TokenState = 'neutral' | 'selected' | 'out' | 'oop' | 'event';

interface ActionPrototype {
  name: string;
  trigger: string;
  effect: string;
  target: string;
}

interface PlayerPrototype {
  id: string;
  name: string;
  surname: string;
  position: string;
  eligiblePositions: string[];
  cost: number;
  attack: number;
  defence: number;
  rarity: Rarity;
  action: ActionPrototype;
  role: string;
  record: {
    appearances: number;
    goals: number;
    assists: number;
  };
}

const RARITY_STYLE: Record<Rarity, { frame: string; edge: string; glow: string }> = {
  common: {
    frame: 'linear-gradient(145deg, #5f5a51, #28251f 46%, #777066)',
    edge: '#a9a39a',
    glow: 'rgba(169, 163, 154, 0.22)',
  },
  rare: {
    frame: 'linear-gradient(145deg, #f2f5f7, #747c86 30%, #d7dce0 54%, #646b74)',
    edge: '#dce4ea',
    glow: 'rgba(143, 194, 230, 0.4)',
  },
  epic: {
    frame: 'linear-gradient(145deg, #ffe5a0, #9b6b19 27%, #f1c861 52%, #70470d)',
    edge: '#f1c861',
    glow: 'rgba(232, 178, 60, 0.46)',
  },
  legendary: {
    frame: 'linear-gradient(135deg, #ffb473, #f1d66a 18%, #72d9d0 40%, #8ca9ff 64%, #db8cff 82%, #f1d66a)',
    edge: '#ffe28a',
    glow: 'rgba(196, 151, 255, 0.5)',
  },
};

const PLAYERS: PlayerPrototype[] = [
  {
    id: 'h_cf',
    name: 'Niko Vale',
    surname: 'VALE',
    position: 'CF',
    eligiblePositions: ['CF', 'LF', 'RF'],
    cost: 5,
    attack: 14,
    defence: 2,
    rarity: 'epic',
    action: {
      name: 'TALISMAN',
      trigger: 'Game start',
      effect: '+2 ATT for the whole match.',
      target: 'Self',
    },
    role: 'Finisher',
    record: { appearances: 23, goals: 18, assists: 5 },
  },
  {
    id: 'h_lcb',
    name: 'Dane Holt',
    surname: 'HOLT',
    position: 'CB',
    eligiblePositions: ['CB'],
    cost: 3,
    attack: 2,
    defence: 12,
    rarity: 'rare',
    action: {
      name: 'WALL',
      trigger: 'Ongoing',
      effect: '+2 DEF while on the pitch.',
      target: 'Self',
    },
    role: 'Centrale',
    record: { appearances: 27, goals: 2, assists: 1 },
  },
  {
    id: 'h_cm',
    name: 'Ren Colm',
    surname: 'COLM',
    position: 'CM',
    eligiblePositions: ['CM', 'AM'],
    cost: 4,
    attack: 10,
    defence: 5,
    rarity: 'rare',
    action: {
      name: 'SPARK',
      trigger: 'Activated',
      effect: 'Reroll the first centre chance this period.',
      target: 'Own first centre chance',
    },
    role: 'Playmaker',
    record: { appearances: 21, goals: 7, assists: 12 },
  },
  {
    id: 'h_rcb',
    name: 'Ivo Senn',
    surname: 'SENN',
    position: 'CB',
    eligiblePositions: ['CB', 'DM'],
    cost: 3,
    attack: 1,
    defence: 11,
    rarity: 'rare',
    action: {
      name: 'LOCKDOWN',
      trigger: 'Activated',
      effect: "Cancel the opponent's first centre chance this period.",
      target: 'Enemy first centre chance',
    },
    role: 'Anchor',
    record: { appearances: 25, goals: 1, assists: 3 },
  },
  {
    id: 'h_b1',
    name: 'Sol Voss',
    surname: 'VOSS',
    position: 'CF',
    eligiblePositions: ['CF', 'LF'],
    cost: 4,
    attack: 13,
    defence: 2,
    rarity: 'rare',
    action: {
      name: 'TALISMAN',
      trigger: 'Game start',
      effect: '+2 ATT for the whole match.',
      target: 'Self',
    },
    role: 'Poacher',
    record: { appearances: 16, goals: 10, assists: 2 },
  },
  {
    id: 'h_b2',
    name: 'Umi Vale',
    surname: 'VALE',
    position: 'LW',
    eligiblePositions: ['LW', 'LM'],
    cost: 3,
    attack: 11,
    defence: 2,
    rarity: 'epic',
    action: {
      name: 'SPARK',
      trigger: 'Activated',
      effect: 'Reroll the first centre chance this period.',
      target: 'Own first centre chance',
    },
    role: 'Creator',
    record: { appearances: 19, goals: 6, assists: 14 },
  },
  {
    id: 'h_b3',
    name: 'Deni Ferro',
    surname: 'FERRO',
    position: 'CM',
    eligiblePositions: ['CM', 'DM'],
    cost: 2,
    attack: 7,
    defence: 6,
    rarity: 'common',
    action: {
      name: 'LOCKDOWN',
      trigger: 'Activated',
      effect: "Cancel the opponent's first centre chance this period.",
      target: 'Enemy first centre chance',
    },
    role: 'Carrier',
    record: { appearances: 13, goals: 3, assists: 6 },
  },
  {
    id: 'h_b4',
    name: 'Pao Lin',
    surname: 'LIN',
    position: 'CB',
    eligiblePositions: ['CB'],
    cost: 3,
    attack: 2,
    defence: 13,
    rarity: 'rare',
    action: {
      name: 'WALL',
      trigger: 'Ongoing',
      effect: '+2 DEF while on the pitch.',
      target: 'Self',
    },
    role: 'Marker',
    record: { appearances: 22, goals: 2, assists: 2 },
  },
  {
    id: 'h_b5',
    name: 'Milo Ray',
    surname: 'RAY',
    position: 'RM',
    eligiblePositions: ['RM', 'RW'],
    cost: 2,
    attack: 9,
    defence: 3,
    rarity: 'common',
    action: {
      name: 'SPARK',
      trigger: 'Activated',
      effect: 'Reroll the first centre chance this period.',
      target: 'Own first centre chance',
    },
    role: 'Runner',
    record: { appearances: 15, goals: 4, assists: 7 },
  },
  {
    id: 'h_b6',
    name: 'Eli Moss',
    surname: 'MOSS',
    position: 'GK',
    eligiblePositions: ['GK'],
    cost: 2,
    attack: -1,
    defence: 12,
    rarity: 'common',
    action: {
      name: 'WALL',
      trigger: 'Ongoing',
      effect: '+2 DEF while on the pitch.',
      target: 'Self',
    },
    role: 'Keeper',
    record: { appearances: 18, goals: 0, assists: 0 },
  },
  {
    id: 'h_b7',
    name: 'Sacha Neri',
    surname: 'NERI',
    position: 'LB',
    eligiblePositions: ['LB', 'LWB'],
    cost: 3,
    attack: 5,
    defence: 8,
    rarity: 'rare',
    action: {
      name: 'LOCKDOWN',
      trigger: 'Activated',
      effect: "Cancel the opponent's first centre chance this period.",
      target: 'Enemy first centre chance',
    },
    role: 'Fullback',
    record: { appearances: 20, goals: 2, assists: 8 },
  },
  {
    id: 'h_lw',
    name: 'Rai Okonkwo',
    surname: 'OKONKWO',
    position: 'LW',
    eligiblePositions: ['LW', 'LF'],
    cost: 6,
    attack: 18,
    defence: 1,
    rarity: 'legendary',
    action: {
      name: 'TALISMAN',
      trigger: 'Game start',
      effect: '+2 ATT for the whole match.',
      target: 'Self',
    },
    role: 'Winger',
    record: { appearances: 24, goals: 15, assists: 11 },
  },
];

const BENCH = PLAYERS.slice(4, 11);

const PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};

function cardVariables(rarity: Rarity): CSSProperties {
  const palette = RARITY_STYLE[rarity];
  return {
    '--rarity-frame': palette.frame,
    '--rarity-edge': palette.edge,
    '--rarity-glow': palette.glow,
  } as CSSProperties;
}

function CostPips({ value }: { value: number }) {
  const positions = PIP_POSITIONS[Math.max(1, Math.min(6, value))] ?? PIP_POSITIONS[1];
  return (
    <span className={styles.costPips} aria-label={`Cost ${value}`}>
      {positions.map(([row, column], index) => (
        <i key={`${row}:${column}:${index}`} style={{ gridRow: row, gridColumn: column }} />
      ))}
    </span>
  );
}

function Portrait({ player }: { player: PlayerPrototype }) {
  const source = portraitSrc({ id: player.id, name: player.name, position: player.position });
  const initials = player.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.portraitLayer}>
      <span className={styles.portraitFallback}>{initials}</span>
      {source && <img src={source} alt="" draggable={false} />}
    </div>
  );
}

function StatBadge({
  label,
  value,
  side,
  tone = 'neutral',
}: {
  label: 'ATT' | 'DEF';
  value: number;
  side: 'left' | 'right';
  tone?: StatTone;
}) {
  const className = [
    styles.statBadge,
    side === 'left' ? styles.statLeft : styles.statRight,
    tone === 'up' ? styles.statUp : '',
    tone === 'down' ? styles.statDown : '',
  ].filter(Boolean).join(' ');

  return (
    <span className={className}>
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}

interface TeamCardProps {
  player: PlayerPrototype;
  size?: 'pitch' | 'bench' | 'hero';
  fit?: FitState;
  interaction?: InteractionState;
  slotLabel?: string;
  receipt?: string;
  onClick?: () => void;
}

function TeamCard({
  player,
  size = 'pitch',
  fit,
  interaction = 'normal',
  slotLabel,
  receipt,
  onClick,
}: TeamCardProps) {
  const shellClass = [
    styles.teamCard,
    size === 'pitch' ? styles.pitchCard : '',
    size === 'bench' ? styles.benchCard : '',
    size === 'hero' ? styles.heroCard : '',
    fit === 'primary' ? styles.fitPrimary : '',
    fit === 'secondary' ? styles.fitSecondary : '',
    fit === 'misfit' ? styles.fitMisfit : '',
    interaction === 'selected' ? styles.cardSelected : '',
    interaction === 'valid' ? styles.cardValid : '',
    interaction === 'invalid' ? styles.cardInvalid : '',
  ].filter(Boolean).join(' ');

  const content = (
    <>
      <div className={styles.cardFace}>
        <div className={styles.frameMaterial} />
        <div className={styles.cardInterior}>
          <span className={styles.kcMonogram} aria-hidden="true">KC</span>
          <Portrait player={player} />
          <span className={styles.costCorner}><CostPips value={player.cost} /></span>
          <span className={styles.positionCorner}>{player.position}</span>
          <span className={styles.nameplate}>{player.surname}</span>
          <span className={styles.actionPanel}>{player.action.name}</span>
          <StatBadge label="ATT" value={player.attack} side="left" />
          <StatBadge label="DEF" value={player.defence} side="right" />
        </div>
      </div>
      {slotLabel && <span className={styles.contextLabel}>{slotLabel}</span>}
      {receipt && <span className={styles.fitReceipt}>{receipt}</span>}
      {interaction === 'invalid' && <span className={styles.lockBadge}>LOCKED</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={shellClass}
        style={cardVariables(player.rarity)}
        onClick={onClick}
        aria-label={`Open ${player.name}, ${player.action.name}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={shellClass} style={cardVariables(player.rarity)}>
      {content}
    </div>
  );
}

interface MatchTokenProps {
  player: PlayerPrototype;
  attack: number;
  defence: number;
  attackTone?: StatTone;
  defenceTone?: StatTone;
  state?: TokenState;
  triggeredAction?: string;
}

function MatchToken({
  player,
  attack,
  defence,
  attackTone = 'neutral',
  defenceTone = 'neutral',
  state = 'neutral',
  triggeredAction,
}: MatchTokenProps) {
  const tokenClass = [
    styles.matchToken,
    state === 'selected' ? styles.tokenSelected : '',
    state === 'out' ? styles.tokenOut : '',
    state === 'oop' ? styles.tokenOop : '',
    state === 'event' ? styles.tokenEvent : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={tokenClass} style={cardVariables(player.rarity)} aria-label={`${player.name}, ${attack} attack, ${defence} defence`}>
      <div className={styles.tokenFace}>
        <span className={styles.tokenKc} aria-hidden="true">KC</span>
        <Portrait player={player} />
        <span className={styles.tokenPosition}>{player.position}</span>
        <span className={styles.tokenName}>{player.surname}</span>
        <StatBadge label="ATT" value={attack} side="left" tone={attackTone} />
        <StatBadge label="DEF" value={defence} side="right" tone={defenceTone} />
      </div>
      {state === 'out' && <span className={styles.tokenStateBadge}>OUT</span>}
      {state === 'oop' && <span className={styles.tokenStateBadge}>OOP</span>}
      {triggeredAction && <span className={styles.actionRibbon}>{triggeredAction}</span>}
    </div>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className={styles.sectionHeading}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}

function StateKey({ children, tone }: { children: ReactNode; tone: 'positive' | 'amber' | 'negative' | 'neutral' }) {
  return <span className={`${styles.stateKey} ${styles[`key${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>{children}</span>;
}

function Dossier({ player, onClose }: { player: PlayerPrototype; onClose: () => void }) {
  return (
    <div className={styles.dossierBackdrop} role="presentation" onClick={onClose}>
      <article className={styles.dossier} role="dialog" aria-modal="true" aria-label={`${player.name} dossier`} onClick={(event) => event.stopPropagation()}>
        <header className={styles.dossierHeader}>
          <div>
            <span>PLAYER DOSSIER</span>
            <strong>{player.name}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close player dossier">×</button>
        </header>

        <div className={styles.dossierHero}>
          <TeamCard player={player} size="hero" />
          <p>Swipe or scroll for the full rules and player identity.</p>
        </div>

        <section className={styles.dossierPanel}>
          <span className={styles.dossierEyebrow}>ACTION</span>
          <h3>{player.action.name}</h3>
          <dl className={styles.ruleGrid}>
            <div><dt>Trigger</dt><dd>{player.action.trigger}</dd></div>
            <div><dt>Effect</dt><dd>{player.action.effect}</dd></div>
            <div><dt>Target</dt><dd>{player.action.target}</dd></div>
          </dl>
        </section>

        <section className={styles.dossierPanel}>
          <span className={styles.dossierEyebrow}>ELIGIBLE POSITIONS</span>
          <div className={styles.positionChips}>
            {player.eligiblePositions.map((position, index) => (
              <span key={position} className={index === 0 ? styles.primaryChip : ''}>{position}</span>
            ))}
          </div>
        </section>

        <section className={styles.dossierPanel}>
          <span className={styles.dossierEyebrow}>IDENTITY</span>
          <div className={styles.identityRow}>
            <div><small>ROLE / ARCHETYPE</small><strong>{player.role}</strong></div>
            <div><small>RARITY</small><strong>{player.rarity.toUpperCase()}</strong></div>
          </div>
        </section>

        <section className={styles.dossierPanel}>
          <span className={styles.dossierEyebrow}>CAREER RECORD</span>
          <div className={styles.recordGrid}>
            <div><b>{player.record.appearances}</b><span>APPS</span></div>
            <div><b>{player.record.goals}</b><span>GOALS</span></div>
            <div><b>{player.record.assists}</b><span>ASSISTS</span></div>
          </div>
        </section>
      </article>
    </div>
  );
}

export default function PlayerCardLab() {
  const [selectedBenchId, setSelectedBenchId] = useState(BENCH[1].id);
  const [actionTriggered, setActionTriggered] = useState(true);
  const [dossierPlayer, setDossierPlayer] = useState<PlayerPrototype | null>(null);

  const selectedBench = useMemo(
    () => BENCH.find((player) => player.id === selectedBenchId) ?? BENCH[0],
    [selectedBenchId],
  );

  return (
    <main className={styles.labPage}>
      <header className={styles.labHeader}>
        <div>
          <span className={styles.labKicker}>KICKOFF CLASH · REAL UI PROTOTYPE</span>
          <h1>Player card lab</h1>
          <p>Actual mobile card sizes, existing portrait assets and the V7-supported Talisman, Wall, Spark and Lockdown mechanics.</p>
        </div>
        <div className={styles.cornerLegend} aria-label="Fixed clockwise corner order">
          <span>COST</span><span>POSITION</span><span>DEF</span><span>ATT</span>
          <small>clockwise</small>
        </div>
      </header>

      <div className={styles.mobileViewport}>
        <section className={styles.labSection}>
          <SectionHeading
            eyebrow="01 · TEAM SELECTION"
            title="Fit without changing the card"
            copy="The permanent anatomy stays fixed. Slot fit and the misfit receipt sit around it."
          />

          <div className={styles.energyPanel}>
            <div><span>STARTING ENERGY</span><strong>31 / 35</strong></div>
            <div className={styles.energyTrack}><i style={{ width: '88.5%' }} /></div>
            <small>Four energy remains for the final slot.</small>
          </div>

          <div className={styles.fitGrid}>
            <TeamCard player={PLAYERS[0]} fit="primary" slotLabel="CF · PRIMARY" onClick={() => setDossierPlayer(PLAYERS[0])} />
            <TeamCard player={PLAYERS[0]} fit="secondary" slotLabel="LF · SECONDARY" onClick={() => setDossierPlayer(PLAYERS[0])} />
            <TeamCard player={PLAYERS[0]} fit="misfit" slotLabel="CB · MISFIT" receipt="-2 ATT / -2 DEF" onClick={() => setDossierPlayer(PLAYERS[0])} />
          </div>

          <div className={styles.keyRow}>
            <StateKey tone="positive">PRIMARY</StateKey>
            <StateKey tone="amber">SECONDARY</StateKey>
            <StateKey tone="negative">MISFIT</StateKey>
          </div>
        </section>

        <section className={styles.labSection}>
          <SectionHeading
            eyebrow="02 · SWAP STATES"
            title="Selection lives outside the face"
            copy={`Bench selection: ${selectedBench.surname}. Card identity, action and stats remain readable in every target state.`}
          />

          <div className={styles.targetGrid}>
            <TeamCard player={selectedBench} interaction="selected" slotLabel="SELECTED" onClick={() => setDossierPlayer(selectedBench)} />
            <TeamCard player={PLAYERS[2]} interaction="valid" slotLabel="VALID TARGET" onClick={() => setDossierPlayer(PLAYERS[2])} />
            <TeamCard player={PLAYERS[3]} interaction="invalid" slotLabel="INVALID TARGET" onClick={() => setDossierPlayer(PLAYERS[3])} />
          </div>
        </section>

        <section className={styles.labSection}>
          <SectionHeading
            eyebrow="03 · SEVEN SUBSTITUTES"
            title="Swipeable bench tray"
            copy="Seven complete bench cards keep their intended 92 × 138 px footprint instead of being squeezed into columns."
          />

          <div className={styles.benchTray} aria-label="Seven substitute cards">
            {BENCH.map((player) => (
              <TeamCard
                key={player.id}
                player={player}
                size="bench"
                interaction={player.id === selectedBenchId ? 'selected' : 'normal'}
                onClick={() => setSelectedBenchId(player.id)}
              />
            ))}
          </div>
          <div className={styles.trayHint}><span>← SWIPE BENCH →</span><small>Tap a card to change the selected substitute.</small></div>
        </section>

        <section className={`${styles.labSection} ${styles.matchSection}`}>
          <SectionHeading
            eyebrow="04 · LIVE MATCH"
            title="Purpose-built mini-card tokens"
            copy="Tokens hide cost and the permanent action panel. They show only current effective ATT and DEF."
          />

          <div className={styles.matchPitch}>
            <div className={styles.pitchLine} />
            <div className={styles.pitchCircle} />
            <div className={`${styles.tokenSlot} ${styles.slotOne}`}>
              <MatchToken player={PLAYERS[0]} attack={16} defence={2} attackTone="up" state="selected" />
              <small>BOOSTED</small>
            </div>
            <div className={`${styles.tokenSlot} ${styles.slotTwo}`}>
              <MatchToken player={PLAYERS[1]} attack={2} defence={14} defenceTone="up" state="event" triggeredAction={actionTriggered ? 'WALL' : undefined} />
              <small>ACTION</small>
            </div>
            <div className={`${styles.tokenSlot} ${styles.slotThree}`}>
              <MatchToken player={PLAYERS[2]} attack={7} defence={5} attackTone="down" />
              <small>REDUCED</small>
            </div>
            <div className={`${styles.tokenSlot} ${styles.slotFour}`}>
              <MatchToken player={PLAYERS[3]} attack={-1} defence={9} attackTone="down" defenceTone="down" state="oop" />
              <small>OOP</small>
            </div>
            <div className={`${styles.tokenSlot} ${styles.slotFive}`}>
              <MatchToken player={PLAYERS[11]} attack={18} defence={1} state="out" />
              <small>PLANNED OFF</small>
            </div>
          </div>

          <div className={styles.matchControls}>
            <div className={styles.statLegend}>
              <span><i className={styles.neutralDot} /> unchanged</span>
              <span><i className={styles.downDot} /> modified down</span>
              <span><i className={styles.upDot} /> modified up</span>
            </div>
            <button type="button" onClick={() => setActionTriggered((value) => !value)}>
              {actionTriggered ? 'Hide trigger' : 'Trigger WALL'}
            </button>
          </div>
        </section>

        <section className={styles.labSection}>
          <SectionHeading
            eyebrow="05 · EXPANDED VIEW"
            title="The same card, elevated"
            copy="The dossier keeps gameplay-critical information first, then eligible positions, flavour and career record."
          />

          <button type="button" className={styles.dossierLauncher} onClick={() => setDossierPlayer(PLAYERS[0])}>
            <span className={styles.launcherPortrait}><Portrait player={PLAYERS[0]} /></span>
            <span><small>OPEN FULL-SCREEN DOSSIER</small><strong>{PLAYERS[0].name}</strong></span>
            <b>→</b>
          </button>
        </section>
      </div>

      {dossierPlayer && <Dossier player={dossierPlayer} onClose={() => setDossierPlayer(null)} />}
    </main>
  );
}
