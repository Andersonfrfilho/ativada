// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toDrawingNumber, toSurfaceTime } from './candle-series.js';
import type { SurfaceProjection } from './chart-surface.types.js';
import type { ProjectionCurrent } from './projections.validation.js';

export type ConePoint = {
  readonly fraction: number;
  readonly upper: number;
  readonly lower: number;
};

export type ProjectionCone = {
  readonly base: number;
  readonly points: readonly ConePoint[];
  // A metade colorida é a do lado da tendência: compra = para cima, venda = para baixo (D10).
  readonly trendHalf: 'upper' | 'lower';
};

// A previsão é a TENDÊNCIA do placar com a faixa de ±1 ATR; nunca um preço-alvo. Sem tendência ou sem faixa, não há cone.
export function toSurfaceProjection(current: ProjectionCurrent): SurfaceProjection | null {
  if (current.status !== 'available') return null;
  if (current.bandLow === null || current.bandHigh === null) return null;
  return {
    startTime: toSurfaceTime(current.closedAt),
    endTime: toSurfaceTime(current.horizonEndsAt),
    base: toDrawingNumber(current.base),
    low: toDrawingNumber(current.bandLow),
    high: toDrawingNumber(current.bandHigh),
    side: current.side,
  };
}

// A faixa abre com √fração do tempo (como o desvio de um passeio aleatório) e nunca encolhe: em 1 é a faixa inteira.
export function buildProjectionCone(projection: SurfaceProjection, steps: number): ProjectionCone {
  const up = projection.high - projection.base;
  const down = projection.base - projection.low;
  const points = Array.from({ length: steps + 1 }, (_unused, index): ConePoint => {
    const fraction = index / steps;
    const spread = Math.sqrt(fraction);
    return {
      fraction,
      upper: projection.base + up * spread,
      lower: projection.base - down * spread,
    };
  });
  return {
    base: projection.base,
    points,
    trendHalf: projection.side === 'buy' ? 'upper' : 'lower',
  };
}
