// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Candle } from './candle.types.js';
import { parseKlinesResponse } from './kline.schema.js';
import { assertValidKlinesParams, buildKlinesUrl } from './klines-request.js';
import { MAX_KLINES_PER_REQUEST } from './market-data.constant.js';
import { MarketDataResponseError } from './market-data.error.js';
import type {
  FetchKlinesParams,
  FetchKlinesRangeParams,
  MarketDataClient,
  MarketDataClientSettings,
} from './market-data.types.js';
import { createRequestExecutor } from './request-executor.js';
import { resolveSettings } from './resolve-settings.js';
import { TIMEFRAME_DURATION_MILLISECONDS } from './timeframe.constant.js';
import { createWeightGate } from './weight-gate.js';

type KlinesPage = {
  readonly closedCandles: readonly Candle[];
  readonly lastOpenTime: number | undefined;
  readonly rowCount: number;
};

export function createMarketDataClient(clientSettings: MarketDataClientSettings): MarketDataClient {
  const settings = resolveSettings(clientSettings);
  const gate = createWeightGate({
    ceiling: settings.weightCeiling,
    safetyMargin: settings.weightSafetyMargin,
    now: settings.now,
    sleep: settings.sleep,
  });
  const executor = createRequestExecutor(settings, gate);

  async function fetchPage(params: FetchKlinesParams): Promise<KlinesPage> {
    assertValidKlinesParams(params);
    const body = await executor.fetchJson(buildKlinesUrl(settings.baseUrl, params));
    const candles = parseKlinesResponse({
      body,
      symbol: params.symbol,
      timeframe: params.timeframe,
    });
    // Candle com closeTime >= agora ainda está aberto e muda: nunca sai como fechado.
    const closedCandles = candles.filter((candle) => candle.closeTime < settings.now());
    return { closedCandles, lastOpenTime: candles.at(-1)?.openTime, rowCount: candles.length };
  }

  async function fetchKlines(params: FetchKlinesParams): Promise<readonly Candle[]> {
    return (await fetchPage(params)).closedCandles;
  }

  async function fetchKlinesRange(params: FetchKlinesRangeParams): Promise<readonly Candle[]> {
    const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
    const collected: Candle[] = [];
    let cursor = params.from;
    // O cursor da página seguinte nasce da página anterior: paginação sequencial por natureza.
    while (cursor <= params.to) {
      const page = await fetchPage({
        symbol: params.symbol,
        timeframe: params.timeframe,
        startTime: cursor,
        endTime: params.to,
        limit: MAX_KLINES_PER_REQUEST,
      });
      collected.push(...page.closedCandles);
      if (page.lastOpenTime === undefined || page.rowCount < MAX_KLINES_PER_REQUEST) break;
      const nextCursor = page.lastOpenTime + duration;
      if (nextCursor <= cursor)
        throw new MarketDataResponseError('Paginação de klines não avançou.');
      cursor = nextCursor;
    }
    return collected;
  }

  return { fetchKlines, fetchKlinesRange };
}
