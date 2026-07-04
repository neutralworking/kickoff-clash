/**
 * KC rebuild engine — contextual TraitRecords (SYNERGY_MODEL_V1 §5, law 1).
 *
 * An EngineTrait is (verb, context, magnitude): the verb comes from the closed
 * 10-verb palette defined once in src/lib/verbs.ts (law 3 — the palette is
 * shared vocabulary, not re-declared), the context from the closed taxonomy in
 * contexts.ts. There are NO unconditional traits: `context` is required.
 *
 * v1 verb semantics in the windows model (the zonal-field semantics live on in
 * src/lib for the legacy engine; see docs/MIGRATION_NOTES.md):
 *   amplify @ window     → +magnitude charge when resolving that window kind
 *   amplify @ state      → +magnitude charge on ALL window resolutions while active
 *   generate @ state     → +magnitude points banked at each increment while active
 *                          (the accrual hook — Fortress-type engines)
 *   deny @ window        → −magnitude to the OPPONENT's charge on that window kind
 *   amplify-variance     → die ladder step up while context active (both sides' die)
 *   dampen-variance      → die ladder step down while context active
 *   drain-fitness @ ctx  → −magnitude own squad fitness per increment while active
 *   restore-energy /
 *   drain-energy @ ctx   → ±magnitude match energy once per activation edge
 *   relocate             → reserved (posture-weight reshaping arrives with Phase 2
 *                          tactical cards; unused by v1 stub content)
 *   amplify-inverse-power→ reserved (needs real per-card power; Phase 3 dataset)
 */

import type { VerbName } from '../lib/verbs';
import type { TraitContext, ContextSnapshot, WindowKind } from './contexts';
import { stateContextActive } from './contexts';

export interface EngineTrait {
  name: string;
  verb: VerbName;
  context: TraitContext;
  magnitude: number;
}

/** A trait contribution surfaced for the event log (SM §9 trait-proc toasts). */
export interface TraitContribution {
  trait: EngineTrait;
  effect: 'charge' | 'deny' | 'die' | 'accrual' | 'fitness' | 'energy';
  value: number;
}

/**
 * Charge contributed by a side's traits to a window resolution: window-scoped
 * amplifies matching this kind, plus state-scoped amplifies active in the
 * current snapshot (SM §6 "squad charge (relevant traits)").
 */
export function chargeContributions(
  traits: EngineTrait[],
  kind: WindowKind,
  snap: ContextSnapshot
): TraitContribution[] {
  const out: TraitContribution[] = [];
  for (const t of traits) {
    if (t.verb !== 'amplify') continue;
    if (t.context.kind === 'window') {
      if (t.context.window === kind) out.push({ trait: t, effect: 'charge', value: t.magnitude });
    } else if (stateContextActive(t.context, snap)) {
      out.push({ trait: t, effect: 'charge', value: t.magnitude });
    }
  }
  return out;
}

/** Opposing-side deny contributions against a window resolution of `kind`. */
export function denyContributions(
  opposingTraits: EngineTrait[],
  kind: WindowKind,
  opposingSnap: ContextSnapshot
): TraitContribution[] {
  const out: TraitContribution[] = [];
  for (const t of opposingTraits) {
    if (t.verb !== 'deny') continue;
    if (t.context.kind === 'window') {
      if (t.context.window === kind) out.push({ trait: t, effect: 'deny', value: t.magnitude });
    } else if (stateContextActive(t.context, opposingSnap)) {
      out.push({ trait: t, effect: 'deny', value: t.magnitude });
    }
  }
  return out;
}

/**
 * Net die-ladder shift from BOTH sides' variance verbs active this increment
 * (SM §6: variance verbs change the resolution die; Gambler/Pragmatist swing
 * the whole fixture, both directions — one shared die per increment).
 */
export function dieShiftContributions(
  sideTraits: [EngineTrait[], EngineTrait[]],
  snaps: [ContextSnapshot, ContextSnapshot]
): TraitContribution[] {
  const out: TraitContribution[] = [];
  for (let s = 0; s < 2; s++) {
    for (const t of sideTraits[s]) {
      if (t.verb !== 'amplify-variance' && t.verb !== 'dampen-variance') continue;
      if (t.context.kind === 'window' || t.context.kind === 'goal-event' || t.context.kind === 'substitution') continue;
      if (!stateContextActive(t.context, snaps[s])) continue;
      out.push({ trait: t, effect: 'die', value: t.verb === 'amplify-variance' ? 1 : -1 });
    }
  }
  return out;
}

/**
 * Accrual contributions this increment: `generate` traits whose state context
 * is active bank points goallessly (the Fortress hook — SM §6 "clean-sheet
 * accrual banks points"). Window/event-scoped generates are Phase 2+ content.
 */
export function accrualContributions(
  traits: EngineTrait[],
  snap: ContextSnapshot
): TraitContribution[] {
  const out: TraitContribution[] = [];
  for (const t of traits) {
    if (t.verb !== 'generate') continue;
    if (t.context.kind === 'window' || t.context.kind === 'goal-event' || t.context.kind === 'substitution') continue;
    if (!stateContextActive(t.context, snap)) continue;
    out.push({ trait: t, effect: 'accrual', value: t.magnitude });
  }
  return out;
}

/** Per-increment fitness drain from active drain-fitness traits (Taskmaster fuel). */
export function fitnessDrainContributions(
  traits: EngineTrait[],
  snap: ContextSnapshot
): TraitContribution[] {
  const out: TraitContribution[] = [];
  for (const t of traits) {
    if (t.verb !== 'drain-fitness') continue;
    if (t.context.kind === 'window' || t.context.kind === 'goal-event' || t.context.kind === 'substitution') continue;
    if (!stateContextActive(t.context, snap)) continue;
    out.push({ trait: t, effect: 'fitness', value: t.magnitude });
  }
  return out;
}

export const sumContributions = (cs: TraitContribution[]): number =>
  cs.reduce((acc, c) => acc + c.value, 0);
