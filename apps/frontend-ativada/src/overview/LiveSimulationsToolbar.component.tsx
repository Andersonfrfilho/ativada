// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatSymbol } from '../format/format.js';
import { Icon } from '../layout/Icon.component.js';
import styles from './LiveSimulations.module.css';
import { SORT_KEY, type SortKey } from './live-simulations.js';

const SORT_OPTIONS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: SORT_KEY.RECENT, label: 'Mais recente' },
  { key: SORT_KEY.RESULT, label: 'Maior resultado' },
  { key: SORT_KEY.SYMBOL, label: 'Moeda (A–Z)' },
];

export type LiveSimulationsToolbarProps = {
  readonly sort: SortKey;
  readonly symbol: string | undefined;
  readonly symbols: readonly string[];
  readonly onSort: (sort: SortKey) => void;
  readonly onSymbol: (symbol: string | undefined) => void;
};

type ChipProps = {
  readonly isPressed: boolean;
  readonly label: string;
  readonly onClick: () => void;
};

function Chip({ isPressed, label, onClick }: ChipProps): ReactElement {
  return (
    <button type="button" className={styles.chip} aria-pressed={isPressed} onClick={onClick}>
      {isPressed ? <Icon name="check" size={14} /> : null}
      {label}
    </button>
  );
}

// Ordenar e filtrar valem só para o que está na tela; o filtro por moeda some quando há uma moeda só.
export function LiveSimulationsToolbar(props: LiveSimulationsToolbarProps): ReactElement {
  return (
    <div className={styles.toolbar}>
      <div className={styles.chips} role="group" aria-label="Ordenar por">
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            isPressed={props.sort === option.key}
            label={option.label}
            onClick={() => props.onSort(option.key)}
          />
        ))}
      </div>
      {props.symbols.length < 2 ? null : (
        <div className={styles.chips} role="group" aria-label="Filtrar por moeda">
          <Chip
            isPressed={props.symbol === undefined}
            label="Todas as moedas"
            onClick={() => props.onSymbol(undefined)}
          />
          {props.symbols.map((symbol) => (
            <Chip
              key={symbol}
              isPressed={props.symbol === symbol}
              label={formatSymbol(symbol)}
              onClick={() => props.onSymbol(symbol)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
