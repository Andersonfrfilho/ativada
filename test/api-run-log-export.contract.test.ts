// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { FillInput, OrderInput, SignalInput } from '../packages/database/src/index.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  HOUR,
  MISSING_ID,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const RUNS = '/v1/runs';
const FIRST = Date.UTC(2025, 0, 1);
const LOG_COLUMNS = [
  'time',
  'event',
  'action',
  'side',
  'order_key',
  'order_type',
  'purpose',
  'status',
  'score',
  'regime',
  'price',
  'limit_price',
  'trigger_price',
  'quantity',
  'notional',
  'fee',
  'risk_amount',
  'stop_distance',
  'target_distance',
  'last_event_time',
  'reason',
] as const;
const LOG_HEADER = LOG_COLUMNS.join(',');
const EXACT_DECIMAL = '1234.567890123456789';
const INJECTION = '=HYPERLINK("http://evil.test","x")';
const PAGE = 1_000;

type Column = (typeof LOG_COLUMNS)[number];

let harness: RunsHarness;
let runId: string;

// Uma linha do registro a partir dos campos que ela preenche: o resto vai vazio, na ordem do cabeçalho.
function line(fields: Partial<Record<Column, string>>): string {
  return LOG_COLUMNS.map((column) => fields[column] ?? '').join(',');
}

function at(hours: number): string {
  return new Date(FIRST + hours * HOUR).toISOString();
}

async function createOwnRun(subject: string, target: RunsHarness = harness): Promise<string> {
  const seeded = await target.seedStrategy(subject, 'log');
  const created = await target.runs.repository.createRun(target.scopeOf(subject), {
    strategyVersionId: seeded.versionId,
    kind: 'backtest',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    runParameters: { symbol: 'BTCUSDT' },
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: FIRST,
    periodEnd: FIRST + 5_000 * HOUR,
    migratedFromRunId: undefined,
  });
  if (created === undefined) throw new Error('execução semente não criada');
  return created.id;
}

function signal(hours: number, overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    candleTime: FIRST + hours * HOUR,
    action: 'HOLD',
    score: '0',
    regime: 'none',
    votes: [],
    indicators: {},
    sentimentObservation: undefined,
    reason: 'Neutro',
    ...overrides,
  };
}

function order(key: string, hours: number, overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    engineKey: key,
    side: 'buy',
    type: 'market',
    purpose: 'entry',
    status: 'filled',
    reason: undefined,
    quantity: '0.04587',
    price: '93777.8',
    limitPrice: undefined,
    triggerPrice: undefined,
    riskAmount: '99.00016002',
    stopDistance: '1926.31499249723',
    targetDistance: EXACT_DECIMAL,
    eligibleCandles: undefined,
    createdCandleTime: FIRST + hours * HOUR,
    expiresCandleTime: undefined,
    lastEventCandleTime: FIRST + (hours + 1) * HOUR,
    ...overrides,
  };
}

function fill(key: string, hours: number, overrides: Partial<FillInput> = {}): FillInput {
  return {
    orderKey: key,
    positionKey: `position-of-${key}`,
    candleTime: FIRST + hours * HOUR,
    side: 'buy',
    price: '93777.8',
    quantity: '0.04587',
    notional: '4301.4',
    fee: '4.3014',
    ...overrides,
  };
}

beforeAll(async () => {
  harness = await createRunsHarness();
  runId = await createOwnRun(SUBJECT_A);
  // Semeado FORA de ordem de propósito: quem ordena é o registro, não quem grava.
  harness.runs.seed(runId, 'fills', [fill('order-1', 3, { side: 'sell' }), fill('order-0', 2)]);
  harness.runs.seed(runId, 'signals', [
    signal(2, { action: 'SELL', score: '-3.5', regime: 'ranging', reason: INJECTION }),
    signal(0),
    signal(1, {
      action: 'BUY',
      score: '3.5',
      regime: 'trending',
      reason: 'Compra 3/4: tendência, MACD e volume confirmam',
    }),
  ]);
  harness.runs.seed(runId, 'orders', [
    order('order-1', 2, {
      side: 'sell',
      purpose: 'exit',
      reason: 'opposite_signal',
      riskAmount: undefined,
      stopDistance: undefined,
      targetDistance: undefined,
    }),
    order('order-0', 1),
  ]);
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: a cota de exportações por minuto não passa de um para outro.
beforeEach(() => {
  harness.clock.now += 120_000;
});

async function download(
  path: string = `${RUNS}/${runId}/log.csv`,
  subject: string = SUBJECT_A,
): Promise<{ response: Response; text: string }> {
  const response = await harness.call({ subject, path });
  return { response, text: await response.text() };
}

async function captureRejection(pending: Promise<unknown>): Promise<unknown> {
  return pending.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('GET /v1/runs/:id/log.csv: o registro cronológico da execução', () => {
  test('exige token', async () => {
    expect((await harness.call({ path: `${RUNS}/${runId}/log.csv` })).status).toBe(401);
  });

  test('resposta: CSV UTF-8, anexo, no-store, nome do arquivo estável', async () => {
    const { response } = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="run-${runId}-log.csv"`,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('o cabeçalho é fixo: 21 colunas, nesta ordem', async () => {
    const { text } = await download();
    expect(text.split('\r\n')[0]).toBe(LOG_HEADER);
    expect(LOG_COLUMNS).toHaveLength(21);
    expect(text.endsWith('\r\n')).toBe(true);
  });

  test('sinais, ordens e preenchimentos em ordem cronológica; no mesmo candle, preenchimento → sinal → ordem', async () => {
    const { text } = await download();
    expect(text.split('\r\n').slice(1, -1)).toStrictEqual([
      line({
        time: at(0),
        event: 'signal',
        action: 'HOLD',
        score: '0',
        regime: 'none',
        reason: 'Neutro',
      }),
      line({
        time: at(1),
        event: 'signal',
        action: 'BUY',
        score: '3.5',
        regime: 'trending',
        reason: '"Compra 3/4: tendência, MACD e volume confirmam"',
      }),
      line({
        time: at(1),
        event: 'order',
        side: 'buy',
        order_key: 'order-0',
        order_type: 'market',
        purpose: 'entry',
        status: 'filled',
        price: '93777.8',
        quantity: '0.04587',
        risk_amount: '99.00016002',
        stop_distance: '1926.31499249723',
        target_distance: EXACT_DECIMAL,
        last_event_time: at(2),
      }),
      line({
        time: at(2),
        event: 'fill',
        side: 'buy',
        order_key: 'order-0',
        price: '93777.8',
        quantity: '0.04587',
        notional: '4301.4',
        fee: '4.3014',
      }),
      line({
        time: at(2),
        event: 'signal',
        action: 'SELL',
        score: '-3.5',
        regime: 'ranging',
        reason: `"'${INJECTION.replaceAll('"', '""')}"`,
      }),
      line({
        time: at(2),
        event: 'order',
        side: 'sell',
        order_key: 'order-1',
        order_type: 'market',
        purpose: 'exit',
        status: 'filled',
        price: '93777.8',
        quantity: '0.04587',
        last_event_time: at(3),
        reason: 'opposite_signal',
      }),
      line({
        time: at(3),
        event: 'fill',
        side: 'sell',
        order_key: 'order-1',
        price: '93777.8',
        quantity: '0.04587',
        notional: '4301.4',
        fee: '4.3014',
      }),
    ]);
  });

  test('decimais saem como o motor os emitiu: 19 algarismos intactos, nunca em notação científica', async () => {
    const { text } = await download();
    expect(text).toContain(`,${EXACT_DECIMAL},`);
    expect(text).toContain(',-3.5,');
    expect(text).not.toMatch(/\de[+-]?\d/u);
  });

  test('tempos em UTC ISO com milissegundos e Z', async () => {
    const { text } = await download();
    for (const row of text.split('\r\n').slice(1, -1)) {
      expect(row).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z,/u);
    }
  });

  test('PROTEÇÃO CONTRA INJEÇÃO DE FÓRMULA no motivo e na chave da ordem', async () => {
    const poisoned = await createRunsHarness();
    try {
      const id = await createOwnRun(SUBJECT_A, poisoned);
      poisoned.runs.seed(id, 'orders', [order('@order', 1), order('+1+1', 2)]);
      poisoned.runs.seed(id, 'signals', [
        signal(1, { reason: '-2+3' }),
        signal(2, { reason: '\tcom-tab' }),
      ]);
      const response = await poisoned.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` });
      const text = await response.text();
      for (const injected of ['=cmd', '@order', '+1+1', '-2+3', '\tcom-tab']) {
        expect(text.includes(`,${injected},`)).toBe(false);
        expect(text.includes(`,${injected}\r\n`)).toBe(false);
      }
      expect(text).toContain(",'@order,");
      expect(text).toContain(",'+1+1,");
      expect(text).toContain(",'-2+3\r\n");
      expect(text).toContain(",'\tcom-tab\r\n");
    } finally {
      await poisoned.stop();
    }
  });

  test('vírgula, aspas e quebra de linha na célula são escapadas (RFC 4180)', async () => {
    const { text } = await download();
    expect(text).toContain('"Compra 3/4: tendência, MACD e volume confirmam"');
    expect(text).toContain('""http://evil.test""');
  });

  test('jamais inclui user_id, hashes internos nem o estado do motor', async () => {
    const { text } = await download();
    for (const forbidden of [
      'user_id',
      'userId',
      'runHash',
      'configHash',
      'engineState',
      'votes',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  test('execução própria sem linhas devolve só o cabeçalho', async () => {
    const empty = await createOwnRun(SUBJECT_B);
    const { text } = await download(`${RUNS}/${empty}/log.csv`, SUBJECT_B);
    expect(text).toBe(`${LOG_HEADER}\r\n`);
  });

  test('parâmetro de consulta não existe neste arquivo: 400', async () => {
    for (const query of ['table=signals', 'format=csv']) {
      const { response } = await download(`${RUNS}/${runId}/log.csv?${query}`);
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
  });
});

describe('log.csv: só do dono e idêntico ao inexistente', () => {
  test('execução de outro dono, inexistente ou malformada: o MESMO 404 e nenhum byte de CSV', async () => {
    const foreign = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${runId}/log.csv` });
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}/log.csv`,
    });
    expect(foreign.headers.get('Content-Disposition')).toBeNull();
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/nao-uuid/log.csv`,
      }),
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}/log.csv`,
      }),
    });
  });

  test('o dono B não vê no registro dele nada do que A semeou', async () => {
    const own = await createOwnRun(SUBJECT_B);
    const { text } = await download(`${RUNS}/${own}/log.csv`, SUBJECT_B);
    expect(text).not.toContain('order-0');
    expect(text).not.toContain('Compra 3/4');
  });
});

describe('log.csv: um fluxo por páginas, com tetos', () => {
  async function seedBig(target: RunsHarness): Promise<string> {
    const id = await createOwnRun(SUBJECT_A, target);
    target.runs.seed(
      id,
      'signals',
      Array.from({ length: 1_200 }, (_u, i) => signal(i)),
    );
    target.runs.seed(
      id,
      'orders',
      Array.from({ length: 900 }, (_u, i) => order(`o-${i}`, i)),
    );
    target.runs.seed(
      id,
      'fills',
      Array.from({ length: 900 }, (_u, i) => fill(`o-${i}`, i + 1)),
    );
    return id;
  }

  test('nada além da primeira página é lido antes do cliente consumir, e o resto vem de mil em mil', async () => {
    const big = await createRunsHarness();
    try {
      const id = await seedBig(big);
      const response = await big.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` });
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('resposta sem corpo');
      await reader.read();
      expect(big.runs.listCalls.log.length).toBeLessThanOrEqual(1);
      let total = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += (chunk.value as Uint8Array).length;
      }
      expect(total).toBeGreaterThan(0);
      expect(big.runs.listCalls.log).toStrictEqual([PAGE, PAGE, PAGE]);
    } finally {
      await big.stop();
    }
  });

  test('3.000 eventos viram 3.000 linhas, sem repetir nem perder nenhuma na fronteira das páginas', async () => {
    const big = await createRunsHarness();
    try {
      const id = await seedBig(big);
      const response = await big.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` });
      const rows = (await response.text()).split('\r\n').slice(1, -1);
      expect(rows).toHaveLength(3_000);
      expect(new Set(rows).size).toBe(3_000);
      const times = rows.map((row) => row.split(',')[0] ?? '');
      expect(times).toStrictEqual([...times].sort());
    } finally {
      await big.stop();
    }
  });

  test('passou do teto de linhas: o corpo falha, nunca um arquivo cortado que parece completo', async () => {
    const capped = await createRunsHarness({ csvLimits: { maxRows: 1_500 } });
    try {
      const id = await seedBig(capped);
      const response = await capped.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` });
      expect(response.status).toBe(200);
      expect(await captureRejection(response.text())).toBeInstanceOf(Error);
    } finally {
      await capped.stop();
    }
  });

  test('passou do teto de tempo: o corpo falha', async () => {
    const slow = await createRunsHarness({ csvLimits: { maxDurationMilliseconds: 1_000 } });
    try {
      const id = await seedBig(slow);
      const response = await slow.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` });
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('resposta sem corpo');
      await reader.read();
      slow.clock.now += 5_000;
      const drained = (async (): Promise<void> => {
        for (;;) {
          if ((await reader.read()).done) return;
        }
      })();
      expect(await captureRejection(drained)).toBeInstanceOf(Error);
    } finally {
      await slow.stop();
    }
  });

  test('divide a cota de 10 exportações por minuto com o export.csv', async () => {
    const limited = await createRunsHarness();
    try {
      const id = await createOwnRun(SUBJECT_A, limited);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await (await limited.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` })).text();
        await (await limited.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/export.csv` })).text();
      }
      const blocked = await limited.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/log.csv` });
      expect(blocked.status).toBe(429);
    } finally {
      await limited.stop();
    }
  });
});
