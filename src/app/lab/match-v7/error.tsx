'use client';

/**
 * Route-level error boundary for the V7 match lab. Any error thrown while
 * rendering the route (including controller initialisation) shows a useful
 * diagnostic here instead of a blank white page.
 */
export default function V7LabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        margin: '0 auto',
        maxWidth: 900,
        padding: '16px 14px',
        background: '#0e1a12',
        color: '#e8f3ec',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Kickoff Clash — V7 match lab</h1>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8fb6a0', marginBottom: 12 }}>
        dev slice · /lab/match-v7
      </div>
      <p style={{ color: '#ff6b6b', fontWeight: 700 }}>The V7 match failed to start.</p>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 12,
          background: '#14241a',
          border: '1px solid rgba(120,200,150,0.16)',
          borderRadius: 8,
          padding: 12,
          color: '#ffb454',
        }}
      >
        {error?.message ?? String(error)}
        {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
      </pre>
      <button
        type="button"
        onClick={reset}
        style={{ marginTop: 12, border: '1px solid rgba(120,200,150,0.16)', background: '#57d98b', color: '#06210f', borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  );
}
