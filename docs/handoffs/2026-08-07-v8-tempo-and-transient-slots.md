# Kickoff Clash V8 — tempo, transient slots, reveal priority and first Action set

Date: 2026-08-07
Branch: `agent/v8-three-zone-prototype`
PR: #105

## Energy baseline

The current preferred Energy curve is:

- Period 1: **3**
- Period 2: **5**
- Period 3: **7**
- Period 4: **9**

`4 / 6 / 8 / 10` remains available in the lab only as an intentionally more explosive comparison.

The 3-Energy opener felt better in direct playtesting because the opening draw matters more and the player cannot simply dump high-value cards immediately.

## First 1-cost tempo experiment

Each development XI now contains three genuine 1-cost players rather than discounting existing high-output cards.

The test archetypes are:

1. **Flexible full-back / wing-back** — around 2 ATT / 2 DEF, natural in DEF and MID.
2. **Cheap defensive body** — around 0 ATT / 3 DEF, natural in DEF.
3. **Cheap attacking runner** — around 3 ATT / 0 DEF, natural in ATT.

The point is to test tempo, setup and flexibility. Cost is not rarity and a 1-cost card should not visually read as a low-prestige card.

The deterministic economy simulation reports average 1-cost deployments per team and the rate of 2+ player deployments in Period 1.

## Four physical slots means four committed cards

Each DEF / MID / ATT zone has four physical play slots.

During a commitment/reveal window, **every card played into a zone reserves one of those four slots**:

- Player card — reserves a slot, then remains there after reveal.
- Manager card — reserves a slot while queued/revealing, resolves its Action, then disappears and releases the slot.
- Chance card — reserves a slot while queued/revealing, resolves its effect, then disappears and releases the slot.

Therefore a Manager or Chance cannot be played into a full zone, and a transient reservation can prevent another commitment that period. After the transient resolves, its slot is available again.

## Reveal priority

At the start of each reveal window:

1. The team currently **leading the match** reveals first.
2. If level, the team with higher current **ATT** reveals first.
3. If ATT is level, compare **board strength = ATT + DEF**.
4. If everything visible is tied, use a **seeded deterministic tiebreak**.

Priority is fixed before hidden commitments reveal. The priority team reveals **all cards in play order**, then the other team does the same.

Timing semantics:

- **On Reveal** resolves immediately.
- **Ongoing** becomes active as soon as the card reveals.
- Manager and Chance effects use the board state at the exact moment they reveal.
- **End of Period** waits until both teams have completely revealed.

## First V8 Action interaction set

The lab now contains enough different Action patterns to test whether reveal priority creates actual gameplay rather than only presentation.

### FRONT FOOT / STEP UP — first-reveal disruption

**On Reveal:** pressure the next opposing player revealed in the same zone this period.

The target loses 2 from the contributing stats for that zone:

- DEF: -2 DEF
- MID: -2 ATT / -2 DEF
- ATT: -2 ATT

If the pressure is created after the opponent has already finished revealing, it expires unused. This makes revealing first valuable.

### STARFISH / CLAIM IT — reactive reveal

**On Reveal:** if the opponent has already revealed a player in ATT this period, gain **+3 DEF this period**.

This intentionally creates the opposite incentive to FRONT FOOT: the keeper can benefit from revealing second.

### RUNNER / POACHER — friendly sequencing

**On Reveal in ATT:** if another friendly ATT player revealed earlier in the same reveal sequence, gain **+2 ATT this period**.

This makes the order of a team's own commitments matter even when reveal priority itself is already known.

### WALL / BLOCK — persistent Ongoing

**Ongoing:** while another friendly player is also in DEF, this card has **+2 DEF**.

The bonus is included in displayed team DEF, period scoring and future reveal-priority board strength.

### VISION / BEND IT / EARLY CROSS — delayed creators

**On Reveal:** generate a typed Chance card for the following period.

- VISION → Through Ball
- BEND IT / EARLY CROSS → Cross

The generated Chance does not resolve automatically and must later be played for Energy into a physical slot.

### BOBO BOMBER / TARGET MAN — typed-Chance receiver

**Ongoing in ATT:** a Cross gains **+2 ATT** when it reveals while this receiver is already active in ATT.

This means ordering can matter within the same period: revealing the receiver before the Cross creates the bonus; revealing the Cross first does not.

## Action presentation

Hand cards now show both the **Action name and concise effect text**. The prototype should be playable without memorizing hidden semantics from previous runs.

The match log records reveal order and activated Action effects so sequencing can be audited during playtesting.

`OVERLAP` cards retain the Moveable status in data, but actual post-deployment movement is deliberately not implemented in this pass. Movement interacts with four-slot reservations and deserves a separate rules/UI pass rather than being smuggled into the first Action experiment.

## Next questions

The important playtest questions are now:

- Does reveal priority actually change which card you play first?
- Is it interesting that some Actions want priority while STARFISH may prefer to reveal second?
- Does RUNNER / POACHER make within-team ordering legible and rewarding?
- Does WALL create useful persistent board-building without making DEF snowball?
- Do creator → Chance → receiver chains feel worth the Energy and slot cost?
- Is effect text readable enough in the temporary card UI?
- Which Action pattern feels like it should be expanded across the real player roster?

After this set is understood, the next mechanic should be **Moveable / movement**, followed by richer disruption/copy/disable interactions if reveal priority still feels good.

Do not rebalance toward realistic football scorelines. The target remains decision quality and match drama.
