export interface StatSetEffect {
  value: number;
  resolvedOrder: number;
}

export interface StatCalculationInput {
  printed: number;
  setEffects?: StatSetEffect[];
  swappedBase?: number;
  flatModifiers?: number[];
  multipliers?: number[];
}

export interface StatCalculationReceipt {
  printed: number;
  selectedSet?: number;
  baseAfterSwap: number;
  flatTotal: number;
  multiplierProduct: number;
  effective: number;
}

export function roundTowardZero(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

export function calculateStat(input: StatCalculationInput): StatCalculationReceipt {
  const selectedSet = [...(input.setEffects ?? [])].sort((a, b) => b.resolvedOrder - a.resolvedOrder)[0];
  const selectedBase = selectedSet?.value ?? input.printed;
  const baseAfterSwap = input.swappedBase ?? selectedBase;
  const flatTotal = (input.flatModifiers ?? []).reduce((sum, modifier) => sum + modifier, 0);
  const multiplierProduct = (input.multipliers ?? []).reduce((product, multiplier) => product * multiplier, 1);
  const effective = roundTowardZero((baseAfterSwap + flatTotal) * multiplierProduct);

  return {
    printed: input.printed,
    selectedSet: selectedSet?.value,
    baseAfterSwap,
    flatTotal,
    multiplierProduct,
    effective,
  };
}

export interface PlayerStatInput {
  printedAttack: number;
  printedDefence: number;
  attackSetEffects?: StatSetEffect[];
  defenceSetEffects?: StatSetEffect[];
  swapStats?: boolean;
  attackFlatModifiers?: number[];
  defenceFlatModifiers?: number[];
  attackMultipliers?: number[];
  defenceMultipliers?: number[];
}

export function calculatePlayerStats(input: PlayerStatInput): { attack: StatCalculationReceipt; defence: StatCalculationReceipt } {
  const attackBase = [...(input.attackSetEffects ?? [])].sort((a, b) => b.resolvedOrder - a.resolvedOrder)[0]?.value ?? input.printedAttack;
  const defenceBase = [...(input.defenceSetEffects ?? [])].sort((a, b) => b.resolvedOrder - a.resolvedOrder)[0]?.value ?? input.printedDefence;

  return {
    attack: calculateStat({
      printed: input.printedAttack,
      setEffects: input.attackSetEffects,
      swappedBase: input.swapStats ? defenceBase : attackBase,
      flatModifiers: input.attackFlatModifiers,
      multipliers: input.attackMultipliers,
    }),
    defence: calculateStat({
      printed: input.printedDefence,
      setEffects: input.defenceSetEffects,
      swappedBase: input.swapStats ? attackBase : defenceBase,
      flatModifiers: input.defenceFlatModifiers,
      multipliers: input.defenceMultipliers,
    }),
  };
}
