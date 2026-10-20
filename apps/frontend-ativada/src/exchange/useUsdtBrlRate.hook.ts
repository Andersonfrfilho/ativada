// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { parseRate } from '../assets/asset-math.js';
import { readStoredUsdtRate } from '../assets/useUsdtRate.hook.js';
import { parseScaled } from '../format/decimal.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import { USDT_BRL_PAIR } from './exchange.constant.js';

export type UsdtBrlRate = {
  readonly rate: bigint | undefined;
  // `live`: tick em dia do USDT/BRL. `typed`: a cotação que o usuário digitou na tela de ativos.
  readonly source: 'live' | 'typed' | undefined;
};

// A cotação ao vivo vale enquanto chega em dia; sem ela, a digitada (a do parâmetro, senão a guardada no navegador).
export function useUsdtBrlRate(typedRate?: bigint): UsdtBrlRate {
  const [storedRate] = useState(() => parseRate(readStoredUsdtRate()));
  const livePrice = useLiveMarket().freshPrice(USDT_BRL_PAIR)?.price;
  const live = livePrice === undefined ? undefined : parseScaled(livePrice);
  if (live !== undefined && live > 0n) return { rate: live, source: 'live' };
  const typed = typedRate ?? storedRate;
  return typed === undefined
    ? { rate: undefined, source: undefined }
    : { rate: typed, source: 'typed' };
}
