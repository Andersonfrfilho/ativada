// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeWilsonInterval, judgeAgainstCoinFlip } from '../packages/statistics/src/index.js';
import type { AuditReading } from '../packages/model-agents/src/index.js';
import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';
import {
  summarizeOracle,
  verdictForCounts,
  type OracleReading,
} from './fixtures/model-agents/auditor-oracle.fixture.js';

// T1.5 da spec 015 (RF16): o auditor de acertos de lado contra um oráculo `bigint` independente do `src`, e o veredito
// contra o Wilson ÚNICO de `@ativada/statistics`.

const api = await loadModelAgentsApi();
const WINDOW_START = 1_000;

function reading(overrides: Partial<AuditReading> = {}): AuditReading {
  return {
    kind: 'scheduled',
    status: 'decided',
    action: 'buy',
    confidence: 60,
    candleTime: WINDOW_START + 10,
    close: '100',
    nextClose: '101',
    ...overrides,
  };
}

function audit(readings: readonly AuditReading[]): ReturnType<typeof api.auditOpinions> {
  return api.auditOpinions({ readings, windowStartMilliseconds: WINDOW_START });
}

function repeat(count: number, overrides: Partial<AuditReading>): AuditReading[] {
  return Array.from({ length: count }, () => reading(overrides));
}

// Soma `hits` acertos de compra e `misses` erros de compra.
function buys(hits: number, misses: number): AuditReading[] {
  return [...repeat(hits, { nextClose: '101' }), ...repeat(misses, { nextClose: '99' })];
}

describe('o que conta e o que não conta (RF16)', () => {
  test('compra acerta se a vela seguinte fechou acima; venda, se fechou abaixo', () => {
    const summary = audit([
      reading({ action: 'buy', nextClose: '101' }),
      reading({ action: 'buy', nextClose: '99' }),
      reading({ action: 'sell', nextClose: '99' }),
      reading({ action: 'sell', nextClose: '101' }),
    ]);
    expect(summary.hits).toBe(2);
    expect(summary.misses).toBe(2);
    expect(summary.counted).toBe(4);
    expect(summary.hitRate).toBe('0.5');
  });

  test('empate não conta, e é contado à parte', () => {
    const summary = audit([
      reading({ nextClose: '100' }),
      reading({ action: 'sell', nextClose: '100.0' }),
    ]);
    expect(summary).toMatchObject({ counted: 0, ties: 2, hitRate: null, verdict: 'too_few' });
  });

  test('lacuna (vela seguinte inexistente) não conta, e é contada à parte', () => {
    const summary = audit([reading({ nextClose: undefined }), reading()]);
    expect(summary).toMatchObject({ counted: 1, gaps: 1, hits: 1 });
  });

  test('esperar, pendente, falha e pulo não contam', () => {
    const summary = audit([
      reading({ action: 'hold' }),
      reading({ status: 'pending', action: null, nextClose: undefined }),
      reading({ status: 'failed', action: null }),
      reading({ status: 'skipped', action: null }),
    ]);
    expect(summary).toMatchObject({ counted: 0, ties: 0, gaps: 0 });
  });

  test('pedido avulso nunca conta', () => {
    const summary = audit([
      reading({ kind: 'on_demand' }),
      reading({ kind: 'on_demand', nextClose: '99' }),
    ]);
    expect(summary.counted).toBe(0);
  });

  test('a janela começa na vela exata (inclusiva) e descarta as anteriores', () => {
    const summary = audit([
      reading({ candleTime: WINDOW_START - 1 }),
      reading({ candleTime: WINDOW_START }),
      reading({ candleTime: WINDOW_START + 1 }),
    ]);
    expect(summary.counted).toBe(2);
  });

  test('o fechamento é comparado como número decimal, não como texto', () => {
    expect(audit([reading({ close: '9.5', nextClose: '10' })]).hits).toBe(1);
    expect(audit([reading({ close: '10', nextClose: '9.5' })]).misses).toBe(1);
  });

  test('a taxa de acerto é truncada, nunca arredondada para cima (1/3 e 2/3)', () => {
    expect(audit(buys(1, 2)).hitRate).toBe('0.3333');
    expect(audit(buys(2, 1)).hitRate).toBe('0.6666');
  });

  test('empates não viram acertos no veredito (20 acertos, 10 erros e 1 empate seguem "igual")', () => {
    const summary = audit([...buys(20, 10), reading({ nextClose: '100' })]);
    expect(summary).toMatchObject({ hits: 20, counted: 30, ties: 1, verdict: 'even' });
  });

  test('a ordem das linhas não muda o resultado', () => {
    const rows = [...buys(7, 3), ...repeat(2, { action: 'sell', nextClose: '99' })];
    expect(audit([...rows].reverse())).toStrictEqual(audit(rows));
  });
});

describe('veredito contra a moeda ao ar (Wilson único)', () => {
  test('abaixo de 30 contadas é "poucas", mesmo com 100% de acerto (29 e 30)', () => {
    expect(audit(buys(29, 0)).verdict).toBe('too_few');
    expect(audit(buys(30, 0)).verdict).toBe('above');
  });

  test('em 30 contadas: 21 acertos já está acima, 20 está igual, 10 está igual e 9 está abaixo', () => {
    expect(audit(buys(21, 9)).verdict).toBe('above');
    expect(audit(buys(20, 10)).verdict).toBe('even');
    expect(audit(buys(10, 20)).verdict).toBe('even');
    expect(audit(buys(9, 21)).verdict).toBe('below');
  });

  test('os limites saem do Wilson único da casa', () => {
    const summary = audit(buys(21, 9));
    const wilson = computeWilsonInterval({ successes: 21, total: 30 });
    expect(summary.lower).toBe(wilson.lower);
    expect(summary.upper).toBe(wilson.upper);
    expect(summary.verdict).toBe(judgeAgainstCoinFlip({ hits: 21, counted: 30 }).verdict);
  });

  test('sem nenhuma contada não há limites nem taxa', () => {
    expect(audit([])).toMatchObject({ lower: null, upper: null, hitRate: null });
  });

  test('a confiança declarada NÃO entra no veredito', () => {
    const lowConfidence = audit(buys(21, 9).map((row) => ({ ...row, confidence: 1 })));
    const highConfidence = audit(buys(21, 9).map((row) => ({ ...row, confidence: 99 })));
    expect(lowConfidence.verdict).toBe(highConfidence.verdict);
    expect(lowConfidence.lower).toBe(highConfidence.lower);
  });
});

describe('confiança média quando acertou × quando errou (à parte)', () => {
  test('média por grupo, para baixo a 2 casas', () => {
    const summary = audit([
      reading({ nextClose: '101', confidence: 70 }),
      reading({ nextClose: '101', confidence: 71 }),
      reading({ nextClose: '101', confidence: 71 }),
      reading({ nextClose: '99', confidence: 40 }),
    ]);
    expect(summary.averageConfidenceOnHit).toBe('70.66');
    expect(summary.averageConfidenceOnMiss).toBe('40');
  });

  test('sem acerto ou sem erro, a média daquele grupo é nula', () => {
    expect(audit([reading()]).averageConfidenceOnMiss).toBeNull();
    expect(audit([reading({ nextClose: '99' })]).averageConfidenceOnHit).toBeNull();
  });
});

describe('contra o oráculo bigint', () => {
  test('o veredito bate com o oráculo em todas as contagens de 0 a 120', () => {
    for (let counted = 0; counted <= 120; counted += 1) {
      for (let hits = 0; hits <= counted; hits += 1) {
        expect(audit(buys(hits, counted - hits)).verdict).toBe(verdictForCounts(hits, counted));
      }
    }
  });

  test('2.000 cenários sorteados dão o mesmo resultado que o oráculo', () => {
    let seed = 20_261_017;
    const next = (limit: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % limit;
    };
    const closes = ['100', '100.5', '99.75', '101', '98.2', '100.50'];
    const actions = ['buy', 'sell', 'hold', null] as const;
    const kinds = ['scheduled', 'on_demand'] as const;
    const statuses = ['decided', 'decided', 'decided', 'pending', 'failed', 'skipped'] as const;
    for (let scenario = 0; scenario < 2_000; scenario += 1) {
      const rows: OracleReading[] = Array.from({ length: next(80) }, () => ({
        kind: kinds[next(10) === 0 ? 1 : 0] ?? 'scheduled',
        status: statuses[next(statuses.length)] ?? 'decided',
        action: actions[next(actions.length)] ?? null,
        confidence: next(4) === 0 ? null : next(101),
        candleTime: next(2_000),
        close: closes[next(closes.length)] ?? '100',
        nextClose: next(8) === 0 ? undefined : (closes[next(closes.length)] ?? '100'),
      }));
      const expected = summarizeOracle(rows, 500);
      const actual = api.auditOpinions({ readings: rows, windowStartMilliseconds: 500 });
      expect({
        counted: actual.counted,
        hits: actual.hits,
        misses: actual.misses,
        ties: actual.ties,
        gaps: actual.gaps,
        hitRate: actual.hitRate,
        verdict: actual.verdict,
        averageConfidenceOnHit: actual.averageConfidenceOnHit,
        averageConfidenceOnMiss: actual.averageConfidenceOnMiss,
      }).toStrictEqual(expected);
    }
  });
});
