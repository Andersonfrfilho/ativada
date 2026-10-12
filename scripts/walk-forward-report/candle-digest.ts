// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';

function describeCandle(candle: EngineCandle): string {
  const { symbol, timeframe, openTime, closeTime, open, high, low, close, volume } = candle;
  return [symbol, timeframe, openTime, closeTime, open, high, low, close, volume].join('|');
}

// SHA-256 das linhas na ordem recebida: qualquer candle trocado, removido ou reordenado muda o resumo.
export function digestCandles(candles: readonly EngineCandle[]): string {
  const hash = createHash('sha256');
  for (const candle of candles) hash.update(`${describeCandle(candle)}\n`);
  return hash.digest('hex');
}
