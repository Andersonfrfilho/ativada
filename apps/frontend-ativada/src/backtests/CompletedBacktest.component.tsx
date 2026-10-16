// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { HistoryNote } from '../layout/HistoryNote.component.js';
import { CostsCard } from '../runs/CostsCard.component.js';
import { MetricsCard } from '../runs/MetricsCard.component.js';
import { RunCurve } from '../runs/RunCurve.component.js';
import { TradeChartCard } from '../runs/TradeChartCard.component.js';
import { RunTeamAside } from '../runs/team-room/RunTeamAside.component.js';
import { RUN_KIND } from '../runs/run.constant.js';
import { parseMetrics, type RunDetail } from '../runs/run.validation.js';

export function CompletedBacktest({ run }: { readonly run: RunDetail }): ReactElement {
  const metrics = parseMetrics(run.metrics);
  return (
    <>
      <HistoryNote />
      <MetricsCard title="Resultado" metrics={metrics} />
      <RunCurve runId={run.id} />
      <RunTeamAside runId={run.id} kind={run.kind} timeframe={run.timeframe}>
        <TradeChartCard runId={run.id} hasSummary={run.kind !== RUN_KIND.LIVE_PAPER} />
      </RunTeamAside>
      <CostsCard run={run} metrics={metrics} />
    </>
  );
}
