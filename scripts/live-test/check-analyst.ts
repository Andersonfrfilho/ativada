// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createNotificationListener } from '../../packages/database/src/notifications/notification-listener.js';
import { RUN_EVENTS_CHANNEL } from '../../packages/database/src/run-events/run-event.constant.js';
import {
  parseRunEventPayload,
  type RunEvent,
} from '../../packages/database/src/run-events/run-event.schema.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import {
  ANALYST_REAL_DATASET,
  ANALYST_SHADOW_REQUEST,
} from '../../test/fixtures/live/analyst-real-data.fixture.js';
import {
  CHILD_INSTANCE_VARIABLE,
  CHILD_KILL_VARIABLE,
  CHILD_SCRIPT,
  TICK_PAUSE_MILLISECONDS,
} from './live-test.constant.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createLiveUser,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  waitFor,
  type LiveTestContext,
  type LiveUser,
} from './live-test-context.js';

// T2.3 da spec 007: o analista de risco em SOMBRA no passo ao vivo, contra o Postgres e o worker de produção. A decisão entra
// na MESMA transação do passo (uma linha por vela e um NOTIFY `analyst`), a retomada depois de um SIGKILL não duplica nem
// perde decisão, e a simulação com sombra deixa as MESMAS linhas da sem sombra (sinais, ordens, operações, posições, saldo).

const CANDLE_COUNT = 1_100;
const CRASH_AFTER_COMMITS = 300;
const FIFTEEN_MINUTES = 900_000;
const RESULT_TABLES = ['signals', 'orders', 'fills', 'positions', 'equity_points', 'run_commands'];
const ANALYST_REQUEST = parseJsonContainer(JSON.stringify({ analyst: ANALYST_SHADOW_REQUEST }));

type StartedRun = { readonly runId: string; readonly user: LiveUser };
type DecisionRow = { readonly candle_time: string; readonly status: string; readonly mode: string };

export async function resultRowsDigest(context: LiveTestContext, runId: string): Promise<string> {
  const tables: unknown[] = [];
  for (const table of RESULT_TABLES) {
    const rows: unknown = await context.client.unsafe(
      `SELECT (to_jsonb(t) - 'id' - 'user_id' - 'run_id')::text AS row FROM ${table} t WHERE run_id = $1 ORDER BY 1`,
      [runId],
    );
    tables.push(
      (rows as readonly { readonly row: string }[]).map((item): unknown => JSON.parse(item.row)),
    );
  }
  return digestOf(tables);
}

async function decisionRows(context: LiveTestContext, runId: string): Promise<DecisionRow[]> {
  const rows: unknown = await context.client.unsafe(
    'SELECT candle_time::text AS candle_time, status, mode FROM analyst_decisions WHERE run_id = $1 ORDER BY candle_time',
    [runId],
  );
  return [...(rows as readonly DecisionRow[])];
}

async function decisionsDigest(context: LiveTestContext, runId: string): Promise<string> {
  const rows: unknown = await context.client.unsafe(
    `SELECT (to_jsonb(t) - 'id' - 'user_id' - 'run_id' - 'created_at')::text AS row
     FROM analyst_decisions t WHERE run_id = $1 ORDER BY candle_time`,
    [runId],
  );
  return digestOf(
    (rows as readonly { readonly row: string }[]).map((item): unknown => JSON.parse(item.row)),
  );
}

function crashOnce(afterCommits: number): (runId: string) => Promise<void> {
  const commits = new Map<string, number>();
  const crashed = new Set<string>();
  return (runId) => {
    commits.set(runId, (commits.get(runId) ?? 0) + 1);
    const attempt = commits.get(runId) ?? 0;
    if (attempt > afterCommits && !crashed.has(runId)) {
      crashed.add(runId);
      return Promise.reject(Object.assign(new Error('conexão perdida'), { code: '08006' }));
    }
    return Promise.resolve();
  };
}

async function runInProcess(
  context: LiveTestContext,
  params: { readonly name: string; readonly withAnalyst: boolean; readonly crashAfter?: number },
): Promise<StartedRun & { readonly elapsedMilliseconds: number }> {
  const user = await createLiveUser(context, params.name);
  const first = ANALYST_REAL_DATASET.candles[LEAD_IN_CANDLES];
  if (first === undefined) throw new Error('sem vela de partida');
  const run = await createLiveRun(context, {
    symbol: ANALYST_REAL_DATASET.market.symbol,
    timeframe: '15m',
    periodStart: first.openTime,
    user,
    ...(params.withAnalyst ? { request: ANALYST_REQUEST } : {}),
  });
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId: params.name,
    ...(params.crashAfter === undefined ? {} : { beforeCommit: crashOnce(params.crashAfter) }),
  });
  const startedAt = Date.now();
  await tickUntilQuiet(evaluator);
  const elapsedMilliseconds = Date.now() - startedAt;
  assertCondition(errorsOf(entries).length === 0, `${params.name}: o avaliador registrou erro`);
  await cancelRun(context, { runId: run.id, user });
  return { runId: run.id, user, elapsedMilliseconds };
}

function spawnDoomedChild(context: LiveTestContext): Bun.Subprocess {
  return Bun.spawn([process.execPath, 'run', CHILD_SCRIPT], {
    cwd: new URL('../../', import.meta.url).pathname,
    env: {
      PATH: Bun.env['PATH'] ?? '',
      HOME: Bun.env['HOME'] ?? '',
      DATABASE_URL: context.databaseUrl,
      [CHILD_INSTANCE_VARIABLE]: 'analyst-doomed',
      [CHILD_KILL_VARIABLE]: String(CRASH_AFTER_COMMITS),
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });
}

async function assertDecisionsPerCandle(
  context: LiveTestContext,
  params: { readonly label: string; readonly runId: string; readonly count: number },
): Promise<void> {
  const rows = await decisionRows(context, params.runId);
  const first = ANALYST_REAL_DATASET.candles[0]?.openTime ?? 0;
  assertCondition(
    rows.length === params.count,
    `${params.label}: ${rows.length} decisões, esperado ${params.count}`,
  );
  assertCondition(
    rows.every(
      (row, index) =>
        Number(row.candle_time) === first + index * FIFTEEN_MINUTES &&
        row.mode === 'shadow' &&
        row.status === 'decided',
    ),
    `${params.label}: as decisões não são uma por vela, na grade de 15 min, em sombra e decididas`,
  );
}

async function runKilledAndResumed(
  context: LiveTestContext,
): Promise<StartedRun & { readonly diedAfter: number }> {
  const user = await createLiveUser(context, 'analyst-killed');
  const first = ANALYST_REAL_DATASET.candles[LEAD_IN_CANDLES];
  if (first === undefined) throw new Error('sem vela de partida');
  const run = await createLiveRun(context, {
    symbol: ANALYST_REAL_DATASET.market.symbol,
    timeframe: '15m',
    periodStart: first.openTime,
    user,
    request: ANALYST_REQUEST,
  });
  const child = spawnDoomedChild(context);
  await child.exited;
  assertCondition(child.signalCode === 'SIGKILL', 'o processo do analista não morreu por SIGKILL');
  const dead = await readProgress(context, run.id);
  assertCondition(
    dead.status === 'running' && dead.claimedBy === 'analyst-doomed',
    'execução não ficou presa ao morto',
  );
  await assertDecisionsPerCandle(context, {
    label: 'depois do SIGKILL',
    runId: run.id,
    count: CRASH_AFTER_COMMITS,
  });
  const rescuer = createProductionEvaluator(context, { instanceId: 'analyst-rescuer' });
  const lastCandle = ANALYST_REAL_DATASET.candles[CANDLE_COUNT - 1]?.openTime;
  await waitFor('a instância nova retomar e alcançar o último candle', async () => {
    await rescuer.evaluator.tick();
    await Bun.sleep(TICK_PAUSE_MILLISECONDS);
    return (await readProgress(context, run.id)).lastCandleTime === lastCandle;
  });
  assertCondition(errorsOf(rescuer.entries).length === 0, 'a instância de resgate registrou erro');
  await cancelRun(context, { runId: run.id, user });
  return { runId: run.id, user, diedAfter: CRASH_AFTER_COMMITS };
}

function analystEventsOf(raw: readonly string[], runId: string): RunEvent[] {
  return raw
    .flatMap((payload) => parseRunEventPayload(payload) ?? [])
    .filter((event) => event.kind === 'analyst' && event.runId === runId);
}

export async function checkAnalyst(context: LiveTestContext): Promise<void> {
  const candles = ANALYST_REAL_DATASET.candles.slice(0, CANDLE_COUNT);
  await seedCandles(context, candles);
  const raw: string[] = [];
  const listener = createNotificationListener({
    databaseUrl: context.databaseUrl,
    channel: RUN_EVENTS_CHANNEL,
    onNotification: (payload) => void raw.push(payload),
    onListening: () => undefined,
    onLost: () => undefined,
  });
  try {
    await listener.ready;
    const plain = await runInProcess(context, { name: 'analyst-plain', withAnalyst: false });
    const reference = await runInProcess(context, {
      name: 'analyst-reference',
      withAnalyst: true,
      crashAfter: CRASH_AFTER_COMMITS,
    });
    const killed = await runKilledAndResumed(context);
    await Bun.sleep(300);
    await assertDecisionsPerCandle(context, {
      label: 'execução contínua com sombra',
      runId: reference.runId,
      count: CANDLE_COUNT,
    });
    await assertDecisionsPerCandle(context, {
      label: 'execução morta e retomada com sombra',
      runId: killed.runId,
      count: CANDLE_COUNT,
    });
    assertCondition(
      (await decisionRows(context, plain.runId)).length === 0,
      'a simulação sem analista gravou decisão',
    );
    const plainDigest = await resultRowsDigest(context, plain.runId);
    assertCondition(
      (await resultRowsDigest(context, reference.runId)) === plainDigest,
      'com a sombra, as linhas da simulação diferem das da sem sombra',
    );
    assertCondition(
      (await resultRowsDigest(context, killed.runId)) === plainDigest,
      'com a sombra e a morte, as linhas da simulação diferem das da sem sombra',
    );
    assertCondition(
      (await decisionsDigest(context, killed.runId)) ===
        (await decisionsDigest(context, reference.runId)),
      'as decisões depois da morte e da retomada diferem das da execução contínua',
    );
    const eventTimes = (runId: string): string[] =>
      analystEventsOf(raw, runId)
        .map((event) => event.eventId)
        .sort();
    const expectedTimes = candles.map((candle) => String(candle.openTime)).sort();
    assertCondition(
      JSON.stringify(eventTimes(killed.runId)) === JSON.stringify(expectedTimes),
      `${eventTimes(killed.runId).length} avisos do analista (execução morta), esperado um por vela`,
    );
    assertCondition(
      JSON.stringify(eventTimes(reference.runId)) === JSON.stringify(expectedTimes) &&
        eventTimes(plain.runId).length === 0,
      'avisos do analista da execução contínua ou da sem sombra',
    );
    reportLine(
      `(T2.3) analista em sombra: ${CANDLE_COUNT} velas de 15 min, uma decisão e um NOTIFY \`analyst\` por vela na mesma transação do passo; SIGKILL após ${killed.diedAfter} passos deixou exatamente ${killed.diedAfter} decisões e a retomada completou sem duplicar nem perder (decisões IDÊNTICAS às da execução contínua, digest ${(await decisionsDigest(context, reference.runId)).slice(0, 16)}); sinais, ordens, operações, posições, saldo e comandos IDÊNTICOS aos da simulação sem sombra (digest ${plainDigest.slice(0, 16)}); contínua com sombra em ${reference.elapsedMilliseconds} ms contra ${plain.elapsedMilliseconds} ms sem`,
    );
  } finally {
    await listener.close();
  }
}
