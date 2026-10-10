// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { StreamSocket } from '../stream/stream-socket.types.js';
import { MARKET_TOPIC_PREFIX } from './market-stream.constant.js';

export function marketTopic(symbol: string): string {
  return `${MARKET_TOPIC_PREFIX}${symbol}`;
}

export type MarketPubSub = {
  readonly subscribe: (topic: string, socket: StreamSocket) => void;
  readonly unsubscribe: (topic: string, socket: StreamSocket) => void;
  readonly removeSocket: (socket: StreamSocket) => void;
  readonly publish: (topic: string, message: object) => number;
  readonly subscriberCount: (topic: string) => number;
};

// Pub/sub interno do ticker PÚBLICO: o tópico é do par (`market:<PAR>`), igual para todo usuário autenticado; só entra
// quem pediu, e o dado é de mercado, nunca de usuário. Os eventos do dono seguem pelo fan-out por usuário do hub.
export function createMarketPubSub(): MarketPubSub {
  const subscribers = new Map<string, Set<StreamSocket>>();

  return {
    subscribe: (topic, socket): void => {
      const sockets = subscribers.get(topic) ?? new Set<StreamSocket>();
      sockets.add(socket);
      subscribers.set(topic, sockets);
    },
    unsubscribe: (topic, socket): void => {
      const sockets = subscribers.get(topic);
      sockets?.delete(socket);
      if (sockets?.size === 0) subscribers.delete(topic);
    },
    removeSocket: (socket): void => {
      for (const [topic, sockets] of subscribers) {
        sockets.delete(socket);
        if (sockets.size === 0) subscribers.delete(topic);
      }
    },
    publish: (topic, message): number => {
      const text = JSON.stringify(message);
      let delivered = 0;
      for (const socket of subscribers.get(topic) ?? []) {
        try {
          socket.send(text);
          delivered += 1;
        } catch {
          // Soquete quebrado sai pelo `close` do servidor; os outros assinantes seguem.
        }
      }
      return delivered;
    },
    subscriberCount: (topic): number => subscribers.get(topic)?.size ?? 0,
  };
}
