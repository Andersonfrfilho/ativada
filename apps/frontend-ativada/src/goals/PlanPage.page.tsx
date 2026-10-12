// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { ApiError } from '../http/api.error.js';
import { HistoryNote } from '../layout/HistoryNote.component.js';
import { Card } from '../layout/Card.component.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { GOAL_ERROR_TEXT } from './goal.constant.js';
import { PlanCard } from './PlanCard.component.js';
import { PlanChartCard } from './PlanChartCard.component.js';
import { useGoalPlanQuery } from './plan.query.js';

function planErrorText(error: Error | null): string {
  if (error instanceof ApiError) return GOAL_ERROR_TEXT[error.code] ?? error.message;
  return 'Não foi possível carregar o plano. Tente novamente em instantes.';
}

export function PlanPage(): ReactElement {
  const { goalId = '' } = useParams();
  const strategyId = useSearchParams()[0].get('strategyId') ?? '';
  const plan = useGoalPlanQuery(goalId, strategyId);
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Plano de operação</h1>
      <Link to={`/metas/${goalId}`} className={controls.textLink}>
        Voltar à meta
      </Link>
      <HistoryNote />
      {strategyId === '' ? (
        <Card title="Sem estratégia">
          <p>Escolha uma estratégia no ranking da meta para ver o plano dela.</p>
        </Card>
      ) : null}
      {plan.isError ? (
        <p role="alert" className={controls.error}>
          {planErrorText(plan.error)}
        </p>
      ) : null}
      {plan.data === undefined ? null : (
        <>
          <PlanCard view={plan.data} />
          <PlanChartCard view={plan.data} />
        </>
      )}
    </div>
  );
}
