// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { EquityPointInput, SignalInput } from '../packages/database/src/index.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  HOUR,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const RUNS = '/v1/runs';
const FIRST = Date.UTC(2025, 0, 1);

const HEADERS = {
  trades:
    'engine_key,status,entry_price,quantity,stop_price,target_price,entry_fee,exit_price,exit_fee,net_profit,exit_reason,opened_candle_time,closed_candle_time',
  signals: 'candle_time,action,score,regime,reason,votes,indicators,sentiment_observation',
  fills: 'candle_time,order_key,position_key,side,price,quantity,notional,fee',
  equity: 'candle_time,equity,equity_at_low,benchmark',
  windows:
    'window_index,train_start,train_end,test_start,test_end,status,eligible_combinations,best_params,in_sample,out_of_sample',
} as const;

const INJECTIONS = ["=cmd|'/C calc'!A0", '+1+1', '-2+3', '@SUM(A1:A9)', '\tcom-tab', '\rcom-cr'];

let harness: RunsHarness;
let runId: string;

async function createOwnRun(subject: string): Promise<string> {
  const seeded = await harness.seedStrategy(subject, 'csv');
  const created = await harness.runs.repository.createRun(harness.scopeOf(subject), {
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

function equityRows(count: number): EquityPointInput[] {
  return Array.from({ length: count }, (_u, i) => ({
    candleTime: FIRST + i * HOUR,
    equity: `${10_000 + i}.123456789`,
    equityAtLow: `-${i}.5`,
    benchmark: `${10_000 - i}`,
  }));
}

function injectedSignals(): SignalInput[] {
  return INJECTIONS.map((reason, i) => ({
    candleTime: FIRST + i * HOUR,
    action: 'BUY' as const,
    score: '-2.5',
    regime: 'trending' as const,
    votes: [{ ruleId: '=ema', vote: 1 }],
    indicators: { 'rule:ema': 100.5 },
    sentimentObservation: undefined,
    reason,
  }));
}

beforeAll(async () => {
  harness = await createRunsHarness();
  runId = await createOwnRun(SUBJECT_A);
  harness.runs.seed(runId, 'equity', equityRows(2_500));
  harness.runs.seed(runId, 'signals', injectedSignals());
  harness.runs.seed(runId, 'positions', [
    {
      engineKey: '=HYPERLINK("http://evil.test","x")',
      status: 'closed',
      entryPrice: '30000.5',
      quantity: '0.01',
      stopPrice: '29000',
      targetPrice: '31000',
      entryFee: '0.3',
      exitPrice: '29500',
      exitFee: '0.3',
      netProfit: '-5.6',
      exitReason: 'stop',
      openedCandleTime: FIRST,
      closedCandleTime: FIRST + HOUR,
    },
  ]);
  harness.runs.seed(runId, 'fills', [
    {
      orderKey: '@order',
      positionKey: 'p,1',
      candleTime: FIRST,
      side: 'buy',
      price: '30000',
      quantity: '0.01',
      notional: '300',
      fee: '0.3',
    },
  ]);
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: a cota de 10 exportações por minuto não passa de um para outro.
beforeEach(() => {
  harness.clock.now += 120_000;
});

// O corpo em fluxo que aborta rejeita a leitura: o teste captura o erro em vez de depender do `rejects`.
async function captureRejection(pending: Promise<unknown>): Promise<unknown> {
  return pending.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function download(table?: string): Promise<{ response: Response; text: string }> {
  const query = table === undefined ? '' : `?table=${table}`;
  const response = await harness.call({
    subject: SUBJECT_A,
    path: `${RUNS}/${runId}/export.csv${query}`,
  });
  return { response, text: await response.text() };
}

describe('GET /v1/runs/:id/export.csv', () => {
  test('exige token', async () => {
    expect((await harness.call({ path: `${RUNS}/${runId}/export.csv` })).status).toBe(401);
  });

  test('cabeçalho de resposta: CSV UTF-8, anexo, no-store, nome do arquivo estável', async () => {
    const { response } = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="run-${runId}-trades.csv"`,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('a tabela padrão é trades; cada tabela tem cabeçalho fixo e estável', async () => {
    expect((await download()).text.split('\r\n')[0]).toBe(HEADERS.trades);
    for (const [table, header] of Object.entries(HEADERS)) {
      const { text } = await download(table);
      expect({ table, header: text.split('\r\n')[0] }).toStrictEqual({ table, header });
      expect(text.endsWith('\r\n')).toBe(true);
    }
  });

  test('decimais saem como texto exato (negativos inclusive) e números como números', async () => {
    const { text } = await download('equity');
    const lines = text.split('\r\n');
    expect(lines[1]).toBe(`${FIRST},10000.123456789,-0.5,10000`);
    expect(lines[2]).toBe(`${FIRST + HOUR},10001.123456789,-1.5,9999`);
    const trades = (await download('trades')).text.split('\r\n');
    expect(trades[1]).toContain(',-5.6,');
    expect(trades[1]).not.toContain("'-5.6");
  });

  test('PROTEÇÃO CONTRA INJEÇÃO DE FÓRMULA: texto iniciado por = + - @ tab ou CR ganha apóstrofo', async () => {
    const { text } = await download('signals');
    expect(text).toContain(",'=cmd|'/C calc'!A0,");
    for (const injected of INJECTIONS) {
      expect(text.includes(`,${injected},`)).toBe(false);
      expect(text.includes(`,"${injected}"`)).toBe(false);
    }
    expect(text).toContain(",'+1+1,");
    expect(text).toContain(",'-2+3,");
    expect(text).toContain(",'@SUM(A1:A9),");
    expect(text).toContain(",'\tcom-tab,");
    expect(text).toContain(',"\'\rcom-cr",');
    // o score negativo é decimal exato: continua número
    expect(text).toContain(',-2.5,');
    const trades = (await download('trades')).text;
    expect(trades).toContain(`'=HYPERLINK`);
    const fills = (await download('fills')).text;
    expect(fills).toContain(",'@order,");
  });

  test('vírgula, aspas e quebra de linha na célula são escapadas (RFC 4180)', async () => {
    const { text } = await download('fills');
    expect(text).toContain('"p,1"');
    const trades = (await download('trades')).text;
    expect(trades).toContain('""http://evil.test""');
  });

  test('jamais inclui user_id nem hashes internos', async () => {
    for (const table of Object.keys(HEADERS)) {
      const { text } = await download(table);
      for (const forbidden of [
        'user_id',
        'userId',
        'runHash',
        'run_hash',
        'configHash',
        'config_hash',
        'engineState',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  test('é um FLUXO por páginas: nada além da primeira página é lido antes do cliente consumir', async () => {
    const before = harness.runs.listCalls.equity.length;
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}/export.csv?table=equity`,
    });
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('resposta sem corpo');
    await reader.read();
    expect(harness.runs.listCalls.equity.length - before).toBeLessThanOrEqual(1);
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
    }
    // 2.500 linhas em páginas de 1.000: 3 leituras do repositório, cada uma com o limite da página
    expect(harness.runs.listCalls.equity.slice(before)).toStrictEqual([1_000, 1_000, 1_000]);
  });

  test('tabela desconhecida, orders, parâmetro repetido ou extra: 400', async () => {
    for (const query of ['table=orders', 'table=x', 'table=trades&table=fills', 'format=csv']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/export.csv?${query}`,
      });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
  });

  test('execução de outro dono, inexistente ou malformada: o MESMO 404 e nenhum byte de CSV', async () => {
    const foreign = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${runId}/export.csv?table=equity`,
    });
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}/export.csv?table=equity`,
    });
    expect(foreign.headers.get('Content-Disposition')).toBeNull();
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    const malformed = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/nao-uuid/export.csv`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: malformed,
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}/export.csv`,
      }),
    });
  });

  test('execução própria sem linhas devolve só o cabeçalho', async () => {
    const empty = await createOwnRun(SUBJECT_B);
    const response = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${empty}/export.csv?table=windows`,
    });
    expect(await response.text()).toBe(`${HEADERS.windows}\r\n`);
  });

  test('limite de 10 exportações por minuto por usuário', async () => {
    const limited = await createRunsHarness();
    try {
      const id = await (async (): Promise<string> => {
        const seeded = await limited.seedStrategy(SUBJECT_A, 'x');
        const created = await limited.runs.repository.createRun(limited.scopeOf(SUBJECT_A), {
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
          periodEnd: FIRST + HOUR,
          migratedFromRunId: undefined,
        });
        return created?.id ?? '';
      })();
      const policy = limited.app.policies.RATE_LIMIT_POLICY.RUN_EXPORT;
      expect(policy.limit).toBe(10);
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const response = await limited.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${id}/export.csv`,
        });
        expect(response.status).toBe(200);
        await response.text();
      }
      expect(
        (await limited.call({ subject: SUBJECT_A, path: `${RUNS}/${id}/export.csv` })).status,
      ).toBe(429);
    } finally {
      await limited.stop();
    }
  });
});

describe('tetos do arquivo: o fluxo é abortado, nunca cortado em silêncio', () => {
  test('passou do teto de linhas: o corpo falha', async () => {
    const capped = await createRunsHarness({ csvLimits: { maxRows: 1_500 } });
    try {
      const seeded = await capped.seedStrategy(SUBJECT_A, 'teto');
      const created = await capped.runs.repository.createRun(capped.scopeOf(SUBJECT_A), {
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
        periodEnd: FIRST + HOUR,
        migratedFromRunId: undefined,
      });
      const id = created?.id ?? '';
      capped.runs.seed(id, 'equity', equityRows(2_500));
      const response = await capped.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${id}/export.csv?table=equity`,
      });
      expect(response.status).toBe(200);
      expect(await captureRejection(response.text())).toBeInstanceOf(Error);
    } finally {
      await capped.stop();
    }
  });

  test('passou do teto de tempo: o corpo falha', async () => {
    const slow = await createRunsHarness({ csvLimits: { maxDurationMilliseconds: 1_000 } });
    try {
      const seeded = await slow.seedStrategy(SUBJECT_A, 'tempo');
      const created = await slow.runs.repository.createRun(slow.scopeOf(SUBJECT_A), {
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
        periodEnd: FIRST + HOUR,
        migratedFromRunId: undefined,
      });
      const id = created?.id ?? '';
      slow.runs.seed(id, 'equity', equityRows(2_500));
      const response = await slow.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${id}/export.csv?table=equity`,
      });
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('resposta sem corpo');
      await reader.read();
      slow.clock.now += 5_000;
      const drained = (async (): Promise<void> => {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) return;
        }
      })();
      expect(await captureRejection(drained)).toBeInstanceOf(Error);
    } finally {
      await slow.stop();
    }
  });
});

void readJson;
