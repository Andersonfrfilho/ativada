// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

import type { ChartSurface } from './chart-surface.types.js';
import {
  barsForPeriod,
  lookbackForPeriod,
  pickPeriodTimeframe,
  type ChartPeriod,
} from './chart-period.js';
import type { CandleSource, TimeframeChoice } from './useCandleSource.hook.js';

type Pending = { readonly period: ChartPeriod; readonly timeframe: string };

export type ChartPeriodState = {
  readonly active: ChartPeriod | undefined;
  readonly choose: (period: ChartPeriod) => void;
  // A pessoa escolheu a vela à mão: nenhum período fica marcado.
  readonly clear: () => void;
};

type ChartPeriodParams = {
  readonly source: CandleSource;
  readonly surface: ChartSurface | undefined;
  // O fim da execução: a troca de vela abre a janela ali, onde o período termina.
  readonly endTime: number;
};

function frame(surface: ChartSurface, period: ChartPeriod, duration: number): void {
  const bars = barsForPeriod(period, duration);
  if (bars === undefined) surface.fit();
  else surface.showLast(bars);
}

// Os atalhos de período: trocam a vela se preciso e, quando as velas novas chegam, enquadram o fim do período.
export function useChartPeriod({ source, surface, endTime }: ChartPeriodParams): ChartPeriodState {
  const [active, setActive] = useState<ChartPeriod | undefined>(undefined);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const { history, timeframe, durationMilliseconds } = source;
  const isReady = history.status === 'ready' && history.candles.length > 0;
  useEffect(() => {
    if (pending === undefined || surface === undefined) return;
    if (timeframe !== pending.timeframe || !isReady) return;
    frame(surface, pending.period, durationMilliseconds);
    setPending(undefined);
  }, [pending, surface, timeframe, isReady, durationMilliseconds]);
  return {
    active,
    choose: (period): void => {
      const next = pickPeriodTimeframe<TimeframeChoice>(period, source.timeframeOptions);
      setActive(period);
      setPending({ period, timeframe: next ?? timeframe });
      source.extendLookback(lookbackForPeriod(period));
      if (next !== undefined && next !== timeframe) source.changeTimeframe(next, endTime);
    },
    clear: (): void => setActive(undefined),
  };
}
