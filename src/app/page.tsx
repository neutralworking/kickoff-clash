'use client';

import dynamic from 'next/dynamic';

/**
 * The LIVE game — the six-contest engine-v2 run loop (NW-139…143), promoted
 * from /play to the root. Client-only: the run restores from localStorage at
 * first render, and the card pool is fetched from /data/kc_v2_cards.json.
 * The SCORING_V2 game is parked at /classic.
 */
const PlayShell = dynamic(() => import('../components/play/PlayShell'), { ssr: false });

export default function Home() {
  return <PlayShell />;
}
