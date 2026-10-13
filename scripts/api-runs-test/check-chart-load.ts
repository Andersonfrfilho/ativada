// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunBatchRepository,
  createRunRepository,
  RUN_STATUS,
  type FillInput,
  type PositionInput,
} from '../../packages/database/src/index.js';
import {
  resolvePersistenceOwner,
  seedRun,
} from '../../packages/database/test-support/persistence-seed.js';
import { ENGINE_TIMEFRAME, type EngineCandle } from '../../packages/strategy-engine/src/index.js';
import {
  assertCondition,
  reportLine,
  seedCandles,
  type ApiRunsContext,
} from './api-runs-test-context.js';
import { dataOf } from './api-runs-helpers.js';

const SUBJECT_LOAD = 'subject-api-runs-chart-load';
const SYMBOL_LOAD = 'BNBUSDT';
const FIFTEEN_MINUTES = 900_000;
const CANDLES = 17_520;
const POSITIONS = 1_000;
const ONE_DAY_CANDLES = 96;
const FIRST_OPEN_TIME = Date.UTC(2025, 3, 1);
const CENTS = 100;
const SAMPLE_PAUSE_MILLISECONDS = 550;
const P95_BUDGET_MILLISECONDS = 300;
const SIZE_REFERENCE_BYTES = 150 * 1024;
const MARKER_LIMIT = 500;

type Cents = { open: number; high: number; low: number; close: number };

// Passeio aleatório determinístico em centavos: cada vela abre onde a anterior fechou.
function buildCandles(): readonly EngineCandle[] {
  let state = 20_261_013;
  const next = (modulo: number): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % modulo;
  };
  let previousClose = 60_000;
  return Array.from({ length: CANDLES }, (_unused, index) => {
    const open = previousClose;
    const close = Math.max(1_000, open + next(401) - 200);
    const cents: Cents = {
      open,
      close,
      high: Math.max(open, close) + next(150),
      low: Math.max(100, Math.min(open, close) - next(150)),
    };
    previousClose = close;
    const openTime = FIRST_OPEN_TIME + index * FIFTEEN_MINUTES;
    const text = (value: number): string => (value / CENTS).toFixed(8);
    return {
      symbol: SYMBOL_LOAD,
      timeframe: ENGINE_TIMEFRAME.FIFTEEN_MINUTES,
      openTime,
      closeTime: openTime + FIFTEEN_MINUTES - 1,
      open: text(cents.open),
      high: text(cents.high),
      low: text(cents.low),
      close: text(cents.close),
      volume: '10.00000000',
    };
  });
}

type SeededTrades = {
  readonly fills: readonly FillInput[];
  readonly positions: readonly PositionInput[];
};

// 1.000 operações fechadas (2.000 preenchimentos) espalhadas pelo período, com a conta do caixa em centavos.
function buildTrades(): SeededTrades {
  const fills: FillInput[] = [];
  const positions: PositionInput[] = [];
  const spacing = Math.floor(CANDLES / POSITIONS);
  for (let index = 0; index < POSITIONS; index += 1) {
    const opened = FIRST_OPEN_TIME + index * spacing * FIFTEEN_MINUTES;
    const closed = opened + (1 + (index % 6)) * FIFTEEN_MINUTES;
    const key = `trade-${index}`;
    const entry = 600 + (index % 40);
    const exit = entry + (index % 7) - 2;
    const common = { positionKey: key, quantity: '1.5', fee: '0.9' } as const;
    fills.push(
      {
        ...common,
        orderKey: `buy-${index}`,
        candleTime: opened,
        side: 'buy',
        price: `${entry}`,
        notional: `${entry * 1.5}`,
      },
      {
        ...common,
        orderKey: `sell-${index}`,
        candleTime: closed,
        side: 'sell',
        price: `${exit}`,
        notional: `${exit * 1.5}`,
      },
    );
    positions.push({
      engineKey: key,
      status: 'closed',
      entryPrice: `${entry}`,
      quantity: '1.5',
      stopPrice: `${entry - 20}`,
      targetPrice: `${entry + 20}`,
      entryFee: '0.9',
      exitPrice: `${exit}`,
      exitFee: '0.9',
      netProfit: (((exit - entry) * 150 - 180) / CENTS).toFixed(2),
      exitReason: 'target',
      openedCandleTime: opened,
      closedCandleTime: closed,
    });
  }
  return { fills, positions };
}

type Measurement = {
  readonly p50: number;
  readonly p95: number;
  readonly maximum: number;
  readonly bytes: number;
};

function percentile(sorted: readonly number[], rate: number): number {
  return sorted[Math.max(0, Math.ceil(rate * sorted.length) - 1)] ?? 0;
}

// Sequencial e espaçado: o limite geral de 120/min por usuário repõe 2 por segundo e a amostra não pode esgotá-lo.
async function measure(
  context: ApiRunsContext,
  params: { readonly path: string; readonly samples: number },
): Promise<Measurement> {
  const durations: number[] = [];
  let bytes = 0;
  for (let index = 0; index < params.samples; index += 1) {
    const started = performance.now();
    const response = await context.call({ subject: SUBJECT_LOAD, path: params.path });
    durations.push(performance.now() - started);
    assertCondition(response.status === 200, `${params.path}: status ${response.status}`);
    bytes = new TextEncoder().encode(response.text).byteLength;
    await Bun.sleep(SAMPLE_PAUSE_MILLISECONDS);
  }
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1) ?? 0,
    bytes,
  };
}

function describe(name: string, result: Measurement): string {
  const kilobytes = (result.bytes / 1024).toFixed(1);
  const marker = result.bytes <= SIZE_REFERENCE_BYTES ? 'dentro' : 'ACIMA';
  return `${name}: p50 ${result.p50.toFixed(1)} ms, p95 ${result.p95.toFixed(1)} ms, máx ${result.maximum.toFixed(1)} ms, ${kilobytes} KB (${marker} de 150 KB)`;
}

async function seedLoadRun(context: ApiRunsContext): Promise<{
  readonly runId: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly trades: SeededTrades;
}> {
  const owner = await resolvePersistenceOwner(context.handle, SUBJECT_LOAD);
  await seedCandles(context, buildCandles());
  const periodStart = FIRST_OPEN_TIME;
  const periodEnd = FIRST_OPEN_TIME + CANDLES * FIFTEEN_MINUTES;
  const run = await seedRun(context.handle, owner, {
    symbol: SYMBOL_LOAD,
    timeframe: ENGINE_TIMEFRAME.FIFTEEN_MINUTES,
    periodStart,
    periodEnd,
  });
  const trades = buildTrades();
  await createRunBatchRepository(context.handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills: trades.fills,
      positions: trades.positions,
      equityPoints: [],
      commands: [],
    }),
  );
  const runs = createRunRepository(context.handle);
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.COMPLETED });
  return { runId: run.id, periodStart, periodEnd, trades };
}

type ChartBody = {
  readonly columns: readonly unknown[];
  readonly markers: readonly unknown[] | null;
  readonly clusters: readonly unknown[] | null;
  readonly totals: { readonly buys: number; readonly sells: number };
};

// Carga do gráfico (spec 005, T1.5, plan D9): 17.520 velas de 15 min e 1.000 operações num backtest concluído, pela API real
// com Postgres real. p95 do `/chart` e das outras duas rotas, e o tamanho do corpo; o alvo é <= 300 ms (tamanho é só medido).
export async function checkChartLoad(context: ApiRunsContext): Promise<void> {
  const seeded = await seedLoadRun(context);
  const base = `/v1/runs/${seeded.runId}`;
  const sorted = seeded.trades.fills.map((fill) => fill.candleTime).sort((a, b) => a - b);
  const markerEnd = sorted[MARKER_LIMIT - 1] ?? seeded.periodEnd;
  const oneDayEnd = seeded.periodStart + ONE_DAY_CANDLES * FIFTEEN_MINUTES;
  const cases = [
    { name: 'chart 800 colunas, período inteiro (aceite)', path: `${base}/chart`, samples: 40 },
    {
      name: 'chart 2000 colunas, período inteiro',
      path: `${base}/chart?columns=2000`,
      samples: 30,
    },
    {
      name: 'chart 2000 colunas com 499 marcadores (maior corpo)',
      path: `${base}/chart?columns=2000&from=${seeded.periodStart}&to=${markerEnd}`,
      samples: 30,
    },
    {
      name: 'chart 1 dia, 800 colunas',
      path: `${base}/chart?from=${seeded.periodStart}&to=${oneDayEnd}`,
      samples: 30,
    },
    {
      name: 'trades 100 da faixa (from/to)',
      path: `${base}/trades?limit=100&from=${seeded.periodStart}&to=${markerEnd}`,
      samples: 30,
    },
    { name: 'trade-summary', path: `${base}/trade-summary`, samples: 30 },
  ];
  const whole = dataOf<ChartBody>(
    await context.call({ subject: SUBJECT_LOAD, path: `${base}/chart` }),
    200,
  );
  assertCondition(
    whole.totals.buys === POSITIONS && whole.totals.sells === POSITIONS,
    'carga: totals do período inteiro não bate com as 1.000 operações',
  );
  assertCondition(
    whole.markers === null && whole.clusters !== null && whole.columns.length <= 800,
    'carga: 2.000 preenchimentos devem virar agrupamentos e no máximo 800 colunas',
  );
  const summary = dataOf<{ closedTrades: number }>(
    await context.call({ subject: SUBJECT_LOAD, path: `${base}/trade-summary` }),
    200,
  );
  assertCondition(
    summary.closedTrades === POSITIONS,
    'carga: o resumo não conta as 1.000 operações',
  );
  for (const item of cases) {
    const result = await measure(context, item);
    reportLine(`carga ${describe(item.name, result)}`);
    assertCondition(
      result.p95 <= P95_BUDGET_MILLISECONDS,
      `carga ${item.name}: p95 ${result.p95.toFixed(1)} ms passou de ${P95_BUDGET_MILLISECONDS} ms`,
    );
  }
}
