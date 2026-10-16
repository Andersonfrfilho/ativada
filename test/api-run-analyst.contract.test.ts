// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  createAnalystRun,
  failedRecord,
  goldenRecord,
  readGoldenCase,
} from './fixtures/analyst-routes/analyst-routes-scenario.fixture.js';
import {
  createRunsHarness,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import type { JsonValue } from '../packages/database/src/index.js';
import { describeSpecialistMotive } from '../packages/risk-analyst/src/index.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import { equityRow, positionRow } from './fixtures/live-status/live-status-scenario.fixture.js';

const RUNS = '/v1/runs';
const ANALYST = '/analyst';
const DECISIONS = '/analyst/decisions';
const FAILURE = 'O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele.';
const SHADOW =
  'Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança.';

type Specialist = Record<string, unknown> & { key: string; label: string };
type Decided = {
  status: 'decided';
  candleTime: number;
  closedAt: number;
  posture: string;
  postureLabel: string;
  cadenceMinutes: number;
  isOnCadence: boolean;
  entryGate: string;
  riskScale: string;
  maxTradeMinutes: number;
  timeExitDue: boolean;
  specialists: Specialist[];
  isShadow: boolean;
  message: string;
  reasonMessage: string;
  cadenceLine: string | null;
  offCadenceMessage: string | null;
  timeExitMessage: string | null;
  lockMessages: string[];
  locks: { key: string; line: string; message: string | null; isActive: boolean }[];
  commands: { kind: string }[];
  disclaimer: string;
};
type Unavailable = { status: 'unavailable'; reason: string; message: string };
type AnalystBody = {
  version: string;
  mode: string;
  modeMessage: string;
  current: Decided | Unavailable;
  goalProgress: Record<string, unknown> | null;
  locks: Decided['locks'];
};
type Item =
  Decided | { status: 'failed'; candleTime: number; failureCode: string; message: string };
type ErrorBody = { error: { code: string; details?: { field: string }[] } };

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness();
});

afterAll(async () => {
  await harness.stop();
});

async function analystOf(runId: string, subject = SUBJECT_A): Promise<AnalystBody> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}${ANALYST}` }),
  );
  expect(status).toBe(200);
  return (body as { data: AnalystBody }).data;
}

async function newRun(
  options: Parameters<typeof createAnalystRun>[1] = { subject: SUBJECT_A },
): Promise<string> {
  return createAnalystRun(harness, options);
}

function seed(runId: string, names: readonly string[]): void {
  harness.runs.analyst.seed(
    runId,
    names.map((name) => goldenRecord({ runId, name })),
  );
}

describe('analista em sombra: o caminho feliz', () => {
  test('a decisão mais nova com as frases do catálogo, iguais às do dourado', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['real:3299:clean']);
    const golden = readGoldenCase('real:3299:clean');
    const data = await analystOf(runId);
    expect(data.version).toBe('analyst-1');
    expect(data.mode).toBe('shadow');
    expect(data.modeMessage).toBe(SHADOW);
    const current = data.current as Decided;
    expect(current.status).toBe('decided');
    expect(current.posture).toBe('pause');
    expect(current.postureLabel).toBe('PAUSA');
    expect(current.candleTime).toBe(golden.decision['candleTime'] as number);
    expect(current.closedAt).toBe(current.candleTime + 900_000);
    expect(current.isShadow).toBe(true);
    expect(current.message).toBe(golden.messages.postureLine);
    expect(current.reasonMessage).toBe(golden.messages.reasonMessage);
    expect(current.cadenceLine).toBe(golden.messages.cadenceLine);
    expect(current.offCadenceMessage).toBe(golden.messages.offCadenceMessage);
    expect(current.timeExitMessage).toBe(golden.messages.timeExitMessage);
    expect(current.disclaimer).toBe(golden.messages.disclaimer);
    expect(current.locks.map((lock) => lock.line)).toStrictEqual([...golden.messages.lockLines]);
    expect(current.lockMessages).toStrictEqual([golden.messages.reasonMessage]);
    expect(data.locks).toStrictEqual(current.locks);
    expect(data.goalProgress).toBeNull();
  });

  test('a tabela da equipe repete as linhas do catálogo e os números do auditor', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['synthetic:2711:clean']);
    const golden = readGoldenCase('synthetic:2711:clean');
    const current = (await analystOf(runId)).current as Decided;
    expect(current.posture).toBe('confident');
    expect(current.postureLabel).toBe('LIBERADA');
    expect(current.message).toBe(golden.messages.postureLine);
    const rows = current.specialists.map((row) => ({
      label: row['label'],
      vote: row['voteLabel'],
      accuracy: row['accuracyText'],
      situation: row['verdictLabel'],
      weight: row['weightText'],
    }));
    expect(rows).toStrictEqual([...golden.messages.specialists]);
    const stored = (golden.decision['specialists'] as Record<string, unknown>[]).map(
      (row) => row['hits'],
    );
    expect(current.specialists.map((row) => row['hits'])).toStrictEqual(stored);
    expect(current.specialists.map((row) => row.key)).toStrictEqual([
      'trend',
      'reversion',
      'volume',
      'sentiment',
      'strategy',
    ]);
  });

  test('o motivo de cada especialista é o do catálogo, pelo voto por regra gravado; a estratégia não tem', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['synthetic:2711:clean']);
    const golden = readGoldenCase('synthetic:2711:clean');
    const stored = golden.decision['specialists'] as {
      key: 'trend' | 'reversion' | 'volume' | 'sentiment' | 'strategy';
      vote: -1 | 0 | 1 | null;
      isUnread: boolean;
      ruleVotes?: { ruleId: string; vote: -1 | 0 | 1; reading: number | null }[];
    }[];
    const current = (await analystOf(runId)).current as Decided;
    const motives = current.specialists.map((row) => row['motive']);
    const expected = stored.map((row) =>
      row.key === 'strategy'
        ? null
        : describeSpecialistMotive({
            key: row.key,
            vote: row.vote,
            isUnread: row.isUnread,
            ruleVotes: row.ruleVotes,
          }),
    );
    expect(motives).toStrictEqual(expected);
    expect(motives.slice(0, 4).every((motive) => typeof motive === 'string')).toBe(true);
    expect(motives[4]).toBeNull();
    expect(current.specialists.every((row) => row['verdictLabel'] !== undefined)).toBe(true);
  });

  test('decisão gravada antes dos votos por regra: o motivo é nulo e o resto não muda', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    const record = goldenRecord({ runId, name: 'synthetic:2711:clean' });
    const specialists = (record.specialists as Record<string, JsonValue>[]).map((row) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'ruleVotes')),
    );
    harness.runs.analyst.seed(runId, [{ ...record, specialists }]);
    const current = (await analystOf(runId)).current as Decided;
    expect(current.specialists.map((row) => row['motive'])).toStrictEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(current.message).toBe(readGoldenCase('synthetic:2711:clean').messages.postureLine);
  });

  test('saída por tempo e travas ativas trazem as frases próprias', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['real:3299:losing']);
    const golden = readGoldenCase('real:3299:losing');
    const current = (await analystOf(runId)).current as Decided;
    expect(current.reasonMessage).toBe(golden.messages.reasonMessage);
    expect(current.lockMessages.length).toBe(2);
    expect(current.locks.filter((lock) => lock.isActive).map((lock) => lock.key)).toStrictEqual([
      'daily_loss',
      'move_cost',
    ]);
    const exit = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(exit, ['real:2600:exit']);
    const exitCurrent = (await analystOf(exit)).current as Decided;
    expect(exitCurrent.timeExitDue).toBe(true);
    expect(exitCurrent.timeExitMessage).toBe(
      readGoldenCase('real:2600:exit').messages.timeExitMessage,
    );
  });

  test('o ritmo de 4 horas fora da janela diz que só a vela do múltiplo de 4 horas entra', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['real:2000:room']);
    const golden = readGoldenCase('real:2000:room');
    const current = (await analystOf(runId)).current as Decided;
    expect(current.cadenceMinutes).toBe(240);
    expect(current.isOnCadence).toBe(golden.decision['isOnCadence'] as boolean);
    expect(current.offCadenceMessage).toBe(golden.messages.offCadenceMessage);
  });

  test('três consultas por chave sem meta e quatro com meta', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['real:3299:clean']);
    harness.queries.length = 0;
    await analystOf(runId);
    expect(harness.queries).toStrictEqual(['findRun', 'findVersion', 'findLatestAnalystDecision']);
    const withGoal = await newRun({
      subject: SUBJECT_A,
      lastCandleIndex: 3,
      goal: { targetRate: '0.1', maxLossRate: '0.05', horizonDays: 7 },
    });
    seed(withGoal, ['real:3299:clean']);
    harness.queries.length = 0;
    await analystOf(withGoal);
    expect(harness.queries).toHaveLength(4);
    expect(harness.queries).toContain('readAnalystGoalSnapshot');
  });
});

describe('o analista ainda não tem o que mostrar', () => {
  test.each([
    [
      'sem nenhuma vela',
      { lastCandleIndex: undefined, status: 'running' },
      'no_candle',
      'Aguardando a primeira vela de 15 min fechar.',
    ],
    [
      'aquecendo',
      { lastCandleIndex: 2, status: 'running' },
      'warming_up',
      'O analista ainda está juntando histórico do par.',
    ],
    [
      'simulação encerrada',
      { lastCandleIndex: 2, status: 'cancelled' },
      'not_running',
      'A simulação não está rodando: o analista não decide.',
    ],
  ] as const)('%s', async (_name, options, reason, message) => {
    const runId = await newRun({ subject: SUBJECT_A, ...options });
    const data = await analystOf(runId);
    expect(data.current).toStrictEqual({ status: 'unavailable', reason, message });
    expect(data.locks).toStrictEqual([]);
  });

  test('parada: a simulação parou de avançar', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 2 });
    seed(runId, ['real:3299:clean']);
    harness.runs.updateRun(runId, { stalledSince: 1_700_000_000_000 });
    const { current, locks } = await analystOf(runId);
    expect(current).toStrictEqual({
      status: 'unavailable',
      reason: 'stalled',
      message: 'A simulação parou de avançar; o analista volta quando ela voltar.',
    });
    expect(locks.length).toBe(5);
  });

  test('esperando velas que faltam', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 2 });
    harness.runs.updateRun(runId, {
      waitingSince: 1_700_000_000_000,
      waitingOpenTime: 1_699_999_000_000,
    });
    const { current } = await analystOf(runId);
    expect(current).toStrictEqual({
      status: 'unavailable',
      reason: 'waiting_for_data',
      message: 'A simulação espera velas que faltam; o analista volta quando elas chegarem.',
    });
  });

  test('a última vela falhou: a frase de falha, sem o código nem o texto do erro', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 2 });
    harness.runs.analyst.seed(runId, [failedRecord({ runId, index: 2 })]);
    const response = await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${ANALYST}` });
    const text = await response.text();
    expect((JSON.parse(text) as { data: AnalystBody }).data.current).toStrictEqual({
      status: 'unavailable',
      reason: 'failed',
      message: FAILURE,
    });
    expect(text).not.toContain('ANALYST_SERIES_UNAVAILABLE');
  });
});

describe('meta somada', () => {
  test('o resultado é o do saldo, o que falta é o da meta e as operações são as fechadas', async () => {
    const runId = await newRun({
      subject: SUBJECT_A,
      lastCandleIndex: 3,
      goal: { targetRate: '0.1', maxLossRate: '0.05', horizonDays: 7 },
    });
    seed(runId, ['real:3299:clean']);
    harness.runs.seed(runId, 'equity', [
      equityRow(0, '1000', '1000'),
      equityRow(1, '1030', '1010'),
    ]);
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'p1', openedIndex: 0, closedIndex: 1 }),
      positionRow({ key: 'p2', openedIndex: 2, closedIndex: undefined }),
    ]);
    const { goalProgress } = await analystOf(runId);
    expect(goalProgress).toStrictEqual({
      targetRate: '0.1',
      summedRate: '0.03',
      remainingRate: '0.07',
      trades: 1,
      message: 'Meta: +10,00% no prazo. Somado até aqui: +3,00% em 1 operação. Falta 7,00%.',
    });
  });
});

describe('decisões anteriores', () => {
  test('da mais nova para a mais antiga, por cursor, sem repetir nem pular', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    const names = [
      'real:3299:clean',
      'real:3000:cheap',
      'real:2600:exit',
      'real:2000:room',
      'real:1500:streak',
    ];
    seed(runId, names);
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query: string = cursor === null ? '?limit=2' : `?limit=2&cursor=${cursor}`;
      const { status, body } = await readJson(
        await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS}${query}` }),
      );
      expect(status).toBe(200);
      const parsed = body as {
        data: Item[];
        pagination: { nextCursor: string | null; perPage: number };
      };
      expect(parsed.pagination.perPage).toBe(2);
      seen.push(...parsed.data.map((item) => item.candleTime));
      cursor = parsed.pagination.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(5);
    expect(seen).toStrictEqual([...seen].sort((left, right) => right - left));
    expect(new Set(seen).size).toBe(5);
  });

  test('a vela em que o analista falhou vem como failed, só com o código estável', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['real:3299:clean']);
    harness.runs.analyst.seed(runId, [failedRecord({ runId, index: 2 })]);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS}` }),
    );
    const items = (body as { data: Item[] }).data;
    const failed = items.find((item) => item.status === 'failed');
    expect(failed).toMatchObject({ failureCode: 'ANALYST_SERIES_UNAVAILABLE', message: FAILURE });
    expect(items.filter((item) => item.status === 'decided')).toHaveLength(1);
  });

  test('três consultas por página e o limite padrão é 24', async () => {
    const runId = await newRun({ subject: SUBJECT_A, lastCandleIndex: 3 });
    seed(runId, ['real:3299:clean']);
    harness.queries.length = 0;
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${DECISIONS}` }),
    );
    expect(harness.queries).toHaveLength(3);
    expect((body as { pagination: { perPage: number } }).pagination.perPage).toBe(24);
  });
});

describe('dono, tipo e entrada', () => {
  test('recurso de outro usuário, inexistente, apagado e malformado dão o mesmo 404', async () => {
    const runId = await newRun({ subject: SUBJECT_A });
    for (const suffix of [ANALYST, DECISIONS]) {
      const missing = await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${MISSING_ID}${suffix}`,
      });
      await expectIndistinguishableNotFound({
        expectedCode: 'RUN_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_B,
          path: `${RUNS}/${runId}${suffix}`,
        }),
        missingResourceResponse: missing,
      });
      await expectIndistinguishableNotFound({
        expectedCode: 'RUN_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_A,
          path: `${RUNS}/nao-e-um-id${suffix}`,
        }),
        missingResourceResponse: missing,
      });
    }
    const deleted = await newRun({ subject: SUBJECT_B, status: 'cancelled' });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deleted}` });
    for (const suffix of [ANALYST, DECISIONS]) {
      await expectIndistinguishableNotFound({
        expectedCode: 'RUN_NOT_FOUND',
        foreignResourceResponse: await harness.call({
          subject: SUBJECT_B,
          path: `${RUNS}/${deleted}${suffix}`,
        }),
        missingResourceResponse: await harness.call({
          subject: SUBJECT_B,
          path: `${RUNS}/${MISSING_ID}${suffix}`,
        }),
      });
    }
  });

  test('sem token é 401', async () => {
    const runId = await newRun({ subject: SUBJECT_A });
    for (const suffix of [ANALYST, DECISIONS]) {
      const response = await harness.call({ path: `${RUNS}/${runId}${suffix}` });
      expect(response.status).toBe(401);
      await response.text();
    }
  });

  test('backtest e walk-forward: 409 RUN_NOT_LIVE; ao vivo sem analista: 409 ANALYST_NOT_ENABLED', async () => {
    for (const kind of ['backtest', 'walk_forward'] as const) {
      const runId = await newRun({ subject: SUBJECT_A, kind, status: 'completed' });
      for (const suffix of [ANALYST, DECISIONS]) {
        const response = await harness.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${suffix}`,
        });
        expect(response.status).toBe(409);
        expect(((await response.json()) as ErrorBody).error.code).toBe('RUN_NOT_LIVE');
      }
    }
    const plain = await newRun({ subject: SUBJECT_A, hasAnalyst: false });
    for (const suffix of [ANALYST, DECISIONS]) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${plain}${suffix}`,
      });
      expect(response.status).toBe(409);
      expect(((await response.json()) as ErrorBody).error.code).toBe('ANALYST_NOT_ENABLED');
    }
  });

  test('qualquer parâmetro em /analyst é 400', async () => {
    const runId = await newRun({ subject: SUBJECT_A });
    for (const query of ['?limit=1', '?cursor=x', '?userId=x']) {
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${ANALYST}${query}`,
      });
      expect({ query, status: response.status }).toStrictEqual({ query, status: 400 });
      await response.text();
    }
  });

  test.each([
    ['limit=0'],
    ['limit=101'],
    ['limit=abc'],
    ['cursor=%%%'],
    ['cursor=bm90LXVtLWN1cnNvcg'],
    ['order=asc'],
  ])('decisões com ?%s é 400', async (query) => {
    const runId = await newRun({ subject: SUBJECT_A });
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${DECISIONS}?${query}`,
    });
    expect(response.status).toBe(400);
    await response.text();
  });

  test('400 devolve todos os erros de uma vez e nenhum eco de valor', async () => {
    const runId = await newRun({ subject: SUBJECT_A });
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${DECISIONS}?limit=zzsecreto&cursor=!!qqsecreto&userId=x`,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    const fields = new Set(
      (JSON.parse(text) as ErrorBody).error.details?.map((detail) => detail.field),
    );
    expect(fields.has('limit')).toBe(true);
    expect(text).not.toContain('zzsecreto');
    expect(text).not.toContain('qqsecreto');
  });
});

describe('limite de requisições', () => {
  test('as duas rotas do analista dividem o balde de 60 por minuto com as do acompanhamento', async () => {
    const limited = await createRunsHarness();
    try {
      const policy = limited.app.policies.RATE_LIMIT_POLICY.RUN_LIVE_STATUS;
      expect(policy.limit).toBe(60);
      const runId = await createAnalystRun(limited, { subject: SUBJECT_A });
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const suffix = attempt % 2 === 0 ? ANALYST : DECISIONS;
        const response = await limited.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${suffix}`,
        });
        expect(response.status).toBe(200);
        await response.text();
      }
      const blocked = await limited.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${ANALYST}`,
      });
      expect(blocked.status).toBe(429);
      await blocked.text();
    } finally {
      await limited.stop();
    }
  });
});
