'use client';

import { calculatedChanceCount } from '@/engine-v7';
import type { SubDecision, UiMatchView, UiPlayerView } from '@/game-v7';
import { cardMetaFor } from './V7Pitch';
import './v7subs.css';

export type ReplacementTone = 'boost' | 'natural' | 'lane' | 'risk';

export interface ReplacementHint {
  label: string;
  tone: ReplacementTone;
  detail: string;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function playerById(view: UiMatchView, cardId: string): UiPlayerView | undefined {
  return [...view.player.active, ...view.player.bench].find((player) => player.cardId === cardId);
}

function totals(players: readonly UiPlayerView[]): { attack: number; defence: number } {
  return players.reduce((sum, player) => ({
    attack: sum.attack + Math.max(0, player.attack),
    defence: sum.defence + Math.max(0, player.defence),
  }), { attack: 0, defence: 0 });
}

function pairDelta(incoming: UiPlayerView, outgoing: UiPlayerView): {
  attack: number;
  defence: number;
  penalty: number;
  fit: 'natural' | 'lane' | 'risk';
} {
  const exactPosition = Boolean(incoming.position && outgoing.position && incoming.position === outgoing.position);
  const sameLane = incoming.sector === outgoing.sector;
  const penalty = sameLane ? 0 : 2;
  return {
    attack: Math.max(0, incoming.attack - penalty) - outgoing.attack,
    defence: Math.max(0, incoming.defence - penalty) - outgoing.defence,
    penalty,
    fit: exactPosition ? 'natural' : sameLane ? 'lane' : 'risk',
  };
}

export function replacementHintFor(
  view: UiMatchView,
  incoming: UiPlayerView,
  outgoing: UiPlayerView,
  existingSubs: readonly SubDecision[],
): ReplacementHint {
  const home = totals(view.player.active);
  const away = totals(view.opponent.active);
  let existingAttackDelta = 0;
  let existingDefenceDelta = 0;

  for (const sub of existingSubs) {
    const currentIncoming = playerById(view, sub.inCardId);
    const currentOutgoing = playerById(view, sub.outCardId);
    if (!currentIncoming || !currentOutgoing) continue;
    const change = pairDelta(currentIncoming, currentOutgoing);
    existingAttackDelta += change.attack;
    existingDefenceDelta += change.defence;
  }

  const change = pairDelta(incoming, outgoing);
  const beforeChances = calculatedChanceCount(home.attack + existingAttackDelta, away.defence);
  const afterChances = calculatedChanceCount(home.attack + existingAttackDelta + change.attack, away.defence);
  const chanceDelta = afterChances - beforeChances;

  if (chanceDelta > 0) {
    return {
      label: `+${chanceDelta} CHANCE`,
      tone: 'boost',
      detail: `${signed(change.attack)} ATT · ${incoming.position ?? '—'} into ${outgoing.position ?? '—'}`,
    };
  }
  if (chanceDelta < 0) {
    return {
      label: `${chanceDelta} CHANCE`,
      tone: 'risk',
      detail: `${signed(change.attack)} ATT · ${incoming.position ?? '—'} into ${outgoing.position ?? '—'}`,
    };
  }
  if (change.fit === 'natural') {
    return { label: 'NATURAL', tone: 'natural', detail: `${signed(change.attack)} ATT · ${signed(change.defence)} DEF` };
  }
  if (change.fit === 'lane') {
    return { label: 'SAME LANE', tone: 'lane', detail: `${signed(change.attack)} ATT · ${signed(change.defence)} DEF` };
  }
  return { label: '−2 OOP', tone: 'risk', detail: `${signed(change.attack)} ATT · ${signed(change.defence)} DEF` };
}

export function V7SubstitutionPanel({
  view,
  substitutions,
  selectedBench,
  energyBudget,
  energyRemaining,
  onCancelSelection,
  onRemove,
}: {
  view: UiMatchView;
  substitutions: readonly SubDecision[];
  selectedBench: UiPlayerView | null;
  energyBudget: number;
  energyRemaining: number;
  onCancelSelection: () => void;
  onRemove: (index: number) => void;
}) {
  const home = totals(view.player.active);
  const away = totals(view.opponent.active);
  let attackDelta = 0;
  let defenceDelta = 0;

  const rows = substitutions.flatMap((sub, index) => {
    const incoming = playerById(view, sub.inCardId);
    const outgoing = playerById(view, sub.outCardId);
    if (!incoming || !outgoing) return [];
    const change = pairDelta(incoming, outgoing);
    attackDelta += change.attack;
    defenceDelta += change.defence;
    return [{ sub, index, incoming, outgoing, change }];
  });

  const beforePressure = home.attack - away.defence;
  const afterPressure = home.attack + attackDelta - away.defence;
  const beforeChances = calculatedChanceCount(home.attack, away.defence);
  const afterChances = calculatedChanceCount(home.attack + attackDelta, away.defence);
  const selectedMeta = selectedBench ? cardMetaFor(selectedBench.cardId) : null;

  if (selectedBench && selectedMeta) {
    const availableTargets = view.player.active.filter(
      (player) => !substitutions.some((sub) => sub.outCardId === player.cardId),
    );
    const natural = availableTargets.filter((player) => player.position === selectedBench.position).length;
    const sameLane = availableTargets.filter(
      (player) => player.position !== selectedBench.position && player.sector === selectedBench.sector,
    ).length;

    return (
      <section className="v7-sub-panel choosing" aria-live="polite">
        <div className="v7-sub-choice">
          <div>
            <span>BRING ON</span>
            <strong>{selectedBench.shortName}</strong>
            <small>{selectedBench.position ?? '—'} · {selectedMeta.role} · Cost {selectedMeta.cost}</small>
          </div>
          <button type="button" onClick={onCancelSelection} aria-label="Cancel substitute selection">×</button>
        </div>
        <div className="v7-sub-target-summary">
          <strong>Tap a highlighted player to replace</strong>
          <span className="natural">{natural} natural</span>
          <span className="lane">{sameLane} same lane</span>
          <span className="risk">others −2/−2</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`v7-sub-panel${rows.length ? ' planned' : ''}`} aria-live="polite">
      <div className="v7-sub-impact">
        <div><span>ATT</span><strong>{home.attack}<i>→</i>{home.attack + attackDelta}</strong><small>{signed(attackDelta)}</small></div>
        <div><span>DEF</span><strong>{home.defence}<i>→</i>{home.defence + defenceDelta}</strong><small>{signed(defenceDelta)}</small></div>
        <div><span>PRESSURE</span><strong>{signed(beforePressure)}<i>→</i>{signed(afterPressure)}</strong><small>{signed(afterPressure - beforePressure)}</small></div>
        <div className={afterChances > beforeChances ? 'threshold-up' : afterChances < beforeChances ? 'threshold-down' : ''}>
          <span>CHANCES</span><strong>{beforeChances}<i>→</i>{afterChances}</strong><small>{afterChances === beforeChances ? 'NO CHANGE' : `${signed(afterChances - beforeChances)} THRESHOLD`}</small>
        </div>
      </div>

      <div className="v7-sub-plan-list">
        <div className="v7-sub-energy"><b>{energyRemaining}</b><span>/{energyBudget} ⚡</span></div>
        {rows.map(({ index, incoming, outgoing, change }) => (
          <button type="button" className={`v7-sub-plan-card ${change.fit}`} key={`${outgoing.cardId}:${incoming.cardId}`} onClick={() => onRemove(index)}>
            <span>{outgoing.position ?? '—'} {outgoing.shortName}</span>
            <b>→</b>
            <span>{incoming.position ?? '—'} {incoming.shortName}</span>
            <small>{signed(change.attack)} ATT · {signed(change.defence)} DEF</small>
            <i>×</i>
          </button>
        ))}
        {rows.length === 0 && <p>Tap a bench card to plan a substitution. The chance threshold impact will appear here before you lock it.</p>}
      </div>
    </section>
  );
}
