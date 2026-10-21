// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DEFAULT_KLINE_STREAM_SETTINGS,
  KLINE_STREAM_SUFFIX,
  MAX_STREAMS_PER_CONNECTION,
  STREAM_NAME_SEPARATOR,
  STREAM_PATH,
  STREAMS_QUERY_PREFIX,
  WEBSOCKET_PROTOCOLS,
} from './kline-stream.constant.js';
import type { KlineStreamSettings } from './kline-stream.types.js';
import { BINANCE_STREAM_BASE_URL, SYMBOL_PATTERN } from './market-data.constant.js';
import { MarketDataInvalidRequestError } from './market-data.error.js';
import {
  MARKET_CANDLE_DURATION_MILLISECONDS,
  type MarketCandleTimeframe,
} from './timeframe.constant.js';

export type ResolvedStreamSettings = {
  readonly url: string;
  readonly symbols: ReadonlySet<string>;
  readonly timeframes: ReadonlySet<MarketCandleTimeframe>;
  readonly staleAfterMilliseconds: number;
  readonly reconnectBaseMilliseconds: number;
  readonly reconnectMaxMilliseconds: number;
  readonly stableAfterMilliseconds: number;
};

export function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MarketDataInvalidRequestError(`${name} deve ser um número positivo.`);
  }
}

export function assertBaseUrl(baseUrl: string): string {
  const isWebSocketUrl =
    URL.canParse(baseUrl) && WEBSOCKET_PROTOCOLS.includes(new URL(baseUrl).protocol);
  if (!isWebSocketUrl) throw new MarketDataInvalidRequestError('baseUrl deve ser ws:// ou wss://.');
  return baseUrl.replace(/\/+$/, '');
}

function buildStreamNames(
  symbols: readonly string[],
  timeframes: readonly MarketCandleTimeframe[],
): string[] {
  return symbols.flatMap((symbol) =>
    timeframes.map((timeframe) => `${symbol.toLowerCase()}${KLINE_STREAM_SUFFIX}${timeframe}`),
  );
}

function assertSubscription(settings: KlineStreamSettings): void {
  if (
    settings.symbols.length === 0 ||
    !settings.symbols.every((symbol) => SYMBOL_PATTERN.test(symbol))
  ) {
    throw new MarketDataInvalidRequestError(
      'symbols deve ter símbolos em letras maiúsculas e dígitos.',
    );
  }
  if (
    settings.timeframes.length === 0 ||
    !settings.timeframes.every((timeframe) =>
      Object.hasOwn(MARKET_CANDLE_DURATION_MILLISECONDS, timeframe),
    )
  ) {
    throw new MarketDataInvalidRequestError('timeframes deve ter ao menos um timeframe suportado.');
  }
}

export function resolveStreamSettings(settings: KlineStreamSettings): ResolvedStreamSettings {
  assertSubscription(settings);
  const symbols = new Set(settings.symbols);
  const timeframes = new Set(settings.timeframes);
  const names = buildStreamNames([...symbols], [...timeframes]);
  if (names.length > MAX_STREAMS_PER_CONNECTION) {
    throw new MarketDataInvalidRequestError(
      `No máximo ${MAX_STREAMS_PER_CONNECTION} streams por conexão.`,
    );
  }
  const defaults = DEFAULT_KLINE_STREAM_SETTINGS;
  const resolved = {
    staleAfterMilliseconds: settings.staleAfterMilliseconds ?? defaults.staleAfterMilliseconds,
    reconnectBaseMilliseconds:
      settings.reconnectBaseMilliseconds ?? defaults.reconnectBaseMilliseconds,
    reconnectMaxMilliseconds:
      settings.reconnectMaxMilliseconds ?? defaults.reconnectMaxMilliseconds,
    stableAfterMilliseconds: settings.stableAfterMilliseconds ?? defaults.stableAfterMilliseconds,
  };
  for (const [name, value] of Object.entries(resolved)) assertPositive(name, value);
  const baseUrl = assertBaseUrl(settings.baseUrl ?? BINANCE_STREAM_BASE_URL);
  const url = `${baseUrl}${STREAM_PATH}${STREAMS_QUERY_PREFIX}${names.join(STREAM_NAME_SEPARATOR)}`;
  return { url, symbols, timeframes, ...resolved };
}
