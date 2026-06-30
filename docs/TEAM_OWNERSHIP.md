# Kickoff Clash — Skill Team & Area Ownership

Who owns what, and the hand-off seams between them. Decided in the post-0.3 standup
(all six experts reviewed the live build and named their lane + the gaps). The rule:
**one owner per concern; collaborate at the seams; never two skills editing the same
decision.**

## The roster

| Owner | Kind | Owns |
|---|---|---|
| **designer** | agent (ships) | App visual/UX chrome: layout, screens, glass tokens, motion, flow, **empty/void & transient-feedback states** |
| **card-designer** | agent (ships) | The card visual system (`src/components/cards/`) + sprites + rarity + **the on-pitch `PitchCard`/`MiniSprite`** |
| **balance-lab** | skill (advises) | The *numbers*: power scale, economy, difficulty curve, meta, counter-web tuning, match-engine dials |
| **game-designer** | skill (advises) | *Fun & legibility*: game-feel/juice, reward cadence, feedback **placement**, onboarding, the run's arc; **audio design (cue map)** |
| **game-systems-designer** | skill (advises) | The *mechanism*: shop offer model, upgrade tree, manager/joker model, card pillars — all as data over the verb palette |
| **content-narrative-designer** | skill (advises) | The *fiction & words*: card identities, gaffer personas, commentary, the win/loss narrator copy, tone |

## The clean split (one sentence)

> **systems** designs the mechanism · **balance** sets the numbers on it · **content**
> writes the fiction filling it · **game-designer** judges if it's fun & legible ·
> **designer / card-designer** build how it looks.

## Hand-off seams (where two owners meet)

- **systems → balance:** systems defines which dials exist + how they connect; balance tunes
  the values and sweeps. (Every `backlog/07-10` doc ends with "balance-lab sign-off".)
- **systems → content:** systems builds the structure (the joker model, the upgrade types);
  content authors the instances (the 20 gaffers, the upgrade flavour).
- **game-designer ↔ content (the close seam):** a goal callout / loss-diagnosis / coach note
  is one job — **game-designer owns whether it exists and where it sits**; **content owns the
  words/voice**. Co-spec; never collide.
- **anyone → designer/card-designer:** they build the UI for whatever a mechanic/line needs
  surfaced; they own pixels, others own the words/rules/numbers.

## Standup ownership resolutions (gaps that were unowned)

- **Game-systems design** had no owner (balance *tunes*, it doesn't *design*) → new
  **game-systems-designer** skill. The priority hire; it unblocks all four backlog reworks.
- **Fiction / voice** had no owner → new **content-narrative-designer** skill.
- **Empty/void states + transient feedback** (dead vertical bands, "NO CARDS HERE", disabled
  gates, the match toast) → assigned to **designer** (it claimed it; compose negative space as
  deliberately as the cards).
- **The on-pitch `PitchCard`** (a separate, flatter card system from `GameCard`, no glass) →
  assigned to **card-designer** so the gallery card and pitch card stop drifting.
- **Audio / sound** is repo-wide absent → **game-designer** owns the *design* (cue map,
  escalation, mute/reduced-motion parity); a **build owner** wires the SFX layer when audio
  work actually starts (defer the dedicated skill until then — nothing to advise on yet).

## Don't-overlap matrix (quick check before starting work)

- Tuning an existing number? → **balance-lab** (not systems).
- Designing a *new* mechanic/economy/upgrade? → **game-systems-designer** (then balance tunes).
- Is it fun / does a new player get it / where does feedback go? → **game-designer**.
- The actual words a player reads? → **content-narrative-designer**.
- How a screen or component looks? → **designer** (chrome) / **card-designer** (cards).

When unsure, name the *concern* (number vs mechanism vs words vs fun vs pixels) — that picks
the owner.
