// Copyright (c) 2026 Ada Technology. All rights reserved.
import { deliverToSocket } from '../stream/socket-delivery.js';
import type { StreamSocket } from '../stream/stream-socket.types.js';
import type { MarketContext, MarketSubscriptions } from './market-context.js';
import { buildTickMessage, isPairStale } from './market-publishing.js';
import { MARKET_SERVER_MESSAGE_TYPE } from './market-stream.constant.js';
import { TooManyPairsError, UnsupportedPairError } from './market-stream.error.js';
import { marketTopic } from './market-pubsub.js';

function sortedUnique(pairs: Iterable<string>): string[] {
  return [...new Set(pairs)].sort();
}

function sendSubscribed(socket: StreamSocket): void {
  const pairs = sortedUnique(socket.data.subscribedPairs);
  deliverToSocket(socket, JSON.stringify({ type: MARKET_SERVER_MESSAGE_TYPE.SUBSCRIBED, pairs }));
}

// Quem assina no meio do dia recebe o último tick na hora (já selado como velho, se for o caso), não uma tela em branco.
function sendSnapshot(context: MarketContext, socket: StreamSocket, pair: string): void {
  const state = context.states.get(pair);
  if (state?.aggregated === undefined) return;
  const message = buildTickMessage(context, state.aggregated, isPairStale(context, state));
  deliverToSocket(socket, JSON.stringify(message));
}

function subscribe(context: MarketContext, socket: StreamSocket, pairs: readonly string[]): void {
  const requested = sortedUnique(pairs);
  for (const pair of requested) if (!context.pairs.has(pair)) throw new UnsupportedPairError(pair);
  const resulting = sortedUnique([...socket.data.subscribedPairs, ...requested]);
  if (resulting.length > context.maxPairsPerSocket) throw new TooManyPairsError();
  for (const pair of requested) {
    socket.data.subscribedPairs.add(pair);
    context.pubsub.subscribe(marketTopic(pair), socket);
  }
  sendSubscribed(socket);
  for (const pair of requested) sendSnapshot(context, socket, pair);
}

function unsubscribe(context: MarketContext, socket: StreamSocket, pairs: readonly string[]): void {
  for (const pair of sortedUnique(pairs)) {
    socket.data.subscribedPairs.delete(pair);
    context.pubsub.unsubscribe(marketTopic(pair), socket);
  }
  sendSubscribed(socket);
}

export function createMarketSubscriptions(context: MarketContext): MarketSubscriptions {
  return {
    subscribe: (socket, pairs): void => subscribe(context, socket, pairs),
    unsubscribe: (socket, pairs): void => unsubscribe(context, socket, pairs),
    removeSocket: (socket): void => {
      context.pubsub.removeSocket(socket);
      socket.data.subscribedPairs.clear();
    },
  };
}
