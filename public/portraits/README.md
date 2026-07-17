# Card portraits

Real face art for the player + manager cards (design_handoff_player_cards look).
The card chassis (`src/components/cards/GameCard.tsx`) renders the portrait
window from these; if no face resolves it falls back to the procedural pixel
bust, and again on `<img>` onError. Resolver: `src/components/cards/portrait.ts`.

## Two layers (manifest wins)

1. **`pool.json`** — the sliced sheet faces (`players[]` / `managers[]`; files in
   `players/` and `managers/`). The card art has no authored name→face mapping, so
   each card is assigned a **stable** pool face by its id (a card always shows the
   same face; faces repeat across the 540-card deck). This is the default and is
   what fills the cards today.

2. **`manifest.json`** — a `{ key: file }` override to **pin** a specific face to a
   specific card. Player key = the slug (lower-cased surname, punctuation
   stripped, e.g. `ferraro`); manager key = `mgr-{JokerCard.id}`. Value = a
   filename in the matching folder. Ships empty `{}`. An entry here beats the pool.

## Regenerating the pool

Faces are sliced from the roster sprite sheets (uniform grids of 3:4
head-and-shoulders portraits; player rows and manager rows are declared in the
script). The source sheets are large and not committed — unpack them from the
design upload and run:

```
node scripts/slice-portraits.mjs <sheetsDir>
```

That rewrites `players/`, `managers/` and `pool.json`. Tiles are cropped on grid
boundaries (a small inset drops the gutter lines), JPEG-encoded and sha1-deduped.

## Adding one hand-picked face

Drop a 3:4 PNG/JPG into `players/` (or `managers/`) and add a `manifest.json`
entry mapping the card's slug (or `mgr-{id}`) to the filename. The card crops with
`object-fit: cover; object-position: center 6%`, so supply the full tile.
