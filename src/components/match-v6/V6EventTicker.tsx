'use client';

export interface Tick {
  kind: 'goal' | 'reveal' | 'info';
  text: string;
}

export function V6EventTicker({ ticks }: { ticks: Tick[] }) {
  if (ticks.length === 0) return <div className="v6-subcopy">A quiet period — no goals.</div>;
  return (
    <div className="v6-ticker">
      {ticks.map((t, i) => (
        <div key={i} className={`v6-tick ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
