// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { createBenchmarkReader } from './goal-benchmark.js';
import { classifyGoalWindow } from './goal-window-outcome.js';
import { createGoalWindowPath, findFirstDecidedIndex } from './goal-window-path.js';
import type { GoalBenchmarkResult, GoalLevels, GoalWindowResult } from './goal.types.js';

export type SimulateGoalWindowsParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly signals: readonly (SignalDecision | null)[];
  readonly levels: GoalLevels;
  readonly initial: EngineDecimalValue;
  readonly horizonCandles: number;
};

export type SimulatedGoalWindows = {
  readonly results: readonly GoalWindowResult[];
  readonly benchmarkResults: readonly GoalBenchmarkResult[];
  readonly firstWindowIndex: number | undefined;
  readonly lastWindowIndex: number | undefined;
};

// Uma janela por candle decidido cujo prazo inteiro cabe na série (passo de 1 candle). A carteira de cada janela
// nasce livre no primeiro candle: até a primeira compra nada acontece (patrimônio = saldo inicial), e dali em
// diante a trajetória é a de uma carteira nova que entrou naquele candle, lida do cache.
export function simulateGoalWindows(params: SimulateGoalWindowsParams): SimulatedGoalWindows {
  const { candles, signals, horizonCandles, levels } = params;
  const pathAt = createGoalWindowPath(params);
  const first = findFirstDecidedIndex(signals);
  const last = candles.length - horizonCandles;
  const results: GoalWindowResult[] = [];
  const benchmarkResults: GoalBenchmarkResult[] = [];
  for (let start = first; start <= last; start += 1) {
    const pointAt = pathAt(start);
    results.push(classifyGoalWindow({ levels, horizonCandles, pointAt }));
    const benchmark = classifyGoalWindow({
      levels,
      horizonCandles,
      pointAt: createBenchmarkReader({ ...params, windowStart: start }),
    });
    benchmarkResults.push({ outcome: benchmark.outcome });
  }
  return {
    results,
    benchmarkResults,
    firstWindowIndex: results.length === 0 ? undefined : first,
    lastWindowIndex: results.length === 0 ? undefined : last,
  };
}
