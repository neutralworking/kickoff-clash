'use client';

import { useEffect, useState } from 'react';
import type { RevealEvent, V6Card } from '@/lib/match-v6';
import { avatarFor } from './avatar';

/**
 * Plays the break's reveals one at a time — a RECEIPT of the engine's
 * already-resolved `RevealEvent[]` (priority side first). The timer only paces
 * the animation; it never infers game state (spec §5). Tap Skip to jump to the end.
 */
export function V6RevealSequence(props: { reveals: RevealEvent[]; pool: Record<string, V6Card>; onDone: () => void }) {
  const { reveals, pool, onDone } = props;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reveals.length === 0) {
      const t = setTimeout(onDone, 300);
      return () => clearTimeout(t);
    }
    if (i >= reveals.length) {
      const t = setTimeout(onDone, 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI((v) => v + 1), 850);
    return () => clearTimeout(t);
  }, [i, reveals.length, onDone]);

  if (reveals.length === 0) return null;

  const ev = reveals[Math.min(i, reveals.length - 1)];
  const card = pool[ev.cardId];
  const av = card ? avatarFor(card.id) : null;
  const dir = ev.side === 'player' ? 'right' : 'left';

  return (
    <div className="v6-seq">
      <button className="v6-skip" onClick={() => setI(reveals.length)}>
        Skip →
      </button>
      <div className="v6-seq-label">
        {ev.side === 'player' ? 'You reveal' : 'They reveal'} · {ev.kind === 'sub_off' ? 'off' : ev.kind === 'reveal' ? 'on' : ev.kind}
      </div>
      <div key={i} className={`v6-reveal-card in-${dir} kind-${ev.kind}`}>
        {av && (
          <div className="v6-av" style={av.style}>
            {av.hair && <i className={`v6-hair ${av.hair}`} />}
          </div>
        )}
        <div className="rc-name">{card?.name ?? ev.cardId}</div>
        <div className="rc-text">{ev.text}</div>
      </div>
      <div className="v6-seq-dots">
        {reveals.map((_, k) => (
          <i key={k} className={k <= i ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
