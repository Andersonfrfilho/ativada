// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { OhlcDirection, OhlcText } from './ohlc-text.js';
import styles from './CandleChart.module.css';

const DIRECTION_SYMBOL: Readonly<Record<OhlcDirection, string>> = {
  up: '▲',
  down: '▼',
  flat: '=',
};

const DIRECTION_CLASS: Readonly<Record<OhlcDirection, string | undefined>> = {
  up: styles.up,
  down: styles.down,
  flat: undefined,
};

export type OhlcLegendProps = { readonly text: OhlcText };

type LegendItem = { readonly label: string; readonly short: string; readonly value: string };

// A legenda do topo (RF03): a vela apontada pela cruz, ou a última; estado e direção sempre com palavra ou sinal além da cor.
export function OhlcLegend({ text }: OhlcLegendProps): ReactElement {
  const items: readonly LegendItem[] = [
    { label: 'Abertura', short: 'A', value: text.open },
    { label: 'Máxima', short: 'M', value: text.high },
    { label: 'Mínima', short: 'm', value: text.low },
    { label: 'Fechamento', short: 'F', value: text.close },
  ];
  return (
    <div className={styles.legend}>
      <p className={styles.legendTitle}>
        {text.title}
        {text.isForming ? <span className={styles.forming}>em formação</span> : null}
      </p>
      <dl className={styles.legendValues}>
        {items.map((item) => (
          <div key={item.label} className={styles.legendItem}>
            <dt aria-label={item.label}>{item.short}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
        {text.change === undefined || text.direction === undefined ? null : (
          <div className={`${styles.legendItem} ${DIRECTION_CLASS[text.direction] ?? ''}`}>
            <dt aria-label="Variação">
              <span aria-hidden="true">{DIRECTION_SYMBOL[text.direction]}</span>
            </dt>
            <dd>{text.change}</dd>
          </div>
        )}
        <div className={styles.legendItem}>
          <dt aria-label="Volume">Vol</dt>
          <dd>{text.volume}</dd>
        </div>
      </dl>
    </div>
  );
}
