import { defineConfig } from 'vitest/config';

// Vitest is the canonical acceptance gate for the KC rebuild.
//  • src/engine-v2/  — the NW-139 six-contest engine (Fork A); its harness
//    asserts the CARD_SYSTEM_V2 distributions (the live acceptance gate).
//  • src/engine/     — the parked two-window resolver, kept green as CI hygiene
//    (CLAUDE.md); superseded as the resolution model but not yet removed.
// Playwright's tests/ tree is out of scope here (it has its own runner).
export default defineConfig({
  test: {
    include: ['src/engine/__tests__/**/*.test.ts', 'src/engine-v2/__tests__/**/*.test.ts'],
  },
});
