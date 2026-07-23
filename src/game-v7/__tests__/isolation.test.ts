import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// V6 stays the default; V7 is reachable only through its own dev route. These are
// structural guards (no React render) proving the engine choice does not leak
// into unrelated screens.

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('engine isolation', () => {
  it('the default route does not pull in the V7 engine or game layer', () => {
    const page = read('src/app/page.tsx');
    expect(page).not.toContain('@/game-v7');
    expect(page).not.toContain('@/engine-v7');
  });

  it('the live GameShell does not depend on the V7 layer', () => {
    const shell = read('src/components/GameShell.tsx');
    expect(shell).not.toContain('@/game-v7');
    expect(shell).not.toContain('@/engine-v7');
  });

  it('the dedicated V7 route mounts the V7 lab', () => {
    const route = read('src/app/lab/match-v7/page.tsx');
    expect(route).toContain('match-v7/V7MatchLab');
  });

  it('only the match-v7 component tree imports the V7 game layer', () => {
    const appFiles = walk(join(ROOT, 'src', 'app'));
    const componentFiles = walk(join(ROOT, 'src', 'components'));
    const offenders: string[] = [];
    for (const file of [...appFiles, ...componentFiles]) {
      if (file.includes('match-v7') || file.includes(join('lab', 'match-v7'))) continue;
      if (readFileSync(file, 'utf8').includes('@/game-v7')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
