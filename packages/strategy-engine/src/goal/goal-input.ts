// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCandleShape } from '../assert-candle.js';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '../engine.constant.js';
import { EngineInputError } from '../strategy-engine.error.js';
import { MILLISECONDS_PER_DAY } from '../metrics/metrics.constant.js';
import { GOAL_ERROR_CODE } from './goal.constant.js';
import { GoalInputError } from './goal.error.js';
import { parseGoalSpec } from './goal-spec.schema.js';
import type { EvaluateGoalParams, GoalSpec } from './goal.types.js';

export type ParsedGoalInput = {
  readonly goal: GoalSpec;
  readonly candleDurationMilliseconds: number;
  readonly horizonCandles: number;
};

export type GoalSeriesParams = Pick<EvaluateGoalParams, 'run' | 'candles' | 'sentiments'>;

function assertCandles(params: GoalSeriesParams, duration: number): void {
  let previous: number | undefined;
  for (const candle of params.candles) {
    try {
      assertCandleShape(candle, params.run.parameters);
    } catch (error: unknown) {
      if (!(error instanceof EngineInputError)) throw error;
      throw new GoalInputError(
        GOAL_ERROR_CODE.INVALID_CANDLES,
        'Candle inválido na série da meta.',
      );
    }
    if (previous !== undefined && candle.openTime !== previous + duration) {
      throw new GoalInputError(
        GOAL_ERROR_CODE.CANDLES_NOT_CONTIGUOUS,
        'A série da meta precisa ser contígua: uma lacuna a invalida.',
      );
    }
    previous = candle.openTime;
  }
}

function assertSentiments(params: GoalSeriesParams): void {
  const { sentiments, candles } = params;
  if (sentiments !== undefined && sentiments.length !== candles.length) {
    throw new GoalInputError(
      GOAL_ERROR_CODE.INVALID_SENTIMENTS,
      'O sentimento precisa ter uma posição por candle.',
    );
  }
}

// Candles (forma e contiguidade) e sentimento da série, na ordem em que a meta os recusa.
export function assertGoalSeries(params: GoalSeriesParams): void {
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.run.parameters.timeframe];
  assertCandles(params, duration);
  assertSentiments(params);
}

// Recusa em voz alta, com código estável: meta, candles (forma e contiguidade) e sentimento. Todo timeframe do
// motor divide o dia, então o prazo em dias é sempre um número inteiro de candles.
export function parseGoalInput(params: EvaluateGoalParams): ParsedGoalInput {
  const goal = parseGoalSpec(params.goal);
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.run.parameters.timeframe];
  const horizonMilliseconds = goal.horizonDays * MILLISECONDS_PER_DAY;
  assertGoalSeries(params);
  return {
    goal,
    candleDurationMilliseconds: duration,
    horizonCandles: horizonMilliseconds / duration,
  };
}
