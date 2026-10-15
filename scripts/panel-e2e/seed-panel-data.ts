// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createRunRepository,
  createRunResultRepository,
  createStrategyRepository,
  RUN_KIND,
  RUN_STATUS,
  type DatabaseHandle,
  type OwnerScope,
  type SignalInput,
} from '../../packages/database/src/index.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '../../packages/strategy-engine/src/index.js';
import { buildDailyCandles } from '../../test/fixtures/walk-forward/daily-candles.fixture.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { DECISION_INDICATORS, votesFor } from './panel-e2e-decision.constant.js';
import {
  BASE_PRICE,
  EQUITY_HOURS,
  EXCHANGE,
  FINAL_BENCHMARK,
  FINAL_EQUITY,
  HISTORY_HOURS,
  HOUR_MILLISECONDS,
  INITIAL_BALANCE,
  PRICE_STEP,
  SYMBOLS,
} from './panel-e2e.constant.js';

export type SeedParams = { readonly handle: DatabaseHandle; readonly scope: OwnerScope };

export type SeededPanel = { readonly runId: string; readonly lastOpenTime: number };

const DAILY_CANDLES = 430;
const DAILY_SEED = 7;
const DAY_MILLISECONDS = 86_400_000;

function lastClosedHourStart(now: number): number {
  return Math.floor(now / HOUR_MILLISECONDS) * HOUR_MILLISECONDS - HOUR_MILLISECONDS;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

async function seedCandles(handle: DatabaseHandle, lastOpen: number): Promise<void> {
  const rows = SYMBOLS.flatMap((symbol) =>
    Array.from({ length: HISTORY_HOURS }, (_unused, index) => {
      const openTime = lastOpen - (HISTORY_HOURS - 1 - index) * HOUR_MILLISECONDS;
      const close = formatPrice((BASE_PRICE[symbol] ?? 1) + index * (PRICE_STEP[symbol] ?? 1));
      return {
        exchange: EXCHANGE,
        symbol,
        timeframe: '1h' as const,
        openTime,
        closeTime: openTime + HOUR_MILLISECONDS - 1,
        open: close,
        high: close,
        low: close,
        close,
        volume: '10.00',
        tradeCount: 1,
      };
    }),
  );
  await createCandleRepository(handle, { now: () => Date.now() }).upsertCandles(rows);
}

async function createLiveRun(params: SeedParams, firstOpen: number): Promise<string> {
  const strategies = createStrategyRepository(params.handle);
  const strategy = await strategies.createStrategy(params.scope, {
    name: 'Minha estratégia ao vivo',
    isExample: false,
  });
  const version = createStrategyVersion(loadClassicScoreboard());
  const added = await strategies.addVersion(params.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(version.config)),
    configHash: version.configHash,
  });
  if (added === undefined) throw new Error('a estratégia do seed não aceitou a versão');
  const setup = createRunSetup({
    ...loadClassicRunParameters(),
    symbol: SYMBOLS[0],
    timeframe: '1h',
  });
  const runs = createRunRepository(params.handle);
  const run = await runs.createRun(params.scope, {
    strategyVersionId: added.version.id,
    kind: RUN_KIND.LIVE_PAPER,
    symbol: SYMBOLS[0],
    timeframe: '1h',
    runParameters: parseJsonContainer(JSON.stringify(setup.parameters)),
    runHash: setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: firstOpen,
    periodEnd: undefined,
    migratedFromRunId: undefined,
  });
  if (run === undefined) throw new Error('a simulação do seed não foi criada');
  await runs.transitionRun(params.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  return run.id;
}

function interpolate(from: string, to: string, index: number): string {
  const ratio = index / (EQUITY_HOURS - 1);
  return formatPrice(Number(from) + (Number(to) - Number(from)) * ratio);
}

async function seedResults(params: SeedParams, runId: string, firstOpen: number): Promise<void> {
  const results = createRunResultRepository(params.handle);
  const times = Array.from(
    { length: EQUITY_HOURS },
    (_unused, i) => firstOpen + i * HOUR_MILLISECONDS,
  );
  await results.appendEquityPoints(
    params.scope,
    runId,
    times.map((candleTime, index) => {
      const equity = interpolate(INITIAL_BALANCE, FINAL_EQUITY, index);
      return {
        candleTime,
        equity,
        equityAtLow: equity,
        benchmark: interpolate(INITIAL_BALANCE, FINAL_BENCHMARK, index),
      };
    }),
  );
  const signal = (index: number, action: 'BUY' | 'SELL', reason: string): SignalInput => ({
    candleTime: times[index] ?? firstOpen,
    action,
    score: action === 'BUY' ? '3' : '-3',
    regime: 'trending',
    votes: parseJsonContainer(JSON.stringify(votesFor(action === 'BUY' ? 1 : -1))),
    indicators: parseJsonContainer(JSON.stringify(DECISION_INDICATORS)),
    sentimentObservation: undefined,
    reason,
  });
  await results.appendSignals(params.scope, runId, [
    signal(4, 'BUY', 'Compra 3/4: tendência, MACD e volume confirmam; RSI neutro'),
    signal(14, 'SELL', 'Venda 3/4: reversão, RSI esticado e volume caindo'),
  ]);
}

// Candles diários até ontem: dão histórico para o backtest que o E2E pede pela tela, rodado de verdade na API.
async function seedDailyCandles(handle: DatabaseHandle, now: number): Promise<void> {
  const today = Math.floor(now / DAY_MILLISECONDS) * DAY_MILLISECONDS;
  const candles = buildDailyCandles({
    count: DAILY_CANDLES,
    seed: DAILY_SEED,
    firstOpenTime: today - DAILY_CANDLES * DAY_MILLISECONDS,
  });
  await createCandleRepository(handle, { now: () => Date.now() }).upsertCandles(
    candles.map((candle) => ({
      exchange: EXCHANGE,
      symbol: candle.symbol,
      timeframe: '1d' as const,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      tradeCount: 1,
    })),
  );
}

// Dados reais no Postgres do teste, lidos depois pela API real: o painel nunca vê um mock.
export async function seedPanelData(params: SeedParams): Promise<SeededPanel> {
  const lastOpen = lastClosedHourStart(Date.now());
  await seedCandles(params.handle, lastOpen);
  await seedDailyCandles(params.handle, Date.now());
  const firstEquityOpen = lastOpen - (EQUITY_HOURS - 1) * HOUR_MILLISECONDS;
  const runId = await createLiveRun(params, firstEquityOpen);
  await seedResults(params, runId, firstEquityOpen);
  return { runId, lastOpenTime: lastOpen };
}
