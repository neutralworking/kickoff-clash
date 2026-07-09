/**
 * KC six-contest engine (NW-141) — the action catalogue (CARD_ACTIONS_V1).
 *
 * The Fork A "trait template pool": one action per role (45), each a
 * (verb → target, gated) tuple over the shared verb palette (src/lib/verbs.ts),
 * re-pointed at contest dials / the chance pipeline / positional slots. Tiers
 * (Common→Rare→Epic→Legendary) grow the magnitude only; a Legendary MAY carry a
 * rider (hand-authored — NW-146; the LEGENDARIES merge hook below is an empty
 * stub until that lands).
 *
 * Dual-axis (design law 5, executable): each pool carries BOTH an amplification
 * role (raise the ceiling) and a consistency role (a floor — dampen-variance /
 * restore-energy / a guaranteed generate). Coverage validation
 * (scripts/kc_v2_regenerate.ts) asserts both axes per pool.
 */

import type { Contest } from '../contests';
import type { EngineTrait, TraitTarget, Trigger } from '../traits';
import type { Gate } from '../gates';
import type { VerbName } from '../../lib/verbs';

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export const RARITIES: readonly Rarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];
const tierIndex = (r: Rarity) => RARITIES.indexOf(r);

export type Axis = 'amplify' | 'consistency';

export interface ActionDef {
  role: string;
  action: string;
  verb: VerbName;
  trigger: Trigger;
  target: TraitTarget;
  gate: Gate;
  axis: Axis;
  /** ★ the pool's build-around. */
  buildAround?: boolean;
  /** Magnitude by rarity tier [Common, Rare, Epic, Legendary]. */
  tiers: [number, number, number, number];
}

const perTilt = (c: Contest): Gate => ({ kind: 'per-tilt', contest: c });
const AMP: [number, number, number, number] = [2, 3, 4, 5];
const DENY: [number, number, number, number] = [1, 2, 2, 3];
const GEN: [number, number, number, number] = [1, 1, 2, 2];
const VAR: [number, number, number, number] = [1, 1, 1, 1];
const XG: [number, number, number, number] = [1, 2, 3, 4];

/** All 45 role-actions, keyed by role (CARD_ACTIONS_V1 §5). */
export const CATALOGUE: Record<string, ActionDef> = {
  // ---- KEEP — Possession (8) ----
  Metodista: { role: 'Metodista', action: 'Metronome', verb: 'amplify', trigger: 'continuous', target: { kind: 'own-dial', contest: 'KEEP' }, gate: perTilt('KEEP'), axis: 'amplify', buildAround: true, tiers: AMP },
  Pivote: { role: 'Pivote', action: 'Resist Press', verb: 'dampen-variance', trigger: 'on-retain', target: { kind: 'retain' }, gate: perTilt('KEEP'), axis: 'consistency', tiers: VAR },
  Distributor: { role: 'Distributor', action: 'Play Short', verb: 'generate', trigger: 'on-retain', target: { kind: 'chance', op: 'volume' }, gate: { kind: 'match-state', on: 'retain-survived' }, axis: 'amplify', tiers: GEN },
  Progressor: { role: 'Progressor', action: 'Bring Out', verb: 'deny', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'PRESS' }, gate: perTilt('KEEP'), axis: 'amplify', tiers: DENY },
  Invertido: { role: 'Invertido', action: 'Invert', verb: 'amplify', trigger: 'on-retain', target: { kind: 'retain' }, gate: { kind: 'per-pos-count', anyOf: ['DM', 'CM'] }, axis: 'amplify', tiers: VAR },
  'False Winger': { role: 'False Winger', action: 'Drift', verb: 'amplify', trigger: 'continuous', target: { kind: 'own-dial', contest: 'KEEP' }, gate: perTilt('KEEP'), axis: 'amplify', tiers: [1, 2, 2, 3] },
  Mediapunta: { role: 'Mediapunta', action: 'Link', verb: 'generate', trigger: 'on-retain', target: { kind: 'chance', op: 'volume' }, gate: perTilt('KEEP'), axis: 'amplify', tiers: GEN },
  'Target Forward': { role: 'Target Forward', action: 'Hold-Up', verb: 'dampen-variance', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('KEEP'), axis: 'consistency', tiers: VAR },

  // ---- PRESS — Gegenpress (6) ----
  Tuttocampista: { role: 'Tuttocampista', action: 'All-Action', verb: 'deny', trigger: 'continuous', target: { kind: 'retain' }, gate: perTilt('PRESS'), axis: 'amplify', buildAround: true, tiers: DENY },
  Stopper: { role: 'Stopper', action: 'Step-Out', verb: 'amplify-inverse-power', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'CREATE' }, gate: perTilt('PRESS'), axis: 'amplify', tiers: DENY },
  'Wing-back': { role: 'Wing-back', action: 'Pin', verb: 'deny', trigger: 'continuous', target: { kind: 'positional', ref: 'opposite', axis: 'att' }, gate: perTilt('PRESS'), axis: 'amplify', tiers: DENY },
  Carrilero: { role: 'Carrilero', action: 'Shuttle', verb: 'restore-energy', trigger: 'per-period', target: { kind: 'energy' }, gate: perTilt('PRESS'), axis: 'consistency', tiers: GEN },
  Tornante: { role: 'Tornante', action: 'Drop', verb: 'amplify', trigger: 'continuous', target: { kind: 'positional', ref: 'behind', axis: 'def' }, gate: perTilt('PRESS'), axis: 'amplify', tiers: AMP },
  Spearhead: { role: 'Spearhead', action: 'Lead Line', verb: 'deny', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'KEEP' }, gate: perTilt('PRESS'), axis: 'amplify', tiers: DENY },

  // ---- CREATE — Joga Bonito (9) ----
  Trequartista: { role: 'Trequartista', action: 'Joga Bonito', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'volume' }, gate: perTilt('CREATE'), axis: 'amplify', buildAround: true, tiers: AMP },
  Regista: { role: 'Regista', action: 'Quarterback', verb: 'generate', trigger: 'per-period', target: { kind: 'chance', op: 'volume' }, gate: { kind: 'not-posture', is: 'attack' }, axis: 'consistency', tiers: GEN },
  'Segundo Volante': { role: 'Segundo Volante', action: 'Drive', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'volume' }, gate: { kind: 'posture', is: 'attack' }, axis: 'amplify', tiers: AMP },
  Playmaker: { role: 'Playmaker', action: 'Thread', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'quality' }, gate: perTilt('CREATE'), axis: 'amplify', tiers: XG },
  'Touchline Winger': { role: 'Touchline Winger', action: 'Whip-In', verb: 'generate', trigger: 'continuous', target: { kind: 'chance', op: 'volume' }, gate: { kind: 'per-pos-count', anyOf: ['WF', 'CF', 'AM'] }, axis: 'amplify', tiers: GEN },
  Enganche: { role: 'Enganche', action: 'Create Space', verb: 'deny', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'BREAK' }, gate: perTilt('CREATE'), axis: 'amplify', tiers: DENY },
  'Advanced Winger': { role: 'Advanced Winger', action: 'Outlet', verb: 'generate', trigger: 'per-period', target: { kind: 'set-piece', op: 'prob' }, gate: perTilt('CREATE'), axis: 'amplify', tiers: GEN },
  'Wide Playmaker': { role: 'Wide Playmaker', action: 'Deliverer', verb: 'amplify', trigger: 'per-period', target: { kind: 'set-piece', op: 'conversion' }, gate: perTilt('CREATE'), axis: 'amplify', tiers: AMP },
  'Falso Nove': { role: 'Falso Nove', action: 'Drop Deep', verb: 'amplify', trigger: 'continuous', target: { kind: 'positional', ref: 'in-front', axis: 'att' }, gate: perTilt('CREATE'), axis: 'amplify', tiers: AMP },

  // ---- BREAK — Counter (8) ----
  'Ball Winner': { role: 'Ball Winner', action: 'Destroy', verb: 'deny', trigger: 'on-turnover', target: { kind: 'chance', op: 'volume' }, gate: perTilt('BREAK'), axis: 'amplify', buildAround: true, tiers: DENY },
  Sweeper: { role: 'Sweeper', action: 'Sweep', verb: 'dampen-variance', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('BREAK'), axis: 'consistency', tiers: VAR },
  Anchor: { role: 'Anchor', action: 'Shield', verb: 'amplify', trigger: 'continuous', target: { kind: 'positional', ref: 'behind', axis: 'def' }, gate: perTilt('BREAK'), axis: 'amplify', tiers: AMP },
  Interceptor: { role: 'Interceptor', action: 'Telegraph', verb: 'deny', trigger: 'continuous', target: { kind: 'chance', op: 'volume' }, gate: perTilt('BREAK'), axis: 'amplify', tiers: DENY },
  'Water-Carrier': { role: 'Water-Carrier', action: 'Support', verb: 'restore-energy', trigger: 'per-period', target: { kind: 'energy' }, gate: perTilt('BREAK'), axis: 'consistency', tiers: GEN },
  Volante: { role: 'Volante', action: 'Surge', verb: 'generate', trigger: 'on-turnover', target: { kind: 'chance', op: 'volume' }, gate: { kind: 'match-state', on: 'turnover' }, axis: 'amplify', tiers: GEN },
  Mediano: { role: 'Mediano', action: 'Stifle', verb: 'deny', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'CREATE' }, gate: perTilt('BREAK'), axis: 'amplify', tiers: DENY },
  'Wide Cover': { role: 'Wide Cover', action: 'Track-Back', verb: 'amplify', trigger: 'continuous', target: { kind: 'positional', ref: 'behind', axis: 'def' }, gate: perTilt('BREAK'), axis: 'amplify', tiers: AMP },

  // ---- FINISH — Clinical (7) ----
  'Prima Punta': { role: 'Prima Punta', action: 'Assassin', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('FINISH'), axis: 'amplify', buildAround: true, tiers: XG },
  Mezzala: { role: 'Mezzala', action: 'Snapshot', verb: 'dampen-variance', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('FINISH'), axis: 'consistency', tiers: VAR },
  Incursore: { role: 'Incursore', action: 'Late Arrival', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('CREATE'), axis: 'amplify', tiers: XG },
  'Shadow Striker': { role: 'Shadow Striker', action: 'Ghost', verb: 'amplify-variance', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('FINISH'), axis: 'amplify', tiers: VAR },
  'Inverted Winger': { role: 'Inverted Winger', action: 'Cut In', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: { kind: 'per-pos-count', anyOf: ['WF', 'WM', 'WD'] }, axis: 'amplify', tiers: XG },
  'Wide Target Forward': { role: 'Wide Target Forward', action: 'Post Up', verb: 'generate', trigger: 'per-period', target: { kind: 'set-piece', op: 'conversion' }, gate: perTilt('FINISH'), axis: 'amplify', tiers: GEN },
  'Seconda Punta': { role: 'Seconda Punta', action: 'Interplay', verb: 'amplify', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: { kind: 'per-pos-count', anyOf: ['CF', 'WF', 'AM'] }, axis: 'amplify', tiers: XG },

  // ---- STOP — Catenaccio (7) ----
  Centrale: { role: 'Centrale', action: 'Skipper', verb: 'amplify', trigger: 'continuous', target: { kind: 'own-dial', contest: 'STOP' }, gate: perTilt('STOP'), axis: 'amplify', buildAround: true, tiers: AMP },
  Marshal: { role: 'Marshal', action: 'Command', verb: 'deny', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'FINISH' }, gate: perTilt('STOP'), axis: 'amplify', tiers: DENY },
  'Sweeper Keeper': { role: 'Sweeper Keeper', action: 'Rush Out', verb: 'deny', trigger: 'continuous', target: { kind: 'opp-dial', contest: 'CREATE' }, gate: perTilt('STOP'), axis: 'amplify', tiers: DENY },
  Shotstopper: { role: 'Shotstopper', action: 'Safe Hands', verb: 'deny', trigger: 'continuous', target: { kind: 'chance', op: 'volume' }, gate: perTilt('STOP'), axis: 'consistency', tiers: DENY },
  Colossus: { role: 'Colossus', action: 'Titan', verb: 'amplify', trigger: 'per-period', target: { kind: 'set-piece', op: 'conversion' }, gate: perTilt('STOP'), axis: 'amplify', tiers: AMP },
  Fullback: { role: 'Fullback', action: 'Overlap', verb: 'amplify', trigger: 'continuous', target: { kind: 'positional', ref: 'in-front', axis: 'att' }, gate: perTilt('STOP'), axis: 'amplify', tiers: AMP },
  'Auxiliary Centre-Back': { role: 'Auxiliary Centre-Back', action: 'Tuck In', verb: 'dampen-variance', trigger: 'continuous', target: { kind: 'chance', op: 'xg' }, gate: perTilt('STOP'), axis: 'consistency', tiers: VAR },
};

/**
 * Legendary rider hook (NW-146). A hand-authored Legendaries file merges over
 * the generated set — bespoke second clauses on ≤1 rider-bearing action per
 * pool. Empty until NW-146 lands; `actionFor` merges any override by role.
 */
export const LEGENDARIES: Record<string, Partial<ActionDef>> = {};

/** Build a card's action EngineTrait for its role at its rarity tier. */
export function actionFor(role: string, rarity: Rarity): EngineTrait | null {
  const base = CATALOGUE[role];
  if (!base) return null;
  const def = rarity === 'Legendary' && LEGENDARIES[role] ? { ...base, ...LEGENDARIES[role] } : base;
  return {
    name: def.action ?? base.action,
    verb: def.verb ?? base.verb,
    trigger: def.trigger ?? base.trigger,
    target: def.target ?? base.target,
    magnitude: (def.tiers ?? base.tiers)[tierIndex(rarity)],
    gate: def.gate ?? base.gate,
  };
}

export const ALL_ACTION_ROLES = Object.keys(CATALOGUE);
