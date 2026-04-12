export interface FormationSlot {
  type: string;   // 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'WM' | 'AM' | 'WF' | 'CF'
  label: string;  // display name e.g. "Centre-Back", "Winger"
  accepts: string[]; // which Card positions can fill this slot
  x: number;      // pitch position 0-100 (left-right)
  y: number;      // pitch position 0-100 (top=attack, bottom=defence)
}

export interface Formation {
  id: string;
  name: string;
  slots: FormationSlot[]; // always 11 (including GK)
  description: string;
  maxAttackers: number;   // soft cap for full-power attack commitment (v5)
}

// Position eligibility rules
const SLOT_ACCEPTS: Record<string, string[]> = {
  GK: ['GK'],
  CB: ['CD'],
  FB: ['WD', 'CD'],
  DM: ['DM', 'CM'],
  CM: ['CM', 'DM', 'AM'],
  WM: ['WM', 'WF', 'WD'],
  AM: ['AM', 'CM', 'WF'],
  WF: ['WF', 'WM', 'AM'],
  CF: ['CF', 'AM', 'WF'],
};

function slot(
  type: string,
  label: string,
  x: number,
  y: number
): FormationSlot {
  return { type, label, accepts: SLOT_ACCEPTS[type] ?? [], x, y };
}

export const ALL_FORMATIONS: Formation[] = [
  // 4-3-3 Wide Attacking
  {
    id: '4-3-3',
    name: '4-3-3',
    description: 'Wide and direct. Wingers stretch defences while a lone striker finishes.',
    maxAttackers: 5,
    slots: [
      slot('GK', 'Goalkeeper',   50, 92),
      slot('FB', 'Left Back',    10, 78),
      slot('CB', 'Centre-Back',  35, 78),
      slot('CB', 'Centre-Back',  65, 78),
      slot('FB', 'Right Back',   90, 78),
      slot('DM', 'Defensive Mid',50, 58),
      slot('CM', 'Central Mid',  30, 48),
      slot('CM', 'Central Mid',  70, 48),
      slot('WF', 'Left Wing',    12, 22),
      slot('CF', 'Striker',      50, 12),
      slot('WF', 'Right Wing',   88, 22),
    ],
  },

  // 4-4-2 Classic Balanced
  {
    id: '4-4-2',
    name: '4-4-2',
    description: 'The classic. Two banks of four with a strike partnership up top.',
    maxAttackers: 4,
    slots: [
      slot('GK', 'Goalkeeper',   50, 92),
      slot('FB', 'Left Back',    10, 78),
      slot('CB', 'Centre-Back',  35, 78),
      slot('CB', 'Centre-Back',  65, 78),
      slot('FB', 'Right Back',   90, 78),
      slot('WM', 'Left Mid',     10, 55),
      slot('CM', 'Central Mid',  35, 52),
      slot('CM', 'Central Mid',  65, 52),
      slot('WM', 'Right Mid',    90, 55),
      slot('CF', 'Striker',      35, 18),
      slot('CF', 'Striker',      65, 18),
    ],
  },

  // 3-5-2 Midfield Overload
  {
    id: '3-5-2',
    name: '3-5-2',
    description: 'Midfield dominance through numbers. Wing-mids cover the flanks.',
    maxAttackers: 5,
    slots: [
      slot('GK', 'Goalkeeper',   50, 92),
      slot('CB', 'Centre-Back',  25, 78),
      slot('CB', 'Centre-Back',  50, 78),
      slot('CB', 'Centre-Back',  75, 78),
      slot('WM', 'Left Wing-Mid', 8, 58),
      slot('CM', 'Central Mid',  30, 52),
      slot('CM', 'Central Mid',  50, 48),
      slot('CM', 'Central Mid',  70, 52),
      slot('WM', 'Right Wing-Mid',92, 58),
      slot('CF', 'Striker',      35, 18),
      slot('CF', 'Striker',      65, 18),
    ],
  },

  // 4-2-3-1 Modern Control
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    description: 'Press-resistant structure. Double pivot shields a creative #10 and wide attackers.',
    maxAttackers: 5,
    slots: [
      slot('GK', 'Goalkeeper',   50, 92),
      slot('FB', 'Left Back',    10, 78),
      slot('CB', 'Centre-Back',  35, 78),
      slot('CB', 'Centre-Back',  65, 78),
      slot('FB', 'Right Back',   90, 78),
      slot('DM', 'Defensive Mid',35, 62),
      slot('DM', 'Defensive Mid',65, 62),
      slot('WF', 'Left Att Mid', 15, 38),
      slot('AM', 'Attacking Mid',50, 35),
      slot('WF', 'Right Att Mid',85, 38),
      slot('CF', 'Striker',      50, 12),
    ],
  },

  // 3-4-3 All-Out Attack
  {
    id: '3-4-3',
    name: '3-4-3',
    description: 'Maximum attacking intent. Three up front supported by energetic wing-mids.',
    maxAttackers: 6,
    slots: [
      slot('GK', 'Goalkeeper',   50, 92),
      slot('CB', 'Centre-Back',  25, 78),
      slot('CB', 'Centre-Back',  50, 78),
      slot('CB', 'Centre-Back',  75, 78),
      slot('WM', 'Left Wing-Mid', 8, 58),
      slot('CM', 'Central Mid',  35, 55),
      slot('CM', 'Central Mid',  65, 55),
      slot('WM', 'Right Wing-Mid',92, 58),
      slot('WF', 'Left Wing',    12, 22),
      slot('CF', 'Striker',      50, 12),
      slot('WF', 'Right Wing',   88, 22),
    ],
  },

  // 5-3-2 Defensive Fortress
  {
    id: '5-3-2',
    name: '5-3-2',
    description: 'Compact and resolute. Five at the back with wing-backs providing width on the break.',
    maxAttackers: 3,
    slots: [
      slot('GK', 'Goalkeeper',   50, 92),
      slot('FB', 'Left Wing-Back', 8, 70),
      slot('CB', 'Centre-Back',  28, 80),
      slot('CB', 'Centre-Back',  50, 82),
      slot('CB', 'Centre-Back',  72, 80),
      slot('FB', 'Right Wing-Back',92, 70),
      slot('CM', 'Central Mid',  28, 55),
      slot('CM', 'Central Mid',  50, 50),
      slot('CM', 'Central Mid',  72, 55),
      slot('CF', 'Striker',      35, 18),
      slot('CF', 'Striker',      65, 18),
    ],
  },

  // 5-4-1 Ultra Defensive
  {
    id: '5-4-1',
    name: '5-4-1',
    description: 'Ultra defensive. Packed defence and midfield with a lone striker outlet.',
    maxAttackers: 3,
    slots: [
      slot('GK', 'Goalkeeper',      50, 92),
      slot('FB', 'Left Wing-Back',   8, 70),
      slot('CB', 'Centre-Back',     28, 80),
      slot('CB', 'Centre-Back',     50, 82),
      slot('CB', 'Centre-Back',     72, 80),
      slot('FB', 'Right Wing-Back', 92, 70),
      slot('WM', 'Left Mid',        10, 55),
      slot('CM', 'Central Mid',     35, 52),
      slot('CM', 'Central Mid',     65, 52),
      slot('WM', 'Right Mid',       90, 55),
      slot('CF', 'Striker',         50, 15),
    ],
  },

  // 4-1-2-1-2 Diamond
  {
    id: '4-1-2-1-2',
    name: '4-1-2-1-2',
    description: 'Narrow diamond midfield. Central overload with a strike partnership.',
    maxAttackers: 5,
    slots: [
      slot('GK', 'Goalkeeper',    50, 92),
      slot('FB', 'Left Back',     10, 78),
      slot('CB', 'Centre-Back',   35, 78),
      slot('CB', 'Centre-Back',   65, 78),
      slot('FB', 'Right Back',    90, 78),
      slot('DM', 'Defensive Mid', 50, 62),
      slot('CM', 'Central Mid',   30, 48),
      slot('CM', 'Central Mid',   70, 48),
      slot('AM', 'Attacking Mid', 50, 35),
      slot('CF', 'Striker',       35, 18),
      slot('CF', 'Striker',       65, 18),
    ],
  },
];

export function getFormation(id: string): Formation {
  return ALL_FORMATIONS.find((f) => f.id === id) ?? getDefaultFormation();
}

export function getDefaultFormation(): Formation {
  return ALL_FORMATIONS[0]; // 4-3-3
}

export function positionFitsSlot(
  cardPosition: string,
  slotDef: FormationSlot
): boolean {
  return slotDef.accepts.includes(cardPosition);
}
