// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCandleRepository } from '../src/candles/candle.repository.js';
import type { CandleRecord } from '../src/candles/candle.types.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { createRunLiveStatusRepository } from '../src/run-results/run-live-status.js';
import { EXIT_REASON, POSITION_STATUS } from '../src/run-results/run-result.constant.js';
import type { PositionInput } from '../src/run-results/run-result.types.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildEquityPoints,
  buildSignals,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
  SYNTHETIC_CANDLE_MILLISECONDS,
} from './persistence-seed.js';

const EXCHANGE = 'binance';
const SYMBOL = 'LIVECHK';
const TIMEFRAME = '1h';
const CLOCK_MILLISECONDS = Date.UTC(2030, 0, 1);
const DECISIONS = 30;
const PAGE = 24;
const MARKET = { exchange: EXCHANGE, symbol: SYMBOL, timeframe: TIMEFRAME } as const;

function closeAt(index: number): string {
  return `${100 + index}.50000000`;
}

function buildCandles(): readonly CandleRecord[] {
  return Array.from({ length: DECISIONS }, (_unused, index) => ({
    exchange: EXCHANGE,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTime: candleTimeAt(index),
    closeTime: candleTimeAt(index) + SYNTHETIC_CANDLE_MILLISECONDS - 1,
    open: closeAt(index),
    high: `${101 + index}.50000000`,
    low: `${99 + index}.50000000`,
    close: closeAt(index),
    volume: '1.00000000',
    tradeCount: 1,
  }));
}

function buildPosition(params: {
  readonly key: string;
  readonly openedIndex: number;
  readonly closedIndex: number | undefined;
}): PositionInput {
  const isOpen = params.closedIndex === undefined;
  return {
    engineKey: params.key,
    status: isOpen ? POSITION_STATUS.OPEN : POSITION_STATUS.CLOSED,
    entryPrice: '100.00000000',
    quantity: '1.00000000',
    stopPrice: '95.00000000',
    targetPrice: '110.00000000',
    entryFee: '0.10000000',
    exitPrice: isOpen ? undefined : '105.00000000',
    exitFee: isOpen ? undefined : '0.10000000',
    netProfit: isOpen ? undefined : '4.80000000',
    exitReason: isOpen ? undefined : EXIT_REASON.TARGET,
    openedCandleTime: candleTimeAt(params.openedIndex),
    closedCandleTime:
      params.closedIndex === undefined ? undefined : candleTimeAt(params.closedIndex),
  };
}

// Isolamento e ordem das leituras do acompanhamento ao vivo (spec 008, T1.3): as quatro leituras filtram o dono nelas
// mesmas, a página de decisões é decrescente e o cursor concatena a lista inteira. O `make api-runs-mutants` tira cada filtro.
export async function checkLiveStatusReads(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-live-status');
  const stranger = await resolvePersistenceOwner(handle, 'subject-live-status-other');
  const run = await seedRun(handle, owner, {
    kind: RUN_KIND.LIVE_PAPER,
    symbol: SYMBOL,
    periodEnd: undefined,
  });
  await createCandleRepository(handle, { now: () => CLOCK_MILLISECONDS }).upsertCandles(
    buildCandles(),
  );
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: buildSignals(DECISIONS),
      orders: [],
      fills: [],
      positions: [
        buildPosition({ key: 'closed-across', openedIndex: 4, closedIndex: 7 }),
        buildPosition({ key: 'closed-same-candle', openedIndex: 12, closedIndex: 12 }),
        buildPosition({ key: 'still-open', openedIndex: 20, closedIndex: undefined }),
      ],
      equityPoints: buildEquityPoints(DECISIONS),
      commands: [],
    }),
  );
  const reads = createRunLiveStatusRepository(handle);

  const latest = await reads.readLatestEquityPoint(owner.scope, run.id);
  assertCondition(
    latest?.candleTime === candleTimeAt(DECISIONS - 1),
    `ao vivo: o último ponto de patrimônio não é o mais recente (${latest?.candleTime})`,
  );
  assertCondition(
    (await reads.readLatestEquityPoint(stranger.scope, run.id)) === undefined,
    'ao vivo: outro dono leu o ponto de patrimônio',
  );

  const first = await reads.listDecisionRows(owner.scope, run.id, {
    market: MARKET,
    before: undefined,
    limit: PAGE,
  });
  const times = first.items.map((item) => item.candleTime);
  assertCondition(
    times.length === PAGE &&
      times.every((time, index) => time === candleTimeAt(DECISIONS - 1 - index)),
    `ao vivo: a primeira página não é decrescente a partir da vela mais recente (${times.length} linhas)`,
  );
  assertCondition(
    first.nextBefore === candleTimeAt(DECISIONS - PAGE),
    `ao vivo: o cursor da primeira página deveria ser a última linha entregue (${first.nextBefore})`,
  );
  assertCondition(
    first.items.every(
      (item) =>
        item.close ===
          closeAt((item.candleTime - candleTimeAt(0)) / SYNTHETIC_CANDLE_MILLISECONDS) &&
        item.closeTime === item.candleTime + SYNTHETIC_CANDLE_MILLISECONDS - 1,
    ),
    'ao vivo: o fechamento ou o close_time da vela de cada decisão não bate com a junção pela PK de candles',
  );
  const second = await reads.listDecisionRows(owner.scope, run.id, {
    market: MARKET,
    before: first.nextBefore,
    limit: PAGE,
  });
  const concatenated = [...first.items, ...second.items].map((item) => item.candleTime);
  assertCondition(
    second.nextBefore === undefined &&
      concatenated.length === DECISIONS &&
      new Set(concatenated).size === DECISIONS,
    `ao vivo: as duas páginas deveriam somar as ${DECISIONS} decisões sem repetir (${concatenated.length})`,
  );
  const exact = await reads.listDecisionRows(owner.scope, run.id, {
    market: MARKET,
    before: undefined,
    limit: DECISIONS,
  });
  assertCondition(
    exact.items.length === DECISIONS && exact.nextBefore === undefined,
    'ao vivo: limite igual ao total não deveria devolver cursor',
  );
  const foreignPage = await reads.listDecisionRows(stranger.scope, run.id, {
    market: MARKET,
    before: undefined,
    limit: PAGE,
  });
  assertCondition(
    foreignPage.items.length === 0 && foreignPage.nextBefore === undefined,
    'ao vivo: outro dono leu as decisões',
  );
  let rejected = false;
  try {
    await reads.listDecisionRows(owner.scope, run.id, {
      market: { ...MARKET, symbol: 'SEMVELA' },
      before: undefined,
      limit: 1,
    });
  } catch {
    rejected = true;
  }
  assertCondition(
    rejected,
    'ao vivo: decisão sem a vela correspondente deveria virar erro, não linha omitida',
  );

  const openOnly = await reads.listPositionsAround(owner.scope, run.id, {
    span: undefined,
    limit: 10,
  });
  assertCondition(
    openOnly.length === 1 && openOnly[0]?.engineKey === 'still-open',
    `ao vivo: sem faixa, só a posição aberta (${openOnly.length})`,
  );
  const crossing = await reads.listPositionsAround(owner.scope, run.id, {
    span: { from: candleTimeAt(5), to: candleTimeAt(25) },
    limit: 10,
  });
  assertCondition(
    crossing.map((position) => position.engineKey).join() ===
      'closed-across,closed-same-candle,still-open',
    `ao vivo: posições que cruzam a faixa em ordem de abertura (${crossing.map((p) => p.engineKey).join()})`,
  );
  const narrow = await reads.listPositionsAround(owner.scope, run.id, {
    span: { from: candleTimeAt(8), to: candleTimeAt(11) },
    limit: 10,
  });
  assertCondition(
    narrow.length === 1 && narrow[0]?.engineKey === 'still-open',
    `ao vivo: fora da faixa só a aberta (${narrow.length})`,
  );
  const foreignPositions = await reads.listPositionsAround(stranger.scope, run.id, {
    span: { from: candleTimeAt(0), to: candleTimeAt(DECISIONS) },
    limit: 10,
  });
  assertCondition(foreignPositions.length === 0, 'ao vivo: outro dono leu as posições');

  const markers = await reads.listDecisionMarkers(owner.scope, run.id, {
    range: { from: candleTimeAt(5), to: candleTimeAt(10) },
    limit: 501,
  });
  assertCondition(
    markers.length === 5 &&
      markers.every((marker, index) => marker.candleTime === candleTimeAt(5 + index)),
    `ao vivo: pontinhos da faixa [5, 10) em ordem crescente (${markers.length})`,
  );
  const capped = await reads.listDecisionMarkers(owner.scope, run.id, {
    range: { from: candleTimeAt(0), to: candleTimeAt(DECISIONS) },
    limit: 3,
  });
  assertCondition(capped.length === 3, 'ao vivo: o limite dos pontinhos não foi respeitado');
  const foreignMarkers = await reads.listDecisionMarkers(stranger.scope, run.id, {
    range: { from: candleTimeAt(0), to: candleTimeAt(DECISIONS) },
    limit: 501,
  });
  assertCondition(foreignMarkers.length === 0, 'ao vivo: outro dono leu os pontinhos');

  reportCheck(
    'ao vivo: último ponto, 30 decisões em duas páginas decrescentes com junção em candles, posições que cruzam a faixa e pontinhos; dono alheio recebe vazio nas quatro leituras',
  );
}
