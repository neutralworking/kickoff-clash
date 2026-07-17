/**
 * Kickoff Clash — hand-drawn CLASS GLYPHS (design_handoff_player_cards).
 *
 * The six class marks that sit inside the top-left class disc of every portrait
 * card (player + manager). Ported 1:1 from the mock's `classIcon()` — clean
 * stroked line-art on a 0..32 viewBox, tuned so each class reads instantly at
 * disc size (~14px glyph on a ~26px disc up to ~24px on a ~44px disc):
 *
 *   Creator    — a lightbulb + rays (the idea / the final ball)
 *   Engine     — a spanner-arm dynamo (covers every blade)
 *   Wall       — a crested shield with brickwork (nothing gets through)
 *   Finisher   — a target / crosshair (puts them away)
 *   Controller — a dial with a pointer (dictates the tempo)
 *   Destroyer  — crossed blades (wins the ball back)
 *   GK         — reuses the Wall crest.
 *
 * The glyph is pure vector line-art (the card's GLASS chrome layer, not a pixel
 * sprite), so it may anti-alias — it never touches the pixel portrait interior.
 */

import type { PlayerClass } from '../../lib/contest-map';

interface ClassGlyphProps {
  cls: PlayerClass | string;
  size: number;
  /** Stroke / fill ink (white, or dark on the light Engine/Finisher discs). */
  color: string;
}

export default function ClassGlyph({ cls, size, color }: ClassGlyphProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { display: 'block' },
    'aria-hidden': true,
  };

  switch (cls) {
    case 'Creator':
      return (
        <svg {...common} strokeWidth={2.3}>
          <path d="M16 5 A7 7 0 0 1 20 18 C18.8 19 18.4 20 18.3 21.4 H13.7 C13.6 20 13.2 19 12 18 A7 7 0 0 1 16 5 Z" />
          <path d="M13.4 24 H18.6" />
          <path d="M14.4 26.6 H17.6" />
        </svg>
      );
    case 'Engine':
      return (
        <svg {...common} strokeWidth={2.7}>
          <circle cx={19.6} cy={6.2} r={2.9} fill={color} stroke="none" />
          <path d="M18.7 9.4 L13.4 18.6" />
          <path d="M17.3 12 L23.2 9.7" />
          <path d="M17.3 12 L12 15.4" />
          <path d="M13.4 18.6 L19.6 17.4" />
          <path d="M19.6 17.4 L21.2 24.4" />
          <path d="M13.4 18.6 L8.6 26.2" />
        </svg>
      );
    case 'Finisher':
      return (
        <svg {...common} strokeWidth={2.2}>
          <circle cx={16} cy={16} r={11} />
          <circle cx={16} cy={16} r={5} />
          <circle cx={16} cy={16} r={1.6} fill={color} stroke="none" />
          <path d="M16 2 V6" />
          <path d="M16 26 V30" />
          <path d="M2 16 H6" />
          <path d="M26 16 H30" />
        </svg>
      );
    case 'Controller':
      return (
        <svg {...common} strokeWidth={2.2}>
          <circle cx={16} cy={16} r={11} />
          <path d="M16 6 V9" />
          <path d="M16 23 V26" />
          <path d="M6 16 H9" />
          <path d="M23 16 H26" />
          <path d="M16 16 L21.5 11.5" />
          <circle cx={16} cy={16} r={1.8} fill={color} stroke="none" />
        </svg>
      );
    case 'Destroyer':
      return (
        <svg {...common} strokeWidth={2.4}>
          <path d="M8 6 L23 22" />
          <path d="M20 5 L23 8 L21 10" />
          <path d="M6 20 L9 23 L11 21" />
          <path d="M24 6 L9 22" />
          <path d="M12 5 L9 8 L11 10" />
          <path d="M26 20 L23 23 L21 21" />
        </svg>
      );
    // Wall + GK (and any unmapped class) → the crested shield.
    default:
      return (
        <svg {...common} strokeWidth={2}>
          <path d="M16 3 L27 6.6 V14 C27 21 22 26.4 16 28.8 C10 26.4 5 21 5 14 V6.6 Z" />
          <path d="M6 12 H26" />
          <path d="M6 18.5 H25" />
          <path d="M13 8 V12" />
          <path d="M19 8 V12" />
          <path d="M16 12 V18.5" />
          <path d="M22 12 V18.5" />
          <path d="M10 12 V18.5" />
        </svg>
      );
  }
}
