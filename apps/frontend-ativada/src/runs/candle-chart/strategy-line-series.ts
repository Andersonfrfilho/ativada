// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toDrawingNumber, toSurfaceTime } from './candle-series.js';
import type { SurfaceLine } from './chart-surface.types.js';
import type { StrategyLayers } from './strategy-layers.validation.js';

type LineColumns = Pick<StrategyLayers, 'candleTimes' | 'lines'>;

// As linhas são as que o motor viu (`signals.indicators`): vela sem valor (aquecimento) não vira ponto, nunca zero.
export function toSurfaceLines(layers: LineColumns): SurfaceLine[] {
  return layers.lines.map((line) => ({
    key: line.key,
    role: line.role,
    points: layers.candleTimes.flatMap((candleTime, index) => {
      const value = line.values[index];
      if (value === null || value === undefined) return [];
      return [{ time: toSurfaceTime(candleTime), value: toDrawingNumber(value) }];
    }),
  }));
}
