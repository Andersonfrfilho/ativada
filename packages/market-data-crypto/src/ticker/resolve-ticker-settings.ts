// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  KLINE_STREAM_SUFFIX,
  MAX_STREAMS_PER_CONNECTION,
  STREAM_NAME_SEPARATOR,
  STREAM_PATH,
  STREAMS_QUERY_PREFIX,
} from '../kline-stream.constant.js';
import { BINANCE_STREAM_BASE_URL, SYMBOL_PATTERN } from '../market-data.constant.js';
import { MarketDataInvalidRequestError } from '../market-data.error.js';
import { assertBaseUrl, assertPositive } from '../resolve-stream-settings.js';
import { DEFAULT_TICKER_STREAM_SETTINGS, MINI_TICKER_STREAM_SUFFIX } from './ticker.constant.js';
import type { TickerStreamSettings } from './ticker.types.js';

export type ResolvedTickerSettings = {
  readonly url: string;
  readonly symbols: ReadonlySet<string>;
  readonly timeframes: ReadonlySet<string>;
  readonly staleAfterMilliseconds: number;
  readonly reconnectBaseMilliseconds: number;
  readonly reconnectMaxMilliseconds: number;
  readonly stableAfterMilliseconds: number;
};

export function resolveTickerSettings(settings: TickerStreamSettings): ResolvedTickerSettings {
  const symbols = new Set(settings.symbols);
  if (symbols.size === 0 || ![...symbols].every((symbol) => SYMBOL_PATTERN.test(symbol))) {
    throw new MarketDataInvalidRequestError(
      'symbols deve ter símbolos em letras maiúsculas e dígitos.',
    );
  }
  const timeframes = new Set(settings.timeframes ?? []);
  const names = [
    ...[...symbols].map((symbol) => `${symbol.toLowerCase()}${MINI_TICKER_STREAM_SUFFIX}`),
    ...[...symbols].flatMap((symbol) =>
      [...timeframes].map(
        (timeframe) => `${symbol.toLowerCase()}${KLINE_STREAM_SUFFIX}${timeframe}`,
      ),
    ),
  ];
  if (names.length > MAX_STREAMS_PER_CONNECTION) {
    throw new MarketDataInvalidRequestError(
      `No máximo ${MAX_STREAMS_PER_CONNECTION} streams por conexão.`,
    );
  }
  const defaults = DEFAULT_TICKER_STREAM_SETTINGS;
  const numbers = {
    staleAfterMilliseconds: settings.staleAfterMilliseconds ?? defaults.staleAfterMilliseconds,
    reconnectBaseMilliseconds:
      settings.reconnectBaseMilliseconds ?? defaults.reconnectBaseMilliseconds,
    reconnectMaxMilliseconds:
      settings.reconnectMaxMilliseconds ?? defaults.reconnectMaxMilliseconds,
    stableAfterMilliseconds: settings.stableAfterMilliseconds ?? defaults.stableAfterMilliseconds,
  };
  for (const [name, value] of Object.entries(numbers)) assertPositive(name, value);
  const baseUrl = assertBaseUrl(settings.baseUrl ?? BINANCE_STREAM_BASE_URL);
  const url = `${baseUrl}${STREAM_PATH}${STREAMS_QUERY_PREFIX}${names.join(STREAM_NAME_SEPARATOR)}`;
  return { url, symbols, timeframes, ...numbers };
}
