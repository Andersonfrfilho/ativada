// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { formatChangePercent, formatPercent, formatSymbol } from '../format/format.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { CoinsSituationCard } from './CoinsSituationCard.component.js';
import { useGoalEvaluationQuery, useGoalQuery } from './goal.query.js';
import styles from './Goals.module.css';
import { RankingCard } from './RankingCard.component.js';

function HistoryNote(): ReactElement {
  return (
    <div role="note" aria-label="Leia com cuidado" className={styles.notice}>
      Isto é o histórico: o que cada estratégia teria feito, em janelas de candles diários que já
      aconteceram. O passado não promete o futuro, e COMPRAR, SEGURAR e EVITAR descrevem o que o
      histórico mostrou, não uma recomendação de investimento.
    </div>
  );
}

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
      <HistoryNote />
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
