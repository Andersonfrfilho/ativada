// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createNoticeFeedRepository } from '../src/notices/notice-feed.repository.js';
import { NOTICE_FEED_SCOPE, NOTICE_SOURCE } from '../src/notices/notice-feed.types.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import {
  EXIT_REASON,
  ORDER_REASON,
  ORDER_STATUS,
  ORDER_TYPE,
  POSITION_STATUS,
} from '../src/run-results/run-result.constant.js';
import type { OrderInput } from '../src/run-results/run-result.types.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildFills,
  buildRunParams,
  buildOrders,
  buildPositions,
  candleTimeAt,
  resolvePersistenceOwner,
  seedStrategyVersion,
  SYNTHETIC_CANDLE_MILLISECONDS,
} from './persistence-seed.js';

const SINCE = 0;
const PAGE_SIZE = 2;

function withState(order: OrderInput, overrides: Partial<OrderInput>): OrderInput {
  return { ...order, ...overrides };
}

// Quatro ordens de entrada (executada, pedida, cancelada por sinal contrário, limitada vencida) e uma posição fechada.
function buildNoticeOrders(): readonly OrderInput[] {
  const [filled, created, cancelled, expired] = buildOrders(4);
  if (
    filled === undefined ||
    created === undefined ||
    cancelled === undefined ||
    expired === undefined
  ) {
    throw new Error('ordens de semente ausentes');
  }
  return [
    filled,
    withState(created, { status: ORDER_STATUS.CREATED }),
    withState(cancelled, { status: ORDER_STATUS.CANCELLED, reason: ORDER_REASON.OPPOSITE_SIGNAL }),
    withState(expired, {
      type: ORDER_TYPE.LIMIT,
      status: ORDER_STATUS.EXPIRED,
      limitPrice: '99.50000000',
      expiresCandleTime: candleTimeAt(8),
    }),
  ];
}

// Os avisos da simulação ao vivo do dono: ordem por ordem, sem as execuções de backtest nem as de outro dono.
export async function checkNoticeFeed(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-notice-feed');
  const stranger = await resolvePersistenceOwner(handle, 'subject-notice-feed-other');
  const version = await seedStrategyVersion(handle, owner);
  const runs = createRunRepository(handle);
  const live = await runs.createRun(
    owner.scope,
    buildRunParams(version.id, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined }),
  );
  const backtest = await runs.createRun(owner.scope, buildRunParams(version.id));
  if (live === undefined || backtest === undefined)
    throw new Error('execuções de semente ausentes');
  await createRunBatchRepository(handle).runInBatch(owner.scope, live.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: buildNoticeOrders(),
      fills: buildFills(1),
      positions: buildPositions(1).map((position) => ({
        ...position,
        status: POSITION_STATUS.CLOSED,
        exitReason: EXIT_REASON.STOP,
      })),
      equityPoints: [],
      commands: [],
    }),
  );
  await createRunBatchRepository(handle).runInBatch(owner.scope, backtest.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: buildOrders(2, 'bt-'),
      fills: [],
      positions: [],
      equityPoints: [],
      commands: [],
    }),
  );
  await client`UPDATE runs SET stalled_since = ${candleTimeAt(30)} WHERE id = ${live.id}`;
  await client`INSERT INTO alerts (id, user_id, run_id, candle_time, side, channel, payload)
    VALUES (${crypto.randomUUID()}, ${owner.userId}, ${live.id}, ${candleTimeAt(30)}, 'RESUME', 'telegram', '{}'::jsonb)`;
  await client`INSERT INTO price_alerts (id, user_id, symbol, direction, value, origin, last_fired_at)
    VALUES (${crypto.randomUUID()}, ${owner.userId}, 'BTCUSDT', 'above', '70000', 'manual', now())`;
  await client`UPDATE runs SET status = 'completed', started_at = now(), finished_at = now(), progress = 100,
      metrics = '{"totalReturn":{"value":"-0.143","reason":null},"period":{"elapsedMilliseconds":15811200000}}'::jsonb
    WHERE id = ${backtest.id}`;
  const feed = createNoticeFeedRepository(handle);
  const base = {
    since: SINCE,
    limit: 50,
    scope: NOTICE_FEED_SCOPE.ALL,
    older: undefined,
    newer: undefined,
  };

  const rows = await feed.listNoticeSources(owner.scope, base);
  const times = rows.map((row) => row.occurredAt);
  assertCondition(
    rows.length === 8 &&
      times.every((time, index) => index === 0 || (times[index - 1] ?? 0) >= time),
    `avisos: esperava 8 avisos em ordem decrescente, veio ${rows.length}`,
  );
  assertCondition(
    rows.every((row) => row.runId === undefined || row.runId === live.id),
    'avisos: apareceu aviso de execução que não é ao vivo',
  );
  const entry = rows.find((row) => row.noticeId === `order:${live.id}:order-0`);
  assertCondition(
    entry?.source === NOTICE_SOURCE.ENTRY_ORDER &&
      entry.state === ORDER_STATUS.FILLED &&
      entry.occurredAt === candleTimeAt(1) + SYNTHETIC_CANDLE_MILLISECONDS &&
      entry.price === '30000.00000000' &&
      entry.targetPrice === '31000.00000000' &&
      entry.stopPrice === '29000.00000000' &&
      entry.entryPrice === '30000.00000000' &&
      entry.fee === '0.45000000',
    'avisos: a ordem executada não trouxe preço, taxa, alvo e proteção da posição',
  );
  const limit = rows.find((row) => row.noticeId === `order:${live.id}:order-3`);
  assertCondition(
    limit?.orderType === ORDER_TYPE.LIMIT && limit.expiresCandleTime === candleTimeAt(8),
    'avisos: a ordem limitada vencida perdeu tipo ou validade',
  );
  const exit = rows.find((row) => row.source === NOTICE_SOURCE.EXIT_POSITION);
  assertCondition(
    exit?.reason === EXIT_REASON.STOP &&
      exit.netProfit === '6.59000000' &&
      exit.initialBalance === '10000',
    'avisos: a saída não trouxe motivo, resultado e saldo inicial',
  );
  assertCondition(
    entry?.createdCandleTime === candleTimeAt(0) &&
      entry.notional === '450.00000000' &&
      entry.quantity === '0.01500000' &&
      entry.strategyVersionId === version.id,
    'avisos: a compra executada não trouxe decisão, notional, quantidade, versão e parâmetros da simulação',
  );
  const histories = await feed.listNoticeHistories(owner.scope, [
    { strategyVersionId: version.id, symbol: 'BTCUSDT', timeframe: '1h' },
  ]);
  assertCondition(
    histories.length === 1 &&
      histories[0]?.totalReturn === '-0.143' &&
      histories[0].elapsedMilliseconds === 15_811_200_000 &&
      histories[0].kind === RUN_KIND.BACKTEST,
    `avisos: o histórico não trouxe o último backtest concluído da versão, par e vela (${JSON.stringify(histories)})`,
  );
  const foreignHistories = await feed.listNoticeHistories(stranger.scope, [
    { strategyVersionId: version.id, symbol: 'BTCUSDT', timeframe: '1h' },
  ]);
  assertCondition(
    foreignHistories.length === 0,
    'avisos: outro dono leu o histórico de backtests alheio',
  );
  reportCheck('avisos: ciclo da ordem, saída e parada no mesmo fluxo OK');

  const strangerRows = await feed.listNoticeSources(stranger.scope, base);
  assertCondition(strangerRows.length === 0, 'avisos: outro dono leu avisos alheios');
  const priceOnly = await feed.listNoticeSources(owner.scope, {
    ...base,
    scope: NOTICE_FEED_SCOPE.PRICE_ALERTS,
  });
  assertCondition(
    priceOnly.length === 1 && priceOnly[0]?.source === NOTICE_SOURCE.PRICE_ALERT,
    'avisos: o recorte de alertas de preço não trouxe só o disparo',
  );
  const runsOnly = await feed.listNoticeSources(owner.scope, {
    ...base,
    scope: NOTICE_FEED_SCOPE.RUNS,
  });
  assertCondition(
    runsOnly.length === 7,
    'avisos: o recorte das simulações trouxe o alerta de preço',
  );

  const first = await feed.listNoticeSources(owner.scope, { ...base, limit: PAGE_SIZE });
  const last = first.at(-1);
  const second = await feed.listNoticeSources(owner.scope, {
    ...base,
    limit: PAGE_SIZE,
    older:
      last === undefined ? undefined : { occurredAt: last.occurredAt, noticeId: last.noticeId },
  });
  const paged = [...first, ...second].map((row) => row.noticeId);
  assertCondition(
    paged.length === PAGE_SIZE * 2 && paged.every((id, index) => id === rows[index]?.noticeId),
    'avisos: a página seguinte pelo cursor não continua a lista',
  );
  const head = rows[1];
  const newer = await feed.listNoticeSources(owner.scope, {
    ...base,
    newer:
      head === undefined ? undefined : { occurredAt: head.occurredAt, noticeId: head.noticeId },
  });
  assertCondition(
    newer.length === 1 && newer[0]?.noticeId === rows[0]?.noticeId,
    'avisos: o recorte "depois do cursor" não devolveu só o mais novo',
  );
  reportCheck('avisos: isolamento entre donos, recortes e paginação OK');
}
