// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import { useClock } from '../live/useClock.hook.js';
import controls from '../styles/Controls.module.css';
import styles from './RateLimitNotice.module.css';

export type RateLimitNoticeProps = {
  // A hora (ms) em que o painel pede de novo sozinho; sem ela o aviso não mostra a contagem.
  readonly retryAt: number | undefined;
  readonly onRetry: (() => void) | undefined;
};

const CLOCK_INTERVAL_MILLISECONDS = 1_000;
const MILLISECONDS_PER_SECOND = 1_000;

function describeWait(retryAt: number | undefined, now: number): string {
  if (retryAt === undefined) return 'Muitas consultas em pouco tempo. Tentando de novo…';
  const seconds = Math.max(1, Math.ceil((retryAt - now) / MILLISECONDS_PER_SECOND));
  return `Muitas consultas em pouco tempo. Tentando de novo em ${seconds} s…`;
}

// O limite de pedidos recusou a consulta (429): a tela diz o porquê e quando tenta sozinha, nunca fica calada.
export function RateLimitNotice({ retryAt, onRetry }: RateLimitNoticeProps): ReactElement {
  const now = useClock(CLOCK_INTERVAL_MILLISECONDS);
  return (
    <div className={styles.notice} role="status">
      <p className={styles.text}>
        <Icon name="alert" size={16} />
        <strong>Aviso:</strong> {describeWait(retryAt, now)}
      </p>
      {onRetry === undefined ? null : (
        <button type="button" className={controls.button} onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}
