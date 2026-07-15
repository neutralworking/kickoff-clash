'use client';

/**
 * Kickoff Clash — CONTEST BREAKDOWN (owner directive, design/handoff/contest-breakdown.md).
 *
 * ONE panel, two screens (team selection + the match), exposing the engine's
 * REAL resolution chain as six engine-native rows, grouped:
 *
 *   ATTACKING — your route (Control → Create → Convert)
 *     KEEP   your KEEP v their PRESS   → PROJECTED POSSESSION a–b
 *     CREATE your CREATE v their BREAK → BIG-CHANCE ODDS band
 *     FINISH your FINISH v their STOP  → likely shooter's duel + d100 thresholds
 *   DEFENDING — their route, your answers (Press → Break → Stop)
 *     PRESS  your PRESS v their KEEP
 *     BREAK  your BREAK v their CREATE
 *     STOP   your STOP  v their FINISH
 *
 * Every number is read off `contestPanel` (src/lib/contest-panel.ts) — the same
 * pure exports the resolver runs — so the forecast can never drift from the
 * dice. NET is demoted to the small SQUAD EDGE chip top-right. Commitment step
 * bonuses surface as visible tier pips + `+N COMMITTED` per row.
 *
 * Match-screen extras (all display-only):
 *   • per-contest DELTA chips (this break's change: tactic/intent/shape edits),
 *   • an OUTCOME state after a period resolves, mapping the round's OWN ledger
 *     (RoundBeat[] + possession counts) per contest — no invented statistics.
 *
 * DEFENSIVE-ROW DISPLAY MAPPING (the inversion): `view.defence` is THEIR attack
 * route, so its `yours` is the opponent and `theirs` is you. The DEFENDING rows
 * show YOUR answer as the bar: PRESS = defence.keep.theirs v defence.keep.yours
 * (edge negated), likewise BREAK/STOP. Your defensive commitment tiers come off
 * your own ContestTotals.commit via the exported commitTierOf.
 *
 * Glass chrome, pixel numbers; bars animate width ~450ms expo-out (.kc-cb-fill,
 * disabled under prefers-reduced-motion).
 */

import type { ReactNode } from 'react';
import type { ContestPanelView, ContestKey } from '../lib/contest-panel';
import { commitTierOf, type CommitInfo, type RoundBeat } from '../lib/contests';
import { PIXEL, lastName } from './cards/cardTokens';
import { HERO } from './cards/portrait';

// The house ATK/DEF bar family (carried from the v4 dual meters) — attacking
// rows burn kit-orange, defending rows run away-kit blue.
const ATK_FILL = 'linear-gradient(90deg, #b23a1a, #e8621a)';
const DEF_FILL = 'linear-gradient(90deg, #274e86, #3d7bd6)';
const ATK_TAG = '#ff8f6a';
const DEF_TAG = '#8fb6ff';

const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const edgeCol = (n: number) => (n > 0 ? 'var(--success)' : n < 0 ? '#e0605a' : HERO.creamMuted);
const plural = (v: number, w: string) => `${v} ${w}${v === 1 ? '' : 'S'}`;

/** Bar fill: yours normalised against (yours + theirs), like the mock. */
function fillPct(yours: number, theirs: number): string {
  const a = Math.max(0, yours);
  const b = Math.max(0, theirs);
  const t = a + b;
  return `${t <= 0 ? 50 : Math.round((a / t) * 100)}%`;
}

// ---------------------------------------------------------------------------
// The six display rows (attack straight, defence inverted) — shared with the
// match screen's delta-chip baseline so both read the SAME mapping.
// ---------------------------------------------------------------------------

export interface RowVM {
  key: ContestKey;
  yours: number;
  theirs: number;
  edge: number;
  tier: 0 | 1 | 2;
  bonus: number;
}

/** The six displayed row EDGES — the delta-chip baseline. Edges (not raw
 *  values) so a change on EITHER side of a duel registers: a tactic that
 *  debuffs THEIR keep still moves your PRESS row. */
export function panelRowEdges(v: ContestPanelView): Record<ContestKey, number> {
  return {
    KEEP: v.attack.keep.edge,
    CREATE: v.attack.create.edge,
    FINISH: v.attack.finish.edge,
    // The inversion: `defence` is their route, so your answer's edge is −edge.
    PRESS: -v.defence.keep.edge,
    BREAK: -v.defence.create.edge,
    STOP: -v.defence.finish.edge,
  };
}

function buildRows(view: ContestPanelView, yourCommit: CommitInfo | null): { attack: RowVM[]; defend: RowVM[] } {
  const a = view.attack;
  const d = view.defence;
  const attack: RowVM[] = [
    { key: 'KEEP', yours: a.keep.yours, theirs: a.keep.theirs, edge: a.keep.edge, tier: a.keep.commitTier, bonus: a.keep.commitBonus },
    { key: 'CREATE', yours: a.create.yours, theirs: a.create.theirs, edge: a.create.edge, tier: a.create.commitTier, bonus: a.create.commitBonus },
    { key: 'FINISH', yours: a.finish.yours, theirs: a.finish.theirs, edge: a.finish.edge, tier: a.finish.commitTier, bonus: a.finish.commitBonus },
  ];
  // DEFENDING shows your answers: invert each defence pair (edge flips sign).
  // Your press/brk/stop commitment lives on YOUR ContestTotals.commit.
  const c = yourCommit;
  const defend: RowVM[] = [
    { key: 'PRESS', yours: d.keep.theirs, theirs: d.keep.yours, edge: -d.keep.edge, tier: c ? commitTierOf('press', c.press) : 0, bonus: c?.press ?? 0 },
    { key: 'BREAK', yours: d.create.theirs, theirs: d.create.yours, edge: -d.create.edge, tier: c ? commitTierOf('brk', c.brk) : 0, bonus: c?.brk ?? 0 },
    { key: 'STOP', yours: d.finish.theirs, theirs: d.finish.yours, edge: -d.finish.edge, tier: c ? commitTierOf('stop', c.stop) : 0, bonus: c?.stop ?? 0 },
  ];
  return { attack, defend };
}

// ---------------------------------------------------------------------------
// OUTCOME — the round's ledger, per contest. Only what the beats record.
// ---------------------------------------------------------------------------

export interface RoundLedgerView {
  /** KEEP: the round's possession split (you, them). */
  possession: [number, number];
  /** CREATE: chances you manufactured (shots taken + chances their stops denied). */
  chances: number;
  bigChances: number;
  /** FINISH: your conversion line. */
  goals: number;
  shots: number;
  onTarget: number;
  /** PRESS+BREAK: their moves that broke down (you won the ball back). */
  turnoversForced: number;
  /** STOP: their shots your keeper kept out + your stop-trait blocks. */
  saves: number;
  blocks: number;
}

/** Aggregate one round's beats into the OUTCOME lines — honest ledger reads:
 *  a `stop` beat carries the DEFENDER's side, a `turnover` the attacker's. */
export function summariseLedger(beats: RoundBeat[], yourPossessions: number, oppPossessions: number): RoundLedgerView {
  let chances = 0, big = 0, goals = 0, shots = 0, onTarget = 0, turnovers = 0, saves = 0, blocks = 0;
  for (const b of beats) {
    if (b.side === 'you' && (b.outcome === 'goal' || b.outcome === 'save' || b.outcome === 'miss')) {
      chances += 1;
      shots += 1;
      if (b.quality === 'big') big += 1;
      if (b.outcome === 'goal') { goals += 1; onTarget += 1; }
      if (b.outcome === 'save') onTarget += 1;
    }
    // Their stop-trait denying one of YOUR chances (side = the defender).
    if (b.side === 'opp' && b.outcome === 'stop') {
      chances += 1;
      if (b.quality === 'big') big += 1;
    }
    // They lose it — a turnover you forced.
    if (b.side === 'opp' && b.outcome === 'turnover') turnovers += 1;
    // Their shot, your keeper's save.
    if (b.side === 'opp' && b.outcome === 'save') saves += 1;
    // Your stop-trait cancelling one of THEIR chances.
    if (b.side === 'you' && b.outcome === 'stop') blocks += 1;
  }
  return {
    possession: [yourPossessions, oppPossessions],
    chances, bigChances: big, goals, shots, onTarget,
    turnoversForced: turnovers, saves, blocks,
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const LABEL_W = 48;
const EDGE_W = 30;
const VS_W = 32;

function GroupLabel({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 1.2, color }}>{text}</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: 'rgba(154,139,115,0.18)' }} />
    </div>
  );
}

/** The commitment pips: I / II in gold, riding the row label. */
function TierPips({ tier }: { tier: 0 | 1 | 2 }) {
  if (tier === 0) return null;
  return (
    <span style={{ fontFamily: PIXEL, fontSize: 6, color: 'var(--gold)', marginLeft: 3, verticalAlign: 'top' }}>
      {tier === 2 ? 'II' : 'I'}
    </span>
  );
}

function DuelRow({ vm, group, secondary, pulse, glow }: { vm: RowVM; group: 'atk' | 'def'; secondary?: ReactNode; pulse?: boolean; glow?: boolean }) {
  const tag = group === 'atk' ? ATK_TAG : DEF_TAG;
  const fill = group === 'atk' ? ATK_FILL : DEF_FILL;
  const committed = vm.bonus > 0;
  return (
    <div
      className={pulse ? 'kc-row-pulse' : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 4,
        boxShadow: glow ? '0 0 0 1px var(--gold), 0 0 8px rgba(232,178,60,0.55)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: tag, width: LABEL_W, flexShrink: 0, lineHeight: 1 }}>
          {vm.key}
          <TierPips tier={vm.tier} />
        </span>
        <div style={{ flex: 1, position: 'relative', height: 13, borderRadius: 4, background: '#241c10', border: '1px solid #0b0703', overflow: 'hidden', minWidth: 0 }}>
          <div className="kc-cb-fill" style={{ position: 'absolute', inset: 0, width: fillPct(vm.yours, vm.theirs), background: fill }} />
          <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontFamily: PIXEL, fontSize: 8.5, color: '#fff', textShadow: '0 1px 2px #000', lineHeight: 1 }}>
            {vm.yours}
          </span>
        </div>
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: HERO.creamBody, width: VS_W, flexShrink: 0, lineHeight: 1 }}>v {vm.theirs}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, color: edgeCol(vm.edge), width: EDGE_W, textAlign: 'right', flexShrink: 0, lineHeight: 1 }}>{sgn(vm.edge)}</span>
      </div>
      {(secondary || committed) && (
        <div style={{ paddingLeft: 8, display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {secondary && (
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.3, color: HERO.creamMuted, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {secondary}
            </span>
          )}
          {committed && (
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.3, color: 'var(--gold)', flexShrink: 0 }}>
              +{vm.bonus} COMMITTED
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** OUTCOME row — label + the ledger line, no bar (nothing left to forecast). */
function OutcomeRow({ label, group, value }: { label: string; group: 'atk' | 'def'; value: string }) {
  const tag = group === 'atk' ? ATK_TAG : DEF_TAG;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 15 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: tag, width: 84, flexShrink: 0, lineHeight: 1 }}>{label}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: HERO.cream, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {value}
      </span>
    </div>
  );
}

function PlaceholderRow({ label, group }: { label: string; group: 'atk' | 'def' }) {
  const tag = group === 'atk' ? ATK_TAG : DEF_TAG;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: tag, width: LABEL_W, flexShrink: 0, opacity: 0.55, lineHeight: 1 }}>{label}</span>
      <div style={{ flex: 1, height: 13, borderRadius: 4, background: '#241c10', border: '1px solid #0b0703' }} />
      <span style={{ width: VS_W + EDGE_W + 6, flexShrink: 0 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export type PanelState = 'forecast' | 'outcome';

export function ContestBreakdown({
  view,
  yourCommit,
  oppName,
  deltaVsBalanced = 0,
  collapsed,
  onToggleCollapsed,
  outcome = null,
  panelState = 'forecast',
  onPanelState,
  deltas = null,
  pulseKeys = null,
  glowKey = null,
}: {
  /** The six-row selector view; null → the FILL-YOUR-XI placeholder. */
  view: ContestPanelView | null;
  /** YOUR ContestTotals.commit — the defending rows' commitment tiers. */
  yourCommit: CommitInfo | null;
  oppName?: string;
  /** The Δ-vs-balanced badge (team selection) — rides next to SQUAD EDGE. */
  deltaVsBalanced?: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Last resolved round's ledger — enables the OUTCOME state (match screen). */
  outcome?: RoundLedgerView | null;
  panelState?: PanelState;
  onPanelState?: (s: PanelState) => void;
  /** This break's per-contest changes (tactic/intent/shape) — nonzero only. */
  deltas?: Partial<Record<ContestKey, number>> | null;
  /** BEAT 1 (match-animation.md) — the rows the player's LATEST choice actually
   *  moved; a brief one-shot glow, cleared once its consequence resolves. Only
   *  the rows that changed pulse — everything else stays visually still. */
  pulseKeys?: ContestKey[] | null;
  /** BEAT 2 — the spell-summary's contest family, given a held glow for the
   *  ~1s the phrase reads (KEEP/PRESS "the ball", CREATE "the chances"). */
  glowKey?: ContestKey | null;
}) {
  const rows = view ? buildRows(view, yourCommit) : null;
  const showOutcome = panelState === 'outcome' && !!outcome;
  const shooter = view?.attack.shooter ?? null;
  const deltaEntries = deltas
    ? (['KEEP', 'CREATE', 'FINISH', 'PRESS', 'BREAK', 'STOP'] as ContestKey[])
        .filter((k) => (deltas[k] ?? 0) !== 0)
        .map((k) => ({ key: k, d: deltas[k]! }))
    : [];

  return (
    <div
      className="glass-surface"
      style={{
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(232,178,60,0.22)',
        boxShadow: 'inset 0 1px 0 0 var(--glass-highlight), var(--depth-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header — title left, the demoted SQUAD EDGE chip right. Tap collapses. */}
      <button
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', minHeight: 34, padding: '7px 11px 5px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1.4, color: HERO.creamMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          CONTEST BREAKDOWN{oppName ? ` · v ${oppName.toUpperCase()}` : ''}
        </span>
        {view ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.6, color: HERO.creamMuted }}>SQUAD EDGE</span>
            <span style={{ fontFamily: PIXEL, fontSize: 13, lineHeight: 1, color: view.squadEdge >= 0 ? HERO.cream : '#e0605a', textShadow: '0 2px 0 #0b0703' }}>
              {sgn(view.squadEdge)}
            </span>
            {deltaVsBalanced !== 0 && (
              <span style={{ fontFamily: PIXEL, fontSize: 8, color: edgeCol(deltaVsBalanced) }}>
                {deltaVsBalanced > 0 ? `▲${deltaVsBalanced}` : `▼${Math.abs(deltaVsBalanced)}`}
              </span>
            )}
            <span aria-hidden style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--gold)', marginLeft: 2 }}>{collapsed ? '▾' : '▴'}</span>
          </span>
        ) : (
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: HERO.creamMuted, flexShrink: 0 }}>FILL YOUR XI</span>
        )}
      </button>

      {/* Collapsed — just the group headers, each row's signed edge. */}
      {collapsed && rows && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 11px 8px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {([['ATT', rows.attack, ATK_TAG], ['DEF', rows.defend, DEF_TAG]] as const).map(([label, group, colour]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.8, color: colour }}>{label}</span>
              {group.map((r) => {
                const pulsing = !!pulseKeys?.includes(r.key);
                const glowing = glowKey === r.key;
                return (
                  <span
                    key={r.key}
                    className={pulsing ? 'kc-row-pulse' : undefined}
                    style={{
                      fontFamily: PIXEL, fontSize: 7.5, color: edgeCol(r.edge), padding: '1px 2px',
                      boxShadow: glowing ? '0 0 0 1px var(--gold), 0 0 6px rgba(232,178,60,0.7)' : undefined,
                      borderRadius: 3,
                    }}
                  >
                    {r.key.slice(0, 1)}{sgn(r.edge)}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="kc-cb-body" style={{ padding: '1px 11px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* FORECAST ▸ OUTCOME toggle (match screen, once a period exists) +
              this break's delta chips (forecast only). */}
          {(outcome && onPanelState) || deltaEntries.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 20, flexWrap: 'wrap' }}>
              {outcome && onPanelState && (
                <span style={{ display: 'inline-flex', border: '1px solid rgba(154,139,115,0.35)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                  {(['forecast', 'outcome'] as PanelState[]).map((s) => {
                    const on = panelState === s;
                    return (
                      <button
                        key={s}
                        onClick={() => onPanelState(s)}
                        style={{
                          fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.6, lineHeight: 1,
                          padding: '6px 8px', border: 'none', cursor: 'pointer',
                          background: on ? 'var(--gold)' : 'rgba(0,0,0,0.3)',
                          color: on ? 'var(--ink-black)' : HERO.creamMuted,
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {s.toUpperCase()}
                      </button>
                    );
                  })}
                </span>
              )}
              {!showOutcome && deltaEntries.map(({ key, d }) => (
                <span
                  key={key}
                  className="kc-cb-delta"
                  style={{
                    fontFamily: PIXEL, fontSize: 7, letterSpacing: 0.4, lineHeight: 1,
                    padding: '4px 5px', borderRadius: 3, flexShrink: 0,
                    color: edgeCol(d),
                    background: d > 0 ? 'rgba(52,196,106,0.12)' : 'rgba(224,51,45,0.12)',
                    border: `1px solid ${d > 0 ? 'rgba(52,196,106,0.4)' : 'rgba(224,51,45,0.4)'}`,
                  }}
                >
                  {key} {sgn(d)}
                </span>
              ))}
            </div>
          ) : null}

          {showOutcome && outcome ? (
            <>
              {/* OUTCOME — what the round's ledger actually recorded. */}
              <GroupLabel text="ATTACKING" color={ATK_TAG} />
              <OutcomeRow label="KEEP" group="atk" value={`POSSESSION ${outcome.possession[0]}–${outcome.possession[1]}`} />
              <OutcomeRow label="CREATE" group="atk" value={`${plural(outcome.chances, 'CHANCE')} (${outcome.bigChances} BIG)`} />
              <OutcomeRow label="FINISH" group="atk" value={`${plural(outcome.goals, 'GOAL')} / ${plural(outcome.shots, 'SHOT')} (${outcome.onTarget} ON TARGET)`} />
              <GroupLabel text="DEFENDING" color={DEF_TAG} />
              <OutcomeRow label="PRESS·BREAK" group="def" value={`${plural(outcome.turnoversForced, 'TURNOVER')} FORCED`} />
              <OutcomeRow label="STOP" group="def" value={`${plural(outcome.saves, 'SAVE')}${outcome.blocks > 0 ? ` · ${plural(outcome.blocks, 'BLOCK')}` : ''}`} />
            </>
          ) : rows && view ? (
            <>
              <GroupLabel text="ATTACKING" color={ATK_TAG} />
              <DuelRow vm={rows.attack[0]} group="atk" secondary={`PROJECTED POSSESSION: ${view.attack.possession[0]}–${view.attack.possession[1]}`} pulse={pulseKeys?.includes('KEEP')} glow={glowKey === 'KEEP'} />
              <DuelRow vm={rows.attack[1]} group="atk" secondary={`BIG-CHANCE ODDS: ${view.attack.bigChanceOdds}`} pulse={pulseKeys?.includes('CREATE')} glow={glowKey === 'CREATE'} />
              <DuelRow
                vm={rows.attack[2]}
                group="atk"
                secondary={shooter
                  ? `${lastName(shooter.name).toUpperCase()} ${shooter.atk} v STOP ${shooter.stop} · HALF ${shooter.needs.half}% · BIG ${shooter.needs.big}% · CORNER ${shooter.needs.corner}%`
                  : undefined}
                pulse={pulseKeys?.includes('FINISH')} glow={glowKey === 'FINISH'}
              />
              <GroupLabel text="DEFENDING" color={DEF_TAG} />
              <DuelRow vm={rows.defend[0]} group="def" pulse={pulseKeys?.includes('PRESS')} glow={glowKey === 'PRESS'} />
              <DuelRow vm={rows.defend[1]} group="def" pulse={pulseKeys?.includes('BREAK')} glow={glowKey === 'BREAK'} />
              <DuelRow vm={rows.defend[2]} group="def" pulse={pulseKeys?.includes('STOP')} glow={glowKey === 'STOP'} />
            </>
          ) : (
            <>
              {/* FILL-YOUR-XI placeholder — dim rails, no numbers to fake. */}
              <GroupLabel text="ATTACKING" color={ATK_TAG} />
              <PlaceholderRow label="KEEP" group="atk" />
              <PlaceholderRow label="CREATE" group="atk" />
              <PlaceholderRow label="FINISH" group="atk" />
              <GroupLabel text="DEFENDING" color={DEF_TAG} />
              <PlaceholderRow label="PRESS" group="def" />
              <PlaceholderRow label="BREAK" group="def" />
              <PlaceholderRow label="STOP" group="def" />
            </>
          )}

          {/* Foot — the collapse affordance (mock). */}
          <button
            onClick={onToggleCollapsed}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 0 7px', fontFamily: PIXEL, fontSize: 7, letterSpacing: 1,
              color: HERO.creamMuted, textAlign: 'center', lineHeight: 1,
            }}
          >
            ▴ TAP TO COLLAPSE
          </button>
        </div>
      )}
    </div>
  );
}
