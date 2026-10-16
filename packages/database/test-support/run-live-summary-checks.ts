// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { createRunLiveStatusRepository } from '../src/run-results/run-live-status.js';
import { ORDER_SIDE } from '../src/run-results/run-result.constant.js';
import type { FillInput } from '../src/run-results/run-result.types.js';
import { RUN_KIND, RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildEquityPoints,
  buildOrders,
  buildPositions,
  buildSignals,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const SYMBOL = 'SUMCHK';
const POINTS = 5;

function buildFill(params: {
  readonly orderKey: string;
  readonly positionKey: string;
  readonly index: number;
  readonly side: FillInput['side'];
}): FillInput {
  return {
    orderKey: params.orderKey,
    positionKey: params.positionKey,
    candleTime: candleTimeAt(params.index),
    side: params.side,
    price: '30000.00000000',
    quantity: '0.01500000',
    notional: '450.00000000',
    fee: '0.45000000',
  };
}

// Resumo das simulações ao vivo ativas (Visão geral): uma consulta só, do dono, das ativas, da mais recente para a mais
// antiga, com o último ponto do saldo, as contagens de compras e vendas e a última decisão. O `make api-runs-mutants` tira o filtro.
export async function checkLiveSummaryReads(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-live-summary');
  const stranger = await resolvePersistenceOwner(handle, 'subject-live-summary-other');
  const runs = createRunRepository(handle);
  const liveParams = { kind: RUN_KIND.LIVE_PAPER, symbol: SYMBOL, periodEnd: undefined };
  const traded = await seedRun(handle, owner, liveParams);
  const fresh = await seedRun(handle, owner, liveParams);
  const finished = await seedRun(handle, owner, liveParams);
  await seedRun(handle, owner, { symbol: SYMBOL });
  const foreign = await seedRun(handle, stranger, liveParams);
  for (const run of [traded, fresh, finished]) {
    await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  }
  await runs.transitionRun(owner.scope, { runId: finished.id, to: RUN_STATUS.COMPLETED });
  await runs.transitionRun(stranger.scope, { runId: foreign.id, to: RUN_STATUS.RUNNING });
  await createRunBatchRepository(handle).runInBatch(owner.scope, traded.id, (writer) =>
    writer.appendResults({
      signals: buildSignals(POINTS),
      orders: buildOrders(3),
      fills: [
        buildFill({
          orderKey: 'order-0',
          positionKey: 'position-0',
          index: 1,
          side: ORDER_SIDE.BUY,
        }),
        buildFill({
          orderKey: 'order-1',
          positionKey: 'position-0',
          index: 3,
          side: ORDER_SIDE.SELL,
        }),
        buildFill({
          orderKey: 'order-2',
          positionKey: 'position-1',
          index: 4,
          side: ORDER_SIDE.BUY,
        }),
      ],
      positions: buildPositions(2),
      equityPoints: buildEquityPoints(POINTS),
      commands: [],
    }),
  );
  const reads = createRunLiveStatusRepository(handle);
  const rows = await reads.listLiveSummaries(owner.scope);
  assertCondition(
    rows.map((row) => row.runId).join() === [fresh.id, traded.id].join(),
    `resumo: só as ativas do dono, da mais recente para a mais antiga (${rows.length} linhas)`,
  );
  const tradedRow = rows[1];
  assertCondition(
    tradedRow?.latestEquity === '10004.12345678' &&
      tradedRow.latestBenchmark === '10002.00000000' &&
      tradedRow.buyCount === 2 &&
      tradedRow.sellCount === 1 &&
      tradedRow.lastDecisionCandleTime === candleTimeAt(POINTS - 1) &&
      tradedRow.timeframe === '1h' &&
      tradedRow.initialBalance === '10000' &&
      tradedRow.analystMode === undefined &&
      !tradedRow.isWaitingForData,
    `resumo: último ponto, contagens e última decisão (${JSON.stringify(tradedRow)})`,
  );
  const freshRow = rows[0];
  assertCondition(
    freshRow !== undefined &&
      freshRow.latestEquity === undefined &&
      freshRow.buyCount === 0 &&
      freshRow.lastDecisionCandleTime === undefined,
    'resumo: simulação sem vela fechada não tem ponto nem decisão',
  );
  const foreignRows = await reads.listLiveSummaries(stranger.scope);
  assertCondition(
    foreignRows.length === 1 && foreignRows[0]?.runId === foreign.id,
    'resumo: o dono alheio vê só a própria simulação',
  );
  reportCheck(
    'resumo ao vivo: ativas do dono numa consulta, mais recente primeiro, último ponto, compras e vendas e última decisão; sem terminadas, backtests nem simulação alheia',
  );
}
