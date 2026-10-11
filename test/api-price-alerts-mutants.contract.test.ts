// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { PRICE_ALERTS_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
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
const ROUTES = 'price-alerts/price-alerts.routes.ts';
const REQUESTS = 'price-alerts/price-alert-requests.ts';
const USE_CASES = 'price-alerts/price-alert.use-cases.ts';
const VIEWS = 'price-alerts/price-alert-views.ts';
const EVALUATOR = 'price-alerts/price-alert-evaluator.ts';
const EVENT_DISPATCHER = 'price-alerts/price-alert-event-dispatcher.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'ROUTE_LIST_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'path: PRICE_ALERTS_PATH,\n    access: ROUTE_ACCESS.USER,\n    documentation: PRICE_ALERT_DOCUMENTATION.list,',
      'path: PRICE_ALERTS_PATH,\n    documentation: PRICE_ALERT_DOCUMENTATION.list,',
    ),
  },
  {
    name: 'ROUTE_CREATE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'path: PRICE_ALERTS_PATH,\n    access: ROUTE_ACCESS.USER,\n    documentation: PRICE_ALERT_DOCUMENTATION.create,',
      'path: PRICE_ALERTS_PATH,\n    documentation: PRICE_ALERT_DOCUMENTATION.create,',
    ),
  },
  {
    name: 'ROUTE_GET_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'path: PRICE_ALERT_PATH,\n    access: ROUTE_ACCESS.USER,\n    documentation: PRICE_ALERT_DOCUMENTATION.get,',
      'path: PRICE_ALERT_PATH,\n    documentation: PRICE_ALERT_DOCUMENTATION.get,',
    ),
  },
  {
    name: 'ROUTE_UPDATE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'path: PRICE_ALERT_PATH,\n    access: ROUTE_ACCESS.USER,\n    documentation: PRICE_ALERT_DOCUMENTATION.update,',
      'path: PRICE_ALERT_PATH,\n    documentation: PRICE_ALERT_DOCUMENTATION.update,',
    ),
  },
  {
    name: 'ROUTE_DELETE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'path: PRICE_ALERT_PATH,\n    access: ROUTE_ACCESS.USER,\n    documentation: PRICE_ALERT_DOCUMENTATION.delete,',
      'path: PRICE_ALERT_PATH,\n    documentation: PRICE_ALERT_DOCUMENTATION.delete,',
    ),
  },
  {
    name: 'MALFORMED_ID_IS_NOT_A_NOT_FOUND',
    edits: edit(ROUTES, 'if (alertId === undefined) throw new PriceAlertNotFoundError();', ''),
  },
  {
    name: 'CREATE_ACCEPTS_UNKNOWN_FIELDS',
    edits: edit(
      REQUESTS,
      'return z.strictObject({\n    symbol: enabledSymbol',
      'return z.object({\n    symbol: enabledSymbol',
    ),
  },
  {
    name: 'PATCH_ACCEPTS_UNKNOWN_FIELDS',
    edits: edit(
      REQUESTS,
      '  .strictObject({\n    direction: z.enum(DIRECTIONS).optional(),',
      '  .object({\n    direction: z.enum(DIRECTIONS).optional(),',
    ),
  },
  {
    name: 'SYMBOL_NOT_CHECKED_AGAINST_THE_ENABLED_PAIRS',
    edits: edit(
      REQUESTS,
      '.refine((symbol) => enabledSymbols.includes(symbol),',
      '.refine((symbol) => symbol.length > 0,',
    ),
  },
  {
    name: 'DIRECTION_IS_ANY_TEXT',
    edits: edit(
      REQUESTS,
      '    direction: z.enum(DIRECTIONS),\n    value: valueSchema,',
      '    direction: z.string(),\n    value: valueSchema,',
    ),
  },
  {
    name: 'VALUE_NOT_CANONICAL',
    edits: edit(
      REQUESTS,
      '\n  .transform((text) => formatEngineDecimal(new EngineDecimal(text)));',
      ';',
    ),
  },
  {
    name: 'VALUE_ZERO_ALLOWED',
    edits: edit(REQUESTS, 'value.greaterThan(0) &&', 'value.gte(0) &&'),
  },
  {
    name: 'VALUE_WITHOUT_A_CEILING',
    edits: edit(
      REQUESTS,
      'value.greaterThan(0) && value.lte(MAXIMUM_VALUE)',
      'value.greaterThan(0)',
    ),
  },
  {
    name: 'VALUE_WITH_NINE_DECIMALS',
    edits: edit(REQUESTS, '(\\.\\d{1,8})?$/', '(\\.\\d{1,9})?$/'),
  },
  {
    name: 'ORIGIN_DEFAULTS_TO_PLAN',
    edits: edit(
      REQUESTS,
      '.default(PRICE_ALERT_ORIGIN.MANUAL)',
      '.default(PRICE_ALERT_ORIGIN.PLAN)',
    ),
  },
  {
    name: 'PATCH_ACCEPTS_AN_EMPTY_BODY',
    edits: edit(
      REQUESTS,
      'if (Object.values(body).every((field) => field === undefined)) {',
      'if (false) {',
    ),
  },
  {
    name: 'PATCH_OVERWRITES_WITH_UNDEFINED',
    edits: edit(
      USE_CASES,
      '...(patch.isEnabled === undefined ? {} : { isEnabled: patch.isEnabled }),',
      'isEnabled: patch.isEnabled,',
    ),
  },
  {
    name: 'CREATE_LIMIT_NOT_REFUSED',
    edits: edit(
      USE_CASES,
      'if (created.outcome === PRICE_ALERT_CREATE_OUTCOME.LIMIT_REACHED) {\n      throw new PriceAlertLimitReachedError();\n    }',
      '',
    ),
  },
  {
    name: 'REARM_LIMIT_NOT_REFUSED',
    edits: edit(
      USE_CASES,
      'if (result.outcome === PRICE_ALERT_UPDATE_OUTCOME.LIMIT_REACHED) {\n      throw new PriceAlertLimitReachedError();\n    }',
      '',
    ),
  },
  {
    name: 'UPDATE_OF_A_FOREIGN_ALERT_IS_NOT_REFUSED',
    edits: edit(
      USE_CASES,
      'if (result.outcome === PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND)\n      throw new PriceAlertNotFoundError();',
      '',
    ),
  },
  {
    name: 'GET_OF_A_FOREIGN_ALERT_IS_NOT_REFUSED',
    edits: edit(USE_CASES, 'if (alert === undefined) throw new PriceAlertNotFoundError();', ''),
  },
  {
    name: 'DELETE_OF_A_FOREIGN_ALERT_IS_A_SUCCESS',
    edits: edit(USE_CASES, 'if (!isDeleted) throw new PriceAlertNotFoundError();', ''),
  },
  {
    name: 'LIST_NEVER_HAS_A_NEXT_PAGE',
    edits: edit(
      USE_CASES,
      'nextCursor:\n        result.nextCursor === undefined ? null : encodePriceAlertCursor(result.nextCursor),',
      'nextCursor: null,',
    ),
  },
  {
    name: 'VIEW_HIDES_THE_TRIGGER_AS_UNDEFINED',
    edits: edit(
      VIEWS,
      'record.triggeredAt?.toISOString() ?? null',
      'record.triggeredAt?.toISOString()',
    ),
  },
  {
    name: 'VIEW_LEAKS_THE_ORIGIN_AS_MANUAL',
    edits: edit(VIEWS, 'origin: record.origin,', "origin: 'manual',"),
  },
  {
    name: 'EVALUATOR_IGNORES_STALE_TICKS',
    edits: edit(
      EVALUATOR,
      'if (params.now() - tick.eventTime > params.staleAfterMilliseconds) return;',
      '',
    ),
  },
  {
    name: 'EVALUATOR_STALE_BOUNDARY_INCLUSIVE',
    edits: edit(
      EVALUATOR,
      'tick.eventTime > params.staleAfterMilliseconds',
      'tick.eventTime >= params.staleAfterMilliseconds',
    ),
  },
  {
    name: 'EVALUATOR_SENDS_THE_WRONG_PRICE',
    edits: edit(EVALUATOR, 'price: tick.price,', "price: tick.change24h ?? '0',"),
  },
  {
    name: 'EVALUATOR_SENDS_THE_WRONG_SYMBOL',
    edits: edit(EVALUATOR, 'symbol: tick.symbol,', "symbol: 'BTCUSDT',"),
  },
  {
    name: 'EVALUATOR_DROPS_THE_EVENT_TIME',
    edits: edit(EVALUATOR, 'eventTime: tick.eventTime,', 'eventTime: params.now(),'),
  },
  {
    name: 'EVALUATOR_SWALLOWS_DATABASE_FAILURES',
    edits: edit(
      EVALUATOR,
      'await params.repository.fireDueAlerts({',
      'await params.repository.fireDueAlerts({',
    ).concat([
      {
        file: EVALUATOR,
        find: '      });\n    },\n  };',
        replace: '      }).catch(() => undefined);\n    },\n  };',
        occurrences: 1,
      },
    ]),
  },
  {
    name: 'EVENT_GOES_TO_EVERY_USER',
    edits: edit(EVENT_DISPATCHER, 'params.hub.sendToUser(ownerUserId, {', 'params.hub.broadcast({'),
  },
  {
    name: 'EVENT_HAS_THE_RUN_EVENT_TYPE',
    edits: edit(
      EVENT_DISPATCHER,
      'type: SERVER_MESSAGE_TYPE.PRICE_ALERT,',
      'type: SERVER_MESSAGE_TYPE.EVENT,',
    ),
  },
  {
    name: 'EVENT_LEAKS_THE_OWNER',
    edits: edit(
      EVENT_DISPATCHER,
      'alertId: event.alertId,',
      'alertId: event.alertId,\n          ownerUserId,',
    ),
  },
  {
    name: 'EVENT_ERROR_NOT_REPORTED',
    edits: edit(EVENT_DISPATCHER, 'params.reportError(error);', ''),
  },
];

describe('alertas de preço na API: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(PRICE_ALERTS_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(PRICE_ALERTS_MUTANT_TARGET));

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
