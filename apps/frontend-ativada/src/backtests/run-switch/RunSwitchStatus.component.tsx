// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import { resultsAnnouncement } from './run-switch-options.js';
import styles from './RunSwitcher.module.css';
import type { SwitchLists } from './useRunSwitchLists.hook.js';

export type RunSwitchStatusProps = {
  readonly data: SwitchLists;
  readonly optionCount: number;
  readonly query: string;
};

function emptyText(query: string): string {
  return query === '' ? 'Nenhuma execução ainda.' : 'Nada encontrado. Tente outra palavra.';
}

// Carregando, falha, vazio, "carregar mais" e o aviso falado do resultado da busca (fica fora da vista, para o leitor de tela).
export function RunSwitchStatus({ data, optionCount, query }: RunSwitchStatusProps): ReactElement {
  const isEmpty = optionCount === 0 && !data.isPending && !data.isError;
  return (
    <>
      {data.isPending ? <p className={controls.muted}>Carregando…</p> : null}
      {data.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar todas as execuções. Tente novamente.
        </p>
      ) : null}
      {isEmpty ? <p className={controls.muted}>{emptyText(query)}</p> : null}
      {data.hasMore ? (
        <button type="button" className={controls.button} onClick={data.loadMore}>
          Carregar mais execuções
        </button>
      ) : null}
      <p role="status" className={styles.visuallyHidden}>
        {data.isPending ? '' : resultsAnnouncement(optionCount)}
      </p>
    </>
  );
}
