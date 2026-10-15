// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import { RESULT_ORDER, type ResultOrder } from './run-groups.js';
import styles from './BacktestGroups.module.css';

const ARIA_SORT: Readonly<Record<ResultOrder, 'ascending' | 'descending' | 'none'>> = {
  desc: 'descending',
  asc: 'ascending',
  none: 'none',
};

const NEXT_STEP_TEXT: Readonly<Record<ResultOrder, string>> = {
  desc: 'Ordenado do maior para o menor; clique para inverter',
  asc: 'Ordenado do menor para o maior; clique para voltar à ordem da API',
  none: 'Na ordem da API; clique para ordenar do maior para o menor',
};

export type ResultSortHeaderProps = { readonly order: ResultOrder; readonly onCycle: () => void };

// O cabeçalho "Resultado" alterna decrescente, crescente e neutro; seta + palavra dizem o estado atual.
export function ResultSortHeader({ order, onCycle }: ResultSortHeaderProps): ReactElement {
  return (
    <th scope="col" className={styles.sortCell} aria-sort={ARIA_SORT[order]}>
      <button type="button" className={styles.sortButton} onClick={onCycle}>
        Resultado
        {order === RESULT_ORDER.NONE ? null : (
          <Icon name={order === RESULT_ORDER.DESC ? 'arrowDown' : 'arrowUp'} size={14} />
        )}
        <span className={styles.visuallyHidden}>{NEXT_STEP_TEXT[order]}</span>
      </button>{' '}
      <span className={styles.scaleNote}>barra de −20% a +20%</span>
    </th>
  );
}
