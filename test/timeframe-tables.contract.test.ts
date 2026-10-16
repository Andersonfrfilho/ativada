// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  CANDLE_TIMEFRAME_DURATION_MILLISECONDS,
  CANDLE_TIMEFRAMES,
  DISPLAY_CANDLE_TIMEFRAMES,
  RUN_CANDLE_TIMEFRAMES,
} from '../packages/database/src/candles/candle.constant.js';
import {
  DISPLAY_TIMEFRAME,
  MARKET_CANDLE_DURATION_MILLISECONDS,
  MARKET_CANDLE_TIMEFRAME,
  TIMEFRAME,
} from '../packages/market-data-crypto/src/index.js';

// O pacote database não depende de market-data; este contrato é o que impede as duas tabelas de divergir.
describe('timeframe tables stay identical across database and market-data', () => {
  test('the stored timeframes are the same set', () => {
    expect([...CANDLE_TIMEFRAMES].sort()).toEqual(Object.values(MARKET_CANDLE_TIMEFRAME).sort());
  });

  test('the run timeframes are the market run timeframes and the display ones are the display set', () => {
    expect([...RUN_CANDLE_TIMEFRAMES].sort()).toEqual(Object.values(TIMEFRAME).sort());
    expect([...DISPLAY_CANDLE_TIMEFRAMES].sort()).toEqual(Object.values(DISPLAY_TIMEFRAME).sort());
  });

  test('the duration of every stored timeframe is the same', () => {
    expect(CANDLE_TIMEFRAME_DURATION_MILLISECONDS).toEqual(MARKET_CANDLE_DURATION_MILLISECONDS);
  });
});
