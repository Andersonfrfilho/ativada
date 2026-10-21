// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { formatSignedPercentDown } from '../format/decimal.js';
import { formatDate, formatSymbol } from '../format/format.js';
import { Icon } from '../layout/Icon.component.js';
import {
  CHIP_TONE,
  StatusChip,
  type ChipTone,
} from '../runs/live-tracking/StatusChip.component.js';
import { RUN_STATUS, statusLabel } from '../runs/run.constant.js';
import type { Run } from '../runs/run.validation.js';
import { useVersionIndexQuery } from '../strategies/strategy.query.js';
import { describeLookup, lookupVersion } from '../strategies/version-index.js';
import styles from './BacktestGroups.module.css';
import {
  groupRuns,
  summarizeGroup,
  type GroupedRun,
  type ResultOrder,
  type RunGroup,
} from './run-groups.js';
import type { RunSelection } from './RunListCard.component.js';
import { ResultSortHeader } from './ResultSortHeader.component.js';
import { RunListToolbar } from './RunListToolbar.component.js';
import { RunResultBar } from './RunResultBar.component.js';
import { useRunListView } from './useRunListView.hook.js';

const MAX_PICKED = 2;
const MINUS = '−';

type RunRowProps = { readonly item: GroupedRun; readonly selection: RunSelection };

function RunRow({ item, selection }: RunRowProps): ReactElement {
  const { run, result } = item;
  const isPicked = selection.selected.includes(run.id);
  const isBlocked = !isPicked && selection.selected.length >= MAX_PICKED;
  return (
    <tr>
      <td className={styles.pickCell}>
        {run.status === RUN_STATUS.COMPLETED ? (
          <label className={styles.pick}>
            <input
              type="checkbox"
              aria-label={`Comparar ${formatSymbol(run.symbol)} de ${formatDate(run.periodStart)}`}
              checked={isPicked}
              disabled={isBlocked}
              onChange={() => selection.onToggle(run.id)}
            />
          </label>
        ) : null}
      </td>
      <td>
        <Link to={`/backtests/${run.id}`} className={styles.pairLink}>
          {formatSymbol(run.symbol)}
        </Link>
      </td>
      <td className={styles.period}>
        {formatDate(run.periodStart)}
        {run.periodEnd === null ? '' : ` a ${formatDate(run.periodEnd)}`}{' '}
        <span className={styles.muted}>· vela {run.timeframe}</span>
      </td>
      <td className={styles.resultCell}>
        {result === undefined || run.status !== RUN_STATUS.COMPLETED ? (
          <span className={styles.muted}>{statusLabel(run.status)}</span>
        ) : (
          <RunResultBar result={result} />
        )}
      </td>
    </tr>
  );
}

type SummaryTone = { readonly tone: ChipTone; readonly icon: 'arrowUp' | 'arrowDown' | 'equal' };

function summaryTone(positive: number, measured: number): SummaryTone {
  if (positive === 0) return { tone: CHIP_TONE.SELL, icon: 'arrowDown' };
  return positive * 2 > measured
    ? { tone: CHIP_TONE.BUY, icon: 'arrowUp' }
    : { tone: CHIP_TONE.NEUTRAL, icon: 'equal' };
}

function formatPercent(value: bigint): string {
  return formatSignedPercentDown(value).replace('-', MINUS);
}

function GroupSummaryLine({ group }: { readonly group: RunGroup }): ReactElement | null {
  const summary = summarizeGroup(group);
  if (summary.measuredCount === 0) return null;
  const { tone, icon } = summaryTone(summary.positiveCount, summary.measuredCount);
  const { best, worst } = summary;
  return (
    <span className={styles.groupStats}>
      <StatusChip tone={tone} icon={icon}>
        {summary.positiveCount} de {summary.measuredCount} positivos
      </StatusChip>
      {summary.median === undefined ? null : <span>mediana {formatPercent(summary.median)}</span>}
      {best?.result === undefined || worst?.result === undefined ? null : (
        <span className={styles.hideSmall}>
          melhor {formatSymbol(best.run.symbol)} {formatPercent(best.result)} · pior{' '}
          {formatSymbol(worst.run.symbol)} {formatPercent(worst.result)}
        </span>
      )}
    </span>
  );
}

type GroupBlockProps = {
  readonly group: RunGroup;
  readonly selection: RunSelection;
  readonly order: ResultOrder;
  readonly onCycleOrder: () => void;
};

function GroupBlock({ group, selection, order, onCycleOrder }: GroupBlockProps): ReactElement {
  const index = useVersionIndexQuery();
  const first = group.runs[0]?.run;
  const label =
    first === undefined ? '' : describeLookup(lookupVersion(index, first.strategyVersionId));
  return (
    <details className={styles.group} open>
      <summary className={styles.groupSummary}>
        <span className={styles.groupTitle}>
          <Icon name="chevronRight" size={14} />
          <strong>{label}</strong>
          <span className={styles.muted}>{group.runs.length} backtests</span>
        </span>
        <GroupSummaryLine group={group} />
      </summary>
      <table className={styles.groupTable}>
        <thead>
          <tr>
            <th scope="col" className={styles.pickCell}>
              <span className={styles.visuallyHidden}>Selecionar</span>
            </th>
            <th scope="col">Par</th>
            <th scope="col">Período</th>
            <ResultSortHeader order={order} onCycle={onCycleOrder} />
          </tr>
        </thead>
        <tbody>
          {group.runs.map((item) => (
            <RunRow key={item.run.id} item={item} selection={selection} />
          ))}
        </tbody>
      </table>
    </details>
  );
}

export type GroupedRunListProps = {
  readonly runs: readonly Run[];
  readonly selection: RunSelection;
};

// A lista de backtests agrupada por estratégia (só o que já está carregado: "Carregar mais" traz outras páginas).
export function GroupedRunList({ runs, selection }: GroupedRunListProps): ReactElement {
  const view = useRunListView();
  const groups = groupRuns(runs, view.order);
  const allKeys = groups.map((group) => group.key);
  const known = view.strategies.filter((key) => allKeys.includes(key));
  const selected = new Set(known.length === 0 ? allKeys : known);
  return (
    <>
      <RunListToolbar
        groups={groups}
        selected={selected}
        order={view.order}
        onToggle={(key) => view.toggleStrategy(key, allKeys)}
      />
      <div className={styles.groups}>
        {groups
          .filter((group) => selected.has(group.key))
          .map((group) => (
            <GroupBlock
              key={group.key}
              group={group}
              selection={selection}
              order={view.order}
              onCycleOrder={view.cycleOrder}
            />
          ))}
      </div>
    </>
  );
}
