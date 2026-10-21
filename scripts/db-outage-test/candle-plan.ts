// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { LEAD_IN_CANDLES } from '../live-test/live-test-context.js';
import { HOUR_MILLISECONDS, NEW_CANDLES } from './db-outage-test.constant.js';

export type CandlePlan = {
  // Aquecimento (já fechado) e as velas que chegam depois, na ordem.
  readonly warmUp: readonly EngineCandle[];
  readonly arriving: readonly EngineCandle[];
  // Abertura da vela em curso: de onde a simulação ao vivo começa.
  readonly startsAt: number;
};

function shift(candles: readonly EngineCandle[], offset: number): EngineCandle[] {
  return candles.map((candle) => ({
    ...candle,
    openTime: candle.openTime + offset,
    closeTime: candle.closeTime + offset,
  }));
}

// A série real da paridade deslocada para que a vela de índice `LEAD_IN` seja a que está aberta agora (como no live-test).
export function buildCandlePlan(): CandlePlan {
  const dataset = REAL_DATASETS[0];
  const anchor = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || anchor === undefined) throw new Error('sem conjunto real');
  const startsAt = Math.floor(Date.now() / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const moved = shift(dataset.candles, startsAt - anchor.openTime);
  return {
    warmUp: moved.slice(0, LEAD_IN_CANDLES),
    arriving: moved.slice(LEAD_IN_CANDLES, LEAD_IN_CANDLES + NEW_CANDLES),
    startsAt,
  };
}
