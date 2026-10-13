// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { MetricLabel } from '../runs/MetricLabel.component.js';
import { buildMetricRows, type MetricRow } from '../runs/MetricsCard.component.js';
import { signedRatioText, UNAVAILABLE_DASH } from '../runs/metric-text.js';
import runStyles from '../runs/Runs.module.css';
import type { RunMetrics } from '../runs/run.validation.js';
import styles from './Backtests.module.css';

const TOTAL_RETURN = 'Retorno total';
const HIDDEN_LABELS: readonly string[] = ['Comprar e segurar', 'Excesso sobre comprar e segurar'];

export type CompareTableProps = {
  readonly firstLabel: string;
  readonly secondLabel: string;
  readonly first: RunMetrics;
  readonly second: RunMetrics;
};

function holdCell(label: string, first: RunMetrics): string {
  // Comprar e segurar só tem retorno: as demais métricas são da operação, que ele não faz.
  return label === TOTAL_RETURN ? signedRatioText(first.benchmarkReturn).text : UNAVAILABLE_DASH;
}

function valueOf(rows: readonly MetricRow[], label: string): string {
  return rows.find((candidate) => candidate.label === label)?.value.text ?? UNAVAILABLE_DASH;
}

// Linhas pelas MESMAS métricas do detalhe, para as duas colunas dizerem exatamente o mesmo.
export function CompareTable({
  firstLabel,
  secondLabel,
  first,
  second,
}: CompareTableProps): ReactElement {
  const firstRows = buildMetricRows(first).filter((row) => !HIDDEN_LABELS.includes(row.label));
  const secondRows = buildMetricRows(second);
  return (
    <div className={runStyles.tableWrap}>
      <table
        className={`${runStyles.table} ${styles.compareTable}`}
        aria-label="Comparação de execuções"
      >
        <thead>
          <tr>
            <th scope="col">Métrica</th>
            <th scope="col">Comprar e segurar</th>
            <th scope="col">{firstLabel}</th>
            <th scope="col">{secondLabel}</th>
          </tr>
        </thead>
        <tbody>
          {firstRows.map((row) => (
            <tr key={row.label}>
              <th scope="row">
                <MetricLabel label={row.label} term={row.term} />
              </th>
              <td className={runStyles.num}>{holdCell(row.label, first)}</td>
              <td className={runStyles.num}>{row.value.text}</td>
              <td className={runStyles.num}>{valueOf(secondRows, row.label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
