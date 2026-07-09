/**
 * KC six-contest engine — the canonical 45-role map (CARD_SYSTEM_V2 §3.1, with
 * _CHANGES §6). Role = position × contest × tilt (N natural / S stretch). One
 * source of truth, consumed by the card loader (cards.ts) and the stub squad
 * builder (squad.ts).
 */

import type { Contest, Position } from '../contests';

export interface RoleDef {
  name: string;
  pos: Position;
  contest: Contest;
  tilt: 'N' | 'S';
}

export const ROLES: RoleDef[] = [
  { name: 'Marshal', pos: 'GK', contest: 'STOP', tilt: 'N' },
  { name: 'Sweeper Keeper', pos: 'GK', contest: 'STOP', tilt: 'N' },
  { name: 'Shotstopper', pos: 'GK', contest: 'STOP', tilt: 'N' },
  { name: 'Distributor', pos: 'GK', contest: 'KEEP', tilt: 'S' },
  { name: 'Centrale', pos: 'CD', contest: 'STOP', tilt: 'N' },
  { name: 'Colossus', pos: 'CD', contest: 'STOP', tilt: 'N' },
  { name: 'Progressor', pos: 'CD', contest: 'KEEP', tilt: 'S' },
  { name: 'Sweeper', pos: 'CD', contest: 'BREAK', tilt: 'N' },
  { name: 'Stopper', pos: 'CD', contest: 'PRESS', tilt: 'S' },
  { name: 'Fullback', pos: 'WD', contest: 'STOP', tilt: 'S' },
  { name: 'Auxiliary Centre-Back', pos: 'WD', contest: 'STOP', tilt: 'N' },
  { name: 'Wing-back', pos: 'WD', contest: 'PRESS', tilt: 'S' },
  { name: 'Invertido', pos: 'WD', contest: 'KEEP', tilt: 'S' },
  { name: 'Regista', pos: 'DM', contest: 'CREATE', tilt: 'N' },
  { name: 'Pivote', pos: 'DM', contest: 'KEEP', tilt: 'N' },
  { name: 'Anchor', pos: 'DM', contest: 'BREAK', tilt: 'N' },
  { name: 'Interceptor', pos: 'DM', contest: 'BREAK', tilt: 'N' },
  { name: 'Water-Carrier', pos: 'DM', contest: 'BREAK', tilt: 'S' },
  { name: 'Volante', pos: 'DM', contest: 'BREAK', tilt: 'N' },
  { name: 'Segundo Volante', pos: 'DM', contest: 'CREATE', tilt: 'S' },
  { name: 'Playmaker', pos: 'CM', contest: 'CREATE', tilt: 'N' },
  { name: 'Metodista', pos: 'CM', contest: 'KEEP', tilt: 'N' },
  { name: 'Mediano', pos: 'CM', contest: 'BREAK', tilt: 'N' },
  { name: 'Mezzala', pos: 'CM', contest: 'FINISH', tilt: 'S' },
  { name: 'Tuttocampista', pos: 'CM', contest: 'PRESS', tilt: 'N' },
  { name: 'Ball Winner', pos: 'CM', contest: 'BREAK', tilt: 'N' },
  { name: 'Carrilero', pos: 'CM', contest: 'PRESS', tilt: 'N' },
  { name: 'Touchline Winger', pos: 'WM', contest: 'CREATE', tilt: 'N' },
  { name: 'Tornante', pos: 'WM', contest: 'PRESS', tilt: 'N' },
  { name: 'False Winger', pos: 'WM', contest: 'KEEP', tilt: 'S' },
  { name: 'Wide Cover', pos: 'WM', contest: 'BREAK', tilt: 'N' },
  { name: 'Trequartista', pos: 'AM', contest: 'CREATE', tilt: 'N' },
  { name: 'Enganche', pos: 'AM', contest: 'CREATE', tilt: 'N' },
  { name: 'Incursore', pos: 'AM', contest: 'FINISH', tilt: 'N' },
  { name: 'Mediapunta', pos: 'AM', contest: 'KEEP', tilt: 'N' },
  { name: 'Shadow Striker', pos: 'AM', contest: 'FINISH', tilt: 'N' },
  { name: 'Inverted Winger', pos: 'WF', contest: 'FINISH', tilt: 'N' },
  { name: 'Advanced Winger', pos: 'WF', contest: 'CREATE', tilt: 'N' },
  { name: 'Wide Playmaker', pos: 'WF', contest: 'CREATE', tilt: 'N' },
  { name: 'Wide Target Forward', pos: 'WF', contest: 'FINISH', tilt: 'N' },
  { name: 'Prima Punta', pos: 'CF', contest: 'FINISH', tilt: 'N' },
  { name: 'Falso Nove', pos: 'CF', contest: 'CREATE', tilt: 'S' },
  { name: 'Spearhead', pos: 'CF', contest: 'PRESS', tilt: 'S' },
  { name: 'Target Forward', pos: 'CF', contest: 'KEEP', tilt: 'S' },
  // _CHANGES §6: Seconda Punta moved CREATE→FINISH (CREATE 9 · FINISH 7); the
  // catalogue (data/actions.ts) authors its action in the FINISH pool.
  { name: 'Seconda Punta', pos: 'CF', contest: 'FINISH', tilt: 'S' },
];

export const ROLE_BY_NAME: Record<string, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.name, r]));

export const ROLES_BY_POS: Record<string, RoleDef[]> = ROLES.reduce((acc, r) => {
  (acc[r.pos] ??= []).push(r);
  return acc;
}, {} as Record<string, RoleDef[]>);

export const tiltValue = (t: 'N' | 'S') => (t === 'N' ? 2 : 1);
