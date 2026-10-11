// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { RUN_KIND } from '../runs/run.constant.js';
import { useCreateRunMutation } from '../runs/runs.query.js';
import controls from '../styles/Controls.module.css';
import { messageFromGoalError } from './goal-form.validation.js';
import { GOAL_TIMEFRAME, UNAVAILABLE_REASON_TEXT } from './goal.constant.js';
import type { Combination, GoalEvaluation } from './goal.validation.js';
import styles from './Goals.module.css';
import { RankingItem } from './RankingItem.component.js';

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

type Simulation = {
  readonly isPending: boolean;
  readonly message: string | undefined;
  readonly simulate: (combination: Combination) => void;
};

function useGoalSimulation(goalId: string): Simulation {
  const navigate = useNavigate();
  const create = useCreateRunMutation();
  return {
    isPending: create.isPending,
    message: messageFromGoalError(create.error),
    simulate: (combination) =>
      create.mutate(
        {
          strategyVersionId: combination.strategy.versionId,
          kind: RUN_KIND.LIVE_PAPER,
          symbol: combination.symbol,
          timeframe: GOAL_TIMEFRAME,
          goalId,
        },
        { onSuccess: () => void navigate(ROUTE_PATH.OVERVIEW) },
      ),
  };
}

export function RankingCard({ goalId, evaluation }: RankingCardProps): ReactElement {
  const simulation = useGoalSimulation(goalId);
  const [isGoalOnly, setIsGoalOnly] = useState(false);
  const shown = [...evaluation.combinations]
    .filter((item) => !isGoalOnly || item.isGoalSymbol)
    .sort((first, second) => first.rank - second.rank);
  return (
    <Card title="Estratégia × moeda">
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
