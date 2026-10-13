// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { ApiError } from '../http/api.error.js';
import { HTTP_STATUS } from '@ativada/environment';
import controls from '../styles/Controls.module.css';
import { RunHeader } from '../runs/RunHeader.component.js';
import { RunProgressCard } from '../runs/RunProgressCard.component.js';
import { TradeChartCard } from '../runs/TradeChartCard.component.js';
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

// A simulação ao vivo rodando já tem operações para mostrar; backtest e walk-forward só depois de concluídos.
function ActiveRun({ run }: { readonly run: RunDetail }): ReactElement {
  const hasLiveTrades = run.kind === RUN_KIND.LIVE_PAPER && run.status === RUN_STATUS.RUNNING;
  return (
    <>
      <RunProgressCard run={run} />
      {hasLiveTrades ? <TradeChartCard runId={run.id} /> : null}
    </>
  );
}

function RunBody({ run }: { readonly run: RunDetail }): ReactElement {
  if (isActiveRun(run)) return <ActiveRun run={run} />;
  if (run.status !== RUN_STATUS.COMPLETED) {
    return (
      <p role="alert" className={controls.error}>
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
