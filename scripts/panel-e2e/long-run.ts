// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createRunRepository,
  createStrategyRepository,
  RUN_KIND,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '../../packages/strategy-engine/src/index.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { buildDailyCandles } from '../../test/fixtures/walk-forward/daily-candles.fixture.js';
import { EXCHANGE, HOUR_MILLISECONDS, SYMBOLS } from './panel-e2e.constant.js';

// 5.000 velas de 1 h para o backtest (a janela de 5.000 velas do RNF02) mais o aquecimento dos indicadores, todas ANTES da
// primeira vela do seed ao vivo (que fica nas últimas 30 horas): o gráfico precisa de cinco páginas de 1.000 velas.
const PERIOD_CANDLES = 5_000;
const WARMUP_CANDLES = 200;
const LONG_RUN_SEED = 11;
const SEED_LIVE_HOURS = 30;
const DRIFT_BASIS_POINTS = 2;
const VOLATILITY_BASIS_POINTS = 70;
const CYCLE_PERIOD = 60;
const CYCLE_BASIS_POINTS = 25;
const COMPLETION_TIMEOUT_MILLISECONDS = 100_000;
const COMPLETION_POLL_MILLISECONDS = 500;

export type LongRunParams = {
  readonly handle: DatabaseHandle;
  readonly sql: Bun.SQL;
  readonly scope: OwnerScope;
  readonly lastOpenTime: number;
};

async function seedLongCandles(params: LongRunParams, firstOpen: number): Promise<void> {
  const candles = buildDailyCandles({
    count: PERIOD_CANDLES + WARMUP_CANDLES,
    seed: LONG_RUN_SEED,
    firstOpenTime: firstOpen,
    timeframe: '1h',
    symbol: SYMBOLS[0],
    driftBasisPoints: DRIFT_BASIS_POINTS,
    volatilityBasisPoints: VOLATILITY_BASIS_POINTS,
    cyclePeriod: CYCLE_PERIOD,
    cycleBasisPoints: CYCLE_BASIS_POINTS,
  });
  const rows = candles.map((candle) => ({
    exchange: EXCHANGE,
    symbol: candle.symbol,
    timeframe: '1h' as const,
    openTime: candle.openTime,
    closeTime: candle.closeTime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    tradeCount: 1,
  }));
  await createCandleRepository(params.handle, { now: () => Date.now() }).upsertCandles(rows);
}

async function createBacktestRun(params: LongRunParams, window: [number, number]): Promise<string> {
  const strategies = createStrategyRepository(params.handle);
  const strategy = await strategies.createStrategy(params.scope, {
    name: 'Estratégia do gráfico longo',
    isExample: false,
  });
  const version = createStrategyVersion(loadClassicScoreboard());
  const added = await strategies.addVersion(params.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(version.config)),
    configHash: version.configHash,
  });
  if (added === undefined) throw new Error('a estratégia do gráfico longo não aceitou a versão');
  const setup = createRunSetup({
    ...loadClassicRunParameters(),
    symbol: SYMBOLS[0],
    timeframe: '1h',
  });
  const run = await createRunRepository(params.handle).createRun(params.scope, {
    strategyVersionId: added.version.id,
    kind: RUN_KIND.BACKTEST,
    symbol: SYMBOLS[0],
    timeframe: '1h',
    runParameters: parseJsonContainer(JSON.stringify(setup.parameters)),
    runHash: setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: window[0],
    periodEnd: window[1],
    migratedFromRunId: undefined,
  });
  if (run === undefined) throw new Error('o backtest do gráfico longo não foi criado');
  return run.id;
}

type StatusRow = { readonly status: string; readonly errorCode: string | null };

async function readStatus(sql: Bun.SQL, runId: string): Promise<StatusRow | undefined> {
  const rows: unknown =
    await sql`SELECT status, error_code AS "errorCode" FROM runs WHERE id = ${runId}`;
  return (rows as readonly StatusRow[])[0];
}

// O backtest entra na fila como em produção (`queued`) e quem o roda é o despachante da API, que olha a fila a cada poucos
// segundos; o teste só espera o fim.
async function waitForCompletion(sql: Bun.SQL, runId: string): Promise<void> {
  const deadline = Date.now() + COMPLETION_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const row = await readStatus(sql, runId);
    if (row?.status === 'completed') return;
    if (row?.status === 'failed' || row?.status === 'cancelled') {
      throw new Error(
        `o backtest do gráfico longo terminou como ${row.status} (${row.errorCode ?? 'sem código'})`,
      );
    }
    await Bun.sleep(COMPLETION_POLL_MILLISECONDS);
  }
  throw new Error('o backtest do gráfico longo não terminou a tempo');
}

// Um backtest de 1 h de verdade (a fila e o despachante da API, como em produção) sobre 5.000 velas sintéticas de semente fixa:
// as linhas, os sinais, as operações com stop e alvo e as curvas saem do motor, não de um gravador de teste.
export async function createLongBacktest(params: LongRunParams): Promise<string> {
  const periodEnd = params.lastOpenTime - (SEED_LIVE_HOURS - 1) * HOUR_MILLISECONDS;
  const periodStart = periodEnd - PERIOD_CANDLES * HOUR_MILLISECONDS;
  await seedLongCandles(params, periodStart - WARMUP_CANDLES * HOUR_MILLISECONDS);
  const runId = await createBacktestRun(params, [periodStart, periodEnd]);
  await waitForCompletion(params.sql, runId);
  return runId;
}
