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
  ResolvedMarketDataSettings,
} from './market-data.types.js';
import { createRequestExecutor, type RequestExecutor } from './request-executor.js';
import { resolveSettings } from './resolve-settings.js';
import { TIMEFRAME_DURATION_MILLISECONDS } from './timeframe.constant.js';
import { createWeightGate } from './weight-gate.js';

type KlinesPage = {
  readonly closedCandles: readonly Candle[];
  readonly lastOpenTime: number | undefined;
  readonly rowCount: number;
};

type ClientContext = {
  readonly settings: ResolvedMarketDataSettings;
  readonly executor: RequestExecutor;
};

async function fetchPage(context: ClientContext, params: FetchKlinesParams): Promise<KlinesPage> {
  const { settings, executor } = context;
  assertValidKlinesParams(params);
  await settings.clock?.refreshIfStale();
  const body = await executor.fetchJson(buildKlinesUrl(settings.baseUrl, params));
  const candles = parseKlinesResponse({
    body,
    symbol: params.symbol,
    timeframe: params.timeframe,
    startTime: params.startTime,
    endTime: params.endTime,
  });
  // Candle com closeTime >= agora ainda está aberto e muda: nunca sai como fechado.
  const closedCandles = candles.filter((candle) => candle.closeTime < settings.now());
  return { closedCandles, lastOpenTime: candles.at(-1)?.openTime, rowCount: candles.length };
}

function nextRangeCursor(
  page: KlinesPage,
  params: FetchKlinesRangeParams,
  cursor: number,
): number | undefined {
  if (page.lastOpenTime === undefined || page.rowCount < MAX_KLINES_PER_REQUEST) return undefined;
  const nextCursor = page.lastOpenTime + TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  if (nextCursor <= cursor) throw new MarketDataResponseError('Paginação de klines não avançou.');
  return nextCursor;
}

async function fetchKlinesRange(
  context: ClientContext,
  params: FetchKlinesRangeParams,
): Promise<readonly Candle[]> {
  const collected: Candle[] = [];
  let cursor: number | undefined = params.from;
  // O cursor da página seguinte nasce da página anterior: paginação sequencial por natureza.
  while (cursor !== undefined && cursor <= params.to) {
    const page = await fetchPage(context, {
      symbol: params.symbol,
      timeframe: params.timeframe,
      startTime: cursor,
      endTime: params.to,
      limit: MAX_KLINES_PER_REQUEST,
    });
    if (params.onPage === undefined) collected.push(...page.closedCandles);
    else if (page.closedCandles.length > 0) await params.onPage(page.closedCandles);
    cursor = nextRangeCursor(page, params, cursor);
  }
  return collected;
}

export function createMarketDataClient(clientSettings: MarketDataClientSettings): MarketDataClient {
  const settings = resolveSettings(clientSettings);
  const gate = createWeightGate({
    ceiling: settings.weightCeiling,
    safetyMargin: settings.weightSafetyMargin,
    now: settings.now,
    sleep: settings.sleep,
  });
  const context: ClientContext = { settings, executor: createRequestExecutor(settings, gate) };
  return {
    fetchKlines: async (params) => (await fetchPage(context, params)).closedCandles,
    fetchKlinesRange: (params) => fetchKlinesRange(context, params),
  };
}
