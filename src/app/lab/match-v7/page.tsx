'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';

/**
 * Kickoff Clash V7 — the isolated live-match slice (integration PR). An UNLINKED
 * development route: the live root game at / stays V6 and never links here, so
 * production users cannot wander in, but direct navigation / refresh work in the
 * static build. Client-only so the headless V7 engine runs in the browser.
 *
 * Entry: /lab/match-v7  (see src/game-v7/ for the adapter + controller).
 *
 * The heading + loading state below render in the prerendered HTML (before any
 * JS), so this route is never a blank white page: if you see the heading but no
 * match, the client bundle failed to load or the controller failed to init —
 * distinct from the route not rendering at all. Failures surface via error.tsx.
 */

// Inline styles so the frame is visible even before the lazy component's CSS loads.
const frame = {
  minHeight: '100vh',
  margin: '0 auto',
  maxWidth: 900,
  padding: '16px 14px',
  background: '#0e1a12',
  color: '#e8f3ec',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export function V7Frame({ children }: { children: ReactNode }) {
  return (
    <div style={frame}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Kickoff Clash — V7 match lab</h1>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8fb6a0', marginBottom: 12 }}>
        dev slice · /lab/match-v7
      </div>
      {children}
    </div>
  );
}

const V7MatchLab = dynamic(() => import('@/components/match-v7/V7MatchLab'), {
  ssr: false,
  loading: () => (
    <V7Frame>
      <p style={{ color: '#8fb6a0' }}>Loading the V7 match…</p>
    </V7Frame>
  ),
});

export default function V7LabPage() {
  return <V7MatchLab />;
}
