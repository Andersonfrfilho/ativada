// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createRunRequestSchema } from '../apps/api-ativada/src/runs/create-run-request.schema.js';
import { RUN_TIMEFRAMES } from '../packages/database/src/runs/run.constant.js';
import { DEFAULT_MARKET_TIMEFRAMES } from '../packages/market-data-crypto/src/market-data.constant.js';
import {
  DISPLAY_TIMEFRAME,
  marketEnvironmentShape,
  TIMEFRAME,
} from '../packages/market-data-crypto/src/index.js';
import { ENGINE_TIMEFRAME } from '../packages/strategy-engine/src/index.js';
import {
  createRunsHarness,
  buildHourlyCandles,
  readJson,
  SUBJECT_A,
  type RunsHarness,
  type SeededStrategy,
} from './fixtures/api-routes/runs-harness.fixture.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
// Quem decide, simula ou avalia nunca lê vela de exibição (spec 017, RNF01).
const GUARDED_DIRECTORIES: readonly string[] = [
  'packages/strategy-engine/src',
  'packages/run-recording/src',
  'packages/risk-analyst/src',
  'apps/worker-ativada/src/live',
  'apps/api-ativada/src/backtest',
  'apps/api-ativada/src/walk-forward',
  'apps/api-ativada/src/goals',
  'apps/api-ativada/src/horizons',
];
const DISPLAY_NAME_PATTERN =
  /\b(DISPLAY_TIMEFRAME|DisplayTimeframe|isDisplayTimeframe|MARKET_CANDLE_TIMEFRAME|MarketCandleTimeframe|MARKET_DISPLAY_TIMEFRAMES|DISPLAY_CANDLE_TIMEFRAMES|StoredCandleTimeframe)\b/;
const DISPLAY_SAMPLES: readonly string[] = [
  "import { DISPLAY_TIMEFRAME } from '@ativada/market-data-crypto';",
  'const frames = environment.MARKET_DISPLAY_TIMEFRAMES;',
  'if (isDisplayTimeframe(value)) return;',
  'type Frame = MarketCandleTimeframe;',
  'readonly timeframe: StoredCandleTimeframe;',
];
const SERIES_BINDINGS: readonly { readonly path: string; readonly binding: RegExp }[] = [
  {
    path: 'apps/worker-ativada/src/live/create-live-run-database.ts',
    binding: /isCandleTimeframe\(run\.timeframe\)[\s\S]*timeframe: run\.timeframe/,
  },
  {
    path: 'apps/api-ativada/src/backtest/create-backtest-database.ts',
    binding: /isCandleTimeframe\(run\.timeframe\)[\s\S]*timeframe: run\.timeframe/,
  },
  {
    path: 'apps/api-ativada/src/walk-forward/create-walk-forward-database.ts',
    binding: /isCandleTimeframe\(run\.timeframe\)[\s\S]*timeframe: run\.timeframe/,
  },
];

function intersection(first: readonly string[], second: readonly string[]): readonly string[] {
  return first.filter((value) => second.includes(value));
}

async function readGuardedSources(): Promise<readonly { path: string; text: string }[]> {
  const sources: { path: string; text: string }[] = [];
  for (const directory of GUARDED_DIRECTORIES) {
    for await (const relativePath of new Bun.Glob('**/*.ts').scan({
      cwd: `${REPOSITORY_ROOT}${directory}`,
    })) {
      const path = `${directory}/${relativePath}`;
      sources.push({ path, text: await Bun.file(`${REPOSITORY_ROOT}${path}`).text() });
    }
  }
  return sources;
}

const DISPLAY_FRAMES: readonly string[] = Object.values(DISPLAY_TIMEFRAME);

describe('display timeframes never become run timeframes', () => {
  test('no list the engine or the runs use contains a display timeframe', () => {
    expect(DISPLAY_FRAMES.length).toBeGreaterThan(0);
    expect(intersection(DISPLAY_FRAMES, Object.values(TIMEFRAME))).toStrictEqual([]);
    expect(intersection(DISPLAY_FRAMES, Object.values(ENGINE_TIMEFRAME))).toStrictEqual([]);
    expect(intersection(DISPLAY_FRAMES, RUN_TIMEFRAMES)).toStrictEqual([]);
    expect(intersection(DISPLAY_FRAMES, DEFAULT_MARKET_TIMEFRAMES.split(','))).toStrictEqual([]);
  });

  test('MARKET_TIMEFRAMES (the execution list) refuses a display timeframe', () => {
    for (const frame of DISPLAY_FRAMES) {
      expect(marketEnvironmentShape.MARKET_TIMEFRAMES.safeParse(frame).success).toBe(false);
      expect(marketEnvironmentShape.MARKET_TIMEFRAMES.safeParse(`15m,${frame}`).success).toBe(
        false,
      );
    }
    expect(marketEnvironmentShape.MARKET_DISPLAY_TIMEFRAMES.safeParse('15m').success).toBe(false);
    expect(marketEnvironmentShape.MARKET_DISPLAY_TIMEFRAMES.safeParse('3m').success).toBe(true);
  });

  test('the display environment defaults to nothing and accepts an empty list', () => {
    expect(marketEnvironmentShape.MARKET_DISPLAY_TIMEFRAMES.parse(undefined)).toStrictEqual([]);
    expect(marketEnvironmentShape.MARKET_DISPLAY_TIMEFRAMES.parse('')).toStrictEqual([]);
    expect(marketEnvironmentShape.MARKET_DISPLAY_TIMEFRAMES.parse('3m')).toStrictEqual(['3m']);
  });
});

describe('the sources that decide, simulate or evaluate never name display timeframes', () => {
  test('the probe flags every forbidden sample', () => {
    const missed = DISPLAY_SAMPLES.filter((sample) => !DISPLAY_NAME_PATTERN.test(sample));
    expect(missed).toStrictEqual([]);
    expect(DISPLAY_NAME_PATTERN.test('const total = candles.length;')).toBe(false);
  });

  test('no guarded module references them', async () => {
    const sources = await readGuardedSources();
    expect(sources.length).toBeGreaterThan(50);
    const offending = sources.filter(({ text }) => DISPLAY_NAME_PATTERN.test(text));
    expect(offending.map(({ path }) => path)).toStrictEqual([]);
  });

  test('every run series is bound to the run timeframe behind the engine guard', async () => {
    for (const { path, binding } of SERIES_BINDINGS) {
      const text = await Bun.file(`${REPOSITORY_ROOT}${path}`).text();
      expect(binding.test(text)).toBe(true);
    }
    expect(SERIES_BINDINGS[0]?.binding.test('const series = { timeframe: "3m" };')).toBe(false);
  });
});

describe('the run request schema', () => {
  const body = {
    strategyVersionId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d11',
    kind: 'backtest',
    symbol: 'BTCUSDT',
    periodStart: Date.UTC(2026, 0, 1),
    periodEnd: Date.UTC(2026, 0, 2),
  };

  test('refuses a display timeframe even when someone enabled it by mistake', () => {
    const schema = createRunRequestSchema({ symbols: ['BTCUSDT'], timeframes: ['15m', '3m'] });
    expect(schema.safeParse({ ...body, timeframe: '15m' }).success).toBe(true);
    expect(schema.safeParse({ ...body, timeframe: '3m' }).success).toBe(false);
  });
});

describe('POST /v1/runs refuses display timeframes', () => {
  let harness: RunsHarness;
  let seeded: SeededStrategy;

  beforeAll(async () => {
    harness = await createRunsHarness({
      candles: buildHourlyCandles({
        symbol: 'BTCUSDT',
        count: 4,
        firstOpenTime: Date.UTC(2026, 0, 1),
      }),
      displayTimeframes: DISPLAY_FRAMES,
    });
    seeded = await harness.seedStrategy(SUBJECT_A, 'boundary');
  });

  afterAll(async () => {
    await harness.stop();
  });

  test.each(['backtest', 'live_paper'])('%s with 3m is a 400 on timeframe', async (kind) => {
    const body = {
      strategyVersionId: seeded.versionId,
      kind,
      symbol: 'BTCUSDT',
      timeframe: '3m',
      ...(kind === 'backtest'
        ? { periodStart: Date.UTC(2026, 0, 1), periodEnd: Date.UTC(2026, 0, 2) }
        : {}),
    };
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: '/v1/runs',
      body,
    });
    const parsed = await readJson(response);
    expect(parsed.status).toBe(400);
    const details = (parsed.body as { error: { details?: { field: string }[] } }).error.details;
    expect((details ?? []).map((detail) => detail.field)).toContain('timeframe');
  });
});
