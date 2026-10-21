// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { placeTooltip } from '../src/runs/candle-chart/tooltip-placement.js';

const FRAME = { width: 800, height: 400 };
const TIP = { width: 260, height: 180 };

describe('posição do balão', () => {
  test('à direita do cursor, sem cobrir a vela apontada', () => {
    const spot = placeTooltip({ pointer: { x: 100, y: 200 }, frame: FRAME, tip: TIP });
    expect(spot.x).toBeGreaterThan(100);
    expect(spot.y).toBe(110);
  });

  test('perto da borda direita vira para a esquerda e nunca sai do gráfico', () => {
    const spot = placeTooltip({ pointer: { x: 700, y: 10 }, frame: FRAME, tip: TIP });
    expect(spot.x + TIP.width).toBeLessThan(700);
    expect(spot.y).toBe(4);
    const low = placeTooltip({ pointer: { x: 300, y: 399 }, frame: FRAME, tip: TIP });
    expect(low.y + TIP.height).toBeLessThanOrEqual(FRAME.height - 4);
  });

  test('sem cursor (teclado) fica no canto', () => {
    expect(placeTooltip({ pointer: undefined, frame: FRAME, tip: TIP })).toEqual({ x: 4, y: 4 });
  });
});
