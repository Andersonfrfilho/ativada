// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord, CandleRepository } from '@cryptoada/database';

import {
  ASSET_PRICE_SOURCE,
  FIFTEEN_MINUTE_WINDOW_MILLISECONDS,
  ONE_DAY_WINDOW_MILLISECONDS,
} from './asset.constant.js';

export type AssetPriceReader = {
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly exchange: string;
};

export type AssetPrice = {
  readonly value: string;
  // Fechamento do candle de onde o preço veio, em ms, e o timeframe dele.
  readonly at: number;
  readonly source: string;
};

async function newestCandle(
  reader: AssetPriceReader,
  params: {
    readonly symbol: string;
    readonly timeframe:
      typeof ASSET_PRICE_SOURCE.FIFTEEN_MINUTES | typeof ASSET_PRICE_SOURCE.ONE_DAY;
    readonly from: number;
    readonly to: number;
  },
): Promise<CandleRecord | undefined> {
  const candles = await reader.candles.findCandles({ exchange: reader.exchange, ...params });
  return candles.at(-1);
}

// O preço atual do ativo é o fechamento do candle mais novo do banco (dado público de mercado): o de 15 minutos, se a
// janela recente o tem, senão o diário. Sem nenhum dos dois, `null` (a tela mostra "sem preço").
export async function loadCurrentPrice(
  reader: AssetPriceReader,
  params: { readonly symbol: string; readonly now: number },
): Promise<AssetPrice | null> {
  const { symbol, now } = params;
  const recent = await newestCandle(reader, {
    symbol,
    timeframe: ASSET_PRICE_SOURCE.FIFTEEN_MINUTES,
    from: now - FIFTEEN_MINUTE_WINDOW_MILLISECONDS,
    to: now,
  });
  if (recent !== undefined) {
    return {
      value: recent.close,
      at: recent.closeTime,
      source: ASSET_PRICE_SOURCE.FIFTEEN_MINUTES,
    };
  }
  const daily = await newestCandle(reader, {
    symbol,
    timeframe: ASSET_PRICE_SOURCE.ONE_DAY,
    from: now - ONE_DAY_WINDOW_MILLISECONDS,
    to: now,
  });
  if (daily === undefined) return null;
  return { value: daily.close, at: daily.closeTime, source: ASSET_PRICE_SOURCE.ONE_DAY };
}
