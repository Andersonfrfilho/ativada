// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import { SPECIALIST_CATALOG } from '../packages/risk-analyst/src/index.js';
import { createSentimentPicker, advanceCandle } from '../packages/run-recording/src/index.js';
import { resolveSymbolFilters } from '../packages/market-data-crypto/src/index.js';
import {
  CLASSIC_SCOREBOARD_STRATEGY,
  computeStrategyLeadInCandles,
  createEngine,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENTRY_RISK_SCALE,
  formatEngineDecimal,
  RISK_ATR_INDICATOR_ID,
  RUN_PARAMETERS_SCHEMA_VERSION,
  SIGNAL_ACTION,
  toEngineDecimal,
  type EngineCandle,
  type EngineState,
  type EntryRiskScale,
  type RunSetup,
  type StepResult,
  type StrategyVersion,
  type StoredSentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import { isEntryAllowed } from '../test/fixtures/minimum-profit/minimum-profit-oracle.js';
import {
  closeDatabase,
  openSource,
  readFearGreed,
  readPair,
  type Timeframe,
} from './risk-analyst-baseline/market-source.js';

// T0.2 da spec 013 (plan D8): quantas compras a regra `minimum-profit-1` barraria nos ~183 dias reais do banco de dev, e o que
// isso faz com operações, taxas e resultado. SOMENTE LEITURA: velas e Fear & Greed vêm de `SELECT` pelos repositórios do repo;
// o motor de produção roda em memória e a regra é simulada pelo oráculo bigint da T0.1 + `entryRiskScale: '0'` (o motor ainda
// não tem o campo). Uso: `bun run scripts/minimum-profit-measure.ts [--pair LINKUSDT] [--counts]`.

const SYMBOLS = ['LINKUSDT', 'BNBUSDT', 'BTCUSDT', 'ETHUSDT'] as const;
const TIMEFRAMES: readonly Timeframe[] = ['15m', '1h'];
const PERIOD_DAYS = 183;
const CANDLES_PER_DAY: Readonly<Record<Timeframe, number>> = { '15m': 96, '1h': 24 };
const INITIAL_BALANCE = '10000';
const SENTIMENT_SOURCE = 'alternative.me';
// null = sem regra (como hoje); os demais, o mínimo líquido sobre o custo de ida e volta.
const MINIMUMS: readonly (string | null)[] = [null, '0', '0.003', '0.006', '0.01'];

type StrategyEntry = { readonly label: string; readonly version: StrategyVersion };
const STRATEGIES: readonly StrategyEntry[] = [
  { label: 'Placar clássico', version: CLASSIC_SCOREBOARD_STRATEGY.version },
  { label: 'Reversão', version: createStrategyVersion(SPECIALIST_CATALOG.reversion.config) },
];

type Measured = {
  readonly asked: number;
  readonly blocked: number;
  readonly operations: number;
  readonly fees: string;
  readonly net: string;
  readonly netPercent: string;
  readonly maxDrawdown: string;
};

type Series = {
  readonly candles: readonly EngineCandle[];
  readonly observations: readonly StoredSentimentObservation[];
};

function buildSetup(symbol: string, timeframe: Timeframe): RunSetup {
  return createRunSetup({
    schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
    symbol,
    timeframe,
    sentimentSource: SENTIMENT_SOURCE,
    initialBalance: INITIAL_BALANCE,
    ...resolveSymbolFilters(symbol),
  });
}

function isBlockedBuy(
  result: StepResult,
  strategy: StrategyVersion,
  setup: RunSetup,
  close: string,
  minimum: string,
): boolean {
  const { signal } = result.decisions;
  if (signal === null || signal.action !== SIGNAL_ACTION.BUY) return false;
  const atr = signal.indicators[RISK_ATR_INDICATOR_ID];
  if (atr === undefined || atr === null || atr <= 0) return false;
  const { feeRate, slippageRate } = setup.parameters;
  return !isEntryAllowed({
    atr,
    close,
    targetAtrMultiple: strategy.config.risk.targetAtrMultiple,
    feeRate,
    slippageRate,
    minimumNetTargetRate: minimum,
  });
}

function isAskedBuy(result: StepResult): boolean {
  const { signal } = result.decisions;
  if (signal === null || signal.action !== SIGNAL_ACTION.BUY) return false;
  const atr = signal.indicators[RISK_ATR_INDICATOR_ID];
  return atr !== undefined && atr !== null && atr > 0;
}

function measure(params: {
  readonly series: Series;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly firstIndex: number;
  readonly minimum: string | null;
}): Measured {
  const { series, strategy, setup, minimum } = params;
  const engine = createEngine();
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  const pickSentiment = createSentimentPicker({
    observations: series.observations,
    source: SENTIMENT_SOURCE,
  });
  let state: EngineState = engine.createInitialState({ strategy, run: setup });
  let previousOpenTime: number | null = null;
  let asked = 0;
  let blocked = 0;
  let operations = 0;
  let fees = toEngineDecimal('0');
  let peak = toEngineDecimal('0');
  let maxDrawdown = toEngineDecimal('0');
  let finalEquity = INITIAL_BALANCE;
  for (let index = params.firstIndex; index < series.candles.length; index += 1) {
    const candle = series.candles[index];
    if (candle === undefined) break;
    const step = (entryRiskScale?: EntryRiskScale): StepResult =>
      advanceCandle({
        engine,
        strategy,
        setup,
        state,
        candle,
        previousOpenTime,
        durationMilliseconds,
        pickSentiment,
        entryRiskScale,
      }).result;
    let result = step();
    if (isAskedBuy(result)) asked += 1;
    if (minimum !== null && isBlockedBuy(result, strategy, setup, candle.close, minimum)) {
      blocked += 1;
      result = step(ENTRY_RISK_SCALE.NONE);
    }
    const { decisions } = result;
    operations += decisions.closedPositions.length;
    for (const fill of decisions.fills) fees = fees.plus(fill.fee);
    const point = decisions.equityPoint;
    if (point !== null) {
      finalEquity = point.equity;
      if (toEngineDecimal(point.equity).gt(peak)) peak = toEngineDecimal(point.equity);
      const drawdown = peak.minus(point.equityAtLow).dividedBy(peak);
      if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;
    }
    state = result.state;
    previousOpenTime = candle.openTime;
  }
  const net = toEngineDecimal(finalEquity).minus(INITIAL_BALANCE);
  return {
    asked,
    blocked,
    operations,
    fees: formatEngineDecimal(fees),
    net: formatEngineDecimal(net),
    netPercent: net.dividedBy(INITIAL_BALANCE).times(100).toFixed(2),
    maxDrawdown: maxDrawdown.times(100).toFixed(2),
  };
}

async function loadSeries(symbol: string, timeframe: Timeframe): Promise<Series> {
  const handle = openSource();
  try {
    const pair = await readPair(handle, { symbol, timeframe });
    const fearGreed = await readFearGreed(handle);
    return {
      candles: pair.candles,
      observations: fearGreed.map((day) => ({
        value: day.value,
        observedAt: day.observedAt,
        source: SENTIMENT_SOURCE,
        createdAt: day.observedAt,
      })),
    };
  } finally {
    await closeDatabase(handle);
  }
}

function printRows(symbol: string, timeframe: Timeframe, series: Series): void {
  const setup = buildSetup(symbol, timeframe);
  for (const entry of STRATEGIES) {
    const periodCandles = PERIOD_DAYS * CANDLES_PER_DAY[timeframe];
    const firstIndex =
      series.candles.length -
      periodCandles -
      computeStrategyLeadInCandles(entry.version.config) +
      1;
    if (firstIndex < 0) throw new Error(`série curta demais: ${symbol} ${timeframe}`);
    for (const minimum of MINIMUMS) {
      const m = measure({ series, strategy: entry.version, setup, firstIndex, minimum });
      const label = minimum === null ? 'sem regra' : `${(Number(minimum) * 100).toFixed(1)}%`;
      process.stdout.write(
        `| ${symbol} | ${timeframe} | ${entry.label} | ${label} | ${m.asked} | ${minimum === null ? '-' : m.blocked} | ${m.operations} | ${m.fees} | ${m.net} (${m.netPercent}%) | ${m.maxDrawdown}% |\n`,
      );
    }
  }
}

async function printCounts(): Promise<void> {
  const client = new Bun.SQL(readDatabaseUrl());
  try {
    const rows: unknown = await client.unsafe('SELECT count(*)::int AS total FROM runs');
    const orders: unknown = await client.unsafe('SELECT count(*)::int AS total FROM orders');
    const total = (value: unknown): number =>
      (value as readonly { total: number }[])[0]?.total ?? 0;
    process.stdout.write(`runs=${total(rows)} orders=${total(orders)}\n`);
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--counts')) return printCounts();
  const only = process.argv.includes('--pair')
    ? process.argv[process.argv.indexOf('--pair') + 1]
    : undefined;
  process.stdout.write(
    '| Par | Vela | Estratégia | Mínimo | Compras pedidas (M) | Barradas (N) | Operações | Taxas | Líquido | Maior queda |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n',
  );
  for (const symbol of SYMBOLS.filter((known) => only === undefined || known === only)) {
    for (const timeframe of TIMEFRAMES)
      printRows(symbol, timeframe, await loadSeries(symbol, timeframe));
  }
}

await main();
