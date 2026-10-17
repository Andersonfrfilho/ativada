// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  describePositionDistance,
  type OpenPosition,
} from '../src/runs/candle-chart/position-distance.js';

const POSITION: OpenPosition = {
  entryPrice: '100',
  quantity: '1',
  targetPrice: '110',
  stopPrice: '95',
  openedCandleTime: 1_000,
};

describe('distância da vela até o alvo e a proteção', () => {
  test('alvo acima e proteção abaixo, em valor e em porcentagem do fechamento', () => {
    const rows = describePositionDistance(POSITION, { openTime: 2_000, close: '100' });
    expect(rows).toEqual([
      { label: 'Até o alvo', value: '+10,00 · +10,00%' },
      { label: 'Até a proteção', value: '-5,00 · -5,00%' },
    ]);
  });

  test('a porcentagem arredonda para baixo e não passa por Number', () => {
    const rows = describePositionDistance(
      { ...POSITION, targetPrice: '4', stopPrice: '2' },
      { openTime: 2_000, close: '3' },
    );
    expect(rows[0]?.value).toBe('+1,00 · +33,33%');
    expect(rows[1]?.value).toBe('-1,00 · -33,34%');
  });

  test('sem posição, antes de a posição abrir ou com fechamento ilegível, nada', () => {
    expect(describePositionDistance(undefined, { openTime: 2_000, close: '100' })).toEqual([]);
    expect(describePositionDistance(POSITION, { openTime: 999, close: '100' })).toEqual([]);
    expect(describePositionDistance(POSITION, { openTime: 2_000, close: 'x' })).toEqual([]);
    expect(describePositionDistance(POSITION, { openTime: 2_000, close: '0' })).toEqual([]);
  });
});
