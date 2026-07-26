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
  type Sector,
  type TeamSide,
  type V7MatchState,
} from '@/engine-v7';
import type { V7Fixture } from './fixtures';
import {
  buildBreakPlan,
  noopBreakPlan,
  scriptedOpponentPlan,
  type BreakDecision,
} from './adapter/lineup';
import {
  buildInitialMatch,
  toMatchView,
  type GameRegistry,
  type MatchResult,
  type UiMatchView,
  type UiPlayerView,
  type UiTeamView,
} from './adapter/match';
import { expect as expectResult, type AdapterResult } from './adapter/result';
import { syntheticEvent, translateReceipts, type MatchEvent } from './receipts';
import { buildBeats, type BroadcastBeat } from './beats';
import { BroadcastQueue } from './broadcast';

// The V7 match controller — pure TypeScript, no React, no engine mutation. It
// owns the engine state, the effect ledger, the current phase, the pending
// player plan, the deterministic opponent plan, the receipt-derived event feed,
// score/period, the completed result, and restart. It sequences the engine
// primitives (period resolution → boundary → break resolution) and enforces the
// legality rules: no double-resolve, no illegal plan, no advancing after full
// time.
//
// On top of that it owns the BROADCAST layer: every engine step's receipts (plus
// a few synthetic presentation receipts the engine has no reason to emit —
// kickoff, chance creation, full time) are grouped into ordered beats and pushed
// into a `BroadcastQueue`. The queue presents one beat at a time; the controller
// refuses to advance the engine while beats remain unpresented, so the score and
// board on screen never run ahead of the story being told.

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
  beatCount: number;
  pendingBeats: number;
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
  private validationErrors: string[] = [];
  private latestReceiptType: string | null = null;
  private resultValue: MatchResult | null = null;
  private queue: BroadcastQueue | null = null;
  private beatScore!: { player: number; opponent: number };
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
    this.validationErrors = [];
    this.resultValue = null;
    this.queue = new BroadcastQueue({ reducedMotion: this.queue?.isReducedMotion() ?? false });
    this.beatScore = { player: 0, opponent: 0 };

    // Event feed (dev log) — kept exactly as before for the collapsible feed.
    this.events = [syntheticEvent('kickoff', 'kickoff', 1, `Kickoff — ${this.teamName('player')} vs ${this.teamName('opponent')}.`)];
    this.appendReceipts(initial.receipts);
    this.emitChanceCreated();

    // Broadcast beats — kickoff, the kick-off effects, then the opening chances.
    const kickoffReceipts: MatchReceiptEvent[] = [
      this.synthetic('kickoff', 'kickoff', 1, `Kickoff — ${this.teamName('player')} vs ${this.teamName('opponent')}.`),
      ...initial.receipts,
      ...this.chanceReceipts(),
    ];
    this.ingestBeats(kickoffReceipts);
    this.version += 1;
  }

  private get q(): BroadcastQueue {
    return this.queue!;
  }

  private teamName(side: TeamSide): string {
    const team = side === 'player' ? this.state.player : this.state.opponent;
    return this.registry.managers.get(team.managerId)?.name ?? team.managerId;
  }

  private shortName(cardId: string): string {
    const card = this.registry.cards.get(cardId);
    return card?.shortName ?? card?.name ?? cardId;
  }

  private appendReceipts(receipts: readonly MatchReceiptEvent[]): void {
    if (receipts.length === 0) return;
    this.events.push(...translateReceipts(receipts));
    this.latestReceiptType = receipts[receipts.length - 1]!.eventType;
  }

  /** Sector chance counts for one side from the current pending chances. */
  private chanceCounts(side: TeamSide): { count: number; left: number; centre: number; right: number } {
    const tokens = this.chances[side];
    const counts = { count: tokens.length, left: 0, centre: 0, right: 0 };
    for (const token of tokens) counts[token.sector] += 1;
    return counts;
  }

  private emitChanceCreated(): void {
    for (const side of ['player', 'opponent'] as const) {
      const c = this.chanceCounts(side);
      if (c.count === 0) continue;
      this.events.push(
        syntheticEvent(
          `chance:${this.state.period}:${side}`,
          'chance_created',
          this.state.period,
          `${this.teamName(side)} created ${c.count} chance${c.count === 1 ? '' : 's'} (L${c.left} C${c.centre} R${c.right}).`,
          side,
        ),
      );
    }
  }

  /** Synthetic presentation receipts for chance creation (one per scoring side). */
  private chanceReceipts(): MatchReceiptEvent[] {
    const out: MatchReceiptEvent[] = [];
    for (const side of ['player', 'opponent'] as const) {
      const c = this.chanceCounts(side);
      if (c.count === 0) continue;
      out.push(
        this.synthetic(`chance:${this.state.period}:${side}`, 'chance_created', this.state.period,
          `${this.teamName(side)} created ${c.count} chance${c.count === 1 ? '' : 's'}.`,
          { count: c.count, left: c.left, centre: c.centre, right: c.right }, side),
      );
    }
    return out;
  }

  private synthetic(
    id: string,
    eventType: string,
    period: PeriodNumber,
    message: string,
    data: Record<string, unknown> = {},
    side?: TeamSide,
  ): MatchReceiptEvent {
    return { id, period, phase: 'presentation', eventType, message, ...(side ? { side } : {}), data };
  }

  /** Build beats from a batch of receipts and enqueue them, carrying the score forward. */
  private ingestBeats(
    receipts: readonly MatchReceiptEvent[],
    callout: { incoming?: string[]; actionSources?: string[] } = {},
  ): void {
    const built = buildBeats(receipts, {
      startScore: this.beatScore,
      nameOf: (id) => this.shortName(id),
      ...(callout.incoming ? { playerIncomingCardIds: callout.incoming } : {}),
      ...(callout.actionSources ? { playerActionSourceIds: callout.actionSources } : {}),
    });
    this.beatScore = built.endScore;
    this.q.enqueue(built.beats);
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
    return this.phase === 'period' && !this.q.hasPending();
  }

  canResolveBreak(): boolean {
    return this.phase === 'break' && !this.q.hasPending();
  }

  /** Engine-truth view (subs already applied). Used by tests and diagnostics. */
  getView(): UiMatchView {
    return toMatchView(this.state, this.ledger, this.registry, { phaseLabel: this.phaseLabel(), result: this.resultValue });
  }

  /**
   * The broadcast STAGE view: the score and lineup as they should read on
   * screen right now. The score comes from the presented beats (so it never
   * runs ahead of the goal beat), and any substitution whose beat has not yet
   * been presented is reverted, so the pitch changes exactly at the sub beat.
   */
  getStageView(): UiMatchView {
    const view = this.getView();
    const score = this.q.presentedScore();
    const player = this.revertUnpresentedSubs('player', view.player);
    const opponent = this.revertUnpresentedSubs('opponent', view.opponent);
    return {
      ...view,
      player: { ...player, score: score.player },
      opponent: { ...opponent, score: score.opponent },
    };
  }

  private synthPlayerView(cardId: string, slotKey: string | undefined, sector: Sector | undefined): UiPlayerView {
    const card = this.registry.cards.get(cardId);
    const resolvedSector = sector ?? card?.naturalSector;
    return {
      cardId,
      name: card?.name ?? cardId,
      shortName: card?.shortName ?? card?.name ?? cardId,
      ...(card?.positionCodes[0] ? { position: card.positionCodes[0] } : {}),
      ...(resolvedSector ? { sector: resolvedSector } : {}),
      ...(slotKey ? { slotKey } : {}),
      attack: card?.printedAttack ?? 0,
      defence: card?.printedDefence ?? 0,
      cost: card?.printedCost ?? 0,
      outOfPosition: false,
      emergencyGoalkeeper: false,
    };
  }

  /** Undo, for display, any substitution beat on this side not yet presented. */
  private revertUnpresentedSubs(side: TeamSide, team: UiTeamView): UiTeamView {
    const beats = this.q.all();
    const cursor = this.q.cursorIndex();
    let active = [...team.active];
    let bench = [...team.bench];
    // Undo latest-first so slot takeovers reconcile.
    for (let i = beats.length - 1; i > cursor; i -= 1) {
      const beat = beats[i]!;
      if (beat.kind !== 'substitution' || beat.side !== side) continue;
      const inCardId = typeof beat.data.inCardId === 'string' ? beat.data.inCardId : undefined;
      const outCardId = typeof beat.data.outCardId === 'string' ? beat.data.outCardId : undefined;
      if (!inCardId) continue;
      const incoming = active.find((p) => p.cardId === inCardId);
      const slotKey = incoming?.slotKey ?? (typeof beat.data.slotKey === 'string' ? beat.data.slotKey : undefined);
      const sector = incoming?.sector ?? (typeof beat.data.sector === 'string' ? (beat.data.sector as Sector) : undefined);
      // Incoming card returns to the bench…
      active = active.filter((p) => p.cardId !== inCardId);
      if (!bench.some((p) => p.cardId === inCardId)) bench = [...bench, this.synthPlayerView(inCardId, undefined, undefined)];
      // …and the outgoing card returns to its slot.
      if (outCardId) {
        bench = bench.filter((p) => p.cardId !== outCardId);
        active = [...active, this.synthPlayerView(outCardId, slotKey, sector)];
      }
    }
    return { ...team, active, bench };
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

  getBenchIds(side: TeamSide = 'player'): string[] {
    const team = side === 'player' ? this.state.player : this.state.opponent;
    return team.players.filter((player) => player.zone === 'bench').map((player) => player.cardId);
  }

  // ── Broadcast transport ───────────────────────────────────────────────────

  getActiveBeat(): BroadcastBeat | null {
    return this.q.active();
  }

  getBeats(): readonly BroadcastBeat[] {
    return this.q.all();
  }

  getPresentedBeats(): BroadcastBeat[] {
    return this.q.presented();
  }

  hasPendingBeats(): boolean {
    return this.q.hasPending();
  }

  pendingBeatCount(): number {
    return this.q.pendingCount();
  }

  /** Present the next beat. Returns it, or null if nothing is pending. */
  advanceBeat(): BroadcastBeat | null {
    const beat = this.q.advance();
    this.version += 1;
    return beat;
  }

  skipBeat(): BroadcastBeat | null {
    return this.advanceBeat();
  }

  /** Skip the rest of the current sequence — present everything at once. */
  skipSequence(): void {
    this.q.drain();
    this.version += 1;
  }

  /** Present-all (used by headless callers / reduced-motion / tests). */
  drainBeats(): void {
    this.q.drain();
    this.version += 1;
  }

  isBroadcastPlaying(): boolean {
    return this.q.isPlaying();
  }

  playBroadcast(): void {
    this.q.play();
    this.version += 1;
  }

  pauseBroadcast(): void {
    this.q.pause();
    this.version += 1;
  }

  toggleBroadcast(): void {
    this.q.togglePlay();
    this.version += 1;
  }

  isReducedMotion(): boolean {
    return this.q.isReducedMotion();
  }

  setReducedMotion(value: boolean): void {
    this.q.setReducedMotion(value);
    this.version += 1;
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
      beatCount: this.q.all().length,
      pendingBeats: this.q.pendingCount(),
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
    const result = buildBreakPlan('player', this.state.player, decision, this.state.period as BreakIndex, this.registry, this.state.seed);
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

  clearPlan(): void {
    this.pendingPlan = null;
    this.pendingDecision = null;
    this.validationErrors = [];
    this.version += 1;
  }

  /** Resolve the current period + its boundary. Throws if not resolvable. */
  resolvePeriod(): void {
    if (this.phase !== 'period') {
      throw new Error(`Cannot resolve a period in phase "${this.phase}".`);
    }
    if (this.q.hasPending()) {
      throw new Error('Cannot resolve a period while broadcast beats are still pending.');
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

    const stepReceipts: MatchReceiptEvent[] = [...resolved.receipts, ...boundary.receipts];

    if (boundary.matchOver) {
      this.phase = 'fulltime';
      this.resultValue = this.state.player.score > this.state.opponent.score ? 'VICTORY' : this.state.player.score < this.state.opponent.score ? 'DEFEAT' : 'DRAW';
      this.events.push(
        syntheticEvent('fulltime', 'full_time', this.state.period, `Full time — ${this.state.player.score}–${this.state.opponent.score} — ${this.resultValue}.`),
      );
      stepReceipts.push(
        this.synthetic('fulltime', 'full_time', this.state.period, `Full time — ${this.resultValue}.`, {
          result: this.resultValue,
          playerScore: this.state.player.score,
          opponentScore: this.state.opponent.score,
        }),
      );
    } else {
      this.phase = 'break';
      this.pendingPlan = null;
      this.pendingDecision = null;
      this.validationErrors = [];
    }

    this.ingestBeats(stepReceipts);
    this.version += 1;
  }

  /** Resolve the break (pending plan or a no-op) against the scripted opponent plan. */
  resolveBreak(): AdapterResult<void> {
    if (this.phase !== 'break') {
      throw new Error(`Cannot resolve a break in phase "${this.phase}".`);
    }
    if (this.q.hasPending()) {
      throw new Error('Cannot resolve a break while broadcast beats are still pending.');
    }
    const breakIndex = this.state.period as BreakIndex;
    const upcomingPeriod = (this.state.period + 1) as PeriodNumber;
    const playerPlan = this.pendingPlan ?? noopBreakPlan('player', this.state.player, breakIndex);
    const opponentPlan = scriptedOpponentPlan(this.state.opponent, breakIndex);

    // Remember the player's submitted plan so its consequences read as "your change".
    const incoming = (this.pendingDecision?.subs ?? []).map((sub) => sub.inCardId);
    const actionSources = (this.pendingDecision?.activations ?? []).map((activation) => activation.sourceId);

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

    const stepReceipts: MatchReceiptEvent[] = [...resolved.receipts, ...this.chanceReceipts()];
    this.ingestBeats(stepReceipts, { incoming, actionSources });

    this.phase = 'period';
    this.pendingPlan = null;
    this.pendingDecision = null;
    this.validationErrors = [];
    this.version += 1;
    return { ok: true, value: undefined };
  }

  restart(): void {
    this.reset();
  }
}
