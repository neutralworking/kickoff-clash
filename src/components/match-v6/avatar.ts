/** Deterministic CSS-avatar palette from a card id — varied portraits without art assets. */
import type { CSSProperties } from 'react';

const SHIRTS = ['#d85738', '#4e92c2', '#d5a53b', '#6dba75', '#8d63d8', '#c04a43', '#d94d4d', '#df6536'];
const SKINS = ['#b56f45', '#8b5438', '#c8865b', '#7b492f', '#d59a70', '#a76745', '#925638'];
const HAIRS = ['', 'spike', 'mohawk', ''];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarFor(id: string): { style: CSSProperties; hair: string } {
  const h = hash(id);
  const hue = h % 360;
  const style = {
    '--av1': `hsl(${hue} 34% 42%)`,
    '--av2': `hsl(${hue} 40% 18%)`,
    '--shirt': SHIRTS[h % SHIRTS.length],
    '--skin': SKINS[(h >> 3) % SKINS.length],
  } as CSSProperties;
  return { style, hair: HAIRS[(h >> 5) % HAIRS.length] };
}
