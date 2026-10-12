// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartLine } from './EquityChart.component.js';
import type { CurvePoint } from './equity-csv.js';

export type RatioLineParams = {
  readonly label: string;
  readonly tone: ChartLine['tone'];
  readonly points: readonly CurvePoint[];
  readonly pick: (point: CurvePoint) => number;
};

// Retorno acumulado desde o capital inicial: curvas de capitais diferentes ficam comparáveis.
export function toRatioLine({ label, tone, points, pick }: RatioLineParams): ChartLine {
  const first = points[0];
  const initial = first === undefined ? 1 : pick(first);
  return {
    label,
    tone,
    points: points.map((point) => ({ time: point.time, ratio: pick(point) / initial - 1 })),
  };
}
