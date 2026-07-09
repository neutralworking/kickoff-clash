'use client';

import dynamic from 'next/dynamic';

/**
 * KC six-contest game (NW-143, P5) — the engine-v2 run loop, playable at /play.
 * Client-only: the run restores from localStorage at first render, and the card
 * pool is fetched from /data/kc_v2_cards.json.
 */
const PlayShell = dynamic(() => import('../../components/play/PlayShell'), { ssr: false });

export default function PlayPage() {
  return <PlayShell />;
}
