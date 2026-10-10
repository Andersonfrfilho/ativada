// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createApiRoutes } from '../../apps/api-cryptoada/src/routes/create-api-routes.js';
import { createRateLimiter } from '../../apps/api-cryptoada/src/rate-limit/rate-limiter.js';
import { createRouter } from '../../apps/api-cryptoada/src/router/create-router.js';
import { buildApiRouteDependencies } from '../../test/fixtures/api-route-dependencies.fixture.js';
import {
  buildHourlySeries,
  GRID_200,
  GRID_24,
  hourlyScenario,
  STRATEGY_CONFIG,
} from './scenarios.js';
import { assertCompleted, runScenario, type ScenarioResult } from './run-scenario.js';
import {
  FIVE_YEARS_OF_FIFTEEN_MINUTE_CANDLES,
  HEALTH_BUDGET_MILLISECONDS,
  SYMBOLS,
  TWO_YEARS_OF_HOURLY_CANDLES,
} from './walkforward-test.constant.js';
import {
  assertCondition,
  createTestRunner,
  newRun,
  reportLine,
  seedCandles,
  seedStrategyVersion,
  type Scenario,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

const HEALTH_PATH = '/v1/health';
const MINIMUM_SAMPLES = 10;
// Amostra de 100 em 100 ms: o limite de taxa da API (RNF07) recusaria rajadas de 200 por segundo.
const SAMPLE_PAUSE_MILLISECONDS = 100;
const TIMING_SEED = 7;
const SECONDS = 1_000;

function throughput(result: ScenarioResult, combinations: number): number {
  return (TWO_YEARS_OF_HOURLY_CANDLES * combinations) / (result.wallMilliseconds / SECONDS);
}

function describePhases(result: ScenarioResult): string {
  const { outcome } = result;
  if (outcome.status !== 'completed') return 'sem fases';
  const { phases } = outcome;
  return `partida ${outcome.startMilliseconds.toFixed(0)} ms, carga ${phases.load.toFixed(0)}, busca ${phases.search.toFixed(0)}, teste ${phases.test.toFixed(0)}, relatório ${phases.report.toFixed(0)}`;
}

function reportScenario(label: string, result: ScenarioResult, combinations: number): void {
  const rate = throughput(result, combinations);
  const extrapolated = (FIVE_YEARS_OF_FIFTEEN_MINUTE_CANDLES * combinations) / rate;
  reportLine(
    `TEMPO ${label}: ${result.wallMilliseconds.toFixed(0)} ms de ponta a ponta (${describePhases(result)}); ${Math.round(rate).toLocaleString('pt-BR')} candles·combinações/s; extrapolação para ${FIVE_YEARS_OF_FIFTEEN_MINUTE_CANDLES.toLocaleString('pt-BR')} candles (5 anos em 15m) com as mesmas ${combinations} combinações: ${extrapolated.toFixed(0)} s`,
  );
}

async function buildScenarios(context: WalkForwardTestContext): Promise<{
  readonly realistic: Scenario;
  readonly large: Scenario;
}> {
  const versionId = await seedStrategyVersion(context, STRATEGY_CONFIG);
  await seedCandles(
    context,
    buildHourlySeries({ symbol: SYMBOLS.TIMING, seed: TIMING_SEED, driftBasisPoints: 0 }),
  );
  const base = { versionId, symbol: SYMBOLS.TIMING };
  return {
    realistic: hourlyScenario({ ...base, request: { grid: GRID_24, minTradesPerWindow: 10 } }),
    large: hourlyScenario({ ...base, request: { grid: GRID_200, minTradesPerWindow: 10 } }),
  };
}

function createHealthServer(): ReturnType<typeof Bun.serve> {
  const router = createRouter({
    routes: createApiRoutes(buildApiRouteDependencies(() => Promise.resolve(true))),
    verifyAccessToken: () => Promise.reject(new Error('not used')),
    resolveUser: () => Promise.reject(new Error('not used')),
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: 0,
    reportUnexpectedError: () => undefined,
  });
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) =>
      router({ request, socketAddress: '127.0.0.1', traceId: 'trace-walkforward-test' }),
  });
}

// O laço de eventos da API não espera pelo walk-forward: a rota de saúde responde enquanto as threads trabalham.
async function checkResponsiveness(
  context: WalkForwardTestContext,
  scenario: Scenario,
): Promise<void> {
  const server = createHealthServer();
  try {
    const run = await newRun(context, scenario);
    const latencies: number[] = [];
    let isRunning = true;
    const pending = createTestRunner(context, { threads: 2 })
      .run(run.id)
      .finally(() => {
        isRunning = false;
      });
    while (isRunning) {
      const startedAt = performance.now();
      const response = await fetch(`http://127.0.0.1:${server.port}${HEALTH_PATH}`);
      assertCondition(
        response.status === 200,
        `a saúde respondeu ${response.status} durante o walk-forward`,
      );
      latencies.push(performance.now() - startedAt);
      await Bun.sleep(SAMPLE_PAUSE_MILLISECONDS);
    }
    const outcome = await pending;
    const slowest = Math.max(...latencies);
    assertCondition(
      outcome.status === 'completed',
      `walk-forward sob medição terminou ${outcome.status}`,
    );
    assertCondition(
      latencies.length >= MINIMUM_SAMPLES,
      `só ${latencies.length} amostras de saúde`,
    );
    assertCondition(
      slowest < HEALTH_BUDGET_MILLISECONDS,
      `GET ${HEALTH_PATH} levou ${slowest.toFixed(1)} ms durante o walk-forward`,
    );
    const mean = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
    reportLine(
      `NÃO BLOQUEIA (RNF02): GET ${HEALTH_PATH} durante o walk-forward de 24 combinações em threads: ${latencies.length} amostras, média ${mean.toFixed(2)} ms, máxima ${slowest.toFixed(2)} ms (< ${HEALTH_BUDGET_MILLISECONDS} ms)`,
    );
  } finally {
    await server.stop(true);
  }
}

// (h) O tempo de um walk-forward realista e o do caso grande (200 combinações) com 1 e 2 threads, com o
// gargalo medido por fase.
export async function checkTiming(context: WalkForwardTestContext): Promise<void> {
  const { realistic, large } = await buildScenarios(context);
  const realisticResult = await runScenario(context, realistic, { threads: 2 });
  assertCompleted(realisticResult, 'walk-forward realista');
  reportScenario(
    `realista (BTC-like 1h, ${TWO_YEARS_OF_HOURLY_CANDLES.toLocaleString('pt-BR')} candles, 24 combinações, ${realisticResult.persisted.windows.length} janelas 6/2/2, 2 threads)`,
    realisticResult,
    24,
  );
  await checkResponsiveness(context, realistic);
  for (const threads of [1, 2]) {
    const result = await runScenario(context, large, { threads });
    assertCompleted(result, `200 combinações com ${threads} thread(s)`);
    reportScenario(
      `GRANDE (200 combinações × ${TWO_YEARS_OF_HOURLY_CANDLES.toLocaleString('pt-BR')} candles, ${threads} thread(s))`,
      result,
      200,
    );
  }
}
