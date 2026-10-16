// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import { Icon } from '../layout/Icon.component.js';
import { RUN_KIND, type RunKind } from '../runs/run.constant.js';
import styles from './RunListToolbar.module.css';
import type { RunFilters } from './useRunFilters.hook.js';

const KIND_OPTIONS: readonly { readonly kind: RunKind | undefined; readonly label: string }[] = [
  { kind: undefined, label: 'Todos' },
  { kind: RUN_KIND.BACKTEST, label: 'Backtests' },
  { kind: RUN_KIND.WALK_FORWARD, label: 'Walk-forward' },
];

type FilterChipProps = {
  readonly label: string;
  readonly isPressed: boolean;
  readonly onSelect: () => void;
};

function FilterChip({ label, isPressed, onSelect }: FilterChipProps): ReactElement {
  return (
    <button type="button" className={styles.chip} aria-pressed={isPressed} onClick={onSelect}>
      {isPressed ? <Icon name="check" size={14} /> : null}
      {label}
    </button>
  );
}

// Um par e um tipo por vez; "Todas"/"Todos" tira o filtro. O filtro vai à API, então vale para a lista inteira.
export function RunFilterBar({ filters }: { readonly filters: RunFilters }): ReactElement {
  const { marketSymbols } = useAppConfig();
  return (
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Filtrar por moeda">
        <FilterChip
          label="Todas as moedas"
          isPressed={filters.symbol === undefined}
          onSelect={() => filters.setSymbol(undefined)}
        />
        {marketSymbols.map((symbol) => (
          <FilterChip
            key={symbol}
            label={formatSymbol(symbol).split('/')[0] ?? symbol}
            isPressed={filters.symbol === symbol}
            onSelect={() => filters.setSymbol(symbol)}
          />
        ))}
      </div>
      <div className={styles.filters} role="group" aria-label="Filtrar por tipo">
        {KIND_OPTIONS.map((option) => (
          <FilterChip
            key={option.label}
            label={option.label}
            isPressed={filters.kind === option.kind}
            onSelect={() => filters.setKind(option.kind)}
          />
        ))}
      </div>
    </div>
  );
}
