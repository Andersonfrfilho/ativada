// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunWalkForwardParams } from '../../../apps/api-ativada/src/walk-forward/walk-forward.types.js';
import type {
  EngineCandle,
  StrategyConfigInput,
} from '../../../packages/strategy-engine/src/index.js';
import { buildDailyCandles, DAY_MILLISECONDS } from './daily-candles.fixture.js';
import {
  createInMemoryWalkForward,
  type InMemoryWalkForward,
  type WalkForwardHooks,
  type WalkForwardScenario,
} from './in-memory-walk-forward-database.fixture.js';

export const SCENARIO_START = Date.UTC(2023, 0, 1);
// 14 meses: com 6/2/2 cabem exatamente 4 janelas.
export const SCENARIO_END = Date.UTC(2024, 2, 1);
const WARM_UP_DAYS = 300;
const SCENARIO_DAYS = Math.round((SCENARIO_END - SCENARIO_START) / DAY_MILLISECONDS);

export const SHORT_STRATEGY: StrategyConfigInput = {
  schemaVersion: 1,
  rules: [
    { id: 'ema-cross', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 15 },
    { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 40, overbought: 60 },
  ],
  regime: { kind: 'none' },
  thresholds: { buy: '1', sell: '-1' },
  entry: { orderType: 'market' },
  risk: { atrPeriod: 14 },
};

export const SCENARIO_GRID = {
  parameters: [
    { path: 'rules.ema-cross.fastPeriod', values: [3, 5, 8] },
    { path: 'rules.ema-cross.slowPeriod', values: [15, 25] },
    { path: 'thresholds.buy', values: ['1', '1.5'] },
  ],
} as const;

export const SCENARIO_OPTIONS = {
  grid: SCENARIO_GRID,
  minTradesPerWindow: 2,
} as const;

export type BuiltScenario = {
  readonly memory: InMemoryWalkForward;
  readonly params: (overrides?: Partial<RunWalkForwardParams['options']>) => RunWalkForwardParams;
};

export type ScenarioParams = {
  readonly seed?: number;
  readonly driftBasisPoints?: number;
  readonly hooks?: WalkForwardHooks;
  readonly kind?: string;
  readonly tamper?: 'run_hash' | 'config_hash';
  readonly request?: WalkForwardScenario['request'];
  readonly warmUpDays?: number;
  readonly periodEnd?: number;
  readonly candleCount?: number;
  // Multiplica os preços dos candles a partir deste instante (para provar que o ajuste não os enxerga).
  readonly alterFrom?: number;
  // Remove `count` candles a partir deste instante: uma lacuna no meio da série.
  readonly hole?: { readonly from: number; readonly count: number };
};

const ALTER_FACTOR = 1.5;

function alterPrice(text: string): string {
  return (Number(text) * ALTER_FACTOR).toFixed(8);
}

function shapeCandles(candles: readonly EngineCandle[], params: ScenarioParams): EngineCandle[] {
  const { alterFrom, hole } = params;
  return candles
    .filter(
      (candle) =>
        hole === undefined ||
        candle.openTime < hole.from ||
        candle.openTime >= hole.from + hole.count * DAY_MILLISECONDS,
    )
    .map((candle) =>
      alterFrom !== undefined && candle.openTime >= alterFrom
        ? {
            ...candle,
            open: alterPrice(candle.open),
            high: alterPrice(candle.high),
            low: alterPrice(candle.low),
            close: alterPrice(candle.close),
          }
        : candle,
    );
}

export function buildWalkForwardScenario(params: ScenarioParams = {}): BuiltScenario {
  const warmUpDays = params.warmUpDays ?? WARM_UP_DAYS;
  const candles = buildDailyCandles({
    count: params.candleCount ?? warmUpDays + SCENARIO_DAYS,
    seed: params.seed ?? 20_261_017,
    firstOpenTime: SCENARIO_START - warmUpDays * DAY_MILLISECONDS,
    driftBasisPoints: params.driftBasisPoints ?? 0,
  });
  const memory = createInMemoryWalkForward({
    candles: shapeCandles(candles, params),
    strategyConfig: SHORT_STRATEGY,
    runParameters: {
      schemaVersion: 1,
      symbol: 'BTCUSDT',
      timeframe: '1d',
      sentimentSource: 'fixture',
    },
    periodStart: SCENARIO_START,
    periodEnd: params.periodEnd ?? SCENARIO_END,
    ...(params.hooks === undefined ? {} : { hooks: params.hooks }),
    ...(params.kind === undefined ? {} : { kind: params.kind }),
    ...(params.tamper === undefined ? {} : { tamper: params.tamper }),
    ...(params.request === undefined ? {} : { request: params.request }),
  });
  return {
    memory,
    params: (overrides = {}) => ({
      database: memory.database,
      runId: memory.runId,
      options: {
        ...SCENARIO_OPTIONS,
        now: () => SCENARIO_END + 400 * DAY_MILLISECONDS,
        ...overrides,
      },
    }),
  };
}
