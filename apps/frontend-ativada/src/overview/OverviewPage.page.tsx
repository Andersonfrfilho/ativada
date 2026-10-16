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
import { LatestDecisionsCard } from './LatestDecisionsCard.component.js';
import { DataSourcesNote } from './DataSourcesNote.component.js';
import { formatSymbol } from '../format/format.js';
import { LiveSimulationsPanel } from './LiveSimulationsPanel.component.js';
import { PastBacktestsCard } from './PastBacktestsCard.component.js';
import { useFeaturedRun } from './useFeaturedRun.hook.js';
import { useLiveSimulations } from './useLiveSimulations.hook.js';
import simulationStyles from './LiveSimulations.module.css';
import styles from './Overview.module.css';
import { useEquitySeriesQuery, useLatestSignalsQuery } from './overview.query.js';
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
      <LatestDecisionsCard runId={run.id} />
    </>
  );
}

function OverviewColumns({ run }: { readonly run: Run | null }): ReactElement {
  return (
    <div className={styles.columns}>
      <div className={styles.column}>{run === null ? null : <ActiveSimulation run={run} />}</div>
      <div className={styles.column}>
        <ActiveGoalCard />
        <SentimentCard />
      </div>
    </div>
  );
}

function FeaturedNote({ run }: { readonly run: Run }): ReactElement {
  return (
    <p className={simulationStyles.muted}>
      Em destaque abaixo: <strong>{formatSymbol(run.symbol)}</strong>. Escolha outra em &quot;Ver em
      destaque&quot;, nos cartões acima.
    </p>
  );
}

export function OverviewPage(): ReactElement {
  const { marketSymbols } = useAppConfig();
  const live = useLiveSimulations();
  const { featured, select } = useFeaturedRun(live.simulations);
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Visão geral</h1>
      {live.runs.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar suas simulações. Tente novamente em instantes.
        </p>
      ) : null}
      {live.runs.isSuccess && live.simulations.length === 0 ? (
        <Card title="Simulação">
          <p>Nenhuma simulação ativa</p>
          <p className={controls.muted}>
            Quando você iniciar uma simulação ao vivo, o saldo e os sinais aparecem aqui.
          </p>
        </Card>
      ) : null}
      {live.simulations.length === 0 ? null : (
        <LiveSimulationsPanel {...live} select={select} featuredId={featured?.id} />
      )}
      {featured === undefined ? null : <FeaturedNote run={featured} />}
      {featured === undefined ? null : (
        <LivePulseLine runId={featured.id} symbol={featured.symbol} />
      )}
      <OverviewColumns run={featured ?? null} />
      <PastBacktestsCard />
      <Card title="Preços agora" aside={<MarketStatusBadge />}>
        <div className={styles.coins}>
          {marketSymbols.map((symbol) => (
            <CoinCard key={symbol} symbol={symbol} />
          ))}
        </div>
      </Card>
      <DataSourcesNote />
    </div>
  );
}
