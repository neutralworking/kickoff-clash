'use client';

import type { Formation } from '@/lib/formations';
import type { V6Card } from '@/lib/match-v6';
import { pitchAxis } from '@/lib/pitch-layout';
import { V6PitchCard } from './V6PitchCard';

const TOKEN_W = 52;
const INSET_X = TOKEN_W / 2 + 6; // keep the full token inside the green
const INSET_Y = 36; // ~half the (taller) token, so it spreads over the full pitch height without spilling

export interface SlotStat {
  attack: number;
  defence: number;
  outOfPosition: boolean;
}

/**
 * A team on a top-down formation pitch — the team-selection look, reused for the
 * live match. Cards sit at their formation slots (`assignSlots` maps active cards
 * onto them, holding the shape across subs). At a break the active side's cards
 * become tap targets for a planned sub.
 */
export function V6FormationPitch(props: {
  formation: Formation;
  slotCards: (V6Card | null)[];
  receipts?: Record<string, SlotStat>;
  mode: 'idle' | 'break';
  selectedId?: string | null; // a bench card is picked → actives become targets
  plannedOutIds?: string[];
  onPick?: (cardId: string) => void;
}) {
  const planned = new Set(props.plannedOutIds ?? []);
  const targeting = props.mode === 'break' && !!props.selectedId;
  return (
    <div className="v6-fpitch">
      <div className="v6-fpitch-mark" aria-hidden />
      {props.formation.slots.map((slot, i) => {
        const card = props.slotCards[i];
        if (!card) return null;
        const st = props.receipts?.[card.id];
        const isPlanned = planned.has(card.id);
        return (
          <div
            key={card.id}
            className="v6-fslot"
            style={{ left: pitchAxis(slot.x, INSET_X), top: pitchAxis(slot.y, INSET_Y), width: TOKEN_W }}
          >
            <V6PitchCard
              card={card}
              attack={st?.attack}
              defence={st?.defence}
              outOfPosition={st?.outOfPosition ?? false}
              target={targeting && !isPlanned}
              dim={isPlanned}
              onClick={targeting && !isPlanned && props.onPick ? () => props.onPick!(card.id) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
