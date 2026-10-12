// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createApiRoutes } from '../../apps/api-ativada/src/routes/create-api-routes.js';
import { createRateLimiter } from '../../apps/api-ativada/src/rate-limit/rate-limiter.js';
import { createRouter } from '../../apps/api-ativada/src/router/create-router.js';
import { buildApiRouteDependencies } from '../../test/fixtures/api-route-dependencies.fixture.js';
import {
  GAP_LENGTH,
  HEALTH_BUDGET_MILLISECONDS,
  HOUR_MILLISECONDS,
} from './backtest-test.constant.js';
import {
  assertCondition,
  createBacktestRun,
  createTestRunner,
  reportLine,
  type BacktestTestContext,
} from './backtest-test-context.js';
import { SYMBOL, TIMEFRAME, type SyntheticWindow } from './check-two-years.js';
import { runDirectly, sameCanonicalJson } from './direct-run.js';
import { readPersistedRun, type PersistedRun } from './read-run-rows.js';

const HEALTH_PATH = '/v1/health';
const MINIMUM_SAMPLES = 10;
const SAMPLE_PAUSE_MILLISECONDS = 5;

type CountRow = { readonly total: number };

// Candles removidos do banco no meio da série: o backtest os trata como lacuna CONFIRMADA e o resultado é o do
// motor direto sobre os mesmos candles, com a lacuna declarada.
type TradeSpan = { readonly openedCandleTime: number; readonly closedCandleTime: number };

// O buraco vai para dentro de uma posição longa da execução inteira: a lacuna tem de mexer na carteira.
function findHoleInsideAPosition(reference: PersistedRun): number {
  const longTrade = (reference.rows.closedPositions as readonly TradeSpan[]).find(
    (trade) =>
      trade.closedCandleTime - trade.openedCandleTime > (GAP_LENGTH + 6) * HOUR_MILLISECONDS,
  );
  if (longTrade === undefined) throw new Error('nenhuma posição longa na série sintética');
  return longTrade.openedCandleTime + 3 * HOUR_MILLISECONDS;
}

export async function checkGapInTheMiddle(
  context: BacktestTestContext,
  window: SyntheticWindow,
  reference: PersistedRun,
): Promise<void> {
  const referenceDigest = reference.digest;
  const firstHole = findHoleInsideAPosition(reference);
  const lastHole = firstHole + (GAP_LENGTH - 1) * HOUR_MILLISECONDS;
  await context.client`DELETE FROM candles WHERE symbol = ${SYMBOL} AND timeframe = ${TIMEFRAME} AND open_time BETWEEN ${firstHole} AND ${lastHole}`;
  const rows: unknown =
    await context.client`SELECT count(*)::int AS total FROM candles WHERE symbol = ${SYMBOL} AND open_time BETWEEN ${firstHole} AND ${lastHole}`;
  assertCondition(
    (rows as readonly CountRow[])[0]?.total === 0,
    'os candles do buraco não foram removidos',
  );
  const run = await createBacktestRun(context, { symbol: SYMBOL, timeframe: TIMEFRAME, ...window });
  const outcome = await createTestRunner(context).run(run.id);
  assertCondition(outcome.status === 'completed', `lacuna: terminou ${outcome.status}`);
  if (outcome.status !== 'completed') throw new Error('inalcançável');
  assertCondition(
    outcome.gapCandles === GAP_LENGTH,
    `lacuna: declarou ${outcome.gapCandles} candles, esperado ${GAP_LENGTH}`,
  );
  const persisted = await readPersistedRun(context, run.id);
  const direct = await runDirectly(context, { symbol: SYMBOL, timeframe: TIMEFRAME, ...window });
  assertCondition(
    sameCanonicalJson(persisted.rows, direct.expected) &&
      sameCanonicalJson(persisted.metrics, direct.metrics),
    'lacuna: o gravado difere do motor direto com a lacuna declarada',
  );
  assertCondition(
    persisted.digest !== referenceDigest,
    'lacuna: o resultado deveria diferir do da série inteira',
  );
  const gapExits = persisted.rows.closedPositions.filter(
    (row) => (row as { exitReason: string }).exitReason === 'gap',
  ).length;
  reportLine(
    `LACUNA: ${GAP_LENGTH} candles removidos no meio => declarada ao motor com a contagem exata (nunca pulada em silêncio), ${persisted.counts['equityPoints']} pontos, ${gapExits} saída(s) por lacuna; resultado igual ao do motor direto`,
  );
}

// O laço de eventos da API não espera pelo backtest: a rota de saúde responde enquanto a thread trabalha.
export async function checkResponsiveness(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<void> {
  const router = createRouter({
    routes: createApiRoutes(buildApiRouteDependencies(() => Promise.resolve(true))),
    verifyAccessToken: () => Promise.reject(new Error('not used')),
    resolveUser: () => Promise.reject(new Error('not used')),
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: 0,
    reportUnexpectedError: () => undefined,
  });
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) =>
      router({ request, socketAddress: '127.0.0.1', traceId: 'trace-backtest-test' }),
  });
  try {
    const run = await createBacktestRun(context, {
      symbol: SYMBOL,
      timeframe: TIMEFRAME,
      ...window,
    });
    const latencies: number[] = [];
    let isRunning = true;
    const pending = createTestRunner(context)
      .run(run.id)
      .finally(() => {
        isRunning = false;
      });
    while (isRunning) {
      const startedAt = performance.now();
      const response = await fetch(`http://127.0.0.1:${server.port}${HEALTH_PATH}`);
      assertCondition(response.status === 200, 'a saúde não respondeu 200 durante o backtest');
      latencies.push(performance.now() - startedAt);
      await Bun.sleep(SAMPLE_PAUSE_MILLISECONDS);
    }
    const outcome = await pending;
    const slowest = Math.max(...latencies);
    assertCondition(
      outcome.status === 'completed',
      `backtest sob medição terminou ${outcome.status}`,
    );
    assertCondition(
      latencies.length >= MINIMUM_SAMPLES,
      `só ${latencies.length} amostras de saúde durante o backtest`,
    );
    assertCondition(
      slowest < HEALTH_BUDGET_MILLISECONDS,
      `GET ${HEALTH_PATH} levou ${slowest.toFixed(1)} ms durante o backtest`,
    );
    const mean = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
    reportLine(
      `NÃO BLOQUEIA: GET ${HEALTH_PATH} durante o backtest de 2 anos em worker_thread: ${latencies.length} amostras, média ${mean.toFixed(2)} ms, máxima ${slowest.toFixed(2)} ms (< ${HEALTH_BUDGET_MILLISECONDS} ms)`,
    );
  } finally {
    await server.stop(true);
  }
}
