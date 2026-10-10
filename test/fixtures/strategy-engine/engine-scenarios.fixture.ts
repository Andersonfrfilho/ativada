// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategyVersion,
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type StrategyConfigInput,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import classicScoreboard from './classic-scoreboard.strategy.json' with { type: 'json' };
import { ENGINE_EVENT_KIND, type EngineScenario } from './engine-contract-types.fixture.js';

export const SCENARIO_SYMBOL = 'BTCUSDT';
const HOUR = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[ENGINE_TIMEFRAME.ONE_HOUR];
const FIRST_OPEN_TIME = Date.UTC(2026, 0, 1);
const QUIET_CANDLE = ['100', '101', '99', '100'] as const;
// ATR de 3 candles: pré-aquecimento de 9 candles (3 × 3), primeira decisão no fechamento do 9º.
const REFERENCE_ATR_PERIOD = 3;
const WARMUP_LENGTH = 9;

export type CandlePrices = readonly [open: string, high: string, low: string, close: string];

export function loadClassicScoreboard(): StrategyConfigInput {
  return structuredClone(classicScoreboard) as StrategyConfigInput;
}

export function buildCandles(prices: readonly CandlePrices[]): EngineCandle[] {
  return prices.map(([open, high, low, close], index) => {
    const openTime = FIRST_OPEN_TIME + index * HOUR;
    return {
      symbol: SCENARIO_SYMBOL,
      timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
      openTime,
      closeTime: openTime + HOUR - 1,
      open,
      high,
      low,
      close,
      volume: '10',
    };
  });
}

export function buildReferenceStrategy(entry: StrategyConfigInput['entry']): StrategyVersion {
  const config = loadClassicScoreboard();
  return createStrategyVersion({
    ...config,
    entry,
    risk: { ...config.risk, atrPeriod: REFERENCE_ATR_PERIOD },
  });
}

const WARMUP: readonly CandlePrices[] = Array.from({ length: WARMUP_LENGTH }, () => QUIET_CANDLE);

// Mercado: entra, sai no stop com o alvo também tocado, entra, sai no stop por gap, entra, sai no alvo.
export const MARKET_SCENARIO_PRICES: readonly CandlePrices[] = [
  ...WARMUP,
  QUIET_CANDLE,
  ['100', '107', '95', '100'],
  QUIET_CANDLE,
  ['85', '86', '84', '85'],
  ['85', '86', '84', '85'],
  ['85', '116', '84', '110'],
  ['110', '111', '109', '110'],
  ['110', '111', '109', '110'],
];

// Limitada a 1% abaixo do fechamento, validade de 2 candles: expira, preenche no meio, sai no alvo,
// preenche na abertura por gap.
export const LIMIT_SCENARIO_PRICES: readonly CandlePrices[] = [
  ...WARMUP,
  ['100', '101', '99.5', '100'],
  ['100', '101', '99.2', '100'],
  ['100', '100.5', '98.5', '99.5'],
  ['100', '105', '99', '104'],
  ['101', '102', '100.5', '101.5'],
  ['101.5', '102.5', '101', '102'],
  ['102', '103', '101.5', '102.5'],
];

export function buildReferenceScenarios(): EngineScenario[] {
  return [
    {
      name: 'market-entries-with-stop-gap-and-target',
      strategy: buildReferenceStrategy({ orderType: 'market' }),
      candles: buildCandles(MARKET_SCENARIO_PRICES),
      requiredEvents: [
        ENGINE_EVENT_KIND.MARKET_ENTRY_FILL,
        ENGINE_EVENT_KIND.STOP_EXIT_WITH_TARGET_TOUCHED,
        ENGINE_EVENT_KIND.STOP_EXIT_ON_GAP,
        ENGINE_EVENT_KIND.TARGET_EXIT,
        ENGINE_EVENT_KIND.BUY_SIGNAL_WHILE_POSITION_OPEN,
      ],
    },
    {
      name: 'limit-entries-with-expiry-and-gap',
      strategy: buildReferenceStrategy({
        orderType: 'limit',
        offsetRate: '0.01',
        expiryCandles: 2,
      }),
      candles: buildCandles(LIMIT_SCENARIO_PRICES),
      requiredEvents: [
        ENGINE_EVENT_KIND.LIMIT_EXPIRED,
        ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_INTRA_CANDLE,
        ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_AT_OPEN,
        ENGINE_EVENT_KIND.TARGET_EXIT,
      ],
    },
  ];
}
