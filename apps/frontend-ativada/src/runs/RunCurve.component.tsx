// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { toRatioLine } from './curve-lines.js';
import { EquityChart } from './EquityChart.component.js';
import { useEquityCurveQuery } from './runs.query.js';

export type RunCurveProps = { readonly runId: string };

export function RunCurve({ runId }: RunCurveProps): ReactElement {
  const curve = useEquityCurveQuery(runId, true);
  if (curve.data === undefined || curve.data.length < 2) {
    return (
      <Card title="Curva de patrimônio">
        <p className={controls.muted}>
          {curve.isError ? 'Não foi possível carregar a curva.' : 'Carregando a curva…'}
        </p>
      </Card>
    );
  }
  return (
    <EquityChart
      lines={[
        toRatioLine({
          label: 'Estratégia',
          tone: 'strategy',
          points: curve.data,
          pick: (point) => point.equity,
        }),
        toRatioLine({
          label: 'Comprar e segurar',
          tone: 'benchmark',
          points: curve.data,
          pick: (point) => point.benchmark,
        }),
      ]}
    />
  );
}
