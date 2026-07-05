'use client';

import dynamic from 'next/dynamic';

/**
 * The KC rebuild (Phase 5, NW-143) — runs the new src/engine/ game loop in
 * parallel with the live game at /. Client-only: run state restores from
 * localStorage at first render. The default flip is the last step of Phase 5,
 * gated on playtest sign-off.
 */
const RebuildShell = dynamic(() => import('../../components/rebuild/RebuildShell'), { ssr: false });

export default function RebuildPage() {
  return <RebuildShell />;
}
