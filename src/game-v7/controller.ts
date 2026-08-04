import {
  boardChances,
  processBoundary,
  resolveBreak as resolveBreakEngine,
  resolvePeriod as resolvePeriodEngine,
  type BreakIndex,
  type BreakPlan,
  type ChanceToken,
  type LedgerEffect,
  type MatchReceiptEvent,
  type PeriodNumber,
  type PeriodSnapshot,
  type TeamSide,
  type V7MatchState,
} from '@/engine-v7';
import type { V7Fixture } from './fixtures';
import {
  buildBreakPlan,
  noopBreakPlan,
  type BreakDecision,
} from './adapter/lineup';
import {
  buildInitialMatch,
  toMatchView,
  type GameRegistry,
  type MatchResult,
  type UiMatchView,
} from './adapter/match';
import { buildOpponentPlan, type OpponentDecisionSummary } from './adapter/opponent';
import { expect as expectResult, type AdapterResult } from './adapter/result';
import { syntheticEvent, translateReceipts, type MatchEvent } from './receipts';

// The V7 match controller — pure TypeScript, no React, no engine mutation. It
// owns the engine state, the effect ledger, the current phase, the pending
// player plan, the deterministic opponent plan, the receipt-derived event feed,
// score/period, the completed result, and restart. It sequences the engine
// primitives (period resolution → boundary → break resolution) and enforces the
// legality rules: no double-resolve, no illegal plan, no advancing after full
// time. Snapshots are stored read-only and never mutated.

export type ControllerPhase = 'period' | 'break' | 'fulltime';

export interface Diagnostics {
  seed: number;
  phase: ControllerPhase;
  period: PeriodNumber;
  breakIndex: 0 | BreakIndex;
  priority: TeamSide;
  stateId: string;
  receiptCount: number;
  latestReceiptType: string | null;
  eventCount: number;
  validationErrors: string[];
  dataSource: 'fixture';
}

const BREAK_LABEL = ['', 'First break', 'Half-time', 'Final break'];

export class V7MatchController {
  private readonly fixture: V7Fixture;
  private registry!: GameRegistry;
  private state!: V7MatchState;
  private ledger!: LedgerEffect[];
  private chances!: Record<TeamSide, ChanceToken[]>;
  private phase!: ControllerPhase;
  private events!: MatchEvent[];
  private snapshots!: PeriodSnapshot[];
  private pendingPlan: BreakPlan | null = null;
  private pendingDecision: BreakDecision | null = null;
  private pendingOpponentPlan: BreakPlan | null = null;
  private pendingOpponentDecision: OpponentDecisionSummary | null = null;
  private validationErrors: string[] = [];
  private latestReceiptType: string | null = null;
  private resultValue: MatchResult | null = null;
  /** Bumped on every state change so a React host can re-render. */
  version = 0;

  constructor(fixture: V7Fixture) {
    this.fixture = fixture;
    this.reset();
  }

  private reset(): void {
    const initial = expectResult(buildInitialMatch(this.fixture));
    this.registry = initial.registry;
    this.state = initial.state;
    this.ledger = initial.ledger;
    this.chances = boardChances(this.state, this.ledger, this.registry, this.state.period);
    this.phase = 'period';
    this.snapshots = [];
    this.pendingPlan = null;
    this.pendingDecision = null;
    this.pendingOpponentPlan = null;
    this.pendingOpponentDecision = null;
    this.validationErrors = [];
    this.resultValue = null;
    this.events = [syntheticEvent('kickoff', 'kickoff', 1, `Kickoff — ${this.teamName('player')} vs ${this.teamName('opponent')}.`)];
    this.appendReceipts(initial.receipts);
    this.emitChanceCreated();
    this.version += 1;
  }

  private teamName(side: TeamSide): string {
    const team = side === 'player' ? this.state.player : this.state.opponent;
    return this.registry.managers.get(team.managerId)?.name ?? team.managerId;
  }

  private appendReceipts(receipts: readonly MatchReceiptEvent[]): void {
    if (receipts.length === 0) return;
    this.events.push(...translateReceipts(receipts));
    this.latestReceiptType = receipts[receipts.length - 1]!.eventType;
  }

  private emitChanceCreated(): void {
    for (const side of ['player', 'opponent'] as const) {
      const tokens = this.chances[side];
      if (tokens.length === 0) continue;
      const bySector = { left: 0, centre: 0, right: 0 };
      for (const token of tokens) bySector[token.sector] += 1;
      this.events.push(
        syntheticEvent(
          `chance:${this.state.period}:${side}`,
          'chance_created',
          this.state.period,
          `${this.teamName(side)} created ${tokens.length} chance${tokens.length === 1 ? '' : 's'} (L${bySector.left} C${bySector.centre} R${bySector.right}).`,
          side,
        ),
      );
    }
  }

  private phaseLabel(): string {
    if (this.phase === 'fulltime') return 'Full time';
    if (this.phase === 'break') return `${BREAK_LABEL[this.state.period] ?? `Break ${this.state.period}`} · Period ${this.state.period + 1} next`;
    return `Period ${this.state.period}`;
  }

  private stateId(): string {
    return `p${this.state.period}b${this.state.breakIndex}-${this.state.player.score}:${this.state.opponent.score}-l${this.ledger.length}-r${this.events.length}`;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  getPhase(): ControllerPhase {
    return this.phase;
  }

  getResult(): MatchResult | null {
    return this.resultValue;
  }

  canResolvePeriod(): boolean {
    return this.phase === 'period';
  }

  canResolveBreak(): boolean {
    return this.phase === 'break';
  }

  getView(): UiMatchView {
    return toMatchView(this.state, this.ledger, this.registry, { phaseLabel: this.phaseLabel(), result: this.resultValue });
  }

  getEvents(): readonly MatchEvent[] {
    return this.events;
  }

  getSnapshots(): readonly PeriodSnapshot[] {
    return this.snapshots;
  }

  getPendingDecision(): BreakDecision | null {
    return this.pendingDecision;
  }

  getPendingOpponentDecision(): OpponentDecisionSummary | null {
    return this.pendingOpponentDecision;
  }

  getBenchIds(side: TeamSide = 'player'): string[] {
    const team = side === 'player' ? this.state.player : this.state.opponent;
    return team.players.filter((player) => player.zone === 'bench').map((player) => player.cardId);
  }

  getDiagnostics(): Diagnostics {
    return {
      seed: this.state.seed,
      phase: this.phase,
      period: this.state.period,
      breakIndex: this.state.breakIndex,
      priority: this.state.priority,
      stateId: this.stateId(),
      receiptCount: this.state.receipt.length,
      latestReceiptType: this.latestReceiptType,
      eventCount: this.events.length,
      validationErrors: this.validationErrors,
      dataSource: this.fixture.source,
    };
  }

  // ── Commands ─────────────────────────────────────────────────────────────────

  /** Build + validate a player break plan from a decision. Sets the pending plan on success. */
  setPlayerDecision(decision: BreakDecision): AdapterResult<BreakPlan> {
    if (this.phase !== 'break') {
      this.validationErrors = ['Not in a break — a plan cannot be submitted now.'];
      return { ok: false, error: { code: 'illegal_plan', message: this.validationErrors[0]! } };
    }
    const result = buildBreakPlan('player', this.state.player, decision, this.state.period as BreakIndex, this.registry, this.state.seed, this.ledger);
    this.pendingOpponentPlan = null;
    this.pendingOpponentDecision = null;
    if (result.ok) {
      this.pendingPlan = result.value;
      this.pendingDecision = decision;
      this.validationErrors = [];
    } else {
      this.pendingPlan = null;
      this.pendingDecision = decision;
      this.validationErrors = [result.error.message];
    }
    this.version += 1;
    return result;
  }

  /** Build the opponent's legal response to the submitted player lineup. */
  prepareOpponentDecision(): AdapterResult<OpponentDecisionSummary> {
    if (this.phase !== 'break') {
      return { ok: false, error: { code: 'illegal_plan', message: 'The opponent can only plan during a break.' } };
    }
    if (this.pendingOpponentDecision) return { ok: true, value: this.pendingOpponentDecision };

    const result = buildOpponentPlan(
      this.state,
      this.ledger,
      this.pendingDecision ?? { subs: [], activations: [] },
      this.state.period as BreakIndex,
      this.registry,
    );
    if (result.ok) {
      this.pendingOpponentDecision = result.value;
      this.pendingOpponentPlan = result.value.plan;
      this.validationErrors = [];
    } else {
      this.pendingOpponentDecision = null;
      this.pendingOpponentPlan = null;
      this.validationErrors = [result.error.message];
    }
    this.version += 1;
    return result;
  }

  clearPlan(): void {
    this.pendingPlan = null;
    this.pendingDecision = null;
    this.pendingOpponentPlan = null;
    this.pendingOpponentDecision = null;
    this.validationErrors = [];
    this.version += 1;
  }

  /** Resolve the current period + its boundary. Throws if not resolvable. */
  resolvePeriod(): void {
    if (this.phase !== 'period') {
      throw new Error(`Cannot resolve a period in phase "${this.phase}".`);
    }

    const resolved = resolvePeriodEngine({ state: this.state, ledger: this.ledger, chances: this.chances, registry: this.registry });
    this.state = resolved.state;
    this.ledger = resolved.ledger;
    this.snapshots = [...this.snapshots, resolved.snapshot];
    this.appendReceipts(resolved.receipts);

    const boundary = processBoundary(this.state, this.ledger, this.registry);
    this.state = boundary.state;
    this.ledger = boundary.ledger;
    this.appendReceipts(boundary.receipts);

    if (boundary.matchOver) {
      this.phase = 'fulltime';
      this.resultValue = this.state.player.score > this.state.opponent.score ? 'VICTORY' : this.state.player.score < this.state.opponent.score ? 'DEFEAT' : 'DRAW';
      this.events.push(
        syntheticEvent('fulltime', 'full_time', this.state.period, `Full time — ${this.state.player.score}–${this.state.opponent.score} — ${this.resultValue}.`),
      );
    } else {
      this.phase = 'break';
      this.pendingPlan = null;
      this.pendingDecision = null;
      this.pendingOpponentPlan = null;
      this.pendingOpponentDecision = null;
      this.validationErrors = [];
    }
    this.version += 1;
  }

  /** Resolve the break against the opponent's prepared coaching decision. */
  resolveBreak(): AdapterResult<void> {
    if (this.phase !== 'break') {
      throw new Error(`Cannot resolve a break in phase "${this.phase}".`);
    }
    const breakIndex = this.state.period as BreakIndex;
    const upcomingPeriod = (this.state.period + 1) as PeriodNumber;
    const playerPlan = this.pendingPlan ?? noopBreakPlan('player', this.state.player, breakIndex);
    const prepared = this.prepareOpponentDecision();
    if (!prepared.ok) return { ok: false, error: prepared.error };
    const opponentPlan = this.pendingOpponentPlan ?? prepared.value.plan;

    const resolved = resolveBreakEngine({
      state: this.state,
      ledger: this.ledger,
      plans: { player: playerPlan, opponent: opponentPlan },
      registry: this.registry,
      breakIndex,
      upcomingPeriod,
    });
    this.state = resolved.state;
    this.ledger = resolved.ledger;
    this.chances = resolved.chances;
    this.appendReceipts(resolved.receipts);
    this.emitChanceCreated();

    this.phase = 'period';
    this.pendingPlan = null;
    this.pendingDecision = null;
    this.pendingOpponentPlan = null;
    this.pendingOpponentDecision = null;
    this.validationErrors = [];
    this.version += 1;
    return { ok: true, value: undefined };
  }

  restart(): void {
    this.reset();
  }
}
