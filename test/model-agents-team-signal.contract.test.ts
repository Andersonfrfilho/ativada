// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { TeamDecisionRecord } from '../packages/model-agents/src/index.js';
import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';
import { buildReport } from './fixtures/model-agents/team-report.fixture.js';

// T1.4 da spec 015 (RF14, plan D9): a decisão gravada de `t` vira o sinal de `t`; função pura, sem relógio e sem lookahead.

const api = await loadModelAgentsApi();
const T = 1_760_000_000_000;

function decided(action: 'buy' | 'sell' | 'hold'): TeamDecisionRecord {
  return { status: 'decided', opinionId: 'opinion-1', report: buildReport(action) };
}

function signalFor(
  record: TeamDecisionRecord | null,
  hasPosition: boolean,
): ReturnType<typeof api.toTeamSignal> {
  return api.toTeamSignal({ record, hasPosition, candleOpenTime: T });
}

describe('matriz ação × posição', () => {
  test('compra sem posição vira BUY, com +100', () => {
    const signal = signalFor(decided('buy'), false);
    expect(signal.action).toBe('BUY');
    expect(signal.score).toBe('100');
    expect(signal.source).toBe('report');
    expect(signal.reason).toBe('Entrada na retomada da tendência.');
  });

  test('compra com posição aberta é ignorada (HOLD) e diz por quê', () => {
    const signal = signalFor(decided('buy'), true);
    expect(signal.action).toBe('HOLD');
    expect(signal.score).toBe('0');
    expect(signal.source).toBe('ignored');
    expect(signal.reason).toBe('ignorada: já comprada');
  });

  test('venda com posição vira SELL, com −100', () => {
    const signal = signalFor(decided('sell'), true);
    expect(signal.action).toBe('SELL');
    expect(signal.score).toBe('-100');
    expect(signal.source).toBe('report');
  });

  test('venda sem posição é ignorada: nunca há venda a descoberto', () => {
    const signal = signalFor(decided('sell'), false);
    expect(signal.action).toBe('HOLD');
    expect(signal.source).toBe('ignored');
    expect(signal.reason).toBe('ignorada: sem posição');
  });

  test('esperar é HOLD com e sem posição, com o motivo do gestor', () => {
    for (const hasPosition of [false, true]) {
      const signal = signalFor(decided('hold'), hasPosition);
      expect(signal.action).toBe('HOLD');
      expect(signal.score).toBe('0');
      expect(signal.source).toBe('report');
      expect(signal.reason).toBe('Entrada na retomada da tendência.');
    }
  });
});

describe('sem leitura (RF14)', () => {
  test('sem linha, linha pendente, falha e pulo viram HOLD "equipe sem leitura" com o código', () => {
    const cases: readonly [TeamDecisionRecord | null, string][] = [
      [null, 'MISSING'],
      [{ status: 'pending' }, 'PENDING'],
      [{ status: 'failed', failureCode: 'TIMEOUT' }, 'TIMEOUT'],
      [{ status: 'skipped', failureCode: 'BUDGET_EXHAUSTED' }, 'BUDGET_EXHAUSTED'],
    ];
    for (const [record, code] of cases) {
      for (const hasPosition of [false, true]) {
        const signal = signalFor(record, hasPosition);
        expect(signal.action).toBe('HOLD');
        expect(signal.source).toBe('no_reading');
        expect(signal.reason).toBe('equipe sem leitura');
        expect(signal.failureCode).toBe(code);
        expect(signal.opinionId).toBeNull();
        expect(signal.levels).toBeNull();
      }
    }
  });

  test('o motivo do HOLD sem leitura não vaza o texto de erro do provedor', () => {
    const signal = signalFor({ status: 'failed', failureCode: 'UNAVAILABLE' }, false);
    expect(signal.reason).not.toContain('UNAVAILABLE');
  });
});

describe('o que o sinal carrega', () => {
  test('a vela do sinal é exatamente a vela de decisão `t`', () => {
    expect(signalFor(decided('buy'), false).candleOpenTime).toBe(T);
    expect(signalFor(null, false).candleOpenTime).toBe(T);
    expect(
      api.toTeamSignal({ record: decided('sell'), hasPosition: true, candleOpenTime: T + 900_000 })
        .candleOpenTime,
    ).toBe(T + 900_000);
  });

  test('o id da linha gravada acompanha o sinal, para a trilha de auditoria', () => {
    expect(signalFor(decided('buy'), false).opinionId).toBe('opinion-1');
    expect(signalFor(decided('buy'), true).opinionId).toBe('opinion-1');
  });

  test('os níveis da equipe vêm junto da compra (e da ignorada), e são nulos em venda e espera', () => {
    expect(signalFor(decided('buy'), false).levels).toStrictEqual({
      entryPrice: '100.5',
      targetPrice: '102',
      stopPrice: '99.5',
    });
    expect(signalFor(decided('buy'), true).levels).not.toBeNull();
    expect(signalFor(decided('sell'), true).levels).toBeNull();
    expect(signalFor(decided('hold'), false).levels).toBeNull();
  });
});

describe('determinismo', () => {
  test('o mesmo registro e a mesma carteira dão o mesmo sinal, byte a byte', () => {
    const first = JSON.stringify(signalFor(decided('buy'), false));
    const second = JSON.stringify(signalFor(decided('buy'), false));
    expect(second).toBe(first);
  });

  test('a entrada não é alterada', () => {
    const record = decided('buy');
    const before = JSON.stringify(record);
    signalFor(record, false);
    signalFor(record, true);
    expect(JSON.stringify(record)).toBe(before);
  });

  test('o sinal não depende de nada além do registro, da posição e da vela (sem relógio)', () => {
    const outputs = new Set<string>();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      outputs.add(JSON.stringify(signalFor(decided('sell'), true)));
    }
    expect(outputs.size).toBe(1);
  });
});
