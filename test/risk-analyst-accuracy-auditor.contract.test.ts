// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { AuditSummary } from '../packages/risk-analyst/src/index.js';
import type {
  EngineCandle,
  EngineMarket,
  StrategyVersion,
} from '../packages/strategy-engine/src/index.js';
import {
  AUDITOR_GOLDEN,
  parseAuditorGolden,
} from './fixtures/risk-analyst/auditor-golden.fixture.js';
import { AUDITOR_GOLDEN_15M } from './fixtures/risk-analyst/auditor-golden-15m.fixture.js';
import {
  summarizeAuditor,
  verdictOf,
  weightOf,
  wilsonLimitsOf,
} from './fixtures/risk-analyst/auditor-oracle.fixture.js';
import slice from './fixtures/risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };
import fearGreedRows from './fixtures/risk-analyst/market/btcusdt-15m-3300.fear-greed.json' with { type: 'json' };
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';
import {
  AUDITED_KEYS,
  auditedVersion,
  syntheticSentiment,
} from './fixtures/risk-analyst/specialist-dataset.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const { auditVotes, computeVoteSeries, selectSentiments, SPECIALIST_VERSIONS } =
  await loadRiskAnalystApi();

// T1.2 da spec 007 (ADR 0002, A5 a A7): o auditor de produção dá os MESMOS números do oráculo `bigint` nos conjuntos reais
// e no recorte de 15 min, nas bordas do Wilson (29/30 contadas, limite encostando em 0,5) e sem olhar o futuro.

type Vote = -1 | 0 | 1 | null;
type Reading = {
  openTime: number;
  close: string;
  vote: Vote;
  isMissing: boolean;
  atr: string | null;
};

const D = 900_000;
const DATASET_KEYS = ['btcusdt-1h-500', 'ethusdt-1d-400'] as const;
const WINDOWS = [2880, 96] as const;
const D_15M = 900_000;
const SLICE_NAME = 'btcusdt-15m-3300';
const MARKET: EngineMarket = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  sentimentSource: 'alternative.me',
};

function strategyOf(key: (typeof AUDITED_KEYS)[number]): StrategyVersion {
  return key === 'strategy' ? auditedVersion('strategy') : SPECIALIST_VERSIONS[key];
}

describe('auditor × oráculo nos conjuntos reais', () => {
  for (const [datasetIndex, dataset] of REAL_DATASETS.entries()) {
    const duration = dataset.market.timeframe === '1h' ? 3_600_000 : 86_400_000;
    const lastOpen = dataset.candles.at(-1)?.openTime ?? 0;
    for (const key of AUDITED_KEYS) {
      const series = computeVoteSeries({
        strategy: strategyOf(key),
        market: dataset.market,
        candles: dataset.candles,
        sentiments: dataset.candles.map((candle) =>
          syntheticSentiment(candle.closeTime, dataset.market.sentimentSource),
        ),
      });
      for (const windowCandles of WINDOWS) {
        const goldenKey = `${DATASET_KEYS[datasetIndex]}:${key}:${windowCandles}`;
        test(goldenKey, () => {
          const golden = AUDITOR_GOLDEN[goldenKey];
          if (golden === undefined) throw new Error(`sem dourado para ${goldenKey}`);
          const window = {
            decisionTime: lastOpen,
            timeframeMilliseconds: duration,
            windowCandles,
          };
          const summary = auditVotes(series, window);
          expect(summary).toStrictEqual(parseAuditorGolden(golden));
          expect(summary).toStrictEqual(summarizeAuditor(series, window));
        });
      }
    }
  }
});

describe('auditor × oráculo no recorte real de 15 min', () => {
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
  const observations = (fearGreedRows as [number, number][]).map(([observedAt, value]) => ({
    value,
    observedAt,
    source: MARKET.sentimentSource,
    createdAt: observedAt,
  }));
  const sentiments = selectSentiments({ candles, observations, source: MARKET.sentimentSource });
  const lastOpen = candles.at(-1)?.openTime ?? 0;

  for (const key of AUDITED_KEYS) {
    const series = computeVoteSeries({
      strategy: strategyOf(key),
      market: MARKET,
      candles,
      sentiments,
    });
    for (const windowCandles of WINDOWS) {
      const goldenKey = `${SLICE_NAME}:${key}:${windowCandles}`;
      test(goldenKey, () => {
        const golden = AUDITOR_GOLDEN_15M[goldenKey];
        if (golden === undefined) throw new Error(`sem dourado para ${goldenKey}`);
        const window = {
          decisionTime: lastOpen,
          timeframeMilliseconds: D_15M,
          windowCandles,
        };
        const summary = auditVotes(series, window);
        expect(summary).toStrictEqual(parseAuditorGolden(golden));
        expect(summary).toStrictEqual(summarizeAuditor(series, window));
      });
    }
  }
});

// Uma previsão por resultado; a última vela é a vela `t` da decisão (sem resultado ainda).
type Outcome = 'hit' | 'miss' | 'hitDown' | 'missDown' | 'tie' | 'noSide' | 'unread';
const OUTCOME_RULE: Readonly<Record<Outcome, { vote: Vote; delta: number }>> = {
  hit: { vote: 1, delta: 1 },
  miss: { vote: 1, delta: -1 },
  hitDown: { vote: -1, delta: -1 },
  missDown: { vote: -1, delta: 1 },
  tie: { vote: 1, delta: 0 },
  noSide: { vote: 0, delta: 1 },
  unread: { vote: null, delta: 1 },
};

function seriesOf(outcomes: readonly Outcome[]): { series: Reading[]; decisionTime: number } {
  let close = 1000;
  const series: Reading[] = outcomes.map((outcome, index) => {
    const reading: Reading = {
      openTime: index * D,
      close: String(close),
      vote: OUTCOME_RULE[outcome].vote,
      isMissing: false,
      atr: null,
    };
    close += OUTCOME_RULE[outcome].delta;
    return reading;
  });
  series.push({
    openTime: outcomes.length * D,
    close: String(close),
    vote: null,
    isMissing: false,
    atr: null,
  });
  return { series, decisionTime: outcomes.length * D };
}

function repeat(outcome: Outcome, count: number): Outcome[] {
  return Array.from({ length: count }, () => outcome);
}

function audit(outcomes: readonly Outcome[], windowCandles = 2880): AuditSummary {
  const { series, decisionTime } = seriesOf(outcomes);
  return auditVotes(series, { decisionTime, timeframeMilliseconds: D, windowCandles });
}

describe('contagem à mão', () => {
  test('acerto, erro e "sempre sobe": 2 acertos e 1 erro dão 0,6666 (a 4 casas, para baixo)', () => {
    const summary = audit(['hit', 'hit', 'miss']);
    expect(summary).toMatchObject({ predictions: 3, counted: 3, hits: 2, misses: 1, upMoves: 2 });
    expect([summary.hitRate, summary.upRate]).toStrictEqual(['0.6666', '0.6666']);
    expect(summary.verdict).toBe('too_few');
    expect(summary.weight).toBe('0');
  });

  test('voto contra (-1) acerta quando o fechamento desce', () => {
    const summary = audit(['hitDown', 'missDown']);
    expect(summary).toMatchObject({
      hits: 1,
      misses: 1,
      upMoves: 1,
      hitRate: '0.5',
      upRate: '0.5',
    });
  });

  test('sem leitura, sem lado e empate não entram nas contadas', () => {
    const summary = audit(['unread', 'noSide', 'tie', 'hit']);
    expect(summary).toMatchObject({
      predictions: 4,
      unread: 1,
      noSide: 1,
      ties: 1,
      gap: 0,
      counted: 1,
      hits: 1,
    });
  });

  test('lacuna: se a vela seguinte não existe, o resultado nunca chega e a previsão não conta', () => {
    const { series, decisionTime } = seriesOf(['hit', 'hit', 'hit', 'hit']);
    const holed = series.filter((reading) => reading.openTime !== 2 * D);
    const summary = auditVotes(holed, {
      decisionTime,
      timeframeMilliseconds: D,
      windowCandles: 2880,
    });
    expect(summary).toMatchObject({ predictions: 3, gap: 1, counted: 2, hits: 2 });
  });

  test('sem nenhuma contada: taxas, limites e peso vazios, "poucas previsões"', () => {
    expect(audit(['unread', 'noSide'])).toMatchObject({
      counted: 0,
      hitRate: null,
      upRate: null,
      lower: null,
      upper: null,
      verdict: 'too_few',
      weight: '0',
    });
  });
});

describe('janela e horizonte', () => {
  test('conta p em (t − (W + 1)·d, t − d]: só as W previsões mais novas com resultado', () => {
    const summary = audit(['miss', 'miss', 'miss', 'hit', 'hit', 'hit'], 3);
    expect(summary).toMatchObject({ predictions: 3, hits: 3, misses: 0 });
  });

  test('a vela t nunca conta e nada depois de t entra (sem lookahead)', () => {
    const { series, decisionTime } = seriesOf(['hit', 'miss', 'hit', 'hit']);
    const voted = series.map((reading) =>
      reading.openTime === decisionTime ? { ...reading, vote: 1 as const } : reading,
    );
    const future: Reading[] = [1, 2, 3].map((step) => ({
      openTime: decisionTime + step * D,
      close: String(900 + step),
      vote: 1,
      isMissing: false,
      atr: null,
    }));
    const window = { decisionTime, timeframeMilliseconds: D, windowCandles: 2880 };
    const plain = auditVotes(series, window);
    expect(auditVotes(voted, window)).toStrictEqual(plain);
    expect(auditVotes([...voted, ...future], window)).toStrictEqual(plain);
    expect(plain.predictions).toBe(4);
  });
});

describe('veredito e peso nas bordas (Wilson único, D4-A)', () => {
  function mix(hits: number, misses: number): Outcome[] {
    const outcomes: Outcome[] = [];
    for (let index = 0; index < Math.max(hits, misses); index += 1) {
      if (index < hits) outcomes.push('hit');
      if (index < misses) outcomes.push('miss');
    }
    return outcomes;
  }

  test('29 contadas é "em observação" mesmo acertando todas; 30 contadas já julga', () => {
    const observed = audit(repeat('hit', 29));
    expect(observed).toMatchObject({ counted: 29, verdict: 'too_few', weight: '0' });
    expect(observed.lower).not.toBeNull();
    const judged = audit(repeat('hit', 30));
    const { lower } = wilsonLimitsOf({ hits: 30, counted: 30 });
    expect(judged).toMatchObject({ counted: 30, verdict: 'above', lower });
    expect(judged.weight).toBe(weightOf('above', lower));
    expect(judged.weight).not.toBe('0');
  });

  test('o limite inferior encostando em 0,5: 60 de 100 prova valor (peso pequeno), 59 de 100 não', () => {
    const above = audit(mix(60, 40));
    expect(above.verdict).toBe(verdictOf({ hits: 60, counted: 100 }));
    expect(above.verdict).toBe('above');
    const { lower } = wilsonLimitsOf({ hits: 60, counted: 100 });
    expect(above.lower).toBe(lower);
    expect(above.weight).toBe(weightOf('above', lower));
    expect(Number(above.weight)).toBeGreaterThan(0);
    expect(Number(above.weight)).toBeLessThan(0.01);
    const even = audit(mix(59, 41));
    expect(even.verdict).toBe('even');
    expect(even.weight).toBe('0');
  });

  test('21 de 30 prova valor, 20 de 30 é igual à moeda e 9 de 30 errou mais que ela', () => {
    expect(audit(mix(21, 9)).verdict).toBe('above');
    expect(audit(mix(20, 10)).verdict).toBe('even');
    const below = audit(mix(9, 21));
    expect(below.verdict).toBe('below');
    expect(below.weight).toBe('0');
  });

  test('toda contagem até 120 dá veredito e limites do oráculo', () => {
    for (let counted = 1; counted <= 40; counted += 1) {
      for (let hits = 0; hits <= counted; hits += 1) {
        const summary = audit(mix(hits, counted - hits));
        expect(summary.counted).toBe(counted);
        expect(summary.verdict).toBe(verdictOf({ hits, counted }));
        expect({ lower: summary.lower, upper: summary.upper }).toStrictEqual(
          wilsonLimitsOf({ hits, counted }),
        );
      }
    }
  });
});
