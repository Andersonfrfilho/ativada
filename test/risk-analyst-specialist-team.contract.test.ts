// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createStrategySignalState,
  decimalFromIndicator,
  formatEngineDecimal,
  RISK_ATR_INDICATOR_ID,
  RULE_FAMILY,
  signalStep,
  type EngineCandle,
  type EngineMarket,
  type StoredSentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import type { VoteReading } from '../packages/risk-analyst/src/index.js';
import { ORACLE_SPECIALIST_CONFIGS } from './fixtures/risk-analyst/specialist-catalog.fixture.js';
import slice from './fixtures/risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };
import fearGreedRows from './fixtures/risk-analyst/market/btcusdt-15m-3300.fear-greed.json' with { type: 'json' };
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';
import { buildRealAuditorSeries } from './fixtures/risk-analyst/real-series.fixture.js';
import {
  AUDITED_KEYS,
  auditedVersion,
  buildAuditorSeries,
  syntheticSentiment,
} from './fixtures/risk-analyst/specialist-dataset.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const {
  ANALYST_RULES,
  CANDLE_MILLISECONDS,
  computeSeriesAnchor,
  computeVoteSeries,
  runSpecialistTeam,
  selectSentiments,
  SPECIALIST_CATALOG,
  SPECIALIST_KEYS,
  SPECIALIST_VERSIONS,
} = await loadRiskAnalystApi();

// T1.2 da spec 007 (ADR 0002, A2 e A3): o catálogo dos especialistas é o do oráculo, o voto é o do `signalStep` de produção
// (paridade com os votos do oráculo nos conjuntos reais e no recorte de 15 min) e nada olha o futuro.

const MARKET: EngineMarket = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  sentimentSource: 'alternative.me',
};

type SliceRow = readonly [number, string, string, string, string, string, number];

const sliceCandles: EngineCandle[] = (slice as unknown as SliceRow[]).map(
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
const fearGreed = observations.map(({ observedAt, value }) => ({ observedAt, value }));

type BaseVote = { openTime: number; close: string; vote: number | null };

function pickBase(series: readonly BaseVote[]): BaseVote[] {
  return series.map(({ openTime, close, vote }) => ({ openTime, close, vote }));
}

describe('catálogo dos especialistas (A2)', () => {
  test('é igual, campo a campo, ao catálogo escrito à mão no oráculo', () => {
    for (const key of SPECIALIST_KEYS) {
      expect<unknown>(SPECIALIST_CATALOG[key].config).toStrictEqual(ORACLE_SPECIALIST_CONFIGS[key]);
      expect(SPECIALIST_CATALOG[key].key).toBe(key);
    }
    expect(SPECIALIST_KEYS).toStrictEqual(['trend', 'reversion', 'volume', 'sentiment']);
  });

  test('cada especialista usa regras de UMA família só, a do seu nome', () => {
    for (const key of SPECIALIST_KEYS) {
      const families = SPECIALIST_VERSIONS[key].config.rules.map((rule) => RULE_FAMILY[rule.kind]);
      expect(new Set(families)).toStrictEqual(new Set([key]));
      expect(SPECIALIST_CATALOG[key].family).toBe(key);
    }
  });

  test('o aquecimento cabe nas 200 velas extras da série: 129, 97, 97 e 97', () => {
    const leadIns = SPECIALIST_KEYS.map(
      (key) => createStrategySignalState(SPECIALIST_VERSIONS[key].config).leadInCandles,
    );
    expect(leadIns).toStrictEqual([129, 97, 97, 97]);
    expect(Math.max(...leadIns)).toBeLessThanOrEqual(ANALYST_RULES.seriesLeadInCandles);
  });

  test('regime nenhum, limiar ±1 e o risco do Placar clássico (ATR de 14 velas)', () => {
    for (const key of SPECIALIST_KEYS) {
      const { config } = SPECIALIST_VERSIONS[key];
      expect(config.regime.kind).toBe('none');
      expect([config.thresholds.buy, config.thresholds.sell]).toStrictEqual(['1', '-1']);
      expect(config.risk.atrPeriod).toBe(14);
    }
  });
});

describe('votos = `signalStep` de produção (conjuntos reais, paridade com o oráculo)', () => {
  for (const dataset of REAL_DATASETS) {
    for (const key of AUDITED_KEYS) {
      test(`${dataset.name} · ${key}`, () => {
        const sentiments = dataset.candles.map((candle) =>
          syntheticSentiment(candle.closeTime, dataset.market.sentimentSource),
        );
        const actual = computeVoteSeries({
          strategy: key === 'strategy' ? auditedVersion('strategy') : SPECIALIST_VERSIONS[key],
          market: dataset.market,
          candles: dataset.candles,
          sentiments,
        });
        expect(pickBase(actual)).toStrictEqual(buildAuditorSeries(dataset, key));
      });
    }
  }
});

describe('votos no recorte real de 15 min (sentimento do banco)', () => {
  const sentiments = selectSentiments({
    candles: sliceCandles,
    observations,
    source: MARKET.sentimentSource,
  });
  const team = runSpecialistTeam({ market: MARKET, candles: sliceCandles, sentiments });

  for (const key of SPECIALIST_KEYS) {
    test(`${key}: os votos são os do oráculo`, () => {
      const expected = buildRealAuditorSeries({
        candles: sliceCandles,
        market: MARKET,
        key,
        fearGreed,
      });
      expect(pickBase(team[key])).toStrictEqual(expected);
    });
  }

  test('sem leitura (null) só durante o aquecimento: 129 velas na Tendência e 97 nas outras', () => {
    const unread = SPECIALIST_KEYS.map(
      (key) => team[key].filter((reading) => reading.vote === null).length,
    );
    expect(unread).toStrictEqual([128, 96, 96, 96]);
    for (const key of SPECIALIST_KEYS) {
      const firstRead = team[key].findIndex((reading) => reading.vote !== null);
      expect(team[key].slice(firstRead).every((reading) => reading.vote !== null)).toBe(true);
    }
  });

  test('o ATR vem do `risk:atr` do próprio sinal (texto decimal), só depois do aquecimento', () => {
    const strategy = SPECIALIST_VERSIONS.trend;
    let state = createStrategySignalState(strategy.config);
    sliceCandles.forEach((candle, index) => {
      const stepped = signalStep({
        strategy,
        market: MARKET,
        state,
        candle,
        sentiment: sentiments[index],
        confirmedGapCandles: 0,
      });
      state = stepped.state;
      const atr = stepped.signal?.indicators[RISK_ATR_INDICATOR_ID];
      const expected =
        atr === undefined || atr === null ? null : formatEngineDecimal(decimalFromIndicator(atr));
      expect(team.trend[index]?.atr).toBe(expected);
    });
    expect(team.trend[127]?.atr).toBeNull();
    expect(team.trend[128]?.atr).toMatch(/^\d+(\.\d+)?$/);
  });

  test('sentimento velho (> 48 h) vota 0 e fica marcado como sem dado; as outras regras não', () => {
    const last = (key: (typeof SPECIALIST_KEYS)[number]): VoteReading | undefined =>
      team[key].at(-1);
    expect(last('sentiment')).toMatchObject({ vote: 0, isMissing: true });
    expect(last('trend')?.isMissing).toBe(false);
    expect(last('volume')?.isMissing).toBe(false);
  });

  test('cortar a série no meio dá exatamente os mesmos votos (sem olhar o futuro)', () => {
    const cut = 2000;
    const partial = runSpecialistTeam({
      market: MARKET,
      candles: sliceCandles.slice(0, cut),
      sentiments: sentiments.slice(0, cut),
    });
    for (const key of SPECIALIST_KEYS) expect(partial[key]).toStrictEqual(team[key].slice(0, cut));
  });

  test('uma lacuna é declarada exata ao motor e a série segue (igual ao oráculo com a mesma lacuna)', () => {
    const holed = sliceCandles.filter((_candle, index) => index !== 200);
    const holedSentiments = selectSentiments({
      candles: holed,
      observations,
      source: MARKET.sentimentSource,
    });
    const actual = computeVoteSeries({
      strategy: SPECIALIST_VERSIONS.trend,
      market: MARKET,
      candles: holed,
      sentiments: holedSentiments,
    });
    const expected = buildRealAuditorSeries({
      candles: holed,
      market: MARKET,
      key: 'trend',
      fearGreed,
    });
    expect(actual).toHaveLength(sliceCandles.length - 1);
    expect(pickBase(actual)).toStrictEqual(expected);
    expect(actual.slice(0, 200)).toStrictEqual(team.trend.slice(0, 200));
  });
});

describe('sentimento disponível no fechamento da vela', () => {
  const stored = (
    value: number,
    observedAt: number,
    source: string,
    createdAt: number,
  ): StoredSentimentObservation => ({
    value,
    observedAt,
    source,
    createdAt,
  });
  const candleClosing = (closeTime: number): EngineCandle => ({
    ...(sliceCandles[0] as EngineCandle),
    closeTime,
  });

  test('só a fonte da execução, só o já disponível e só o já inserido até o fechamento', () => {
    const picked = selectSentiments({
      candles: [candleClosing(1999), candleClosing(2500), candleClosing(1200), candleClosing(500)],
      observations: [
        stored(20, 1000, 'alt', 1000),
        stored(80, 2000, 'alt', 2000),
        stored(90, 1500, 'other', 1500),
        stored(70, 1800, 'alt', 99_999),
      ],
      source: 'alt',
    });
    expect(picked.map((sentiment) => sentiment?.value)).toStrictEqual([20, 80, 20, undefined]);
    expect(picked[0]).toStrictEqual({ value: 20, observedAt: 1000, source: 'alt' });
  });
});

describe('âncora diária da série (A3)', () => {
  const DAY = ANALYST_RULES.seriesAnchorMilliseconds;

  test('00:00 UTC do dia que contém t − 3.080·d: 3.168 velas para t = 14/10/2026 23:45 UTC', () => {
    const candleTime = Date.UTC(2026, 9, 14, 23, 45);
    const anchor = computeSeriesAnchor(candleTime);
    expect(anchor).toBe(Date.UTC(2026, 8, 12));
    expect((candleTime - anchor) / CANDLE_MILLISECONDS + 1).toBe(3168);
  });

  test('em qualquer vela a série tem de 3.081 a 3.176 velas e a âncora cai à meia-noite UTC', () => {
    const midnight = Date.UTC(2026, 9, 14);
    for (let offset = 0; offset < DAY / CANDLE_MILLISECONDS; offset += 1) {
      const candleTime = midnight + offset * CANDLE_MILLISECONDS;
      const anchor = computeSeriesAnchor(candleTime);
      const length = (candleTime - anchor) / CANDLE_MILLISECONDS + 1;
      expect(anchor % DAY).toBe(0);
      expect(length).toBeGreaterThanOrEqual(3081);
      expect(length).toBeLessThanOrEqual(3176);
    }
  });

  test('a âncora só muda uma vez por dia (o avanço incremental fica idêntico ao recálculo)', () => {
    const midnight = Date.UTC(2026, 9, 14);
    const anchors = new Set<number>();
    for (let offset = 0; offset < DAY / CANDLE_MILLISECONDS; offset += 1) {
      anchors.add(computeSeriesAnchor(midnight + offset * CANDLE_MILLISECONDS));
    }
    expect(anchors.size).toBeLessThanOrEqual(2);
  });
});
