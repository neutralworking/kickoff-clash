# Design handoffs (CURRENT — not the fbal-era archive)

Unlike the rest of `design/` (historical, fbal-era), this folder holds **live
design handoffs** for the current game. Each bundle is a self-contained spec
authored outside the repo (Claude.ai design sessions etc.) and dropped here as
the reference for implementation.

| Bundle | What it specifies | Status |
|---|---|---|
| `squad-screens/` | Team-selection ("NAME YOUR SQUAD", build **1a Dual Bars**) + the in-match screen: projected contest bars, intent re-split, competence/misfit model, pitch token anatomy, bench drawer, contest maths, tokens/motion. The `.dc.html` is a design reference on a bespoke prototyping runtime (`support.js`) — port the design and the plain-JS contest maths, never the runtime. | To implement |
| `chief-scout-comparison-reframe.md` | The Chief Scout comparison-engine reframe (July 2026). Context for KC: the games are **consumers of comparison data, not drivers** (§1); useful background for any KC feature touching player identity/comparison. | Reference |

The player-card handoff the squad-screens README refers to is a separate spec
(not yet in this folder).
