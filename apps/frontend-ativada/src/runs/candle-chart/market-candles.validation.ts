// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';

// Espelho de `GET /v1/markets/candles` (velas fechadas, públicas): preço e volume em texto decimal.
export const marketCandleSchema = z.object({
  openTime: z.number(),
  closeTime: z.number(),
  open: decimalText,
  high: decimalText,
  low: decimalText,
  close: decimalText,
  volume: decimalText,
  tradeCount: z.number(),
});

export type MarketCandle = z.infer<typeof marketCandleSchema>;

// O que o desenho e a legenda precisam de uma vela, fechada (API) ou em formação (stream).
export type CandleShape = Pick<MarketCandle, 'openTime' | 'open' | 'high' | 'low' | 'close'>;
export type CandleWithVolume = CandleShape & Pick<MarketCandle, 'volume'>;
