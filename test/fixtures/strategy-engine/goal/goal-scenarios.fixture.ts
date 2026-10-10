// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategyVersion,
  type EngineCandle,
  type RunSetup,
  type SentimentObservation,
  type StrategyVersion,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  buildSyntheticCandles,
  createSeededRandom,
} from '../../backtest/synthetic-candles.fixture.js';
import { buildReferenceRun } from '../engine-scenarios.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
  type RealDataset,
} from '../signal/classic-signals.fixture.js';

export type GoalScenario = {
  readonly name: string;
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly sentiments?: readonly (SentimentObservation | undefined)[] | undefined;
};

// Reage rápido (médias curtas, RSI de 7, risco de 5% por operação com stop de 1× e alvo de 1,5× o ATR): opera muito
// nas séries curtas dos testes e fecha operações por stop e por alvo dentro do prazo.
export const FAST_STRATEGY: StrategyVersion = createStrategyVersion({
  schemaVersion: 1,
  rules: [
    { id: 'ema-3-8', kind: 'ema_cross', fastPeriod: 3, slowPeriod: 8 },
    { id: 'rsi-7', kind: 'rsi', period: 7, oversold: 40, overbought: 60 },
  ],
  thresholds: { buy: '1', sell: '-1' },
  risk: {
    atrPeriod: 5,
    stopAtrMultiple: '1',
    targetAtrMultiple: '1.5',
    riskPerTrade: '0.05',
    maxExposureRate: '1',
  },
});

// Médias curtas mais o medo e a ganância do Fear & Greed: sem o sentimento, esta estratégia opera diferente.
export const SENTIMENT_STRATEGY: StrategyVersion = createStrategyVersion({
  schemaVersion: 1,
  rules: [
    { id: 'ema-3-8', kind: 'ema_cross', fastPeriod: 3, slowPeriod: 8 },
    { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 40, greedAtOrAbove: 60 },
  ],
  thresholds: { buy: '2', sell: '-2' },
  risk: {
    atrPeriod: 5,
    stopAtrMultiple: '1',
    targetAtrMultiple: '1.5',
    riskPerTrade: '0.05',
    maxExposureRate: '1',
  },
});

// Nunca compra: um voto de peso 1 não alcança o limiar 3.
export const NEVER_BUYS_STRATEGY: StrategyVersion = createStrategyVersion({
  schemaVersion: 1,
  rules: [{ id: 'ema-3-8', kind: 'ema_cross', fastPeriod: 3, slowPeriod: 8 }],
  thresholds: { buy: '3', sell: '-3' },
});

export function scenarioOf(params: {
  readonly name: string;
  readonly strategy: StrategyVersion;
  readonly candles: readonly EngineCandle[];
}): GoalScenario {
  const [first] = params.candles;
  if (first === undefined) throw new Error('Série vazia.');
  const run = buildReferenceRun({ symbol: first.symbol, timeframe: first.timeframe });
  return { ...params, run };
}

export function realScenario(dataset: RealDataset, strategy: StrategyVersion): GoalScenario {
  return scenarioOf({ name: dataset.name, strategy, candles: dataset.candles });
}

export const REAL_SCENARIOS: readonly GoalScenario[] = REAL_DATASETS.map((dataset) =>
  realScenario(dataset, CLASSIC_STRATEGY),
);

export function syntheticScenario(params: {
  readonly seed: number;
  readonly count: number;
  readonly strategy: StrategyVersion;
}): GoalScenario {
  const candles = buildSyntheticCandles({
    count: params.count,
    seed: params.seed,
    firstOpenTime: Date.UTC(2024, 0, 1),
  });
  return scenarioOf({ name: `sintética ${params.seed}`, strategy: params.strategy, candles });
}

// Um valor de 0 a 100 por candle, disponível uma hora antes do fechamento (semente fixa: a mesma série sempre).
export function sentimentScenario(params: {
  readonly seed: number;
  readonly count: number;
}): GoalScenario {
  const base = syntheticScenario({ ...params, strategy: SENTIMENT_STRATEGY });
  const random = createSeededRandom(params.seed + 1);
  const sentiments = base.candles.map((candle): SentimentObservation => ({
    value: Math.floor(random() * 101),
    observedAt: candle.closeTime - 3_600_000,
    source: base.run.parameters.sentimentSource,
  }));
  return { ...base, name: `sentimento ${params.seed}`, sentiments };
}

// Gaps de baixa seguidos de queda (a cada 37 candles a abertura cai 8% e o candle ainda fecha 5% abaixo dela): o
// comprar e segurar compra a um preço bem abaixo do fechamento do candle anterior, e a janela que o ignora erraria
// o alvo logo no primeiro candle (a compra a esse preço "valeria" +8% ali) em vez de bater a perda máxima depois.
export function gapDownScenario(params: {
  readonly seed: number;
  readonly count: number;
  readonly strategy: StrategyVersion;
}): GoalScenario {
  const base = syntheticScenario(params);
  const candles = base.candles.map((candle, index): EngineCandle => {
    if (index % 37 !== 5) return candle;
    const open = Math.round(Number(candle.open) * 0.92 * 100) / 100;
    const close = Math.round(open * 0.95 * 100) / 100;
    return {
      ...candle,
      open: String(open),
      close: String(close),
      low: String(Math.min(Number(candle.low), close)),
    };
  });
  return { ...base, name: `gap de baixa ${params.seed}`, candles };
}
