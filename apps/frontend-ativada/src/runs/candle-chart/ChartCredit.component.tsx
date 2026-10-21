// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './CandleChart.module.css';

export const CHART_CREDIT_URL = 'https://www.tradingview.com/';

// Crédito exigido pelo `NOTICE` da biblioteca de desenho (Apache-2.0): o logotipo embutido dela precisa de estilo em linha,
// que a CSP do painel recusa, então o aviso e o link para o site do autor ficam no rodapé do cartão (RF22).
export function ChartCredit(): ReactElement {
  return (
    <p className={styles.credit}>
      <a href={CHART_CREDIT_URL} target="_blank" rel="noreferrer">
        TradingView Lightweight Charts™
      </a>{' '}
      — Copyright (c) 2025 TradingView, Inc.
    </p>
  );
}
