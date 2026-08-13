import { describe, expect, it } from 'vitest';
import {
  RIP_COUNTS,
  STARTER_CHOICE_COUNT,
  V8_STARTER_PLAYER_POOL,
  ripCardPack,
  ripStarterPackChoices,
} from '../packs';
import { getPlayerPickCards, getShopCards } from '../run';
import { toDisplayV6Card } from '../v6-bridge';

describe('starter pack choice offers', () => {
  it('creates three distinct manager choices and three complete legal player packs', () => {
    const choices = ripStarterPackChoices(20260810);

    expect(choices.managers).toHaveLength(STARTER_CHOICE_COUNT);
    expect(new Set(choices.managers.map((manager) => manager.id)).size).toBe(STARTER_CHOICE_COUNT);
    expect(choices.playerPacks).toHaveLength(STARTER_CHOICE_COUNT);

    for (const pack of choices.playerPacks) {
      expect(pack).toHaveLength(RIP_COUNTS.players);
      expect(pack.some((card) => card.position === 'GK')).toBe(true);
      expect(new Set(pack.map((card) => card.id)).size).toBe(RIP_COUNTS.players);
      expect(pack.every((card) => (
        card.v8PlayerId
        && card.realName
        && card.printedCost != null
        && card.printedAttack != null
        && card.printedDefence != null
        && card.abilityName
        && card.abilityText
      ))).toBe(true);
    }

    const signatures = choices.playerPacks.map((pack) => pack.map((card) => card.id).join(','));
    expect(new Set(signatures).size).toBe(STARTER_CHOICE_COUNT);
  });

  it('replays the same offers from the same seed', () => {
    expect(ripStarterPackChoices(442211)).toEqual(ripStarterPackChoices(442211));
  });

  it('uses the deduplicated implemented V8 roster instead of fictional test cards', () => {
    expect(V8_STARTER_PLAYER_POOL.length).toBeGreaterThanOrEqual(60);
    expect(new Set(V8_STARTER_PLAYER_POOL.map((card) => card.realName)).size).toBe(V8_STARTER_PLAYER_POOL.length);
    expect(V8_STARTER_PLAYER_POOL.some((card) => card.realName === 'David Beckham')).toBe(true);
    expect(V8_STARTER_PLAYER_POOL.some((card) => card.realName === 'Lev Yashin')).toBe(true);
    expect(V8_STARTER_PLAYER_POOL.every((card) => card.v8PlayerId)).toBe(true);
  });

  it('preserves authored V8 stats and every authored position for team selection', () => {
    const beckham = V8_STARTER_PLAYER_POOL.find((card) => card.realName === 'David Beckham');
    const ramos = V8_STARTER_PLAYER_POOL.find((card) => card.realName === 'Sergio Ramos');
    const ronaldinho = V8_STARTER_PLAYER_POOL.find((card) => card.realName === 'Ronaldinho');

    expect(beckham?.positionLabels).toEqual(['RM', 'CM']);
    expect(beckham?.naturalPositions).toEqual(['WM', 'CM']);
    expect(ramos?.positionLabels).toEqual(['CB', 'RB']);
    expect(ramos?.naturalPositions).toEqual(['CD', 'WD']);
    expect(ronaldinho?.positionLabels).toEqual(['WF', 'AM']);
    expect(ronaldinho?.naturalPositions).toEqual(['WF', 'AM']);

    for (const card of V8_STARTER_PLAYER_POOL) {
      const displayed = toDisplayV6Card(card);
      expect(displayed.attack).toBe(card.printedAttack);
      expect(displayed.defence).toBe(card.printedDefence);
      expect(card.positionLabels?.length).toBeGreaterThan(0);
      expect(card.naturalPositions?.length).toBeGreaterThan(0);
    }
  });

  it('uses the same implemented V8 roster for every between-match player offer', () => {
    const offers = [
      ...getPlayerPickCards(901),
      ...getShopCards(902),
      ...getShopCards(903, true),
      ...ripCardPack('scout', 904),
      ...ripCardPack('elite', 905),
    ];
    const rosterIds = new Set(V8_STARTER_PLAYER_POOL.map((card) => card.v8PlayerId));

    expect(offers).toHaveLength(15);
    expect(offers.every((card) => card.v8PlayerId && rosterIds.has(card.v8PlayerId))).toBe(true);
    expect(offers.every((card) => (
      card.realName
      && card.printedCost != null
      && card.printedAttack != null
      && card.printedDefence != null
      && card.abilityName
      && card.abilityText
    ))).toBe(true);
  });
});
