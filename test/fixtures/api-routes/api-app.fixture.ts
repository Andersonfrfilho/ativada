// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as TokenVerifierModule from '../../../apps/api-cryptoada/src/authentication/access-token-verifier.js';
import type * as KeyResolverModule from '../../../apps/api-cryptoada/src/authentication/remote-key-resolver.js';
import type * as CreateRequestHandlerModule from '../../../apps/api-cryptoada/src/http/create-request-handler.js';
import type * as LoggerModule from '../../../apps/api-cryptoada/src/logging/logger.js';
import type * as CandlesUseCaseModule from '../../../apps/api-cryptoada/src/markets/list-candles.use-case.js';
import type * as MarketRoutesModule from '../../../apps/api-cryptoada/src/markets/markets.routes.js';
import type * as PolicyModule from '../../../apps/api-cryptoada/src/rate-limit/rate-limit-policy.constant.js';
import type * as RateLimiterModule from '../../../apps/api-cryptoada/src/rate-limit/rate-limiter.js';
import type * as CreateRouterModule from '../../../apps/api-cryptoada/src/router/create-router.js';
import type * as CreateRunModule from '../../../apps/api-cryptoada/src/runs/create-run.use-case.js';
import type * as ExportCsvModule from '../../../apps/api-cryptoada/src/runs/export-run-csv.use-case.js';
import type * as RunExportRoutesModule from '../../../apps/api-cryptoada/src/runs/run-export.routes.js';
import type * as RunSeriesRoutesModule from '../../../apps/api-cryptoada/src/runs/run-series.routes.js';
import type * as RunSeriesUseCasesModule from '../../../apps/api-cryptoada/src/runs/run-series.use-cases.js';
import type * as RunUseCasesModule from '../../../apps/api-cryptoada/src/runs/run.use-cases.js';
import type * as RunRoutesModule from '../../../apps/api-cryptoada/src/runs/runs.routes.js';
import type * as StrategyRoutesModule from '../../../apps/api-cryptoada/src/strategies/strategies.routes.js';
import type * as StrategyUseCasesModule from '../../../apps/api-cryptoada/src/strategies/strategy.use-cases.js';

const PRODUCTION_APP_SOURCE = new URL('../../../apps/api-cryptoada/src', import.meta.url).pathname;

// Os contratos das rotas rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do `src` INTEIRO da API (o roteador, os erros e as rotas vêm todos da mesma raiz).
export const API_ROUTES_APP_SOURCE_VARIABLE = 'API_ROUTES_APP_SOURCE';

export type ApiApp = {
  readonly tokenVerifier: typeof TokenVerifierModule;
  readonly keyResolver: typeof KeyResolverModule;
  readonly requestHandler: typeof CreateRequestHandlerModule;
  readonly logger: typeof LoggerModule;
  readonly candlesUseCase: typeof CandlesUseCaseModule;
  readonly marketRoutes: typeof MarketRoutesModule;
  readonly policies: typeof PolicyModule;
  readonly rateLimiter: typeof RateLimiterModule;
  readonly router: typeof CreateRouterModule;
  readonly createRun: typeof CreateRunModule;
  readonly exportCsv: typeof ExportCsvModule;
  readonly runExportRoutes: typeof RunExportRoutesModule;
  readonly runSeriesRoutes: typeof RunSeriesRoutesModule;
  readonly runSeriesUseCases: typeof RunSeriesUseCasesModule;
  readonly runUseCases: typeof RunUseCasesModule;
  readonly runRoutes: typeof RunRoutesModule;
  readonly strategyRoutes: typeof StrategyRoutesModule;
  readonly strategyUseCases: typeof StrategyUseCasesModule;
};

export function resolveApiAppSource(): string {
  return Bun.env[API_ROUTES_APP_SOURCE_VARIABLE] ?? PRODUCTION_APP_SOURCE;
}

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${resolveApiAppSource()}/${file}.ts`);
  return module as TModule;
}

export async function loadApiApp(): Promise<ApiApp> {
  return {
    tokenVerifier: await load('authentication/access-token-verifier'),
    keyResolver: await load('authentication/remote-key-resolver'),
    requestHandler: await load('http/create-request-handler'),
    logger: await load('logging/logger'),
    candlesUseCase: await load('markets/list-candles.use-case'),
    marketRoutes: await load('markets/markets.routes'),
    policies: await load('rate-limit/rate-limit-policy.constant'),
    rateLimiter: await load('rate-limit/rate-limiter'),
    router: await load('router/create-router'),
    createRun: await load('runs/create-run.use-case'),
    exportCsv: await load('runs/export-run-csv.use-case'),
    runExportRoutes: await load('runs/run-export.routes'),
    runSeriesRoutes: await load('runs/run-series.routes'),
    runSeriesUseCases: await load('runs/run-series.use-cases'),
    runUseCases: await load('runs/run.use-cases'),
    runRoutes: await load('runs/runs.routes'),
    strategyRoutes: await load('strategies/strategies.routes'),
    strategyUseCases: await load('strategies/strategy.use-cases'),
  };
}
