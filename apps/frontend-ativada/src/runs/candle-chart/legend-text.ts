// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { StreamCandle } from '../../live/stream.validation.js';
import type { MarketCandle } from './market-candles.validation.js';
import { buildOhlcText, type OhlcText } from './ohlc-text.js';

export type LegendParams = {
  // As velas fechadas carregadas, da mais antiga à mais nova.
  readonly closed: readonly MarketCandle[];
  // A vela apontada pela cruz; `null` com o mouse fora.
  readonly index: number | null;
  // A vela em formação (só quando o gráfico acompanha o fim da simulação ao vivo).
  readonly forming: StreamCandle | undefined;
  readonly symbol: string;
  readonly timeframe: string;
  readonly timeZone: string;
};

// A legenda do topo (RF03): a vela apontada; sem cruz, a que está se formando (dizendo "em formação") ou, na falta dela,
// a última fechada.
export function buildLegendText(params: LegendParams): OhlcText | undefined {
  const { closed, index, forming, symbol, timeframe, timeZone } = params;
  const base = { symbol, timeframe, timeZone };
  if (index === null && forming !== undefined) {
    return buildOhlcText({
      ...base,
      candle: forming,
      previousClose: closed.at(-1)?.close,
      isForming: true,
    });
  }
  const position = index ?? closed.length - 1;
  const candle = closed[position];
  if (candle === undefined) return undefined;
  return buildOhlcText({
    ...base,
    candle,
    previousClose: closed[position - 1]?.close,
    isForming: false,
  });
}
