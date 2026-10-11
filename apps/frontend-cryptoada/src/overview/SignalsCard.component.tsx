// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';
import { SIGNAL_ACTION, SIGNAL_LABEL } from './overview.constant.js';
import type { Signal } from './overview.validation.js';
import { formatDateTime } from './format.js';

export type SignalsCardProps = { readonly signals: readonly Signal[] };

function actionClassName(action: Signal['action']): string | undefined {
  if (action === SIGNAL_ACTION.BUY) return styles.buy;
  return action === SIGNAL_ACTION.SELL ? styles.sell : styles.hold;
}

export function SignalsCard({ signals }: SignalsCardProps): ReactElement {
  return (
    <Card title="Últimos sinais">
      {signals.length === 0 ? (
        <p className={controls.muted}>Ainda não houve sinais nesta simulação.</p>
      ) : (
        <ul className={styles.signals} aria-label="Últimos sinais">
          {signals.map((signal) => (
            <li key={signal.candleTime} className={styles.signal}>
              <span className={`${styles.badge} ${actionClassName(signal.action)}`}>
                {SIGNAL_LABEL[signal.action]}
              </span>
              <span className={styles.signalReason}>{signal.reason}</span>
              <time className={controls.muted} dateTime={new Date(signal.candleTime).toISOString()}>
                {formatDateTime(signal.candleTime)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
