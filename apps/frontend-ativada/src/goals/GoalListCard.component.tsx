// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { formatChangePercent, formatPercent, formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import controls from '../styles/Controls.module.css';
import { messageFromGoalError } from './goal-form.validation.js';
import { useDeleteGoalMutation, useGoalsQuery } from './goal.query.js';
import type { Goal } from './goal.validation.js';
import styles from './Goals.module.css';

type GoalRowProps = {
  readonly goal: Goal;
  readonly isConfirming: boolean;
  readonly onDelete: (goalId: string) => void;
};

function GoalRow({ goal, isConfirming, onDelete }: GoalRowProps): ReactElement {
  const name = formatSymbol(goal.symbol);
  return (
    <li className={styles.row}>
      <Link to={`/metas/${goal.id}`} className={styles.link}>
        <span className={styles.symbol}>{name}</span>
        <span>
          {formatChangePercent(Number(goal.targetRate))} em {goal.horizonDays} dias
        </span>
        <span className={controls.muted}>
          perda máxima {formatPercent(Number(goal.maxLossRate))}
        </span>
      </Link>
      <button
        type="button"
        className={`${controls.button} ${isConfirming ? controls.danger : ''}`}
        onClick={() => onDelete(goal.id)}
      >
        {isConfirming ? `Confirmar: apagar meta de ${name}` : `Apagar meta de ${name}`}
      </button>
    </li>
  );
}

type GoalDeletion = {
  readonly confirmingId: string | undefined;
  readonly message: string | undefined;
  readonly handleDelete: (goalId: string) => void;
};

// Apagar pede confirmação no próprio botão: o primeiro clique arma, o segundo apaga.
function useGoalDeletion(): GoalDeletion {
  const remove = useDeleteGoalMutation();
  const [confirmingId, setConfirmingId] = useState<string | undefined>(undefined);

  function handleDelete(goalId: string): void {
    if (confirmingId !== goalId) {
      setConfirmingId(goalId);
      return;
    }
    remove.mutate(goalId, { onSettled: () => setConfirmingId(undefined) });
  }

  return { confirmingId, message: messageFromGoalError(remove.error), handleDelete };
}

export function GoalListCard(): ReactElement {
  const goals = useGoalsQuery();
  const deletion = useGoalDeletion();
  const items = goals.data ?? [];
  return (
    <Card title="Suas metas">
      {items.length === 0 ? (
        <ListStatus
          isPending={goals.isPending}
          isError={goals.isError}
          emptyText="Nenhuma meta ainda. Declare a primeira acima."
        />
      ) : (
        <ul className={styles.list} aria-label="Metas">
          {items.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              isConfirming={deletion.confirmingId === goal.id}
              onDelete={deletion.handleDelete}
            />
          ))}
        </ul>
      )}
      {deletion.message === undefined ? null : (
        <p role="alert" className={controls.error}>
          {deletion.message}
        </p>
      )}
    </Card>
  );
}
