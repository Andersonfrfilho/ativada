// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import controls from '../../styles/Controls.module.css';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';
import { CandleCanvas } from './CandleCanvas.component.js';
import { SimpleChartFallback } from './SimpleChartFallback.component.js';
import { useCandleSource } from './useCandleSource.hook.js';

export type CandleChartProps = {
  readonly runId: string;
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly selection: TradeSelection;
};

const CANDLES_UNAVAILABLE_REASON =
  'As velas deste par não estão disponíveis agora; mostrando o gráfico simples.';

// O cartão "Preço e operações" como na corretora: velas, volume e as operações. Quem decide o que mostrar é o histórico
// de velas: sem elas (par fora da lista atual, erro) a reserva é o gráfico simples da spec 005.
export function CandleChart({ runId, chart, view, selection }: CandleChartProps): ReactElement {
  const timeZone = useUserTimeZone();
  const source = useCandleSource(chart, view);
  if (!source.isSupported || source.history.status === 'error') {
    return (
      <SimpleChartFallback
        chart={chart}
        timeZone={timeZone}
        selection={selection}
        reason={CANDLES_UNAVAILABLE_REASON}
        onRetry={source.isSupported ? source.history.retry : undefined}
        onBackToRun={source.isRunTimeframe ? undefined : source.backToRunTimeframe}
      />
    );
  }
  if (source.history.status === 'loading') {
    return <p className={controls.muted}>Carregando as velas…</p>;
  }
  return (
    <CandleCanvas runId={runId} chart={chart} view={view} selection={selection} source={source} />
  );
}
