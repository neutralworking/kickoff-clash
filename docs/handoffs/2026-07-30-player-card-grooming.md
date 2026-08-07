# Handoff: player-card grooming and prototype

**Date:** 2026-07-30  
**Project:** Kickoff Clash  
**Repository:** `neutralworking/kickoff-clash`  
**Primary branch:** `agent/live-v7-match-integration`  
**Primary PR:** #85 — draft, open, unmerged  
**Status:** grooming substantially complete; real UI prototype is next

## Start here

Read these files before proposing or implementing anything:

1. `docs/player-card-system-spec.md`
2. `docs/player-card-decisions/2026-07-29-live-match-token-silhouette.md`
3. `docs/player-card-decisions/2026-07-29-expanded-player-view-format.md`
4. `docs/player-card-decisions/2026-07-30-card-corner-order-and-stat-scale.md`

The 2026-07-30 correction document overrides any older wording or mockup that conflicts with it.

## Product context

Kickoff Clash is a mobile-first football card battler. The live flow uses the established packs, squad selection, run, cups, shop and economy outside the match, with the improved V7 engine and presentation inside the match.

Player cards are the central objects in the game. The goal is premium collectibility comparable in impact and clarity to leading digital card games, while using Kickoff Clash's actual mechanics rather than generic football-card conventions.

## Current card contract

The normal player card contains only:

- portrait
- player name
- primary position
- one energy-cost value represented by one pip cluster
- ATT
- DEF
- player action
- rarity treatment

Do not add:

- overall rating
- total score
- fitness
- durability
- condition on the core face
- role/archetype on the core face
- stars or levels
- club badge or nation flag
- serial number or invented collectible metadata

Condition is an undecided V2 concept. Career record and role/archetype belong only in the expanded view; role/archetype is descriptive and has no match-engine effect.

## Locked visual anatomy

The master card uses a 2:3 structure inspired by the information hierarchy of classic digital card games without copying their trade dress.

- head-and-shoulders cut-out portrait
- oversized cropped KC monogram behind the portrait
- straight full-width metal nameplate with chamfered ends
- full-width action panel beneath the nameplate
- angular ATT and DEF corner badges
- rarity communicated through frame colour/material

### Fixed clockwise corner order

1. top-left: **cost pip cluster**
2. top-right: **primary position**
3. bottom-right: **DEF**
4. bottom-left: **ATT**

In clockwise order: `cost → position → DEF → ATT`.

Every complete card variant must preserve this order.

## Cost pip rule

Each player has one cost from 1 to 6. Show it as one compact pip cluster. It is not a die and must not appear as multiple dice or multiple cost objects.

- 1: one central pip
- 2: two pips
- 3: three pips with one centred
- 4: four pips
- 5: five pips with one centred
- 6: six pips

No die outline, numerals, empty placeholders or horizontal six-slot meter.

## ATT and DEF

Expected practical range is approximately **-5 to 25**.

- components must support negatives and two-digit values
- use realistic prototype values such as `ATT 12 / DEF 7`, not football-rating values like `72 / 68`
- no combined rating
- ATT is always bottom-left
- DEF is always bottom-right

In the live match, show current effective values only:

- unchanged: neutral
- modified down: red
- modified up: blue

Do not show printed and modified values together.

## Actions

Actions are central mechanics.

- pack/shop: action name plus concise real effect
- team selection and coaching-break bench: action name only
- active match token: action hidden normally; action name appears when focused or triggered
- expanded view: action name, trigger, full effect and target

Fit-state examples must show the action name, never role/archetype. Use real names such as `SECOND BITE`, `SCANNER`, `WALL` or `SHOWBOAT`.

## Positions and fit

- normal face shows primary position only
- secondary eligible positions appear in expanded view
- team-selection placement state communicates primary fit, secondary fit or misfit
- printed position does not change when placed elsewhere
- misfit should show an explicit `-2 ATT / -2 DEF` receipt where space permits

## Team-selection card

The pitch and bench cards share the same anatomy:

- cost pips
- primary position
- cut-out portrait and KC monogram
- surname nameplate
- shallow full-width action-name panel
- ATT bottom-left
- DEF bottom-right
- rarity frame

Seven substitutes must use a horizontally swipeable tray. Do not squeeze seven cards into equal-width columns.

Selection, valid target, invalid target and fit treatments live around the permanent anatomy and must not replace it.

## Live-match token

Use a compact vertical mini-card silhouette, not a circle and not a blindly shrunken complete card.

It shows:

- current position
- cut-out portrait
- simplified KC monogram
- surname
- current effective ATT bottom-left
- current effective DEF bottom-right
- subtle rarity edge

It hides:

- cost
- permanent action panel
- role/archetype
- career record

`OUT`, `OOP`, selected, targetable and event-focus treatments are contextual overlays outside the permanent anatomy.

## Expanded view

Current provisional direction: a full-screen mobile dossier.

- premium 2:3 card as hero object
- scroll/swipe into full action rules
- eligible positions
- role/archetype as flavour
- career record
- no reserved condition section while that feature remains undecided

## Current code fragmentation

Existing player presentation is split across:

- `src/components/cards/GameCard.tsx`
- `src/components/cards/FoilCard.tsx`
- `src/components/PlayerCard.tsx`
- `src/components/cards/CardModal.tsx`
- `src/components/SquadScreen.tsx`
- `src/components/match-v7/V7Pitch.tsx`

Do not immediately refactor all production surfaces. First prove the approved anatomy in a real UI prototype.

## Next task

Build a real in-browser **player-card prototype lab**, using actual React/CSS, existing portrait assets and representative real game data. Do not generate another infographic as the primary deliverable.

Recommended route: `/lab/player-cards`.

The lab should show, at actual intended mobile sizes:

1. team-selection pitch card
2. primary, secondary and misfit states
3. seven-card horizontal substitutes tray
4. selected, valid-target and invalid-target states
5. compact active match token
6. unchanged, modified-down and modified-up ATT/DEF examples
7. `OUT` and `OOP` token states
8. temporary action-trigger treatment
9. one expanded full-screen dossier transition or static prototype

Use real card-scale ATT/DEF values in the `-5…25` range and one cost pip cluster per card.

After the lab is visually approved, define shared card tokens/anatomy and then migrate production surfaces in a separate implementation step.

## Git safety

- PR #85 is a draft integration PR and must not be merged without explicit owner instruction.
- Do not restore the legacy V6 match presentation.
- Do not target `/rebuild` or deprecated `src/engine/*` paths.
- Prefer a follow-up branch based on `agent/live-v7-match-integration` for the card prototype so the card work can be reviewed separately.

## Copy-paste prompt for a new chat

> Continue the Kickoff Clash player-card grooming work. Read `docs/handoffs/2026-07-30-player-card-grooming.md` and every source-of-truth document it links before responding. Use the live repository and PR #85 as authoritative context. Do not generate another generic card infographic. The next task is to build a real `/lab/player-cards` React/CSS prototype at actual mobile sizes, using existing portraits and representative real mechanics. Preserve the fixed clockwise corner order: cost top-left, position top-right, DEF bottom-right, ATT bottom-left. Each card has one cost represented by one pip cluster, ATT/DEF range approximately -5 to 25, and team-selection fit examples show action names rather than roles. Keep PR #85 unmerged.
