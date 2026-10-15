// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { formatSymbol } from '../format/format.js';
import controls from '../styles/Controls.module.css';
import { Icon } from '../layout/Icon.component.js';
import { VERDICT_HINT, VERDICT_ICON, VERDICT_LABEL, VERDICT_PLAIN } from './goal.constant.js';
import type { Combination } from './goal.validation.js';
import styles from './Goals.module.css';
import { computeOutcomeSegments } from './outcome-bar.js';
import { OutcomeBar } from './OutcomeBar.component.js';
import { describeBenchmark, describeOutcomes } from './ranking-text.js';
import { buildLiveRunLimitText, DUPLICATE_RUN_TEXT } from './simulation-timeframe.constant.js';

export type SimulationAvailability = {
  readonly isPending: boolean;
  readonly isAtLimit: boolean;
  readonly limit: number;
  // Já existe uma simulação ativa com a mesma estratégia, par e vela: avisa e leva até ela.
  readonly duplicateRunId: string | undefined;
};

export type RankingItemProps = {
  readonly goalId: string;
  readonly combination: Combination;
  readonly availability: SimulationAvailability;
  readonly onSimulate: (combination: Combination) => void;
};

function verdictClass(verdict: string): string {
  if (verdict === 'COMPRAR') return styles.verdictBuy ?? '';
  if (verdict === 'EVITAR') return styles.verdictAvoid ?? '';
  return styles.verdictHold ?? '';
}

function verdictIcon(verdict: string): 'arrowUp' | 'arrowDown' | 'equal' {
  if (verdict === 'COMPRAR') return VERDICT_ICON.COMPRAR;
  return verdict === 'EVITAR' ? VERDICT_ICON.EVITAR : VERDICT_ICON.SEGURAR;
}

function DuplicateNotice({ runId }: { readonly runId: string | undefined }): ReactElement | null {
  if (runId === undefined) return null;
  return (
    <p role="status" className={styles.warning}>
      <span aria-hidden="true">⚠ </span>
      {DUPLICATE_RUN_TEXT}{' '}
      <Link className={controls.textLink} to={`${ROUTE_PATH.BACKTESTS}/${runId}`}>
        Ver a simulação que já está rodando
      </Link>
    </p>
  );
}

function RankingActions({
  goalId,
  combination,
  availability,
  onSimulate,
}: RankingItemProps): ReactElement {
  const { strategy } = combination;
  const limitId = `limit-${strategy.id}`;
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
        disabled={availability.isPending || availability.isAtLimit}
        aria-describedby={availability.isAtLimit ? limitId : undefined}
        onClick={() => onSimulate(combination)}
      >
        Simular esta meta
      </button>
      {availability.isAtLimit ? (
        <p id={limitId} className={controls.muted}>
          {buildLiveRunLimitText(availability.limit)}
        </p>
      ) : null}
      <DuplicateNotice runId={availability.duplicateRunId} />
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
          <Icon name={verdictIcon(evaluation.verdict)} size={14} />
          {VERDICT_LABEL[evaluation.verdict] ?? evaluation.verdict}
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
