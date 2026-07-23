'use client';

import dynamic from 'next/dynamic';

/**
 * Kickoff Clash V7 — the isolated live-match slice (integration PR). An UNLINKED
 * development route: the live root game at / stays V6 and never links here, so
 * production users cannot wander in, but direct navigation / refresh work in the
 * static build. Client-only so the headless V7 engine runs in the browser.
 *
 * Entry: /lab/match-v7  (see src/game-v7/ for the adapter + controller).
 */
const V7MatchLab = dynamic(() => import('@/components/match-v7/V7MatchLab'), { ssr: false });

export default function V7LabPage() {
  return <V7MatchLab />;
}
