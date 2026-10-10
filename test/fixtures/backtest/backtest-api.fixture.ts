// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  failBacktestRun,
  runBacktest,
} from '../../../apps/api-cryptoada/src/backtest/run-backtest.js';

const PRODUCTION_SOURCE = new URL('../../../apps/api-cryptoada/src/backtest', import.meta.url)
  .pathname;

// Os testes do backtest rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do módulo.
export const BACKTEST_MUTANT_VARIABLE = 'BACKTEST_MUTANT_SOURCE';

export type BacktestApi = {
  readonly runBacktest: typeof runBacktest;
  readonly failBacktestRun: typeof failBacktestRun;
};

export function resolveBacktestSource(): string {
  return Bun.env[BACKTEST_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

function readMember(module: unknown, name: string): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  return Object.getOwnPropertyDescriptor(module, name)?.value;
}

function isBacktestApi(candidate: unknown): candidate is BacktestApi {
  return ['runBacktest', 'failBacktestRun'].every(
    (member) => typeof readMember(candidate, member) === 'function',
  );
}

export async function loadBacktestApi(): Promise<BacktestApi> {
  const module: unknown = await import(`${resolveBacktestSource()}/run-backtest.ts`);
  if (!isBacktestApi(module)) throw new Error('Módulo de backtest sem a API esperada.');
  return module;
}
