// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import type {
  EquityPointInput,
  FillCursor,
  FillInput,
  OrderCursor,
  OrderInput,
  PositionCursor,
  PositionInput,
  ResultPage,
  SignalInput,
} from '../src/run-results/run-result.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import type { LargeBatchRun } from './run-result-batch-checks.js';
import {
  SYNTHETIC_EQUITY_POINTS,
  SYNTHETIC_SIGNALS,
  SYNTHETIC_TRADES,
} from './persistence-seed.js';

const MAXIMUM_PAGE_SIZE = 5_000;
const PAGE_GUARD = 100;

type Reader<TItem, TCursor> = (
  limit: number,
  after: TCursor | undefined,
) => Promise<ResultPage<TItem, TCursor> | undefined>;

async function readAll<TItem, TCursor>(
  read: Reader<TItem, TCursor>,
  limit: number,
): Promise<readonly TItem[]> {
  const items: TItem[] = [];
  let after: TCursor | undefined;
  for (let pages = 0; pages < PAGE_GUARD; pages += 1) {
    const page = await read(limit, after);
    if (page === undefined) throw new Error('execução não encontrada ao paginar');
    items.push(...page.items);
    after = page.nextCursor;
    if (after === undefined) return items;
  }
  throw new Error('paginação não terminou');
}

function hasNoDuplicate(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export async function checkResultPagination(
  context: LifecycleCheckContext,
  batch: LargeBatchRun,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const { owner, runId } = batch;
  const results = createRunResultRepository(handle);
  for (const limit of [MAXIMUM_PAGE_SIZE, 1_000, 777]) {
    const points = await readAll<EquityPointInput, number>(
      (pageLimit, after) =>
        results.listEquityPoints(owner.scope, runId, { limit: pageLimit, after }),
      limit,
    );
    const times = points.map((point) => point.candleTime);
    assertCondition(points.length === SYNTHETIC_EQUITY_POINTS, `equity ${limit}: ${points.length}`);
    assertCondition(hasNoDuplicate(times.map(String)), `equity ${limit}: repetiu`);
    assertCondition(
      times.every((time, index) => index === 0 || time > (times[index - 1] ?? 0)),
      `equity ${limit}: ordem`,
    );
  }
  const oversized = await results.listEquityPoints(owner.scope, runId, {
    limit: 1_000_000,
    after: undefined,
  });
  assertCondition(oversized?.items.length === MAXIMUM_PAGE_SIZE, 'o tamanho da página tem teto');
  const signals = await readAll<SignalInput, number>(
    (limit, after) => results.listSignals(owner.scope, runId, { limit, after }),
    500,
  );
  assertCondition(
    signals.length === SYNTHETIC_SIGNALS &&
      hasNoDuplicate(signals.map((signal) => String(signal.candleTime))),
    'sinais',
  );
  assertCondition(
    signals[0]?.reason === 'Motivo do sinal 0' &&
      signals[0].sentimentObservation !== undefined &&
      signals[1]?.sentimentObservation === undefined,
    'sinal volta com a observação de sentimento e o motivo',
  );
  const orders = await readAll<OrderInput, OrderCursor>(
    (limit, after) => results.listOrders(owner.scope, runId, { limit, after }),
    7,
  );
  const fills = await readAll<FillInput, FillCursor>(
    (limit, after) => results.listFills(owner.scope, runId, { limit, after }),
    7,
  );
  const positions = await readAll<PositionInput, PositionCursor>(
    (limit, after) => results.listPositions(owner.scope, runId, { limit, after }),
    7,
  );
  assertCondition(
    orders.length === SYNTHETIC_TRADES && hasNoDuplicate(orders.map((order) => order.engineKey)),
    'ordens',
  );
  assertCondition(
    fills.length === SYNTHETIC_TRADES && hasNoDuplicate(fills.map((fill) => fill.orderKey)),
    'preenchimentos',
  );
  assertCondition(
    positions.length === SYNTHETIC_TRADES &&
      hasNoDuplicate(positions.map((position) => position.engineKey)),
    'posições',
  );
  const newestFirst = await readAll<PositionInput, PositionCursor>(
    (limit, after) => results.listPositions(owner.scope, runId, { limit, after, order: 'desc' }),
    7,
  );
  assertCondition(
    newestFirst.map((position) => position.engineKey).join() ===
      positions
        .map((position) => position.engineKey)
        .reverse()
        .join(),
    'posições em ordem decrescente: o inverso exato da crescente, em páginas',
  );
  reportCheck(
    `leitura paginada: ${SYNTHETIC_EQUITY_POINTS} pontos (páginas de 5000, 1000 e 777), ${SYNTHETIC_SIGNALS} sinais e ${SYNTHETIC_TRADES} ordens/preenchimentos/posições sem repetir nem pular`,
  );
}
