// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent, ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { Icon } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import { FilterChip } from '../RunFilterBar.component.js';
import toolbar from '../RunListToolbar.module.css';
import styles from './RunSwitcher.module.css';

export type RunSwitchSearchProps = {
  readonly listId: string;
  readonly activeId: string | undefined;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

// O campo é um combobox de verdade: o foco fica nele e a opção ativa é anunciada por `aria-activedescendant`.
export function RunSwitchSearch(props: RunSwitchSearchProps): ReactElement {
  return (
    <div className={styles.searchField}>
      <Icon name="search" size={16} />
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls={props.listId}
        aria-autocomplete="list"
        aria-activedescendant={props.activeId}
        aria-label="Buscar por moeda, estratégia, tipo ou vela"
        placeholder="Buscar: moeda, estratégia, tipo ou vela"
        className={styles.searchInput}
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
    </div>
  );
}

export type RunSwitchChipsProps = {
  readonly symbols: readonly string[];
  readonly symbol: string | undefined;
  readonly onSelect: (symbol: string | undefined) => void;
};

export function RunSwitchChips({ symbols, symbol, onSelect }: RunSwitchChipsProps): ReactElement {
  return (
    <div className={toolbar.filters} role="group" aria-label="Filtrar por moeda">
      <FilterChip
        label="Todas as moedas"
        isPressed={symbol === undefined}
        onSelect={() => onSelect(undefined)}
      />
      {symbols.map((candidate) => (
        <FilterChip
          key={candidate}
          label={formatSymbol(candidate).split('/')[0] ?? candidate}
          isPressed={symbol === candidate}
          onSelect={() => onSelect(candidate)}
        />
      ))}
    </div>
  );
}

export function RunSwitchHeader({ onClose }: { readonly onClose: () => void }): ReactElement {
  return (
    <div className={styles.panelHeader}>
      <h2 className={styles.panelTitle}>Trocar execução</h2>
      <button type="button" className={controls.button} onClick={onClose}>
        <Icon name="close" size={16} />
        Fechar
      </button>
    </div>
  );
}
