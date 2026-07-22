export interface DeterministicRng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

function hashSeed(seed: number, namespace: string): number {
  let hash = seed | 0;
  for (let index = 0; index < namespace.length; index += 1) {
    hash = Math.imul(hash ^ namespace.charCodeAt(index), 0x45d9f3b);
    hash ^= hash >>> 16;
  }
  return hash >>> 0;
}

export function createRng(seed: number, namespace = 'match'): DeterministicRng {
  let state = hashSeed(seed, namespace) || 0x6d2b79f5;

  const next = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(minInclusive, maxInclusive) {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive) || maxInclusive < minInclusive) {
        throw new Error('Invalid integer range');
      }
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)]!;
    },
  };
}
