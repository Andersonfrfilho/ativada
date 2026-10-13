// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { HORIZONS_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
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
const CACHE = 'horizons/horizon-cache.ts';
const EVALUATION = 'horizons/horizon-evaluation.use-case.ts';
const STRATEGIES = 'horizons/horizon-strategies.ts';
const BEST = 'horizons/horizon-best.ts';
const ROUTES = 'horizons/horizons.routes.ts';
const REQUESTS = 'horizons/horizon-requests.ts';
const MESSAGES = 'horizons/horizon-messages.ts';
const VIEW = 'horizons/horizon-view.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'CACHE_KEY_WITHOUT_THE_SYMBOL',
    edits: edit(CACHE, '    params.symbol,\n', ''),
  },
  {
    name: 'CACHE_KEY_WITHOUT_THE_STRATEGY_VERSION',
    edits: edit(CACHE, '    params.strategyVersionId,\n', ''),
  },
  {
    name: 'CACHE_KEY_WITHOUT_THE_LAST_DAILY_CANDLE',
    edits: edit(CACHE, '    params.lastDailyOpenTime,\n', ''),
  },
  {
    name: 'CACHE_KEY_WITHOUT_THE_LAST_INTRADAY_CANDLE',
    edits: edit(CACHE, '    params.lastIntradayOpenTime,\n', ''),
  },
  {
    name: 'CACHE_NEVER_STORES',
    edits: edit(CACHE, '      entries.set(text, value);\n', ''),
  },
  {
    name: 'EVALUATION_DOES_NOT_STORE_IN_THE_CACHE',
    edits: edit(EVALUATION, '  dependencies.cache.set(key, computation.line);\n', ''),
  },
  {
    name: 'COLD_GATE_SKIPPED',
    edits: edit(EVALUATION, '    if (!isCold) return evaluate();\n', '    return evaluate();\n'),
  },
  {
    name: 'WARM_CALL_PAYS_THE_COLD_GATE',
    edits: edit(EVALUATION, '    if (!isCold) return evaluate();\n', ''),
  },
  {
    name: 'COLD_GATE_SIGNATURE_IGNORES_THE_SYMBOL',
    edits: edit(
      EVALUATION,
      'JSON.stringify([input.symbol, input.strategyId ?? null])',
      'JSON.stringify([input.strategyId ?? null])',
    ),
  },
  {
    name: 'ONE_FAILURE_DOES_NOT_CANCEL_THE_OTHERS',
    edits: edit(EVALUATION, '    failure.abort(error);\n', ''),
  },
  {
    name: 'STRATEGY_ID_IGNORED',
    edits: edit(
      STRATEGIES,
      '  if (strategyId === undefined) return loadGoalStrategies(reader, scope);\n',
      '  return loadGoalStrategies(reader, scope);\n',
    ),
  },
  {
    name: 'UNKNOWN_STRATEGY_IS_NOT_A_NOT_FOUND',
    edits: edit(
      STRATEGIES,
      '  if (strategy === undefined) throw new StrategyNotFoundError();\n',
      '',
    ),
  },
  {
    name: 'STRATEGY_WITHOUT_VERSION_IS_NOT_A_NOT_FOUND',
    edits: edit(STRATEGIES, '  if (loaded === undefined) throw new StrategyNotFoundError();\n', ''),
  },
  {
    name: 'LISTED_STRATEGIES_NOT_REPORTED_AS_TRUNCATED',
    edits: edit(STRATEGIES, '    isTruncated: false,\n', '    isTruncated: true,\n'),
  },
  {
    name: 'BEST_DAILY_IS_THE_LOWEST_MEDIAN',
    edits: edit(
      BEST,
      'return toEngineDecimal(right).comparedTo(toEngineDecimal(left));',
      'return toEngineDecimal(left).comparedTo(toEngineDecimal(right));',
    ),
  },
  {
    name: 'BEST_DAILY_IGNORES_THE_RECOMMENDATION_RULE',
    edits: edit(
      BEST,
      '    compareFlag(isEligible(left.summary), isEligible(right.summary)) ||\n',
      '',
    ),
  },
  {
    name: 'BEST_INTRADAY_IGNORES_THE_VERDICT',
    edits: edit(
      BEST,
      '    compareFlag(\n      left.summary.verdict === INTRADAY_VERDICT.WORTH,\n      right.summary.verdict === INTRADAY_VERDICT.WORTH,\n    ) ||\n',
      '',
    ),
  },
  {
    name: 'BEST_DAILY_TIE_DEPENDS_ON_THE_ARRIVAL_ORDER',
    edits: edit(
      BEST,
      '    compareDescending(left.summary.median, right.summary.median) ||\n    left.strategy.id.localeCompare(right.strategy.id)',
      '    compareDescending(left.summary.median, right.summary.median)',
    ),
  },
  {
    name: 'BEST_INTRADAY_TIE_DEPENDS_ON_THE_ARRIVAL_ORDER',
    edits: edit(
      BEST,
      '    compareDescending(left.summary.netReturn, right.summary.netReturn) ||\n    left.strategy.id.localeCompare(right.strategy.id)',
      '    compareDescending(left.summary.netReturn, right.summary.netReturn)',
    ),
  },
  {
    name: 'MISSING_NUMBER_RANKS_FIRST',
    edits: edit(
      BEST,
      'return left === null ? ORDER_LAST : ORDER_FIRST;',
      'return left === null ? ORDER_FIRST : ORDER_LAST;',
    ),
  },
  {
    name: 'ROUTE_WITHOUT_ACCESS',
    edits: edit(ROUTES, '      access: ROUTE_ACCESS.USER,\n', ''),
  },
  {
    name: 'ROUTE_WITHOUT_ITS_RATE_LIMIT',
    edits: edit(ROUTES, '      rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,\n', ''),
  },
  {
    name: 'ROUTE_WITHOUT_DOCUMENTATION',
    edits: edit(ROUTES, '      documentation: HORIZON_DOCUMENTATION.evaluation,\n', ''),
  },
  {
    name: 'MALFORMED_STRATEGY_ID_IS_NOT_A_NOT_FOUND',
    edits: edit(ROUTES, '  if (parsed === undefined) throw new StrategyNotFoundError();\n', ''),
  },
  {
    name: 'ANY_SYMBOL_ACCEPTED',
    edits: edit(
      REQUESTS,
      '.refine((symbol) => enabledSymbols.includes(symbol), { error: HORIZON_REASON.NOT_ENABLED })',
      '.refine(() => true, { error: HORIZON_REASON.NOT_ENABLED })',
    ),
  },
  {
    name: 'QUERY_ACCEPTS_UNKNOWN_FIELDS',
    edits: edit(REQUESTS, 'return z.strictObject({', 'return z.object({'),
  },
  {
    name: 'MEDIAN_ROUNDED_IN_FAVOUR_OF_THE_USER',
    edits: edit(
      MESSAGES,
      'formatPercent(summary.median, {\n    places: 1,\n    rounding: EngineDecimal.ROUND_FLOOR,',
      'formatPercent(summary.median, {\n    places: 1,\n    rounding: EngineDecimal.ROUND_CEIL,',
    ),
  },
  {
    name: 'POSITIVE_RATE_ROUNDED_IN_FAVOUR_OF_THE_USER',
    edits: edit(
      MESSAGES,
      'formatPercent(summary.positiveRate, {\n    places: 0,\n    rounding: EngineDecimal.ROUND_FLOOR,',
      'formatPercent(summary.positiveRate, {\n    places: 0,\n    rounding: EngineDecimal.ROUND_CEIL,',
    ),
  },
  {
    name: 'FEE_SHARE_ROUNDED_IN_FAVOUR_OF_THE_USER',
    edits: edit(
      MESSAGES,
      'places: 0, rounding: EngineDecimal.ROUND_CEIL, hasSign: false',
      'places: 0, rounding: EngineDecimal.ROUND_FLOOR, hasSign: false',
    ),
  },
  {
    name: 'INTRADAY_NET_ROUNDED_IN_FAVOUR_OF_THE_USER',
    edits: edit(
      MESSAGES,
      "formatPercent(summary.netReturn ?? '0', {\n    places: 1,\n    rounding: EngineDecimal.ROUND_FLOOR,",
      "formatPercent(summary.netReturn ?? '0', {\n    places: 1,\n    rounding: EngineDecimal.ROUND_CEIL,",
    ),
  },
  {
    name: 'POSITIVE_SIGN_ON_EVERY_VALUE',
    edits: edit(MESSAGES, 'params.hasSign && percent.greaterThan(0)', 'params.hasSign'),
  },
  {
    name: 'DOT_AS_DECIMAL_SEPARATOR',
    edits: edit(MESSAGES, "const DECIMAL_SEPARATOR = ',';", "const DECIMAL_SEPARATOR = '.';"),
  },
  {
    name: 'RECOMMENDED_STAMP_NEVER_WRITTEN',
    edits: edit(MESSAGES, 'params.isRecommended ? MESSAGE.RECOMMENDED : undefined', 'undefined'),
  },
  {
    name: 'SHORT_HISTORY_NEVER_WARNED',
    edits: edit(
      MESSAGES,
      'summary.isShortHistory ? MESSAGE.SHORT_HISTORY : undefined',
      'undefined',
    ),
  },
  {
    name: 'FEES_REASON_IGNORED',
    edits: edit(
      MESSAGES,
      "  if (summary.feeShareOfGross !== null) return 'as taxas comem o ganho';\n",
      '',
    ),
  },
  {
    name: 'SINGULAR_OPERATION_IGNORED',
    edits: edit(MESSAGES, 'summary.tradeCount === 1 ?', 'summary.tradeCount === -1 ?'),
  },
  {
    name: 'EVERY_DAILY_ROW_STAMPED',
    edits: edit(
      VIEW,
      'const isRecommended = summary.horizonDays === recommendedHorizonDays;',
      'const isRecommended = recommendedHorizonDays !== undefined;',
    ),
  },
  {
    name: 'NO_RECOMMENDATION_SHOWN_AS_ZERO',
    edits: edit(
      VIEW,
      'recommendedHorizonDays: recommendedHorizonDays ?? null,',
      'recommendedHorizonDays: recommendedHorizonDays ?? 0,',
    ),
  },
];

describe('prazos na API: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(HORIZONS_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(HORIZONS_MUTANT_TARGET));

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
