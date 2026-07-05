import { defineConfig } from 'vitest/config';

// The vitest harness is the canonical acceptance gate for the KC rebuild
// (KC_REBUILD_PLAN_V1): determinism + SM distribution checks over src/engine/.
// Playwright's tests/ tree is out of scope here (it has its own runner).
export default defineConfig({
  test: {
    include: ['src/engine/__tests__/**/*.test.ts'],
  },
});
