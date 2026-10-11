// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDateTime, formatDecimal, formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Alerts.module.css';
import { useClearFiredMutation, usePriceAlertsQuery } from './alerts.query.js';
import type { PriceAlert } from './alerts.validation.js';

function describeAlert(alert: PriceAlert): string {
  const verb = alert.direction === 'above' ? 'subiu acima de' : 'caiu abaixo de';
  return `${formatSymbol(alert.symbol)} ${verb} ${formatDecimal(alert.value)}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function FiredList({ fired }: { readonly fired: readonly PriceAlert[] }): ReactElement {
  return (
    <ul className={styles.list} aria-label="Alertas de preço disparados">
      {fired.map((alert) => (
        <li key={alert.id} className={styles.item}>
          <span>{describeAlert(alert)}</span>
          <time className={controls.muted} dateTime={alert.triggeredAt ?? undefined}>
            {alert.triggeredAt === null
              ? ''
              : `disparou em ${formatDateTime(Date.parse(alert.triggeredAt))}`}
          </time>
        </li>
      ))}
    </ul>
  );
}

function byTriggerDesc(first: PriceAlert, second: PriceAlert): number {
  return (second.triggeredAt ?? '').localeCompare(first.triggeredAt ?? '');
}

export function PriceAlertsCard(): ReactElement {
  const alerts = usePriceAlertsQuery();
  const clear = useClearFiredMutation();
  const all = alerts.data?.pages.flatMap((page) => page.items) ?? [];
  const fired = all.filter((alert) => alert.triggeredAt !== null).sort(byTriggerDesc);
  const armedCount = all.filter((alert) => alert.isEnabled).length;
  return (
    <Card title="Alertas de preço">
      <p className={controls.muted}>{plural(armedCount, 'alerta armado', 'alertas armados')}.</p>
      {fired.length === 0 ? null : <FiredList fired={fired} />}
      <button
        type="button"
        className={controls.button}
        disabled={fired.length === 0 || clear.isPending}
        onClick={() => clear.mutate()}
      >
        Limpar disparados
      </button>
      {clear.isSuccess ? (
        <p role="status">{plural(clear.data.deleted, 'alerta apagado', 'alertas apagados')}.</p>
      ) : null}
      {clear.isError || alerts.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível concluir. Tente novamente.
        </p>
      ) : null}
    </Card>
  );
}
