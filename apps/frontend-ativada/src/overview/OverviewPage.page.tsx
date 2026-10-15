// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ActiveGoalCard } from '../goals/ActiveGoalCard.component.js';
import { LivePulseLine } from '../runs/live-tracking/LivePulseLine.component.js';
import { useRunDetailQuery } from '../runs/runs.query.js';
import { useAppConfig } from '../app/useAppContext.hook.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { BalanceCard } from './BalanceCard.component.js';
import { CoinCard } from './CoinCard.component.js';
import { MarketStatusBadge } from '../live/MarketStatusBadge.component.js';
import { SentimentCard } from './SentimentCard.component.js';
import { DataSourcesNote } from './DataSourcesNote.component.js';
import styles from './Overview.module.css';
import { SignalsCard } from './SignalsCard.component.js';
import {
  useActiveRunQuery,
  useEquitySeriesQuery,
  useLatestSignalsQuery,
} from './overview.query.js';
import type { Run } from './overview.validation.js';

function ActiveSimulation({ run }: { readonly run: Run }): ReactElement {
  const detail = useRunDetailQuery(run.id);
  const equity = useEquitySeriesQuery(run.id);
  const signals = useLatestSignalsQuery(run.id);
  if (detail.isError || equity.isError || signals.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar a simulação. Tente novamente em instantes.
      </p>
    );
  }
  if (detail.data === undefined || equity.data === undefined || signals.data === undefined) {
    return <p role="status">Carregando a simulação…</p>;
  }
  return (
    <>
      <BalanceCard run={detail.data} points={equity.data} signals={signals.data} />
      <SignalsCard signals={signals.data} />
    </>
  );
}

export function OverviewPage(): ReactElement {
  const { marketSymbols } = useAppConfig();
  const activeRun = useActiveRunQuery();
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Visão geral</h1>
      {activeRun.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar suas simulações. Tente novamente em instantes.
        </p>
      ) : null}
      {activeRun.isSuccess && activeRun.data === null ? (
        <Card title="Simulação">
          <p>Nenhuma simulação ativa</p>
          <p className={controls.muted}>
            Quando você iniciar uma simulação ao vivo, o saldo e os sinais aparecem aqui.
          </p>
        </Card>
      ) : null}
      {activeRun.data === undefined || activeRun.data === null ? null : (
        <>
          <LivePulseLine runId={activeRun.data.id} symbol={activeRun.data.symbol} />
          <ActiveSimulation run={activeRun.data} />
        </>
      )}
      <ActiveGoalCard />
      <div className={styles.marketBar}>
        <MarketStatusBadge />
      </div>
      <div className={styles.coins}>
        {marketSymbols.map((symbol) => (
          <CoinCard key={symbol} symbol={symbol} />
        ))}
      </div>
      <SentimentCard />
      <DataSourcesNote />
    </div>
  );
}
