// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toEngineDecimal, formatEngineDecimal } from '../engine-decimal.js';
import { GOAL_VERSION } from './goal.constant.js';
import { computeGoalLevels } from './goal-levels.js';
import { parseGoalInput } from './goal-input.js';
import { computeGoalSignals } from './goal-signals.js';
import { summarizeGoalWindows } from './goal-summary.js';
import { resolveGoalVerdict } from './goal-verdict.js';
import { simulateGoalWindows } from './goal-windows.js';
import type { EvaluateGoalParams, GoalEvaluation } from './goal.types.js';

// Avaliação de uma meta (RF13, ADR 0002 §"Metas (T4b.1)"): PURA e determinística. Simula a estratégia em TODAS as janelas
// do prazo, com passo de 1 candle, com o MESMO motor do backtest (sinal e carteira, taxa e slippage inclusos), e mede
// por janela o desfecho — alvo, perda máxima ou prazo — sem relógio, sorteio nem I/O.
export function evaluateGoal(params: EvaluateGoalParams): GoalEvaluation {
  const parsed = parseGoalInput(params);
  const { strategy, run, candles } = params;
  const initial = toEngineDecimal(run.parameters.initialBalance);
  const levels = computeGoalLevels({ initial, goal: parsed.goal });
  const signals = computeGoalSignals({ strategy, run, candles, sentiments: params.sentiments });
  const simulated = simulateGoalWindows({
    strategy,
    run,
    candles,
    signals,
    levels,
    initial,
    horizonCandles: parsed.horizonCandles,
  });
  const summary = summarizeGoalWindows({
    results: simulated.results,
    benchmarkResults: simulated.benchmarkResults,
    initial,
    candleDurationMilliseconds: parsed.candleDurationMilliseconds,
  });
  const { firstWindowIndex, lastWindowIndex } = simulated;
  return {
    ...summary,
    version: GOAL_VERSION,
    goal: parsed.goal,
    horizonCandles: parsed.horizonCandles,
    levels: { target: formatEngineDecimal(levels.target), stop: formatEngineDecimal(levels.stop) },
    firstWindowOpenTime:
      firstWindowIndex === undefined ? null : (candles[firstWindowIndex]?.openTime ?? null),
    lastWindowOpenTime:
      lastWindowIndex === undefined ? null : (candles[lastWindowIndex]?.openTime ?? null),
    verdict: resolveGoalVerdict(summary),
  };
}
