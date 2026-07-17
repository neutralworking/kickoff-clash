# Portraits — drop-in convention

Real portrait art for the card faces. The card chassis is portrait-READY: with a
sliced PNG + a manifest entry, a card shows the real face; without one it falls
back to the procedural pixel bust (and again if an `<img>` fails to load). So the
game renders fully today with **zero** art here.

## How to add art

1. **Slice** each portrait to a **3:4 tile** (portrait, taller than wide). The card
   crops with `object-fit: cover; object-position: center 6%` (biases up so heads
   keep headroom) — so deliver the **full uniform tile**, do NOT bake framing in.
   Reasonable size: ~480×640 PNG.
2. **Drop** the file into:
   - `public/portraits/players/` for players (e.g. `ferraro.png`)
   - `public/portraits/managers/` for managers (e.g. `pomo.png`)
3. **Map** it in `manifest.json` (a flat `{ key: file }` object):
   - **Players** — key = the **slug**: the player's lower-cased surname with
     punctuation stripped (`portraitSlug()` in `src/components/cards/portrait.ts`).
     Example: player "Léo Ferraro" → slug `ferraro` → `"ferraro": "ferraro.png"`.
   - **Managers** — key = `mgr-{id}` where `{id}` is the `JokerCard.id`
     (e.g. `mgr-gegenpress`). A bare `{id}` key is also accepted.
4. **Rebuild** (`npm run build`) — the manifest is bundled at build time (same as
   `kc_cards.json`). At runtime an `<img>` that 404s also falls back gracefully.

### Example `manifest.json`

```json
{
  "ferraro": "ferraro.png",
  "okafor": "okafor.png",
  "mgr-gegenpress": "gegenpress.png"
}
```

Keys not present in the manifest simply use the procedural bust — mixing real and
procedural portraits in the same squad is fine.
