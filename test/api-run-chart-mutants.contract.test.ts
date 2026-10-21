// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { RUN_CHART_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const TRADES_USE_CASE = 'runs/trades/run-trades.use-case.ts';
const TRADES_ROUTE = 'runs/trades/run-trades.route.ts';
const TRADES_SCHEMA = 'runs/trades/run-trades.schema.ts';
const AMOUNTS = 'runs/trades/trade-amounts.ts';
const CHART_USE_CASE = 'runs/chart/run-chart.use-case.ts';
const CHART_ROUTE = 'runs/chart/run-chart.route.ts';
const CHART_SCHEMA = 'runs/chart/run-chart.schema.ts';
const CHART_RANGE = 'runs/chart/run-chart-range.ts';
const CHART_VIEWS = 'runs/chart/chart-views.ts';
const SUMMARY_USE_CASE = 'runs/trade-summary/trade-summary.use-case.ts';
const SUMMARY_ROUTE = 'runs/trade-summary/trade-summary.route.ts';
const SUMMARY_DOCS = 'runs/trade-summary/trade-summary.docs.ts';
const SUMMARY_MESSAGE = 'runs/trade-summary/trade-summary-message.ts';
const USER_ACCESS = 'access: ROUTE_ACCESS.USER,';
const PUBLIC_ACCESS = 'access: ROUTE_ACCESS.PUBLIC,';
const FOREIGN_RUN_ERROR = "throw new Error('execução de outro dono');";

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const OWNER_AND_ACCESS: readonly SourceMutant[] = [
  {
    name: 'TRADES_OF_FOREIGN_RUN_ARE_AN_EMPTY_LIST',
    edits: edit(
      TRADES_USE_CASE,
      'if (page === undefined) throw new RunNotFoundError();',
      'if (page === undefined) return { items: [], nextCursor: null, perPage: input.limit };',
    ),
  },
  {
    name: 'TRADES_OF_FOREIGN_RUN_ANSWER_DIFFERENTLY',
    edits: edit(
      TRADES_USE_CASE,
      'if (page === undefined) throw new RunNotFoundError();',
      `if (page === undefined) ${FOREIGN_RUN_ERROR}`,
    ),
  },
  {
    name: 'CHART_OF_FOREIGN_RUN_ANSWERS_DIFFERENTLY',
    edits: edit(
      CHART_USE_CASE,
      'if (run === undefined) throw new RunNotFoundError();',
      `if (run === undefined) ${FOREIGN_RUN_ERROR}`,
    ),
  },
  {
    name: 'TRADE_SUMMARY_OF_FOREIGN_RUN_ANSWERS_DIFFERENTLY',
    edits: edit(
      SUMMARY_USE_CASE,
      'if (totals === undefined) throw new RunNotFoundError();',
      `if (totals === undefined) ${FOREIGN_RUN_ERROR}`,
    ),
  },
  {
    name: 'TRADE_SUMMARY_OF_FOREIGN_RUN_IS_AN_EMPTY_SUMMARY',
    edits: edit(
      SUMMARY_USE_CASE,
      'if (totals === undefined) throw new RunNotFoundError();',
      "const empty = { closedTrades: 0, openTrades: 0, totalPaid: '0', totalReceived: '0', totalFees: '0', openPaid: undefined };\n    if (totals === undefined) return { ...empty, net: '0', openPaid: null, message: '' };",
    ),
  },
  { name: 'TRADES_ROUTE_IS_PUBLIC', edits: edit(TRADES_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
  { name: 'CHART_ROUTE_IS_PUBLIC', edits: edit(CHART_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
  { name: 'TRADE_SUMMARY_ROUTE_IS_PUBLIC', edits: edit(SUMMARY_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
];

const VALIDATION: readonly SourceMutant[] = [
  {
    name: 'TRADES_ACCEPTS_ANY_QUERY',
    edits: edit(TRADES_SCHEMA, '.strictObject({', '.looseObject({'),
  },
  {
    name: 'CHART_ACCEPTS_ANY_QUERY',
    edits: edit(CHART_SCHEMA, '.strictObject({', '.looseObject({'),
  },
  {
    name: 'TRADE_SUMMARY_ACCEPTS_ANY_QUERY',
    edits: edit(
      SUMMARY_DOCS,
      'tradeSummaryQuerySchema = z.strictObject({})',
      'tradeSummaryQuerySchema = z.looseObject({})',
    ),
  },
  {
    name: 'CHART_COLUMNS_NOT_CAPPED',
    edits: edit(CHART_SCHEMA, '.max(CHART_COLUMNS.MAXIMUM)', ''),
  },
  {
    name: 'CHART_COLUMNS_NOT_FLOORED',
    edits: edit(CHART_SCHEMA, '.min(CHART_COLUMNS.MINIMUM)', ''),
  },
  {
    name: 'CHART_COLUMNS_DEFAULT_IS_WRONG',
    edits: edit(
      CHART_USE_CASE,
      'query.columns ?? CHART_COLUMNS.DEFAULT',
      'query.columns ?? CHART_COLUMNS.MINIMUM',
    ),
  },
];

const RANGE_AND_MARKERS: readonly SourceMutant[] = [
  {
    name: 'CHART_END_NOT_CLIPPED_TO_THE_RUN',
    edits: edit(
      CHART_RANGE,
      'const to = Math.min(requested.to ?? runRange.to, runRange.to);',
      'const to = requested.to ?? runRange.to;',
    ),
  },
  {
    name: 'CHART_START_NOT_CLIPPED_TO_THE_RUN',
    edits: edit(
      CHART_RANGE,
      'const from = Math.max(requested.from ?? runRange.from, runRange.from);',
      'const from = requested.from ?? runRange.from;',
    ),
  },
  {
    name: 'CHART_OUTSIDE_THE_RUN_NOT_REJECTED',
    edits: edit(CHART_RANGE, 'if (to <= from) {', 'if (to < from - 10 ** 15) {'),
  },
  {
    name: 'CHART_WALK_FORWARD_USES_THE_WHOLE_PERIOD',
    edits: edit(
      CHART_RANGE,
      'if (run.kind === RUN_KIND.WALK_FORWARD) return rangeOfTestWindows(windows);',
      '',
    ),
  },
  {
    name: 'CHART_LIVE_DOES_NOT_STOP_AT_THE_LAST_CANDLE',
    edits: edit(
      CHART_RANGE,
      'run.lastCandleTime + ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe],',
      'run.lastCandleTime + 100 * ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe],',
    ),
  },
  {
    name: 'CHART_MARKER_LIMIT_OFF_BY_ONE',
    edits: edit(
      CHART_USE_CASE,
      'totals.buys + totals.sells <= CHART_MARKER_LIMIT',
      'totals.buys + totals.sells < CHART_MARKER_LIMIT',
    ),
  },
  {
    name: 'CHART_CLUSTER_END_ROUNDED_DOWN',
    edits: edit(
      CHART_VIEWS,
      'Number((scaled + columnCount - 1n) / columnCount)',
      'Number(scaled / columnCount)',
    ),
  },
  {
    name: 'CHART_WITHOUT_ITS_OWN_RATE_LIMIT',
    edits: edit(CHART_ROUTE, '    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_CHART,\n', ''),
  },
  {
    name: 'TRADE_SUMMARY_WITHOUT_ITS_OWN_RATE_LIMIT',
    edits: edit(SUMMARY_ROUTE, '    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_TRADE_SUMMARY,\n', ''),
  },
  {
    name: 'CHART_RUN_RANGE_IS_THE_REQUESTED_RANGE',
    edits: edit(
      CHART_USE_CASE,
      'runRange: { from: runRange.from, to: runRange.to },',
      'runRange: { from: range.from, to: range.to },',
    ),
  },
  {
    name: 'CHART_MARKER_BUY_AMOUNT_ROUNDED_DOWN',
    edits: edit(
      CHART_VIEWS,
      '? roundMoneyUp(notional).plus(marker.fee)',
      '? roundMoneyDown(notional).plus(marker.fee)',
    ),
  },
  {
    name: 'CHART_MARKER_RATE_DIVIDES_BY_THE_WRONG_BASE',
    edits: edit(CHART_VIEWS, 'const paid = received.minus(netProfit);', 'const paid = received;'),
  },
];

const AMOUNTS_AND_MESSAGE: readonly SourceMutant[] = [
  {
    name: 'TRADES_PAID_ROUNDED_DOWN',
    edits: edit(
      AMOUNTS,
      'roundMoneyUp(new EngineDecimal(params.entryFill.notional))',
      'roundMoneyDown(new EngineDecimal(params.entryFill.notional))',
    ),
  },
  {
    name: 'TRADES_RECEIVED_ROUNDED_UP',
    edits: edit(
      AMOUNTS,
      'roundMoneyDown(new EngineDecimal(exitFill.notional))',
      'roundMoneyUp(new EngineDecimal(exitFill.notional))',
    ),
  },
  {
    name: 'TRADES_RATE_ROUNDED_TOWARD_ZERO',
    edits: edit(
      AMOUNTS,
      'return roundMoneyDown(new EngineDecimal(netProfit).dividedBy(paid));',
      'return roundMoneyUp(new EngineDecimal(netProfit).dividedBy(paid));',
    ),
  },
  {
    name: 'TRADES_FEES_IGNORE_THE_EXIT_FEE',
    edits: edit(AMOUNTS, '.plus(position.exitFee ?? 0)', ''),
  },
  {
    name: 'TRADE_SUMMARY_NET_IS_NOT_RECEIVED_MINUS_PAID',
    edits: edit(SUMMARY_USE_CASE, '.minus(totalPaid)', '.plus(totalPaid)'),
  },
  {
    name: 'TRADE_SUMMARY_MESSAGE_NET_ROUNDED_UP',
    edits: edit(
      SUMMARY_MESSAGE,
      "formatAmount(numbers.net, 'down')",
      "formatAmount(numbers.net, 'up')",
    ),
  },
  {
    name: 'TRADE_SUMMARY_MESSAGE_PAID_ROUNDED_DOWN',
    edits: edit(
      SUMMARY_MESSAGE,
      "formatAmount(numbers.totalPaid, 'up')",
      "formatAmount(numbers.totalPaid, 'down')",
    ),
  },
  {
    name: 'TRADE_SUMMARY_MESSAGE_DROPS_THE_MINUS_SIGN',
    edits: edit(
      SUMMARY_MESSAGE,
      "const sign = rounded.isNegative() && !rounded.isZero() ? MINUS_SIGN : '';",
      "const sign = '';",
    ),
  },
  {
    name: 'TRADE_SUMMARY_MESSAGE_WITHOUT_THOUSANDS_SEPARATOR',
    edits: edit(SUMMARY_MESSAGE, "integer.replace(THOUSANDS_PATTERN, '.')", 'integer'),
  },
  {
    name: 'TRADE_SUMMARY_MESSAGE_ALWAYS_PLURAL',
    edits: edit(
      SUMMARY_MESSAGE,
      "numbers.closedTrades === 1 ? '1 compra' : `${numbers.closedTrades} compras`",
      '`${numbers.closedTrades} compras`',
    ),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...OWNER_AND_ACCESS,
  ...VALIDATION,
  ...RANGE_AND_MARKERS,
  ...AMOUNTS_AND_MESSAGE,
];

describe('operações no gráfico: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(RUN_CHART_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(RUN_CHART_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
