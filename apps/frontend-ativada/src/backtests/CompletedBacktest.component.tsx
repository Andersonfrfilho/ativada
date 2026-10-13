// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { HistoryNote } from '../layout/HistoryNote.component.js';
import { CostsCard } from '../runs/CostsCard.component.js';
import { MetricsCard } from '../runs/MetricsCard.component.js';
import { RunCurve } from '../runs/RunCurve.component.js';
import { TradeChartCard } from '../runs/TradeChartCard.component.js';
import { parseMetrics, type RunDetail } from '../runs/run.validation.js';

export function CompletedBacktest({ run }: { readonly run: RunDetail }): ReactElement {
  const metrics = parseMetrics(run.metrics);
  return (
    <>
      <HistoryNote />
      <MetricsCard title="Resultado" metrics={metrics} />
      <RunCurve runId={run.id} />
      <TradeChartCard runId={run.id} />
      <CostsCard run={run} metrics={metrics} />
    </>
  );
}
