import type { MatchReceiptEvent, PeriodNumber, Sector, TeamSide } from '@/engine-v7';

// ── Broadcast presentation model ─────────────────────────────────────────────
//
// The engine emits a flat, authoritative stream of low-level receipts. That
// stream is perfect for an audit log and terrible for a broadcast: it is one
// row per micro-event, out of any human rhythm, and it exposes internals. This
// layer is the *presentation grammar* that sits between the receipt stream and
// the match stage.
//
// `buildBeats` groups the ordered receipts into ordered, human-readable BEATS —
// one meaningful thing at a time — WITHOUT ever inventing gameplay. Every beat
// is derived from real receipts (its `sourceReceiptIds`), the running score is
// carried forward on the beats where it changes (so the UI updates the score at
// the goal beat and nowhere else), and a couple of receipts fold into one beat
// where that improves comprehension:
//   • a roll and its rerolls are one RollBeat (the rerolls read as a
//     continuation of the same chance, never a fresh event);
//   • a goal + its attribution are one GoalBeat carrying the scorer and the
//     causal path (sector chance → roll → goal — scorer).
//
// The grouping is a pure function of the receipts (plus a name lookup and the
// player's submitted plan, for the "your change / your action" callouts). It is
// deterministic: the same receipts always produce the same beats, so a replay
// produces an identical beat stream.

export type BeatKind =
  | 'kickoff'
  | 'action'
  | 'formation'
  | 'substitution'
  | 'movement'
  | 'effect'
  | 'chance'
  | 'roll'
  | 'goal'
  | 'miss'
  | 'fizzle'
  | 'period_end'
  | 'priority'
  | 'full_time'
  | 'info';

export type BeatEmphasis = 'low' | 'normal' | 'high';

/** A player-submitted callout tag: this beat is a consequence of the user's plan. */
export interface BeatCallout {
  kind: 'change' | 'action';
  label: string;
  text: string;
}

export interface BroadcastBeat {
  /** Stable, deterministic id (derived from the source receipt ids). */
  id: string;
  kind: BeatKind;
  period: PeriodNumber;
  side?: TeamSide;
  sector?: Sector;
  /** Primary player / card / action the beat is about. */
  sourceId?: string;
  targetIds?: string[];
  actionName?: string;
  /** The headline line, e.g. "GOAL", "HIGH PRESS", "MISS". */
  title: string;
  /** Supporting text under the headline. */
  detail?: string;
  emphasis: BeatEmphasis;
  /** Every engine receipt this beat was built from (grouping keeps them all). */
  sourceReceiptIds: string[];
  /** Presentation-only pacing hint, in milliseconds. Never gameplay state. */
  durationHint: number;
  /** The score AFTER this beat, present only on beats that change or confirm it. */
  score?: { player: number; opponent: number };
  /** A short causal chain shown on goals ("Centre chance", "Roll 6", "Goal — Malik"). */
  causalPath?: string[];
  /** Set when the beat is a direct consequence of the player's submitted plan. */
  callout?: BeatCallout;
  /** Beat-specific extras (roll values, threshold, sub card ids, …). Serializable. */
  data: Record<string, unknown>;
}

const SECTOR_LABEL: Record<Sector, string> = { left: 'Left', centre: 'Centre', right: 'Right' };
const sectorOf = (r: MatchReceiptEvent): Sector | undefined =>
  typeof r.data.sector === 'string' ? (r.data.sector as Sector) : undefined;
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const DURATION: Record<BeatKind, number> = {
  kickoff: 1600,
  action: 1500,
  formation: 1400,
  substitution: 1600,
  movement: 1200,
  effect: 1100,
  chance: 1600,
  roll: 1300,
  goal: 2600,
  miss: 1100,
  fizzle: 1400,
  period_end: 2000,
  priority: 1200,
  full_time: 3200,
  info: 900,
};

export interface BuildBeatsOptions {
  /** The score entering this batch of receipts (goals accumulate from here). */
  startScore?: { player: number; opponent: number };
  /** Resolve a card id to a short display name; defaults to the id itself. */
  nameOf?: (cardId: string) => string;
  /** Card ids the player just substituted ON — their sub beats get a callout. */
  playerIncomingCardIds?: readonly string[];
  /** Card ids whose actions the player just activated — those beats get a callout. */
  playerActionSourceIds?: readonly string[];
}

export interface BuiltBeats {
  beats: BroadcastBeat[];
  /** The score after the last beat — feed it back in as the next batch's start. */
  endScore: { player: number; opponent: number };
}

interface PendingOff {
  cardId: string;
  side: TeamSide;
  receiptId: string;
}

/**
 * Group an ordered receipt stream into ordered broadcast beats. Pure and
 * deterministic. Receipt order is preserved as beat order; grouped beats keep
 * every source receipt id; the score is only stamped where a goal changes it
 * (or a boundary confirms it).
 */
export function buildBeats(
  receipts: readonly MatchReceiptEvent[],
  options: BuildBeatsOptions = {},
): BuiltBeats {
  const nameOf = options.nameOf ?? ((id: string) => id);
  const incoming = new Set(options.playerIncomingCardIds ?? []);
  const actionSources = new Set(options.playerActionSourceIds ?? []);
  const score = { ...(options.startScore ?? { player: 0, opponent: 0 }) };

  const beats: BroadcastBeat[] = [];
  const pendingOffs: PendingOff[] = [];

  const push = (beat: Omit<BroadcastBeat, 'durationHint'> & { durationHint?: number }): BroadcastBeat => {
    const full: BroadcastBeat = { durationHint: DURATION[beat.kind], ...beat };
    beats.push(full);
    return full;
  };

  for (let i = 0; i < receipts.length; i += 1) {
    const r = receipts[i]!;
    const base = {
      id: r.id,
      period: r.period,
      ...(r.side ? { side: r.side } : {}),
      sourceReceiptIds: [r.id],
      data: {} as Record<string, unknown>,
    };

    switch (r.eventType) {
      case 'kickoff': {
        push({ ...base, kind: 'kickoff', title: 'Kick-off', detail: r.message, emphasis: 'normal', data: { ...r.data } });
        break;
      }

      case 'chance_created': {
        const count = num(r.data.count);
        const bySector = {
          left: num(r.data.left),
          centre: num(r.data.centre),
          right: num(r.data.right),
        };
        push({
          ...base,
          kind: 'chance',
          title: count === 1 ? '1 chance created' : `${count} chances created`,
          detail: `L${bySector.left} · C${bySector.centre} · R${bySector.right}`,
          emphasis: count > 0 ? 'normal' : 'low',
          data: { count, bySector, ...r.data },
        });
        break;
      }

      case 'chance_cancelled': {
        const sector = sectorOf(r);
        push({
          ...base,
          kind: 'chance',
          ...(sector ? { sector } : {}),
          title: 'Chance snuffed out',
          detail: sector ? `The ${SECTOR_LABEL[sector].toLowerCase()} chance was cancelled.` : r.message,
          emphasis: 'normal',
          data: { cancelled: true, ...r.data },
        });
        break;
      }

      case 'chance_roll': {
        const sector = sectorOf(r);
        const rolls = Array.isArray(r.data.rolls) ? (r.data.rolls as number[]) : [];
        const finalRoll = num(r.data.finalRoll);
        const threshold = num(r.data.threshold, 6);
        const rerollsUsed = num(r.data.rerollsUsed);
        const scored = r.data.scored === true;
        push({
          ...base,
          kind: 'roll',
          ...(sector ? { sector } : {}),
          title: `Rolled ${finalRoll}`,
          detail: rerollsUsed > 0 ? `${rolls.join(' → ')} · needs ${threshold}` : `needs ${threshold}`,
          emphasis: scored ? 'high' : 'normal',
          durationHint: DURATION.roll + rerollsUsed * 400,
          data: { rolls, finalRoll, threshold, rerollsUsed, scored, ...(sector ? { sector } : {}) },
        });
        break;
      }

      case 'chance_missed': {
        const sector = sectorOf(r);
        push({
          ...base,
          kind: 'miss',
          ...(sector ? { sector } : {}),
          title: 'Missed',
          detail: `${num(r.data.finalRoll)} < ${num(r.data.threshold, 6)}`,
          emphasis: 'normal',
          data: { ...r.data },
        });
        break;
      }

      case 'goal_scored': {
        const sector = sectorOf(r);
        const scoringSide = r.side ?? 'player';
        score[scoringSide] += 1;
        const sourceIds = [r.id];
        // Fold the following attribution receipt into the same goal beat.
        let scorerId = str(r.data.scorerId);
        const next = receipts[i + 1];
        if (next && (next.eventType === 'attribution' || next.eventType === 'attribution_fizzled')) {
          sourceIds.push(next.id);
          scorerId = str(next.data.scorerId) ?? scorerId;
          i += 1;
        }
        const scorerName = scorerId ? nameOf(scorerId) : undefined;
        const causalPath = [
          sector ? `${SECTOR_LABEL[sector]} chance` : 'Chance',
          `Roll ${num(r.data.finalRoll)}`,
          scorerName ? `Goal — ${scorerName}` : 'Goal',
        ];
        push({
          ...base,
          kind: 'goal',
          ...(sector ? { sector } : {}),
          ...(scorerId ? { sourceId: scorerId } : {}),
          title: 'GOAL',
          detail: scorerName ? `${scorerName} scores.` : 'Unattributed goal.',
          emphasis: 'high',
          sourceReceiptIds: sourceIds,
          score: { ...score },
          causalPath,
          data: { scoringSide, scorerId, ...r.data },
        });
        break;
      }

      case 'attribution':
      case 'attribution_fizzled': {
        // Normally folded into the preceding goal beat; only reaches here if it
        // appears without an immediately-preceding goal_scored (defensive).
        push({ ...base, kind: 'info', title: 'Goal detail', detail: r.message, emphasis: 'low', data: { ...r.data } });
        break;
      }

      case 'action_activated': {
        const cardId = r.sourceId;
        const beat = push({
          ...base,
          kind: 'action',
          ...(cardId ? { sourceId: cardId } : {}),
          ...(r.actionName ? { actionName: r.actionName } : {}),
          ...(Array.isArray(r.targetIds) ? { targetIds: r.targetIds } : {}),
          title: (r.actionName ?? 'Action').toUpperCase(),
          detail: cardId ? `${nameOf(cardId)} activates ${r.actionName ?? 'an action'}.` : r.message,
          emphasis: 'normal',
          data: { ...r.data },
        });
        if (cardId && actionSources.has(cardId)) {
          beat.callout = { kind: 'action', label: 'YOUR ACTION', text: `${r.actionName ?? 'Your action'} activated.` };
        }
        break;
      }

      case 'action_fizzled':
      case 'action_blocked': {
        const reason = str(r.data.reason) ?? 'no effect';
        push({
          ...base,
          kind: 'fizzle',
          ...(r.sourceId ? { sourceId: r.sourceId } : {}),
          ...(r.actionName ? { actionName: r.actionName } : {}),
          title: 'ACTION FAILED',
          detail: `${r.actionName ?? 'Action'} — ${reason.replace(/_/g, ' ')}.`,
          emphasis: 'normal',
          data: { ...r.data },
        });
        break;
      }

      case 'game_start_applied':
      case 'ongoing_applied': {
        push({
          ...base,
          kind: 'effect',
          ...(r.sourceId ? { sourceId: r.sourceId } : {}),
          ...(r.actionName ? { actionName: r.actionName } : {}),
          ...(Array.isArray(r.targetIds) ? { targetIds: r.targetIds } : {}),
          title: r.actionName ?? 'Effect',
          detail: r.message,
          emphasis: 'low',
          data: { ...r.data },
        });
        break;
      }

      case 'formation_switch': {
        push({
          ...base,
          kind: 'formation',
          title: 'Formation change',
          detail: r.message,
          emphasis: 'normal',
          data: { ...r.data },
        });
        break;
      }

      case 'substitution_off': {
        pendingOffs.push({ cardId: r.sourceId ?? '', side: r.side ?? 'player', receiptId: r.id });
        break;
      }

      case 'substitution_on': {
        const inCardId = r.sourceId ?? '';
        const side = r.side ?? 'player';
        const offIndex = pendingOffs.findIndex((entry) => entry.side === side);
        const off = offIndex >= 0 ? pendingOffs.splice(offIndex, 1)[0] : undefined;
        const slotKey = str(r.data.slotKey);
        const sector = sectorOf(r);
        const inName = nameOf(inCardId);
        const outName = off ? nameOf(off.cardId) : undefined;
        const beat = push({
          id: off ? `${off.receiptId}+${r.id}` : r.id,
          kind: 'substitution',
          period: r.period,
          side,
          ...(sector ? { sector } : {}),
          sourceId: inCardId,
          title: 'Substitution',
          detail: outName ? `${outName} off, ${inName} on.` : `${inName} on.`,
          emphasis: 'normal',
          sourceReceiptIds: off ? [off.receiptId, r.id] : [r.id],
          data: {
            side,
            inCardId,
            ...(off ? { outCardId: off.cardId } : {}),
            ...(slotKey ? { slotKey } : {}),
            ...(sector ? { sector } : {}),
            inName,
            ...(outName ? { outName } : {}),
          },
        });
        if (incoming.has(inCardId)) {
          beat.callout = { kind: 'change', label: 'YOUR CHANGE', text: outName ? `${inName} came on for ${outName}.` : `${inName} came on.` };
        }
        break;
      }

      case 'movement': {
        const sector = sectorOf(r);
        const cardId = r.sourceId ?? '';
        push({
          ...base,
          kind: 'movement',
          ...(sector ? { sector } : {}),
          sourceId: cardId,
          title: 'Player moves',
          detail: sector ? `${nameOf(cardId)} shifts to the ${SECTOR_LABEL[sector].toLowerCase()}.` : r.message,
          emphasis: 'low',
          data: { cardId, ...r.data },
        });
        break;
      }

      case 'period_end': {
        const matchOver = r.data.matchOver === true;
        score.player = num(r.data.playerScore, score.player);
        score.opponent = num(r.data.opponentScore, score.opponent);
        push({
          ...base,
          kind: 'period_end',
          title: matchOver ? 'Full time' : `End of period ${r.period}`,
          detail: `${score.player}–${score.opponent}`,
          emphasis: 'normal',
          score: { ...score },
          data: { matchOver, ...r.data },
        });
        break;
      }

      case 'priority_set': {
        const priority = str(r.data.priority) ?? r.side ?? 'player';
        push({
          ...base,
          kind: 'priority',
          side: priority as TeamSide,
          title: 'Priority',
          detail: `${priority} reveal first at the next break.`,
          emphasis: 'low',
          data: { priority, ...r.data },
        });
        break;
      }

      case 'full_time': {
        score.player = num(r.data.playerScore, score.player);
        score.opponent = num(r.data.opponentScore, score.opponent);
        push({
          ...base,
          kind: 'full_time',
          title: str(r.data.result) ?? 'Full time',
          detail: `${score.player}–${score.opponent}`,
          emphasis: 'high',
          score: { ...score },
          data: { ...r.data },
        });
        break;
      }

      case 'effect_expired':
      case 'ongoing_inactive':
      case 'ongoing_suppressed':
      default: {
        push({
          ...base,
          kind: 'info',
          ...(r.sourceId ? { sourceId: r.sourceId } : {}),
          ...(r.actionName ? { actionName: r.actionName } : {}),
          title: r.actionName ?? 'Update',
          detail: r.message,
          emphasis: 'low',
          data: { eventType: r.eventType, ...r.data },
        });
        break;
      }
    }
  }

  // Flush any substitution-off that never found an on (e.g. a straight removal).
  for (const off of pendingOffs) {
    beats.push({
      id: off.receiptId,
      kind: 'substitution',
      period: beats[beats.length - 1]?.period ?? 1,
      side: off.side,
      sourceId: off.cardId,
      title: 'Substitution',
      detail: `${nameOf(off.cardId)} off.`,
      emphasis: 'normal',
      sourceReceiptIds: [off.receiptId],
      durationHint: DURATION.substitution,
      data: { side: off.side, outCardId: off.cardId, outName: nameOf(off.cardId) },
    });
  }

  return { beats, endScore: score };
}
