// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { formatDate } from '../format/format.js';
import { ApiError } from '../http/api.error.js';
import { Card } from '../layout/Card.component.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Strategies.module.css';
import { useDeleteStrategyMutation, useDuplicateStrategyMutation } from './strategy.mutation.js';
import { useStrategiesInfiniteQuery } from './strategy.query.js';
import type { Strategy } from './strategy.validation.js';

const EXAMPLE_ERROR_CODE = 'STRATEGY_IS_EXAMPLE';

function describeFailure(error: Error | null): string | undefined {
  if (error === null) return undefined;
  if (error instanceof ApiError && error.code === EXAMPLE_ERROR_CODE) {
    return 'A estratégia de exemplo não se apaga: duplique-a para ter uma cópia sua.';
  }
  return 'Não foi possível concluir. Tente novamente.';
}

type DeleteControlProps = {
  readonly strategy: Strategy;
  readonly onFailure: (error: Error) => void;
};

// Apagar pede confirmação na própria linha; a estratégia de exemplo não tem o botão.
function DeleteControl({ strategy, onFailure }: DeleteControlProps): ReactElement | null {
  const remove = useDeleteStrategyMutation();
  const [isConfirming, setIsConfirming] = useState(false);
  if (strategy.isExample) return null;
  if (!isConfirming) {
    return (
      <button
        type="button"
        className={controls.button}
        aria-label={`Apagar ${strategy.name}`}
        onClick={() => setIsConfirming(true)}
      >
        Apagar
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`${controls.button} ${controls.danger}`}
        aria-label={`Confirmar: apagar ${strategy.name}`}
        onClick={() => remove.mutate(strategy.id, { onError: onFailure })}
      >
        Apagar
      </button>
      <button type="button" className={controls.button} onClick={() => setIsConfirming(false)}>
        Cancelar
      </button>
    </>
  );
}

function StrategyRow({ strategy }: { readonly strategy: Strategy }): ReactElement {
  const navigate = useNavigate();
  const duplicate = useDuplicateStrategyMutation();
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const failure = describeFailure(duplicate.error ?? deleteError);

  return (
    <li className={styles.item}>
      <Link to={`/estrategias/${strategy.id}`} className={styles.name}>
        {strategy.name}
      </Link>
      {strategy.isExample ? <span className={styles.badge}>Exemplo</span> : null}
      <span className={controls.muted}>
        atualizada em {formatDate(Date.parse(strategy.updatedAt))}
      </span>
      <button
        type="button"
        className={controls.button}
        aria-label={`Duplicar ${strategy.name}`}
        disabled={duplicate.isPending}
        onClick={() =>
          duplicate.mutate(strategy, {
            onSuccess: (created) => void navigate(`/estrategias/${created.strategy.id}`),
          })
        }
      >
        Duplicar
      </button>
      <DeleteControl strategy={strategy} onFailure={setDeleteError} />
      {failure === undefined ? null : (
        <p role="alert" className={controls.error}>
          {failure}
        </p>
      )}
    </li>
  );
}

export function StrategyListCard(): ReactElement {
  const strategies = useStrategiesInfiniteQuery();
  const items = strategies.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Card title="Estratégias">
      <p className={controls.muted}>
        Toda estratégia nasce de uma cópia: duplique o exemplo e ajuste os parâmetros. Cada ajuste
        salvo gera uma versão nova; as execuções antigas continuam presas à versão que as produziu.
      </p>
      {items.length === 0 ? (
        <ListStatus
          isPending={strategies.isPending}
          isError={strategies.isError}
          emptyText="Nenhuma estratégia."
        />
      ) : (
        <ul className={styles.list} aria-label="Suas estratégias">
          {items.map((strategy) => (
            <StrategyRow key={strategy.id} strategy={strategy} />
          ))}
        </ul>
      )}
      {strategies.hasNextPage ? (
        <button
          type="button"
          className={controls.button}
          onClick={() => void strategies.fetchNextPage()}
        >
          Carregar mais estratégias
        </button>
      ) : null}
    </Card>
  );
}
