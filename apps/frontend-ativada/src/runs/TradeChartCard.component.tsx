// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { Card } from '../layout/Card.component.js';
import { ChartRangeControls } from './ChartRangeControls.component.js';
import compact from './ChartCardCompact.module.css';
import { LiveChartStatus } from './LiveChartStatus.component.js';
import { ProjectionCards } from './projection-cards/ProjectionCards.component.js';
import { planTradeSelection } from './trade-selection.js';
import { TradeChartBody } from './TradeChartBody.component.js';
import { TradeNotice } from './TradeNotice.component.js';
import { TradeSummary } from './TradeSummary.component.js';
import { TradesTable } from './TradesTable.component.js';
import type { Trade } from './run.validation.js';
import { useIsTerminalChart } from './candle-chart/terminal-chart.context.js';
import { useChartView, type ChartView } from './useChartView.hook.js';
import { useTradeSelection, type TradeSelection } from './useTradeSelection.hook.js';

export type TradeChartCardProps = {
  readonly runId: string;
  // Na simulação ao vivo o resumo mora no cartão "Acompanhamento".
  readonly hasSummary?: boolean;
  // Na simulação ao vivo os cartões de acertos vêm depois das decisões, fora deste cartão.
  readonly hasProjections?: boolean;
};

export type ChartDetailsProps = {
  readonly runId: string;
  readonly hasSummary: boolean;
  readonly view: ChartView;
  readonly selection: TradeSelection;
};

export function ChartDetails({
  runId,
  hasSummary,
  view,
  selection,
}: ChartDetailsProps): ReactElement {
  return (
    <>
      <TradeNotice isLive={view.isLive} />
      {hasSummary ? <TradeSummary runId={runId} /> : null}
      <ChartRangeControls
        extent={view.extent}
        range={view.range}
        shown={view.shown}
        onRangeChange={selection.setRange}
      />
    </>
  );
}

// O cartão "Preço e operações": aviso, resumo, gráfico com controles e a tabela, ligados pela seleção na URL
// (`?de=&ate=` e `?operacao=`): uma seta seleciona a linha e uma linha seleciona as setas, movendo a faixa se preciso.
// Ao vivo o gráfico vem primeiro; o aviso, o resumo e o período ficam logo abaixo dele.
export function TradeChartCard({
  runId,
  hasSummary = true,
  hasProjections = true,
}: TradeChartCardProps): ReactElement {
  const timeZone = useUserTimeZone();
  const selection = useTradeSelection();
  const view = useChartView(runId, selection.range);
  const isTerminal = useIsTerminalChart();
  function handleSelectTrade(trade: Trade): void {
    selection.select(planTradeSelection({ trade, range: view.range, extent: view.extent }));
  }
  // No telão da sala só o gráfico: o resto vive na aba "Operações" (`TradeOperations`).
  if (isTerminal) return <TradeChartBody runId={runId} view={view} selection={selection} />;
  const details = (
    <ChartDetails runId={runId} hasSummary={hasSummary} view={view} selection={selection} />
  );
  return (
    <>
      <div className={compact.card}>
        <Card title="Preço e operações">
          {view.isLive ? null : details}
          <div className={compact.status}>
            <LiveChartStatus view={view} selection={selection} timeZone={timeZone} />
          </div>
          <TradeChartBody runId={runId} view={view} selection={selection} />
          {view.isLive ? details : null}
          <TradesTable
            runId={runId}
            range={view.queryRange}
            timeZone={timeZone}
            selectedKey={selection.selectedKey}
            onSelectTrade={handleSelectTrade}
          />
        </Card>
      </div>
      {hasProjections ? <ProjectionCards runId={runId} isLive={view.isLive} /> : null}
    </>
  );
}
