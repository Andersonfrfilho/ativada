// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatSignedScaled, parseScaled } from '../format/decimal.js';
import { formatDecimal } from '../format/format.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import styles from './Runs.module.css';
import { useTradeSummaryQuery } from './trade-chart.query.js';
import type { TradeSummary as TradeSummaryData } from './trade-summary.validation.js';

const QUOTE_ASSET = 'USDT';

function money(text: string): string {
  return `${formatDecimal(text)} ${QUOTE_ASSET}`;
}

function netTone(net: string): string {
  const value = parseScaled(net);
  if (value === undefined || value === 0n) return styles.fact ?? '';
  return value > 0n ? `${styles.fact} ${styles.positive}` : `${styles.fact} ${styles.negative}`;
}

function signedMoney(text: string): string {
  const value = parseScaled(text);
  return value === undefined ? '—' : `${formatSignedScaled(value)} ${QUOTE_ASSET}`;
}

function Fact({ label, value, className }: FactProps): ReactElement {
  return (
    <div className={className ?? styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type FactProps = {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
};

function SummaryNumbers({ summary }: { readonly summary: TradeSummaryData }): ReactElement {
  return (
    <dl className={styles.facts}>
      <Fact label="Total pago" value={money(summary.totalPaid)} />
      <Fact label="Total recebido" value={money(summary.totalReceived)} />
      <Fact label="Taxas" value={money(summary.totalFees)} />
      <Fact
        label="Saldo líquido"
        value={signedMoney(summary.net)}
        className={netTone(summary.net)}
      />
      <Fact label="Compras" value={String(summary.closedTrades + summary.openTrades)} />
      <Fact label="Vendas" value={String(summary.closedTrades)} />
    </dl>
  );
}

// O resumo da execução INTEIRA (não muda com o zoom): a frase pronta do servidor e os números por trás dela.
export function TradeSummary({ runId }: { readonly runId: string }): ReactElement {
  const query = useTradeSummaryQuery(runId);
  if (query.data === undefined) {
    return <ListStatus isPending={query.isPending} isError={query.isError} emptyText="" />;
  }
  const summary = query.data;
  return (
    <section aria-label="Resumo das operações" className={styles.summary}>
      <p>{summary.message}</p>
      <SummaryNumbers summary={summary} />
      {summary.openPaid === null ? null : (
        <p className={styles.hint}>ainda aberta: {money(summary.openPaid)} pagos</p>
      )}
    </section>
  );
}
