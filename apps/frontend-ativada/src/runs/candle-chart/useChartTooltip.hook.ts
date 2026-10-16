// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';

import { formatSymbol } from '../../format/format.js';
import type { TradeChart } from '../trade-chart.validation.js';
import { placeTooltip, type TooltipPoint } from './tooltip-placement.js';
import { buildTooltipModel, indexOfOpenTime, type TooltipModel } from './tooltip-model.js';
import type { CandleCanvasModel } from './useCandleCanvasModel.hook.js';
import type { CandleSource } from './useCandleSource.hook.js';

export type ChartTooltipState = {
  readonly id: string;
  readonly model: TooltipModel | undefined;
  readonly tipRef: RefObject<HTMLDivElement | null>;
  readonly handlers: {
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerLeave: () => void;
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  };
};

export type ChartTooltipInput = {
  readonly chart: TradeChart;
  readonly source: CandleSource;
  readonly model: CandleCanvasModel;
};

function useTooltipModel(input: ChartTooltipInput, isHidden: boolean): TooltipModel | undefined {
  const { chart, source, model } = input;
  const { pointedOpenTime, timeZone, bracketText } = model;
  const { candles } = source.history;
  const layers = model.layerData.layers;
  return useMemo(() => {
    if (isHidden || pointedOpenTime === undefined) return undefined;
    const index = indexOfOpenTime(candles, pointedOpenTime);
    const candle = candles[index];
    if (candle === undefined) return undefined;
    return buildTooltipModel({
      candle,
      previousClose: candles[index - 1]?.close,
      symbol: formatSymbol(chart.symbol),
      timeframe: source.timeframe,
      timeZone,
      layers,
      decisions: chart.decisions,
      markers: chart.markers,
      mapping: source.displayMapping,
      durationMilliseconds: source.durationMilliseconds,
      bracketText,
    });
  }, [isHidden, pointedOpenTime, candles, layers, chart, source, timeZone, bracketText]);
}

function useDismissWithEscape(isVisible: boolean, dismiss: () => void): void {
  useEffect(() => {
    if (!isVisible) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return (): void => document.removeEventListener('keydown', onKey);
  }, [isVisible, dismiss]);
}

type Frame = {
  readonly frame: { width: number; height: number };
  readonly pointer: TooltipPoint | undefined;
};

// Põe o balão no lugar na próxima pintura: variáveis CSS no elemento, sem refazer a árvore do React a cada movimento.
function usePlacement(
  tipRef: RefObject<HTMLDivElement | null>,
  pointerRef: RefObject<Frame | undefined>,
): () => void {
  const frameId = useRef(0);
  return (): void => {
    cancelAnimationFrame(frameId.current);
    frameId.current = requestAnimationFrame(() => {
      const tip = tipRef.current;
      const state = pointerRef.current;
      if (tip === null || state === undefined) return;
      const spot = placeTooltip({
        pointer: state.pointer,
        frame: state.frame,
        tip: { width: tip.offsetWidth, height: tip.offsetHeight },
      });
      tip.style.setProperty('--tip-x', `${spot.x}px`);
      tip.style.setProperty('--tip-y', `${spot.y}px`);
    });
  };
}

function track(event: PointerEvent<HTMLElement>): Frame {
  const box = event.currentTarget.getBoundingClientRect();
  return {
    frame: { width: box.width, height: box.height },
    pointer: { x: event.clientX - box.left, y: event.clientY - box.top },
  };
}

// O balão de valores (pedido do usuário): segue o mouse, vem pelo teclado (cruz) e pelo toque (um toque mostra e fixa); Esc fecha.
export function useChartTooltip(input: ChartTooltipInput): ChartTooltipState {
  const id = useId();
  const tipRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<Frame | undefined>(undefined);
  const [dismissedFor, setDismissedFor] = useState<number | undefined>(undefined);
  const [isPinned, setIsPinned] = useState(false);
  const opened = input.model.pointedOpenTime;
  const live = useTooltipModel(input, dismissedFor === opened);
  const lastShown = useRef<TooltipModel | undefined>(undefined);
  const place = usePlacement(tipRef, pointerRef);
  useEffect(() => {
    if (live !== undefined) lastShown.current = live;
    place();
  }, [live, place]);
  useDismissWithEscape(live !== undefined || isPinned, () => {
    setIsPinned(false);
    setDismissedFor(opened);
  });
  return {
    id,
    model: live ?? (isPinned ? lastShown.current : undefined),
    tipRef,
    handlers: {
      onPointerMove: (event): void => {
        pointerRef.current = track(event);
        place();
      },
      onPointerLeave: (): void => {
        if (!isPinned) pointerRef.current = undefined;
      },
      onPointerDown: (event): void => {
        pointerRef.current = track(event);
        setDismissedFor(undefined);
        setIsPinned(event.pointerType === 'touch');
      },
    },
  };
}
