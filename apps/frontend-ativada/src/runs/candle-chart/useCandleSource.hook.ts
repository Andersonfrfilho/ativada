// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { timeframeMilliseconds } from '../live-chart.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import { computeCandleWindow } from './candle-window.js';
import type { ChartPreferences } from './chart-preferences.js';
import { useCandleHistory, type CandleHistory } from './useCandleHistory.hook.js';
import { useChartPreferences, type ChartPreferenceControls } from './useChartPreferences.hook.js';

export type TimeframeChoice = NonNullable<ChartPreferences['timeframe']>;

export type CandleSource = {
  readonly history: CandleHistory;
  readonly preferences: ChartPreferenceControls;
  // A vela mostrada agora (a escolhida, ou a da própria execução).
  readonly timeframe: string;
  // `false` quando a vela da execução não é uma das que o painel conhece: o gráfico simples assume.
  readonly isSupported: boolean;
  // A duração da vela mostrada em milissegundos (0 quando não é uma que o painel conhece).
  readonly durationMilliseconds: number;
  // O instante que a pessoa quer no centro depois de trocar a vela; some quando ela escolhe outra faixa.
  readonly focus: number | undefined;
  readonly changeTimeframe: (next: TimeframeChoice, centerTime: number) => void;
};

type FocusState = { readonly time: number; readonly rangeKey: string };

function keyOfRange(range: ChartView['range']): string {
  return range === undefined ? 'end' : `${range.from}-${range.to}`;
}

// De onde vêm as velas: a vela escolhida (ou a da execução), a janela da primeira página e o histórico para a esquerda.
export function useCandleSource(chart: TradeChart, view: ChartView): CandleSource {
  const preferences = useChartPreferences();
  const [focusState, setFocusState] = useState<FocusState | undefined>(undefined);
  const timeframe = preferences.preferences.timeframe ?? chart.timeframe;
  const duration = timeframeMilliseconds(timeframe);
  const rangeKey = keyOfRange(view.range);
  const focus = focusState?.rangeKey === rangeKey ? focusState.time : undefined;
  const window = computeCandleWindow({
    extent: chart.runRange,
    range: view.range,
    focus,
    timeframeMilliseconds: duration ?? 0,
  });
  const history = useCandleHistory({
    symbol: chart.symbol,
    timeframe,
    window,
    earliestTime: chart.runRange.from,
    timeframeMilliseconds: duration ?? 0,
  });
  return {
    history,
    preferences,
    timeframe,
    isSupported: duration !== undefined,
    durationMilliseconds: duration ?? 0,
    focus,
    changeTimeframe: (next, centerTime): void => {
      setFocusState({ time: centerTime, rangeKey });
      preferences.setTimeframe(next === chart.timeframe ? null : next);
    },
  };
}
