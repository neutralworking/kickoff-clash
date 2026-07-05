/**
 * KC rebuild engine — public surface (KC_REBUILD_PLAN_V1 Phase 1).
 *
 * Pure TypeScript, zero React/DOM imports. UI consumes engine output; it never
 * computes game state. The typed event log is the source of truth.
 */

export * from './contexts';
export * from './events';
export * from './traits';
export * from './posture';
export * from './streak';
export * from './match';
export * from './cards';
export * from './draft';
export { rngNext, rngSeed, mulberry32 } from './rng';
export * from './data/baseline';
export * from './data/adherence';
export * from './data/tactical-cards';
export * from './data/managers';
export * from './data/trait-templates';
export * from './data/legendaries';
export { ENGINE_CARDS } from './data/cards.gen';
