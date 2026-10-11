// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { formatChangePercent, formatPercent, formatSymbol } from '../format/format.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { HistoryNote } from '../layout/HistoryNote.component.js';
import { CoinsSituationCard } from './CoinsSituationCard.component.js';
import { useGoalEvaluationQuery, useGoalQuery } from './goal.query.js';
import { RankingCard } from './RankingCard.component.js';

export function GoalDetailPage(): ReactElement {
  const { goalId = '' } = useParams();
  const goal = useGoalQuery(goalId);
  const evaluation = useGoalEvaluationQuery(goalId);
  const data = goal.data;
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>
        {data === undefined
          ? 'Meta'
          : `Meta: ${formatSymbol(data.symbol)} ${formatChangePercent(Number(data.targetRate))} em ${data.horizonDays} dias`}
      </h1>
      {data === undefined ? null : (
        <p className={controls.muted}>
          Perda máxima aceita: {formatPercent(Number(data.maxLossRate))}.
        </p>
      )}
      <HistoryNote extra="COMPRAR, SEGURAR e EVITAR descrevem o que o histórico mostrou." />
      {goal.isError || evaluation.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar a meta. Tente novamente em instantes.
        </p>
      ) : null}
      {evaluation.data === undefined ? (
        <p role="status">Calculando o histórico…</p>
      ) : (
        <>
          <RankingCard goalId={goalId} evaluation={evaluation.data} />
          <CoinsSituationCard evaluation={evaluation.data} />
        </>
      )}
    </div>
  );
}
