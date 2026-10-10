// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readOpenDatabase } from '../src/database-handle.js';
import { listRunLog } from '../src/run-results/run-log-list.js';
import { RUN_LOG_KIND, RUN_LOG_RANK } from '../src/run-results/run-log.constant.js';
import type { RunLogCursor, RunLogEntry } from '../src/run-results/run-log.types.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildFills,
  buildOrders,
  buildSignals,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
  type PersistenceOwner,
} from './persistence-seed.js';

const SIGNALS = 1_200;
const ORDERS = 900;
const FILLS = 900;
const SMALL_PAGE = 7;
const BIG_PAGE = 5_000;
const MAXIMUM_PAGES = 1_000;

function keyOf(entry: RunLogEntry): string {
  return `${entry.eventTime}|${RUN_LOG_RANK[entry.kind]}|${entry.orderKey ?? ''}`;
}

async function readAll(
  context: LifecycleCheckContext,
  params: { readonly owner: PersistenceOwner; readonly runId: string; readonly limit: number },
): Promise<readonly RunLogEntry[]> {
  const results = createRunResultRepository(context.handle);
  const entries: RunLogEntry[] = [];
  let after: RunLogCursor | undefined;
  for (let page = 0; page < MAXIMUM_PAGES; page += 1) {
    const read = await results.listLog(params.owner.scope, params.runId, {
      limit: params.limit,
      after,
    });
    if (read === undefined) throw new Error('registro de execução própria não encontrado');
    entries.push(...read.items);
    if (read.nextCursor === undefined) return entries;
    after = read.nextCursor;
  }
  throw new Error('paginação do registro não terminou');
}

async function seedLog(context: LifecycleCheckContext, owner: PersistenceOwner): Promise<string> {
  const run = await seedRun(context.handle, owner);
  const results = createRunResultRepository(context.handle);
  await results.appendSignals(owner.scope, run.id, buildSignals(SIGNALS));
  await results.appendOrders(owner.scope, run.id, buildOrders(ORDERS));
  await results.appendFills(owner.scope, run.id, buildFills(FILLS));
  return run.id;
}

function isStrictlyIncreasing(entries: readonly RunLogEntry[]): boolean {
  return entries.every((entry, index) => {
    const previous = entries[index - 1];
    if (previous === undefined) return true;
    return (
      entry.eventTime > previous.eventTime ||
      (entry.eventTime === previous.eventTime &&
        (RUN_LOG_RANK[entry.kind] > RUN_LOG_RANK[previous.kind] ||
          (RUN_LOG_RANK[entry.kind] === RUN_LOG_RANK[previous.kind] &&
            (entry.orderKey ?? '') > (previous.orderKey ?? ''))))
    );
  });
}

async function checkOrderAndPaging(
  context: LifecycleCheckContext,
  params: { readonly owner: PersistenceOwner; readonly runId: string },
): Promise<void> {
  const { assertCondition } = context;
  const all = await readAll(context, { ...params, limit: BIG_PAGE });
  assertCondition(
    all.length === SIGNALS + ORDERS + FILLS,
    `registro com ${all.length} linhas para ${SIGNALS + ORDERS + FILLS} eventos`,
  );
  assertCondition(new Set(all.map(keyOf)).size === all.length, 'linha repetida no registro');
  assertCondition(isStrictlyIncreasing(all), 'o registro não está em ordem cronológica estrita');
  const paged = await readAll(context, { ...params, limit: SMALL_PAGE });
  assertCondition(
    paged.length === all.length &&
      paged.every((entry, index) => keyOf(entry) === keyOf(all[index] ?? entry)),
    'paginar de 7 em 7 dá outra sequência (perdeu, repetiu ou trocou linhas na fronteira)',
  );
  const sameCandle = all.filter((entry) => entry.eventTime === all[40]?.eventTime);
  const kinds = sameCandle.map((entry) => entry.kind);
  assertCondition(
    kinds.join() === [RUN_LOG_KIND.FILL, RUN_LOG_KIND.SIGNAL, RUN_LOG_KIND.ORDER].join(),
    `no mesmo candle a ordem é preenchimento, sinal, ordem; veio ${kinds.join()}`,
  );
}

async function checkShape(
  context: LifecycleCheckContext,
  params: { readonly owner: PersistenceOwner; readonly runId: string },
): Promise<void> {
  const { assertCondition } = context;
  const all = await readAll(context, { ...params, limit: BIG_PAGE });
  const order = all.find((entry) => entry.kind === RUN_LOG_KIND.ORDER);
  const fill = all.find((entry) => entry.kind === RUN_LOG_KIND.FILL);
  const signal = all.find((entry) => entry.kind === RUN_LOG_KIND.SIGNAL);
  if (order === undefined || fill === undefined || signal === undefined) {
    throw new Error('o registro não tem os três tipos de evento');
  }
  assertCondition(typeof order.eventTime === 'number', 'instante do candle não é número');
  assertCondition(
    order.price === '30000.00000000' && order.quantity === '0.01500000',
    `decimais da ordem fora do texto exato: ${order.price}/${order.quantity}`,
  );
  assertCondition(
    order?.stopDistance === '1234.567890123456' && order.targetDistance === '1851.851835185184',
    'distâncias da ordem perderam casas',
  );
  assertCondition(typeof order.lastEventTime === 'number', 'última atualização da ordem ausente');
  const fifth = all.find(
    (entry) => entry.orderKey === 'order-5' && entry.kind === RUN_LOG_KIND.ORDER,
  );
  assertCondition(
    fifth?.eventTime === candleTimeAt(5) && fifth.lastEventTime === candleTimeAt(6),
    'a ordem tem de entrar no candle em que nasceu, com a última atualização à parte',
  );
  assertCondition(
    fill.notional === '450.00000000' && fill.fee === '0.45000000' && fill.orderKey === 'order-0',
    'preenchimento sem os valores exatos',
  );
  assertCondition(
    signal.reason?.startsWith('Motivo do sinal') === true && signal.score !== undefined,
    'sinal sem motivo ou placar',
  );
  assertCondition(
    signal.lastEventTime === undefined && signal.price === undefined && fill.action === undefined,
    'campo de outro tipo de evento vazou para a linha',
  );
}

async function checkIsolation(
  context: LifecycleCheckContext,
  params: { readonly owner: PersistenceOwner; readonly runId: string },
): Promise<void> {
  const { assertCondition } = context;
  const stranger = await resolvePersistenceOwner(context.handle, 'subject-run-log-stranger');
  const strangerRun = await seedRun(context.handle, stranger);
  const results = createRunResultRepository(context.handle);
  await results.appendSignals(stranger.scope, strangerRun.id, buildSignals(3));
  await results.appendFills(stranger.scope, strangerRun.id, buildFills(2));
  const mine = await readAll(context, { ...params, limit: BIG_PAGE });
  assertCondition(mine.length === SIGNALS + ORDERS + FILLS, 'o registro misturou outra execução');
  const crossed = await results.listLog(stranger.scope, params.runId, {
    limit: 10,
    after: undefined,
  });
  assertCondition(crossed === undefined, 'o outro dono leu o registro de A');
  // O filtro de dono de cada uma das três consultas vale sozinho, sem a conferência da execução na frente.
  const direct = await listRunLog({
    executor: readOpenDatabase(context.handle).database,
    scope: stranger.scope,
    runId: params.runId,
    params: { limit: BIG_PAGE, after: undefined },
  });
  assertCondition(
    direct.items.length === 0,
    `a consulta sozinha vazou ${direct.items.length} linhas`,
  );
  const missing = await results.listLog(params.owner.scope, crypto.randomUUID(), {
    limit: 10,
    after: undefined,
  });
  assertCondition(missing === undefined, 'execução inexistente devia dar undefined');
  const own = await readAll(context, { owner: stranger, runId: strangerRun.id, limit: BIG_PAGE });
  assertCondition(own.length === 5, `registro de B com ${own.length} linhas (esperadas 5)`);
}

export async function checkRunLog(context: LifecycleCheckContext): Promise<void> {
  const owner = await resolvePersistenceOwner(context.handle, 'subject-run-log-owner');
  const runId = await seedLog(context, owner);
  await checkOrderAndPaging(context, { owner, runId });
  await checkShape(context, { owner, runId });
  await checkIsolation(context, { owner, runId });
  context.reportCheck(
    'registro cronológico: 3.000 eventos em ordem estrita (candle, preenchimento → sinal → ordem, chave), paginação de 7 em 7 igual à de uma vez, decimais em texto exato e isolamento entre donos e execuções',
  );
}
