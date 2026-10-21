// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineTimeframe,
} from '../engine.constant.js';
import { MILLISECONDS_PER_DAY } from '../metrics/metrics.constant.js';

// Quantos candles do timeframe cabem em `horizonDays` dias. Todo timeframe do motor divide o dia, então é inteiro.
export function horizonCandlesOf(horizonDays: number, timeframe: EngineTimeframe): number {
  return (horizonDays * MILLISECONDS_PER_DAY) / ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe];
}
