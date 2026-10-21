// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import controls from '../../styles/Controls.module.css';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';
import { BesideTeam } from '../team-room/BesideTeam.component.js';
import { RateLimitNotice } from '../RateLimitNotice.component.js';
import { CandleCanvas } from './CandleCanvas.component.js';
import { SimpleChartFallback } from './SimpleChartFallback.component.js';
import { EmptyHistoryNotice } from './EmptyHistoryNotice.component.js';
import { useCandleSource, type CandleSource } from './useCandleSource.hook.js';

export type CandleChartProps = {
  readonly runId: string;
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly selection: TradeSelection;
};

const CANDLES_UNAVAILABLE_REASON =
  'As velas deste par não estão disponíveis agora; mostrando o gráfico simples.';

type ChartFallbackProps = {
  readonly chart: TradeChart;
  readonly selection: TradeSelection;
  readonly source: CandleSource;
};

// A reserva: o gráfico simples com o motivo; o limite de pedidos (429) vira aviso com contagem e repetição sozinha.
function ChartFallback({ chart, selection, source }: ChartFallbackProps): ReactElement {
  const timeZone = useUserTimeZone();
  const { rateLimit, retry } = source.history;
  const isRateLimited = source.isSupported && rateLimit !== undefined;
  return (
    <BesideTeam>
      <SimpleChartFallback
        chart={chart}
        timeZone={timeZone}
        selection={selection}
        reason={
          isRateLimited ? (
            <RateLimitNotice retryAt={rateLimit.retryAt} onRetry={retry} />
          ) : (
            CANDLES_UNAVAILABLE_REASON
          )
        }
        onRetry={source.isSupported && !isRateLimited ? retry : undefined}
        onBackToRun={source.isRunTimeframe ? undefined : source.backToRunTimeframe}
      />
    </BesideTeam>
  );
}

// O cartão "Preço e operações" como na corretora: velas, volume e as operações. Quem decide o que mostrar é o histórico
// de velas: sem elas (par fora da lista atual, erro) a reserva é o gráfico simples da spec 005.
export function CandleChart({ runId, chart, view, selection }: CandleChartProps): ReactElement {
  const source = useCandleSource(chart, view);
  if (!source.isSupported || source.history.status === 'error') {
    return <ChartFallback {...{ chart, selection, source }} />;
  }
  if (source.history.status === 'loading') {
    return (
      <BesideTeam>
        <p className={controls.muted}>Carregando as velas…</p>
      </BesideTeam>
    );
  }
  return (
    <>
      {source.history.candles.length === 0 ? (
        <EmptyHistoryNotice onRetry={source.history.retry} />
      ) : null}
      <CandleCanvas runId={runId} chart={chart} view={view} selection={selection} source={source} />
    </>
  );
}
