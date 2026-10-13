// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { UNAVAILABLE_REASON_TEXT } from './goal.constant.js';
import type { GoalEvaluation } from './goal.validation.js';
import styles from './Goals.module.css';
import { RankingExplainer } from './RankingExplainer.component.js';
import { RankingItem } from './RankingItem.component.js';
import { DEFAULT_SIMULATION_TIMEFRAME } from './simulation-timeframe.constant.js';
import { useGoalSimulation } from './useGoalSimulation.hook.js';

export type RankingCardProps = { readonly goalId: string; readonly evaluation: GoalEvaluation };

function UnavailableList({
  evaluation,
}: {
  readonly evaluation: GoalEvaluation;
}): ReactElement | null {
  if (evaluation.unavailable.length === 0) return null;
  const names = new Map(
    evaluation.combinations.map((item) => [item.strategy.id, item.strategy.name]),
  );
  return (
    <ul aria-label="Combinações sem avaliação" className={controls.muted}>
      {evaluation.unavailable.map((item) => (
        <li key={`${item.strategyId}:${item.symbol}`}>
          {names.get(item.strategyId) ?? 'Estratégia'} em {formatSymbol(item.symbol)}:{' '}
          {UNAVAILABLE_REASON_TEXT[item.reason] ?? 'indisponível'}
        </li>
      ))}
    </ul>
  );
}

export function RankingCard({ goalId, evaluation }: RankingCardProps): ReactElement {
  const simulation = useGoalSimulation(goalId, DEFAULT_SIMULATION_TIMEFRAME);
  const [isGoalOnly, setIsGoalOnly] = useState(false);
  const shown = [...evaluation.combinations]
    .filter((item) => !isGoalOnly || item.isGoalSymbol)
    .sort((first, second) => first.rank - second.rank);
  return (
    <Card title="Estratégia × moeda">
      <RankingExplainer />
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={isGoalOnly}
          onChange={(event) => setIsGoalOnly(event.target.checked)}
        />
        Só o par da meta
      </label>
      <ol className={styles.ranking} aria-label="Ranking de estratégias por moeda">
        {shown.map((combination) => (
          <RankingItem
            goalId={goalId}
            key={`${combination.strategy.id}:${combination.symbol}`}
            combination={combination}
            isSimulating={simulation.isPending}
            onSimulate={simulation.simulate}
          />
        ))}
      </ol>
      <UnavailableList evaluation={evaluation} />
      {simulation.message === undefined ? null : (
        <p role="alert" className={controls.error}>
          {simulation.message}
        </p>
      )}
    </Card>
  );
}
