import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest is the canonical acceptance gate for the KC rebuild.
//  • src/lib/match-v6/ — the V6 card-deployment engine (the committed direction,
//    docs/KC_V6_SPEC_DECISIONS.md); its harness is the live acceptance gate.
//  • src/engine-v2/    — the superseded NW-139 six-contest engine, kept green as
//    CI hygiene until removed (spec D2); no longer a live-game gate.
//  • src/engine/       — the parked two-window resolver, kept green as CI hygiene.
//  • src/engine-v8/    — the isolated V8 calibration prototype and matchup evidence.
// Playwright's tests/ tree is out of scope here (it has its own runner).
export default defineConfig({
  // The game-v7 layer imports the engine via the `@/` path alias (tsconfig
  // paths); mirror it here so those tests resolve. Engine tests use relative
  // imports and are unaffected.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: [
      'src/lib/match-v6/__tests__/**/*.test.ts',
      'src/lib/__tests__/**/*.test.ts',
      'src/engine/__tests__/**/*.test.ts',
      'src/engine-v2/__tests__/**/*.test.ts',
      'src/engine-v7/__tests__/**/*.test.ts',
      'src/engine-v8/__tests__/**/*.test.ts',
      'src/game-v7/__tests__/**/*.test.ts',
    ],
  },
});
