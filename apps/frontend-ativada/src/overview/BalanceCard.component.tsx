// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { Card } from '../layout/Card.component.js';
import { LastDecisionLine } from '../runs/live-tracking/LastDecisionLine.component.js';
import { LiveRunStatus } from '../runs/LiveRunStatus.component.js';
import controls from '../styles/Controls.module.css';
import { ComparisonBars } from './ComparisonBars.component.js';
import { EquitySparkline } from './EquitySparkline.component.js';
import styles from './Overview.module.css';
import { RUN_STATUS } from './overview.constant.js';
import type { RunDetail } from '../runs/run.validation.js';
import type { EquityPoint, Signal } from './overview.validation.js';
import { formatDecimal } from '../format/format.js';

export type BalanceCardProps = {
  readonly run: RunDetail;
  readonly points: readonly EquityPoint[];
  readonly signals?: readonly Signal[];
};

// A parada vem do servidor e vale sobre o resto: o selo não diz "Rodando" logo acima da faixa "Parada.".
function describeState(run: RunDetail): string {
  if (run.stalledSince !== undefined) return 'Parada';
  return run.status === RUN_STATUS.RUNNING ? 'Rodando' : 'Na fila';
}

function BalanceFacts({
  run,
  latest,
}: {
  readonly run: RunDetail;
  readonly latest: EquityPoint;
}): ReactElement {
  const initial = run.survival?.initialBalance;
  if (initial === undefined) return <p className={controls.muted}>Saldo inicial indisponível.</p>;
  return (
    <>
      <p className={controls.muted}>Começou com {formatDecimal(initial)} USDT.</p>
      <ComparisonBars initial={initial} equity={latest.equity} benchmark={latest.benchmark} />
    </>
  );
}

export function BalanceCard({ run, points, signals }: BalanceCardProps): ReactElement {
  const latest = points.at(-1);
  return (
    <Card title="Saldo da simulação">
      <p className={styles.state}>{describeState(run)}</p>
      <LiveRunStatus run={run} />
      {latest === undefined ? (
        <p className={controls.muted}>O saldo aparece quando a primeira vela fechar.</p>
      ) : (
        <>
          <p className={styles.bigNumber}>
            {formatDecimal(latest.equity)} <span className={styles.unit}>USDT</span>
          </p>
          <BalanceFacts run={run} latest={latest} />
          <EquitySparkline points={points} {...(signals === undefined ? {} : { signals })} />
        </>
      )}
      <LastDecisionLine runId={run.id} />
      <Link to={`${ROUTE_PATH.BACKTESTS}/${run.id}`} className={controls.textLink}>
        Ver compras e vendas no gráfico
      </Link>
    </Card>
  );
}
