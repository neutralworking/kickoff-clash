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

export interface SubstitutionImpact {
  attackDelta: number;
  defenceDelta: number;
  penalty: number;
  fit: 'natural' | 'lane' | 'risk';
  pressureBefore: number;
  pressureAfter: number;
  chancesBefore: number;
  chancesAfter: number;
  chanceDelta: number;
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

function existingDeltas(view: UiMatchView, existingSubs: readonly SubDecision[]): { attack: number; defence: number } {
  let attack = 0;
  let defence = 0;
  for (const sub of existingSubs) {
    const incoming = playerById(view, sub.inCardId);
    const outgoing = playerById(view, sub.outCardId);
    if (!incoming || !outgoing) continue;
    const change = pairDelta(incoming, outgoing);
    attack += change.attack;
    defence += change.defence;
  }
  return { attack, defence };
}

export function substitutionImpactFor(
  view: UiMatchView,
  incoming: UiPlayerView,
  outgoing: UiPlayerView,
  existingSubs: readonly SubDecision[],
): SubstitutionImpact {
  const home = totals(view.player.active);
  const away = totals(view.opponent.active);
  const existing = existingDeltas(view, existingSubs);
  const change = pairDelta(incoming, outgoing);
  const pressureBefore = home.attack + existing.attack - away.defence;
  const pressureAfter = pressureBefore + change.attack;
  const chancesBefore = calculatedChanceCount(home.attack + existing.attack, away.defence);
  const chancesAfter = calculatedChanceCount(home.attack + existing.attack + change.attack, away.defence);

  return {
    attackDelta: change.attack,
    defenceDelta: change.defence,
    penalty: change.penalty,
    fit: change.fit,
    pressureBefore,
    pressureAfter,
    chancesBefore,
    chancesAfter,
    chanceDelta: chancesAfter - chancesBefore,
  };
}

export function replacementHintFor(
  view: UiMatchView,
  incoming: UiPlayerView,
  outgoing: UiPlayerView,
  existingSubs: readonly SubDecision[],
): ReplacementHint {
  const impact = substitutionImpactFor(view, incoming, outgoing, existingSubs);

  if (impact.chanceDelta > 0) {
    return {
      label: `+${impact.chanceDelta} CHANCE`,
      tone: 'boost',
      detail: `${signed(impact.attackDelta)} ATT · ${incoming.position ?? '—'} into ${outgoing.position ?? '—'}`,
    };
  }
  if (impact.chanceDelta < 0) {
    return {
      label: `${impact.chanceDelta} CHANCE`,
      tone: 'risk',
      detail: `${signed(impact.attackDelta)} ATT · ${incoming.position ?? '—'} into ${outgoing.position ?? '—'}`,
    };
  }
  if (impact.fit === 'natural') {
    return { label: 'NATURAL', tone: 'natural', detail: `${signed(impact.attackDelta)} ATT · ${signed(impact.defenceDelta)} DEF` };
  }
  if (impact.fit === 'lane') {
    return { label: 'SAME LANE', tone: 'lane', detail: `${signed(impact.attackDelta)} ATT · ${signed(impact.defenceDelta)} DEF` };
  }
  return { label: '−2 OOP', tone: 'risk', detail: `${signed(impact.attackDelta)} ATT · ${signed(impact.defenceDelta)} DEF` };
}

function pointsToNextChance(pressure: number): number {
  if (pressure < 0) return Math.abs(pressure) + 5;
  const remainder = pressure % 5;
  return remainder === 0 ? 5 : 5 - remainder;
}

function fitRank(fit: SubstitutionImpact['fit']): number {
  if (fit === 'natural') return 2;
  if (fit === 'lane') return 1;
  return 0;
}

export function V7SubstitutionPanel({
  view,
  substitutions,
  selectedBench,
  energyBudget,
  energyRemaining,
  locked = false,
  onCancelSelection,
  onEdit,
  onRemove,
}: {
  view: UiMatchView;
  substitutions: readonly SubDecision[];
  selectedBench: UiPlayerView | null;
  energyBudget: number;
  energyRemaining: number;
  locked?: boolean;
  onCancelSelection: () => void;
  onEdit: () => void;
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
    const impact = substitutionImpactFor(view, incoming, outgoing, substitutions.slice(0, index));
    attackDelta += impact.attackDelta;
    defenceDelta += impact.defenceDelta;
    return [{ sub, index, incoming, outgoing, impact, cost: cardMetaFor(incoming.cardId).cost }];
  });

  const beforePressure = home.attack - away.defence;
  const afterPressure = home.attack + attackDelta - away.defence;
  const beforeChances = calculatedChanceCount(home.attack, away.defence);
  const afterChances = calculatedChanceCount(home.attack + attackDelta, away.defence);
  const selectedMeta = selectedBench ? cardMetaFor(selectedBench.cardId) : null;
  const energySpent = energyBudget - energyRemaining;

  if (selectedBench && selectedMeta && !locked) {
    const availableTargets = view.player.active.filter(
      (player) => !substitutions.some((sub) => sub.outCardId === player.cardId),
    );
    const options = availableTargets.map((outgoing) => ({
      outgoing,
      impact: substitutionImpactFor(view, selectedBench, outgoing, substitutions),
    })).sort((a, b) => (
      b.impact.chanceDelta - a.impact.chanceDelta
      || fitRank(b.impact.fit) - fitRank(a.impact.fit)
      || b.impact.attackDelta - a.impact.attackDelta
      || b.impact.defenceDelta - a.impact.defenceDelta
    ));
    const best = options[0];
    const natural = options.filter((option) => option.impact.fit === 'natural').length;
    const sameLane = options.filter((option) => option.impact.fit === 'lane').length;
    const energyAfter = Math.max(0, energyRemaining - selectedMeta.cost);

    return (
      <section className="v7-sub-panel choosing" aria-live="polite">
        <div className="v7-sub-choice">
          <div>
            <span>BRING ON</span>
            <strong>{selectedBench.shortName}</strong>
            <small>{selectedBench.position ?? '—'} · {selectedMeta.role}</small>
          </div>
          <div className="v7-sub-choice-cost"><b>{selectedMeta.cost}</b><span>⚡</span><small>{energyAfter} left</small></div>
          <button type="button" onClick={onCancelSelection} aria-label="Cancel substitute selection">×</button>
        </div>
        <div className="v7-sub-target-summary">
          <strong>Tap a highlighted player to replace</strong>
          {best ? (
            <div className={`v7-sub-best ${best.impact.chanceDelta > 0 ? 'boost' : best.impact.fit}`}>
              <span>BEST IMPACT</span>
              <b>{best.outgoing.position ?? '—'} {best.outgoing.shortName}</b>
              <small>
                {signed(best.impact.attackDelta)} ATT · {signed(best.impact.defenceDelta)} DEF · {best.impact.chancesBefore}→{best.impact.chancesAfter} chances
              </small>
            </div>
          ) : <div className="v7-sub-best risk"><span>NO TARGET</span><b>No available player</b></div>}
          <div className="v7-sub-fit-counts">
            <span className="natural">{natural} natural</span>
            <span className="lane">{sameLane} same lane</span>
            <span className="risk">others −2/−2</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`v7-sub-panel${rows.length ? ' planned' : ''}${locked ? ' locked' : ''}`} aria-live="polite">
      <div className="v7-sub-impact">
        <div><span>ATT</span><strong>{home.attack}<i>→</i>{home.attack + attackDelta}</strong><small>{signed(attackDelta)}</small></div>
        <div><span>DEF</span><strong>{home.defence}<i>→</i>{home.defence + defenceDelta}</strong><small>{signed(defenceDelta)}</small></div>
        <div><span>PRESSURE</span><strong>{signed(beforePressure)}<i>→</i>{signed(afterPressure)}</strong><small>{pointsToNextChance(afterPressure)} TO NEXT</small></div>
        <div className={afterChances > beforeChances ? 'threshold-up' : afterChances < beforeChances ? 'threshold-down' : ''}>
          <span>CHANCES</span><strong>{beforeChances}<i>→</i>{afterChances}</strong><small>{afterChances === beforeChances ? 'NO CHANGE' : `${signed(afterChances - beforeChances)} THRESHOLD`}</small>
        </div>
      </div>

      {locked && (
        <div className="v7-sub-locked-row">
          <div><span>CHANGES LOCKED</span><strong>{rows.length} {rows.length === 1 ? 'substitution' : 'substitutions'} ready</strong><small>The next pressure calculation will use these values.</small></div>
          <button type="button" onClick={onEdit}>Edit</button>
        </div>
      )}

      <div className="v7-sub-plan-list">
        <div className="v7-sub-energy"><b>{energyRemaining}</b><span>/{energyBudget} ⚡</span><small>{energySpent} spent</small></div>
        {rows.map(({ index, incoming, outgoing, impact, cost }) => (
          <button
            type="button"
            className={`v7-sub-plan-card ${impact.fit}`}
            key={`${outgoing.cardId}:${incoming.cardId}`}
            disabled={locked}
            onClick={() => onRemove(index)}
          >
            <span>{outgoing.position ?? '—'} {outgoing.shortName}</span>
            <b>→</b>
            <span>{incoming.position ?? '—'} {incoming.shortName}</span>
            <small>{signed(impact.attackDelta)} ATT · {signed(impact.defenceDelta)} DEF · {cost}⚡</small>
            {!locked && <i>×</i>}
          </button>
        ))}
        {rows.length === 0 && <p>Tap a bench card to compare replacements. A substitution only changes chances when it crosses a five-point pressure band.</p>}
      </div>
    </section>
  );
}
