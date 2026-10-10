// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  NextTriggers,
  RuleReading,
  RuleTrigger,
  ScoreboardReadings,
  SentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import {
  CLOSE_TIME,
  KINDS_CONFIG,
  SENTIMENT_SOURCE,
} from './fixtures/strategy-engine/signal/scoreboard-configs.fixture.js';
import { loadTriggerApi } from './fixtures/strategy-engine/trigger/trigger-api.fixture.js';

const api = await loadTriggerApi();
const CLOSE = '101';

function reading(current: RuleReading['current'], previous?: RuleReading['current']): RuleReading {
  return { current, previous };
}

const FEAR_GREED_50: SentimentObservation = {
  value: 50,
  observedAt: CLOSE_TIME - 1_000,
  source: SENTIMENT_SOURCE,
};

type Overrides = {
  readonly ema?: readonly [number, number];
  readonly rsi?: number;
  readonly macd?: readonly [number, number];
  readonly donchian?: readonly [lower: number, upper: number];
  readonly donchianPrevious?: readonly [lower: number, upper: number];
  readonly bollinger?: readonly [lower: number, upper: number];
  readonly obv?: readonly [number, number];
};

function readingsOf(overrides: Overrides = {}): ScoreboardReadings {
  const [fast, slow] = overrides.ema ?? [100, 102];
  const [macd, signal] = overrides.macd ?? [-5, -3];
  const [donchianLower, donchianUpper] = overrides.donchian ?? [90, 110];
  const [previousLower, previousUpper] = overrides.donchianPrevious ?? [
    donchianLower,
    donchianUpper,
  ];
  const [bollingerLower, bollingerUpper] = overrides.bollinger ?? [95, 107];
  const [obv, obvEma] = overrides.obv ?? [1000, 1200];
  return {
    rules: {
      'ema-9-21': reading({ fast, slow }),
      'macd-12-26-9': reading({ macd, signal, histogram: macd - signal }),
      'donchian-20': reading(
        { lower: donchianLower, upper: donchianUpper },
        { lower: previousLower, upper: previousUpper },
      ),
      'rsi-14': reading(overrides.rsi ?? 45),
      'bollinger-20': reading({
        lower: bollingerLower,
        middle: 101,
        upper: bollingerUpper,
        width: 0.1,
      }),
      'obv-ema-20': reading({ obv, ema: obvEma }),
    },
    atr: 410.5,
    adx: undefined,
  };
}

type State = 'awaiting_entry' | 'holding';

function triggersOf(
  state: State,
  overrides: Overrides = {},
  sentiment: SentimentObservation = FEAR_GREED_50,
): NextTriggers {
  return api.computeNextTriggers({
    config: KINDS_CONFIG,
    readings: readingsOf(overrides),
    close: CLOSE,
    closeTime: CLOSE_TIME,
    sentiment,
    sentimentSource: SENTIMENT_SOURCE,
    state,
  });
}

function ruleOf(state: State, ruleId: string, overrides: Overrides = {}): RuleTrigger {
  const found = triggersOf(state, overrides).rules.find((rule) => rule.ruleId === ruleId);
  if (found === undefined) throw new Error(`Regra ${ruleId} ausente.`);
  return found;
}

describe('o que falta para a regra disparar, por família (contas à mão)', () => {
  describe('tendência / cruzamento de médias: o fechamento que iguala as duas EMAs', () => {
    // fast' = (1-αf)·fast + αf·P ; slow' = (1-αs)·slow + αs·P ; α = 2/(n+1) ; P* = ((1-αs)·slow - (1-αf)·fast)/(αf-αs)
    test('aguardando entrada: EMA 9 em 100 e EMA 21 em 102 pedem fechamento acima de 116,66666667', () => {
      expect(ruleOf('awaiting_entry', 'ema-9-21')).toMatchObject({
        kind: 'ema_cross',
        family: 'trend',
        vote: -1,
        weight: '1',
        isMet: false,
        metric: 'close_price',
        direction: 'above',
        basis: 'exact',
        current: '101',
        threshold: '116.66666667',
        distance: '15.66666667',
        distanceRate: '0.15511552',
      });
    });

    test('comprado: a saída pede fechamento abaixo do preço em que a rápida cai sob a lenta', () => {
      expect(ruleOf('holding', 'ema-9-21', { ema: [100, 98] })).toMatchObject({
        vote: 1,
        isMet: false,
        direction: 'below',
        threshold: '83.33333333',
        distance: '17.66666667',
        distanceRate: '0.1749175',
      });
    });

    test('já cruzada para cima: o gatilho de entrada está atendido e a distância é negativa', () => {
      const rule = ruleOf('awaiting_entry', 'ema-9-21', { ema: [103, 102] });
      expect(rule).toMatchObject({ vote: 1, isMet: true });
      expect(rule.distance?.startsWith('-')).toBe(true);
    });

    test('empate de médias não é voto: a regra ainda não está atendida', () => {
      expect(ruleOf('awaiting_entry', 'ema-9-21', { ema: [102, 102] })).toMatchObject({
        vote: 0,
        isMet: false,
      });
    });
  });

  describe('tendência / MACD: a diferença entre a linha e o sinal', () => {
    test('aguardando entrada: MACD −5 e sinal −3 faltam 2 para a linha passar o sinal', () => {
      expect(ruleOf('awaiting_entry', 'macd-12-26-9')).toMatchObject({
        family: 'trend',
        vote: -1,
        isMet: false,
        metric: 'macd_gap',
        direction: 'above',
        basis: 'indicative',
        current: '-2',
        threshold: '0',
        distance: '2',
        distanceRate: null,
      });
    });

    test('comprado: a saída já está atendida com a linha abaixo do sinal', () => {
      expect(ruleOf('holding', 'macd-12-26-9')).toMatchObject({
        vote: -1,
        isMet: true,
        direction: 'below',
        distance: '-2',
      });
    });
  });

  describe('volatilidade / rompimento do canal de Donchian', () => {
    test('aguardando entrada: a máxima de 20 períodos está 9 acima do fechamento (8,91%)', () => {
      expect(ruleOf('awaiting_entry', 'donchian-20')).toMatchObject({
        kind: 'donchian_breakout',
        family: 'trend',
        vote: 0,
        isMet: false,
        metric: 'close_price',
        direction: 'above',
        basis: 'exact',
        threshold: '110',
        distance: '9',
        distanceRate: '0.08910892',
      });
    });

    test('comprado: a saída é perder a mínima do canal, 11 abaixo do fechamento', () => {
      expect(ruleOf('holding', 'donchian-20')).toMatchObject({
        isMet: false,
        direction: 'below',
        threshold: '90',
        distance: '11',
        distanceRate: '0.1089109',
      });
    });

    test('o gatilho do PRÓXIMO fechamento é o canal ATUAL, que vira o anterior (o voto de hoje usa o anterior)', () => {
      const rule = ruleOf('awaiting_entry', 'donchian-20', {
        donchian: [90, 110],
        donchianPrevious: [91, 100.5],
      });
      expect(rule).toMatchObject({ vote: 1, isMet: true, threshold: '110', distance: '9' });
    });

    test('fechamento já acima do canal anterior: rompimento atendido', () => {
      expect(ruleOf('awaiting_entry', 'donchian-20', { donchian: [90, 100] })).toMatchObject({
        vote: 1,
        isMet: true,
        distance: '-1',
      });
    });
  });

  describe('momentum / RSI contra os limiares de sobrevenda e sobrecompra', () => {
    test('aguardando entrada: RSI 45 precisa cair 15 pontos até a sobrevenda (30)', () => {
      expect(ruleOf('awaiting_entry', 'rsi-14')).toMatchObject({
        kind: 'rsi',
        family: 'reversion',
        vote: 0,
        isMet: false,
        metric: 'rsi',
        direction: 'below',
        basis: 'indicative',
        current: '45',
        threshold: '30',
        distance: '15',
        distanceRate: null,
      });
    });

    test('comprado: RSI 45 precisa subir 25 pontos até a sobrecompra (70)', () => {
      expect(ruleOf('holding', 'rsi-14')).toMatchObject({
        isMet: false,
        direction: 'above',
        threshold: '70',
        distance: '25',
      });
    });

    test('a distância é arredondada para CIMA a 8 casas (mais longe), o valor atual para o mais próximo', () => {
      expect(ruleOf('awaiting_entry', 'rsi-14', { rsi: 45.1234567811 })).toMatchObject({
        current: '45.12345678',
        distance: '15.12345679',
      });
      expect(ruleOf('holding', 'rsi-14', { rsi: 45.1234567811 })).toMatchObject({
        distance: '24.87654322',
      });
    });

    test('RSI exatamente no limiar ainda não vota (comparação estrita)', () => {
      expect(ruleOf('awaiting_entry', 'rsi-14', { rsi: 30 })).toMatchObject({
        vote: 0,
        isMet: false,
        distance: '0',
      });
      expect(ruleOf('awaiting_entry', 'rsi-14', { rsi: 25 })).toMatchObject({
        vote: 1,
        isMet: true,
        distance: '-5',
      });
    });
  });

  describe('volatilidade / bandas de Bollinger', () => {
    test('aguardando entrada: o fechamento está 6 acima da banda inferior (5,94%)', () => {
      expect(ruleOf('awaiting_entry', 'bollinger-20')).toMatchObject({
        kind: 'bollinger',
        family: 'reversion',
        vote: 0,
        isMet: false,
        metric: 'close_price',
        direction: 'below',
        basis: 'indicative',
        threshold: '95',
        distance: '6',
        distanceRate: '0.05940595',
      });
    });

    test('comprado: a saída é tocar a banda superior, 6 acima', () => {
      expect(ruleOf('holding', 'bollinger-20')).toMatchObject({
        isMet: false,
        direction: 'above',
        threshold: '107',
        distance: '6',
        distanceRate: '0.05940595',
      });
    });
  });

  describe('volume / OBV contra a própria média', () => {
    test('aguardando entrada: OBV 1000 e média 1200 faltam 200 de volume acumulado', () => {
      expect(ruleOf('awaiting_entry', 'obv-ema-20')).toMatchObject({
        kind: 'obv_trend',
        family: 'volume',
        vote: -1,
        isMet: false,
        metric: 'obv_gap',
        direction: 'above',
        basis: 'indicative',
        current: '-200',
        threshold: '0',
        distance: '200',
      });
    });

    test('comprado: a saída já está atendida (OBV abaixo da média)', () => {
      expect(ruleOf('holding', 'obv-ema-20')).toMatchObject({
        isMet: true,
        direction: 'below',
        distance: '-200',
      });
    });
  });

  describe('sentimento / Fear & Greed', () => {
    test('aguardando entrada: índice 50 precisa cair 25 até o medo (25)', () => {
      expect(ruleOf('awaiting_entry', 'fear-greed')).toMatchObject({
        kind: 'fear_greed',
        family: 'sentiment',
        vote: 0,
        isMet: false,
        metric: 'fear_greed_index',
        direction: 'below',
        basis: 'indicative',
        current: '50',
        threshold: '25',
        distance: '25',
      });
    });

    test('comprado: índice 50 precisa subir 25 até a ganância (75)', () => {
      expect(ruleOf('holding', 'fear-greed')).toMatchObject({
        direction: 'above',
        threshold: '75',
        distance: '25',
      });
    });

    test('limites inclusivos: medo exatamente em 25 já vota comprar', () => {
      const atFear = { ...FEAR_GREED_50, value: 25 };
      const rule = triggersOf('awaiting_entry', {}, atFear).rules.find(
        (candidate) => candidate.ruleId === 'fear-greed',
      );
      expect(rule).toMatchObject({ vote: 1, isMet: true, distance: '0' });
    });

    test('observação velha (mais de 48 h) ou de outra fonte não conta como valor atual', () => {
      const stale = { ...FEAR_GREED_50, observedAt: CLOSE_TIME - 49 * 3_600_000 };
      const foreign = { ...FEAR_GREED_50, source: 'outra-fonte' };
      for (const sentiment of [stale, foreign]) {
        const rule = triggersOf('awaiting_entry', {}, sentiment).rules.find(
          (candidate) => candidate.ruleId === 'fear-greed',
        );
        expect(rule).toMatchObject({ current: null, distance: null, vote: 0, isMet: false });
      }
    });

    test('sem observação fresca: valor e distância nulos, regra não atendida', () => {
      const result = api.computeNextTriggers({
        config: KINDS_CONFIG,
        readings: readingsOf(),
        close: CLOSE,
        closeTime: CLOSE_TIME,
        sentiment: undefined,
        sentimentSource: SENTIMENT_SOURCE,
        state: 'awaiting_entry',
      });
      expect(result.rules.find((rule) => rule.ruleId === 'fear-greed')).toMatchObject({
        vote: 0,
        isMet: false,
        current: null,
        distance: null,
        threshold: '25',
      });
    });
  });
});

describe('o placar inteiro: a pontuação contra o limiar do estado', () => {
  test('aguardando entrada: pontuação −3 e limiar de compra +3 faltam 6', () => {
    const result = triggersOf('awaiting_entry');
    expect(result).toMatchObject({
      version: 'trigger-1',
      state: 'awaiting_entry',
      action: 'SELL',
      score: '-3',
      scoreThreshold: '3',
      scoreGap: '6',
    });
    expect(result.rules.map((rule) => rule.ruleId)).toStrictEqual([
      'ema-9-21',
      'macd-12-26-9',
      'donchian-20',
      'rsi-14',
      'bollinger-20',
      'obv-ema-20',
      'fear-greed',
    ]);
  });

  test('comprado: pontuação −3 e limiar de venda −3 já estão na saída (folga zero)', () => {
    expect(triggersOf('holding')).toMatchObject({
      state: 'holding',
      score: '-3',
      scoreThreshold: '-3',
      scoreGap: '0',
    });
  });

  test('o mesmo resultado em duas chamadas (determinístico)', () => {
    expect(triggersOf('awaiting_entry')).toStrictEqual(triggersOf('awaiting_entry'));
  });
});

describe('leitura que falta é recusada em voz alta, nunca vira distância', () => {
  test('indicador sem valor depois do aquecimento', () => {
    const readings = readingsOf();
    const broken: ScoreboardReadings = {
      ...readings,
      rules: { ...readings.rules, 'rsi-14': reading(undefined) },
    };
    expect(() =>
      api.computeNextTriggers({
        config: KINDS_CONFIG,
        readings: broken,
        close: CLOSE,
        closeTime: CLOSE_TIME,
        sentiment: FEAR_GREED_50,
        sentimentSource: SENTIMENT_SOURCE,
        state: 'awaiting_entry',
      }),
    ).toThrow();
  });
});
