// Kickoff Clash V7 — the game (UI-adjacent) layer that adapts frontend data to
// the pure `src/engine-v7` package and drives a playable match. This layer may
// know about the engine; the engine must never know about this layer.

export * from './adapter/result';
export * from './adapter/cards';
export * from './adapter/actions';
export * from './adapter/lineup';
export * from './adapter/match';
export * from './adapter/opponent';
export * from './receipts';
export * from './broadcast';
export * from './presentation';
export * from './fixtures';
export * from './controller';
