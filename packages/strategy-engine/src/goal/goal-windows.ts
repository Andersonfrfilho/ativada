// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import { SIGNAL_ACTION } from '../engine-vocabulary.constant.js';
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { createBenchmarkReader } from './goal-benchmark.js';
import { createTrajectoryReader } from './goal-trajectory.js';
import { classifyGoalWindow } from './goal-window-outcome.js';
import type { GoalBenchmarkResult, GoalLevels, GoalPoint, GoalWindowResult } from './goal.types.js';

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

// Para cada candle, o índice da próxima compra a partir dele (ele incluso); `length` quando não há mais.
function indexNextBuys(signals: readonly (SignalDecision | null)[]): readonly number[] {
  const next = new Array<number>(signals.length + 1).fill(signals.length);
  for (let index = signals.length - 1; index >= 0; index -= 1) {
    const isBuy = signals[index]?.action === SIGNAL_ACTION.BUY;
    next[index] = isBuy ? index : (next[index + 1] ?? signals.length);
  }
  return next;
}

function findFirstDecidedIndex(signals: readonly (SignalDecision | null)[]): number {
  const index = signals.findIndex((signal) => signal !== null);
  return index === -1 ? signals.length : index;
}

// Uma janela por candle decidido cujo prazo inteiro cabe na série (passo de 1 candle). A carteira de cada janela
// nasce livre no primeiro candle: até a primeira compra nada acontece (patrimônio = saldo inicial), e dali em
// diante a trajetória é a de uma carteira nova que entrou naquele candle, lida do cache.
export function simulateGoalWindows(params: SimulateGoalWindowsParams): SimulatedGoalWindows {
  const { candles, signals, horizonCandles, initial, levels } = params;
  const nextBuys = indexNextBuys(signals);
  const readTrajectory = createTrajectoryReader(params);
  const flat: GoalPoint = { equity: initial, equityAtLow: initial };
  const first = findFirstDecidedIndex(signals);
  const last = candles.length - horizonCandles;
  const results: GoalWindowResult[] = [];
  const benchmarkResults: GoalBenchmarkResult[] = [];
  for (let start = first; start <= last; start += 1) {
    const buy = nextBuys[start] ?? candles.length;
    const trajectory = buy < start + horizonCandles ? readTrajectory(buy) : [];
    const pointAt = (offset: number): GoalPoint => trajectory[start + offset - buy] ?? flat;
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
