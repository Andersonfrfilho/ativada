// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimal, formatPercent } from '../format/format.js';
import { GLOSSARY_TERM, type GlossaryTerm } from '../glossary/glossary.constant.js';
import { Card } from '../layout/Card.component.js';
import { MetricLabel } from './MetricLabel.component.js';
import styles from './Runs.module.css';
import {
  percentText,
  plainText,
  signedRatioText,
  UNAVAILABLE_DASH,
  type MetricText,
} from './metric-text.js';
import type { RunMetrics } from './run.validation.js';

export type MetricRow = {
  readonly label: string;
  readonly value: MetricText;
  readonly term?: GlossaryTerm;
};

function plain(text: string): MetricText {
  return { text, hint: undefined };
}

export function buildMetricRows(metrics: RunMetrics): readonly MetricRow[] {
  return [
    { label: 'Retorno total', value: signedRatioText(metrics.totalReturn) },
    { label: 'Comprar e segurar', value: signedRatioText(metrics.benchmarkReturn) },
    { label: 'Excesso sobre comprar e segurar', value: signedRatioText(metrics.excessReturn) },
    { label: 'Retorno anualizado', value: signedRatioText(metrics.annualizedReturn) },
    {
      label: 'Maior queda',
      value: plain(formatPercent(Number(metrics.maxDrawdownAtClose.depth))),
      term: GLOSSARY_TERM.MAX_DRAWDOWN,
    },
    { label: 'Sharpe', value: plainText(metrics.sharpe), term: GLOSSARY_TERM.SHARPE },
    { label: 'Sortino', value: plainText(metrics.sortino), term: GLOSSARY_TERM.SORTINO },
    {
      label: 'Operações',
      value: plain(`${metrics.trades} (${metrics.wins} ganhas, ${metrics.losses} perdidas)`),
    },
    { label: 'Taxa de acerto', value: percentText(metrics.winRate), term: GLOSSARY_TERM.WIN_RATE },
    {
      label: 'Fator de lucro',
      value: plainText(metrics.profitFactor),
      term: GLOSSARY_TERM.PROFIT_FACTOR,
    },
    { label: 'Tempo exposto', value: percentText(metrics.exposure) },
    { label: 'Taxas pagas', value: plain(formatDecimal(metrics.feesPaid)) },
    {
      label: 'Patrimônio final',
      value: plain(
        metrics.finalEquity === null ? UNAVAILABLE_DASH : formatDecimal(metrics.finalEquity),
      ),
    },
  ];
}

export type MetricsCardProps = { readonly title: string; readonly metrics: RunMetrics | undefined };

export function MetricsCard({ title, metrics }: MetricsCardProps): ReactElement {
  return (
    <Card title={title}>
      {metrics === undefined ? (
        <p>Métricas indisponíveis para esta execução.</p>
      ) : (
        <dl className={styles.facts}>
          {buildMetricRows(metrics).map((row) => (
            <div key={row.label} className={styles.fact}>
              <dt>
                <MetricLabel label={row.label} term={row.term} />
              </dt>
              <dd>
                {row.value.text}
                {row.value.hint === undefined ? null : (
                  <span className={styles.hint}>({row.value.hint})</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
