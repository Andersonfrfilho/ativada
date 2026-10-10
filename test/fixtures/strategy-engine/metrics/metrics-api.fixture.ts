// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  computeRunMetrics,
  reconcileRunMetrics,
} from '../../../../packages/strategy-engine/src/index.js';
import type { computeDrawdowns } from '../../../../packages/strategy-engine/src/metrics/drawdown.js';
import type { parseEquityPoints } from '../../../../packages/strategy-engine/src/metrics/metrics-input.js';
import type { computeReturnMetrics } from '../../../../packages/strategy-engine/src/metrics/return-metrics.js';
import type { computeRiskRatios } from '../../../../packages/strategy-engine/src/metrics/risk-ratios.js';

const PRODUCTION_SOURCE = new URL('../../../../packages/strategy-engine/src', import.meta.url)
  .pathname;

// Os testes de métrica rodam contra a produção; o teste de mutantes os relança num processo à parte apontando
// esta variável para uma cópia mutada do `src`.
export const MUTANT_SOURCE_VARIABLE = 'METRICS_MUTANT_SOURCE';
export const PROPERTY_SERIES_VARIABLE = 'METRICS_PROPERTY_SERIES';

export type MetricsApi = {
  readonly computeRunMetrics: typeof computeRunMetrics;
  readonly reconcileRunMetrics: typeof reconcileRunMetrics;
  readonly computeDrawdowns: typeof computeDrawdowns;
  readonly computeReturnMetrics: typeof computeReturnMetrics;
  readonly computeRiskRatios: typeof computeRiskRatios;
  readonly parseEquityPoints: typeof parseEquityPoints;
};

const API_MEMBERS: readonly string[] = [
  'computeRunMetrics',
  'reconcileRunMetrics',
  'computeDrawdowns',
  'computeReturnMetrics',
  'computeRiskRatios',
  'parseEquityPoints',
];

function isMetricsApi(candidate: unknown): candidate is MetricsApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

function readMember(module: unknown, name: string): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  return Object.getOwnPropertyDescriptor(module, name)?.value;
}

export function resolveMetricsSource(): string {
  return Bun.env[MUTANT_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

export async function loadMetricsApi(): Promise<MetricsApi> {
  const root = resolveMetricsSource();
  const index: unknown = await import(`${root}/index.ts`);
  const drawdown: unknown = await import(`${root}/metrics/drawdown.ts`);
  const input: unknown = await import(`${root}/metrics/metrics-input.ts`);
  const returns: unknown = await import(`${root}/metrics/return-metrics.ts`);
  const ratios: unknown = await import(`${root}/metrics/risk-ratios.ts`);
  const api: unknown = {
    computeRunMetrics: readMember(index, 'computeRunMetrics'),
    reconcileRunMetrics: readMember(index, 'reconcileRunMetrics'),
    computeDrawdowns: readMember(drawdown, 'computeDrawdowns'),
    computeReturnMetrics: readMember(returns, 'computeReturnMetrics'),
    computeRiskRatios: readMember(ratios, 'computeRiskRatios'),
    parseEquityPoints: readMember(input, 'parseEquityPoints'),
  };
  if (!isMetricsApi(api)) throw new Error('Módulo de métricas sem a API esperada.');
  return api;
}
