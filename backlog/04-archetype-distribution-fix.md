# 04 — Archetype distribution fix

**Source:** `BASELINE.md` "Archetype distribution is uneven".

## Outcome

`kc_characters.json` is rebalanced so every archetype has a minimum floor of draftable characters. Specifically: Dribbler ≥ 20, Passer ≥ 25, Sprinter ≥ 25. Over-represented archetypes (Creator 84, Engine 83) are brought closer to the mean.

## Why

Current distribution across 500 characters:

| Archetype | Count | Notes |
|---|---|---|
| Creator | 84 | Creative Spark synergy trivially guaranteed |
| Engine | 83 | Gegenpressing style over-available |
| **Dribbler** | **7** | **Skill Show synergy impossible to draw** |
| Passer | 19 | Passing Carousel rarely draws |
| Sprinter | 18 | Lightning Strike rarely draws |

Dribbler at 1.4% of the roster means its synergy (`Skill Show: 2× Dribbler attacking`) is mechanically unreachable. This silently punishes any design decision that builds around Dribbler. Similar (milder) pressure on Passer and Sprinter.

## Acceptance criteria

- [ ] `public/data/kc_characters.json` rebalanced. Target floors:
  - Dribbler ≥ 20
  - Passer ≥ 25
  - Sprinter ≥ 25
  - All other non-GK archetypes ≥ 25
  - GK: leave at ~34 (current) or adjust to ~30
  - Creator and Engine: brought down to ~50–60 each (still most common, but not runaway)
- [ ] Total character count remains **500**.
- [ ] Harness run shows the new distribution via the existing archetype-count printout.
- [ ] All 13 non-GK archetypes represented at ≥ 20 each.
- [ ] `scripts/match-harness.ts` runs end-to-end against the new file — no lookups fail, no undefined archetypes.
- [ ] Dev server (`npm run dev`) renders the title/setup phase without errors.
- [ ] Optional: one run of the game's pack opening flow in the UI to confirm cards render with the new distribution. Document whether you did this or not.

## Approach options

1. **In-place rewrite** — edit the existing JSON, change `model` and `primary` fields on characters that currently land in over-represented archetypes. Pros: preserves names, bios, nations, quirks. Cons: tedious, risk of breaking bio/archetype coherence.
2. **Regen script** — write a Node script under `scripts/` that loads the existing file, reassigns archetypes to hit the target floor, writes back. Pros: reproducible. Cons: still editing `model` strings, which may drift from bios.
3. **LLM-assisted regen** — use a prompt to generate replacements. Pros: bio-coherent. Cons: slow, non-deterministic, introduces new quality risk.

**Recommended:** option 2 (regen script). Keep it simple: reassign `model` strings on a deterministic seed, leave bios as-is, accept mild flavor drift. If a bio explicitly calls out being a "dribbler" or "playmaker", try to preserve that character's archetype.

## Boundaries

- Only touch `public/data/kc_characters.json` and (optionally) add a regen script to `scripts/`.
- Do not modify `transform.ts` mappings.
- Do not change archetype IDs or add new archetypes.

## Non-goals

- Don't rebalance power levels (that's task 01).
- Don't rewrite bios, names, or nations.
- Don't add new fields to the character schema.

## Risks / watchouts

- **Conflicts with task 01** — both edit `kc_characters.json`. Serialize: either 01-then-04, or 04-then-01. Coordinate with whoever picks up the other task.
- If a regen script is written, commit it alongside the data so future content passes are reproducible.
- Transform uses a fallback: `MODEL_TO_ARCHETYPE[char.model] ?? 'Engine'`. If any new `model` string isn't in the map, it silently becomes Engine. Verify the mapping covers every `model` value in the new file.

## Done when

Harness prints distribution with all 13 non-GK archetypes at ≥ 20 each; total stays 500; game boots.
