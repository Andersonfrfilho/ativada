// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { UNAVAILABLE_REASON_TEXT } from './goal.constant.js';
import type { Combination, GoalEvaluation } from './goal.validation.js';
import styles from './Goals.module.css';
import { RankingExplainer } from './RankingExplainer.component.js';
import { RankingItem } from './RankingItem.component.js';
import { SimulationTimeframePicker } from './SimulationTimeframePicker.component.js';
import {
  DEFAULT_SIMULATION_TIMEFRAME,
  type SimulationTimeframe,
} from './simulation-timeframe.constant.js';
import { useGoalSimulation, type GoalSimulation } from './useGoalSimulation.hook.js';
import { useLiveRunSlots, type LiveRunSlots } from './useLiveRunSlots.hook.js';

const PODIUM_SIZE = 3;
const COLLAPSED_COUNT = 10;

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

type RankingListProps = {
  readonly goalId: string;
  readonly combinations: readonly Combination[];
  readonly simulation: GoalSimulation;
  readonly slots: LiveRunSlots;
  readonly timeframe: SimulationTimeframe;
};

function RankingList({
  goalId,
  combinations,
  simulation,
  slots,
  timeframe,
}: RankingListProps): ReactElement {
  return (
    <ol className={styles.ranking} aria-label="Ranking de estratégias por moeda">
      {combinations.map((combination, index) => (
        <RankingItem
          variant={index < PODIUM_SIZE ? 'podium' : 'row'}
          goalId={goalId}
          key={`${combination.strategy.id}:${combination.symbol}`}
          combination={combination}
          availability={{
            isPending: simulation.isPending,
            isAtLimit: slots.isAtLimit,
            limit: slots.limit,
            duplicateRunId: slots.findDuplicateRunId(combination, timeframe),
          }}
          onSimulate={simulation.simulate}
        />
      ))}
    </ol>
  );
}

function GoalOnlyToggle({
  isChecked,
  onChange,
}: {
  readonly isChecked: boolean;
  readonly onChange: (isChecked: boolean) => void;
}): ReactElement {
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Só o par da meta
    </label>
  );
}

type ExpandFooterProps = {
  readonly total: number;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
};

function ExpandFooter({ total, isExpanded, onToggle }: ExpandFooterProps): ReactElement | null {
  if (total <= COLLAPSED_COUNT) return null;
  return (
    <div className={styles.rankingFoot}>
      <span className={controls.muted}>
        {isExpanded ? total : COLLAPSED_COUNT} de {total} combinações de estratégia e moeda.
      </span>
      <button type="button" className={controls.button} onClick={onToggle}>
        {isExpanded ? `Mostrar só as ${COLLAPSED_COUNT}` : `Mostrar as ${total}`}
      </button>
    </div>
  );
}

function orderByRank(combinations: readonly Combination[], isGoalOnly: boolean): Combination[] {
  return combinations
    .filter((item) => !isGoalOnly || item.isGoalSymbol)
    .sort((first, second) => first.rank - second.rank);
}

export function RankingCard({ goalId, evaluation }: RankingCardProps): ReactElement {
  const [timeframe, setTimeframe] = useState<SimulationTimeframe>(DEFAULT_SIMULATION_TIMEFRAME);
  const simulation = useGoalSimulation(goalId, timeframe);
  const slots = useLiveRunSlots();
  const [isGoalOnly, setIsGoalOnly] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const ordered = orderByRank(evaluation.combinations, isGoalOnly);
  const shown = isExpanded ? ordered : ordered.slice(0, COLLAPSED_COUNT);
  return (
    <Card title="Estratégia × moeda">
      <RankingExplainer />
      <SimulationTimeframePicker
        value={timeframe}
        onChange={setTimeframe}
        activeCount={slots.count}
        limit={slots.limit}
      />
      <GoalOnlyToggle isChecked={isGoalOnly} onChange={setIsGoalOnly} />
      <RankingList
        goalId={goalId}
        combinations={shown}
        simulation={simulation}
        slots={slots}
        timeframe={timeframe}
      />
      <ExpandFooter
        total={ordered.length}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
      />
      <UnavailableList evaluation={evaluation} />
      {simulation.message === undefined ? null : (
        <p role="alert" className={controls.error}>
          {simulation.message}
        </p>
      )}
    </Card>
  );
}
