// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  buildStoredReadings,
  STORED_READINGS_STATUS,
  type StoredSignalReadings,
} from '../apps/api-ativada/src/runs/live-status/stored-readings.js';
import {
  computeLatestTriggers,
  computeNextTriggers,
  createStrategySignalState,
  createStrategyVersion,
  EngineDecimal,
  RULE_KIND,
  signalStep,
  type SentimentObservation,
  type SignalDecision,
  type StrategyConfigInput,
  type StrategyVersion,
} from '../packages/strategy-engine/src/index.js';
import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import {
  FAST_STRATEGY,
  realScenario,
  type GoalScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

// Paridade da spec 008 (ADR 0002, "Acompanhamento ao vivo (spec 008)", L3): os gatilhos montados com as leituras
// GRAVADAS em `signals` (a última linha e a anterior) são idênticos aos de `computeLatestTriggers`, que reexecuta o
// sinal sobre a série inteira, em toda vela decidida dos dois conjuntos reais, para cada estratégia e os dois estados.

const STATES = ['awaiting_entry', 'holding'] as const;
const HOUR_MILLISECONDS = 3_600_000;
const STALE_MILLISECONDS = 49 * HOUR_MILLISECONDS;
const ADX_REGIME = {
  kind: 'adx',
  period: 14,
  trendThreshold: 25,
  weights: {
    trending: { trend: '1.5', reversion: '0.5', volume: '1', sentiment: '1' },
    ranging: { trend: '0.5', reversion: '1.5', volume: '1', sentiment: '1' },
  },
} as const;
const RISK = {
  atrPeriod: 14,
  stopAtrMultiple: '2',
  targetAtrMultiple: '3',
  riskPerTrade: '0.01',
  maxExposureRate: '1',
} as const;

function strategyOf(config: Omit<StrategyConfigInput, 'schemaVersion'>): StrategyVersion {
  return createStrategyVersion({ schemaVersion: 1, ...config });
}

const STRATEGIES: readonly (readonly [string, StrategyVersion])[] = [
  ['Placar clássico (EMA, MACD, RSI, OBV, regime ADX)', CLASSIC_STRATEGY],
  ['Rápida (EMA 3×8, RSI 7)', FAST_STRATEGY],
  [
    'Donchian e Bollinger sem regime',
    strategyOf({
      rules: [
        { id: 'donchian-20', kind: 'donchian_breakout', period: 20 },
        { id: 'bollinger-20', kind: 'bollinger', period: 20, deviations: '2' },
      ],
      thresholds: { buy: '1', sell: '-1' },
      risk: RISK,
    }),
  ],
  [
    'Fear & Greed, EMA e MACD com regime ADX',
    strategyOf({
      rules: [
        { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 30, greedAtOrAbove: 70 },
        { id: 'ema-5-13', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 13 },
        { id: 'macd-12-26-9', kind: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      ],
      regime: ADX_REGIME,
      thresholds: { buy: '1', sell: '-1' },
      risk: RISK,
    }),
  ],
  [
    'As sete regras com regime ADX',
    strategyOf({
      rules: [
        { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 },
        { id: 'macd-8-21-5', kind: 'macd', fastPeriod: 8, slowPeriod: 21, signalPeriod: 5 },
        { id: 'donchian-10', kind: 'donchian_breakout', period: 10 },
        { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 35, overbought: 65 },
        { id: 'bollinger-14', kind: 'bollinger', period: 14, deviations: '1.5' },
        { id: 'obv-ema-10', kind: 'obv_trend', emaPeriod: 10 },
        { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
      ],
      regime: ADX_REGIME,
      thresholds: { buy: '1.5', sell: '-1.5' },
      risk: RISK,
    }),
  ],
];

// Uma observação por vela, disponível 1 h antes do fechamento; algumas faltam, envelhecem (> 48 h) ou são de outra fonte.
function buildSentiments(scenario: GoalScenario): readonly (SentimentObservation | undefined)[] {
  const random = createSeededRandom(2026);
  const source = scenario.run.parameters.sentimentSource;
  return scenario.candles.map((candle, index): SentimentObservation | undefined => {
    const value = Math.floor(random() * 101);
    if (index % 7 === 3) return undefined;
    const age = index % 11 === 5 ? STALE_MILLISECONDS : HOUR_MILLISECONDS;
    return {
      value,
      observedAt: candle.closeTime - age,
      source: index % 13 === 4 ? 'outra-fonte' : source,
    };
  });
}

// O que o Postgres devolve de um número em jsonb: guarda o `numeric` e o reescreve sem expoente (1e-7 → 0.0000001).
function replaceWithNumericText(_key: string, value: unknown): unknown {
  return typeof value === 'number' ? Number(new EngineDecimal(String(value)).toFixed()) : value;
}

// A linha como `mapSignal` grava e o repositório lê de volta.
function storedRowOf(signal: SignalDecision): StoredSignalReadings {
  const written = JSON.stringify({
    indicators: signal.indicators,
    sentimentObservation: signal.sentiment ?? null,
  });
  return JSON.parse(written, replaceWithNumericText) as StoredSignalReadings;
}

type ParityTally = { decided: number; compared: number; needsPrevious: number };

function checkScenario(scenario: GoalScenario, tally: ParityTally): void {
  const { strategy, run, candles } = scenario;
  const sentiments = buildSentiments(scenario);
  const hasDonchian = strategy.config.rules.some(
    (rule) => rule.kind === RULE_KIND.DONCHIAN_BREAKOUT,
  );
  let state = createStrategySignalState(strategy.config);
  let previousRow: StoredSignalReadings | undefined;
  for (const [index, candle] of candles.entries()) {
    const stepped = signalStep({
      strategy,
      market: run.parameters,
      state,
      candle,
      sentiment: sentiments[index],
    });
    state = stepped.state;
    if (stepped.signal === null) continue;
    tally.decided += 1;
    const row = storedRowOf(stepped.signal);
    const stored = buildStoredReadings({
      config: strategy.config,
      latest: row,
      previous: previousRow,
    });
    previousRow = row;
    if (stored.status === STORED_READINGS_STATUS.NEEDS_PREVIOUS) {
      expect(hasDonchian && tally.decided === 1).toBe(true);
      tally.needsPrevious += 1;
      continue;
    }
    for (const triggerState of STATES) {
      const reference = computeLatestTriggers({
        strategy,
        run,
        candles: candles.slice(0, index + 1),
        sentiments: sentiments.slice(0, index + 1),
        state: triggerState,
      });
      const fromStored = computeNextTriggers({
        config: strategy.config,
        readings: stored.readings,
        close: candle.close,
        closeTime: candle.closeTime,
        sentiment: stored.sentiment,
        sentimentSource: run.parameters.sentimentSource,
        state: triggerState,
      });
      if (reference === null) throw new Error(`Sem sinal recalculado na vela ${index}.`);
      expect(reference.signal).toStrictEqual(stepped.signal);
      expect(fromStored).toStrictEqual(reference.triggers);
      tally.compared += 1;
    }
  }
}

describe('gatilhos das leituras gravadas = gatilhos recalculados sobre a série (paridade, D3)', () => {
  const totals: ParityTally = { decided: 0, compared: 0, needsPrevious: 0 };
  for (const dataset of REAL_DATASETS) {
    for (const [name, strategy] of STRATEGIES) {
      test(`${dataset.name} · ${name}`, () => {
        const tally: ParityTally = { decided: 0, compared: 0, needsPrevious: 0 };
        checkScenario(realScenario(dataset, strategy), tally);
        expect(tally.decided).toBeGreaterThan(100);
        expect(tally.compared).toBe((tally.decided - tally.needsPrevious) * STATES.length);
        totals.decided += tally.decided;
        totals.compared += tally.compared;
        totals.needsPrevious += tally.needsPrevious;
      });
    }
  }

  test('o total cobre as velas decididas dos dois conjuntos e só a primeira decisão com Donchian espera a anterior', () => {
    expect(totals.needsPrevious).toBe(4);
    expect(totals.compared).toBe((totals.decided - totals.needsPrevious) * STATES.length);
    process.stdout.write(
      `paridade: ${totals.decided} velas decididas, ${totals.compared} comparações, ${totals.needsPrevious} sem a linha anterior\n`,
    );
  });

  test('sem a linha anterior, só a estratégia com Donchian espera; as demais já respondem', () => {
    const row: StoredSignalReadings = {
      indicators: { 'rule:ema-3-8.fast': 1 },
      sentimentObservation: null,
    };
    expect(
      buildStoredReadings({ config: FAST_STRATEGY.config, latest: row, previous: undefined })
        .status,
    ).toBe(STORED_READINGS_STATUS.READY);
    const donchian = STRATEGIES[2]?.[1];
    if (donchian === undefined) throw new Error('Estratégia de Donchian ausente.');
    expect(
      buildStoredReadings({ config: donchian.config, latest: row, previous: undefined }),
    ).toStrictEqual({
      status: STORED_READINGS_STATUS.NEEDS_PREVIOUS,
    });
  });
});
