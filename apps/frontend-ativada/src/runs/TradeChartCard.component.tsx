// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { Card } from '../layout/Card.component.js';
import { ChartRangeControls } from './ChartRangeControls.component.js';
import { LiveChartStatus } from './LiveChartStatus.component.js';
import { ProjectionCards } from './projection-cards/ProjectionCards.component.js';
import { planTradeSelection } from './trade-selection.js';
import { TradeChartBody } from './TradeChartBody.component.js';
import { TradeNotice } from './TradeNotice.component.js';
import { TradeSummary } from './TradeSummary.component.js';
import { TradesTable } from './TradesTable.component.js';
import type { Trade } from './run.validation.js';
import { useChartView } from './useChartView.hook.js';
import { useTradeSelection } from './useTradeSelection.hook.js';

export type TradeChartCardProps = {
  readonly runId: string;
  // Na simulação ao vivo o resumo mora no cartão "Acompanhamento".
  readonly hasSummary?: boolean;
};

// O cartão "Preço e operações": aviso, resumo, gráfico com controles e a tabela, ligados pela seleção na URL
// (`?de=&ate=` e `?operacao=`): uma seta seleciona a linha e uma linha seleciona as setas, movendo a faixa se preciso.
export function TradeChartCard({ runId, hasSummary = true }: TradeChartCardProps): ReactElement {
  const timeZone = useUserTimeZone();
  const selection = useTradeSelection();
  const view = useChartView(runId, selection.range);
  function handleSelectTrade(trade: Trade): void {
    selection.select(planTradeSelection({ trade, range: view.range, extent: view.extent }));
  }
  return (
    <>
      <Card title="Preço e operações">
        <TradeNotice isLive={view.isLive} />
        {hasSummary ? <TradeSummary runId={runId} /> : null}
        <ChartRangeControls
          extent={view.extent}
          range={view.range}
          shown={view.shown}
          onRangeChange={selection.setRange}
        />
        <LiveChartStatus view={view} selection={selection} timeZone={timeZone} />
        <TradeChartBody runId={runId} view={view} selection={selection} />
        <TradesTable
          runId={runId}
          range={view.queryRange}
          timeZone={timeZone}
          selectedKey={selection.selectedKey}
          onSelectTrade={handleSelectTrade}
        />
      </Card>
      <ProjectionCards runId={runId} isLive={view.isLive} />
    </>
  );
}
