// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toDrawingNumber, toSurfaceTime } from './candle-series.js';
import type { SurfaceScoreBar, SurfaceThreshold } from './chart-surface.types.js';
import type { StrategyLayers } from './strategy-layers.validation.js';

// Uma barra por vela decidida, com a pontuação gravada. Vela de aquecimento não chega da API e, portanto, não tem barra.
export function toScoreBars(
  layers: Pick<StrategyLayers, 'candleTimes' | 'score' | 'actions'>,
): SurfaceScoreBar[] {
  return layers.candleTimes.flatMap((candleTime, index) => {
    const score = layers.score[index];
    const action = layers.actions[index];
    if (score === undefined || action === undefined) return [];
    return [{ time: toSurfaceTime(candleTime), value: toDrawingNumber(score), action }];
  });
}

// Os limiares valem por trecho (no walk-forward mudam de janela para janela); trecho sem limiar fica sem linha.
export function toThresholdSegments(
  layers: Pick<StrategyLayers, 'thresholds'>,
): SurfaceThreshold[] {
  return layers.thresholds.map((segment) => ({
    from: toSurfaceTime(segment.from),
    to: toSurfaceTime(segment.to),
    buy: toDrawingNumber(segment.buy),
    sell: toDrawingNumber(segment.sell),
  }));
}
