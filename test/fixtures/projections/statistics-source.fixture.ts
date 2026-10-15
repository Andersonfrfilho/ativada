// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as WilsonModule from '../../../packages/statistics/src/wilson-interval.js';

const PRODUCTION_SOURCE = new URL('../../../packages/statistics/src', import.meta.url).pathname;

// Os contratos do Wilson rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada de `packages/statistics/src`.
export const STATISTICS_SOURCE_VARIABLE = 'STATISTICS_SOURCE';

export type StatisticsApi = { readonly wilson: typeof WilsonModule };

export function resolveStatisticsSource(): string {
  return Bun.env[STATISTICS_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadStatistics(): Promise<StatisticsApi> {
  const module: unknown = await import(`${resolveStatisticsSource()}/wilson-interval.ts`);
  return { wilson: module as typeof WilsonModule };
}
