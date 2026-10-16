// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createFakeChartSurface } from './support/fake-chart-surface.js';
import { measureBand } from '../src/runs/team-room/balcony/FormingBand.component.js';
import type {
  ChartSurface,
  SurfaceAnchorKind,
} from '../src/runs/candle-chart/chart-surface.types.js';

function surfaceWith(
  anchors: Partial<Record<SurfaceAnchorKind, { x: number; y: number }>>,
): ChartSurface {
  const base = createFakeChartSurface(document.createElement('div'));
  return { ...base, anchorOf: (kind) => anchors[kind] ?? null };
}

function box(left: number, top: number, height: number): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = (): DOMRect => new DOMRect(left, top, 400, height);
  return element;
}

describe('faixa da vela em formação (escritório F2)', () => {
  test('the band spans the forming candle column over the whole canvas, in figure coordinates', () => {
    const surface = surfaceWith({
      forming_left: { x: 300, y: 0 },
      forming_right: { x: 312, y: 0 },
    });
    const band = measureBand({
      runId: 'r',
      isLive: true,
      surface,
      canvasRef: { current: box(20, 100, 280) },
      figureRef: { current: box(10, 40, 600) },
    });
    expect(band).toEqual({ x: 310, y: 60, width: 12, height: 280 });
  });

  test('without the forming candle drawn there is no band', () => {
    const band = measureBand({
      runId: 'r',
      isLive: true,
      surface: surfaceWith({ forming_left: { x: 300, y: 0 } }),
      canvasRef: { current: box(0, 0, 100) },
      figureRef: { current: box(0, 0, 100) },
    });
    expect(band).toBeUndefined();
  });
});
