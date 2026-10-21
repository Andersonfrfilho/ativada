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
const POSITIONS = 200;
const MINUS = '−';

type Summary = {
  closedTrades: number;
  totalPaid: string;
  totalReceived: string;
  totalFees: string;
  net: string;
  openTrades: number;
  openPaid: string | null;
  message: string;
};

let harness: RunsHarness;

const at = (hours: number): number => FIRST + hours * HOUR;

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

const ceil8 = (value: bigint): bigint => (value + 10_000n - 1n) / 10_000n;
const floor8 = (value: bigint): bigint => value / 10_000n;

async function createOwnRun(subject: string): Promise<string> {
  const seeded = await harness.seedStrategy(subject, `summary-${crypto.randomUUID()}`);
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
    periodStart: at(0),
    periodEnd: at(1_000),
    migratedFromRunId: undefined,
  });
  if (created === undefined) throw new Error('execução semente não criada');
  return created.id;
}

function positionOf(params: {
  key: string;
  open: number;
  close?: number;
  entryFee: string;
  exitFee?: string;
  netProfit?: string;
}): PositionInput {
  const isClosed = params.close !== undefined;
  return {
    engineKey: params.key,
    status: isClosed ? 'closed' : 'open',
    entryPrice: '30000.5',
    quantity: '0.01',
    stopPrice: '29000',
    targetPrice: '31000',
    entryFee: params.entryFee,
    exitPrice: isClosed ? '30500' : undefined,
    exitFee: params.exitFee,
    netProfit: params.netProfit,
    exitReason: isClosed ? 'target' : undefined,
    openedCandleTime: at(params.open),
    closedCandleTime: params.close === undefined ? undefined : at(params.close),
  };
}

function fillOf(params: {
  key: string;
  side: 'buy' | 'sell';
  hours: number;
  notional: string;
  fee: string;
}): FillInput {
  return {
    orderKey: `${params.side}-${params.key}`,
    positionKey: params.key,
    candleTime: at(params.hours),
    side: params.side,
    price: '30000',
    quantity: '0.01',
    notional: params.notional,
    fee: params.fee,
  };
}

// Posições com a conta do caixa do motor feita em `bigint` (sem o código da API): net_profit = recebido - pago.
function seedConsistentRun(runId: string): { netProfitSum: bigint } {
  let state = 4_242;
  const next = (modulo: number): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % modulo;
  };
  const positions: PositionInput[] = [];
  const fills: FillInput[] = [];
  let netProfitSum = 0n;
  for (let index = 0; index < POSITIONS; index += 1) {
    const entry = BigInt(next(900_000) + 1) * 1_000_000_000n + BigInt(next(1_000_000_000_000));
    const exit = BigInt(next(900_000) + 1) * 1_000_000_000n + BigInt(next(1_000_000_000_000));
    const entryFee = BigInt(next(5_000_000) + 1);
    const exitFee = BigInt(next(5_000_000) + 1);
    const net = floor8(exit) - exitFee - (ceil8(entry) + entryFee);
    netProfitSum += net;
    const key = `p${index}`;
    positions.push(
      positionOf({
        key,
        open: index * 2,
        close: index * 2 + 1,
        entryFee: scaled8(entryFee),
        exitFee: scaled8(exitFee),
        netProfit: scaled8(net),
      }),
    );
    fills.push(
      fillOf({
        key,
        side: 'buy',
        hours: index * 2,
        notional: scaled12(entry),
        fee: scaled8(entryFee),
      }),
      fillOf({
        key,
        side: 'sell',
        hours: index * 2 + 1,
        notional: scaled12(exit),
        fee: scaled8(exitFee),
      }),
    );
  }
  harness.runs.seed(runId, 'positions', positions);
  harness.runs.seed(runId, 'fills', fills);
  return { netProfitSum };
}

async function summary(runId: string, subject: string | undefined = SUBJECT_A): Promise<Summary> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}/trade-summary` }),
  );
  expect(status).toBe(200);
  return (body as { data: Summary }).data;
}

async function sumTrades(runId: string): Promise<{ paid: bigint; received: bigint }> {
  let paid = 0n;
  let received = 0n;
  let cursor: string | null = null;
  do {
    const query: string = cursor === null ? '?limit=100' : `?limit=100&cursor=${cursor}`;
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/trades${query}` }),
    );
    const page = body as {
      data: { paid?: string; received?: string }[];
      pagination: { nextCursor: string | null };
    };
    for (const trade of page.data) {
      paid += parseScale8(trade.paid ?? '0');
      received += parseScale8(trade.received ?? '0');
    }
    cursor = page.pagination.nextCursor;
  } while (cursor !== null);
  return { paid, received };
}

// O registro cronológico: soma pelo que o CSV traz de cada preenchimento (notional e taxa), independente do /trades.
async function sumLogCsv(runId: string): Promise<{ paid: bigint; received: bigint }> {
  const response = await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/log.csv` });
  const lines = (await response.text()).split('\r\n').filter((line) => line.length > 0);
  const header = (lines[0] ?? '').split(',');
  const [eventIndex, sideIndex, notionalIndex, feeIndex] = ['event', 'side', 'notional', 'fee'].map(
    (name) => header.indexOf(name),
  );
  let paid = 0n;
  let received = 0n;
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells[eventIndex ?? -1] !== 'fill') continue;
    const [whole = '0', fraction = ''] = (cells[notionalIndex ?? -1] ?? '0').split('.');
    const wide = BigInt(whole) * 10n ** 12n + BigInt(fraction.padEnd(12, '0').slice(0, 12));
    const fee = parseScale8(cells[feeIndex ?? -1] ?? '0');
    if (cells[sideIndex ?? -1] === 'buy') paid += ceil8(wide) + fee;
    else received += floor8(wide) - fee;
  }
  return { paid, received };
}

beforeAll(async () => {
  harness = await createRunsHarness();
});

afterAll(async () => {
  await harness.stop();
});

describe('reconciliação em decimal exato', () => {
  test('o saldo líquido é a soma de net_profit e os totais batem com o /trades e com o log.csv', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    const { netProfitSum } = seedConsistentRun(runId);
    const result = await summary(runId);
    expect(result.closedTrades).toBe(POSITIONS);
    expect(parseScale8(result.net)).toBe(netProfitSum);
    expect(parseScale8(result.totalReceived) - parseScale8(result.totalPaid)).toBe(netProfitSum);
    const trades = await sumTrades(runId);
    expect([parseScale8(result.totalPaid), parseScale8(result.totalReceived)]).toStrictEqual([
      trades.paid,
      trades.received,
    ]);
    const log = await sumLogCsv(runId);
    expect([parseScale8(result.totalPaid), parseScale8(result.totalReceived)]).toStrictEqual([
      log.paid,
      log.received,
    ]);
  });
});

describe('totais à mão', () => {
  test('uma fechada e uma aberta: pago, recebido, taxas, pago na aberta e frase', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    harness.runs.seed(runId, 'positions', [
      positionOf({
        key: 'a',
        open: 0,
        close: 2,
        entryFee: '0.45',
        exitFee: '0.47',
        netProfit: '9.94419753',
      }),
      positionOf({ key: 'b', open: 5, entryFee: '0.412' }),
    ]);
    harness.runs.seed(runId, 'fills', [
      fillOf({ key: 'a', side: 'buy', hours: 0, notional: '300.123456789', fee: '0.45' }),
      fillOf({ key: 'a', side: 'sell', hours: 2, notional: '310.987654321', fee: '0.47' }),
      fillOf({ key: 'b', side: 'buy', hours: 5, notional: '412', fee: '0.412' }),
    ]);
    const result = await summary(runId);
    expect(result).toStrictEqual({
      closedTrades: 1,
      totalPaid: '300.57345679',
      totalReceived: '310.51765432',
      totalFees: '0.92',
      net: '9.94419753',
      openTrades: 1,
      openPaid: '412.412',
      message:
        'Você pagou 300,58 USDT em 1 compra e recebeu 310,51 USDT nas vendas. Taxas: 0,92 USDT. Saldo líquido: 9,94 USDT. + uma operação ainda aberta, com 412,42 USDT pagos.',
    });
  });

  test('prejuízo: o saldo líquido sai negativo e a frase usa o menos tipográfico', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    harness.runs.seed(runId, 'positions', [
      positionOf({
        key: 'a',
        open: 0,
        close: 1,
        entryFee: '0.50000001',
        exitFee: '0.5',
        netProfit: '-0.33333333',
      }),
    ]);
    harness.runs.seed(runId, 'fills', [
      fillOf({ key: 'a', side: 'buy', hours: 0, notional: '99.5', fee: '0.50000001' }),
      fillOf({ key: 'a', side: 'sell', hours: 1, notional: '100.16666668', fee: '0.5' }),
    ]);
    const result = await summary(runId);
    expect(result.net).toBe('-0.33333333');
    expect(result.message).toContain(`Saldo líquido: ${MINUS}0,34 USDT`);
  });

  test('execução sem operação soma zero e diz que não há fechada', async () => {
    const result = await summary(await createOwnRun(SUBJECT_A));
    expect(result).toStrictEqual({
      closedTrades: 0,
      totalPaid: '0',
      totalReceived: '0',
      totalFees: '0',
      net: '0',
      openTrades: 0,
      openPaid: null,
      message: 'Nenhuma operação fechada ainda.',
    });
  });

  test('a resposta bate com o esquema documentado', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    seedConsistentRun(runId);
    const route = harness.routes.find(
      (candidate) => candidate.path === `${RUNS}/:runId/trade-summary`,
    );
    expect(route?.access).toBe('user');
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}/trade-summary` }),
    );
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((body as { data: Summary }).data)
        .success,
    ).toBe(true);
  });
});

describe('acesso e validação', () => {
  test('exige token', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    expect((await harness.call({ path: `${RUNS}/${runId}/trade-summary` })).status).toBe(401);
  });

  test('qualquer parâmetro é 400', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    for (const query of ['?from=1', '?userId=x', '?limit=1']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}/trade-summary${query}`,
      });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
    }
  });

  test('execução de outro usuário, inexistente, malformada e apagada dão o mesmo 404', async () => {
    const runId = await createOwnRun(SUBJECT_A);
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}/trade-summary`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}/trade-summary`,
      }),
      missingResourceResponse: missing,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/xyz/trade-summary`,
      }),
      missingResourceResponse: missing,
    });
    const deleted = await createOwnRun(SUBJECT_B);
    await harness.runs.repository.transitionRun(harness.scopeOf(SUBJECT_B), {
      runId: deleted,
      to: 'cancelled',
    });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deleted}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${deleted}/trade-summary`,
      }),
      missingResourceResponse: missing,
    });
  });
});

describe('limite de requisições', () => {
  test('30 resumos por minuto por usuário; o 31º é 429', async () => {
    const limited = await createRunsHarness();
    try {
      const policy = limited.app.policies.RATE_LIMIT_POLICY.RUN_TRADE_SUMMARY;
      expect(policy.limit).toBe(30);
      const seeded = await limited.seedStrategy(SUBJECT_A, 'limite');
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
        periodStart: at(0),
        periodEnd: at(1_000),
        migratedFromRunId: undefined,
      });
      const path = `${RUNS}/${created?.id ?? ''}/trade-summary`;
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const response = await limited.call({ subject: SUBJECT_A, path });
        expect(response.status).toBe(200);
        await response.text();
      }
      const blocked = await limited.call({ subject: SUBJECT_A, path });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      await blocked.text();
    } finally {
      await limited.stop();
    }
  });
});
