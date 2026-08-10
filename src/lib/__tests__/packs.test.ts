import { describe, expect, it } from 'vitest';
import {
  RIP_COUNTS,
  STARTER_CHOICE_COUNT,
  ripStarterPackChoices,
} from '../packs';

describe('starter pack choice offers', () => {
  it('creates three distinct manager choices and three complete legal player packs', () => {
    const choices = ripStarterPackChoices(20260810);

    expect(choices.managers).toHaveLength(STARTER_CHOICE_COUNT);
    expect(new Set(choices.managers.map((manager) => manager.id)).size).toBe(STARTER_CHOICE_COUNT);
    expect(choices.playerPacks).toHaveLength(STARTER_CHOICE_COUNT);

    for (const pack of choices.playerPacks) {
      expect(pack).toHaveLength(RIP_COUNTS.players);
      expect(pack.some((card) => card.position === 'GK')).toBe(true);
      expect(pack.every((card) => card.rarity === 'Common' || card.rarity === 'Rare')).toBe(true);
    }

    const signatures = choices.playerPacks.map((pack) => pack.map((card) => card.id).join(','));
    expect(new Set(signatures).size).toBe(STARTER_CHOICE_COUNT);
  });

  it('replays the same offers from the same seed', () => {
    expect(ripStarterPackChoices(442211)).toEqual(ripStarterPackChoices(442211));
  });
});
