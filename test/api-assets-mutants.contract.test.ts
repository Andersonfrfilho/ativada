// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ASSETS_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
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
const POSITION = 'assets/asset-position.ts';
const REQUESTS = 'assets/asset-requests.ts';
const USE_CASES = 'assets/asset.use-cases.ts';
const ROUTES = 'assets/assets.routes.ts';
const SUMMARY = 'assets/asset-summary.use-case.ts';
const ITEM = 'assets/asset-summary-item.ts';
const PRICE = 'assets/asset-price.ts';
const RULE = 'assets/asset-rule.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'ROUTE_LIST_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'access: ROUTE_ACCESS.USER,\n    documentation: ASSET_DOCUMENTATION.list,',
      'documentation: ASSET_DOCUMENTATION.list,',
    ),
  },
  {
    name: 'ROUTE_GET_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'access: ROUTE_ACCESS.USER,\n    documentation: ASSET_DOCUMENTATION.get,',
      'documentation: ASSET_DOCUMENTATION.get,',
    ),
  },
  {
    name: 'ROUTE_REPLACE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'access: ROUTE_ACCESS.USER,\n    documentation: ASSET_DOCUMENTATION.replace,',
      'documentation: ASSET_DOCUMENTATION.replace,',
    ),
  },
  {
    name: 'ROUTE_TRADE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'access: ROUTE_ACCESS.USER,\n    documentation: ASSET_DOCUMENTATION.trade,',
      'documentation: ASSET_DOCUMENTATION.trade,',
    ),
  },
  {
    name: 'ROUTE_DELETE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'access: ROUTE_ACCESS.USER,\n    documentation: ASSET_DOCUMENTATION.delete,',
      'documentation: ASSET_DOCUMENTATION.delete,',
    ),
  },
  {
    name: 'ROUTE_SUMMARY_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'access: ROUTE_ACCESS.USER,\n    rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,',
      'rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,',
    ),
  },
  {
    name: 'ROUTE_SUMMARY_WITHOUT_ITS_RATE_LIMIT',
    edits: edit(
      ROUTES,
      '    rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,\n    documentation: ASSET_DOCUMENTATION.summary,',
      '    documentation: ASSET_DOCUMENTATION.summary,',
    ),
  },
  {
    name: 'BUY_AVERAGE_IS_NOT_WEIGHTED',
    edits: edit(
      POSITION,
      '.times(heldPrice)\n    .plus(bought.times(price))',
      '.times(price)\n    .plus(bought.times(price))',
    ),
  },
  {
    name: 'BUY_IGNORES_THE_NEW_PURCHASE_PRICE',
    edits: edit(POSITION, '.plus(bought.times(price))', '.plus(bought.times(heldPrice))'),
  },
  {
    name: 'BUY_AVERAGE_ROUNDED_DOWN',
    edits: edit(POSITION, 'EngineDecimal.ROUND_CEIL', 'EngineDecimal.ROUND_FLOOR'),
  },
  {
    name: 'BUY_AVERAGE_ROUNDED_HALF_UP',
    edits: edit(POSITION, 'EngineDecimal.ROUND_CEIL', 'EngineDecimal.ROUND_HALF_UP'),
  },
  {
    name: 'BUY_QUANTITY_NOT_SUMMED',
    edits: edit(POSITION, 'const total = held.plus(bought);', 'const total = bought;'),
  },
  {
    name: 'BUY_AVERAGE_DIVIDED_BY_THE_PURCHASE_ONLY',
    edits: edit(POSITION, '.dividedBy(total)', '.dividedBy(bought)'),
  },
  {
    name: 'SELL_NOT_BOUNDED_BY_THE_QUANTITY',
    edits: edit(POSITION, 'if (sold.greaterThan(held)) {', 'if (false) {'),
  },
  {
    name: 'SELL_BOUND_IS_INCLUSIVE',
    edits: edit(POSITION, 'sold.greaterThan(held)', 'sold.greaterThanOrEqualTo(held)'),
  },
  {
    name: 'SELL_CHANGES_THE_AVERAGE',
    edits: edit(
      POSITION,
      'return save(held.minus(sold), new EngineDecimal(current.averagePrice));',
      'return save(held.minus(sold), new EngineDecimal(params.quantity));',
    ),
  },
  {
    name: 'SELL_OF_A_MISSING_ASSET_IS_INSUFFICIENT',
    edits: edit(
      POSITION,
      'reason: ASSET_REFUSAL.NOT_FOUND',
      'reason: ASSET_REFUSAL.INSUFFICIENT_QUANTITY',
    ),
  },
  {
    name: 'SELL_ADDS_INSTEAD_OF_SUBTRACTING',
    edits: edit(POSITION, 'held.minus(sold)', 'held.plus(sold)'),
  },
  {
    name: 'REPLACE_SWAPS_THE_FIELDS',
    edits: edit(
      POSITION,
      'return save(new EngineDecimal(params.quantity), new EngineDecimal(params.averagePrice));',
      'return save(new EngineDecimal(params.averagePrice), new EngineDecimal(params.quantity));',
    ),
  },
  {
    name: 'REPLACE_BODY_ACCEPTS_UNKNOWN_FIELDS',
    edits: edit(
      REQUESTS,
      'replaceAssetSchema: z.ZodType<ReplaceAssetBody> = z.strictObject({',
      'replaceAssetSchema: z.ZodType<ReplaceAssetBody> = z.object({',
    ),
  },
  {
    name: 'SELL_BODY_ACCEPTS_A_PRICE',
    edits: edit(
      REQUESTS,
      'z.strictObject({ side: z.literal(ASSET_SIDE.SELL), quantity: positiveDecimal })',
      'z.object({ side: z.literal(ASSET_SIDE.SELL), quantity: positiveDecimal })',
    ),
  },
  {
    name: 'VALUE_ZERO_ALLOWED',
    edits: edit(
      REQUESTS,
      'value.greaterThan(0) && value.lte(MAXIMUM_VALUE)',
      'value.gte(0) && value.lte(MAXIMUM_VALUE)',
    ),
  },
  {
    name: 'VALUE_WITH_NINE_DECIMALS',
    edits: edit(REQUESTS, '(\\.\\d{1,8})?$/', '(\\.\\d{1,9})?$/'),
  },
  {
    name: 'SUMMARY_RATES_NOT_VALIDATED',
    edits: edit(
      REQUESTS,
      'parseGoalSpec({ ...RATE_PROBE, [field]: value });\n    return true;',
      'return true;',
    ),
  },
  {
    name: 'SUMMARY_QUERY_ACCEPTS_UNKNOWN_PARAMETERS',
    edits: edit(
      REQUESTS,
      'assetSummaryQuerySchema: z.ZodType<AssetSummaryQuery> = z.strictObject({',
      'assetSummaryQuerySchema: z.ZodType<AssetSummaryQuery> = z.object({',
    ),
  },
  {
    name: 'LIMIT_NOT_REFUSED',
    edits: edit(
      USE_CASES,
      'if (result.outcome === USER_ASSET_MUTATE_OUTCOME.LIMIT_REACHED)\n    throw new AssetLimitReachedError();',
      '',
    ),
  },
  {
    name: 'INSUFFICIENT_QUANTITY_REPORTED_AS_NOT_FOUND',
    edits: edit(
      USE_CASES,
      'if (result.reason === ASSET_REFUSAL.INSUFFICIENT_QUANTITY) {',
      'if (false) {',
    ),
  },
  {
    name: 'TRADE_SIDES_SWAPPED',
    edits: edit(
      USE_CASES,
      'return body.side === ASSET_SIDE.BUY',
      'return body.side === ASSET_SIDE.SELL',
    ),
  },
  {
    name: 'GET_OF_A_FOREIGN_ASSET_IS_NOT_REFUSED',
    edits: edit(USE_CASES, 'if (asset === undefined) throw new AssetNotFoundError();', ''),
  },
  {
    name: 'DELETE_OF_A_FOREIGN_ASSET_IS_A_SUCCESS',
    edits: edit(USE_CASES, 'if (!isDeleted) throw new AssetNotFoundError();', ''),
  },
  {
    name: 'LIST_NEVER_HAS_A_NEXT_PAGE',
    edits: edit(
      USE_CASES,
      'nextCursor: result.nextCursor === undefined ? null : encodeAssetCursor(result.nextCursor),',
      'nextCursor: null,',
    ),
  },
  {
    name: 'MALFORMED_SYMBOL_IS_NOT_A_NOT_FOUND',
    edits: edit(
      ROUTES,
      'if (symbol === undefined || !SYMBOL_PATTERN.test(symbol)) throw new AssetNotFoundError();',
      'if (symbol === undefined) throw new AssetNotFoundError();',
    ),
  },
  {
    name: 'REPLACE_ACCEPTS_PAIRS_THE_PLATFORM_DOES_NOT_TRACK',
    edits: edit(
      ROUTES,
      '      const symbol = readSymbol(context);\n      assertEnabled(dependencies, symbol);\n      const body = await readValidatedBody(context.request, replaceAssetSchema);',
      '      const symbol = readSymbol(context);\n      const body = await readValidatedBody(context.request, replaceAssetSchema);',
    ),
  },
  {
    name: 'BUY_ACCEPTS_PAIRS_THE_PLATFORM_DOES_NOT_TRACK',
    edits: edit(ROUTES, 'if (isBuy(body)) assertEnabled(dependencies, symbol);', ''),
  },
  {
    name: 'SELL_ALSO_REQUIRES_A_TRACKED_PAIR',
    edits: edit(
      ROUTES,
      'if (isBuy(body)) assertEnabled(dependencies, symbol);',
      'assertEnabled(dependencies, symbol);',
    ),
  },
  {
    name: 'SUMMARY_IGNORES_THE_CHOSEN_STRATEGY',
    edits: edit(SUMMARY, 'query.strategyId === undefined', 'true'),
  },
  {
    name: 'SUMMARY_DEFAULT_TARGET_IS_THE_STOP',
    edits: edit(
      SUMMARY,
      'targetRate: query.targetRate ?? DEFAULT_ASSET_TARGET_RATE,',
      'targetRate: query.targetRate ?? DEFAULT_ASSET_STOP_RATE,',
    ),
  },
  {
    name: 'SUMMARY_SHOWS_EMPTY_POSITIONS',
    edits: edit(
      SUMMARY,
      '(asset) =>\n      new EngineDecimal(asset.quantity).greaterThan(0),',
      '(asset) =>\n      Boolean(asset),',
    ),
  },
  {
    name: 'SUMMARY_STOP_FROM_THE_TARGET_RATE',
    edits: edit(SUMMARY, 'maxLossRate: rates.stopRate', 'maxLossRate: rates.targetRate'),
  },
  {
    name: 'ITEM_VALUE_ROUNDED_UP',
    edits: edit(
      ITEM,
      'return formatEngineDecimal(roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN }));',
      'return formatEngineDecimal(roundMoney({ value, direction: ROUNDING_DIRECTION.UP }));',
    ),
  },
  {
    name: 'ITEM_COST_ROUNDED_DOWN',
    edits: edit(
      ITEM,
      'return formatEngineDecimal(roundMoney({ value, direction: ROUNDING_DIRECTION.UP }));',
      'return formatEngineDecimal(roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN }));',
    ),
  },
  {
    name: 'ITEM_RESULT_RATE_ROUNDED_UP',
    edits: edit(ITEM, 'EngineDecimal.ROUND_FLOOR', 'EngineDecimal.ROUND_CEIL'),
  },
  {
    name: 'ITEM_RESULT_IS_COST_MINUS_VALUE',
    edits: edit(
      ITEM,
      'new EngineDecimal(value).minus(cost)',
      'new EngineDecimal(cost).minus(value)',
    ),
  },
  {
    name: 'ITEM_TARGET_REACHED_IS_INVERTED',
    edits: edit(ITEM, 'observed.gte(levels.target.price)', 'observed.lte(levels.target.price)'),
  },
  {
    name: 'ITEM_STOP_REACHED_IS_INVERTED',
    edits: edit(ITEM, 'observed.lte(levels.stop.price)', 'observed.gte(levels.stop.price)'),
  },
  {
    name: 'TOTALS_INCLUDE_UNPRICED_COST',
    edits: edit(
      ITEM,
      'const priced = items.filter((item) => item.value !== null);',
      'const priced = items;',
    ),
  },
  {
    name: 'PRICE_TAKES_THE_OLDEST_CANDLE',
    edits: edit(PRICE, 'return candles.at(-1);', 'return candles.at(0);'),
  },
  {
    name: 'PRICE_NEVER_FALLS_BACK_TO_THE_DAILY_CANDLE',
    edits: edit(PRICE, 'if (daily === undefined) return null;', 'return null;'),
  },
  {
    name: 'PRICE_SOURCE_MISLABELED',
    edits: edit(
      PRICE,
      'source: ASSET_PRICE_SOURCE.ONE_DAY };',
      'source: ASSET_PRICE_SOURCE.FIFTEEN_MINUTES };',
    ),
  },
  {
    name: 'RULE_BUY_SIGNAL_IS_SELL',
    edits: edit(
      RULE,
      'return action === SIGNAL_ACTION.BUY ? ASSET_RULE_ACTION.HOLD : ASSET_RULE_ACTION.WAIT;',
      'return action === SIGNAL_ACTION.BUY ? ASSET_RULE_ACTION.SELL : ASSET_RULE_ACTION.WAIT;',
    ),
  },
  {
    name: 'RULE_SELL_SIGNAL_IS_HOLD',
    edits: edit(
      RULE,
      'if (action === SIGNAL_ACTION.SELL) return ASSET_RULE_ACTION.SELL;',
      'if (action === SIGNAL_ACTION.SELL) return ASSET_RULE_ACTION.HOLD;',
    ),
  },
  {
    name: 'RULE_STATE_IS_AWAITING_ENTRY',
    edits: edit(RULE, 'state: TRIGGER_STATE.HOLDING,', 'state: TRIGGER_STATE.AWAITING_ENTRY,'),
  },
  {
    name: 'RULE_CACHE_IGNORES_THE_LAST_CANDLE',
    edits: edit(
      RULE,
      'return JSON.stringify([key.strategyVersionId, key.symbol, key.lastCandleOpenTime]);',
      'return JSON.stringify([key.strategyVersionId, key.symbol]);',
    ),
  },
];

describe('ativos na API: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(ASSETS_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(ASSETS_MUTANT_TARGET));

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
