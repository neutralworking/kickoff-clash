// Slice the roster sprite sheets into a deduped portrait POOL for the cards.
//
//   node scripts/slice-portraits.mjs <sheetsDir>
//
// Each sheet is a uniform grid of head-and-shoulders portraits. Player rows and
// manager rows are declared per sheet below. Tiles are cropped on grid
// boundaries (with a small inset to drop the gutter lines), re-encoded to JPEG,
// sha1-deduped, and written to public/portraits/{players,managers}/ with a
// pool.json index that the resolver (src/components/cards/portrait.ts) reads.
//
// The source sheets are NOT committed (they're large); they live in the design
// upload archive. Point <sheetsDir> at wherever they're unpacked and re-run to
// regenerate. Card→face assignment is deterministic (by card id), so the pool
// order only shifts which face lands on which card — always stable per build.
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: node scripts/slice-portraits.mjs <sheetsDir>');
  process.exit(1);
}
const OUT = path.join(process.cwd(), 'public/portraits');
const playersDir = path.join(OUT, 'players');
const managersDir = path.join(OUT, 'managers');
for (const d of [playersDir, managersDir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

// file, w, h, cols, rows, playerRows[], mgrRows[]. Rows not listed are skipped
// (e.g. a mixed player/manager row we can't cleanly classify).
const sheets = [
  { f: 's_1536.png', w: 1536, h: 1024, cols: 10, rows: 5, playerRows: [0,1,2,3], mgrRows: [] },
  { f: 's_a.png',    w: 1448, h: 1086, cols: 10, rows: 6, playerRows: [0,1,2,3,4], mgrRows: [5] },
  { f: 's_b.png',    w: 1448, h: 1086, cols: 10, rows: 6, playerRows: [0,1,2,3,4], mgrRows: [5] },
  { f: 's_c.png',    w: 1448, h: 1086, cols: 10, rows: 6, playerRows: [0,1,2,3,4], mgrRows: [5] },
];

const bound = (i, n, total) => Math.round((i * total) / n);
const players = new Map(), managers = new Map();
let pIdx = 0, mIdx = 0, pDupes = 0, mDupes = 0;

for (const s of sheets) {
  if (!fs.existsSync(path.join(SRC, s.f))) { console.warn(`skip missing ${s.f}`); continue; }
  for (let r = 0; r < s.rows; r++) {
    const isPlayer = s.playerRows.includes(r), isMgr = s.mgrRows.includes(r);
    if (!isPlayer && !isMgr) continue;
    const top = bound(r, s.rows, s.h), bot = bound(r + 1, s.rows, s.h);
    for (let c = 0; c < s.cols; c++) {
      const left = bound(c, s.cols, s.w), right = bound(c + 1, s.cols, s.w), inset = 3;
      const region = { left: left + inset, top: top + inset, width: (right - left) - inset * 2, height: (bot - top) - inset * 2 };
      const buf = await sharp(path.join(SRC, s.f)).extract(region).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      const hash = crypto.createHash('sha1').update(buf).digest('hex');
      const [map, dir, prefix, pad] = isPlayer ? [players, playersDir, 'p', 3] : [managers, managersDir, 'm', 2];
      if (map.has(hash)) { isPlayer ? pDupes++ : mDupes++; continue; }
      const name = `${prefix}${String(isPlayer ? pIdx++ : mIdx++).padStart(pad, '0')}.jpg`;
      fs.writeFileSync(path.join(dir, name), buf);
      map.set(hash, name);
    }
  }
}

const pool = { players: [...players.values()].sort(), managers: [...managers.values()].sort() };
fs.writeFileSync(path.join(OUT, 'pool.json'), JSON.stringify(pool, null, 2) + '\n');
console.log(`players: ${pool.players.length} unique (+${pDupes} dupes)  managers: ${pool.managers.length} unique (+${mDupes} dupes)`);
