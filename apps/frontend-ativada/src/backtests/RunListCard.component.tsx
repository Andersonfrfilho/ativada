// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { formatDate, formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import { signedRatioText } from '../runs/metric-text.js';
import { RUN_STATUS, statusLabel, type RunKind } from '../runs/run.constant.js';
import runStyles from '../runs/Runs.module.css';
import { parseMetrics, type Run } from '../runs/run.validation.js';
import { useRunListQuery } from '../runs/runs.query.js';
import { describeLookup, lookupVersion } from '../strategies/version-index.js';
import { useVersionIndexQuery } from '../strategies/strategy.query.js';
import controls from '../styles/Controls.module.css';
import styles from './Backtests.module.css';
import { GroupedRunList } from './GroupedRunList.component.js';

export type RunSelection = {
  readonly selected: readonly string[];
  readonly onToggle: (runId: string) => void;
};

export type RunListCardProps = {
  readonly kind: RunKind;
  readonly title: string;
  readonly moreLabel: string;
  readonly symbol?: string | undefined;
  readonly selection?: RunSelection;
};

type RunRowProps = { readonly run: Run; readonly selection: RunSelection | undefined };

function RunRow({ run, selection }: RunRowProps): ReactElement {
  const index = useVersionIndexQuery();
  const totalReturn = parseMetrics(run.metrics)?.totalReturn;
  const isPicked = selection?.selected.includes(run.id) ?? false;
  const isCompleted = run.status === RUN_STATUS.COMPLETED;
  const isBlocked = !isPicked && (selection?.selected.length ?? 0) >= 2;
  return (
    <li className={styles.row}>
      {isCompleted && selection !== undefined ? (
        <label className={styles.pick}>
          <input
            type="checkbox"
            aria-label={`Comparar ${formatSymbol(run.symbol)} de ${formatDate(run.periodStart)}`}
            checked={isPicked}
            disabled={isBlocked}
            onChange={() => selection.onToggle(run.id)}
          />
        </label>
      ) : (
        <span aria-hidden="true" className={styles.spacer} />
      )}
      <Link to={`/backtests/${run.id}`} className={styles.link}>
        <span className={styles.symbol}>{formatSymbol(run.symbol)}</span>
        <span className={controls.muted}>
          {run.timeframe} · {formatDate(run.periodStart)}
          {run.periodEnd === null ? '' : ` a ${formatDate(run.periodEnd)}`} ·{' '}
          {describeLookup(lookupVersion(index, run.strategyVersionId))}
        </span>
      </Link>
      <span className={runStyles.sub}>{statusLabel(run.status)}</span>
      <span className={runStyles.num}>
        {isCompleted && totalReturn !== undefined ? signedRatioText(totalReturn).text : ''}
      </span>
    </li>
  );
}

type LoadedCountProps = { readonly count: number; readonly hasMore: boolean };

// A API não informa o total: com mais páginas, só se diz quantas vieram; sem mais, o total é o que veio.
function LoadedCount({ count, hasMore }: LoadedCountProps): ReactElement | null {
  if (count === 0) return null;
  return (
    <p className={controls.muted}>
      {hasMore ? `${count} carregadas · há mais` : `${count} no total`}
    </p>
  );
}

export function RunListCard({
  kind,
  title,
  moreLabel,
  symbol,
  selection,
}: RunListCardProps): ReactElement {
  const runs = useRunListQuery(kind, symbol);
  const items = runs.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <ListStatus
          isPending={runs.isPending}
          isError={runs.isError}
          emptyText={
            symbol === undefined ? 'Nada por aqui ainda.' : 'Nenhuma execução desta moeda ainda.'
          }
        />
      ) : selection !== undefined ? (
        <GroupedRunList runs={items} selection={selection} />
      ) : (
        <ul className={styles.list}>
          {items.map((run) => (
            <RunRow key={run.id} run={run} selection={selection} />
          ))}
        </ul>
      )}
      <LoadedCount count={items.length} hasMore={runs.hasNextPage} />
      {runs.hasNextPage ? (
        <button type="button" className={controls.button} onClick={() => void runs.fetchNextPage()}>
          {moreLabel}
        </button>
      ) : null}
    </Card>
  );
}
