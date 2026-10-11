// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { CostsCard } from '../runs/CostsCard.component.js';
import { MetricsCard } from '../runs/MetricsCard.component.js';
import { RunCurve } from '../runs/RunCurve.component.js';
import { TradesCard } from '../runs/TradesCard.component.js';
import { parseMetrics, type RunDetail } from '../runs/run.validation.js';

export function CompletedBacktest({ run }: { readonly run: RunDetail }): ReactElement {
  const metrics = parseMetrics(run.metrics);
  return (
    <>
      <MetricsCard title="Resultado" metrics={metrics} />
      <RunCurve runId={run.id} />
      <TradesCard runId={run.id} />
      <CostsCard run={run} metrics={metrics} />
    </>
  );
}
