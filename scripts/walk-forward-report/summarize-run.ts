// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '../../packages/environment/src/index.js';
import type { PersistedWalkForward } from '../walkforward-test/read-persisted.js';
import { DAY_MILLISECONDS } from './report.constant.js';
import type { OverfittingSummary, RunSummary, WindowSummary } from './report.types.js';

const metricSchema = z.looseObject({ value: z.string().nullable() });
const drawdownSchema = z.looseObject({
  depth: z.string(),
  durationMilliseconds: z.number(),
});

const windowMetricsSchema = z.looseObject({
  totalReturn: metricSchema,
  benchmarkReturn: metricSchema,
  maxDrawdownAtLow: drawdownSchema,
  winRate: metricSchema,
  trades: z.number(),
});

const assignmentSchema = z.looseObject({
  assignment: z.array(
    z.looseObject({ path: z.string(), value: z.union([z.string(), z.number()]) }),
  ),
});

const inSampleSchema = z.looseObject({ sharpe: z.string().nullable(), trades: z.number() });
const outOfSampleSchema = z.looseObject({ metrics: windowMetricsSchema });

const overfittingSchema = z.looseObject({
  isAlert: z.boolean(),
  reasons: z.array(z.string()),
  inSampleSharpe: metricSchema,
  outOfSampleSharpe: metricSchema,
  degradation: metricSchema,
  eligibleWindows: z.number(),
  totalWindows: z.number(),
});

const runMetricsSchema = z.looseObject({
  totalReturn: metricSchema,
  benchmarkReturn: metricSchema,
  excessReturn: metricSchema,
  annualizedReturn: metricSchema,
  sharpe: metricSchema,
  sortino: metricSchema,
  winRate: metricSchema,
  profitFactor: metricSchema,
  exposure: metricSchema,
  maxDrawdownAtLow: drawdownSchema,
  trades: z.number(),
  feesPaid: z.string(),
  netProfit: z.string(),
  period: z.looseObject({ candles: z.number() }),
  overfitting: overfittingSchema,
  walkForward: z.looseObject({ liquidatedAtWindowEnd: z.number() }),
});

function parseWindow(row: PersistedWalkForward['windows'][number]): WindowSummary {
  const outOfSample = outOfSampleSchema.parse(row.outOfSample).metrics;
  const inSample = inSampleSchema.parse(row.inSample);
  const parsedParams =
    row.bestParams === undefined ? undefined : assignmentSchema.parse(row.bestParams);
  return {
    index: row.windowIndex,
    trainStart: row.trainStart,
    testStart: row.testStart,
    testEnd: row.testEnd,
    isEligible: row.status === 'ok',
    assignment: Object.fromEntries(
      (parsedParams?.assignment ?? []).map((item) => [item.path, item.value]),
    ),
    inSampleSharpe: inSample.sharpe,
    inSampleTrades: inSample.trades,
    trades: outOfSample.trades,
    totalReturn: outOfSample.totalReturn.value,
    benchmarkReturn: outOfSample.benchmarkReturn.value,
    maxDrawdown: outOfSample.maxDrawdownAtLow.depth,
    winRate: outOfSample.winRate.value,
  };
}

function parseOverfitting(value: z.infer<typeof overfittingSchema>): OverfittingSummary {
  return {
    isAlert: value.isAlert,
    reasons: value.reasons,
    inSampleSharpe: value.inSampleSharpe.value,
    outOfSampleSharpe: value.outOfSampleSharpe.value,
    degradation: value.degradation.value,
    eligibleWindows: value.eligibleWindows,
    totalWindows: value.totalWindows,
  };
}

// Lê o que o walk-forward de produção gravou (janelas e métricas fora da amostra concatenadas).
export function summarizeRun(persisted: PersistedWalkForward): RunSummary {
  const metrics = runMetricsSchema.parse(persisted.metrics);
  return {
    windows: [...persisted.windows]
      .sort((first, second) => first.windowIndex - second.windowIndex)
      .map(parseWindow),
    totalReturn: metrics.totalReturn.value,
    benchmarkReturn: metrics.benchmarkReturn.value,
    excessReturn: metrics.excessReturn.value,
    annualizedReturn: metrics.annualizedReturn.value,
    sharpe: metrics.sharpe.value,
    sortino: metrics.sortino.value,
    winRate: metrics.winRate.value,
    profitFactor: metrics.profitFactor.value,
    exposure: metrics.exposure.value,
    maxDrawdownDepth: metrics.maxDrawdownAtLow.depth,
    maxDrawdownDays: Math.round(metrics.maxDrawdownAtLow.durationMilliseconds / DAY_MILLISECONDS),
    trades: metrics.trades,
    feesPaid: metrics.feesPaid,
    netProfit: metrics.netProfit,
    testCandles: metrics.period.candles,
    liquidatedAtWindowEnd: metrics.walkForward.liquidatedAtWindowEnd,
    overfitting: parseOverfitting(metrics.overfitting),
  };
}
