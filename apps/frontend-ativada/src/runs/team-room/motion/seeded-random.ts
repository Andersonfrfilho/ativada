// Copyright (c) 2026 Ada Technology. All rights reserved.
export type Random = {
  // Um número em [0, 1).
  readonly next: () => number;
  // Um inteiro em [min, max].
  readonly between: (min: number, max: number) => number;
  readonly pick: <T>(items: readonly T[]) => T | undefined;
  readonly shuffle: <T>(items: readonly T[]) => readonly T[];
};

const UINT32 = 4_294_967_296;

function swap<T>(items: T[], first: number, second: number): void {
  const held = items[first];
  const other = items[second];
  if (held === undefined || other === undefined) return;
  items[first] = other;
  items[second] = held;
}

// Gerador determinístico (mulberry32): a mesma semente dá sempre a mesma sequência, então o roteiro de movimento é testável.
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32;
  };
  function pick<T>(items: readonly T[]): T | undefined {
    return items[Math.floor(next() * items.length)];
  }
  function shuffle<T>(items: readonly T[]): readonly T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      swap(copy, index, Math.floor(next() * (index + 1)));
    }
    return copy;
  }
  return {
    next,
    between: (min, max): number => min + Math.floor(next() * (max - min + 1)),
    pick,
    shuffle,
  };
}
