// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { ApiError } from '../http/api.error.js';
import { HTTP_STATUS } from '@ativada/environment';
import controls from '../styles/Controls.module.css';
import { RunHeader } from '../runs/RunHeader.component.js';
import { CarriedTimeframeProvider } from '../runs/candle-chart/CarriedTimeframe.context.js';
import { RunProgressCard } from '../runs/RunProgressCard.component.js';
import { LivePaperBody } from '../runs/live-page/LivePaperBody.component.js';
import { FAILURE_TEXT, RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import runStyles from '../runs/Runs.module.css';
import { isActiveRun, type RunDetail } from '../runs/run.validation.js';
import { useRunDetailQuery } from '../runs/runs.query.js';
import { CompletedBacktest } from './CompletedBacktest.component.js';
import { CompletedWalkForward } from './CompletedWalkForward.component.js';
import { HistoricRunBanner } from '../wayfinding/HistoricRunBanner.component.js';
import { RunSwitcher } from './run-switch/RunSwitcher.component.js';

function failureMessage(run: RunDetail): string {
  if (run.status === RUN_STATUS.CANCELLED) return 'Execução cancelada.';
  const code = run.errorCode ?? '';
  return FAILURE_TEXT[code] ?? `A execução falhou (${code || 'sem código'}).`;
}

function LiveRunBody({ run }: { readonly run: RunDetail }): ReactElement {
  const cancelled =
    run.status === RUN_STATUS.CANCELLED ? (
      <p role="status" className={controls.muted}>
        {failureMessage(run)}
      </p>
    ) : null;
  const completed = run.status === RUN_STATUS.COMPLETED ? <CompletedBacktest run={run} /> : null;
  return <LivePaperBody run={run} completed={completed} cancelled={cancelled} />;
}

function isLivePaperRun(run: RunDetail): boolean {
  return run.kind === RUN_KIND.LIVE_PAPER && run.status !== RUN_STATUS.FAILED;
}

function RunBody({ run }: { readonly run: RunDetail }): ReactElement {
  if (isLivePaperRun(run)) {
    return <LiveRunBody run={run} />;
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

function RunDetailView({ runId }: { readonly runId: string }): ReactElement {
  const run = useRunDetailQuery(runId);
  if (run.isError) {
    return (
      <>
        <RunSwitcher runId={runId} run={undefined} isFailed />
        <p role="alert" className={controls.error}>
          {isNotFound(run.error)
            ? 'Execução não encontrada.'
            : 'Não foi possível carregar a execução.'}
        </p>
        <Link to={ROUTE_PATH.BACKTESTS} className={controls.textLink}>
          Voltar aos backtests
        </Link>
      </>
    );
  }
  if (run.data === undefined) {
    return (
      <>
        <RunSwitcher runId={runId} run={undefined} isFailed={false} />
        <p role="status">Carregando…</p>
      </>
    );
  }
  return (
    <>
      <RunSwitcher runId={runId} run={run.data} isFailed={false} />
      {run.data.kind === RUN_KIND.LIVE_PAPER ? null : <HistoricRunBanner kind={run.data.kind} />}
      {isLivePaperRun(run.data) ? null : <RunHeader run={run.data} />}
      <RunBody run={run.data} />
    </>
  );
}

// A barra de troca rápida fica no topo em todo estado (carregando, erro, pronto): trocar de execução nunca exige voltar à lista.
export function BacktestDetailPage(): ReactElement {
  const { runId = '' } = useParams();
  return (
    <CarriedTimeframeProvider>
      <div className={runStyles.page}>
        <RunDetailView runId={runId} />
      </div>
    </CarriedTimeframeProvider>
  );
}
