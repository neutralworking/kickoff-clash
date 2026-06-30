# KC Content Map — fiction & voice → live code

The bridge between the Scout/Commentator lenses and Kickoff Clash's actual content. When
this skill writes a piece, it names the file/generator from here, keeps KC's tone, and
hands placement to game-designer.

## The raw material (rich, mostly payoff-free)

`public/data/kc_cards.json` — 540 fictional cards, each carrying `name`, an evocative
cross-role `nickname`, `quirk`, `strengths`/`weaknesses`, `personalityTheme`, `nation`,
`best_role`. This is excellent character *infrastructure* — and almost none of it reaches
the player with meaning. The Scout's core job: turn 540 stat-lines into a squad of
recognisable characters (the collection pull). Regenerable via `scripts/generate-cards.ts`
(embedded aggregates, no PII) — coordinate any data-shape change with whoever owns transform.

`docs/CARDS_V1.md §6` — the intended 500-card authoring solution. Read it before a big
identities pass.

## The voice surfaces (thin today)

- **Match commentary** — `src/lib/hand.ts`: `generateGoalText`, `generateChanceText`,
  `generateInjuryText` produce seeded beat text. It's deterministic (NEW-salt seeded — keep
  it so) but the pools are short and repetitive. The Commentator deepens and varies these.
- **Goal/assist callouts** — `match-v5.ts` `buildBeats` now carries `scorerName`/
  `assisterName` per beat, but the headline `GOAL!` eruption in `PitchMatchView.tsx` omits
  the name. Put the character in the moment ("**Maganga** buries it — GOAL!").
- **Win/loss narrator** — `PostMatch.tsx` / `EndScreen.tsx` have NO line explaining *why*
  the player won or lost. This is the highest-leverage copy in the game (the restart pull).
  game-designer specs the moment + data; you write the varied, teaching line.
- **Gaffer philosophies** — `src/lib/jokers.ts` each manager has a one-line `philosophy`.
  Once game-systems-designer reworks managers (09), these personas should match the mechanic.
- **Tactic / opponent flavour** — `tactics.ts`, `opponent.ts`: thin one-liners; the opponent
  has a real emergent identity (the counter-web) that deserves a voice ("they sit deep and
  hit you on the break").

## Tone (the rule)

From `DESIGN.md` › Brand & Voice: **terse, punchy, sporting.** UPPERCASE pixel labels;
short italic flavour quotes ("Concede nothing, punish everything."); no marketing fluff, no
exclamation spam. Football-authentic but never a sim's dry stat-speak. Every line earns its
place — copy is a spotlight, like juice; over-writing flattens it.

## Lanes (so content hands off cleanly)

- **content ↔ game-designer (the close seam):** a goal callout / loss diagnosis / coach note
  is one job — game-designer owns *whether it exists and where it sits* (the UX of feedback
  and legibility); content owns *the words and voice*. Co-spec; never collide. If you're
  unsure a line should appear at all, that's game-designer's call.
- **content ← game-systems-designer:** you author instances over their structures — they
  build the manager-trait model, you write the gaffer personas; they define an upgrade type,
  you name and flavour it.
- **content → designer/card-designer:** you supply the words; they lay them out and pick the
  type. Don't fight the pixel; write to the space they give.

## Validation

Content is validated by: (1) **tone fit** — does it sound like KC (terse, sporting,
characterful)? (2) **non-repetition** — seeded variety with no obvious recycling across a
session. (3) **legibility payoff** — for narrator/commentary, can the player *learn* from it
(why they lost, who's carrying)? Deliver real copy, keep the seeded determinism where the
generators are seeded, and end with the file it lands in + any game-designer placement
handoff.
