# V7 typed chances — gameplay and engine handoff

**Date:** 2026-08-05  
**Recovered:** 2026-08-07  
**Tracking:** NW-168, NW-169, NW-170, NW-171  
**Branch:** `agent/v7-chance-types-design`

> Recovery note: the original 2026-08-05 checkout was never pushed and did not
> survive between sessions. This branch reconstructs the implementation from the
> authoritative Linear contract and the live Card Design Tracker; it is not
> claimed to be byte-identical to the lost local files.

## Outcome

Chance type is the bridge between football identity and card interaction. Three
facts stay separate for the lifetime of a token:

1. **Origin** — why the chance exists (`calculated`, `action`, or legacy `stored`).
2. **Type** — what kind of chance it is (`box`, `cross`, `through_ball`, `corner`).
3. **Finisher** — who takes it and whether assignment was `default`, `claimed`, or `fallback`.

A calculated Box reshaped into a Cross remains calculated. An Action can create
an ordinary Box. The chance bar therefore uses origin for colour and type for an
icon/label rather than flattening the two concepts.

## V1 chance types

| Type | Default finishing positions |
| --- | --- |
| Box | CF, LF, RF, LW, AM, RW |
| Cross | CF, LF, RF, LW, RW |
| Through Ball | CF, LF, RF, LW, AM, RW |
| Corner | CF, LF, RF, CB |

Eligibility reads the **current formation-slot position**, not the card's first
printed position.

## Laws

- Type has no hidden scoring modifier. All threshold/reroll/cancel/claim value is explicit and receipt-backed.
- ATT-created chances always start `origin: calculated`, `chanceType: box`.
- `add_chance` adds volume and names a type.
- `change_chance_type` changes only type; token id, origin, side, order and sector survive.
- `move_chance` changes only sector.
- `claim_chance` assigns the source player as finisher of a matching token.
- Claims resolve in ledger order. The first valid claim wins; later claims fizzle.
- Default assignment is team-wide, weighted by effective ATT, and uses a token-namespaced RNG stream isolated from goal rolls.
- If no default-eligible finisher exists, the strongest active non-emergency goalkeeper is assigned as `fallback`.
- Follow-up chains such as miss → Corner are deferred.

## Resolution order

1. Create calculated Box tokens.
2. Materialise Action-created typed tokens.
3. Apply type changes.
4. Apply sector movement.
5. Resolve explicit claims.
6. Assign every unclaimed token from the default eligibility table/fallback.
7. Apply cancellation, threshold and reroll effects.
8. Roll and attribute the result to the assigned finisher.

## Contract

```ts
type ChanceType = 'box' | 'cross' | 'through_ball' | 'corner';
type FinisherAssignment = 'default' | 'claimed' | 'fallback';

interface ChanceToken {
  // existing stable identity / side / sector / origin / roll fields
  chanceType: ChanceType;
  finisherId?: string;
  finisherAssignment?: FinisherAssignment;
}
```

Action additions:

```ts
{ type: 'add_chance'; count: number; chanceType: ChanceType; sectorMode: ... }
{ type: 'change_chance_type'; chanceType: ChanceType; count: number }
{ type: 'claim_chance' }

{
  type: 'chance';
  side: 'own' | 'enemy';
  selector: 'first' | 'first_in_sector' | 'last_in_sector' | 'all_in_sector';
  sector?: Sector;
  chanceTypes?: ChanceType[];
}
```

The global `first` selector is required for a centre-forward to claim the first
Cross/Through Ball across the whole team rather than only the creator's sector.

## Required receipts

- `chance_created { tokenId, origin, chanceType, sector, sourceActionInstanceId? }`
- `chance_type_changed { tokenId, from, to, sourceActionInstanceId }`
- `chance_moved { tokenId, from, to, sourceActionInstanceId }`
- `chance_claimed { tokenId, finisherId, sourceActionInstanceId }`
- `claim_fizzled { tokenId?, finisherId, reason }`
- `finisher_assigned { tokenId, finisherId, assignment }`
- cancellation / roll / miss / goal receipts also carry token id, origin, type and finisher.

## First Cross loop

### BEND IT — David Backman (David Beckham)

**Ongoing:** Change your first Box chance in this player's sector each period into a Cross.

### GLANCER — Jared Bogotti (Jared Borgetti)

**Ongoing while losing:** This player claims your first Cross chance each period. It scores on 5+.

### AERIAL COMMAND — Paul MacGraw (Paul McGrath)

**Ongoing:** The opponent's first Cross chance each period cannot score on less than 6+.

Recorded 5,000-match balance result from the Card Design Tracker:

- BEND IT + GLANCER: **+0.13 team goals per match**.
- GLANCER activated on approximately **0.78 Crosses per match**.
- AERIAL COMMAND restored the BEND IT-only scoring baseline while preserving the Cross tokens.

## First Through Ball loop

### VISION — Michael Ladrip (Michael Laudrup)

**Ongoing:** Change your first Box chance each period into a Through Ball.

### RUNS IN BEHIND — Andriy Slavshinka (Andriy Shevchenko)

**Ongoing while losing:** This player claims your first Through Ball chance each period. It scores on 5+.

### SWEEPER — Franco Borisi (Franco Baresi)

**Ongoing:** The opponent's first Through Ball chance each period cannot score on less than 6+.

Recorded 5,000-match balance result from the Card Design Tracker:

- VISION alone reshaped **4.00 chances per match** without changing volume or baseline scoring.
- VISION + RUNS IN BEHIND: **+0.13 team goals per match**.
- RUNS IN BEHIND activated on **0.80 Through Balls per match**.
- SWEEPER restored the VISION-only scoring baseline while preserving every Through Ball token.

## Presentation

- Calculated origin: existing gold/neutral chance treatment.
- Action origin: blue/purple treatment.
- Type: icon **and** accessible text; colour is never the only indicator.
- Before the die reveal, show type + intended finisher.
- The same token updates through shape/claim/roll rather than appearing as a new chance.

## Acceptance

- Calculated tokens are Box/calculated.
- Action-created tokens preserve Action origin and have stable unique ids.
- Shaping preserves origin and id.
- A CF can finish a Cross created in either wide sector.
- Default assignment replays byte-identically for the same seed/state.
- A valid specialist claim beats default assignment and only its claimed token gets the 5+ conversion modifier.
- A typed defensive effect cannot touch a Box token.
- Chance creation, shaping, assignment, cancellation, rolls and goals are receipt-backed.
- UI exposes origin and type separately and names the intended finisher before rolling.
- Simulation reports type mix, conversion and pair delta.

## Validation state from the lost 2026-08-05 checkout

The last local handoff reported:

- 71 focused tests passing.
- 377 full-suite tests passing; the same two unrelated failures remained.
- TypeScript and lint passing, with one existing image warning.
- production build blocked only by inaccessible Google Fonts.
- Cross and Through Ball mobile tests authored but Chromium unavailable.

Those numbers describe the lost checkout, not this reconstructed branch. PR #104
must re-establish them (or document a deliberate delta) before the recovery is
considered complete.
