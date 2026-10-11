// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDateTime, formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import { SIGNAL_ACTION, SIGNAL_LABEL } from '../overview/overview.constant.js';
import type { Signal } from '../overview/overview.validation.js';
import { useActiveRunQuery } from '../overview/overview.query.js';
import controls from '../styles/Controls.module.css';
import styles from './Alerts.module.css';
import { useSignalHistoryQuery } from './alerts.query.js';

function SignalRow({
  signal,
  symbol,
}: {
  readonly signal: Signal;
  readonly symbol: string;
}): ReactElement {
  const tone = signal.action === SIGNAL_ACTION.BUY ? styles.buy : styles.sell;
  return (
    <li className={styles.item}>
      <span className={`${styles.badge} ${tone}`}>{SIGNAL_LABEL[signal.action]}</span>
      <span>
        {formatSymbol(symbol)}: {signal.reason}
      </span>
      <time
        className={`${controls.muted} ${styles.when}`}
        dateTime={new Date(signal.candleTime).toISOString()}
      >
        {formatDateTime(signal.candleTime)}
      </time>
    </li>
  );
}

function History({
  runId,
  symbol,
}: {
  readonly runId: string;
  readonly symbol: string;
}): ReactElement {
  const history = useSignalHistoryQuery(runId);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {items.length === 0 ? (
        <ListStatus
          isPending={history.isPending}
          isError={history.isError}
          emptyText="Ainda não houve compra nem venda."
        />
      ) : (
        <ul className={styles.list} aria-label="Histórico de sinais">
          {items.map((signal) => (
            <SignalRow key={signal.candleTime} signal={signal} symbol={symbol} />
          ))}
        </ul>
      )}
      {history.hasNextPage ? (
        <button
          type="button"
          className={controls.button}
          onClick={() => void history.fetchNextPage()}
        >
          Carregar sinais mais antigos
        </button>
      ) : null}
    </>
  );
}

export function SignalHistoryCard(): ReactElement {
  const activeRun = useActiveRunQuery();
  const run = activeRun.data;
  return (
    <Card title="Sinais da simulação ao vivo">
      {run === undefined || run === null ? (
        activeRun.isSuccess ? (
          <p className={controls.muted}>Nenhuma simulação ao vivo ativa</p>
        ) : (
          <ListStatus isPending={activeRun.isPending} isError={activeRun.isError} emptyText="" />
        )
      ) : (
        <History runId={run.id} symbol={run.symbol} />
      )}
    </Card>
  );
}
