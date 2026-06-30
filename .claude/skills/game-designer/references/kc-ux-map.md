# KC UX Map — theory → the real screens

The bridge between the Juicer/Showrunner lenses and Kickoff Clash's actual code. When
this skill recommends a change, it names a screen and a file from here, then routes the
build to `designer` / `card-designer` (visuals), `balance-lab` (numbers), or specs the
copy/flow directly.

## The phase loop (where the player actually is)

`GameShell.tsx` (`src/components/`) owns the phase state machine and the run:

```
title → packOpen → teamSelect → (match → postmatch → teamTalk)* → shop → … → end
                                                    └ between ties in a cup ┘
```

| Phase | Component | The player is… | Feel/UX stakes |
|---|---|---|---|
| title | `TitleScreen.tsx` | starting / resuming | first impression; restart pull on `end` |
| packOpen | `PackOpening.tsx` / `PackReveal` | pulling cards, picking a gaffer | the dopamine pull; rarity escalation |
| teamSelect | `TeamSelect.tsx` | drafting the XI + bench | the core "build a team" teach; casual/optimiser split |
| match | `MatchPhase.tsx` → `match/PitchMatchView.tsx` | watching/steering the match | juice, legibility, dead-air; the headline beat |
| postmatch | `PostMatch.tsx` | reading the result | "why did I win/lose?"; survival sting/relief |
| teamTalk | `TeamTalk.tsx` (0.3) | adjusting before the next tie | fitness-aware decision; one-tap default |
| shop | `ShopPhase.tsx` | spending, squad-managing | reward cadence; the act break |
| (overlay) | `SquadGallery.tsx` (0.3) | browsing all cards | collection/mastery motivator |

## Where the known feel/legibility gaps live

- **Match legibility (the big one).** `PitchMatchView.tsx` historically showed raw power
  and team-level stats — no per-player rating, no scorer/assist callout, no
  wrong-position flag. That's a *journey* gap (can't tell who to swap or why you lost)
  and a *feel* gap (goals don't attribute, so they don't land). The 0.3 match-info
  overhaul addresses it; treat the new data (`playerMatchStats`, scorer/assist on
  `MatchBeat`) as both information AND juice (flash the scorer chip, pop the rating).
- **Dead air in resolution.** The per-increment flow can stall on static stat panels.
  Audit `PitchMatchView` between-period beats for motion (reuse `globals.css`
  `statsRise`, `statBarGrow`, number-pops) — don't let a rest become a wall of text.
- **Decision defaults.** `TeamTalk` and `TeamSelect` must hit Confirm in one tap via a
  *good* default (the fitness-aware `autoFillXI` in `team-select.ts`) while exposing the
  full edit surface behind it. A bad default trains distrust.
- **Loss legibility.** `PostMatch.tsx` / end screens should state the takeaway ("their
  right flank outscored your midfield"; "your striker was at 60% fitness"), not just the
  score — feed the mastery loop and the restart pull.
- **Reward escalation.** Pulls (`PackOpening`), survivals (`PostMatch`), and trophies
  must escalate in feel; a cup final's payoff cannot share a beat with a round-1 win.

## The feel vocabulary already in the code

`globals.css` has a rich, GPU-cheap keyframe library — **reuse, don't reinvent**:
`goalErupt`, `goalFlash`, `netShake`, `scoreTick`, `movePop`, `shotKick`, `heroPop`,
`packRip`, `packRarityFlash`, `chipReveal`, `statsRise`, `statBarGrow`, `scorePop`,
`pulseButton`. Recommend *which* event uses *which* beat; the building agents wire it.
What's missing entirely: **sound** (no audio layer yet — flag a goal cue + a pull
shimmer as cheap, high-impact wins) and **per-player number-pops** in the match.

## Run-arc levers (route numbers to balance-lab)

The dramatic arc lives in `run.ts`: `CUP_SIZES = [2,3,4,5,6]`, finals as bosses,
fitness persistence within a cup + reset between cups, draw-advances-but-drains. The
Showrunner shapes the *felt* arc ("routine ties then a wall"); the actual difficulty
numbers (`ROUND_POWER`, cup-final power, opener drop) are `balance-lab`'s call — hand
the pacing intent over, don't set the constants here.

## Validation (how to confirm a fun/UX change landed)

- **Drive the screen headless** (chromium 390×844) and watch the beat — does the moment
  read, does the default work in one tap, does the loss state its reason?
- **Name the observable.** Every recommendation must come with a concrete proof: "the
  scorer's chip now flashes and the name appears," "PostMatch now shows a one-line
  reason for the result," "Confirm is reachable in one tap from a fresh Team Talk."
- **Watch a real run** end-to-end for arc/pacing reads (tension toward finals, the
  shop act-break landing, the restart pull on the end screen).

## Output: the recommendation table

End every pass with: change · screen/file · what & why (Juicer + Showrunner) · who
builds it (designer / card-designer / balance-lab / copy) · validation observable.
