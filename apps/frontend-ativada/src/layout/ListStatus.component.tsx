// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';

export type ListStatusProps = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly emptyText: string;
};

// O que mostrar no lugar de uma lista vazia: carregando, falha (em alerta) ou "nada ainda".
export function ListStatus({ isPending, isError, emptyText }: ListStatusProps): ReactElement {
  if (isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar. Tente novamente.
      </p>
    );
  }
  return <p className={controls.muted}>{isPending ? 'Carregando…' : emptyText}</p>;
}
