// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { AppendResult } from '../src/run-results/run-result.types.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildCommands,
  buildEquityPoints,
  buildFills,
  buildOrders,
  buildPositions,
  buildSignals,
  resolvePersistenceOwner,
  type PersistenceOwner,
  seedRun,
  SYNTHETIC_EQUITY_POINTS,
  SYNTHETIC_SIGNALS,
  SYNTHETIC_TRADES,
} from './persistence-seed.js';

export const BATCH_TIME_BUDGET_MILLISECONDS = 1_500;
const OVERSIZED_ORDERS = 5_200;
const ATOMIC_ROWS = 6_000;
const ATOMIC_BAD_ROW = 5_500;

type DigestRow = { readonly total: number; readonly digest: string | null };

async function digestOf(client: Bun.SQL, table: string, runId: string): Promise<DigestRow> {
  const rows: unknown = await client.unsafe(
    `SELECT count(*)::int AS total, md5(string_agg(t::text, '|' ORDER BY t::text)) AS digest FROM ${table} t WHERE run_id = $1`,
    [runId],
  );
  return (rows as readonly DigestRow[])[0] ?? { total: 0, digest: null };
}

const RESULT_TABLES = ['signals', 'orders', 'fills', 'positions', 'equity_points', 'run_commands'];

async function snapshotRun(client: Bun.SQL, runId: string): Promise<readonly DigestRow[]> {
  return Promise.all(RESULT_TABLES.map((table) => digestOf(client, table, runId)));
}

export type LargeBatchRun = { readonly owner: PersistenceOwner; readonly runId: string };

export async function checkLargeBatch(context: LifecycleCheckContext): Promise<LargeBatchRun> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-batch-owner');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  const equity = buildEquityPoints(SYNTHETIC_EQUITY_POINTS);
  const signals = buildSignals(SYNTHETIC_SIGNALS);
  const orders = buildOrders(SYNTHETIC_TRADES);
  const fills = buildFills(SYNTHETIC_TRADES);
  const positions = buildPositions(SYNTHETIC_TRADES);
  const commands = buildCommands(20);
  const steps: readonly (readonly [string, () => Promise<AppendResult | undefined>])[] = [
    [
      'pontos',
      (): Promise<AppendResult | undefined> =>
        results.appendEquityPoints(owner.scope, run.id, equity),
    ],
    [
      'sinais',
      (): Promise<AppendResult | undefined> => results.appendSignals(owner.scope, run.id, signals),
    ],
    [
      'ordens',
      (): Promise<AppendResult | undefined> => results.appendOrders(owner.scope, run.id, orders),
    ],
    [
      'preenchimentos',
      (): Promise<AppendResult | undefined> => results.appendFills(owner.scope, run.id, fills),
    ],
    [
      'posições',
      (): Promise<AppendResult | undefined> =>
        results.appendPositions(owner.scope, run.id, positions),
    ],
    [
      'comandos',
      (): Promise<AppendResult | undefined> =>
        results.appendCommands(owner.scope, run.id, commands),
    ],
  ];
  const durations: string[] = [];
  const persist = async (): Promise<readonly (number | undefined)[]> => {
    const written: (number | undefined)[] = [];
    for (const [label, step] of steps) {
      const stepStartedAt = performance.now();
      written.push((await step())?.written);
      durations.push(`${label} ${(performance.now() - stepStartedAt).toFixed(0)} ms`);
    }
    return written;
  };
  const startedAt = performance.now();
  const first = await persist();
  const elapsed = performance.now() - startedAt;
  const expected = [SYNTHETIC_EQUITY_POINTS, SYNTHETIC_SIGNALS, 300, 300, 300, 20];
  assertCondition(first.join() === expected.join(), `linhas gravadas: ${first.join()}`);
  reportCheck(
    `MEDIÇÃO gravação em lote de ${SYNTHETIC_EQUITY_POINTS} pontos + ${SYNTHETIC_SIGNALS} sinais + ${SYNTHETIC_TRADES} ordens/preenchimentos/posições: ${elapsed.toFixed(0)} ms (meta < ${BATCH_TIME_BUDGET_MILLISECONDS} ms; ${durations.join(', ')})`,
  );
  assertCondition(elapsed < BATCH_TIME_BUDGET_MILLISECONDS, `lote lento: ${elapsed.toFixed(0)} ms`);
  const before = await snapshotRun(client, run.id);
  const second = await persist();
  const after = await snapshotRun(client, run.id);
  assertCondition(
    second.every((written) => written === 0),
    `reenvio gravou linhas: ${second.join()}`,
  );
  assertCondition(JSON.stringify(before) === JSON.stringify(after), 'reenvio alterou o conteúdo');
  reportCheck('lote reenviado: nenhuma linha nova e nada alterado (contagem e digest idênticos)');
  return { owner, runId: run.id };
}

export async function checkOversizedOrderBatch(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-batch-owner');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  const written = await results.appendOrders(owner.scope, run.id, buildOrders(OVERSIZED_ORDERS));
  const digest = await digestOf(client, 'orders', run.id);
  assertCondition(
    written?.written === OVERSIZED_ORDERS && digest.total === OVERSIZED_ORDERS,
    'ordens (muitas colunas) respeitam o limite de parâmetros do protocolo em blocos',
  );
  reportCheck(`${OVERSIZED_ORDERS} ordens em blocos menores que o limite de 65.535 parâmetros`);
}

export async function checkBatchIsAtomic(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-batch-owner');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  const rows = buildEquityPoints(ATOMIC_ROWS).map((row, index) =>
    index === ATOMIC_BAD_ROW ? { ...row, equity: 'not-a-number' } : row,
  );
  const failure = await results.appendEquityPoints(owner.scope, run.id, rows).then(
    () => undefined,
    (error: unknown) => error,
  );
  const digest = await digestOf(client, 'equity_points', run.id);
  assertCondition(failure instanceof Error, 'linha inválida deve fazer o lote falhar');
  assertCondition(
    digest.total === 0,
    `lote falho deixou ${digest.total} linhas (deve ser tudo ou nada)`,
  );
  reportCheck('lote com linha inválida no 2º bloco: nada gravado (uma transação por lote)');
}
