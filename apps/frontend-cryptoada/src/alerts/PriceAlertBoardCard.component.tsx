// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { describeAlert, messageFromAlertError, nameAlert } from './alert-text.js';
import styles from './Alerts.module.css';
import {
  useDeletePriceAlertMutation,
  usePriceAlertsQuery,
  useTogglePriceAlertMutation,
} from './alerts.query.js';
import type { PriceAlert } from './alerts.validation.js';
import { NewPriceAlertForm } from './NewPriceAlertForm.component.js';

type RowProps = {
  readonly alert: PriceAlert;
  readonly onToggle: (alertId: string, isEnabled: boolean) => void;
  readonly onDelete: (alertId: string) => void;
};

function stateLabel(alert: PriceAlert): string {
  if (alert.triggeredAt !== null) return 'Disparado';
  return alert.isEnabled ? 'Armado' : 'Desligado';
}

function toggleLabel(alert: PriceAlert): string {
  if (alert.triggeredAt !== null) return 'Religar';
  return alert.isEnabled ? 'Desligar' : 'Ligar';
}

function AlertRow({ alert, onToggle, onDelete }: RowProps): ReactElement {
  const name = nameAlert(alert);
  const isArmed = alert.triggeredAt === null && alert.isEnabled;
  return (
    <li className={styles.boardItem}>
      <span>{describeAlert(alert)}</span>
      <span className={controls.muted}>{stateLabel(alert)}</span>
      <span className={styles.actions}>
        <button
          type="button"
          className={controls.button}
          aria-label={`${toggleLabel(alert)} alerta ${name}`}
          onClick={() => onToggle(alert.id, !isArmed)}
        >
          {toggleLabel(alert)}
        </button>
        <button
          type="button"
          className={controls.button}
          aria-label={`Apagar alerta ${name}`}
          onClick={() => onDelete(alert.id)}
        >
          Apagar
        </button>
      </span>
    </li>
  );
}

export function PriceAlertBoardCard(): ReactElement {
  const alerts = usePriceAlertsQuery();
  const toggle = useTogglePriceAlertMutation();
  const remove = useDeletePriceAlertMutation();
  const all = alerts.data?.pages.flatMap((page) => page.items) ?? [];
  const message = messageFromAlertError(toggle.error ?? remove.error);
  return (
    <Card title="Seus alertas de preço">
      <p className={controls.muted}>
        O alerta dispara uma vez, quando o preço cruza o valor; depois você pode religá-lo.
      </p>
      <NewPriceAlertForm />
      {all.length === 0 ? null : (
        <ul className={styles.list} aria-label="Gerenciar alertas de preço">
          {all.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onToggle={(alertId, isEnabled) => toggle.mutate({ alertId, isEnabled })}
              onDelete={(alertId) => remove.mutate(alertId)}
            />
          ))}
        </ul>
      )}
      {message === undefined ? null : (
        <p role="alert" className={controls.error}>
          {message}
        </p>
      )}
    </Card>
  );
}
