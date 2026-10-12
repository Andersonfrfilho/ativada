// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createTickAggregator,
  TICK_PUBLISH_INTERVAL_MILLISECONDS,
} from '@ativada/market-data-crypto';

import type {
  MarketContext,
  MarketPublisher,
  MarketPublisherSettings,
  PairState,
} from './market-context.js';
import { publishAggregated, sweepStale } from './market-publishing.js';
import { createMarketPubSub, marketTopic } from './market-pubsub.js';
import { createMarketSubscriptions } from './market-subscriptions.js';

export type {
  MarketPublisher,
  MarketPublisherSettings,
  MarketSubscriptions,
} from './market-context.js';

function createContext<TTimer>(settings: MarketPublisherSettings<TTimer>): MarketContext {
  return {
    pairs: new Set(settings.pairs),
    pubsub: createMarketPubSub(),
    states: new Map<string, PairState>(),
    listeners: new Set(),
    now: settings.now,
    serverTime: settings.serverTime,
    staleAfterMilliseconds: settings.staleAfterMilliseconds,
    maxPairsPerSocket: settings.maxPairsPerSocket,
    reportError: settings.reportError,
    isClosed: false,
  };
}

// Ticker público -> no máximo 1 publicação por segundo por par -> assinantes do tópico `market:<PAR>` e ouvintes da Fase 4b.
export function createMarketPublisher<TTimer>(
  settings: MarketPublisherSettings<TTimer>,
): MarketPublisher {
  const context = createContext(settings);
  const aggregator = createTickAggregator<TTimer>({
    intervalMilliseconds: TICK_PUBLISH_INTERVAL_MILLISECONDS,
    setTimer: settings.setTimer,
    clearTimer: settings.clearTimer,
    publish: (raw) => publishAggregated(context, raw),
    reportError: settings.reportError,
  });
  return {
    subscriptions: createMarketSubscriptions(context),
    handleRawTick: (tick): void => {
      if (context.isClosed || !context.pairs.has(tick.symbol)) return;
      const state = context.states.get(tick.symbol) ?? {
        aggregated: undefined,
        lastReceivedAt: 0,
        isStaleSent: false,
      };
      state.lastReceivedAt = context.now();
      state.isStaleSent = false;
      context.states.set(tick.symbol, state);
      aggregator.push(tick);
    },
    addListener: (listener): (() => void) => {
      context.listeners.add(listener);
      return (): void => void context.listeners.delete(listener);
    },
    sweepStale: (): void => sweepStale(context),
    subscriberCount: (pair): number => context.pubsub.subscriberCount(marketTopic(pair)),
    close: (): void => {
      context.isClosed = true;
      aggregator.close();
      context.listeners.clear();
    },
  };
}
