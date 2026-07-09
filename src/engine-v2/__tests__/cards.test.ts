/**
 * KC six-contest engine (NW-141) — dataset / catalogue / draft acceptance.
 *
 * Asserts the P3 acceptance:
 *   • the action catalogue covers all 45 roles, both compounding axes per pool
 *     (design law 5), and a build-around per pool
 *   • the regenerated kc_v2_cards.json passes coverage (all roles fed, every
 *     contest has cards + Commons fuel)
 *   • the headless shop-bot drafts a viable, COMMITTED XI for all 11 managers
 *     from random shop streams
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ROLES,
  ROLES_BY_POS,
  CATALOGUE,
  actionFor,
  RARITIES,
  loadCards,
  cardTraits,
  type KCCard,
  type KCCardJSON,
  draftForManager,
  MANAGERS,
  CONTESTS,
  type Contest,
  RngStream,
} from '../index';

const DATA = join(__dirname, '..', '..', '..', 'public', 'data', 'kc_v2_cards.json');
const cards: KCCard[] = loadCards(JSON.parse(readFileSync(DATA, 'utf8')) as KCCardJSON[]);

function shuffle(rng: RngStream, arr: KCCard[]): KCCard[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------

describe('action catalogue (CARD_ACTIONS_V1)', () => {
  it('covers all 45 roles', () => {
    expect(ROLES).toHaveLength(45);
    for (const r of ROLES) expect(CATALOGUE[r.name], `no action for ${r.name}`).toBeDefined();
  });

  it('carries both axes and a build-around for every contest pool (law 5)', () => {
    for (const c of CONTESTS) {
      const roleNames = ROLES.filter((r) => r.contest === c).map((r) => r.name);
      const pool = roleNames.map((n) => CATALOGUE[n]);
      expect(pool.some((a) => a.axis === 'amplify'), `${c}: no amplification`).toBe(true);
      expect(pool.some((a) => a.axis === 'consistency'), `${c}: no consistency`).toBe(true);
      expect(pool.some((a) => a.buildAround), `${c}: no build-around`).toBe(true);
    }
  });

  it('actionFor scales magnitude by rarity tier', () => {
    const mags = RARITIES.map((r) => actionFor('Centrale', r)!.magnitude);
    expect(mags[0]).toBeLessThan(mags[3]); // Common < Legendary
    expect(actionFor('Not A Role', 'Common')).toBeNull();
  });
});

describe('regenerated dataset (kc_v2_cards.json)', () => {
  it('has 540 cards, all with a valid six-contest role', () => {
    expect(cards).toHaveLength(540);
    for (const c of cards) {
      expect(CONTESTS).toContain(c.contest);
      expect(c.tilt).toBeGreaterThan(0);
      expect(cardTraits(c).length).toBe(1); // every card carries its role's action
    }
  });

  it('covers all 45 roles and feeds every contest (coverage validation)', () => {
    const roleCount = new Map<string, number>();
    const contestCards = new Map<Contest, number>();
    const contestCommons = new Map<Contest, number>();
    for (const c of cards) {
      roleCount.set(c.role, (roleCount.get(c.role) ?? 0) + 1);
      contestCards.set(c.contest, (contestCards.get(c.contest) ?? 0) + 1);
      if (c.rarity === 'Common') contestCommons.set(c.contest, (contestCommons.get(c.contest) ?? 0) + 1);
    }
    for (const roles of Object.values(ROLES_BY_POS))
      for (const r of roles) expect(roleCount.get(r.name) ?? 0, `${r.name} unfed`).toBeGreaterThan(0);
    for (const c of CONTESTS) {
      expect(contestCards.get(c) ?? 0, `${c} thin`).toBeGreaterThanOrEqual(20);
      expect(contestCommons.get(c) ?? 0, `${c} no Commons`).toBeGreaterThanOrEqual(8);
    }
  });

  it('role-correlated stats hold — an attacking contest prints ATT>DEF on average', () => {
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const finish = cards.filter((c) => c.contest === 'FINISH');
    const stop = cards.filter((c) => c.contest === 'STOP');
    expect(mean(finish.map((c) => c.att))).toBeGreaterThan(mean(finish.map((c) => c.def)));
    expect(mean(stop.map((c) => c.def))).toBeGreaterThan(mean(stop.map((c) => c.att)));
  });
});

describe('headless shop-bot drafts a committed XI for all 11 managers', () => {
  it('every manager can draft a viable committed squad from random shop streams', () => {
    const rng = new RngStream(20260709);
    for (const m of MANAGERS) {
      let committed = false;
      // up to 3 shop streams (a shop refreshes) — realistic "random shop streams"
      for (let attempt = 0; attempt < 3 && !committed; attempt++) {
        const stream = shuffle(rng, cards).slice(0, 180);
        const draft = draftForManager(stream, m);
        expect(draft, `${m.name}: could not field ${m.formation}`).not.toBeNull();
        if (draft?.committed) committed = true;
      }
      expect(committed, `${m.name} (${m.favoured}) could not reach commitment`).toBe(true);
    }
  });
});
