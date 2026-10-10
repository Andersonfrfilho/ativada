// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord } from '../../../packages/database/src/index.js';
import {
  createOwnerScope,
  type OwnerScope,
} from '../../../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../../../packages/database/src/ownership/user-id.js';
import { USER_RESOLUTION_STATUS } from '../../../packages/database/src/users/user-resolution.constant.js';
import type { Route } from '../../../apps/api-cryptoada/src/router/route.types.js';
import type { RunDispatchRequest } from '../../../apps/api-cryptoada/src/runs/run-dispatcher.js';
import classicStrategy from '../strategy-engine/classic-scoreboard.strategy.json';
import { startJwksTestServer, type JwksTestServer } from '../jwks-test-server.fixture.js';
import {
  TEST_AUDIENCE,
  TEST_AUTHORIZED_PARTY,
  TEST_ISSUER,
  createTestSigningKey,
  signTestToken,
  type TestSigningKey,
} from '../token-signing.fixture.js';
import { loadApiApp, type ApiApp } from './api-app.fixture.js';
import {
  createInMemoryCandleSeries,
  createInMemoryRuns,
  type InMemoryCandles,
  type InMemoryRuns,
} from './in-memory-runs.fixture.js';
import {
  createInMemoryStrategies,
  type InMemoryStrategies,
} from './in-memory-strategies.fixture.js';

export const SUBJECT_A = 'subject-runs-a';
export const SUBJECT_B = 'subject-runs-b';
export const USER_A_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d11';
export const USER_B_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d12';
export const MISSING_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9dff';
export const REQUEST_ORIGIN = 'http://harness.test';
export const ENABLED_SYMBOLS = ['BTCUSDT', 'ETHUSDT'] as const;
export const ENABLED_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export const EXCHANGE = 'binance';
export const NOW = Date.UTC(2026, 9, 1);
export const HOUR = 3_600_000;
export const CLASSIC_CONFIG: unknown = classicStrategy;

export type CallParams = {
  readonly subject?: string | undefined;
  readonly method?: string;
  readonly path: string;
  readonly body?: unknown;
  readonly rawBody?: string;
};

export type RunsHarnessOptions = {
  readonly candles?: readonly CandleRecord[];
  readonly csvLimits?: { maxRows?: number; maxDurationMilliseconds?: number };
  readonly extraRoutes?: (app: ApiApp) => readonly Route[];
};

export type RunsHarness = {
  readonly app: ApiApp;
  readonly strategies: InMemoryStrategies;
  readonly runs: InMemoryRuns;
  readonly candles: InMemoryCandles;
  readonly dispatched: RunDispatchRequest[];
  readonly dispatch: { shouldFail: boolean };
  readonly clock: { now: number };
  readonly routes: readonly Route[];
  readonly reportedErrors: unknown[];
  readonly scopeOf: (subject: string) => OwnerScope;
  readonly call: (params: CallParams) => Promise<Response>;
  readonly seedStrategy: (subject: string, nonce?: string) => Promise<SeededStrategy>;
  readonly stop: () => Promise<void>;
};

export type SeededStrategy = { readonly strategyId: string; readonly versionId: string };

const USER_IDS: Readonly<Record<string, string>> = {
  [SUBJECT_A]: USER_A_ID,
  [SUBJECT_B]: USER_B_ID,
};

export function buildHourlyCandles(params: {
  readonly symbol: string;
  readonly count: number;
  readonly firstOpenTime: number;
}): readonly CandleRecord[] {
  return Array.from({ length: params.count }, (_unused, index) => {
    const openTime = params.firstOpenTime + index * HOUR;
    return {
      exchange: EXCHANGE,
      symbol: params.symbol,
      timeframe: '1h' as const,
      openTime,
      closeTime: openTime + HOUR - 1,
      open: '30000.10000000',
      high: '30100.00000000',
      low: '29900.00000000',
      close: '30050.50000000',
      volume: '12.50000000',
      tradeCount: 100 + index,
    };
  });
}

export async function createRunsHarness(options: RunsHarnessOptions = {}): Promise<RunsHarness> {
  const app = await loadApiApp();
  const key: TestSigningKey = await createTestSigningKey('key-runs');
  const jwks: JwksTestServer = startJwksTestServer([key]);
  const strategies = createInMemoryStrategies();
  const runs = createInMemoryRuns(strategies.repository);
  const candles = createInMemoryCandleSeries(options.candles ?? []);
  const dispatched: RunDispatchRequest[] = [];
  const dispatch = { shouldFail: false };
  const clock = { now: NOW };
  const reportedErrors: unknown[] = [];
  const enabled = { symbols: [...ENABLED_SYMBOLS], timeframes: [...ENABLED_TIMEFRAMES] };
  const scopeOf = (subject: string): OwnerScope =>
    createOwnerScope(userIdFromDatabase(USER_IDS[subject] ?? USER_A_ID));
  const dispatcher = {
    dispatch: (request: RunDispatchRequest): Promise<void> => {
      if (dispatch.shouldFail) return Promise.reject(new Error('sem executor'));
      dispatched.push(request);
      return Promise.resolve();
    },
  };
  const strategyDeps = { strategies: strategies.repository };
  const runDeps = { runs: runs.repository, candles: candles.repository, exchange: EXCHANGE };
  const series = app.runSeriesUseCases.createRunSeriesUseCases({ results: runs.results });
  const routes: readonly Route[] = [
    ...app.marketRoutes.createMarketRoutes({
      enabled,
      listCandles: app.candlesUseCase.createListCandlesUseCase({
        candles: candles.repository,
        exchange: EXCHANGE,
      }),
    }),
    ...app.strategyRoutes.createStrategyRoutes({
      createStrategy: app.strategyUseCases.createCreateStrategyUseCase(strategyDeps),
      listStrategies: app.strategyUseCases.createListStrategiesUseCase(strategyDeps),
      getStrategy: app.strategyUseCases.createGetStrategyUseCase(strategyDeps),
      listVersions: app.strategyUseCases.createListVersionsUseCase(strategyDeps),
      addVersion: app.strategyUseCases.createAddVersionUseCase(strategyDeps),
    }),
    ...app.runRoutes.createRunRoutes({
      enabled,
      createRun: app.createRun.createCreateRunUseCase({
        ...runDeps,
        strategies: strategies.repository,
        dispatcher,
        now: () => clock.now,
      }),
      listRuns: app.runUseCases.createListRunsUseCase(runDeps),
      getRun: app.runUseCases.createGetRunUseCase(runDeps),
      stopRun: app.runUseCases.createStopRunUseCase(runDeps),
    }),
    ...app.runSeriesRoutes.createRunSeriesRoutes(series),
    ...app.runExportRoutes.createRunExportRoutes(
      app.exportCsv.createExportRunCsvUseCase({
        results: runs.results,
        now: () => clock.now,
        ...(options.csvLimits === undefined ? {} : { limits: options.csvLimits }),
      }),
    ),
    ...(options.extraRoutes?.(app) ?? []),
  ];
  const verifyAccessToken = app.tokenVerifier.createAccessTokenVerifier({
    settings: {
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      authorizedParties: [TEST_AUTHORIZED_PARTY],
    },
    getKey: app.keyResolver.createRemoteKeyResolver({
      jwksUrl: jwks.url,
      timeoutMilliseconds: 300,
      cooldownMilliseconds: 50,
    }),
  });
  const router = app.router.createRouter({
    routes,
    verifyAccessToken,
    resolveUser: (subject) => {
      const userId = userIdFromDatabase(USER_IDS[subject] ?? USER_A_ID);
      return Promise.resolve({
        status: USER_RESOLUTION_STATUS.ACTIVE,
        userId,
        scope: createOwnerScope(userId),
      });
    },
    rateLimiter: app.rateLimiter.createRateLimiter({ now: () => clock.now }),
    trustedProxyHops: 0,
    reportUnexpectedError: (error) => reportedErrors.push(error),
  });
  const handler = app.requestHandler.createRequestHandler({
    router,
    corsAllowedOrigins: [],
    logger: app.logger.createLogger({ appName: 'api-cryptoada', write: () => undefined }),
  });
  return {
    app,
    strategies,
    runs,
    candles,
    dispatched,
    dispatch,
    clock,
    routes,
    reportedErrors,
    scopeOf,
    call: async (params): Promise<Response> => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (params.subject !== undefined) {
        const token = await signTestToken({ key, claims: { sub: params.subject } });
        headers.set('Authorization', `Bearer ${token}`);
      }
      const body =
        params.rawBody ?? (params.body === undefined ? undefined : JSON.stringify(params.body));
      return handler(
        new Request(`${REQUEST_ORIGIN}${params.path}`, {
          method: params.method ?? 'GET',
          headers,
          ...(body === undefined ? {} : { body }),
        }),
        '203.0.113.7',
      );
    },
    seedStrategy: async (subject, nonce = '1'): Promise<SeededStrategy> => {
      const created = await strategies.repository.createStrategyWithFirstVersion(scopeOf(subject), {
        name: `Estratégia ${nonce}`,
        isExample: false,
        config: structuredClone(classicStrategy),
        configHash: `hash-${subject}-${nonce}`.padEnd(64, '0'),
      });
      return { strategyId: created.strategy.id, versionId: created.version.id };
    },
    stop: () => jwks.stop(),
  };
}

export async function readJson(response: Response): Promise<{ status: number; body: unknown }> {
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? undefined : JSON.parse(text) };
}
