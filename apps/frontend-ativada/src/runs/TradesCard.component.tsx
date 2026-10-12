// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDateTime, formatDecimal, formatPrice } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import controls from '../styles/Controls.module.css';
import { EXIT_REASON_LABEL } from './run.constant.js';
import styles from './Runs.module.css';
import { useTradesQuery } from './runs.query.js';
import type { Trade } from './run.validation.js';

function resultClass(trade: Trade): string | undefined {
  if (trade.netProfit === undefined) return styles.num;
  return Number(trade.netProfit) >= 0
    ? `${styles.num} ${styles.positive}`
    : `${styles.num} ${styles.negative}`;
}

function TradeRow({ trade }: { readonly trade: Trade }): ReactElement {
  return (
    <tr>
      <td>{formatDateTime(trade.openedCandleTime)}</td>
      <td className={styles.num}>{formatPrice(trade.entryPrice)}</td>
      <td className={styles.num}>
        {trade.exitPrice === undefined ? 'aberta' : formatPrice(trade.exitPrice)}
      </td>
      <td className={resultClass(trade)}>
        {trade.netProfit === undefined ? '—' : formatDecimal(trade.netProfit)}
      </td>
      <td>
        {trade.exitReason === undefined
          ? '—'
          : (EXIT_REASON_LABEL[trade.exitReason] ?? trade.exitReason)}
      </td>
    </tr>
  );
}

function TradesTable({ items }: { readonly items: readonly Trade[] }): ReactElement {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Abertura</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Resultado</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((trade) => (
            <TradeRow key={trade.engineKey} trade={trade} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type TradesCardProps = { readonly runId: string };

export function TradesCard({ runId }: TradesCardProps): ReactElement {
  const trades = useTradesQuery(runId);
  const items = trades.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Card title="Operações">
      {items.length === 0 ? (
        <ListStatus
          isPending={trades.isPending}
          isError={trades.isError}
          emptyText="Nenhuma operação no período."
        />
      ) : (
        <TradesTable items={items} />
      )}
      {trades.hasNextPage ? (
        <button
          type="button"
          className={controls.button}
          onClick={() => void trades.fetchNextPage()}
        >
          Carregar mais operações
        </button>
      ) : null}
    </Card>
  );
}
