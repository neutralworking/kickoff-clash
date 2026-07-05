/**
 * KC rebuild engine — player card anatomy (SYNERGY_MODEL_V1 §5).
 *
 * A card is exactly: a deliberately-mediocre base contribution, 1–2
 * conditional traits stamped from the reviewed template pool (all real value
 * lives here and only pays out under the right regime), and a cluster tag
 * (reserved for the later chemistry phase). Rarity scales conditionality —
 * Commons carry one broad weak trait; Legendaries narrow, violent,
 * build-locked ones.
 *
 * The dataset itself is GENERATED (data/cards.gen.ts, by
 * scripts/regenerate_cards.ts — deterministic, seeded, coverage-validated);
 * this module owns the shapes and the squad→side aggregation the run loop and
 * drafting sim build on.
 */

import type { EngineTrait } from './traits';
import type { ManagerDef } from './data/managers';
import type { SideConfig } from './match';

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

/** Chemistry cluster tags (SM §5 — mechanics arrive in a later phase). */
export type ClusterTag = 'spine' | 'left-flank' | 'right-flank' | 'front-line' | 'bench';

/** A card trait carries its template provenance for QA and the dashboards. */
export type CardTrait = EngineTrait & { templateId: string };

export interface EngineCard {
  id: number;
  name: string;
  position: string; // GK/CD/WD/DM/CM/WM/AM/WF/CF
  rarity: Rarity;
  /** Deliberately mediocre at every rarity — the "incomplete on its own" guarantee. */
  baseContribution: number;
  traits: CardTrait[];
  cluster: ClusterTag;
  // Fiction carried over from the live pool (display-side; no mechanics).
  nation?: string;
  role?: string;
  nickname?: string;
}

/**
 * Aggregate a manager + XI into a match SideConfig: base contributions sum
 * into the squad charge; manager and squad traits pool into one record list
 * (loose coupling — they only meet through the shared context vocabulary).
 */
export function sideFromSquad(
  manager: ManagerDef,
  squad: EngineCard[],
  opts?: { formation?: string; autoCommit?: boolean }
): SideConfig {
  const baseCharge = squad.reduce((acc, c) => acc + c.baseContribution, 0);
  return {
    posture: manager.defaultPosture,
    traits: [...manager.traits, ...squad.flatMap((c) => c.traits)],
    baseCharge,
    engine: manager.engine,
    autoCommit: opts?.autoCommit ?? false,
    formation: opts?.formation ?? manager.preferredFormation,
    preferredFormation: manager.preferredFormation,
  };
}

/** XI legality used by the drafting sim (formation-agnostic v1 floor). */
export function isLegalXI(cards: EngineCard[]): boolean {
  if (cards.length !== 11) return false;
  const count = (positions: string[]) => cards.filter((c) => positions.includes(c.position)).length;
  return (
    count(['GK']) === 1 &&
    count(['CD', 'WD']) >= 3 &&
    count(['DM', 'CM', 'WM', 'AM']) >= 2 &&
    count(['WF', 'CF']) >= 1
  );
}
