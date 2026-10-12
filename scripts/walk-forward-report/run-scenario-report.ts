// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLASSIC_SCOREBOARD_STRATEGY,
  type EngineCandle,
} from '../../packages/strategy-engine/src/index.js';
import { executeRun, type ExecuteRunParams } from './execute-run.js';
import { digestCandles } from './candle-digest.js';
import { buildNeighborPlans, toFixedGrid } from './neighbor-plans.js';
import { planPeriod, type ReportPeriod } from './plan-period.js';
import {
  COSTS_WITH,
  COSTS_WITHOUT,
  FACTORY_ASSIGNMENT,
  NEIGHBOR_MIN_TRADES,
  REPORT_GRID,
  STEP_MONTHS,
  TEST_MONTHS,
  TRAIN_MONTHS,
  type SCENARIOS,
} from './report.constant.js';
import type { NeighborResult, RunSummary, ScenarioReport } from './report.types.js';
import { summarizeRun } from './summarize-run.js';
import { computeBuyAndHoldReturn } from './window-stats.js';
import type { WalkForwardTestContext } from '../walkforward-test/walkforward-test-context.js';
import { seedCandles, seedStrategyVersion } from '../walkforward-test/walkforward-test-context.js';

export type ScenarioSpec = (typeof SCENARIOS)[number];

export type BuildScenarioReportParams = {
  readonly context: WalkForwardTestContext;
  readonly spec: ScenarioSpec;
  readonly candles: readonly EngineCandle[];
};

type RunKit = {
  readonly context: WalkForwardTestContext;
  readonly base: Omit<ExecuteRunParams, 'request' | 'costs'>;
};

async function timed<TValue>(work: () => Promise<TValue>): Promise<[TValue, number]> {
  const startedAt = performance.now();
  const value = await work();
  return [value, (performance.now() - startedAt) / 1000];
}

async function runSummary(
  kit: RunKit,
  request: ExecuteRunParams['request'],
  costs: ExecuteRunParams['costs'],
): Promise<RunSummary> {
  return summarizeRun(await executeRun(kit.context, { ...kit.base, request, costs }));
}

function windowRequest(minTradesPerWindow: number): ExecuteRunParams['request'] {
  return {
    grid: REPORT_GRID,
    trainMonths: TRAIN_MONTHS,
    testMonths: TEST_MONTHS,
    stepMonths: STEP_MONTHS,
    minTradesPerWindow,
  };
}

async function runNeighbors(kit: RunKit): Promise<readonly NeighborResult[]> {
  const plans = buildNeighborPlans({
    parameters: REPORT_GRID.parameters,
    baseline: FACTORY_ASSIGNMENT,
  });
  const results: NeighborResult[] = [];
  for (const plan of plans) {
    const request = { ...windowRequest(NEIGHBOR_MIN_TRADES), grid: toFixedGrid(plan.assignment) };
    results.push({
      label: plan.label,
      changedPath: plan.changedPath,
      summary: await runSummary(kit, request, COSTS_WITH),
    });
  }
  return results;
}

type ScenarioRuns = Pick<ScenarioReport, 'withCosts' | 'withoutCosts' | 'neighbors'>;

async function runAll(kit: RunKit, spec: ScenarioSpec): Promise<ScenarioRuns> {
  const withCosts = await runSummary(kit, windowRequest(spec.minTradesPerWindow), COSTS_WITH);
  const withoutCosts = await runSummary(kit, windowRequest(spec.minTradesPerWindow), COSTS_WITHOUT);
  return { withCosts, withoutCosts, neighbors: await runNeighbors(kit) };
}

type SeriesFacts = Pick<
  ScenarioReport,
  'candleCount' | 'firstOpenTime' | 'lastCloseTime' | 'digest' | 'buyAndHoldWholePeriod'
>;

function describeSeries(candles: readonly EngineCandle[], period: ReportPeriod): SeriesFacts {
  const first = candles[0];
  const last = candles.at(-1);
  if (first === undefined || last === undefined) throw new Error('Série vazia.');
  return {
    candleCount: candles.length,
    firstOpenTime: first.openTime,
    lastCloseTime: last.closeTime,
    digest: digestCandles(candles),
    buyAndHoldWholePeriod: computeBuyAndHoldReturn(candles, period.periodStart),
  };
}

// Roda, com o walk-forward de produção, a grade completa (com e sem custos) e os vizinhos de parâmetro fixo.
export async function buildScenarioReport(
  params: BuildScenarioReportParams,
): Promise<ScenarioReport> {
  const { context, spec, candles } = params;
  const base = CLASSIC_SCOREBOARD_STRATEGY.version.config;
  const period = planPeriod({ candles, base });
  await seedCandles(context, candles);
  const versionId = await seedStrategyVersion(context, base);
  const kit: RunKit = {
    context,
    base: { versionId, symbol: spec.symbol, timeframe: spec.timeframe, period },
  };
  const [runs, elapsedSeconds] = await timed(() => runAll(kit, spec));
  return {
    symbol: spec.symbol,
    timeframe: spec.timeframe,
    ...describeSeries(candles, period),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    leadInCandles: period.leadInCandles,
    combinations: period.combinations,
    minTradesPerWindow: spec.minTradesPerWindow,
    ...runs,
    elapsedSeconds,
  };
}
