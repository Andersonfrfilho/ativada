// Copyright (c) 2026 Ada Technology. All rights reserved.
export type RecencyMapOptions<TValue> = {
  readonly maximumEntries: number;
  readonly isIdle: (value: TValue) => boolean;
};

export type RecencyMap<TValue> = {
  readonly get: (key: string) => TValue | undefined;
  readonly set: (key: string, value: TValue) => void;
  readonly delete: (key: string) => boolean;
  readonly size: () => number;
};

// Mapa com teto em ordem de uso: ler ou gravar move a chave para o fim, e a vaga abre
// pelo começo, primeiro com o que está ocioso e só então com o menos recente.
export function createRecencyMap<TValue>(options: RecencyMapOptions<TValue>): RecencyMap<TValue> {
  const entries = new Map<string, TValue>();

  function evictForNewEntry(): void {
    for (const [key, value] of entries) {
      if (entries.size < options.maximumEntries || !options.isIdle(value)) break;
      entries.delete(key);
    }
    const leastRecentKey = entries.keys().next().value;
    if (entries.size >= options.maximumEntries && leastRecentKey !== undefined) {
      entries.delete(leastRecentKey);
    }
  }

  return {
    get: (key): TValue | undefined => {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set: (key, value): void => {
      if (!entries.delete(key)) evictForNewEntry();
      entries.set(key, value);
    },
    delete: (key): boolean => entries.delete(key),
    size: (): number => entries.size,
  };
}
