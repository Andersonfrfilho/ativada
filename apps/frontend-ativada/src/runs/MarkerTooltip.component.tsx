// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { TooltipContent } from './marker-facts.js';
import styles from './PriceChart.module.css';

export const TOOLTIP_HINT =
  'Passe o mouse, toque ou use Tab e as setas ← → no gráfico para ver cada operação. Esc fecha.';

const TONE_CLASS = {
  buy: styles.toneBuy,
  sell: styles.toneSell,
  cluster: styles.toneCluster,
} as const;

const TONE_GLYPH = { buy: '▲ ', sell: '▼ ', cluster: '' } as const;

export type MarkerTooltipProps = {
  readonly id: string;
  readonly content: TooltipContent | undefined;
};

// Um espaço fixo sob o gráfico (no celular uma dica flutuante cortaria): mostra a dica ou o convite a explorar.
export function MarkerTooltip({ id, content }: MarkerTooltipProps): ReactElement {
  if (content === undefined) return <p className={styles.tooltipHint}>{TOOLTIP_HINT}</p>;
  return (
    <div id={id} role="tooltip" className={styles.tooltip}>
      <strong className={TONE_CLASS[content.tone]}>
        <span aria-hidden="true">{TONE_GLYPH[content.tone]}</span>
        {content.heading}
      </strong>
      <dl className={styles.facts}>
        {content.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {content.note === undefined ? null : <p className={styles.note}>{content.note}</p>}
    </div>
  );
}
