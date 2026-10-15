// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import type { ChartMarker } from '../trade-chart.validation.js';
import { formatDayInZone, formatInZone, formatTimeInZone } from '../../format/zoned-time.js';
import { MILLISECONDS_PER_SECOND } from './candle-chart.constant.js';
import { toSurfaceCandles, toVolumeBars } from './candle-series.js';
import type { ChartSurface } from './chart-surface.types.js';
import { toSurfaceMarkers } from './marker-series.js';
import type { MarketCandle } from './market-candles.validation.js';

const SHORT_DAY_LENGTH = 5;

export type SurfaceDataInput = {
  readonly candles: readonly MarketCandle[];
  // `null`: o servidor agrupou os eventos e não há setas.
  readonly markers: readonly ChartMarker[] | null;
  readonly isTradesVisible: boolean;
  readonly selectedKey: string | undefined;
  readonly timeframeMilliseconds: number;
  readonly timeZone: string;
};

// Empurra para a superfície o que a tela tem: as velas e o volume, as setas e os rótulos de hora no fuso do usuário.
// A biblioteca desenha em UTC; só estas funções conhecem o fuso.
export function useSurfaceData(surface: ChartSurface | undefined, input: SurfaceDataInput): void {
  const { candles, markers, isTradesVisible, selectedKey, timeframeMilliseconds, timeZone } = input;
  useEffect(() => {
    surface?.setCandles(toSurfaceCandles(candles));
    surface?.setVolume(toVolumeBars(candles));
  }, [surface, candles]);
  useEffect(() => {
    const visible = isTradesVisible ? markers : null;
    surface?.setMarkers(toSurfaceMarkers(visible, timeframeMilliseconds, selectedKey));
  }, [surface, markers, isTradesVisible, selectedKey, timeframeMilliseconds]);
  useEffect(() => {
    const inZone = (seconds: number): number => seconds * MILLISECONDS_PER_SECOND;
    surface?.setTimeLabels({
      time: (seconds) => formatTimeInZone(inZone(seconds), timeZone),
      day: (seconds) => formatDayInZone(inZone(seconds), timeZone).slice(0, SHORT_DAY_LENGTH),
      full: (seconds) => formatInZone(inZone(seconds), timeZone),
    });
  }, [surface, timeZone]);
}
