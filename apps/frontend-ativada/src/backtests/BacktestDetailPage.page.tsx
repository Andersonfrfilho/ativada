// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { ApiError } from '../http/api.error.js';
import { HTTP_STATUS } from '@ativada/environment';
import controls from '../styles/Controls.module.css';
import { RunHeader } from '../runs/RunHeader.component.js';
import {
  LiveDecisionsSection,
  LiveTrackingSection,
} from '../runs/live-tracking/LiveTrackingSection.component.js';
import { RunProgressCard } from '../runs/RunProgressCard.component.js';
import { LiveChartArea } from '../runs/team-room/LiveChartArea.component.js';
import { FAILURE_TEXT, RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import runStyles from '../runs/Runs.module.css';
import { isActiveRun, type RunDetail } from '../runs/run.validation.js';
import { useRunDetailQuery } from '../runs/runs.query.js';
import { CompletedBacktest } from './CompletedBacktest.component.js';
import { CompletedWalkForward } from './CompletedWalkForward.component.js';

function failureMessage(run: RunDetail): string {
  if (run.status === RUN_STATUS.CANCELLED) return 'Execução cancelada.';
  const code = run.errorCode ?? '';
  return FAILURE_TEXT[code] ?? `A execução falhou (${code || 'sem código'}).`;
}

// A simulação ao vivo (qualquer estado, menos falha) abre pelo acompanhamento: saldo, meta, o que falta e as decisões; o gráfico fica entre eles.
function LivePaperBody({ run }: { readonly run: RunDetail }): ReactElement {
  const hasChart = run.status === RUN_STATUS.RUNNING || run.status === RUN_STATUS.CANCELLED;
  return (
    <>
      {run.status === RUN_STATUS.CANCELLED ? (
        <p role="status" className={controls.muted}>
          {failureMessage(run)}
        </p>
      ) : null}
      <LiveTrackingSection run={run} />
      {run.status === RUN_STATUS.COMPLETED ? <CompletedBacktest run={run} /> : null}
      <LiveChartArea runId={run.id} hasChart={hasChart} />
      <LiveDecisionsSection run={run} />
      {isActiveRun(run) ? <RunProgressCard run={run} /> : null}
    </>
  );
}

function RunBody({ run }: { readonly run: RunDetail }): ReactElement {
  if (run.kind === RUN_KIND.LIVE_PAPER && run.status !== RUN_STATUS.FAILED) {
    return <LivePaperBody run={run} />;
  }
  // Backtest e walk-forward só mostram operações depois de concluídos.
  if (isActiveRun(run)) return <RunProgressCard run={run} />;
  if (run.status !== RUN_STATUS.COMPLETED) {
    const isCancelled = run.status === RUN_STATUS.CANCELLED;
    return (
      <p
        role={isCancelled ? 'status' : 'alert'}
        className={isCancelled ? controls.muted : controls.error}
      >
        {failureMessage(run)}
      </p>
    );
  }
  return run.kind === RUN_KIND.WALK_FORWARD ? (
    <CompletedWalkForward run={run} />
  ) : (
    <CompletedBacktest run={run} />
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === HTTP_STATUS.NOT_FOUND;
}

export function BacktestDetailPage(): ReactElement {
  const { runId = '' } = useParams();
  const run = useRunDetailQuery(runId);
  if (run.isError) {
    return (
      <div className={runStyles.page}>
        <p role="alert" className={controls.error}>
          {isNotFound(run.error)
            ? 'Execução não encontrada.'
            : 'Não foi possível carregar a execução.'}
        </p>
        <Link to={ROUTE_PATH.BACKTESTS} className={controls.textLink}>
          Voltar aos backtests
        </Link>
      </div>
    );
  }
  if (run.data === undefined) return <p role="status">Carregando…</p>;
  return (
    <div className={runStyles.page}>
      <RunHeader run={run.data} />
      <RunBody run={run.data} />
    </div>
  );
}
