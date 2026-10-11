// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { EquitySparkline } from './EquitySparkline.component.js';
import styles from './Overview.module.css';
import { RUN_STATUS } from './overview.constant.js';
import type { RunDetail } from '../runs/run.validation.js';
import type { EquityPoint } from './overview.validation.js';
import {
  computeChangeRatio,
  formatChangePercent,
  formatDateTime,
  formatDecimal,
} from '../format/format.js';

export type BalanceCardProps = {
  readonly run: RunDetail;
  readonly points: readonly EquityPoint[];
};

function describeState(run: RunDetail): string {
  if (run.waitingForData !== null) return 'Aguardando dados do mercado';
  return run.status === RUN_STATUS.RUNNING ? 'Rodando' : 'Na fila';
}

function Change({ ratio }: { readonly ratio: number | undefined }): ReactElement {
  if (ratio === undefined) return <span>—</span>;
  return (
    <span className={ratio >= 0 ? styles.positive : styles.negative}>
      {formatChangePercent(ratio)}
    </span>
  );
}

function BalanceFacts({
  run,
  latest,
}: {
  readonly run: RunDetail;
  readonly latest: EquityPoint;
}): ReactElement {
  const initial = run.survival?.initialBalance;
  const ratioOf = (value: string): number | undefined =>
    initial === undefined ? undefined : computeChangeRatio(value, initial);
  return (
    <dl className={styles.facts}>
      <div>
        <dt>Inicial</dt>
        <dd>{initial === undefined ? '—' : formatDecimal(initial)}</dd>
      </div>
      <div>
        <dt>Resultado</dt>
        <dd>
          <Change ratio={ratioOf(latest.equity)} />
        </dd>
      </div>
      <div>
        <dt>Comprar e segurar</dt>
        <dd>
          <Change ratio={ratioOf(latest.benchmark)} />
        </dd>
      </div>
    </dl>
  );
}

export function BalanceCard({ run, points }: BalanceCardProps): ReactElement {
  const latest = points.at(-1);
  return (
    <Card title="Saldo da simulação">
      <p className={styles.state}>
        {describeState(run)}
        {run.waitingForData === null ? null : (
          <span className={controls.muted}> desde {formatDateTime(run.waitingForData.since)}</span>
        )}
      </p>
      {latest === undefined ? (
        <p className={controls.muted}>
          Aguardando o primeiro candle fechado para calcular o saldo.
        </p>
      ) : (
        <>
          <p className={styles.bigNumber}>
            {formatDecimal(latest.equity)} <span className={styles.unit}>USDT</span>
          </p>
          <BalanceFacts run={run} latest={latest} />
          <EquitySparkline points={points} />
        </>
      )}
    </Card>
  );
}
