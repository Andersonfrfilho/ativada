// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeChangePercent,
  type AggregatedTick,
  type RawCandle,
  type RawTick,
} from '@ativada/market-data-crypto';

import { MARKET_SERVER_MESSAGE_TYPE } from './market-stream.constant.js';
import type { MarketContext, PairState } from './market-context.js';
import { marketTopic } from './market-pubsub.js';

export function buildTickMessage(
  context: MarketContext,
  aggregated: AggregatedTick,
  isStale: boolean,
): object {
  return {
    type: MARKET_SERVER_MESSAGE_TYPE.TICK,
    symbol: aggregated.symbol,
    price: aggregated.price,
    change24h: aggregated.change24h ?? null,
    at: aggregated.eventTime,
    serverTime: context.serverTime(),
    stale: isStale,
  };
}

// Preços e volume seguem em texto decimal como a Binance os mandou; `at` é o instante do evento.
export function buildCandleMessage(candle: RawCandle): object {
  return {
    type: MARKET_SERVER_MESSAGE_TYPE.CANDLE,
    symbol: candle.symbol,
    timeframe: candle.timeframe,
    openTime: candle.openTime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    closed: candle.isClosed,
    at: candle.eventTime,
  };
}

export function publishCandle(context: MarketContext, candle: RawCandle): void {
  if (context.isClosed) return;
  context.pubsub.publish(marketTopic(candle.symbol), buildCandleMessage(candle));
}

export function isPairStale(context: MarketContext, state: PairState): boolean {
  return context.now() - state.lastReceivedAt >= context.staleAfterMilliseconds;
}

function notifyListeners(context: MarketContext, aggregated: AggregatedTick): void {
  for (const listener of context.listeners) {
    try {
      const outcome = listener.onTick(aggregated);
      if (outcome instanceof Promise) outcome.catch(context.reportError);
    } catch (error: unknown) {
      context.reportError(error);
    }
  }
}

// Um tick já agregado (no máximo um por segundo por par): vai ao tópico do par e a cada ouvinte registrado.
export function publishAggregated(context: MarketContext, raw: RawTick): void {
  const state = context.states.get(raw.symbol);
  if (context.isClosed || state === undefined) return;
  const aggregated: AggregatedTick = {
    symbol: raw.symbol,
    price: raw.price,
    change24h: computeChangePercent({ open: raw.openPrice, close: raw.price }),
    eventTime: raw.eventTime,
  };
  state.aggregated = aggregated;
  context.pubsub.publish(marketTopic(raw.symbol), buildTickMessage(context, aggregated, false));
  notifyListeners(context, aggregated);
}

// Selo de dado velho: o par sem tick há `staleAfterMilliseconds` recebe UMA mensagem `stale: true` (a última, selada).
export function sweepStale(context: MarketContext): void {
  for (const state of context.states.values()) {
    if (state.aggregated === undefined || state.isStaleSent || !isPairStale(context, state))
      continue;
    state.isStaleSent = true;
    context.pubsub.publish(
      marketTopic(state.aggregated.symbol),
      buildTickMessage(context, state.aggregated, true),
    );
  }
}
