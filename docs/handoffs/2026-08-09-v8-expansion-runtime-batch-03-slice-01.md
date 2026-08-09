# V8 expansion runtime — Batch 03 slice 01

Date: 2026-08-09
Branch: `claude/generated-tactical-window-6dxfay`
Parent PR: #106 (draft, unmerged)

## Scope

This slice starts the third mixed-XI Action expansion using the live Card Design Tracker as the Action/name source of truth and the KC reconciliation view for frozen lab stats where the Tracker does not supply them.

Batch 03 deliberately translates obsolete V7 dice/sector/Box wording into the accepted V8 DEF/MID/ATT + Tactical-card grammar. It does not reintroduce removed V7 systems.

No global Energy, scoring-band, Penalty, Tactical-base-value or frozen package-balance input changed.

## Batch 03 source audit

Eight Tracker-backed Action concepts were selected:

1. Fabio Cannavaro — **READS IT EARLY**
2. Diego Maradona — **SLALOM RUN**
3. Lev Yashin — **BLACK SPIDER**
4. Edinson Cavani — **GET ACROSS HIM**
5. Lucy Bronze — **OVERLAP**
6. Alexia Putellas — **THROUGH THE GAP**
7. Andrea Pirlo — **DIAGONAL SWITCH**
8. Dennis Bergkamp — **FIRST TOUCH**

Tracker rows and Action concepts remain authoritative. Reconciliation supplies stats/fake names for the lab only.

Important source-priority detail:
- Alexia Putellas has Tracker Cost **5**; this supersedes reconciliation Cost 3.
- Andrea Pirlo has Tracker Cost **5**; this supersedes reconciliation Cost 3.
- Those two cards are not yet runtime-ready in this slice.

## V8-native translations

### Cannavaro — READS IT EARLY

Tracker concept:
> While their sector out-attacks yours, +4 DEF.

Accepted V8 text:
> **Ongoing: If the opposing ATT facing this zone is greater than your DEF here without this effect, +4 DEF.**

Calibration stats:
- Match name: Camavero
- Full card: Fabio Camavero
- CB / DEF
- Cost 3
- ATT 1
- DEF 10
- Source card: KC-040

### Maradona — SLALOM RUN

Tracker concept used an adjacent attacking sector and generated an uncancellable Box chance.

Accepted V8 text:
> **Moveable once per match. When this moves from MID to ATT, gain +4 ATT this period and your first Chance in ATT this period cannot be cancelled.**

The generic V7 Box Chance is intentionally not resurrected. The run itself creates the immediate +4 attacking threat and protects the next real Chance in ATT.

Calibration stats:
- Match name: Maravilla
- Full card: Dario Maravilla
- AM / LF, MID / ATT
- Cost 4
- ATT 9
- DEF 2
- Source card: KC-061

### Bergkamp — FIRST TOUCH

Tracker concept:
> Your first chance each period needs only a 5.

Accepted V8 text:
> **Your first Chance each period has +2 ATT.**

This preserves the first-touch quality advantage without reviving dice thresholds.

Calibration stats:
- Match name: Bandcamp
- Full card: Dennis Bandcamp
- CF / AM, MID / ATT
- Cost 3
- ATT 10
- DEF 1
- Source card: KC-049

## Runtime implementation

### READS IT EARLY

Implemented in `calibration-expansion-ongoing.ts` using the existing dynamic ongoing rebuild.

The `READS IT EARLY:` modifier is removed before every recomputation. Cannavaro compares:
- friendly baseline DEF in his physical zone; versus
- opposing ATT in the depth zone facing him.

If opposing ATT is greater, Cannavaro receives +4 DEF. If the condition later stops being true, the modifier disappears on the next ongoing refresh.

This explicit clear-then-recompute step gives correct **"without this effect"** semantics and avoids recursive self-qualification.

### SLALOM RUN

Implemented in `calibration-expansion-runtime.ts` using the movement/protection vocabulary already proven by Abedi and Brian Laudrup.

Rules:
- one movement per match;
- only adjacent natural MID / ATT movement;
- MID → ATT gives Maradona +4 ATT for the current period;
- MID → ATT arms protection for his side's first Chance played in ATT that period;
- the protected Chance is uncancellable;
- the +4 and protection expire at period end;
- the match movement allowance remains consumed.

An ATT → MID move is legal but supplies no +4/protection and still consumes the once-per-match move.

### FIRST TOUCH

Implemented in the shared Chance-resolution path.

Rules:
- while Bergkamp is deployed and enabled, the first team Chance each period gets +2 ATT;
- the first-Chance counter is consumed before cancellation resolution, so a cancelled first Chance still spends FIRST TOUCH;
- resets naturally at period end;
- because commitment and Generated-Tactical Window plays reach the same Tactical path, FIRST TOUCH behaves consistently in both windows.

Resolution order in the current expansion path is:
1. FIRST TOUCH enhancement;
2. movement-based Chance protection;
3. ordinary Tactical resolution;
4. post-resolution typed cancellation such as TIMED SLIDE.

## Focused runtime proof

`calibration-expansion-batch-03-runtime.test.ts` verifies:

### Cannavaro
- base DEF 10 with no threat;
- Wambach ATT 11 makes READS IT EARLY activate to DEF 14;
- adding Puyol raises baseline friendly DEF enough that Cannavaro returns to DEF 10;
- no stale dynamic modifier remains.

### Maradona
- MID → ATT moves correctly;
- ATT becomes 13 for the period (9 + 4);
- second movement attempt fails for the entire match;
- a Through Ball in ATT is protected from Schmeichel's cancellation attempt;
- +4 expires next period while the move remains consumed.

### Bergkamp
- first Cross resolves for 4 ATT (base 2 + FIRST TOUCH 2);
- second Through Ball resolves for its ordinary 2 ATT;
- the first Chance of the following period receives +2 again.

## Verification — accepted gameplay head

Gameplay head: `c9fcd567b585f544f0c06a44b0e912d8d8ba9573`
Verify: **#338**
Run: `31307776092`
Job: `93230759097`

Results:
- blocking focused gate: **26 files / 177 tests passed**
- full Vitest visibility: **544 passed / 2 failed / 4 todo**
- all V8 tests passed
- only inherited unrelated V7 failures remain:
  1. `src/game-v7/__tests__/isolation.test.ts` — `PlayerDossier.tsx` imports `@/game-v7`
  2. `src/game-v7/__tests__/live-integration.test.ts` — expected live `cm` sector `centre`, received `undefined`
- TypeScript: passed
- changed-file lint: passed
- full lint visibility: inherited unrelated repo debt only
- static export: passed
- Chromium install: passed
- V7 typed-chance browser: **4/4 passed**
- V8 match-lab browser: **7/7 passed**
- workflow conclusion: success

## Batch 03 status after slice 01

Runtime-ready:
1. Cannavaro — READS IT EARLY
2. Maradona — SLALOM RUN
3. Bergkamp — FIRST TOUCH

Primitive-required:
4. Yashin — BLACK SPIDER
5. Cavani — GET ACROSS HIM
6. Lucy Bronze — OVERLAP
7. Alexia Putellas — THROUGH THE GAP
8. Pirlo — DIAGONAL SWITCH

## Remaining design translations already locked

### Yashin — BLACK SPIDER
> The first opposing Chance played in ATT each period has −2 ATT, to a minimum of 0.

This is deliberately distinct from Schmeichel / STARFISH. BLACK SPIDER suppresses the quality of the first Chance rather than cancelling it.

### Cavani — GET ACROSS HIM
> The first time each period a Cross played here would be cancelled, prevent that cancellation.

### Lucy Bronze — OVERLAP
> Ongoing: While this is in MID and you have a friendly WF in ATT, this and your highest-ATT friendly WF in ATT have +2 ATT.

### Alexia — THROUGH THE GAP
> The first non-Through-Ball Chance played here each period becomes a Through Ball before it resolves.

### Pirlo — DIAGONAL SWITCH
> Your first Chance played in MID each period resolves in ATT instead; if it was not a Cross, it becomes a Cross before it resolves.

## Next direction

The next low-risk runtime slice should implement **BLACK SPIDER + GET ACROSS HIM + OVERLAP**. They exercise three useful reusable primitives:
- first-Chance ATT suppression;
- cancellation interception;
- dynamic friendly targeting.

Keep Alexia/Pirlo together for a later Tactical-transformation slice so transformation/relocation ordering can be designed and tested as one coherent pipeline.
