// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { StreamCandle } from '../../live/stream.validation.js';

// A linha do preço real chegando (RF12): um ponto por mensagem da vela em formação, só da vela de agora.
export type TrailPoint = { readonly at: number; readonly close: string };

export type PriceTrail = {
  readonly openTime: number | undefined;
  readonly points: readonly TrailPoint[];
};

export const EMPTY_TRAIL: PriceTrail = { openTime: undefined, points: [] };

// A vela de 1 h recebe no máximo uma mensagem por segundo: 3.600 pontos. Guardar só os mais novos mantém o desenho leve.
export const MAX_TRAIL_POINTS = 600;

type TrailSource = Pick<StreamCandle, 'openTime' | 'at' | 'close'>;

// Devolve o MESMO objeto quando nada muda (mensagem repetida ou mais velha): quem guarda o estado não re-renderiza à toa.
export function extendTrail(trail: PriceTrail, candle: TrailSource): PriceTrail {
  const point: TrailPoint = { at: candle.at, close: candle.close };
  if (candle.openTime !== trail.openTime) return { openTime: candle.openTime, points: [point] };
  const last = trail.points.at(-1);
  if (last !== undefined && last.at >= candle.at) return trail;
  return { openTime: trail.openTime, points: [...trail.points, point].slice(-MAX_TRAIL_POINTS) };
}
