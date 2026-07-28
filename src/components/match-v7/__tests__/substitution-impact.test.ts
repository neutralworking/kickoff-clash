import { describe, expect, it } from 'vitest';
import { calculatedChanceCount } from '@/engine-v7';
import { V7MatchController, v7Fixture, type UiMatchView, type UiPlayerView } from '@/game-v7';
import { replacementHintFor, substitutionImpactFor } from '../V7SubstitutionPanel';

function view(): UiMatchView {
  return new V7MatchController(v7Fixture()).getView();
}

function player(match: UiMatchView, cardId: string): UiPlayerView {
  const found = [...match.player.active, ...match.player.bench].find((candidate) => candidate.cardId === cardId);
  if (!found) throw new Error(`Missing fixture player ${cardId}`);
  return found;
}

function totals(players: readonly UiPlayerView[]): { attack: number; defence: number } {
  return players.reduce((sum, current) => ({
    attack: sum.attack + current.attack,
    defence: sum.defence + current.defence,
  }), { attack: 0, defence: 0 });
}

describe('V7 substitution impact previews', () => {
  it('distinguishes natural replacements from out-of-position moves', () => {
    const match = view();
    const leftWing = player(match, 'h_b2');
    const naturalTarget = player(match, 'h_lw');
    const rightBack = player(match, 'h_rb');

    const natural = substitutionImpactFor(match, leftWing, naturalTarget, []);
    expect(natural.fit).toBe('natural');
    expect(natural.penalty).toBe(0);
    expect(natural.attackDelta).toBe(leftWing.attack - naturalTarget.attack);
    expect(natural.defenceDelta).toBe(leftWing.defence - naturalTarget.defence);

    const risk = substitutionImpactFor(match, leftWing, rightBack, []);
    expect(risk.fit).toBe('risk');
    expect(risk.penalty).toBe(2);
    expect(risk.attackDelta).toBe(Math.max(0, leftWing.attack - 2) - rightBack.attack);
    expect(risk.defenceDelta).toBe(Math.max(0, leftWing.defence - 2) - rightBack.defence);
    expect(replacementHintFor(match, leftWing, rightBack, []).tone).toBe('risk');
  });

  it('calculates threshold impact after already planned substitutions', () => {
    const match = view();
    const firstIncoming = player(match, 'h_b2');
    const firstOutgoing = player(match, 'h_lw');
    const nextIncoming = player(match, 'h_b3');
    const nextOutgoing = player(match, 'h_cm');
    const first = substitutionImpactFor(match, firstIncoming, firstOutgoing, []);
    const second = substitutionImpactFor(match, nextIncoming, nextOutgoing, [{ outCardId: 'h_lw', inCardId: 'h_b2' }]);
    const home = totals(match.player.active);
    const away = totals(match.opponent.active);

    expect(second.pressureBefore).toBe(home.attack + first.attackDelta - away.defence);
    expect(second.chancesBefore).toBe(calculatedChanceCount(home.attack + first.attackDelta, away.defence));
    expect(second.chancesAfter).toBe(calculatedChanceCount(home.attack + first.attackDelta + second.attackDelta, away.defence));
    expect(second.chanceDelta).toBe(second.chancesAfter - second.chancesBefore);
  });
});
