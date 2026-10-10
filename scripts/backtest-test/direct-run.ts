// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeRunMetrics,
  createEngine,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  canonicalJson,
  computeStrategyLeadInCandles,
  serializeEngineState,
  type EngineCandle,
  type RunMetrics,
} from '../../packages/strategy-engine/src/index.js';
import { createCandleRepository } from '../../packages/database/src/index.js';
import {
  expectedRowsOf,
  type ExpectedRows,
} from '../../test/fixtures/backtest/expected-rows.fixture.js';
import { sortedLikePersisted } from '../../test/fixtures/backtest/persisted-rows.fixture.js';
import { buildMetricsParams } from '../../test/fixtures/strategy-engine/metrics/metrics-golden.fixture.js';
import { runSteps } from '../../test/fixtures/strategy-engine/engine-contract-runs.fixture.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { EXCHANGE, SENTIMENT_SOURCE } from './backtest-test.constant.js';
import type { BacktestTestContext } from './backtest-test-context.js';

export type DirectRunParams = {
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly periodStart: number;
  readonly periodEnd: number;
  // Candles que faltam no banco: o motor direto recebe só o que o banco tem.
  readonly candles?: readonly EngineCandle[];
};

export type DirectRun = {
  readonly expected: ExpectedRows;
  readonly metrics: RunMetrics;
  readonly finalStateJson: string;
  readonly candles: readonly EngineCandle[];
};

export async function readCandlesFromDatabase(
  context: BacktestTestContext,
  params: DirectRunParams,
): Promise<EngineCandle[]> {
  const strategy = createStrategyVersion(loadClassicScoreboard());
  const leadIn = computeStrategyLeadInCandles(strategy.config);
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const records = await createCandleRepository(context.handle).findCandles({
    exchange: EXCHANGE,
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: params.periodStart - leadIn * duration,
    to: params.periodEnd,
  });
  return records.map((record) => ({
    symbol: record.symbol,
    timeframe: record.timeframe,
    openTime: record.openTime,
    closeTime: record.closeTime,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
  }));
}

// O MESMO motor, rodado direto em memória sobre os mesmos candles: a régua da paridade com o que ficou gravado.
export async function runDirectly(
  context: BacktestTestContext,
  params: DirectRunParams,
): Promise<DirectRun> {
  const candles = params.candles ?? (await readCandlesFromDatabase(context, params));
  const run = createRunSetup({
    ...loadClassicRunParameters(),
    symbol: params.symbol,
    timeframe: params.timeframe,
  });
  const steps = runSteps({
    engine: createEngine(),
    scenario: {
      name: 'direct',
      strategy: createStrategyVersion(loadClassicScoreboard()),
      run,
      candles,
      sentiment: [],
      commands: {},
      requiredEvents: [],
    },
  });
  const dataset = {
    name: 'direct',
    market: {
      symbol: params.symbol,
      timeframe: params.timeframe,
      sentimentSource: SENTIMENT_SOURCE,
    },
    candles,
  };
  const last = steps.at(-1);
  if (last === undefined) throw new Error('execução direta vazia');
  return {
    expected: sortedLikePersisted(expectedRowsOf(steps)),
    metrics: computeRunMetrics(buildMetricsParams(dataset, steps)),
    finalStateJson: serializeEngineState(last.result.state),
    candles,
  };
}

export function sameCanonicalJson(first: unknown, second: unknown): boolean {
  return (
    canonicalJson(JSON.parse(JSON.stringify(first))) ===
    canonicalJson(JSON.parse(JSON.stringify(second)))
  );
}
