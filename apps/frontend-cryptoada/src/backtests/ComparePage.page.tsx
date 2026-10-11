// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { formatSymbol } from '../format/format.js';
import { EquityChart } from '../runs/EquityChart.component.js';
import { RUN_STATUS } from '../runs/run.constant.js';
import runStyles from '../runs/Runs.module.css';
import { toRatioLine } from '../runs/curve-lines.js';
import { parseMetrics, type RunDetail, type RunMetrics } from '../runs/run.validation.js';
import { useEquityCurveQuery, useRunDetailQuery } from '../runs/runs.query.js';
import { useVersionIndexQuery } from '../strategies/strategy.query.js';
import { describeVersion } from '../strategies/strategy.validation.js';
import controls from '../styles/Controls.module.css';
import { CompareCosts } from './CompareCosts.component.js';
import { CompareTable } from './CompareTable.component.js';

type Side = { readonly run: RunDetail; readonly metrics: RunMetrics };

function isSameScope(first: RunDetail, second: RunDetail): boolean {
  return (
    first.symbol === second.symbol &&
    first.timeframe === second.timeframe &&
    first.periodStart === second.periodStart &&
    first.periodEnd === second.periodEnd
  );
}

function ComparisonCurves({
  first,
  second,
}: {
  readonly first: Side;
  readonly second: Side;
}): ReactElement | null {
  const firstCurve = useEquityCurveQuery(first.run.id, true);
  const secondCurve = useEquityCurveQuery(second.run.id, true);
  if (firstCurve.data === undefined || secondCurve.data === undefined) return null;
  const hold = {
    label: 'Comprar e segurar (de A)',
    tone: 'benchmark',
    points: firstCurve.data,
  } as const;
  return (
    <EquityChart
      lines={[
        toRatioLine({
          label: 'A',
          tone: 'strategy',
          points: firstCurve.data,
          pick: (p) => p.equity,
        }),
        toRatioLine({
          label: 'B',
          tone: 'second',
          points: secondCurve.data,
          pick: (p) => p.equity,
        }),
        toRatioLine({ ...hold, pick: (p) => p.benchmark }),
      ]}
    />
  );
}

function ComparisonBody({
  first,
  second,
}: {
  readonly first: Side;
  readonly second: Side;
}): ReactElement {
  const index = useVersionIndexQuery();
  const label = (side: Side, name: string): string =>
    `${name}: ${describeVersion(index.data?.get(side.run.strategyVersionId))}`;
  return (
    <>
      {isSameScope(first.run, second.run) ? null : (
        <p role="alert" className={controls.error}>
          As execuções são de par ou período diferentes ({formatSymbol(first.run.symbol)} contra{' '}
          {formatSymbol(second.run.symbol)}): a coluna de comprar e segurar é a da execução A.
        </p>
      )}
      <CompareTable
        firstLabel={label(first, 'A')}
        secondLabel={label(second, 'B')}
        first={first.metrics}
        second={second.metrics}
      />
      <ComparisonCurves first={first} second={second} />
      <CompareCosts first={first.metrics} second={second.metrics} />
    </>
  );
}

function ComparisonView({
  firstId,
  secondId,
}: {
  readonly firstId: string;
  readonly secondId: string;
}): ReactElement {
  const first = useRunDetailQuery(firstId);
  const second = useRunDetailQuery(secondId);
  if (first.isError || second.isError) {
    return (
      <p role="alert" className={controls.error}>
        Uma das execuções não foi encontrada.
      </p>
    );
  }
  if (first.data === undefined || second.data === undefined)
    return <p role="status">Carregando…</p>;
  const firstMetrics = parseMetrics(first.data.metrics);
  const secondMetrics = parseMetrics(second.data.metrics);
  const isReady =
    first.data.status === RUN_STATUS.COMPLETED && second.data.status === RUN_STATUS.COMPLETED;
  if (!isReady || firstMetrics === undefined || secondMetrics === undefined) {
    return <p>Compare só execuções concluídas: uma delas ainda não tem resultado.</p>;
  }
  return (
    <ComparisonBody
      first={{ run: first.data, metrics: firstMetrics }}
      second={{ run: second.data, metrics: secondMetrics }}
    />
  );
}

export function ComparePage(): ReactElement {
  const [params] = useSearchParams();
  const firstId = params.get('a');
  const secondId = params.get('b');
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Comparar execuções</h1>
      {firstId === null || secondId === null ? (
        <p>
          Escolha duas execuções concluídas na{' '}
          <Link to={ROUTE_PATH.BACKTESTS}>lista de backtests</Link>.
        </p>
      ) : (
        <ComparisonView firstId={firstId} secondId={secondId} />
      )}
    </div>
  );
}
