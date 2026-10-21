// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { RECENT_RUNS_LIMIT, RECENT_RUNS_STORAGE_KEY } from './run-switch.constant.js';

const recentRunSchema = z.object({
  id: z.string(),
  kind: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  strategyVersionId: z.string(),
});

export type RecentRun = z.infer<typeof recentRunSchema>;
export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;

// O acesso ao `localStorage` pode lançar (janela privada, dados do site bloqueados): sem ele, não há recentes.
function defaultStorage(): RecentStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function parseStored(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

// Item quebrado some sozinho; os outros ficam. Só ids e rótulos, nada sensível.
export function readRecentRuns(storage: RecentStorage | undefined = defaultStorage()): RecentRun[] {
  try {
    const raw = parseStored(storage?.getItem(RECENT_RUNS_STORAGE_KEY) ?? null);
    if (!Array.isArray(raw)) return [];
    return raw
      .flatMap((item: unknown) => {
        const parsed = recentRunSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, RECENT_RUNS_LIMIT);
  } catch {
    return [];
  }
}

export function toRecentRun(run: RecentRun): RecentRun {
  const { id, kind, symbol, timeframe, strategyVersionId } = run;
  return { id, kind, symbol, timeframe, strategyVersionId };
}

// A visitada agora vai para o topo; repetida não duplica; guarda só as últimas 5.
export function mergeRecentRun(
  current: readonly RecentRun[],
  visited: RecentRun,
): readonly RecentRun[] {
  const others = current.filter((item) => item.id !== visited.id);
  return [toRecentRun(visited), ...others].slice(0, RECENT_RUNS_LIMIT);
}

export function writeRecentRuns(
  runs: readonly RecentRun[],
  storage: RecentStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(RECENT_RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch {
    return;
  }
}

export function recordRecentRun(
  visited: RecentRun,
  storage: RecentStorage | undefined = defaultStorage(),
): readonly RecentRun[] {
  const merged = mergeRecentRun(readRecentRuns(storage), visited);
  writeRecentRuns(merged, storage);
  return merged;
}
