// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeStrategyLeadInCandles,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  expandWalkForwardGrid,
  type EngineCandle,
  type StrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import { DAY_MILLISECONDS, REPORT_GRID } from './report.constant.js';

export type ReportPeriod = {
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly combinations: number;
  readonly leadInCandles: number;
};

export type PlanPeriodParams = {
  readonly candles: readonly EngineCandle[];
  readonly base: StrategyVersion['config'];
};

// O período começa no primeiro dia UTC inteiro depois do aquecimento da combinação mais exigente da grade.
export function planPeriod(params: PlanPeriodParams): ReportPeriod {
  const first = params.candles[0];
  const last = params.candles.at(-1);
  if (first === undefined || last === undefined) throw new Error('Sem candles para o período.');
  const { combinations } = expandWalkForwardGrid({ base: params.base, grid: REPORT_GRID });
  const leadInCandles = Math.max(
    ...combinations.map((combination) => computeStrategyLeadInCandles(combination.strategy.config)),
  );
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[first.timeframe];
  const warmedUp = first.openTime + leadInCandles * duration;
  return {
    periodStart: (Math.floor(warmedUp / DAY_MILLISECONDS) + 1) * DAY_MILLISECONDS,
    periodEnd: last.closeTime + 1,
    combinations: combinations.length,
    leadInCandles,
  };
}
