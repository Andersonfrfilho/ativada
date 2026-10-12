// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  CANDLE_TIMEFRAME_DURATION_MILLISECONDS,
  CANDLE_TIMEFRAMES,
} from '../packages/database/src/candles/candle.constant.js';
import {
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
} from '../packages/market-data-crypto/src/index.js';

// O pacote database não depende de market-data; este contrato é o que impede as duas tabelas de divergir.
describe('timeframe tables stay identical across database and market-data', () => {
  test('the timeframes are the same set', () => {
    expect([...CANDLE_TIMEFRAMES].sort()).toEqual(Object.values(TIMEFRAME).sort());
  });

  test('the duration of every timeframe is the same', () => {
    expect(CANDLE_TIMEFRAME_DURATION_MILLISECONDS).toEqual(TIMEFRAME_DURATION_MILLISECONDS);
  });
});
