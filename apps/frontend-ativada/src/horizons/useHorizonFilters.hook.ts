// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSearchParams } from 'react-router';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { HORIZON_PARAM } from './horizon.constant.js';

export type HorizonFilters = {
  readonly symbol: string;
  readonly strategyId: string | undefined;
  readonly setSymbol: (symbol: string) => void;
  readonly setStrategyId: (strategyId: string) => void;
};

// O estado da tela mora na URL: moeda e estratégia sobrevivem a recarregar e a compartilhar o link.
export function useHorizonFilters(): HorizonFilters {
  const { marketSymbols } = useAppConfig();
  const [params, setParams] = useSearchParams();
  const requested = params.get(HORIZON_PARAM.SYMBOL) ?? '';
  const symbol = marketSymbols.includes(requested) ? requested : (marketSymbols[0] ?? '');
  const strategyId = params.get(HORIZON_PARAM.STRATEGY) ?? undefined;

  function update(name: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }

  return {
    symbol,
    strategyId,
    setSymbol: (value) => update(HORIZON_PARAM.SYMBOL, value),
    setStrategyId: (value) => update(HORIZON_PARAM.STRATEGY, value),
  };
}
