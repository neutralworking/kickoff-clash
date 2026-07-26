import type { BroadcastBeat } from './beats';

// ── The broadcast queue ──────────────────────────────────────────────────────
//
// A presentation controller that owns an ordered list of beats and a single
// active cursor. It exposes exactly one active beat at a time and the transport
// verbs a broadcast needs — play, pause, show-next, skip, skip-sequence, and an
// instant drain for tests / reduced-motion. It NEVER touches engine state: it
// only decides which already-computed beat is on screen. Timers in the UI drive
// `advance()`; the queue itself is timer-free and fully synchronous, so it is
// trivially testable and deterministic.
//
// The load-bearing guarantee: while beats remain unpresented (`hasPending()`),
// the host must not advance the engine. The controller enforces that by asking
// the queue before every engine step.

export class BroadcastQueue {
  private beats: BroadcastBeat[] = [];
  /** Index of the active (on-screen) beat; -1 before anything is shown. */
  private cursor = -1;
  private playing = true;
  private reducedMotion = false;

  constructor(options: { reducedMotion?: boolean } = {}) {
    this.reducedMotion = options.reducedMotion ?? false;
  }

  /** Append newly-built beats to the tail of the queue (order preserved). */
  enqueue(beats: readonly BroadcastBeat[]): void {
    if (beats.length === 0) return;
    this.beats.push(...beats);
    // In reduced-motion there is no timed reveal — surface everything at once,
    // in order, so all information is available without animation.
    if (this.reducedMotion) this.cursor = this.beats.length - 1;
  }

  /** The beat currently on screen, or null before the first advance. */
  active(): BroadcastBeat | null {
    return this.cursor >= 0 ? this.beats[this.cursor] ?? null : null;
  }

  /** Are there beats queued behind the active one, still to be presented? */
  hasPending(): boolean {
    return this.cursor < this.beats.length - 1;
  }

  pendingCount(): number {
    return this.beats.length - 1 - this.cursor;
  }

  /** Show the next beat. Returns it, or null if nothing is pending. Alias: skip. */
  advance(): BroadcastBeat | null {
    if (!this.hasPending()) return null;
    this.cursor += 1;
    return this.beats[this.cursor] ?? null;
  }

  /** Skip the current beat and move straight to the next (same as advance). */
  skip(): BroadcastBeat | null {
    return this.advance();
  }

  /** Present every remaining beat at once (skip-sequence / reduced-motion / tests). */
  drain(): void {
    this.cursor = this.beats.length - 1;
  }

  isPlaying(): boolean {
    return this.playing && !this.reducedMotion;
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  togglePlay(): void {
    this.playing = !this.playing;
  }

  isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    if (value) this.drain();
  }

  /** All beats presented so far (index 0 … active), in order. */
  presented(): BroadcastBeat[] {
    return this.cursor >= 0 ? this.beats.slice(0, this.cursor + 1) : [];
  }

  /** Every beat ever enqueued, in order. */
  all(): readonly BroadcastBeat[] {
    return this.beats;
  }

  cursorIndex(): number {
    return this.cursor;
  }

  /**
   * The score as it should read on screen right now: the score carried by the
   * most recent presented beat that changed or confirmed it. Goals stamp the
   * new score, so the score can never move ahead of the goal beat.
   */
  presentedScore(): { player: number; opponent: number } {
    for (let i = this.cursor; i >= 0; i -= 1) {
      const score = this.beats[i]?.score;
      if (score) return { ...score };
    }
    return { player: 0, opponent: 0 };
  }

  /** Clear everything back to an empty, pre-kickoff queue. */
  reset(): void {
    this.beats = [];
    this.cursor = -1;
    this.playing = true;
  }
}
