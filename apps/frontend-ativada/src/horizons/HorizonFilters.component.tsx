// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import formStyles from '../forms/Form.module.css';
import { SelectField } from '../forms/Fields.component.js';
import { useStrategiesQuery } from '../strategies/strategy.query.js';
import { BEST_STRATEGY_LABEL, BEST_STRATEGY_VALUE } from './horizon.constant.js';
import type { HorizonFilters as HorizonFilterState } from './useHorizonFilters.hook.js';

export type HorizonFiltersProps = { readonly filters: HorizonFilterState };

export function HorizonFilters({ filters }: HorizonFiltersProps): ReactElement {
  const { marketSymbols } = useAppConfig();
  const strategies = useStrategiesQuery().data ?? [];
  return (
    <div className={formStyles.grid}>
      <SelectField
        id="horizon-symbol"
        label="Moeda"
        hint="A moeda, comprada com dólar digital (USDT)."
        value={filters.symbol}
        options={marketSymbols.map((symbol) => ({ value: symbol, label: formatSymbol(symbol) }))}
        onChange={filters.setSymbol}
      />
      <SelectField
        id="horizon-strategy"
        label="Estratégia"
        hint="Padrão: a que foi melhor em cada prazo."
        value={filters.strategyId ?? BEST_STRATEGY_VALUE}
        options={[
          { value: BEST_STRATEGY_VALUE, label: BEST_STRATEGY_LABEL },
          ...strategies.map((strategy) => ({ value: strategy.id, label: strategy.name })),
        ]}
        onChange={filters.setStrategyId}
      />
    </div>
  );
}
