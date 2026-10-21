// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import styles from './CandleChart.module.css';

export type EmptyHistoryNoticeProps = { readonly onRetry: () => void };

// As velas fechadas vieram vazias: só a vela em formação (do stream) não pode passar por um gráfico em ordem.
export function EmptyHistoryNotice({ onRetry }: EmptyHistoryNoticeProps): ReactElement {
  return (
    <div className={styles.row} role="status">
      <p className={controls.muted}>
        Nenhuma vela fechada chegou para este período; só a vela em formação aparece. Se isso não
        era esperado, tente de novo.
      </p>
      <button type="button" className={controls.button} onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}
