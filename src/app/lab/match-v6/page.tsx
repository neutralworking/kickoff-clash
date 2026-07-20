'use client';

import dynamic from 'next/dynamic';

/**
 * Kickoff Clash V6 — the isolated match laboratory (spec §5). Client-only so the
 * headless engine runs in the browser without SSR; the live root game at / is
 * untouched. See docs/KC_V6_SPEC_DECISIONS.md.
 */
const V6MatchLab = dynamic(() => import('@/components/match-v6/V6MatchLab'), { ssr: false });

export default function V6LabPage() {
  return <V6MatchLab />;
}
