// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimal, formatPercent } from '../format/format.js';
import { GLOSSARY_TERM } from '../glossary/glossary.constant.js';
import { Term } from '../glossary/Term.component.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import type { RunDetail, RunMetrics } from './run.validation.js';

export type CostsCardProps = {
  readonly run: RunDetail;
  readonly metrics: RunMetrics | undefined;
};

export function CostsCard({ run, metrics }: CostsCardProps): ReactElement {
  const { feeRate, slippageRate } = run.runParameters;
  return (
    <Card title="Custos incluídos">
      <p>
        Toda compra e toda venda pagam taxa de{' '}
        {feeRate === undefined ? '—' : formatPercent(Number(feeRate))} e{' '}
        <Term term={GLOSSARY_TERM.SLIPPAGE}>slippage</Term> de{' '}
        {slippageRate === undefined ? '—' : formatPercent(Number(slippageRate))}. O resultado acima
        já os desconta.
      </p>
      {metrics === undefined ? null : (
        <p className={controls.muted}>
          Taxas pagas: {formatDecimal(metrics.feesPaid)} em {metrics.trades} operações.
        </p>
      )}
    </Card>
  );
}
