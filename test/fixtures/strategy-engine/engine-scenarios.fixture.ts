// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type EngineCommand,
  type RunParametersInput,
  type RunSetup,
  type SentimentObservation,
  type StrategyConfigInput,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import classicScoreboardRun from './classic-scoreboard.run.json' with { type: 'json' };
import classicScoreboard from './classic-scoreboard.strategy.json' with { type: 'json' };
import type { EngineScenario, ScenarioCommands } from './engine-contract-types.fixture.js';

export const SCENARIO_SYMBOL = 'BTCUSDT';
export const HOUR = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[ENGINE_TIMEFRAME.ONE_HOUR];
export const FIRST_OPEN_TIME = Date.UTC(2026, 0, 1);
export const QUIET_CANDLE = ['100', '101', '99', '100'] as const;
// Volume alto: a participação máxima (1%) só limita onde o cenário quer.
export const DEFAULT_VOLUME = '100000';
// ATR simples de 3 candles: pré-aquecimento de 3 candles, primeira decisão no fechamento do 3º.
const REFERENCE_ATR_PERIOD = 3;
export const WARMUP_LENGTH = 3;

export type CandlePrices = readonly [open: string, high: string, low: string, close: string];
export type CandleSpec = CandlePrices | readonly [...CandlePrices, volume: string];

export function loadClassicScoreboard(): StrategyConfigInput {
  return structuredClone(classicScoreboard) as StrategyConfigInput;
}

export function loadClassicRunParameters(): RunParametersInput {
  return structuredClone(classicScoreboardRun) as RunParametersInput;
}

export function openTimeAt(index: number): number {
  return FIRST_OPEN_TIME + index * HOUR;
}

export function buildCandles(specs: readonly CandleSpec[]): EngineCandle[] {
  return specs.map(([open, high, low, close, volume], index) => {
    const openTime = openTimeAt(index);
    return {
      symbol: SCENARIO_SYMBOL,
      timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
      openTime,
      closeTime: openTime + HOUR - 1,
      open,
      high,
      low,
      close,
      volume: volume ?? DEFAULT_VOLUME,
    };
  });
}

export function buildReferenceStrategy(
  entry: StrategyConfigInput['entry'],
  risk: Partial<NonNullable<StrategyConfigInput['risk']>> = {},
): StrategyVersion {
  const config = loadClassicScoreboard();
  return createStrategyVersion({
    ...config,
    entry,
    risk: { ...config.risk, atrPeriod: REFERENCE_ATR_PERIOD, ...risk },
  });
}

export function buildReferenceRun(overrides: Partial<RunParametersInput> = {}): RunSetup {
  return createRunSetup({ ...loadClassicRunParameters(), ...overrides });
}

export function commandsByIndex(
  entries: readonly (readonly [index: number, commands: readonly EngineCommand[]])[],
): ScenarioCommands {
  return Object.fromEntries(entries.map(([index, commands]) => [openTimeAt(index), commands]));
}

export function command(
  index: number,
  kind: EngineCommand['kind'],
  reason: EngineCommand['reason'],
): EngineCommand {
  return { commandId: `command-${index}-${kind}`, issuedAt: openTimeAt(index), kind, reason };
}

// Observação disponível no fechamento do candle `index` menos `ageHours`.
export function observation(index: number, value: number, ageHours = 0): SentimentObservation {
  return {
    value,
    observedAt: openTimeAt(index) + HOUR - 1 - ageHours * HOUR,
    source: 'alternative.me',
  };
}

const WARMUP: readonly CandlePrices[] = Array.from({ length: WARMUP_LENGTH }, () => QUIET_CANDLE);

// Mercado: entra, sai no stop com o alvo também tocado, entra, sai no stop por gap, entra, sai no alvo.
export const MARKET_SCENARIO_PRICES: readonly CandleSpec[] = [
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
export const LIMIT_SCENARIO_PRICES: readonly CandleSpec[] = [
  ...WARMUP,
  ['100', '101', '99.5', '100'],
  ['100', '101', '99.2', '100'],
  ['100', '100.5', '98.5', '99.5'],
  ['100', '105', '99', '104'],
  ['101', '102', '100.5', '101.5'],
  ['101.5', '102.5', '101', '102'],
  ['102', '103', '101.5', '102.5'],
];

export const LIMIT_ENTRY = { orderType: 'limit', offsetRate: '0.01', expiryCandles: 2 } as const;
export const MARKET_ENTRY = { orderType: 'market' } as const;

export function scenario(
  params: Omit<EngineScenario, 'sentiment' | 'commands' | 'run'> &
    Partial<Pick<EngineScenario, 'sentiment' | 'commands' | 'run'>>,
): EngineScenario {
  return { sentiment: [], commands: {}, run: buildReferenceRun(), ...params };
}
