import {
  V8_PERIODS,
  canDeployToZone,
  contributionInZone,
  deployPlayer,
  emptyV8Board,
  goalsFromAttackDefence,
  naturalZonePower,
  teamTotals,
  type V8Board,
  type V8PlayerCard,
  type V8Zone,
} from './core';

export interface V8SimulationSummary {
  games: number;
  averageCombinedGoals: number;
  averagePlayersDeployedPerTeam: number;
  drawRate: number;
  averageGoalsByPeriod: readonly number[];
  zoneShare: Record<V8Zone, number>;
  averageChanceCardsCreatedPerTeam: number;
  averageChanceCardsPlayedPerTeam: number;
  managerUseRate: number;
}

interface PrototypePlayer extends V8PlayerCard {
  createsChance?: 'cross' | 'through_ball';
  receivesCross?: boolean;
}

interface PrototypeChance {
  type: 'cross' | 'through_ball';
  cost: number;
  attackBoost: number;
}

interface SimulationTeam {
  drawPile: PrototypePlayer[];
  hand: PrototypePlayer[];
  board: V8Board;
  chances: PrototypeChance[];
  managerAvailable: boolean;
  score: number;
  deployed: number;
  zonePlays: Record<V8Zone, number>;
  chancesCreated: number;
  chancesPlayed: number;
  managerUsed: boolean;
}

interface TurnBoost {
  attack: number;
  defence: number;
}

class SimulationRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

function shuffle<T>(values: readonly T[], rng: SimulationRng): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function prototypeCost(card: Omit<PrototypePlayer, 'cost'>): number {
  return Math.max(1, Math.ceil(naturalZonePower(card) / 2));
}

function prototypePlayer(
  partial: Omit<PrototypePlayer, 'cost'> & { cost?: number },
): PrototypePlayer {
  return {
    ...partial,
    cost: partial.cost ?? prototypeCost(partial),
  };
}

const HOME_XI: readonly PrototypePlayer[] = [
  prototypePlayer({ id: 'h_gk', name: 'Otto Kerr', position: 'GK', printedAttack: 1, printedDefence: 6, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'h_lb', name: 'Rue Vance', position: 'LB', printedAttack: 3, printedDefence: 4, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'h_lcb', name: 'Dane Holt', position: 'CB', printedAttack: 2, printedDefence: 5, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'h_rcb', name: 'Ivo Senn', position: 'CB', printedAttack: 2, printedDefence: 4, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'h_rb', name: 'Cass Ojo', position: 'RB', printedAttack: 3, printedDefence: 4, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'h_lm', name: 'Lio Fen', position: 'LM', printedAttack: 6, printedDefence: 3, naturalZones: ['MID'] }),
  prototypePlayer({ id: 'h_cm', name: 'Ren Colm', position: 'CM', printedAttack: 7, printedDefence: 3, naturalZones: ['MID'], createsChance: 'through_ball' }),
  prototypePlayer({ id: 'h_rm', name: 'Tave Rune', position: 'RM', printedAttack: 6, printedDefence: 3, naturalZones: ['MID'], createsChance: 'cross' }),
  prototypePlayer({ id: 'h_lw', name: 'Rai Okonkwo', position: 'LW', printedAttack: 9, printedDefence: 2, naturalZones: ['ATT'] }),
  prototypePlayer({ id: 'h_cf', name: 'Niko Vale', position: 'CF', printedAttack: 9, printedDefence: 2, naturalZones: ['ATT'], receivesCross: true }),
  prototypePlayer({ id: 'h_rw', name: 'Juno Pike', position: 'RW', printedAttack: 9, printedDefence: 2, naturalZones: ['ATT'] }),
];

const AWAY_XI: readonly PrototypePlayer[] = [
  prototypePlayer({ id: 'a_gk', name: 'Bram Reef', position: 'GK', printedAttack: 1, printedDefence: 6, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'a_lcb', name: 'Sig Reed', position: 'CB', printedAttack: 2, printedDefence: 5, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'a_ccb', name: 'Tomas Lock', position: 'CB', printedAttack: 3, printedDefence: 6, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'a_rcb', name: 'Gio Pace', position: 'CB', printedAttack: 3, printedDefence: 4, naturalZones: ['DEF'] }),
  prototypePlayer({ id: 'a_lwb', name: 'Kes Rowan', position: 'LWB', printedAttack: 4, printedDefence: 3, naturalZones: ['MID'] }),
  prototypePlayer({ id: 'a_dm', name: 'Malik Daro', position: 'DM', printedAttack: 3, printedDefence: 4, naturalZones: ['MID'] }),
  prototypePlayer({ id: 'a_cm', name: 'Aris Nov', position: 'CM', printedAttack: 6, printedDefence: 3, naturalZones: ['MID'], createsChance: 'through_ball' }),
  prototypePlayer({ id: 'a_rwb', name: 'Rex Hale', position: 'RWB', printedAttack: 4, printedDefence: 3, naturalZones: ['MID'], createsChance: 'cross' }),
  prototypePlayer({ id: 'a_lf', name: 'Bo Marsh', position: 'LF', printedAttack: 8, printedDefence: 2, naturalZones: ['ATT'] }),
  prototypePlayer({ id: 'a_cf', name: 'Coby Wren', position: 'CF', printedAttack: 9, printedDefence: 2, naturalZones: ['ATT'], receivesCross: true }),
  prototypePlayer({ id: 'a_rf', name: 'Ravi Tuck', position: 'RF', printedAttack: 8, printedDefence: 2, naturalZones: ['ATT'] }),
];

function createTeam(xi: readonly PrototypePlayer[], rng: SimulationRng): SimulationTeam {
  const shuffled = shuffle(xi, rng);
  return {
    hand: shuffled.slice(0, 3),
    drawPile: shuffled.slice(3),
    board: emptyV8Board(),
    chances: [],
    managerAvailable: true,
    score: 0,
    deployed: 0,
    zonePlays: { DEF: 0, MID: 0, ATT: 0 },
    chancesCreated: 0,
    chancesPlayed: 0,
    managerUsed: false,
  };
}

function drawTwo(team: SimulationTeam): void {
  const drawn = team.drawPile.splice(0, 2);
  team.hand.push(...drawn);
}

function chanceFor(type: PrototypeChance['type']): PrototypeChance {
  return type === 'cross'
    ? { type, cost: 1, attackBoost: 3 }
    : { type, cost: 1, attackBoost: 4 };
}

function currentNetGoalBands(team: SimulationTeam, opponent: SimulationTeam, boost: TurnBoost): number {
  const own = teamTotals(team.board);
  const other = teamTotals(opponent.board);
  return goalsFromAttackDefence(own.attack + boost.attack, other.defence)
    - goalsFromAttackDefence(other.attack, own.defence + boost.defence);
}

function managerBoostForZone(board: V8Board, zone: V8Zone): TurnBoost {
  const count = board[zone].length;
  if (zone === 'ATT') return { attack: count * 2, defence: 0 };
  if (zone === 'DEF') return { attack: 0, defence: count * 2 };
  return { attack: count, defence: count };
}

function hasCrossReceiver(team: SimulationTeam): boolean {
  return team.board.ATT.some((deployed) => (deployed.card as PrototypePlayer).receivesCross);
}

function playGreedyTurn(
  team: SimulationTeam,
  opponent: SimulationTeam,
  startingEnergy: number,
  periodsRemaining: number,
): TurnBoost {
  let energy = startingEnergy;
  const boost: TurnBoost = { attack: 0, defence: 0 };
  const playableChanceCount = team.chances.length;
  const playedChanceIndices = new Set<number>();

  while (energy > 0) {
    const baseBands = currentNetGoalBands(team, opponent, boost);
    let best: { value: number; kind: 'player' | 'chance' | 'manager'; index: number; zone: V8Zone; cost: number; boost: TurnBoost } | null = null;

    for (let index = 0; index < team.hand.length; index += 1) {
      const card = team.hand[index]!;
      if (card.cost > energy) continue;

      for (const zone of ['DEF', 'MID', 'ATT'] as const) {
        if (!canDeployToZone(team.board, zone)) continue;
        const contribution = contributionInZone(card, zone);
        const provisionalBoard = deployPlayer(team.board, card, zone, team.deployed + 1);
        const originalBoard = team.board;
        team.board = provisionalBoard;
        const newBands = currentNetGoalBands(team, opponent, boost);
        team.board = originalBoard;

        const persistentValue = (contribution.attack + contribution.defence) * periodsRemaining;
        const value = (newBands - baseBands) * 100 + persistentValue - card.cost;
        if (best === null || value > best.value) {
          best = { value, kind: 'player', index, zone, cost: card.cost, boost: { attack: 0, defence: 0 } };
        }
      }
    }

    for (let index = 0; index < playableChanceCount; index += 1) {
      if (playedChanceIndices.has(index)) continue;
      const chance = team.chances[index]!;
      if (chance.cost > energy) continue;

      const receiverBonus = chance.type === 'cross' && hasCrossReceiver(team) ? 2 : 0;
      const chanceBoost = { attack: chance.attackBoost + receiverBonus, defence: 0 };
      const newBands = currentNetGoalBands(team, opponent, {
        attack: boost.attack + chanceBoost.attack,
        defence: boost.defence,
      });
      const value = (newBands - baseBands) * 100 + chanceBoost.attack - chance.cost;
      if (best === null || value > best.value) {
        best = { value, kind: 'chance', index, zone: 'ATT', cost: chance.cost, boost: chanceBoost };
      }
    }

    if (team.managerAvailable && energy >= 3) {
      for (const zone of ['DEF', 'MID', 'ATT'] as const) {
        if (team.board[zone].length === 0) continue;
        const managerBoost = managerBoostForZone(team.board, zone);
        const newBands = currentNetGoalBands(team, opponent, {
          attack: boost.attack + managerBoost.attack,
          defence: boost.defence + managerBoost.defence,
        });
        const value = (newBands - baseBands) * 100 + managerBoost.attack + managerBoost.defence - 3;
        if (best === null || value > best.value) {
          best = { value, kind: 'manager', index: 0, zone, cost: 3, boost: managerBoost };
        }
      }
    }

    if (best === null || best.value <= 0) break;
    energy -= best.cost;

    if (best.kind === 'player') {
      const [card] = team.hand.splice(best.index, 1);
      if (!card) break;
      team.deployed += 1;
      team.zonePlays[best.zone] += 1;
      team.board = deployPlayer(team.board, card, best.zone, team.deployed);
      if (card.createsChance) {
        team.chances.push(chanceFor(card.createsChance));
        team.chancesCreated += 1;
      }
    } else if (best.kind === 'chance') {
      boost.attack += best.boost.attack;
      boost.defence += best.boost.defence;
      playedChanceIndices.add(best.index);
      team.chancesPlayed += 1;
    } else {
      boost.attack += best.boost.attack;
      boost.defence += best.boost.defence;
      team.managerAvailable = false;
      team.managerUsed = true;
    }
  }

  if (playedChanceIndices.size > 0) {
    team.chances = team.chances.filter((_, index) => !playedChanceIndices.has(index));
  }

  return boost;
}

function simulateOne(seed: number, energyCurve: readonly number[]): { home: SimulationTeam; away: SimulationTeam; periodGoals: number[] } {
  if (energyCurve.length !== V8_PERIODS.length) throw new Error('V8 simulation energy curve must contain four periods');

  const rng = new SimulationRng(seed);
  const home = createTeam(HOME_XI, rng);
  const away = createTeam(AWAY_XI, rng);
  const periodGoals: number[] = [];

  for (let periodIndex = 0; periodIndex < V8_PERIODS.length; periodIndex += 1) {
    drawTwo(home);
    drawTwo(away);

    const periodsRemaining = V8_PERIODS.length - periodIndex;
    const homeBoost = playGreedyTurn(home, away, energyCurve[periodIndex]!, periodsRemaining);
    const awayBoost = playGreedyTurn(away, home, energyCurve[periodIndex]!, periodsRemaining);
    const homeTotals = teamTotals(home.board);
    const awayTotals = teamTotals(away.board);
    const homeGoals = goalsFromAttackDefence(homeTotals.attack + homeBoost.attack, awayTotals.defence + awayBoost.defence);
    const awayGoals = goalsFromAttackDefence(awayTotals.attack + awayBoost.attack, homeTotals.defence + homeBoost.defence);

    home.score += homeGoals;
    away.score += awayGoals;
    periodGoals.push(homeGoals + awayGoals);
  }

  return { home, away, periodGoals };
}

export function simulatePrototypeBatch(
  games: number,
  energyCurve: readonly number[],
  seedOffset = 1,
): V8SimulationSummary {
  let totalGoals = 0;
  let totalPlayers = 0;
  let draws = 0;
  let chancesCreated = 0;
  let chancesPlayed = 0;
  let managersUsed = 0;
  const periodGoals = Array.from({ length: V8_PERIODS.length }, () => 0);
  const zonePlays: Record<V8Zone, number> = { DEF: 0, MID: 0, ATT: 0 };

  for (let game = 0; game < games; game += 1) {
    const result = simulateOne(seedOffset + game, energyCurve);
    totalGoals += result.home.score + result.away.score;
    totalPlayers += result.home.deployed + result.away.deployed;
    if (result.home.score === result.away.score) draws += 1;

    for (let period = 0; period < periodGoals.length; period += 1) {
      periodGoals[period] += result.periodGoals[period]!;
    }

    for (const team of [result.home, result.away]) {
      zonePlays.DEF += team.zonePlays.DEF;
      zonePlays.MID += team.zonePlays.MID;
      zonePlays.ATT += team.zonePlays.ATT;
      chancesCreated += team.chancesCreated;
      chancesPlayed += team.chancesPlayed;
      if (team.managerUsed) managersUsed += 1;
    }
  }

  const teamCount = games * 2;
  const totalZonePlays = zonePlays.DEF + zonePlays.MID + zonePlays.ATT;
  const zoneShare = {
    DEF: totalZonePlays === 0 ? 0 : zonePlays.DEF / totalZonePlays,
    MID: totalZonePlays === 0 ? 0 : zonePlays.MID / totalZonePlays,
    ATT: totalZonePlays === 0 ? 0 : zonePlays.ATT / totalZonePlays,
  };

  return {
    games,
    averageCombinedGoals: totalGoals / games,
    averagePlayersDeployedPerTeam: totalPlayers / teamCount,
    drawRate: draws / games,
    averageGoalsByPeriod: periodGoals.map((goals) => goals / games),
    zoneShare,
    averageChanceCardsCreatedPerTeam: chancesCreated / teamCount,
    averageChanceCardsPlayedPerTeam: chancesPlayed / teamCount,
    managerUseRate: managersUsed / teamCount,
  };
}
