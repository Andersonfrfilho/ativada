// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { timeframeMilliseconds } from '../live-chart.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import { computeCandleWindow } from './candle-window.js';
import { useCandleHistory, type CandleHistory } from './useCandleHistory.hook.js';
import { useChartPreferences, type ChartPreferenceControls } from './useChartPreferences.hook.js';
import { TIMEFRAMES } from '../run.constant.js';

export type TimeframeChoice = (typeof TIMEFRAMES)[number];

export type CandleSource = {
  readonly history: CandleHistory;
  readonly preferences: ChartPreferenceControls;
  // A vela mostrada agora (a escolhida, ou a da própria execução).
  readonly timeframe: string;
  // As velas oferecidas: as do ambiente, e sempre a da própria execução.
  readonly timeframeOptions: readonly TimeframeChoice[];
  // A vela mostrada é a da própria execução (a única com previsão, placar e linhas).
  readonly isRunTimeframe: boolean;
  // `false` quando a vela da execução não é uma das que o painel conhece: o gráfico simples assume.
  readonly isSupported: boolean;
  // A duração da vela mostrada em milissegundos (0 quando não é uma que o painel conhece).
  readonly durationMilliseconds: number;
  // O instante que a pessoa quer no centro depois de trocar a vela; some quando ela escolhe outra faixa.
  readonly focus: number | undefined;
  readonly changeTimeframe: (next: TimeframeChoice, centerTime: number) => void;
  // Volta para a vela da execução (a saída de uma vela que o ambiente não tem).
  readonly backToRunTimeframe: () => void;
};

type FocusState = { readonly time: number; readonly rangeKey: string };

// A escolha vale só para esta execução e esta tela: nada vai ao armazenamento (RF05).
type Choice = { readonly owner: string; readonly timeframe: TimeframeChoice };

function offeredTimeframes(
  runTimeframe: string,
  enabled: readonly string[] | undefined,
): readonly TimeframeChoice[] {
  return TIMEFRAMES.filter(
    (option) => option === runTimeframe || (enabled ?? TIMEFRAMES).includes(option),
  );
}

function keyOfRange(range: ChartView['range']): string {
  return range === undefined ? 'end' : `${range.from}-${range.to}`;
}

// De onde vêm as velas: a vela escolhida (ou a da execução), a janela da primeira página e o histórico para a esquerda.
export function useCandleSource(chart: TradeChart, view: ChartView): CandleSource {
  const preferences = useChartPreferences();
  const { marketTimeframes } = useAppConfig();
  const [choice, setChoice] = useState<Choice | undefined>(undefined);
  const owner = `${chart.symbol}|${chart.timeframe}`;
  const [focusState, setFocusState] = useState<FocusState | undefined>(undefined);
  const timeframe = choice?.owner === owner ? choice.timeframe : chart.timeframe;
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
    timeframeOptions: offeredTimeframes(chart.timeframe, marketTimeframes),
    isRunTimeframe: timeframe === chart.timeframe,
    isSupported: duration !== undefined,
    durationMilliseconds: duration ?? 0,
    focus,
    changeTimeframe: (next, centerTime): void => {
      setFocusState({ time: centerTime, rangeKey });
      setChoice({ owner, timeframe: next });
    },
    backToRunTimeframe: (): void => setChoice(undefined),
  };
}
