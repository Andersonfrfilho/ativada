// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { FillInput, PositionInput } from '../packages/database/src/index.js';
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
const SCALE = 100_000_000n;

type Trade = Record<string, unknown> & { engineKey: string };
type Page = {
  data: Trade[];
  pagination: { nextCursor: string | null; perPage: number };
};
type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };

let harness: RunsHarness;
let runId: string;

const at = (hours: number): number => FIRST + hours * HOUR;

type Spec = {
  readonly key: string;
  readonly open: number;
  readonly close: number | undefined;
  readonly entryNotional: string;
  readonly entryFee: string;
  readonly exitNotional?: string;
  readonly exitFee?: string;
  readonly netProfit?: string;
};

function positionOf(spec: Spec): PositionInput {
  const isClosed = spec.close !== undefined;
  return {
    engineKey: spec.key,
    status: isClosed ? 'closed' : 'open',
    entryPrice: '30000.5',
    quantity: '0.01',
    stopPrice: '29000',
    targetPrice: '31000',
    entryFee: spec.entryFee,
    exitPrice: isClosed ? '30500' : undefined,
    exitFee: spec.exitFee,
    netProfit: spec.netProfit,
    exitReason: isClosed ? 'target' : undefined,
    openedCandleTime: at(spec.open),
    closedCandleTime: spec.close === undefined ? undefined : at(spec.close),
  };
}

function fillsOf(spec: Spec): FillInput[] {
  const entry: FillInput = {
    orderKey: `${spec.key}-entry`,
    positionKey: spec.key,
    candleTime: at(spec.open),
    side: 'buy',
    price: '30000.5',
    quantity: '0.01',
    notional: spec.entryNotional,
    fee: spec.entryFee,
  };
  if (spec.close === undefined || spec.exitNotional === undefined) return [entry];
  return [
    entry,
    {
      orderKey: `${spec.key}-exit`,
      positionKey: spec.key,
      candleTime: at(spec.close),
      side: 'sell',
      price: '30500',
      quantity: '0.01',
      notional: spec.exitNotional,
      fee: spec.exitFee ?? '0',
    },
  ];
}

// Contas feitas à mão (escala 8): 300,123456789 sobe para 300,12345679; 310,987654321 desce para 310,98765432.
const SPECS: readonly Spec[] = [
  {
    key: 'a',
    open: 0,
    close: 2,
    entryNotional: '300.123456789',
    entryFee: '0.45',
    exitNotional: '310.987654321',
    exitFee: '0.47',
    netProfit: '9.94419753',
  },
  {
    key: 'b',
    open: 3,
    close: 5,
    entryNotional: '99.5',
    entryFee: '0.50000001',
    exitNotional: '100.16666668',
    exitFee: '0.5',
    netProfit: '-0.33333333',
  },
  {
    key: 'c',
    open: 6,
    close: 10,
    entryNotional: '200',
    entryFee: '0.2',
    exitNotional: '210',
    exitFee: '0.21',
    netProfit: '9.59',
  },
  { key: 'd', open: 11, close: undefined, entryNotional: '412', entryFee: '0.412' },
];

async function createOwnRun(subject: string, nonce: string): Promise<string> {
  const seeded = await harness.seedStrategy(subject, nonce);
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
    periodEnd: at(100),
    migratedFromRunId: undefined,
  });
  if (created === undefined) throw new Error('execução semente não criada');
  return created.id;
}

function seed(targetRunId: string, specs: readonly Spec[]): void {
  harness.runs.seed(targetRunId, 'positions', specs.map(positionOf));
  harness.runs.seed(targetRunId, 'fills', specs.flatMap(fillsOf));
}

beforeAll(async () => {
  harness = await createRunsHarness();
  runId = await createOwnRun(SUBJECT_A, 'trades');
  seed(runId, SPECS);
});

afterAll(async () => {
  await harness.stop();
});

async function trades(query = '', subject: string | undefined = SUBJECT_A): Promise<Page> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}/trades${query}` }),
  );
  expect({ query, status }).toStrictEqual({ query, status: 200 });
  return body as Page;
}

const keysOf = (page: Page): string[] => page.data.map((trade) => trade.engineKey);

describe('valores novos de cada operação', () => {
  test('conferidos à mão contra os preenchimentos e a posição', async () => {
    const [first, second] = (await trades()).data;
    expect(first).toMatchObject({
      entryNotional: '300.123456789',
      exitNotional: '310.987654321',
      paid: '300.57345679',
      received: '310.51765432',
      fees: '0.92',
      netProfitRate: '0.03308408',
    });
    expect(second).toMatchObject({
      paid: '100.00000001',
      received: '99.66666668',
      fees: '1.00000001',
    });
  });

  test('netProfitRate arredonda para baixo (prejuízo nunca aparece menor): -0,0033333333 vira -0,00333334', async () => {
    expect((await trades()).data[1]?.['netProfitRate']).toBe('-0.00333334');
  });

  test('aberta traz compra, pago e taxa, e nenhum campo de saída', async () => {
    const open = (await trades()).data[3];
    expect(open).toMatchObject({
      engineKey: 'd',
      entryNotional: '412',
      paid: '412.412',
      fees: '0.412',
    });
    for (const field of ['exitNotional', 'received', 'netProfitRate', 'exitPrice', 'netProfit']) {
      expect(field in (open ?? {})).toBe(false);
    }
  });

  test('os campos que já existiam seguem com o mesmo nome e valor', async () => {
    const first = (await trades()).data[0];
    expect(first).toMatchObject({
      engineKey: 'a',
      status: 'closed',
      entryPrice: '30000.5',
      quantity: '0.01',
      stopPrice: '29000',
      targetPrice: '31000',
      entryFee: '0.45',
      exitPrice: '30500',
      exitFee: '0.47',
      netProfit: '9.94419753',
      exitReason: 'target',
      openedCandleTime: at(0),
      closedCandleTime: at(2),
    });
  });

  test('a página inteira lê os preenchimentos numa consulta só', async () => {
    const before = harness.runs.fillLookups.length;
    await trades('?limit=3');
    const lookups = harness.runs.fillLookups.slice(before);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toStrictEqual(['a', 'b', 'c']);
  });
});

describe('recebido - pago = resultado, em decimal exato', () => {
  test('em 300 posições sorteadas (oráculo bigint de escala 8, sem o código da API)', async () => {
    const reconcileRun = await createOwnRun(SUBJECT_A, 'reconcile');
    const specs: Spec[] = [];
    let state = 12345;
    const next = (modulo: number): number => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state % modulo;
    };
    for (let index = 0; index < 300; index += 1) {
      const entry = BigInt(next(900_000) + 1) * 1_000_000_000n + BigInt(next(1_000_000_000_000));
      const exit = BigInt(next(900_000) + 1) * 1_000_000_000n + BigInt(next(1_000_000_000_000));
      const entryFee = BigInt(next(5_000_000) + 1);
      const exitFee = BigInt(next(5_000_000) + 1);
      const ceil8 = (value: bigint): bigint => (value + 10_000n - 1n) / 10_000n;
      const floor8 = (value: bigint): bigint => value / 10_000n;
      const net = floor8(exit) - exitFee - (ceil8(entry) + entryFee);
      specs.push({
        key: `r${index}`,
        open: index * 2,
        close: index * 2 + 1,
        entryNotional: scaled12(entry),
        entryFee: scaled8(entryFee),
        exitNotional: scaled12(exit),
        exitFee: scaled8(exitFee),
        netProfit: scaled8(net),
      });
    }
    seed(reconcileRun, specs);
    let cursor: string | null = null;
    let checked = 0;
    do {
      const query: string = cursor === null ? '?limit=100' : `?limit=100&cursor=${cursor}`;
      const { body } = await readJson(
        await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${reconcileRun}/trades${query}` }),
      );
      const page = body as Page;
      for (const trade of page.data) {
        const net = parseScale8(String(trade['received'])) - parseScale8(String(trade['paid']));
        expect(net).toBe(parseScale8(String(trade['netProfit'])));
        checked += 1;
      }
      cursor = page.pagination.nextCursor;
    } while (cursor !== null);
    expect(checked).toBe(300);
  });
});

function scaled8(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(9, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -8)}.${digits.slice(-8)}`;
}

function scaled12(value: bigint): string {
  const digits = value.toString().padStart(13, '0');
  return `${digits.slice(0, -12)}.${digits.slice(-12)}`;
}

function parseScale8(text: string): bigint {
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0').slice(0, 8));
  return negative ? -value : value;
}

describe('faixa de tempo [from, to) e status', () => {
  const range = (from: number | undefined, to: number | undefined, extra = ''): string => {
    const parts = [
      from === undefined ? '' : `from=${at(from)}`,
      to === undefined ? '' : `to=${at(to)}`,
    ].filter((part) => part !== '');
    return `?${[...parts, extra].filter((part) => part !== '').join('&')}`;
  };

  test('só a compra dentro, só a venda dentro e o `to` excluído', async () => {
    expect(keysOf(await trades(range(0, 1)))).toStrictEqual(['a']);
    expect(keysOf(await trades(range(5, 6)))).toStrictEqual(['b']);
    expect(keysOf(await trades(range(5, 7)))).toStrictEqual(['b', 'c']);
  });

  test('o `from` é incluído: a venda exatamente em `from` entra', async () => {
    expect(keysOf(await trades(range(2, 3)))).toStrictEqual(['a']);
  });

  test('a posição que atravessa a faixa sem preenchimento nela fica fora', async () => {
    expect(keysOf(await trades(range(7, 10)))).toStrictEqual([]);
    expect(keysOf(await trades(range(7, 11)))).toStrictEqual(['c']);
  });

  test('só `from` ou só `to` também filtram', async () => {
    expect(keysOf(await trades(range(5, undefined)))).toStrictEqual(['b', 'c', 'd']);
    expect(keysOf(await trades(range(undefined, 3)))).toStrictEqual(['a']);
  });

  test('status=open e status=closed', async () => {
    expect(keysOf(await trades('?status=open'))).toStrictEqual(['d']);
    expect(keysOf(await trades('?status=closed'))).toStrictEqual(['a', 'b', 'c']);
    expect(keysOf(await trades(range(0, 12, 'status=open')))).toStrictEqual(['d']);
  });

  test('as páginas concatenadas, com cursor e faixa, são a lista filtrada inteira', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `${range(2, 12, 'limit=1')}${cursor === null ? '' : `&cursor=${cursor}`}`;
      const page = await trades(query);
      seen.push(...keysOf(page));
      cursor = page.pagination.nextCursor;
    } while (cursor !== null);
    expect(seen).toStrictEqual(['a', 'b', 'c', 'd']);
  });
});

describe('validação e acesso', () => {
  test('400 com todos os erros e sem eco de valor', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}/trades?from=abcsecreto&status=bogussecreto&limit=0&userId=x`,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    const body = JSON.parse(text) as ErrorBody;
    expect(body.error.code).toBe('REQUEST_VALIDATION_FAILED');
    const fields = new Set((body.error.details ?? []).map((detail) => detail.field));
    expect(fields.has('from')).toBe(true);
    expect(fields.has('status')).toBe(true);
    expect(fields.has('limit')).toBe(true);
    expect(text).not.toContain('abcsecreto');
    expect(text).not.toContain('bogussecreto');
  });

  test('`to` igual ou antes de `from` é 400 em `to`', async () => {
    for (const query of [`?from=${at(5)}&to=${at(5)}`, `?from=${at(5)}&to=${at(1)}`]) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/trades${query}`,
      });
      const body = (await response.json()) as ErrorBody;
      expect(response.status).toBe(400);
      expect(body.error.details).toContainEqual({ field: 'to', reason: 'must_be_after_from' });
    }
  });

  test('execução de outro usuário, inexistente, malformada e apagada dão o mesmo 404', async () => {
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}/trades`,
    });
    const foreign = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/${runId}/trades` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: foreign,
      missingResourceResponse: missing,
    });
    const malformed = await harness.call({ subject: SUBJECT_B, path: `${RUNS}/xyz/trades` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: malformed,
      missingResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}/trades`,
      }),
    });
    const deletedRun = await createOwnRun(SUBJECT_B, 'apagada');
    await harness.runs.repository.transitionRun(harness.scopeOf(SUBJECT_B), {
      runId: deletedRun,
      to: 'cancelled',
    });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deletedRun}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${deletedRun}/trades`,
      }),
      missingResourceResponse: missing,
    });
  });

  test('a documentação declara os campos novos, a query nova e o acesso do dono', () => {
    const route = harness.routes.find((candidate) => candidate.path === `${RUNS}/:runId/trades`);
    expect(route?.access).toBe('user');
    const query = route?.documentation?.query;
    expect(query?.safeParse({ from: '1', to: '2', status: 'open' }).success).toBe(true);
    expect(query?.safeParse({ status: 'x' }).success).toBe(false);
  });
});
