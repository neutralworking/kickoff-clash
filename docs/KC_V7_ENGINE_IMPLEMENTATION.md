# Kickoff Clash V7 engine implementation

V7 is implemented beside V6 under `src/engine-v7`. The package is pure TypeScript and must not import React, browser APIs, Supabase clients, or mutable global randomness.

## First vertical slice

Implemented:

- serializable V7 contracts;
- namespaced deterministic RNG;
- stat order: printed → latest set → swap → flats → multipliers → round toward zero;
- global chance count;
- regional chance allocation;
- strongest/weakest ranking;
- 3/5/7 break-budget receipts;
- initial break-plan validation;
- typed receipt creation;
- foundational Vitest coverage.

## Package boundaries

- `core/`: deterministic calculations with no match orchestration.
- `actions/`: conditions, targets, effects, copy and disable resolution.
- `formations/`: geometry, compatibility and automatic mapping.
- `planning/`: plan construction and legality.
- `runtime/`: match orchestration and event receipts.
- `data/`: validated static definitions.
- `__tests__/`: headless engine tests.

## Next slice

1. formation geometry and compatibility;
2. runtime stat ledgers and emergency goalkeeper handling;
3. action condition and target dispatch;
4. period chance resolution and dice receipts;
5. break resolver with before/after internal stages;
6. Game Start, Ongoing and End of Period timing snapshots.
