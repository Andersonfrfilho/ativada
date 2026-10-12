// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { formatChangePercent, formatPercent, formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { useEquitySeriesQuery } from '../overview/overview.query.js';
import type { Run } from '../overview/overview.validation.js';
import { useRunDetailQuery } from '../runs/runs.query.js';
import controls from '../styles/Controls.module.css';
import { FULL_PERCENT, GOAL_OUTCOME_TEXT } from './goal.constant.js';
import { computeGoalProgress, type GoalProgress } from './goal-progress.js';
import { useGoalQuery } from './goal.query.js';
import type { Goal } from './goal.validation.js';
import { useGoalRunQuery } from './goal-run.query.js';
import styles from './Goals.module.css';

function PaceBars({
  progress,
  isFinished,
}: {
  readonly progress: GoalProgress;
  readonly isFinished: boolean;
}): ReactElement {
  const paceText = progress.isOnPace ? 'No ritmo' : 'Abaixo do ritmo';
  return (
    <>
      <p>
        Retorno até agora: <strong>{formatChangePercent(progress.returnRatio)}</strong>
        {isFinished ? '' : ` · restam ${progress.remainingDays} dias · ${paceText}`}
      </p>
      <progress
        className={styles.progress}
        aria-label="Progresso até o alvo"
        value={progress.targetPercent}
        max={FULL_PERCENT}
        aria-valuenow={progress.targetPercent}
      />
      <progress
        className={styles.progress}
        aria-label="Aproximação da perda máxima"
        value={progress.lossPercent}
        max={FULL_PERCENT}
        aria-valuenow={progress.lossPercent}
      />
    </>
  );
}

type ProgressViewProps = {
  readonly goal: Goal;
  readonly outcome: string | undefined;
  readonly progress: GoalProgress | undefined;
};

function GoalProgressView({ goal, outcome, progress }: ProgressViewProps): ReactElement {
  return (
    <>
      <p>
        <strong>{formatSymbol(goal.symbol)}</strong> · alvo{' '}
        {formatChangePercent(Number(goal.targetRate))} · perda máxima{' '}
        {formatPercent(Number(goal.maxLossRate))} · prazo {goal.horizonDays} dias
      </p>
      {outcome === undefined ? null : (
        <p role="status">
          <strong>{outcome}</strong>
        </p>
      )}
      {progress === undefined ? (
        <p className={controls.muted}>Aguardando o primeiro candle.</p>
      ) : (
        <PaceBars progress={progress} isFinished={outcome !== undefined} />
      )}
    </>
  );
}

function readOutcomeText(run: Run): string | undefined {
  return run.goalOutcome === null || run.goalOutcome === undefined
    ? undefined
    : GOAL_OUTCOME_TEXT[run.goalOutcome];
}

function GoalRunBody({
  run,
  goalId,
}: {
  readonly run: Run;
  readonly goalId: string;
}): ReactElement {
  const goal = useGoalQuery(goalId);
  const detail = useRunDetailQuery(run.id);
  const equity = useEquitySeriesQuery(run.id);
  const initialBalance =
    detail.data?.runParameters.initialBalance ?? detail.data?.survival?.initialBalance;
  if (goal.isError || detail.isError || equity.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar a meta. Tente novamente em instantes.
      </p>
    );
  }
  if (goal.data === undefined || initialBalance === undefined || equity.data === undefined) {
    return <p role="status">Carregando a meta…</p>;
  }
  const latest = equity.data.at(-1);
  const progress =
    latest === undefined
      ? undefined
      : computeGoalProgress({
          ...goal.data,
          initialBalance,
          equity: latest.equity,
          startTime: run.periodStart ?? Date.now(),
          now: Date.now(),
        });
  return (
    <>
      <GoalProgressView goal={goal.data} outcome={readOutcomeText(run)} progress={progress} />
      <Link to={`/metas/${goalId}`} className={controls.textLink}>
        Ver a meta
      </Link>
    </>
  );
}

export function ActiveGoalCard(): ReactElement | null {
  const run = useGoalRunQuery().data;
  if (run === null || run === undefined) return null;
  if (run.goalId === null || run.goalId === undefined) return null;
  return (
    <Card title="Meta ativa">
      <GoalRunBody run={run} goalId={run.goalId} />
    </Card>
  );
}
