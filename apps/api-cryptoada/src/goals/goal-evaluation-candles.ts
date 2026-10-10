// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository, SentimentObservationRepository } from '@cryptoada/database';
import { createSentimentPicker, toEngineCandle, toStoredSentiment } from '@cryptoada/run-recording';
import {
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type SentimentObservation,
} from '@cryptoada/strategy-engine';

import { GOAL_EVALUATION_TIMEFRAME, GOAL_HISTORY_DAYS } from './goal.constant.js';

const DURATION = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[GOAL_EVALUATION_TIMEFRAME];
const MILLISECONDS_PER_DAY = 86_400_000;

export type GoalSeriesReader = {
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly exchange: string;
};

// O trecho contíguo MAIS RECENTE da série: o motor recusa lacuna, e uma lacuna antiga não pode esconder o histórico
// novo. Candle fora de ordem ou repetido também quebra o trecho.
export function latestContiguousRun(candles: readonly EngineCandle[]): EngineCandle[] {
  let start = candles.length;
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    const candle = candles[index];
    const next = candles[index + 1];
    if (candle === undefined) break;
    if (next !== undefined && next.openTime - candle.openTime !== DURATION) break;
    start = index;
  }
  return candles.slice(start);
}

// Candle é dado público de mercado (sem dono). Os dois últimos anos de janelas mais o aquecimento do indicador mais
// longo: o que o banco tiver a partir de `GOAL_HISTORY_DAYS` atrás.
export async function loadGoalSeries(
  reader: GoalSeriesReader,
  params: { readonly symbol: string; readonly now: number },
): Promise<EngineCandle[]> {
  const records = await reader.candles.findCandles({
    exchange: reader.exchange,
    symbol: params.symbol,
    timeframe: GOAL_EVALUATION_TIMEFRAME,
    from: params.now - GOAL_HISTORY_DAYS * MILLISECONDS_PER_DAY,
    to: params.now,
  });
  return latestContiguousRun(records.map(toEngineCandle));
}

// A observação disponível em cada candle, com a regra de disponibilidade do motor (a mesma do backtest e do ao vivo).
export async function loadGoalSentiments(
  repository: Pick<SentimentObservationRepository, 'listAvailable'>,
  params: { readonly candles: readonly EngineCandle[]; readonly source: string },
): Promise<(SentimentObservation | undefined)[]> {
  const last = params.candles.at(-1);
  if (last === undefined) return [];
  const records = await repository.listAvailable({
    source: params.source,
    observedUntil: last.closeTime,
    insertedUntil: new Date(last.closeTime),
  });
  const pick = createSentimentPicker({
    observations: records.map(toStoredSentiment),
    source: params.source,
  });
  return params.candles.map(pick);
}
