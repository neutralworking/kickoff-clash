/**
 * Fictional card-pool generator (Phase: data port D.2).
 *
 * Samples the REAL Chief Scout distributions (pulled live from staging via MCP, embedded
 * below as compact aggregates — no PII) to emit a FICTIONAL card pool that inherits the
 * real structure: the flat skillset mix (fixing the Creator/Dribbler skew), per-skillset
 * pillar profiles, the position→skillset joint, BRS-as-power, role + evocative nickname.
 * Player names are invented, so no real likeness is used; nations are real footballing
 * countries (a country label carries no personal likeness) with matching flag emoji.
 *
 * Run:  npx tsx scripts/generate-cards.ts [count]   → writes public/data/kc_cards.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNT = Number(process.argv[2] ?? 540);

// --- Embedded real distributions (Chief Scout staging, card-ready BRS≥55) ---

// position × primary-skillset joint: [pos, skillset, weight n, cell BRS avg, modal role]
const CELLS: [string, string, number, number, string][] = [
  ['AM','Creator',119,70,'Trequartista'],['AM','Sprinter',114,67,'Trequartista'],['AM','Dribbler',78,70,'Trequartista'],['AM','Passer',50,67,'Enganche'],['AM','Powerhouse',38,69,'Trequartista'],['AM','Striker',34,72,'Trequartista'],['AM','Engine',29,73,'Trequartista'],['AM','Commander',26,60,'Enganche'],['AM','Target',12,65,'Enganche'],
  ['CD','Destroyer',491,71,'Stopper'],['CD','Cover',347,69,'Sweeper'],['CD','Powerhouse',190,70,'Stopper'],['CD','Engine',114,70,'Stopper'],['CD','Target',59,69,'Colossus'],['CD','Sprinter',39,68,'Sweeper'],['CD','Dribbler',37,70,'Centrale'],['CD','Passer',21,66,'Centrale'],['CD','Commander',19,64,'Centrale'],['CD','Striker',14,67,'Centrale'],['CD','Creator',13,71,'Colossus'],
  ['CF','Striker',375,72,'Prima Punta'],['CF','Sprinter',182,69,'Vertical Forward'],['CF','Target',131,69,'Prima Punta'],['CF','Powerhouse',88,66,'Prima Punta'],['CF','Dribbler',74,67,'Vertical Forward'],['CF','Creator',67,69,'Seconda Punta'],['CF','Commander',57,60,'Seconda Punta'],
  ['CM','Cover',415,68,'Tuttocampista'],['CM','Powerhouse',413,68,'Tuttocampista'],['CM','Engine',404,68,'Tuttocampista'],['CM','Destroyer',361,68,'Tuttocampista'],['CM','Sprinter',304,67,'Playmaker'],['CM','Dribbler',267,67,'Playmaker'],['CM','Creator',266,69,'Playmaker'],['CM','Target',147,65,'Tuttocampista'],['CM','Passer',147,67,'Playmaker'],['CM','Striker',135,67,'Playmaker'],['CM','Commander',66,61,'Playmaker'],
  ['DM','Engine',220,67,'Anchor'],['DM','Powerhouse',98,69,'Anchor'],['DM','Destroyer',77,72,'Anchor'],['DM','Cover',56,72,'Anchor'],['DM','Creator',20,74,'Regista'],['DM','Dribbler',18,70,'Regista'],['DM','Sprinter',17,68,'Segundo Volante'],
  ['GK','Shotstopper',55,70,'Distributor'],
  // Controller is canon (doc §1) but its low primary count is an inference artefact, so
  // it fell below the cell threshold — seed a small deliberate presence so it's not folded.
  ['CM','Controller',34,71,'Metodista'],['DM','Controller',22,72,'Pivote'],['AM','Controller',14,70,'Mediapunta'],
  ['WD','Sprinter',180,70,'Fullback'],['WD','Creator',135,74,'Wing-back'],['WD','Powerhouse',122,70,'Fullback'],['WD','Engine',94,74,'Fullback'],['WD','Cover',88,72,'Fullback'],['WD','Destroyer',67,72,'Fullback'],['WD','Dribbler',19,71,'Fullback'],['WD','Commander',18,64,'Wing-back'],['WD','Target',15,70,'Auxiliary CB'],
  ['WF','Sprinter',273,69,'Inverted Winger'],['WF','Creator',255,72,'Inverted Winger'],['WF','Dribbler',225,67,'Inverted Winger'],['WF','Striker',158,71,'Inverted Winger'],['WF','Powerhouse',77,66,'Inverted Winger'],['WF','Engine',34,73,'Inverted Winger'],['WF','Passer',25,71,'Half-Space Creator'],['WF','Target',20,68,'Inverted Winger'],['WF','Commander',16,63,'Inverted Winger'],
  ['WM','Creator',304,66,'Wide Playmaker'],['WM','Sprinter',205,66,'Wide Playmaker'],['WM','Dribbler',177,65,'Wide Playmaker'],['WM','Engine',77,65,'Tornante'],['WM','Powerhouse',76,68,'Wide Playmaker'],['WM','Striker',72,66,'Wide Playmaker'],['WM','Passer',37,69,'Wide Playmaker'],['WM','Cover',27,67,'Wide Playmaker'],['WM','Target',15,64,'Wide Playmaker'],['WM','Commander',13,61,'Wide Playmaker'],
];

// per-skillset: BRS avg/sd + pillar means/sds [tec,tac,men,phy] + sds
const SK: Record<string, { brsAvg: number; brsSd: number; tec: number; tac: number; men: number; phy: number; sd: [number,number,number,number] }> = {
  Sprinter:   { brsAvg:68, brsSd:6, tec:51, tac:48, men:51, phy:48, sd:[11,14,10,12] },
  Creator:    { brsAvg:70, brsSd:8, tec:55, tac:48, men:56, phy:49, sd:[13,15,13,14] },
  Powerhouse: { brsAvg:68, brsSd:5, tec:53, tac:49, men:53, phy:52, sd:[10,12,10,12] },
  Destroyer:  { brsAvg:70, brsSd:6, tec:54, tac:50, men:53, phy:53, sd:[11,13,11,13] },
  Engine:     { brsAvg:69, brsSd:7, tec:51, tac:49, men:51, phy:49, sd:[13,14,13,14] },
  Cover:      { brsAvg:69, brsSd:6, tec:54, tac:49, men:53, phy:48, sd:[11,13,11,14] },
  Dribbler:   { brsAvg:67, brsSd:7, tec:52, tac:48, men:51, phy:46, sd:[12,14,11,12] },
  Striker:    { brsAvg:70, brsSd:8, tec:55, tac:54, men:54, phy:50, sd:[13,14,12,14] },
  Target:     { brsAvg:67, brsSd:6, tec:48, tac:48, men:47, phy:50, sd:[11,13,11,13] },
  Passer:     { brsAvg:68, brsSd:6, tec:53, tac:47, men:53, phy:44, sd:[12,14,12,12] },
  Commander:  { brsAvg:62, brsSd:4, tec:39, tac:39, men:38, phy:30, sd:[11,15,9,9] },
  Shotstopper:{ brsAvg:70, brsSd:9, tec:60, tac:53, men:55, phy:56, sd:[14,16,11,16] },
  Controller: { brsAvg:74, brsSd:7, tec:62, tac:55, men:62, phy:48, sd:[12,12,12,10] },
};

// skillset → evocative nicknames (the Archetype identity), weighted by real frequency
const NICK: Record<string, [string, number][]> = {
  Sprinter:[['Rocket',985],['Conjurer',147],['Pitbull',65],['Arrow',60]], Creator:[['Conjurer',518],['Maestro',279],['Wizard',60]],
  Powerhouse:[['Totem',369],['Pitbull',163],['Colossus',154]], Destroyer:[['Pitbull',667],['Colossus',213],['Generale',84]],
  Engine:[['Pitbull',228],['Generale',205],['Colossus',135],['Shuttle',60]], Cover:[['Colossus',584],['Pitbull',107],['Kaiser',66]],
  Dribbler:[['Conjurer',297],['Fenômeno',152],['Ghost',60]], Striker:[['Bomber',306],['Fenômeno',215],['Arrow',65]],
  Target:[['Totem',158],['Colossus',93],['Bomber',38]], Passer:[['Maestro',52],['Metronome',50],['Conjurer',40]],
  Commander:[['Generale',40],['Kaiser',32],['Maestro',29]], Shotstopper:[['Wall',14],['Kaiser',8],['Rocket',8]],
  Controller:[['Metronome',5],['Maestro',3],['Generale',3]],
};

const THEME_BY_SK: Record<string, string> = {
  Creator:'Maestro', Passer:'Maestro', Controller:'Maestro', Commander:'Captain',
  Destroyer:'General', Powerhouse:'General', Target:'General', Cover:'General',
  Sprinter:'Catalyst', Dribbler:'Catalyst', Striker:'Catalyst', Engine:'Professor', Shotstopper:'Professor',
};
const THEMES = ['Catalyst','Captain','Maestro','General','Professor'];

const FIRST = ['Andre','Marco','Diego','Luka','Kai','Theo','Noa','Leon','Mateo','Hugo','Ivan','Omar','Yuki','Tariq','Felix','Bruno','Joel','Niko','Pavel','Sami','Carlos','Dani','Emre','Finn','Goran','Hassan','Iker','Janos','Kofi','Lars','Milos','Nuno','Osman','Pedro','Rashid','Sven','Tomas','Ugo','Vito','Wim','Xabi','Yann','Zito','Aron','Bekele','Cesar','Dario','Enzo','Florian','Gael'];
const LAST = ['Vossen','Renard','Haldor','Kessler','Brandt','Marek','Sorin','Calder','Drobny','Ferreira','Lindqvist','Okoro','Vasquez','Petrov','Norebo','Achterberg','Salvi','Konno','Dembaro','Ravel','Tessier','Olund','Berisha','Maganga','Ivankov','Quintero','Faxe','Holloway','Strand','Reuben','Costa','Adeyemi','Vornov','Larsson','Belmonte','Hage','Cisse','Truong','Maldano','Roux','Skoglund','Vargic','Nieto','Halversen','Okafor','Pasic','Lindholm','Esquivel','Brunner','Talbot','Moreno','Janssen','Bauer','Novak','Fontaine','Delgado','Keita','Suzuki','Ozturk','Andersen'];
const NATIONS = ['England','Denmark','Brazil','Norway','Croatia','Spain','France','Germany','Italy','Argentina','Scotland','Uruguay','Portugal','Netherlands','Belgium'];

// --- seeded RNG ---
let seed = 20260629;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = (m: number, s: number) => m + s * Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function weightedPick<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0); let r = rnd() * total;
  for (const [it, w] of items) { r -= w; if (r <= 0) return it; } return items[0][0];
}

// Cell weights, with GK boosted (real GK count is a data-pillar artefact; a squad needs ~1/11).
const cellWeights: [number, number][] = CELLS.map((c, i) => [i, c[0] === 'GK' ? c[2] * 20 : c[2]]);
const brsBandRarity = (b: number) => b >= 88 ? 'Legendary' : b >= 80 ? 'Epic' : b >= 70 ? 'Rare' : 'Common';

interface GenCard {
  id: number;
  name: string;
  position: string;
  skillset: string;
  secondarySkillset?: string;
  role: string;
  nickname: string;
  brs: number;
  rarity: string;
  pillars: { technical: number; tactical: number; mental: number; physical: number };
  theme: string;
  nation: string;
}

const seen = new Set<string>();
const cards: GenCard[] = [];
for (let i = 0; i < COUNT; i++) {
  const ci = weightedPick(cellWeights);
  const [pos, skillset, , cellBrs, role] = CELLS[ci];
  const prof = SK[skillset];
  const brs = clamp(Math.round(gauss(cellBrs, prof.brsSd)), 52, 95);
  const scale = Math.pow(brs / prof.brsAvg, 1.8);
  const pillar = (mean: number, sd: number) => clamp(Math.round(mean * scale + gauss(0, sd * 0.5)), 20, 99);
  // a secondary skillset: another skillset common at this position (~65% of cards)
  const sameposSk = CELLS.filter(c => c[0] === pos && c[1] !== skillset).map(c => [c[1], c[2]] as [string, number]);
  const secondary = sameposSk.length && rnd() < 0.65 ? weightedPick(sameposSk) : undefined;
  // name (deduped)
  let name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
  let guard = 0; while (seen.has(name) && guard++ < 50) name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
  seen.add(name);
  const theme = rnd() < 0.75 ? (THEME_BY_SK[skillset] ?? 'General') : THEMES[Math.floor(rnd() * THEMES.length)];

  cards.push({
    id: i + 1,
    name,
    position: pos,
    skillset,
    secondarySkillset: secondary,
    role,
    nickname: weightedPick(NICK[skillset] ?? [['Talisman', 1]]),
    brs,
    rarity: brsBandRarity(brs),
    pillars: { technical: pillar(prof.tec, prof.sd[0]), tactical: pillar(prof.tac, prof.sd[1]), mental: pillar(prof.men, prof.sd[2]), physical: pillar(prof.phy, prof.sd[3]) },
    theme,
    nation: NATIONS[Math.floor(rnd() * NATIONS.length)],
  });
}

const outPath = path.join(__dirname, '..', 'public', 'data', 'kc_cards.json');
fs.writeFileSync(outPath, JSON.stringify(cards, null, 0));

// --- report ---
const by = (k: (c: typeof cards[0]) => string) => cards.reduce<Record<string, number>>((a, c) => (a[k(c)] = (a[k(c)] ?? 0) + 1, a), {});
const pct = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${(100 * n / cards.length).toFixed(1)}%`).join(' · ');
console.log(`\nGenerated ${cards.length} fictional cards → public/data/kc_cards.json`);
console.log(`BRS: min ${Math.min(...cards.map(c => c.brs))} max ${Math.max(...cards.map(c => c.brs))} avg ${Math.round(cards.reduce((s, c) => s + c.brs, 0) / cards.length)}`);
console.log(`Rarity: ${pct(by(c => c.rarity))}`);
console.log(`Skillset: ${pct(by(c => c.skillset))}`);
console.log(`Position: ${pct(by(c => c.position))}`);
