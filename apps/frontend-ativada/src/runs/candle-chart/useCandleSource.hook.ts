// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo, useState } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { timeframeMilliseconds } from '../live-chart.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import {
  DISPLAY_CONTEXT_BARS,
  DISPLAY_CONTEXT_MILLISECONDS,
  DISPLAY_TIMEFRAMES,
} from './candle-chart.constant.js';
import { computeCandleWindow, withLeadingContext } from './candle-window.js';
import { createDisplayMapping, type DisplayMapping } from './display-mapping.js';
import { useDisplayTail } from './useDisplayTail.hook.js';
import { useCandleHistory, type CandleHistory } from './useCandleHistory.hook.js';
import { useChartPreferences, type ChartPreferenceControls } from './useChartPreferences.hook.js';
import { TIMEFRAMES } from '../run.constant.js';
import {
  useTimeframeChoice,
  type TimeframeChoice,
  type TimeframeChoiceState,
} from './useTimeframeChoice.hook.js';

export type { TimeframeChoice };

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
  // Vela de exibição menor que a da execução (3 min sobre 15 min): a estratégia segue decidindo na da execução (spec 017).
  readonly displayMapping: DisplayMapping | undefined;
  // O corte da retenção das velas de exibição; `undefined` nas velas da execução.
  readonly retentionStart: number | undefined;
  // A duração da vela mostrada em milissegundos (0 quando não é uma que o painel conhece).
  readonly durationMilliseconds: number;
  // O instante que a pessoa quer no centro depois de trocar a vela; some quando ela escolhe outra faixa.
  readonly focus: number | undefined;
  readonly changeTimeframe: (next: TimeframeChoice, centerTime: number) => void;
  // Volta para a vela da execução (a saída de uma vela que o ambiente não tem).
  readonly backToRunTimeframe: () => void;
};

type FocusState = { readonly time: number; readonly rangeKey: string };

type OfferParams = {
  readonly runTimeframe: string;
  readonly enabled: readonly string[] | undefined;
  readonly enabledDisplay: readonly string[] | undefined;
};

// Velas de exibição (só as que o ambiente grava e que dividem a da execução) e depois as da execução (spec 017, RF02).
function offeredTimeframes(params: OfferParams): readonly TimeframeChoice[] {
  const { runTimeframe, enabled, enabledDisplay } = params;
  const runMilliseconds = timeframeMilliseconds(runTimeframe);
  const displayed = DISPLAY_TIMEFRAMES.filter(
    (option) =>
      (enabledDisplay ?? []).includes(option) &&
      createDisplayMapping(runMilliseconds, timeframeMilliseconds(option)) !== undefined,
  );
  const executed = TIMEFRAMES.filter(
    (option) => option === runTimeframe || (enabled ?? TIMEFRAMES).includes(option),
  );
  return [...displayed, ...executed];
}

// A vela mostrada e as oferecidas: as do ambiente, e sempre a da própria execução. A simulação ao vivo de 15 min abre em 3 min.
function useRunTimeframe(
  chart: TradeChart,
  isLive: boolean,
): {
  readonly choice: TimeframeChoiceState;
  readonly timeframeOptions: readonly TimeframeChoice[];
} {
  const { marketTimeframes, marketDisplayTimeframes } = useAppConfig();
  const timeframeOptions = offeredTimeframes({
    runTimeframe: chart.timeframe,
    enabled: marketTimeframes,
    enabledDisplay: marketDisplayTimeframes,
  });
  const preferred = isLive && chart.timeframe === '15m' ? timeframeOptions[0] : undefined;
  const isDisplayFirst = DISPLAY_TIMEFRAMES.some((option) => option === preferred);
  const choice = useTimeframeChoice({
    owner: `${chart.symbol}|${chart.timeframe}`,
    runTimeframe: chart.timeframe,
    offered: timeframeOptions,
    preferred: isDisplayFirst ? preferred : undefined,
  });
  return { choice, timeframeOptions };
}

function keyOfRange(range: ChartView['range']): string {
  return range === undefined ? 'end' : `${range.from}-${range.to}`;
}

function displayContextBars(duration: number): number {
  return Math.max(DISPLAY_CONTEXT_BARS, Math.ceil(DISPLAY_CONTEXT_MILLISECONDS / duration));
}

type SourceHistoryParams = {
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly mapping: DisplayMapping | undefined;
  readonly timeframe: string;
  readonly focus: number | undefined;
};

// A janela da primeira página e o histórico para a esquerda da vela mostrada; com vela de exibição, a ponta anda com o relógio.
function useSourceHistory(params: SourceHistoryParams): CandleHistory {
  const { chart, view, mapping, timeframe, focus } = params;
  const duration = timeframeMilliseconds(timeframe) ?? 0;
  const runRange = useDisplayTail({
    chart,
    mapping,
    isFollowing: view.isLive && view.range === undefined,
  });
  const contextBars = mapping === undefined ? 0 : displayContextBars(duration);
  const extent = withLeadingContext(runRange, duration, contextBars);
  const window = computeCandleWindow({
    extent,
    range: view.range,
    focus,
    timeframeMilliseconds: duration,
  });
  return useCandleHistory({
    symbol: chart.symbol,
    timeframe,
    window,
    earliestTime: extent.from,
    timeframeMilliseconds: duration,
    tailOverlapMilliseconds: mapping === undefined ? 0 : 2 * duration,
  });
}

// De onde vêm as velas: a vela escolhida (ou a da execução), a janela da primeira página e o histórico para a esquerda.
export function useCandleSource(chart: TradeChart, view: ChartView): CandleSource {
  const preferences = useChartPreferences();
  const { choice, timeframeOptions } = useRunTimeframe(chart, view.isLive);
  const [focusState, setFocusState] = useState<FocusState | undefined>(undefined);
  const { timeframe } = choice;
  const duration = timeframeMilliseconds(timeframe);
  const rangeKey = keyOfRange(view.range);
  const focus = focusState?.rangeKey === rangeKey ? focusState.time : undefined;
  const runDuration = timeframeMilliseconds(chart.timeframe);
  // A mesma referência enquanto as velas não mudam: camadas e marcas dependem dela para não serem refeitas a cada quadro.
  const displayMapping = useMemo(
    () => createDisplayMapping(runDuration, duration),
    [runDuration, duration],
  );
  const history = useSourceHistory({ chart, view, mapping: displayMapping, timeframe, focus });
  return {
    history,
    preferences,
    timeframe,
    timeframeOptions,
    isRunTimeframe: timeframe === chart.timeframe,
    isSupported: duration !== undefined,
    displayMapping,
    retentionStart: history.retentionStart,
    durationMilliseconds: duration ?? 0,
    focus,
    changeTimeframe: (next, centerTime): void => {
      setFocusState({ time: centerTime, rangeKey });
      choice.choose(next);
    },
    backToRunTimeframe: choice.clear,
  };
}
