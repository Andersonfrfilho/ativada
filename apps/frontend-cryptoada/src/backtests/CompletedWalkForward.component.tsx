// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { CostsCard } from '../runs/CostsCard.component.js';
import { MetricsCard } from '../runs/MetricsCard.component.js';
import { OverfittingCard } from '../runs/OverfittingCard.component.js';
import { RunCurve } from '../runs/RunCurve.component.js';
import { WindowsCard } from '../runs/WindowsCard.component.js';
import { parseMetrics, parseOverfitting, type RunDetail } from '../runs/run.validation.js';

// O relatório principal do walk-forward é o resultado FORA da amostra, com o alerta de sobreajuste junto.
export function CompletedWalkForward({ run }: { readonly run: RunDetail }): ReactElement {
  const metrics = parseMetrics(run.metrics);
  return (
    <>
      <MetricsCard title="Resultado fora da amostra" metrics={metrics} />
      <OverfittingCard overfitting={parseOverfitting(run.overfitting)} />
      <WindowsCard runId={run.id} />
      <RunCurve runId={run.id} />
      <CostsCard run={run} metrics={metrics} />
    </>
  );
}
