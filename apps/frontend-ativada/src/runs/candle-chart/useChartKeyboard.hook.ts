// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { toSurfaceTime } from './candle-series.js';
import { planChartKey, type ChartKeyAction } from './chart-key-plan.js';
import type { ChartSurface } from './chart-surface.types.js';
import type { MarketCandle } from './market-candles.validation.js';
import { describeEventsAt, listEventIndexes } from './marker-series.js';
import { describeCandleForSpeech } from './ohlc-text.js';
import type { ChartMarker } from '../trade-chart.validation.js';

// Quanto esperar parado antes de falar a vela: andar de seta em seta não fala a cada tecla (D6).
export const ANNOUNCEMENT_DELAY_MILLISECONDS = 400;

export type ChartKeyboardParams = {
  readonly surface: ChartSurface | undefined;
  readonly candles: readonly MarketCandle[];
  readonly markers: readonly ChartMarker[] | null;
  readonly durationMilliseconds: number;
  readonly symbol: string;
  readonly timeframe: string;
  readonly timeZone: string;
  // A vela está na janela visível? Fora dela o gráfico se desloca até ela.
  readonly isVisible: (index: number) => boolean;
  // Enter: seleciona a operação da vela apontada (spec 005, RF10).
  readonly onPick: (index: number) => void;
};

export type ChartKeyboard = {
  // A vela apontada pelo teclado; `null` antes da primeira tecla e depois do Esc.
  readonly index: number | null;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  // A frase da vela apontada, para a região `aria-live`, já com a espera.
  readonly announcement: string;
};

function useDelayedText(text: string): string {
  const [delayed, setDelayed] = useState(text);
  useEffect(() => {
    const timer = window.setTimeout(() => setDelayed(text), ANNOUNCEMENT_DELAY_MILLISECONDS);
    return (): void => window.clearTimeout(timer);
  }, [text]);
  return delayed;
}

function speechFor(params: ChartKeyboardParams, index: number | null): string {
  const candle = index === null ? undefined : params.candles[index];
  if (index === null || candle === undefined) return '';
  return describeCandleForSpeech({
    candle,
    previousClose: params.candles[index - 1]?.close,
    symbol: params.symbol,
    timeframe: params.timeframe,
    timeZone: params.timeZone,
    isForming: false,
    eventLabel: describeEventsAt(params.markers, candle.openTime, params.durationMilliseconds),
  });
}

type ActionContext = {
  readonly params: ChartKeyboardParams;
  readonly index: number | null;
  readonly select: (index: number | null) => void;
};

function runAction(action: ChartKeyAction, { params, index, select }: ActionContext): void {
  if (action.type === 'zoom') params.surface?.zoom(action.step);
  else if (action.type === 'clear') select(null);
  else if (action.type === 'pick') {
    if (index !== null) params.onPick(index);
  } else {
    select(action.index);
    const candle = params.candles[action.index];
    if (candle !== undefined && !params.isVisible(action.index)) {
      params.surface?.centerOn(toSurfaceTime(candle.openTime));
    }
  }
}

// Teclado e leitor de tela do gráfico (RF20): a cruz anda pelo índice da vela, o gráfico acompanha quando a vela sai da
// janela e a frase da vela apontada vai para a região `aria-live` depois de uma pequena espera.
export function useChartKeyboard(params: ChartKeyboardParams): ChartKeyboard {
  const { surface, candles } = params;
  const [rawIndex, setRawIndex] = useState<number | null>(null);
  const index = rawIndex !== null && rawIndex < candles.length ? rawIndex : null;
  const wasSet = useRef(false);
  useEffect(() => {
    if (index === null && !wasSet.current) return;
    wasSet.current = index !== null;
    surface?.setCrosshair(index);
  }, [surface, index]);
  const announcement = useDelayedText(speechFor(params, index));
  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const events = listEventIndexes(candles, params.markers, params.durationMilliseconds);
    const key = event.key;
    const action = planChartKey({
      key,
      shiftKey: event.shiftKey,
      current: index,
      count: candles.length,
      events,
    });
    if (action === undefined) return;
    event.preventDefault();
    runAction(action, { params, index, select: setRawIndex });
  }
  return { index, onKeyDown, announcement };
}
