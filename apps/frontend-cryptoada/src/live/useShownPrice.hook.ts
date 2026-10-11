// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCoinPriceQuery } from '../overview/overview.query.js';
import { useLiveMarket } from './useLiveMarket.hook.js';

export type ShownPrice = { readonly price: string; readonly change: number | undefined };

// O tick vivo vale enquanto o socket e os ticks estão em dia; senão, o último fechamento lido por REST.
export function useShownPrice(symbol: string): ShownPrice | undefined {
  const market = useLiveMarket();
  const rest = useCoinPriceQuery(symbol).data;
  const live = market.prices.get(symbol);
  if (market.isLive && live !== undefined && !live.isStale) {
    return { price: live.price, change: live.change24h };
  }
  return rest === null || rest === undefined
    ? undefined
    : { price: rest.price, change: rest.changeRatio };
}

// Só o tick vivo e em dia; fora dele o chamador mantém o preço que já tem (o do servidor).
export function useLivePrice(symbol: string): string | undefined {
  const market = useLiveMarket();
  const live = market.prices.get(symbol);
  return market.isLive && live !== undefined && !live.isStale ? live.price : undefined;
}
