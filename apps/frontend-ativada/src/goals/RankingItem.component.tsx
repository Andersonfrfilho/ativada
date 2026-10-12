// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { formatSymbol } from '../format/format.js';
import controls from '../styles/Controls.module.css';
import { VERDICT_HINT, VERDICT_PLAIN } from './goal.constant.js';
import type { Combination } from './goal.validation.js';
import styles from './Goals.module.css';
import { computeOutcomeSegments } from './outcome-bar.js';
import { OutcomeBar } from './OutcomeBar.component.js';
import { describeBenchmark, describeOutcomes } from './ranking-text.js';

export type RankingItemProps = {
  readonly goalId: string;
  readonly combination: Combination;
  readonly isSimulating: boolean;
  readonly onSimulate: (combination: Combination) => void;
};

function verdictClass(verdict: string): string {
  if (verdict === 'COMPRAR') return styles.verdictBuy ?? '';
  if (verdict === 'EVITAR') return styles.verdictAvoid ?? '';
  return styles.verdictHold ?? '';
}

function RankingActions({
  goalId,
  combination,
  isSimulating,
  onSimulate,
}: RankingItemProps): ReactElement {
  const { strategy } = combination;
  if (!combination.isGoalSymbol) {
    return <p className={controls.muted}>a simulação usa o par da meta</p>;
  }
  return (
    <div className={styles.rowActions}>
      <Link
        className={controls.textLink}
        to={`/metas/${goalId}/plano?strategyId=${strategy.id}`}
        aria-label={`Ver o plano com ${strategy.name}`}
      >
        Ver o plano
      </Link>
      <button
        type="button"
        className={`${controls.button} ${controls.primary}`}
        aria-label={`Simular esta meta com ${strategy.name}`}
        disabled={isSimulating}
        onClick={() => onSimulate(combination)}
      >
        Simular esta meta
      </button>
    </div>
  );
}

export function RankingItem(props: RankingItemProps): ReactElement {
  const { combination } = props;
  const { strategy, evaluation } = combination;
  const segments = computeOutcomeSegments(evaluation.reachRate, evaluation.stopRate);
  return (
    <li className={styles.combination}>
      <div className={styles.combinationHead}>
        <span className={styles.rank} aria-label={`Posição ${combination.rank}`}>
          {combination.rank}º
        </span>
        <strong>
          {strategy.name} · versão {strategy.version}
        </strong>
        <span className={styles.symbol}>{formatSymbol(combination.symbol)}</span>
        <span
          className={`${styles.verdict} ${verdictClass(evaluation.verdict)}`}
          title={VERDICT_HINT[evaluation.verdict]}
        >
          {evaluation.verdict}
        </span>
      </div>
      <p className={styles.plainVerdict}>{VERDICT_PLAIN[evaluation.verdict]}</p>
      {evaluation.windowCount === 0 ? null : <OutcomeBar segments={segments} />}
      <p>No histórico: {describeOutcomes(combination)}</p>
      <p className={controls.muted}>{describeBenchmark(combination)}</p>
      <RankingActions {...props} />
    </li>
  );
}
