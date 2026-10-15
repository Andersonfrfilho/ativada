// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { judgeAgainstCoinFlip } from '../packages/statistics/src/index.js';
import type { EngineCandle, EngineMarket } from '../packages/strategy-engine/src/index.js';
import { parseAuditorGolden } from './fixtures/risk-analyst/auditor-golden.fixture.js';
import { AUDITOR_GOLDEN_15M } from './fixtures/risk-analyst/auditor-golden-15m.fixture.js';
import { summarizeAuditor } from './fixtures/risk-analyst/auditor-oracle.fixture.js';
import slice from './fixtures/risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };
import fearGreedRows from './fixtures/risk-analyst/market/btcusdt-15m-3300.fear-greed.json' with { type: 'json' };
import {
  buildRealAuditorSeries,
  type FearGreedDay,
} from './fixtures/risk-analyst/real-series.fixture.js';
import { AUDITED_KEYS } from './fixtures/risk-analyst/specialist-dataset.fixture.js';

// T0.2 da spec 007: o recorte REAL de 15 min (BTCUSDT, 3.300 velas do banco de dev) repete o dourado do auditor, e o
// Wilson único concorda com o oráculo em cada linha. Nada aqui lê o banco: o recorte mora nos fixtures.

const FIFTEEN_MINUTES = 900_000;
const SLICE_NAME = 'btcusdt-15m-3300';
const WINDOWS = [2880, 96] as const;
const MARKET: EngineMarket = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  sentimentSource: 'alternative.me',
};

type SliceRow = readonly [number, string, string, string, string, string, number];

const candles: EngineCandle[] = (slice as unknown as SliceRow[]).map(
  ([openTime, open, high, low, close, volume, closeTime]) => ({
    symbol: MARKET.symbol,
    timeframe: MARKET.timeframe,
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume,
  }),
);
const fearGreed: FearGreedDay[] = (fearGreedRows as [number, number][]).map(
  ([observedAt, value]) => ({ observedAt, value }),
);
const lastOpenTime = candles.at(-1)?.openTime ?? 0;

describe('recorte real de 15 min', () => {
  test('3.300 velas contíguas na grade de 15 min e sentimento em ordem', () => {
    expect(candles).toHaveLength(3300);
    for (const [index, candle] of candles.entries()) {
      expect(candle.openTime).toBe((candles[0]?.openTime ?? 0) + index * FIFTEEN_MINUTES);
      expect(candle.closeTime).toBe(candle.openTime + FIFTEEN_MINUTES - 1);
    }
    const times = fearGreed.map((day) => day.observedAt);
    expect(times).toStrictEqual([...times].sort((a, b) => a - b));
  });

  for (const key of AUDITED_KEYS) {
    const series = buildRealAuditorSeries({ candles, market: MARKET, key, fearGreed });
    for (const windowCandles of WINDOWS) {
      const goldenKey = `${SLICE_NAME}:${key}:${windowCandles}`;
      test(goldenKey, () => {
        const golden = AUDITOR_GOLDEN_15M[goldenKey];
        if (golden === undefined) throw new Error(`sem dourado para ${goldenKey}`);
        const summary = summarizeAuditor(series, {
          decisionTime: lastOpenTime,
          timeframeMilliseconds: FIFTEEN_MINUTES,
          windowCandles,
        });
        expect(summary).toStrictEqual(parseAuditorGolden(golden));
        const shared = judgeAgainstCoinFlip({ hits: summary.hits, counted: summary.counted });
        expect(shared.verdict).toBe(summary.verdict);
      });
    }
  }

  test('cortar a série no meio dá a mesma contagem (sem olhar o futuro)', () => {
    const cut = 2000;
    const head = candles.slice(0, cut);
    const full = buildRealAuditorSeries({ candles, market: MARKET, key: 'trend', fearGreed });
    const partial = buildRealAuditorSeries({
      candles: head,
      market: MARKET,
      key: 'trend',
      fearGreed,
    });
    expect(full.slice(0, cut)).toStrictEqual(partial);
  });
});
