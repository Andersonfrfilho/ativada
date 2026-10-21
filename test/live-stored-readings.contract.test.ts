// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeNextTriggers,
  createStrategyVersion,
  type StrategyConfigInput,
  type StrategyVersion,
} from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

// A remontagem vem do módulo carregado pela raiz da API (a de produção, ou a cópia mutada do teste de mutantes).
const app = await loadApiApp();
const { buildStoredReadings, computeStoredTriggers, STORED_READINGS_STATUS } = app.storedReadings;

const RISK = {
  atrPeriod: 14,
  stopAtrMultiple: '2',
  targetAtrMultiple: '3',
  riskPerTrade: '0.01',
  maxExposureRate: '1',
} as const;
const HOUR = 3_600_000;

function strategyOf(config: Omit<StrategyConfigInput, 'schemaVersion'>): StrategyVersion {
  return createStrategyVersion({ schemaVersion: 1, ...config });
}

const DONCHIAN = strategyOf({
  rules: [
    { id: 'donchian-20', kind: 'donchian_breakout', period: 20 },
    { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 },
  ],
  thresholds: { buy: '1', sell: '-1' },
  risk: RISK,
});
const EMA_AND_FEAR_GREED = strategyOf({
  rules: [
    { id: 'ema-5-13', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 13 },
    { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 30, greedAtOrAbove: 70 },
  ],
  thresholds: { buy: '1', sell: '-1' },
  risk: RISK,
});

const LATEST = {
  indicators: {
    'rule:donchian-20.lower': 10,
    'rule:donchian-20.upper': 12,
    'rule:rsi-14': 45,
    'risk:atr': 0.3,
  },
  sentimentObservation: null,
};
const PREVIOUS = {
  indicators: { 'rule:donchian-20.lower': 9, 'rule:donchian-20.upper': 11.5, 'rule:rsi-14': 50 },
  sentimentObservation: null,
};

describe('leituras gravadas viram as leituras do placar (ADR 0002, spec 008, L1)', () => {
  test('várias saídas são remontadas; o canal anterior vem da linha anterior só no Donchian', () => {
    const stored = buildStoredReadings({
      config: DONCHIAN.config,
      latest: LATEST,
      previous: PREVIOUS,
    });
    expect(stored).toStrictEqual({
      status: STORED_READINGS_STATUS.READY,
      readings: {
        rules: {
          'donchian-20': {
            current: { lower: 10, upper: 12 },
            previous: { lower: 9, upper: 11.5 },
          },
          'rsi-14': { current: 45, previous: undefined },
        },
        atr: 0.3,
        adx: undefined,
      },
      sentiment: undefined,
    });
  });

  test('a linha anterior é a que o chamador entrega (a de maior candle_time abaixo), mesmo com lacuna entre as velas', () => {
    const afterGap = buildStoredReadings({
      config: DONCHIAN.config,
      latest: LATEST,
      previous: {
        ...PREVIOUS,
        indicators: { 'rule:donchian-20.lower': 1, 'rule:donchian-20.upper': 2 },
      },
    });
    expect(afterGap.status).toBe(STORED_READINGS_STATUS.READY);
    if (afterGap.status !== STORED_READINGS_STATUS.READY) return;
    expect(afterGap.readings.rules['donchian-20']?.previous).toStrictEqual({ lower: 1, upper: 2 });
  });

  test('sem linha anterior, o Donchian espera; sem Donchian a primeira decisão já responde', () => {
    expect(
      buildStoredReadings({ config: DONCHIAN.config, latest: LATEST, previous: undefined }),
    ).toStrictEqual({ status: STORED_READINGS_STATUS.NEEDS_PREVIOUS });
    expect(
      buildStoredReadings({
        config: EMA_AND_FEAR_GREED.config,
        latest: {
          indicators: { 'rule:ema-5-13.fast': 2, 'rule:ema-5-13.slow': 1 },
          sentimentObservation: null,
        },
        previous: undefined,
      }).status,
    ).toBe(STORED_READINGS_STATUS.READY);
  });

  test.each([
    ['null', null],
    ['texto', 'abc'],
    ['objeto', { value: 1 }],
    ['booleano', true],
  ])('valor gravado que não é número (%s) conta como leitura ausente', (_name, value) => {
    const stored = buildStoredReadings({
      config: DONCHIAN.config,
      latest: {
        indicators: { 'rule:rsi-14': value, 'risk:atr': value },
        sentimentObservation: null,
      },
      previous: PREVIOUS,
    });
    expect(stored.status).toBe(STORED_READINGS_STATUS.READY);
    if (stored.status !== STORED_READINGS_STATUS.READY) return;
    expect(stored.readings.rules['rsi-14']?.current).toBeUndefined();
    expect(stored.readings.rules['donchian-20']?.current).toBeUndefined();
    expect(stored.readings.atr).toBeUndefined();
  });

  test('indicadores que não são um registro são ausência total, sem lançar', () => {
    for (const indicators of [null, [], 'x', 3]) {
      const stored = buildStoredReadings({
        config: EMA_AND_FEAR_GREED.config,
        latest: { indicators, sentimentObservation: null },
        previous: undefined,
      });
      expect(stored.status).toBe(STORED_READINGS_STATUS.READY);
    }
  });

  test('o sentimento gravado volta como observação; incompleto vira ausência; Fear & Greed não entra em rules', () => {
    const observation = { value: 22, observedAt: 1_700_000_000_000, source: 'alternative.me' };
    const stored = buildStoredReadings({
      config: EMA_AND_FEAR_GREED.config,
      latest: { indicators: { 'rule:fear-greed': 22 }, sentimentObservation: observation },
      previous: undefined,
    });
    expect(stored).toMatchObject({ status: STORED_READINGS_STATUS.READY, sentiment: observation });
    if (stored.status === STORED_READINGS_STATUS.READY) {
      expect(Object.keys(stored.readings.rules)).toStrictEqual(['ema-5-13']);
    }
    const brokenObservations = [
      { value: 22, observedAt: 1 },
      { value: '22', observedAt: 1, source: 'x' },
      7,
    ];
    for (const broken of brokenObservations) {
      const withBroken = buildStoredReadings({
        config: EMA_AND_FEAR_GREED.config,
        latest: { indicators: {}, sentimentObservation: broken },
        previous: undefined,
      });
      expect(withBroken).toMatchObject({ sentiment: undefined });
    }
  });
});

describe('gatilhos das leituras gravadas (computeStoredTriggers)', () => {
  const market = {
    close: '11.42',
    closeTime: 1_700_000_000_000 + HOUR - 1,
    sentimentSource: 'alternative.me',
  };

  test('é o computeNextTriggers sobre as leituras remontadas, nos dois estados', () => {
    for (const state of ['awaiting_entry', 'holding'] as const) {
      const stored = buildStoredReadings({
        config: DONCHIAN.config,
        latest: LATEST,
        previous: PREVIOUS,
      });
      if (stored.status !== STORED_READINGS_STATUS.READY) throw new Error('leituras não prontas');
      const triggers = computeStoredTriggers({
        config: DONCHIAN.config,
        latest: LATEST,
        previous: PREVIOUS,
        market,
        state,
      });
      expect(triggers).toStrictEqual({
        status: STORED_READINGS_STATUS.READY,
        triggers: computeNextTriggers({
          config: DONCHIAN.config,
          readings: stored.readings,
          close: market.close,
          closeTime: market.closeTime,
          sentiment: stored.sentiment,
          sentimentSource: market.sentimentSource,
          state,
        }),
      });
    }
  });

  test('a primeira decisão com Donchian devolve "precisa da anterior" em vez de inventar o canal', () => {
    expect(
      computeStoredTriggers({
        config: DONCHIAN.config,
        latest: LATEST,
        previous: undefined,
        market,
        state: 'awaiting_entry',
      }),
    ).toStrictEqual({ status: STORED_READINGS_STATUS.NEEDS_PREVIOUS });
  });
});
