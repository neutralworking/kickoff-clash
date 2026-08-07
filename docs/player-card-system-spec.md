# Kickoff Clash player card system

**Status:** living product/UX specification  
**Last groomed:** 2026-07-29  
**Applies to:** the live run flow and the V7 match experience  
**Implementation status:** specification only

This document is the source of truth for player-card presentation. It replaces generic collectible-card assumptions and any older card backlog notes that conflict with the current game mechanics.

## 1. Product intent

Player cards are the central objects in Kickoff Clash. They must feel premium and collectible, but every visible element must support the real decisions made in the game.

The system uses one shared visual identity across several purpose-built renderers. A live match token is not a full card shrunk until it becomes unreadable.

## 2. Current mechanical card contract

The normal player card communicates only:

- player portrait
- player name
- primary position
- energy cost
- ATT
- DEF
- player action
- rarity

The following are not core card mechanics:

- no overall rating
- no total score
- no fitness
- no durability
- no stars or levels
- no club badge or nation flag on the normal face
- no serial number or invented collectible metadata
- no role or archetype on the normal face

Role/archetype may appear in the expanded player view as descriptive identity only. It has no match-engine function.

Condition is an undecided V2 concept. It must not shape the core card anatomy. Career record appears only in the expanded player view.

## 3. Master card anatomy

The large card follows the readable structural hierarchy of a classic digital card game without copying another game's ornamentation or trade dress.

```text
[COST PIPS]                         [PRIMARY POSITION]

                KC MONOGRAM
       HEAD-AND-SHOULDERS CUTOUT PORTRAIT

/---------------- PLAYER NAME ----------------\

+------------------------------------------------+
| ACTION NAME                                    |
| concise effect where the context permits       |
+------------------------------------------------+

< ATT >                                      < DEF >
```

### 3.1 Proportions

- Master ratio: **2:3**.
- Portrait occupies the majority of the upper card.
- Head-and-shoulders portrait is cut out rather than confined to a shallow rectangular photo window.
- The portrait may overlap the frame slightly.
- An oversized, partially cropped **KC monogram** sits behind the player.
- The KC mark remains subordinate to the face and is tinted by the rarity treatment.

### 3.2 Nameplate

- Straight, full-width metal banner.
- Chamfered ends.
- Overlaps the lower edge of the portrait.
- Full name on large pack/focused cards where it fits.
- Surname on compact gameplay cards.

### 3.3 Action panel

- Full-width panel below the nameplate.
- Visually quieter than the portrait and nameplate.
- Large cards can show the action name and concise rules text.
- Compact team-selection and bench cards show the action name only.
- Active match tokens do not permanently show an action panel.

### 3.4 ATT and DEF

- ATT is embedded in an angular bottom-left frame badge.
- DEF is embedded in an angular bottom-right frame badge.
- Faceted/angular shapes, not circular medallions.
- Large number with a small ATT/DEF label where space allows.
- No combined total and no `7/3` shorthand.

## 4. Energy cost pips

Energy cost is shown as a compact pip formation in the top-left frame element. It is not a number, icon, meter or six-pip horizontal line.

```text
1        2        3
  •      • •        •
                  •   •

4        5        6
•   •    •   •    •   •
•   •      •      •   •
         •   •    •   •
```

Rules:

- maximum six pips
- pips use balanced dice-like formations
- three and five use a centred single pip
- no empty placeholder pips
- the whole cluster occupies a fixed top-left footprint so adjacent content never moves
- active match tokens hide cost because the player has already been fielded
- coaching-break bench cards show the current substitution cost
- if cost is modified, blue means reduced and red means increased; only the current cost is shown

## 5. Position

- The normal card face shows the **primary position only**.
- Position appears in a simple top-right badge.
- No shield, crest or decorative football icon is required.
- Secondary eligible positions appear only in the expanded view.
- In team selection, the position/placement state communicates primary fit, secondary fit or misfit.
- The printed primary position does not change when the player is placed elsewhere.

Team-selection fit treatment:

- primary fit: normal/positive state
- secondary fit: amber state
- misfit: red state with an explicit `-2 ATT / -2 DEF` receipt where space permits

## 6. Rarity

Rarity changes the frame colour/material and supporting portrait/KC lighting. It never changes the anatomy or information placement.

Current direction:

- frame treatment is sufficient on team-selection cards
- no written rarity label is required there
- no stars or rarity score
- exact material ladder can be art-directed later without changing the component contract

## 7. Action visibility

Actions are central mechanics, but full rules text does not belong in every context.

| Context | Action treatment |
|---|---|
| Pack opening | Action name plus concise mechanics line |
| Shop/collection | Action name plus concise mechanics line |
| Team-selection pitch | Action name only |
| Team-selection bench | Action name only |
| Coaching-break bench | Action name only |
| Active match token | Hidden normally; action name appears when focused or triggered |
| Expanded player view | Action name, trigger, full effect and target |
| Match event presentation | Action name appears when it materially causes the event |

Compact surfaces must preserve the real action name rather than replace it with a vague category.

## 8. Live stat colour behaviour

Outside the match, ATT and DEF show their printed values.

During the match, the token shows only the current effective value:

- neutral/cream: unchanged
- red: modified down
- blue: modified up

Each stat changes independently. The printed value is not repeated beside the effective value.

Stat colour is therefore a match-state signal, not a permanent ATT-red/DEF-blue coding system on live tokens.

## 9. Card/rendering family

The system currently needs:

1. Hero/pack card
2. Standard shop/collection card
3. Team-selection pitch card
4. Team-selection bench card
5. Coaching-break bench card
6. Active live-match token
7. Expanded/focused player view

They share portrait treatment, KC background, frame silhouette, nameplate language, position placement and angular ATT/DEF badges. They do not all carry identical content.

---

# 10. Team-selection card specification

## 10.1 Purpose

Help the player build an XI under the energy cap and understand placement quality immediately.

At a glance it must answer:

1. Who is the player?
2. What is their primary position?
3. How much energy do they cost?
4. What are their ATT and DEF values?
5. What is their action called?
6. Do they fit this slot?
7. Are they starting, benched, selected or unavailable?

It is not a surface for full rules, lore or career information.

## 10.2 Pitch-card content

- cost pip cluster
- primary-position badge
- cut-out portrait with KC monogram
- surname nameplate
- shallow full-width action-name strip
- angular ATT badge
- angular DEF badge
- contextual placement-fit state

Target range: approximately **96 x 144 to 104 x 156 px**, subject to mobile validation.

## 10.3 Bench-card content

Same anatomy and information as the pitch card, with a slightly smaller target range of approximately **88 x 132 to 96 x 144 px**.

Seven substitutes must be presented in a horizontally swipeable tray. They must not be squeezed into seven equal-width columns.

## 10.4 Hierarchy

For team selection:

1. portrait
2. position and fit
3. cost
4. ATT/DEF
5. surname
6. action name

## 10.5 States

### Normal

Default rarity frame, no glow.

### Starting XI

Normal readable card with stronger pitch presence than bench cards. Avoid a permanent status label if placement already communicates that it is starting.

### Bench

Same object at slightly reduced emphasis, not a separate design language.

### Selected

- bright external selection ring
- lifted shadow
- restrained scale-up
- no internal recolour that harms readability

### Valid swap target

- external glow or pulse
- card content remains readable

### Invalid target

- slightly dimmed
- optional compact lock/unavailable state
- identity and stats remain readable

### Primary fit

Normal/positive position state.

### Secondary fit

Amber position/slot state.

### Misfit

- red position/slot state
- explicit `-2 ATT / -2 DEF` receipt where space permits
- do not overwrite the printed primary-position text

### Confirmed/locked

Interaction affordances settle down, but inspect remains available.

## 10.6 Interaction

- Tap a bench player to select/deselect them.
- When a bench player is selected, tapping a valid pitch card chooses the swap target.
- Without an active swap, tapping a card opens the focused view or equivalent inspector.
- Selection and swap affordances live outside the permanent card anatomy.

## 10.7 Exclusions

Do not show:

- full action text
- role/archetype
- secondary positions as a list
- career record
- condition
- overall rating
- fitness or durability
- club/nation furniture
- rarity stars or labels

---

# 11. Live match card specification

The live match uses two distinct objects:

1. an **active pitch token**, answering what the player contributes right now
2. a **coaching-break bench card**, answering whether this player should be brought on

## 11.1 Active pitch token purpose

The token must let the player follow the match at a glance without covering the pitch or duplicating information that is no longer actionable.

It must answer:

1. Who is this player?
2. Where are they currently playing?
3. What are their current effective ATT and DEF values?
4. Are they currently selected, targeted, modified, planned off, out of position or involved in the event?

It does not need to explain the player's acquisition cost or permanent action rules while resting on the pitch.

## 11.2 Active pitch token anatomy

Recommended target range: approximately **60 x 84 to 68 x 96 px**, subject to full mobile-pitch validation.

```text
        [CURRENT POSITION]

      CUT-OUT PORTRAIT
    SIMPLIFIED KC BACKGROUND

/---------- SURNAME ----------\

< ATT >                  < DEF >
```

Rules:

- no cost pips
- no permanent action panel
- surname, not full name
- small current-position/slot badge
- portrait remains recognisable; do not reduce it to initials unless the image fails
- simplified rarity edge/frame rather than a visually heavy full-size material treatment
- ATT and DEF remain in angular bottom corners
- show current effective ATT/DEF only
- lane is communicated by physical pitch placement, not printed as persistent text

The token may be less than a full 2:3 card, but it must retain the recognisable portrait/name/stat triangle.

## 11.3 Active token states

### Neutral

- unchanged ATT/DEF in neutral colour
- no permanent glow

### Modified

- reduced effective stat is red
- increased effective stat is blue
- only the changed current value is shown
- each stat changes independently

### Selected/inspected

- external selection ring or elevation
- no internal colour wash
- tapping opens the focused player view

### Current event focus

- concise external glow or spotlight
- may pulse once as the player becomes relevant to a pressure/chance sequence
- event highlight colour must not be confused with modified-stat red/blue

### Targetable for substitution

- external outline/pulse
- optional impact badge sits outside the permanent token
- the token itself does not rewrite its printed anatomy

### Planned off

- compact `OUT` badge and reduced emphasis
- remain readable until the plan is locked

### Out of position

- explicit compact `OOP`/misfit state
- effective ATT and DEF already display the penalised values
- do not repeat both old and new numbers
- a focused/impact receipt can explain `-2 ATT / -2 DEF`

### Goal or key-event involvement

- temporary event treatment outside the permanent card anatomy
- scorer/action attribution appears in the event presentation rather than permanently occupying the token

## 11.4 Action trigger presentation

The active token does not carry a permanent action strip.

When an action triggers:

- show the real action name in a temporary full-width ribbon, event chip or nearby presentation layer
- connect it visually to the responsible token
- show the mechanical outcome in the match event presentation
- return the token to its normal anatomy after the event

The action name may also appear when the token is focused/inspected.

## 11.5 Coaching-break bench card purpose

The bench card must support the substitution decision. It should answer:

1. Can I afford this player now?
2. What is their primary position?
3. What are their printed ATT and DEF values?
4. What is their action called?
5. Which active player would they improve or weaken?

## 11.6 Coaching-break bench card anatomy

Use the compact team-selection card language:

- current cost pip cluster
- primary-position badge
- cut-out portrait and KC background
- surname nameplate
- shallow action-name strip
- printed ATT and DEF in angular corners
- rarity frame

Recommended target range: approximately **76 x 114 to 92 x 138 px**, validated against the seven-card horizontal tray.

Projected swap impact is shown as a contextual receipt outside the permanent card anatomy, not by replacing the bench player's printed ATT/DEF.

## 11.7 Coaching-break bench states

### Available

Normal bench card.

### Selected

External ring/elevation; active pitch tokens become potential targets.

### Affordable/unaffordable

- affordable: normal presentation
- unaffordable: dimmed with a concise cost warning
- current cost pips remain readable

### Modified cost

- blue pips: reduced current cost
- red pips: increased current cost
- only the current pip formation is shown

### Planned in

Compact `IN` badge or external plan receipt. Avoid covering portrait, position or stats.

### Swap comparison

The surrounding coaching UI may show:

- ATT delta
- DEF delta
- lane/position fit
- action-name difference
- energy spent

These comparison receipts should not be baked permanently into the card face.

## 11.8 In-match focused player view

Opening a player from the pitch or bench expands the same visual object into the focused view. It may show:

- full name
- primary and secondary eligible positions
- printed and current effective mechanics with clear context
- full action name, trigger, effect and target
- role/archetype as descriptive identity only
- career record

Condition remains an optional future module and must not reserve permanent space.

## 11.9 Match exclusions

Do not show on the active token:

- energy cost
- full action rules
- role/archetype
- career record
- condition
- full rarity label
- overall rating
- fitness or durability

---

# 12. Open grooming decisions

The following remain open and should be resolved before implementation polish:

- exact frame-material ladder for each rarity
- exact KC monogram shape and placement
- final mobile dimensions after real-pitch prototypes
- exact typography and truncation rules
- whether secondary fit carries any engine penalty or only eligibility signalling
- exact action-trigger ribbon/event choreography
- exact expanded-view layout
- pack-opening reveal choreography
- standard shop/collection card differences

## 13. Implementation guardrails

- Consolidate the fragmented player presentation into one shared anatomy/data-token system.
- Purpose-built renderers are allowed and expected; avoid scaling a single DOM component blindly across all contexts.
- Portrait crop and identity must remain consistent across renderers.
- Do not reintroduce removed mechanics because they exist in stale types, backlog files or older UI components.
- Validate all small variants on the real mobile team-selection and V7 match screens before treating dimensions as final.
