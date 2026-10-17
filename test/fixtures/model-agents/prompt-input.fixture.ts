// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ModelPromptInput } from '../../../packages/model-agents/src/index.js';

const STEP = 900_000;
const FIRST_OPEN = 1_760_000_000_000 - (1_760_000_000_000 % STEP);

// Vela sintética e determinística: o fechamento sobe 0,5 por vela.
export function buildCandle(index: number): ModelPromptInput['candles'][number] {
  const base = 100 + index / 2;
  return [
    FIRST_OPEN + index * STEP,
    base.toFixed(2),
    (base + 1).toFixed(2),
    (base - 1).toFixed(2),
    (base + 0.5).toFixed(2),
    String(1000 + index),
  ];
}

export function buildPromptInput(candleCount = 48): ModelPromptInput {
  return {
    symbol: 'LINKUSDT',
    timeframe: '15m',
    lastCandleCloseTime: new Date(FIRST_OPEN + candleCount * STEP).toISOString(),
    candles: Array.from({ length: candleCount }, (_unused, index) => buildCandle(index)),
    readings: {
      relativeVolume: '1.25',
      atrRate: '0.004',
      atrPercentile90: '0.0051',
      atrPercentile95: null,
      momentumShort: '0.002',
      momentumLong: '-0.01',
    },
    fearGreed: { value: 42, observedAt: '2026-10-17T00:00:00.000Z' },
  };
}
