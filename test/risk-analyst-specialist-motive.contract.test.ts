// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { describeRuleCondition } from '../apps/api-ativada/src/runs/live-status/decision-condition.js';
import {
  parseStrategyConfig,
  type EngineCandle,
  type EngineMarket,
  type StoredSentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import slice from './fixtures/risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };
import fearGreedRows from './fixtures/risk-analyst/market/btcusdt-15m-3300.fear-greed.json' with { type: 'json' };
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const {
  describeSpecialistMotive,
  FORBIDDEN_PHRASES,
  RULE_MOTIVE,
  runSpecialistTeam,
  selectSentiments,
  SPECIALIST_CATALOG,
  SPECIALIST_KEYS,
  WARMING_UP_MOTIVE,
  SENTIMENT_MISSING_MOTIVE,
  CANCELLED_RULES_MOTIVE,
} = await loadRiskAnalystApi();

// Spec 011, D4-A (ADR 0002, "Sala da equipe"): o motivo curto de cada especialista sai de um catálogo FECHADO por regra, as
// frases de "contra" e "neutro" são as da spec 008 letra por letra e o motivo vem do voto por regra que o `signalStep` deu.

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
const observations: StoredSentimentObservation[] = (fearGreedRows as [number, number][]).map(
  ([observedAt, value]) => ({
    value,
    observedAt,
    source: MARKET.sentimentSource,
    createdAt: observedAt,
  }),
);

// O catálogo escrito à mão a partir da tabela da §5 da spec 011.
const TABLE: Readonly<Record<string, readonly [string, string, string]>> = {
  'ema-9-21': [
    'a média rápida (EMA 9) está acima da lenta (EMA 21)',
    'a média rápida (EMA 9) está abaixo da lenta (EMA 21)',
    'as médias estão empatadas',
  ],
  'macd-12-26-9': [
    'o MACD está acima da linha de sinal',
    'o MACD ainda está abaixo da linha de sinal',
    'o MACD está igual à linha de sinal',
  ],
  'donchian-20': [
    'o preço fechou acima da máxima das últimas 20 velas',
    'o preço fechou abaixo da mínima das últimas 20 velas',
    'o preço não fechou acima da máxima das últimas 20 velas',
  ],
  'rsi-14': [
    'o RSI{reading} está abaixo de 30',
    'o RSI{reading} está acima de 70',
    'o RSI{reading} está entre 30 e 70',
  ],
  'bollinger-20': [
    'o preço fechou abaixo da banda inferior',
    'o preço fechou acima da banda superior',
    'o preço está dentro das bandas',
  ],
  'obv-ema-20': [
    'o volume (OBV) está acima da média dele',
    'o volume (OBV) está abaixo da média dele',
    'o volume (OBV) está igual à média dele',
  ],
  'fear-greed-25-75': [
    'o Fear & Greed{reading} está em medo (até 25)',
    'o Fear & Greed{reading} está em ganância (a partir de 75)',
    'o Fear & Greed{reading} não está em medo (até 25)',
  ],
};

describe('catálogo do motivo', () => {
  test('as 7 regras do catálogo dos especialistas têm as 3 frases da §5, literais', () => {
    const ruleIds = SPECIALIST_KEYS.flatMap((key) =>
      SPECIALIST_CATALOG[key].config.rules.map((rule) => String(rule['id'])),
    );
    expect(ruleIds.sort()).toStrictEqual(Object.keys(TABLE).sort());
    for (const [ruleId, [favor, against, neutral]] of Object.entries(TABLE)) {
      expect(RULE_MOTIVE[ruleId]).toStrictEqual({ favor, against, neutral });
    }
    expect(CANCELLED_RULES_MOTIVE).toBe('As regras dele se anulam nesta vela.');
    expect(WARMING_UP_MOTIVE).toBe('ainda juntando histórico do par');
    expect(SENTIMENT_MISSING_MOTIVE).toBe('sem leitura do Fear & Greed há mais de 48 horas');
  });

  test('"contra" e "neutro" são letra por letra os da spec 008, com e sem leitura', () => {
    const readings = [undefined, 78.24, 55, 20.05] as const;
    for (const key of SPECIALIST_KEYS) {
      const rules = parseStrategyConfig(SPECIALIST_CATALOG[key].config).rules;
      rules.forEach((rule, index) => {
        for (const reading of readings) {
          const ruleVotes = rules.map((candidate, position) => ({
            ruleId: candidate.id,
            vote: position === index ? (-1 as const) : (0 as const),
            reading: reading ?? null,
          }));
          expect(describeSpecialistMotive({ key, vote: -1, isUnread: false, ruleVotes })).toBe(
            describeRuleCondition({ rule, vote: -1, reading }),
          );
        }
      });
      const [first] = rules;
      if (first === undefined) throw new Error('especialista sem regra');
      for (const reading of readings) {
        const ruleVotes = rules.map((candidate) => ({
          ruleId: candidate.id,
          vote: 0 as const,
          reading: reading ?? null,
        }));
        expect(describeSpecialistMotive({ key, vote: 0, isUnread: false, ruleVotes })).toBe(
          describeRuleCondition({ rule: first, vote: 0, reading }),
        );
      }
    }
  });

  test('nenhuma frase do catálogo promete resultado nem manda comprar ou vender', () => {
    const phrases = [
      ...Object.values(RULE_MOTIVE).flatMap((motive) => [
        motive.favor,
        motive.against,
        motive.neutral,
      ]),
      CANCELLED_RULES_MOTIVE,
      WARMING_UP_MOTIVE,
      SENTIMENT_MISSING_MOTIVE,
    ];
    for (const phrase of phrases) {
      for (const forbidden of FORBIDDEN_PHRASES)
        expect(phrase.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('a regra que decidiu o voto', () => {
  const vote = (
    ruleId: string,
    cast: -1 | 0 | 1,
    reading: number | null = null,
  ): { ruleId: string; vote: -1 | 0 | 1; reading: number | null } => ({
    ruleId,
    vote: cast,
    reading,
  });

  test('a favor: a primeira regra do catálogo que votou a favor', () => {
    const motive = describeSpecialistMotive({
      key: 'trend',
      vote: 1,
      isUnread: false,
      ruleVotes: [vote('donchian-20', 1), vote('macd-12-26-9', 1), vote('ema-9-21', 0)],
    });
    expect(motive).toBe('o MACD está acima da linha de sinal');
  });

  test('contra: a primeira regra que votou contra, com a leitura de 1 casa', () => {
    expect(
      describeSpecialistMotive({
        key: 'reversion',
        vote: -1,
        isUnread: false,
        ruleVotes: [vote('bollinger-20', 0), vote('rsi-14', -1, 78.24)],
      }),
    ).toBe('o RSI (78,2) está acima de 70');
    expect(
      describeSpecialistMotive({
        key: 'sentiment',
        vote: 1,
        isUnread: false,
        ruleVotes: [vote('fear-greed-25-75', 1, 20)],
      }),
    ).toBe('o Fear & Greed (20) está em medo (até 25)');
  });

  test('neutro: a frase neutra da primeira regra; +1 e −1 que somam zero se anulam', () => {
    expect(
      describeSpecialistMotive({
        key: 'trend',
        vote: 0,
        isUnread: false,
        ruleVotes: [vote('ema-9-21', 0), vote('macd-12-26-9', 0), vote('donchian-20', 0)],
      }),
    ).toBe('as médias estão empatadas');
    expect(
      describeSpecialistMotive({
        key: 'reversion',
        vote: 0,
        isUnread: false,
        ruleVotes: [vote('rsi-14', 0, 50), vote('bollinger-20', 0)],
      }),
    ).toBe('o RSI (50) está entre 30 e 70');
    expect(
      describeSpecialistMotive({
        key: 'trend',
        vote: 0,
        isUnread: false,
        ruleVotes: [vote('ema-9-21', 1), vote('macd-12-26-9', -1), vote('donchian-20', 0)],
      }),
    ).toBe('As regras dele se anulam nesta vela.');
  });

  test('sem leitura: aquecendo ou sentimento velho; decisão antiga sem votos por regra: nulo', () => {
    expect(
      describeSpecialistMotive({ key: 'trend', vote: null, isUnread: true, ruleVotes: undefined }),
    ).toBe('ainda juntando histórico do par');
    expect(
      describeSpecialistMotive({ key: 'sentiment', vote: 0, isUnread: true, ruleVotes: [] }),
    ).toBe('sem leitura do Fear & Greed há mais de 48 horas');
    expect(
      describeSpecialistMotive({ key: 'volume', vote: 1, isUnread: false, ruleVotes: undefined }),
    ).toBeNull();
  });
});

describe('nos 3.300 candles reais de 15 min', () => {
  const sentiments = selectSentiments({ candles, observations, source: MARKET.sentimentSource });
  const team = runSpecialistTeam({ market: MARKET, candles, sentiments });

  test('toda vela lida de todo especialista tem votos por regra e um motivo do catálogo', () => {
    let checked = 0;
    for (const key of SPECIALIST_KEYS) {
      const rules = SPECIALIST_CATALOG[key].config.rules.length;
      for (const reading of team[key]) {
        if (reading.vote === null || reading.isMissing) continue;
        expect(reading.ruleVotes).toHaveLength(rules);
        const motive = describeSpecialistMotive({
          key,
          vote: reading.vote,
          isUnread: false,
          ruleVotes: reading.ruleVotes,
        });
        expect(motive).not.toBeNull();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(8000);
  });

  test('o voto do especialista é o sinal da soma dos votos por regra (a regra citada existe)', () => {
    for (const key of SPECIALIST_KEYS) {
      for (const reading of team[key]) {
        if (reading.vote === null || reading.vote === 0 || reading.ruleVotes === undefined)
          continue;
        expect(reading.ruleVotes.some((ruleVote) => ruleVote.vote === reading.vote)).toBe(true);
      }
    }
  });

  test('o RSI e o Fear & Greed trazem a leitura; as demais regras não', () => {
    const lastRsi = team.reversion
      .at(-1)
      ?.ruleVotes?.find((ruleVote) => ruleVote.ruleId === 'rsi-14');
    expect(typeof lastRsi?.reading).toBe('number');
    const bollinger = team.reversion
      .at(-1)
      ?.ruleVotes?.find((ruleVote) => ruleVote.ruleId === 'bollinger-20');
    expect(bollinger?.reading).toBeNull();
    const sentimentVote = team.sentiment[team.sentiment.length - 200]?.ruleVotes?.[0];
    expect(typeof sentimentVote?.reading).toBe('number');
  });

  test('cortar a série no meio dá os mesmos votos por regra (sem olhar o futuro)', () => {
    const cut = 2100;
    const partial = runSpecialistTeam({
      market: MARKET,
      candles: candles.slice(0, cut),
      sentiments: sentiments.slice(0, cut),
    });
    for (const key of SPECIALIST_KEYS) {
      expect(partial[key].map((reading) => reading.ruleVotes)).toStrictEqual(
        team[key].slice(0, cut).map((reading) => reading.ruleVotes),
      );
    }
  });
});
