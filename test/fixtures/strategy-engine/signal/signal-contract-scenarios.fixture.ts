// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineCandle,
  type EngineMarket,
  type SentimentObservation,
  type StrategyConfigInput,
  type StrategyVersion,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  HOUR,
  loadClassicRunParameters,
  openTimeAt,
  type CandleSpec,
} from '../engine-scenarios.fixture.js';

export type SignalScenario = {
  readonly name: string;
  readonly strategy: StrategyVersion;
  readonly market: EngineMarket;
  readonly candles: readonly EngineCandle[];
  readonly sentiment: readonly SentimentObservation[];
};

const LCG_MULTIPLIER = 1_103_515_245;
const LCG_INCREMENT = 12_345;
const LCG_MODULUS = 2_147_483_648;
const START_PRICE = 100;
const PRICE_DECIMALS = 2;
const SENTIMENT_SOURCE = 'alternative.me';

// Gerador congruencial determinístico: o cenário é o mesmo em qualquer máquina.
function createRandom(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return state / LCG_MODULUS;
  };
}

function toPrice(value: number): string {
  return formatEngineDecimal(toEngineDecimal(value.toFixed(PRICE_DECIMALS)));
}

// Passeio com tendência de alta, depois lateral, depois queda: o ADX cruza o limiar nos dois sentidos.
export function buildSyntheticSpecs(params: {
  readonly count: number;
  readonly seed: number;
}): readonly CandleSpec[] {
  const random = createRandom(params.seed);
  const specs: CandleSpec[] = [];
  let close = START_PRICE;
  for (let index = 0; index < params.count; index += 1) {
    const phase = Math.floor((index * 3) / params.count);
    const drift = [0.012, 0, -0.011][phase] ?? 0;
    const open = close;
    close = Math.max(1, open * (1 + drift + (random() - 0.5) * 0.03));
    const high = Math.max(open, close) * (1 + random() * 0.008);
    const low = Math.min(open, close) * (1 - random() * 0.008);
    const volume = 1_000 + Math.floor(random() * 4_000);
    specs.push([toPrice(open), toPrice(high), toPrice(low), toPrice(close), String(volume)]);
  }
  return specs;
}

// Medo extremo, depois ganância, depois nada: a observação envelhece além de 48 h.
function buildSentiment(count: number): readonly SentimentObservation[] {
  const at = (index: number, value: number): SentimentObservation => ({
    value,
    observedAt: openTimeAt(index) + HOUR - 1,
    source: SENTIMENT_SOURCE,
  });
  return [at(Math.floor(count * 0.4), 15), at(Math.floor(count * 0.55), 82)];
}

const FAST_CONFIG: StrategyConfigInput = {
  schemaVersion: 1,
  rules: [
    { id: 'ema-3-5', kind: 'ema_cross', fastPeriod: 3, slowPeriod: 5 },
    { id: 'macd-3-6-3', kind: 'macd', fastPeriod: 3, slowPeriod: 6, signalPeriod: 3 },
    { id: 'donchian-4', kind: 'donchian_breakout', period: 4 },
    { id: 'rsi-4', kind: 'rsi', period: 4, oversold: 30, overbought: 70 },
    { id: 'bollinger-5', kind: 'bollinger', period: 5, deviations: '2' },
    { id: 'obv-ema-3', kind: 'obv_trend', emaPeriod: 3 },
    { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
  ],
  regime: { kind: 'adx', period: 2, trendThreshold: 20 },
  thresholds: { buy: '1.5', sell: '-1.5' },
  risk: { atrPeriod: 3 },
};

const PLAIN_CONFIG: StrategyConfigInput = {
  schemaVersion: 1,
  rules: [
    { id: 'rsi-3', kind: 'rsi', period: 3, oversold: 30, overbought: 70 },
    { id: 'donchian-3', kind: 'donchian_breakout', period: 3 },
  ],
  thresholds: { buy: '1', sell: '-1' },
  risk: { atrPeriod: 2 },
};

function market(): EngineMarket {
  const { parameters } = createRunSetup(loadClassicRunParameters());
  return {
    symbol: parameters.symbol,
    timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
    sentimentSource: parameters.sentimentSource,
  };
}

function scenario(params: {
  readonly name: string;
  readonly config: StrategyConfigInput;
  readonly count: number;
  readonly seed: number;
}): SignalScenario {
  return {
    name: params.name,
    strategy: createStrategyVersion(params.config),
    market: market(),
    candles: buildCandles(buildSyntheticSpecs(params)),
    sentiment: buildSentiment(params.count),
  };
}

// Aquecimento do primeiro: o ADX(2) encadeado e o MACD 3/6/3 pedem 39 candles; sobram 41 decisões.
export function buildSignalScenarios(): readonly SignalScenario[] {
  return [
    scenario({ name: 'all rule kinds with ADX regime', config: FAST_CONFIG, count: 80, seed: 7 }),
    scenario({
      name: 'two rules without regime filter',
      config: PLAIN_CONFIG,
      count: 40,
      seed: 11,
    }),
  ];
}
