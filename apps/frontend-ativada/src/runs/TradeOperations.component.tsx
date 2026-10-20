// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { Card } from '../layout/Card.component.js';
import { ChartCredit } from './candle-chart/ChartCredit.component.js';
import { LiveChartStatus } from './LiveChartStatus.component.js';
import { ChartDetails } from './TradeChartCard.component.js';
import { planTradeSelection } from './trade-selection.js';
import { TradesTable } from './TradesTable.component.js';
import type { Trade } from './run.validation.js';
import { useChartView } from './useChartView.hook.js';
import { useTradeSelection } from './useTradeSelection.hook.js';

// "Operações" da simulação ao vivo: o que o cartão do gráfico mostrava em volta do canvas (situação, aviso, resumo, período e
// a tabela) e o crédito do gráfico. A seleção mora na URL, então a tabela e as setas do telão seguem ligadas.
export function TradeOperations({ runId }: { readonly runId: string }): ReactElement {
  const timeZone = useUserTimeZone();
  const selection = useTradeSelection();
  const view = useChartView(runId, selection.range);
  function handleSelectTrade(trade: Trade): void {
    selection.select(planTradeSelection({ trade, range: view.range, extent: view.extent }));
  }
  return (
    <Card title="Operações">
      <LiveChartStatus view={view} selection={selection} timeZone={timeZone} />
      <ChartDetails runId={runId} hasSummary view={view} selection={selection} />
      <TradesTable
        runId={runId}
        range={view.queryRange}
        timeZone={timeZone}
        selectedKey={selection.selectedKey}
        onSelectTrade={handleSelectTrade}
      />
      <ChartCredit />
    </Card>
  );
}
