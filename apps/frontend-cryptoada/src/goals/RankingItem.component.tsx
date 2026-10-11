// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatSymbol } from '../format/format.js';
import controls from '../styles/Controls.module.css';
import { VERDICT_HINT } from './goal.constant.js';
import type { Combination } from './goal.validation.js';
import styles from './Goals.module.css';
import { describeBenchmark, describeOutcomes } from './ranking-text.js';

export type RankingItemProps = {
  readonly combination: Combination;
  readonly isSimulating: boolean;
  readonly onSimulate: (combination: Combination) => void;
};

function verdictClass(verdict: string): string {
  if (verdict === 'COMPRAR') return styles.verdictBuy ?? '';
  if (verdict === 'EVITAR') return styles.verdictAvoid ?? '';
  return styles.verdictHold ?? '';
}

export function RankingItem({
  combination,
  isSimulating,
  onSimulate,
}: RankingItemProps): ReactElement {
  const { strategy, evaluation } = combination;
  return (
    <li className={styles.combination}>
      <div className={styles.combinationHead}>
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
      <p>No histórico: {describeOutcomes(combination)}</p>
      <p className={controls.muted}>{describeBenchmark(combination)}</p>
      {combination.isGoalSymbol ? (
        <div>
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
      ) : (
        <p className={controls.muted}>a simulação usa o par da meta</p>
      )}
    </li>
  );
}
