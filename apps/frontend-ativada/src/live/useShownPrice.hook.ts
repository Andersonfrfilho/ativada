// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCoinPriceQuery } from '../overview/overview.query.js';
import { useLiveMarket } from './useLiveMarket.hook.js';

const MILLISECONDS_PER_SECOND = 1_000;

export type ShownPrice = {
  readonly price: string;
  readonly change: number | undefined;
  // `live`: tick em dia deste par. `rest`: último fechamento consultado por REST.
  readonly source: 'live' | 'rest';
  // Segundos desde o último tick deste par (mesmo mudo); `undefined` se nunca chegou um.
  readonly secondsSinceTick: number | undefined;
};

// O tick vivo vale enquanto ESTE par chega em dia; um par mudo cai para o REST mesmo com os outros ao vivo.
export function useShownPrice(symbol: string): ShownPrice | undefined {
  const market = useLiveMarket();
  const rest = useCoinPriceQuery(symbol).data;
  const last = market.prices.get(symbol);
  const secondsSinceTick =
    last === undefined
      ? undefined
      : Math.max(0, Math.floor((market.now - last.receivedAt) / MILLISECONDS_PER_SECOND));
  const live = market.freshPrice(symbol);
  if (live !== undefined) {
    return { price: live.price, change: live.change24h, source: 'live', secondsSinceTick };
  }
  return rest === null || rest === undefined
    ? undefined
    : { price: rest.price, change: rest.changeRatio, source: 'rest', secondsSinceTick };
}

// Só o tick vivo e em dia deste par; fora dele o chamador mantém o preço que já tem (o do servidor).
export function useLivePrice(symbol: string): string | undefined {
  return useLiveMarket().freshPrice(symbol)?.price;
}
