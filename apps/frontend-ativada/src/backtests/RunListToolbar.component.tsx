// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import { useVersionIndexQuery } from '../strategies/strategy.query.js';
import { describeLookup, lookupVersion } from '../strategies/version-index.js';
import { RESULT_ORDER, type ResultOrder, type RunGroup } from './run-groups.js';
import styles from './RunListToolbar.module.css';

const ORDER_TEXT: Readonly<Record<ResultOrder, string>> = {
  desc: 'resultado, maior primeiro',
  asc: 'resultado, menor primeiro',
  none: 'mais recentes primeiro',
};

export type RunListToolbarProps = {
  readonly groups: readonly RunGroup[];
  readonly selected: ReadonlySet<string>;
  readonly order: ResultOrder;
  readonly onToggle: (key: string) => void;
};

// Escolher estratégias mostra só os grupos marcados; todas marcadas é o mesmo que nenhum filtro.
export function RunListToolbar({
  groups,
  selected,
  order,
  onToggle,
}: RunListToolbarProps): ReactElement {
  const index = useVersionIndexQuery();
  return (
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Filtrar por estratégia (várias)">
        {groups.map((group) => {
          const first = group.runs[0]?.run;
          const label =
            first === undefined
              ? ''
              : describeLookup(lookupVersion(index, first.strategyVersionId));
          const isPressed = selected.has(group.key);
          return (
            <button
              key={group.key}
              type="button"
              className={styles.chip}
              aria-pressed={isPressed}
              onClick={() => onToggle(group.key)}
            >
              {isPressed ? <Icon name="check" size={14} /> : null}
              {label}
            </button>
          );
        })}
      </div>
      <p className={styles.note}>
        Agrupado por <strong>estratégia</strong> · ordenado por <strong>{ORDER_TEXT[order]}</strong>
        {order === RESULT_ORDER.NONE ? ' (ordem da API)' : ''}
      </p>
    </div>
  );
}
