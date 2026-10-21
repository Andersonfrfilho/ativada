// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { describeLiveResult } from '../runs/live-tracking/decision-text.js';
import styles from './LiveSimulations.module.css';
import type { LiveTotal } from './live-simulations.js';

function describeStart(total: LiveTotal): string {
  return total.initialText === undefined
    ? 'Cada simulação tem o próprio saldo fictício'
    : `Cada simulação tem o próprio saldo fictício de ${total.initialText} USDT`;
}

// Soma só de simulações AO VIVO (backtests ficam fora), com a ressalva de que não é uma carteira real.
export function LiveSimulationsTotal({ total }: { readonly total: LiveTotal }): ReactElement {
  const result = describeLiveResult(total.result, total.rate);
  return (
    <div className={styles.total}>
      <p className={styles.totalLine}>
        <strong>Carteira fictícia total:</strong>{' '}
        {total.count === 1 ? '1 simulação' : `${total.count} simulações`} · saldo somado{' '}
        {total.balanceText} USDT · resultado {result.text.replace(' (', ' USDT (')}
      </p>
      <p className={styles.muted}>
        {describeStart(total)}; somar é só uma conta de conveniência, não é uma carteira real.
        {total.missing > 0 ? ` ${total.missing} ainda sem saldo, fora da soma.` : ''}
      </p>
    </div>
  );
}
