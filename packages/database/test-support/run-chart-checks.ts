// Copyright (c) 2026 Ada Technology. All rights reserved.
import btcHourly from '../../../test/fixtures/strategy-engine/market/btcusdt-1h-500.json' with { type: 'json' };
import ethDaily from '../../../test/fixtures/strategy-engine/market/ethusdt-1d-400.json' with { type: 'json' };
import {
  referenceFillClusters,
  referencePriceColumns,
  referenceTradeTotals,
  type OracleCandle,
} from '../../../test/fixtures/run-chart/chart-oracle.fixture.js';
import {
  CANDLE_TIMEFRAME_DURATION_MILLISECONDS,
  type CANDLE_TIMEFRAMES,
} from '../src/candles/candle.constant.js';
import { createCandleRepository } from '../src/candles/candle.repository.js';
import type { CandleRecord } from '../src/candles/candle.types.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import type { PriceColumnsParams } from '../src/run-results/run-chart.types.js';
import {
  EXIT_REASON,
  ORDER_SIDE,
  POSITION_STATUS,
} from '../src/run-results/run-result.constant.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import type { FillInput, PositionInput, TimeRange } from '../src/run-results/run-result.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { candleTimeAt, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

type Timeframe = (typeof CANDLE_TIMEFRAMES)[number];
export type Series = {
  readonly name: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly candles: readonly OracleCandle[];
};

const EXCHANGE = 'binance';
const FIRST_OPEN_TIME = Date.UTC(2024, 0, 1);
const CLOCK_MILLISECONDS = Date.UTC(2030, 0, 1);
const CENTS = 100;
const POSITION_COUNT = 400;
const MARKER_LIMIT = 500;

// Sorteio determinístico: o mesmo resultado em toda execução.
function createRandom(seed: number): (modulo: number) => number {
  let state = seed;
  return (modulo) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % modulo;
  };
}

function toPrice(cents: number): string {
  return (cents / CENTS).toFixed(8);
}

// Mínimas repetidas de propósito (empate no mínimo) e preços com zeros à direita, para a grafia canônica.
function buildSyntheticCandles(count: number, seed: number): readonly OracleCandle[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_unused, index) => {
    const low = 10_000 + random(40) * 50;
    const high = low + random(30) * 50 + 50;
    const open = low + random(high - low + 1);
    const close = low + random(high - low + 1);
    return {
      openTime: FIRST_OPEN_TIME + index * CANDLE_TIMEFRAME_DURATION_MILLISECONDS['1h'],
      open: toPrice(open),
      high: toPrice(high),
      low: toPrice(low),
      close: toPrice(close),
    };
  });
}

type RawKline = readonly [number, string, string, string, string, ...unknown[]];

function fromKlines(klines: readonly RawKline[]): readonly OracleCandle[] {
  return klines.map(([openTime, open, high, low, close]) => ({
    openTime,
    open,
    high,
    low,
    close,
  }));
}

export function buildSeries(): readonly Series[] {
  return [
    {
      name: 'dízima no balde',
      symbol: 'CHARTA',
      timeframe: '1h',
      candles: buildSyntheticCandles(250, 7),
    },
    {
      name: 'uma vela por coluna',
      symbol: 'CHARTB',
      timeframe: '1h',
      candles: buildSyntheticCandles(100, 11),
    },
    {
      name: 'faixa menor que as colunas',
      symbol: 'CHARTC',
      timeframe: '1h',
      candles: buildSyntheticCandles(30, 13),
    },
    {
      name: 'conjunto real BTCUSDT 1h',
      symbol: 'CHARTBTC',
      timeframe: '1h',
      candles: fromKlines(btcHourly as unknown as readonly RawKline[]),
    },
    {
      name: 'conjunto real ETHUSDT 1d',
      symbol: 'CHARTETH',
      timeframe: '1d',
      candles: fromKlines(ethDaily as unknown as readonly RawKline[]),
    },
  ];
}

export function toRecord(series: Series, candle: OracleCandle): CandleRecord {
  return {
    exchange: EXCHANGE,
    symbol: series.symbol,
    timeframe: series.timeframe,
    openTime: candle.openTime,
    closeTime: candle.openTime + CANDLE_TIMEFRAME_DURATION_MILLISECONDS[series.timeframe] - 1,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: '1.00000000',
    tradeCount: 1,
  };
}

export type PriceCase = { readonly range: TimeRange; readonly columns: number };

// Faixa inteira, faixa que começa 1 ms depois da primeira vela, metade da série e colunas de sobra.
export function buildPriceCases(series: Series): readonly PriceCase[] {
  const first = series.candles[0]?.openTime ?? 0;
  const duration = CANDLE_TIMEFRAME_DURATION_MILLISECONDS[series.timeframe];
  const end = first + series.candles.length * duration;
  const middle = first + Math.trunc(series.candles.length / 2) * duration;
  return [
    { range: { from: first, to: end }, columns: 100 },
    { range: { from: first, to: end }, columns: 800 },
    { range: { from: first, to: end }, columns: 2_000 },
    { range: { from: first + 1, to: end }, columns: 137 },
    { range: { from: first, to: middle }, columns: 100 },
    { range: { from: middle - 1, to: middle + 3 * duration }, columns: 100 },
  ];
}

export async function checkPriceColumns(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-chart-prices');
  const stranger = await resolvePersistenceOwner(handle, 'subject-chart-prices-other');
  const run = await seedRun(handle, owner);
  const results = createRunResultRepository(handle);
  const candlesRepository = createCandleRepository(handle, { now: () => CLOCK_MILLISECONDS });
  for (const series of buildSeries()) {
    await candlesRepository.upsertCandles(series.candles.map((candle) => toRecord(series, candle)));
    for (const item of buildPriceCases(series)) {
      const params: PriceColumnsParams = {
        exchange: EXCHANGE,
        symbol: series.symbol,
        timeframe: series.timeframe,
        ...item,
      };
      const found = await results.listPriceColumns(owner.scope, run.id, params);
      const expected = referencePriceColumns({ candles: series.candles, ...item });
      assertCondition(
        JSON.stringify(found) === JSON.stringify(expected),
        `gráfico (${series.name}, ${item.columns} colunas, ${item.range.from}-${item.range.to}): o SQL diverge do oráculo (${found?.length} contra ${expected.length} colunas)`,
      );
      assertCondition(
        (found?.length ?? 0) <= item.columns,
        `gráfico (${series.name}): mais colunas do que o pedido`,
      );
    }
  }
  const any = buildPriceCases(buildSeries()[0] as Series)[0] as PriceCase;
  const foreign = await results.listPriceColumns(stranger.scope, run.id, {
    exchange: EXCHANGE,
    symbol: 'CHARTA',
    timeframe: '1h',
    ...any,
  });
  assertCondition(foreign === undefined, 'gráfico: execução de outro dono devolveu colunas');
  reportCheck(
    'preço reduzido: o SQL bate com o oráculo em 3 séries sintéticas e nos 2 conjuntos reais (6 faixas cada); dono alheio recebe undefined',
  );
}

export function buildChartFills(): {
  fills: readonly FillInput[];
  positions: readonly PositionInput[];
} {
  const random = createRandom(29);
  const fills: FillInput[] = [];
  const positions: PositionInput[] = [];
  for (let index = 0; index < POSITION_COUNT; index += 1) {
    const opened = index * 3 + random(2);
    const closed = opened + 1 + random(2);
    const netProfit = `${random(50) - 20}.${String(random(100)).padStart(2, '0')}000000`;
    const buy = fillOf({ index, side: ORDER_SIDE.BUY, candle: opened });
    fills.push(buy, fillOf({ index, side: ORDER_SIDE.SELL, candle: closed }));
    positions.push(positionOf({ index, opened, closed, netProfit }));
  }
  return { fills, positions };
}

function fillOf(params: { index: number; side: 'buy' | 'sell'; candle: number }): FillInput {
  return {
    orderKey: `${params.side}-${params.index}`,
    positionKey: `position-${params.index}`,
    candleTime: candleTimeAt(params.candle),
    side: params.side,
    price: '30000.00000000',
    quantity: '0.01500000',
    notional: `${450 + (params.index % 11)}.${String((params.index * 7919 + 1) % 1_000_000_000_000).padStart(12, '0')}`,
    fee: '0.45000000',
  };
}

function positionOf(params: {
  index: number;
  opened: number;
  closed: number;
  netProfit: string;
}): PositionInput {
  return {
    engineKey: `position-${params.index}`,
    status: POSITION_STATUS.CLOSED,
    entryPrice: '30000.00000000',
    quantity: '0.01500000',
    stopPrice: '29000.00000000',
    targetPrice: '31000.00000000',
    entryFee: '0.45000000',
    exitPrice: '30500.00000000',
    exitFee: '0.45000000',
    netProfit: params.netProfit,
    exitReason: EXIT_REASON.TARGET,
    openedCandleTime: candleTimeAt(params.opened),
    closedCandleTime: candleTimeAt(params.closed),
  };
}

export async function checkFillMarkers(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-chart-fills');
  const stranger = await resolvePersistenceOwner(handle, 'subject-chart-fills-other');
  const run = await seedRun(handle, owner);
  const { fills, positions } = buildChartFills();
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills,
      positions,
      equityPoints: [],
      commands: [],
    }),
  );
  const results = createRunResultRepository(handle);
  const whole: TimeRange = { from: candleTimeAt(0), to: candleTimeAt(POSITION_COUNT * 3 + 4) };
  const half: TimeRange = { from: candleTimeAt(300), to: candleTimeAt(700) };
  for (const range of [whole, half]) {
    const inRange = fills.filter(
      (fill) => fill.candleTime >= range.from && fill.candleTime < range.to,
    );
    const counts = await results.countFillsInRange(owner.scope, run.id, range);
    assertCondition(
      counts?.buys === inRange.filter((fill) => fill.side === 'buy').length &&
        counts.sells === inRange.filter((fill) => fill.side === 'sell').length,
      'marcadores: a contagem do SQL diverge da lista',
    );
    for (const columns of [100, 800]) {
      const found = await results.listFillClusters(owner.scope, run.id, { range, columns });
      const expected = referenceFillClusters({ fills, range, columns });
      assertCondition(
        JSON.stringify(found) === JSON.stringify(expected),
        `agrupamento (${columns} colunas): o SQL diverge do oráculo`,
      );
    }
    const markers = await results.listFillMarkers(owner.scope, run.id, {
      range,
      limit: MARKER_LIMIT,
    });
    const ordered = [...inRange].sort(
      (left, right) =>
        left.candleTime - right.candleTime || (left.orderKey < right.orderKey ? -1 : 1),
    );
    assertCondition(
      JSON.stringify(markers?.map((marker) => marker.orderKey)) ===
        JSON.stringify(ordered.slice(0, MARKER_LIMIT).map((fill) => fill.orderKey)),
      'marcadores: ordem ou corte do limite diverge',
    );
    const hasWrongProfit = markers?.some((marker) => {
      const position = positions.find((candidate) => candidate.engineKey === marker.positionKey);
      const expectedProfit = marker.side === ORDER_SIDE.SELL ? position?.netProfit : undefined;
      return marker.netProfit !== expectedProfit;
    });
    assertCondition(
      hasWrongProfit === false,
      'marcadores: o resultado só vem na venda, da posição dela',
    );
  }
  const limited = await results.listFillMarkers(owner.scope, run.id, { range: whole, limit: 7 });
  assertCondition(limited?.length === 7, 'marcadores: o limite não foi respeitado');
  const foreign = [
    await results.countFillsInRange(stranger.scope, run.id, whole),
    await results.listFillMarkers(stranger.scope, run.id, { range: whole, limit: 5 }),
    await results.listFillClusters(stranger.scope, run.id, { range: whole, columns: 100 }),
    await results.listFillsOfPositions(stranger.scope, run.id, ['position-0']),
    await results.listPositions(stranger.scope, run.id, { limit: 10, after: undefined }),
  ];
  assertCondition(
    foreign.every((answer) => answer === undefined),
    'marcadores: execução de outro dono devolveu dados',
  );
  reportCheck(
    `${fills.length} preenchimentos: contagem, agrupamento (100 e 800 colunas), marcadores com limite e dono alheio conferidos`,
  );
}

export async function checkTradeFilters(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-chart-trades');
  const run = await seedRun(handle, owner);
  const { fills, positions } = buildChartFills();
  const openPosition: PositionInput = {
    ...(positions[0] as PositionInput),
    engineKey: 'position-open',
    status: POSITION_STATUS.OPEN,
    exitPrice: undefined,
    exitFee: undefined,
    netProfit: undefined,
    exitReason: undefined,
    openedCandleTime: candleTimeAt(2_000),
    closedCandleTime: undefined,
  };
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills,
      positions: [...positions, openPosition],
      equityPoints: [],
      commands: [],
    }),
  );
  const results = createRunResultRepository(handle);
  const range: TimeRange = { from: candleTimeAt(100), to: candleTimeAt(200) };
  const expected = positions
    .filter((position) =>
      [position.openedCandleTime, position.closedCandleTime ?? -1].some(
        (time) => time >= range.from && time < range.to,
      ),
    )
    .map((position) => position.engineKey);
  const found = await results.listPositions(owner.scope, run.id, {
    limit: 1_000,
    after: undefined,
    range,
  });
  assertCondition(
    JSON.stringify(found?.items.map((item) => item.engineKey).sort()) ===
      JSON.stringify([...expected].sort()),
    'operações: a faixa [from, to) do SQL diverge da regra compra OU venda dentro',
  );
  const open = await results.listPositions(owner.scope, run.id, {
    limit: 10,
    after: undefined,
    status: POSITION_STATUS.OPEN,
  });
  assertCondition(
    open?.items.length === 1 && open.items[0]?.engineKey === 'position-open',
    'operações: status=open não separou a aberta',
  );
  const keys = ['position-0', 'position-1', 'position-2'];
  const found3 = await results.listFillsOfPositions(owner.scope, run.id, keys);
  assertCondition(
    found3?.length === 6 && found3.every((fill) => keys.includes(fill.positionKey)),
    'operações: os preenchimentos das posições dadas vêm em uma consulta, dois por posição',
  );
  reportCheck(
    `operações: faixa, status e preenchimentos da página conferidos (${expected.length} na faixa)`,
  );
}

export async function checkTradeTotals(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-chart-totals');
  const stranger = await resolvePersistenceOwner(handle, 'subject-chart-totals-other');
  const run = await seedRun(handle, owner);
  const empty = await createRunResultRepository(handle).readTradeTotals(owner.scope, run.id);
  assertCondition(
    empty?.closedTrades === 0 && empty.totalPaid === '0' && empty.openPaid === undefined,
    'resumo: execução sem operação deve somar zero',
  );
  const { fills, positions } = buildChartFills();
  const openIndex = POSITION_COUNT;
  const openPosition: PositionInput = {
    ...(positions[0] as PositionInput),
    engineKey: `position-${openIndex}`,
    status: POSITION_STATUS.OPEN,
    exitPrice: undefined,
    exitFee: undefined,
    netProfit: undefined,
    exitReason: undefined,
    closedCandleTime: undefined,
  };
  const openFill = fillOf({ index: openIndex, side: ORDER_SIDE.BUY, candle: 2_000 });
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills: [...fills, openFill],
      positions: [...positions, openPosition],
      equityPoints: [],
      commands: [],
    }),
  );
  const results = createRunResultRepository(handle);
  const found = await results.readTradeTotals(owner.scope, run.id);
  const expected = referenceTradeTotals({
    positions: [...positions, openPosition],
    fills: [...fills, openFill],
  });
  assertCondition(
    JSON.stringify(found) === JSON.stringify(expected),
    `resumo: o SQL diverge do oráculo: ${JSON.stringify(found)} contra ${JSON.stringify(expected)}`,
  );
  const foreign = await results.readTradeTotals(stranger.scope, run.id);
  assertCondition(foreign === undefined, 'resumo: execução de outro dono devolveu totais');
  reportCheck(
    `resumo: ${expected.closedTrades} fechadas e 1 aberta, pago ${expected.totalPaid} e recebido ${expected.totalReceived} iguais ao oráculo bigint; dono alheio recebe undefined`,
  );
}
