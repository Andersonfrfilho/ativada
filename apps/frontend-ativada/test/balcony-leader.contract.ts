// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  ChartSurface,
  SurfaceAnchorKind,
} from '../src/runs/candle-chart/chart-surface.types.js';
import { LEADER_ANCHOR } from '../src/runs/team-room/balcony/balcony.constant.js';
import { measureLeader } from '../src/runs/team-room/balcony/LeaderOverlay.component.js';

function box(left: number, top: number, width: number, height: number): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = (): DOMRect =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect;
  return element;
}

function surfaceWith(
  points: Partial<Record<SurfaceAnchorKind, { x: number; y: number }>>,
): ChartSurface {
  return { anchorOf: (kind: SurfaceAnchorKind) => points[kind] ?? null } as unknown as ChartSurface;
}

describe('linha tracejada do balão ao gráfico', () => {
  const figure = box(10, 100, 800, 600);
  const canvas = box(10, 300, 800, 300);

  test('each agent that comments a point has an anchor and Sofia and Otávio have none', () => {
    expect(LEADER_ANCHOR['renata']).toBe('band_lower');
    expect(LEADER_ANCHOR['tiago']).toBe('ema_fast');
    expect(LEADER_ANCHOR['vitor']).toBe('volume');
    expect(LEADER_ANCHOR['alice']).toBe('protection');
    expect(LEADER_ANCHOR['sofia']).toBeUndefined();
    expect(LEADER_ANCHOR['otavio']).toBeUndefined();
  });

  test('the line leaves the bottom center of the bubble and ends at the anchor, in figure coordinates', () => {
    const props = {
      surface: surfaceWith({ band_lower: { x: 500, y: 120 } }),
      canvasRef: { current: canvas },
      figureRef: { current: figure },
    };
    const line = measureLeader(props, box(110, 220, 100, 40), 'renata');
    expect(line).toEqual({ x1: 150, y1: 160, x2: 500, y2: 320 });
  });

  test('without the layer on the chart, or without an anchor for the agent, there is no line', () => {
    const props = {
      surface: surfaceWith({}),
      canvasRef: { current: canvas },
      figureRef: { current: figure },
    };
    expect(measureLeader(props, box(0, 0, 10, 10), 'renata')).toBeUndefined();
    expect(measureLeader(props, box(0, 0, 10, 10), 'sofia')).toBeUndefined();
  });
});
