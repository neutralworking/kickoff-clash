/**
 * Kickoff Clash — ContestIcons + ChargePips
 *
 * Two tiny, reusable card widgets that stay crisp pixel art on every card surface.
 *
 *  • ContestIcons — a row of up to six pixel glyph badges (one per contest a card
 *    helps with), in CONTEST_ORDER. Attack-side contests read WARM, defence-side
 *    COOL (colours + glyphs from cardTokens `CONTEST_ICON`). Tiny and legible on a
 *    phone; renders nothing for an empty list so an identity manager / neutral
 *    tactic simply omits the row.
 *
 *  • ChargePips — a tactic's called-play charges: `capacity` square pips (capacity
 *    = its rarity), the first `charges` filled in the category accent, the rest
 *    hollow. A fresh/full card fills every pip.
 *
 * Both are flat-tint, hard-edged (`crispEdges`, integer rects) — no gradients, no
 * blur — so they sit on a Pixel-Hero face without breaking the pixel law.
 */

import { CONTEST_ICON } from './cardTokens';
import { CONTEST_META, type ContestKey } from '../../lib/contest-map';

/** A row of contest badges. Keys are expected pre-ordered (contestsForX returns
 *  them in CONTEST_ORDER); renders nothing for an empty list. */
export function ContestIcons({
  keys,
  full = false,
  align = 'start',
}: {
  keys: ContestKey[];
  full?: boolean;
  align?: 'start' | 'end';
}) {
  if (!keys.length) return null;
  const box = full ? 15 : 11;
  return (
    <div
      role="list"
      aria-label="Contests this card helps with"
      style={{
        display: 'flex',
        gap: full ? 4 : 2.5,
        flexWrap: 'nowrap',
        minWidth: 0,
        justifyContent: align === 'end' ? 'flex-end' : 'flex-start',
      }}
    >
      {keys.map((k) => (
        <ContestBadge key={k} contest={k} box={box} />
      ))}
    </div>
  );
}

function ContestBadge({ contest, box }: { contest: ContestKey; box: number }) {
  const st = CONTEST_ICON[contest];
  const meta = CONTEST_META[contest];
  const inner = box - 4;
  return (
    <span
      role="listitem"
      title={`${meta.label} — ${meta.blurb}`}
      aria-label={meta.label}
      style={{
        width: box,
        height: box,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: st.bg,
        border: `1px solid ${st.color}`,
        borderRadius: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.28)',
      }}
    >
      <svg
        className="pixelated"
        viewBox="0 0 7 7"
        width={inner}
        height={inner}
        shapeRendering="crispEdges"
        aria-hidden
        style={{ display: 'block' }}
      >
        {st.glyph.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={st.color} />
        ))}
      </svg>
    </span>
  );
}

/** A tactic's charge pips — `capacity` squares, first `charges` filled in `accent`. */
export function ChargePips({
  capacity,
  charges,
  accent,
  full = false,
}: {
  capacity: number;
  charges: number;
  accent: string;
  full?: boolean;
}) {
  const pip = full ? 9 : 6;
  const filled = Math.max(0, Math.min(capacity, charges));
  return (
    <div
      className="flex items-center"
      style={{ gap: full ? 4 : 3, flexShrink: 0 }}
      aria-label={`${filled} of ${capacity} charges`}
    >
      {Array.from({ length: capacity }).map((_, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            aria-hidden
            style={{
              width: pip,
              height: pip,
              borderRadius: full ? 2 : 1,
              background: on ? accent : 'transparent',
              border: `1px solid ${on ? accent : 'rgba(242,234,214,0.4)'}`,
              boxShadow: on
                ? 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.35), 0 0 0 1px rgba(11,7,3,0.5)'
                : 'inset 0 0 0 1px rgba(0,0,0,0.35)',
            }}
          />
        );
      })}
    </div>
  );
}
