# CARD_ACTIONS_HANDOFF_V1 — one action per card, upgrades, condition

**Status: design consolidation (owner-directed) + the authoring brief for the player
action tree.** Part A reconciles three new mechanics with the live SCORING_V2 engine
(`docs/SCORING_V2.md`). Part B is a SELF-CONTAINED brief: paste it into a Claude AI
session (no repo access needed) to author the full action catalogue. Output from that
session drops back into the codebase against the schema in §B7.

---

## PART A — the consolidated model

### A1. One action per card; rarity is the action's TIER

Every player card carries exactly **ONE named action** (the gold band on the card
face). The card's **rarity no longer sets how MANY traits it has — it sets how GOOD
its one action is**:

| Rarity | Tier | What the tier does |
|---|---|---|
| Common | 1 | The base numbers |
| Rare | 2 | Bigger numbers |
| Epic | 3 | Bigger again |
| Legendary | 4 | Bigger numbers **and may add a RIDER clause** (a second effect) |

Same action name at every tier — "Link Up" is Link Up from Common to Legendary; only
the numbers (and the Legendary rider) grow. This replaces the current
rarity-equals-trait-count model (`defining-traits.ts` assigns 1–4 traits by rarity);
the existing ~30-trait library becomes the seed catalogue for the new tree.

- **Assignment** stays deterministic: each card's action comes from its archetype's
  pool, seeded by card id (stable forever, zero data migration for 540 cards), with
  bespoke overrides for showcase legends.
- **Printed ATK/DEF stay BRS-derived** — upgrading a card does NOT change the
  player's identity, only the action tier (and the frame/foil). One lever per system.
- A card's rarity remains BRS-derived **at generation** (its starting tier) but is
  now **mutable card state** thereafter (upgrades below). The `rarity` field already
  lives on the serialized card, so saves carry it.

### A2. Upgrades via the store

A new shop purchase: **CARD UPGRADE** — pick an owned card, raise its rarity one tier
(Common→Rare→Epic→Legendary). Fiction: you bought a better print of the same player.

- Upgrading **RE-MINTS the card: condition restores to 100** (see A3). One purchase,
  two payoffs — and it creates the loop where your worn, beloved starter is exactly
  the card worth upgrading.
- Cost curve is balance-lab's (anchor: →Rare ≈ a pack; →Epic ≈ a scout+; →Legendary
  is run-defining money).
- Sell price already scales with rarity; condition should also factor resale (a
  tattered Legendary is worth less than a mint Rare).

### A3. Condition — the card as a physical object

Every card carries **CONDITION 0–100** (starts MINT at 100). Cards **wear from use**,
like real cardboard:

- **Wear**: playing a match costs condition. The existing **durability tier is the
  wear rate** (glass wears fast, titanium barely wears) — this absorbs the old
  post-match shatter/injury dice into one visible, legible lifecycle. Bench players
  don't wear; a drawn tie (extra time) wears the XI a little more.
- **Condition is the fitness CEILING**: a card can never start a match fresher than
  its condition. (Fitness is 0–100 player-facing — see A4.) A WORN card starts
  matches part-spent; a TATTERED card is running on fumes.
- **Bands**: MINT 90+ · PLAYED 60–89 · WORN 30–59 · TATTERED 1–29 · **DESTROYED 0**
  (removed from the deck permanently). The card face should show the wear.
- **Phoenix** durability keeps its fiction: on destruction it returns once, at ~40.
- **Repair**: a store service restores condition for cash (replacing "heal injury");
  upgrading re-mints outright.
- **Injuries fold into condition**: a bad knock is condition damage (e.g. −15), not a
  separate flag — one health system instead of two.
- Tuning target (balance-lab): a **standard** card started every match of a full
  20-match run should end around WORN — destruction is for glass cards ridden
  relentlessly, not routine play. Rotation is now doubly load-bearing (fitness AND
  wear), which is the point.

### A4. Fitness goes 0–100 player-facing

The card mocks (and Clinical Finish's "fitness 80 or higher") use a 0–100 scale.
Consolidate on it everywhere the player looks. (The engine currently runs 1–6
internally; ×16.7 display mapping first, real migration when convenient. **All
action-tree fitness thresholds are authored on 0–100.**)

### A5. What this touches in the engine (later work, not part of the tree session)

`defining-traits.ts` → one tiered action per card (`actionFor(card)`); `points.ts`
gains the new condition kinds (§B4) and the rider hooks; `Card` gains
`condition: number`; shop gains UPGRADE + RESTORE; wear applied post-match where
durability checks live today; card faces + gallery show the action band and wear.
Suspensions, contests, the d100 law, receipts: unchanged.

### A6. Open questions (decide in the Claude AI session or after)

1. Does an upgrade also nudge printed stats (+1 BRS per tier)? **Recommendation: no**
   — keep stats as identity, the action as the upgrade lever.
2. Do packs ever drop pre-worn cards (cheaper, riskier)? Nice later-economy lever.
3. Do BOTH injury paths fold into condition, or keep a short "misses next match"
   knock as well? **Recommendation: fold fully.**
4. Does the faceless opponent get actions? Today it opts out (its difficulty is
   power + cohesion points). **Recommendation: keep opting out.**

---

## PART B — the action-tree authoring brief (self-contained)

> **You are authoring the complete player action catalogue for Kickoff Clash**, a
> Balatro-style football-management roguelike. Players are cards; your XI is your
> hand. Every card has ONE named action whose numbers grow with the card's rarity
> tier (1–4). Produce the full tree per §B6, in the schema of §B7, obeying the
> grammar of §B4 and the ladders of §B5. Everything below is the context you need.

### B1. The scoring model in one paragraph (SCORING_V2)

**One currency: card points.** Every card has printed **ATK and DEF (integers,
−1..20)**. Every effect in the game — actions, managers, tactics, chemistry,
fitness, positional penalties — is a **flat ±N** on a card's ATK or DEF, itemised on
a visible receipt. **No percentages, no multipliers.** A match is 5 rounds of 15'.
Each round: (1) **THE BALL** — your Controllers/Passers/Engines' ATK vs their front
line + Engines' DEF splits 6 possessions (clamp 2–4/side, no dice); (2) **THE
OUTCOME** — each possession rolls d100 on turnover / half-chance / big chance /
corner / foul, slid by CREATE−BREAK; (3) **THE SHOT** — a named shooter rolls d100,
**GOAL if d100 ≤ BASE + 3 × (shooter ATK − their STOP)** (BASE: half 20 / big 40 /
corner 15; clamped 5..80). Fouls draw bookings (d100 ≤ 30); a second yellow is a red
(max 1/side/match) and the suspension carries to the next fixture.

### B2. The card model

- **Positions**: GK, CD, WD, CM, DM, WM, AM, WF, CF. The pitch is 3 bands
  (DEF/MID/ATT) × 3 lanes (L/C/R); a card's formation slot places it.
- **Archetypes (13)** — the card's skillset, its identity in play:
  Striker, Target, Powerhouse, Dribbler, Sprinter, Creator, Controller, Passer,
  Engine, Commander, Destroyer, Cover, Shotstopper (the GK archetype).
- **Fitness 0–100** (drains during a match; tired = flat penalties: −1 at <~67,
  −2 at <~58, −3 below that, applied to both stats).
- **Condition 0–100** (the card's physical wear; caps starting fitness; 0 =
  destroyed). **Rarity tier 1–4** (Common/Rare/Epic/Legendary — the action's tier).
- Wide cards (WD/WM/WF) have a preferred flank; wrong flank = −2/−2. Out of
  position = −2/−2.

### B3. WHERE points matter — the contest map (the strategic texture)

A +N is not equally valuable everywhere. Authors must know what each stat FEEDS:

| Stat on… | Counts toward |
|---|---|
| ATK, any card | ATTACK (the forecast header) + the card's own shot rolls |
| ATK on Controller/Passer/Engine | **KEEP** — the ball contest (more possessions) |
| ATK on Creator/Dribbler/Sprinter or any ATT-band card | **CREATE** — hotter outcome table |
| DEF, any card | DEFENCE (the header) |
| DEF on ATT-band cards or Engines | **PRESS** — strips the opponent's possessions |
| DEF on MID-band cards | **BREAK** — cools the opponent's outcome table |
| DEF on DEF-band cards (GK included) | **STOP** — the shot wall. **STOP is the MEAN of the back line**, so +2 DEF on one of five backs raises STOP by ~0.4; back-line-wide buffs are how you really move it |

So: +ATK on a Passer buys possession; +DEF on a Striker buys pressing; +DEF on one
CB is worth less than +1 DEF on the whole line. Design actions WITH this map.

### B4. The action grammar — what an action is allowed to do

An action is ONE of these shapes (a Legendary rider may add a second clause):

**1. Stat buff** — flat +N ATK and/or +N DEF to a target set:
- Targets: `self` · `teammates` (all) · `backline` (DEF band incl. GK) ·
  `lane-ahead` (the nearest teammate ahead in the same pitch lane — the overlap) ·
  `band-behind` (everyone one band behind the owner — the screen) ·
  `atk-below N` / `atk-atLeast N` / `def-below N` / `def-atLeast N` (thresholds,
  read before buffs apply so order never matters) · `archetype X` · `position X`.

**2. Enemy debuff** — flat −N on OPPOSING cards. Target: their `backline` or their
`star` (highest ATK). The sanctioned exception (Antagonist class); use sparingly.

**3. Chance beat** — a probability `p` each round of manufacturing a bonus chance
(`half` or `big`), either taken by the owner (`asShooter`) or created by him for a
drawn teammate. Max 2 injected beats per side per round (engine cap).

**4. Stop beat** — a probability `p` each round of being ARMED; an armed stop
cancels one opposing chance outright (keeper versions animate as saves).

**Conditions** (any shape can carry at most one, plus `oncePerMatch`):
- `always` (default) · `late` (from the hour mark) · `leading` / `trailing` ·
- `xiCount` — ≥N cards of a position/archetype in the XI (e.g. "with 2 strikers
  fielded" — the formation-shape hook; NEW, approved) ·
- `fitnessAtLeast N` (0–100; e.g. Clinical Finish's 80; NEW, approved) ·
- `oncePerMatch` (NEW, approved — for the big moments).

**Riders (Legendary tier 4 only, NEW engine work — budget ≤1 rider-bearing action
per archetype):**
- `sure-strike` — once per match, when this card shoots, the keeper is taken out of
  it: a shot that would have been SAVED is a GOAL instead (a genuine miss still
  misses). This is the mechanical reading of "the shot cannot be saved".
- `extra-stop` — the armed stop can cancel a second chance this round.
- `mint-run` — this card wears half as fast (a condition rider, for one legend).
If you want a rider outside these three, write it, mark it `needs-engine`, and keep
the list tiny.

**Hard rules**: integers only; flat points only (never a % or a multiplier); no
effect may read or change dice odds except through the printed formulas above;
actions are player-only (the faceless opponent doesn't run them); one action per
card; everything must be expressible in the schema of §B7.

### B5. Magnitude ladders (starting values — balance-lab tunes after)

By shape, tiers 1→4:

| Shape | T1 Common | T2 Rare | T3 Epic | T4 Legendary |
|---|---|---|---|---|
| Buff, `self` or single target (incl. lane-ahead) | +2 | +4 | +6 | +6 **+ rider or 2nd stat** |
| Buff, group (backline / threshold / archetype set) | +1 each | +2 | +3 | +3 + rider |
| Enemy debuff (their backline) | −1 each | −2 | −2 + star −2 | −3 + rider |
| Chance beat | p .15 half | p .25 half | p .30 **big** | p .40 big |
| Stop beat | p .20 | p .30 | p .40 | p .55 |
| Conditional bonus (xiCount / fitness / late gates) | may run **one row hotter** — a gate buys ~+1 tier of magnitude | | | |

Sizing intuition: a good XI totals ~90–130 ATK; the whole modifier stack
(manager + tactics + chemistry + personality + actions) is worth roughly +20–35
team points today. One action per card must keep that budget: a group buff at +3/head
hitting five cards is a HUGE action — that's Legendary territory only.

Worked example — the owner's **Link Up** (a CF's action):
- T1: *"+2 ATK while 2 or more strikers are fielded."*
- T2: *"+4 ATK while 2 or more strikers are fielded."*
- T3: *"+6 ATK while 2 or more strikers are fielded."*
- T4: *"+6 ATK while 2 or more strikers are fielded, and once per match — fitness 80
  or higher — his shot cannot be saved."* (rider: `sure-strike`)

### B6. What to produce — the tree

For **each of the 13 archetypes**: **4–6 actions**, each with all **4 tiers**
(name, per-tier card text, per-tier machine block). Plus **3 bespoke signature
actions** for showcase legends (dense, rider-bearing, hand-authored).

- Reuse/extend the existing action names where they fit (they already have card copy
  and match animations): Postman, Sniper, Deadeye, Leadership, Stopper, Offside
  Trap, Poacher's Instinct, Engine Room, Overlap Run, Marshal, Mentor, Star Service,
  Antagonist, Screen, Take-On, Mazy Run, Interceptor, Last-Ditch, Aerial Threat,
  Hold-Up Play, Deep Distributor, Runner in Behind, Late Run; GK pool: Shot Stopper,
  Sweeper Keeper, Commander of the Box, Distribution, Big-Game Keeper.
- Every archetype's pool should MIX shapes (not five buffs): aim for ~2 buffs
  (at least one interaction — threshold/geometry/xiCount), 1–2 chance beats, 1 stop
  or debuff, and give each archetype ONE build-around (an action you'd draft a squad
  toward, like Star Service or Link Up).
- Spread the contest map: every contest (KEEP/PRESS/CREATE/BREAK/STOP) should have
  actions that feed it, or a whole strategy lane goes dead.
- Animation family per action (for the match screen): one of `cross / shot /
  setpiece / poach / tackle / offside / save / aura / engine`.

**Card text voice**: factual and terse — say exactly what the numbers do, in
football language, 10–25 words. ("Organises the stragglers — teammates with DEF
below 5 defend at +2 while he plays.") Never a claim the engine can't honour.

### B7. Output schema (deliver the tree as one JSON block)

```jsonc
{
  "actions": [
    {
      "id": "link_up",
      "name": "Link Up",
      "archetypes": ["Striker"],          // which pools it appears in
      "shape": "buff",                    // buff | debuff | chance | stop
      "animation": "poach",
      "buildAround": true,                // at most one per archetype
      "tiers": [
        { // tier 1 = Common … tier 4 = Legendary
          "text": "+2 ATK while 2 or more strikers are fielded.",
          "effect": { "target": "self", "atk": 2 },
          "condition": { "kind": "xiCount", "archetype": "Striker", "min": 2 }
        },
        { "text": "+4 ATK while 2 or more strikers are fielded.",
          "effect": { "target": "self", "atk": 4 },
          "condition": { "kind": "xiCount", "archetype": "Striker", "min": 2 } },
        { "text": "+6 ATK while 2 or more strikers are fielded.",
          "effect": { "target": "self", "atk": 6 },
          "condition": { "kind": "xiCount", "archetype": "Striker", "min": 2 } },
        { "text": "+6 ATK with 2+ strikers fielded; once per match at fitness 80+, his shot cannot be saved.",
          "effect": { "target": "self", "atk": 6 },
          "condition": { "kind": "xiCount", "archetype": "Striker", "min": 2 },
          "rider": { "kind": "sure-strike", "oncePerMatch": true,
                     "condition": { "kind": "fitnessAtLeast", "value": 80 } } }
      ]
    }
    // chance shape uses: "effect": { "quality": "half"|"big", "p": 0.25, "asShooter": true }
    // stop shape uses:   "effect": { "p": 0.3, "save": true }        (save = keeper flavour)
    // debuff shape uses: "effect": { "target": "enemy-backline"|"enemy-star", "def": -2 }
    // group buff uses:   "effect": { "target": "backline"|"def-below"|…, "value": 5, "def": 2 }
  ],
  "signatures": [ /* same shape, plus "cardName" — 3 hand-authored legends */ ]
}
```

### B8. Checklist before you finish the session

- [ ] Every archetype: 4–6 actions × 4 tiers, mixed shapes, one build-around.
- [ ] Every contest fed by somebody; no archetype whose whole pool is self-buffs.
- [ ] Riders only at tier 4, from the approved list (or clearly marked `needs-engine`).
- [ ] Integers, flat points, 0–100 fitness thresholds, factual text.
- [ ] One JSON block in the §B7 schema — it goes straight into the repo.
