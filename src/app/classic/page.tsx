'use client';

import GameShell from '../../components/GameShell';

/**
 * The classic SCORING_V2 game (one currency · three contests · two dice),
 * parked here when the six-contest engine-v2 game took over the root route.
 * Kept playable for comparison playtests; its run state lives under its own
 * localStorage key, so the two games never touch each other's saves.
 */
export default function ClassicPage() {
  return <GameShell />;
}
