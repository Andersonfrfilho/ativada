// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { API_ROUTES_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
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

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'RUN_CURSOR_INSTANT_NOT_VALIDATED',
    edits: edit('runs/run-cursor.ts', 'c: cursorInstantSchema', 'c: z.string().min(1)'),
  },
  {
    name: 'STRATEGY_CURSOR_INSTANT_NOT_VALIDATED',
    edits: edit('strategies/strategy-cursor.ts', 'c: cursorInstantSchema', 'c: z.string().min(1)'),
  },
  {
    name: 'CURSOR_INSTANT_CALENDAR_NOT_CHECKED',
    edits: edit(
      'shared/pagination/cursor-instant.ts',
      'return isCalendarDate && isClockTime && isOffset;',
      'return isClockTime && isOffset;',
    ),
  },
  {
    name: 'CURSOR_INSTANT_OFFSET_NOT_CHECKED',
    edits: edit(
      'shared/pagination/cursor-instant.ts',
      'return isCalendarDate && isClockTime && isOffset;',
      'return isCalendarDate && isClockTime;',
    ),
  },
  {
    name: 'ROUTE_WITHOUT_ACCESS',
    edits: edit(
      'strategies/strategies.routes.ts',
      '    path: STRATEGIES_PATH,\n    access: ROUTE_ACCESS.USER,\n    documentation: STRATEGY_DOCUMENTATION.list,',
      '    path: STRATEGIES_PATH,\n    documentation: STRATEGY_DOCUMENTATION.list,',
    ),
  },
  {
    name: 'EXPORT_ROUTE_IS_PUBLIC',
    edits: edit(
      'runs/run-export.routes.ts',
      'path: RUN_EXPORT_PATH,\n      access: ROUTE_ACCESS.USER,',
      'path: RUN_EXPORT_PATH,\n      access: ROUTE_ACCESS.PUBLIC,',
    ),
  },
  {
    name: 'LOG_ROUTE_IS_PUBLIC',
    edits: edit(
      'runs/run-export.routes.ts',
      'path: RUN_LOG_EXPORT_PATH,\n      access: ROUTE_ACCESS.USER,',
      'path: RUN_LOG_EXPORT_PATH,\n      access: ROUTE_ACCESS.PUBLIC,',
    ),
  },
  {
    name: 'MALFORMED_RUN_ID_ANSWERS_DIFFERENTLY',
    edits: edit(
      'runs/run-id.ts',
      'if (runId === undefined) throw new RunNotFoundError();',
      "if (runId === undefined) throw new Error('id malformado');",
    ),
  },
  {
    name: 'STOP_ANSWERS_FOREIGN_RUN_DIFFERENTLY',
    edits: edit(
      'runs/run.use-cases.ts',
      'if (result.outcome === RUN_TRANSITION_OUTCOME.NOT_FOUND) throw new RunNotFoundError();',
      'if (result.outcome === RUN_TRANSITION_OUTCOME.NOT_FOUND) throw new RunAlreadyFinishedError();',
    ),
  },
  {
    name: 'SERIES_OF_FOREIGN_RUN_IS_AN_EMPTY_LIST',
    edits: edit(
      'runs/run-series.use-cases.ts',
      'if (page === undefined) throw new RunNotFoundError();',
      'if (page === undefined) return { items: [], nextCursor: null, perPage: input.limit };',
    ),
  },
  {
    name: 'STRATEGY_OF_FOREIGN_OWNER_ANSWERS_DIFFERENTLY',
    edits: edit(
      'strategies/strategy.use-cases.ts',
      'if (strategy === undefined) throw new StrategyNotFoundError();',
      "if (strategy === undefined) throw new Error('estratégia de outro dono');",
    ),
  },
  {
    name: 'USER_ID_ACCEPTED_IN_THE_RUN_BODY',
    edits: edit(
      'runs/create-run-request.schema.ts',
      '.strictObject({\n      strategyVersionId: resourceIdSchema,',
      '.object({\n      strategyVersionId: resourceIdSchema,',
    ),
  },
  {
    name: 'USER_ID_ACCEPTED_IN_THE_STRATEGY_BODY',
    edits: edit(
      'strategies/strategy-requests.ts',
      'export const createStrategySchema = z.strictObject({',
      'export const createStrategySchema = z.object({',
    ),
  },
  {
    name: 'CSV_WITHOUT_FORMULA_PROTECTION',
    edits: edit(
      'runs/csv-format.ts',
      'FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))',
      'false',
    ),
  },
  {
    name: 'CSV_PROTECTS_ONLY_THE_EQUALS_SIGN',
    edits: edit(
      'runs/csv-format.ts',
      "const FORMULA_PREFIXES: readonly string[] = ['=', '+', '-', '@', '\\t', '\\r'];",
      "const FORMULA_PREFIXES: readonly string[] = ['='];",
    ),
  },
  {
    name: 'CSV_PREFIXES_NEGATIVE_DECIMALS',
    edits: edit(
      'runs/csv-format.ts',
      'kind === CSV_CELL_KIND.DECIMAL && DECIMAL_TEXT_PATTERN.test(text)',
      'false',
    ),
  },
  {
    name: 'CSV_IGNORES_THE_ROW_CEILING',
    edits: edit(
      'runs/csv-stream.ts',
      "if (rows > limits.maxRows) throw new CsvLimitExceededError('rows');",
      '',
    ),
  },
  {
    name: 'CSV_IGNORES_THE_TIME_CEILING',
    edits: edit('runs/csv-stream.ts', "throw new CsvLimitExceededError('duration');", 'void 0;'),
  },
  {
    name: 'LOG_TIMES_NOT_ISO',
    edits: edit(
      'runs/csv-tables.ts',
      'new Date(milliseconds).toISOString()',
      'String(milliseconds)',
    ),
  },
  {
    name: 'LOG_REASON_WRITTEN_AS_RAW_JSON',
    edits: edit(
      'runs/csv-tables.ts',
      "textColumn('reason', (row) => row.reason),\n];",
      "jsonColumn('reason', (row) => row.reason),\n];",
    ),
  },
  {
    name: 'LOG_TARGET_DISTANCE_THROUGH_A_FLOAT',
    edits: edit(
      'runs/csv-tables.ts',
      "decimalColumn('target_distance', (row) => row.targetDistance)",
      "numberColumn('target_distance', (row) => (row.targetDistance === undefined ? undefined : Number(row.targetDistance)))",
    ),
  },
  {
    name: 'LOG_COLUMN_DROPPED',
    edits: edit('runs/csv-tables.ts', "  textColumn('purpose', (row) => row.purpose),\n", ''),
  },
  {
    name: 'LOG_READS_ONLY_THE_SIGNALS',
    edits: edit(
      'runs/csv-source.ts',
      'openTable(LOG_COLUMNS, results.listLog)',
      'openTable(LOG_COLUMNS, results.listSignals as never)',
    ),
  },
  {
    name: 'LOG_ROUTE_EXPORTS_THE_DEFAULT_TABLE',
    edits: edit(
      'runs/run-export.routes.ts',
      'exportRunCsv(context.scope, runId, LOG_CSV_TABLE)',
      'exportRunCsv(context.scope, runId, DEFAULT_CSV_TABLE)',
    ),
  },
  {
    name: 'LOG_ROUTE_ACCEPTS_ANY_QUERY',
    edits: edit(
      'runs/run-export.routes.ts',
      '        readValidatedQuery(context.request, logQuerySchema);\n',
      '',
    ),
  },
  {
    name: 'LOG_ROUTE_WITHOUT_RATE_LIMIT',
    edits: edit(
      'runs/run-export.routes.ts',
      '      path: RUN_LOG_EXPORT_PATH,\n      access: ROUTE_ACCESS.USER,\n      rateLimitPolicy: RATE_LIMIT_POLICY.RUN_EXPORT,\n',
      '      path: RUN_LOG_EXPORT_PATH,\n      access: ROUTE_ACCESS.USER,\n',
    ),
  },
  {
    name: 'CURSOR_WITHOUT_CEILING',
    edits: edit(
      'shared/pagination/page-query.schema.ts',
      '.pipe(z.number().int().min(1).max(MAX_PAGE_SIZE))',
      '.pipe(z.number().int().min(1))',
    ),
  },
  {
    name: 'PAGE_SIZE_IGNORES_THE_CLIENT_LIMIT',
    edits: edit(
      'shared/pagination/read-page.ts',
      'limit: query.limit ?? DEFAULT_PAGE_SIZE,',
      'limit: 100_000,',
    ),
  },
  {
    name: 'OPENAPI_GENERATES_WITH_UNDOCUMENTED_ROUTES',
    edits: edit(
      'openapi/build-openapi-document.ts',
      'if (undocumented.length > 0) throw new UndocumentedRouteError(undocumented.map(describeRoute));',
      '',
    ),
  },
  {
    name: 'OPENAPI_DROPS_THE_ADMIN_ROUTES',
    edits: edit(
      'openapi/build-openapi-document.ts',
      'const path = toOpenApiPath(route.path);',
      "if (route.access === 'admin') continue;\n    const path = toOpenApiPath(route.path);",
    ),
  },
  {
    name: 'DOCS_ENABLED_IN_PRODUCTION',
    edits: edit(
      'routes/create-api-routes.ts',
      'if (dependencies.isDocumentationEnabled)',
      'if (true)',
    ),
  },
  {
    name: 'DOCS_CSP_ALLOWS_UNSAFE_INLINE',
    edits: edit(
      'docs/scalar-page.ts',
      "`style-src 'nonce-${nonce}'`,",
      '"style-src \'unsafe-inline\'",',
    ),
  },
  {
    name: 'DOCS_CSP_REPLACES_THE_CSP_OF_EVERY_ROUTE',
    edits: edit(
      'http/decorate-response.ts',
      'if (name === CONTENT_SECURITY_POLICY_HEADER && headers.has(name)) continue;',
      'if (name === CONTENT_SECURITY_POLICY_HEADER) continue;',
    ),
  },
  {
    name: 'IDENTICAL_CONFIGURATION_CREATES_A_DUPLICATE_VERSION',
    edits: edit(
      'strategies/strategy.use-cases.ts',
      '      strategyId: input.strategyId,\n      config: toConfigJson(input.version),\n      configHash: input.version.configHash,',
      "      strategyId: input.strategyId,\n      config: toConfigJson(input.version),\n      configHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),",
    ),
  },
  {
    name: 'DISPATCH_FAILURE_NOT_MARKED_FAILED',
    edits: edit(
      'runs/create-run.use-case.ts',
      '      to: RUN_STATUS.FAILED,',
      '      to: RUN_STATUS.CANCELLED,',
    ),
  },
  {
    name: 'DISPATCHER_WAITS_FOR_THE_RUN_TO_FINISH',
    edits: [
      ...edit(
        'runs/queue/run-queue-dispatcher.ts',
        'dispatch(request: RunDispatchRequest): Promise<void> {',
        'async dispatch(request: RunDispatchRequest): Promise<void> {',
      ),
      ...edit(
        'runs/queue/run-queue-dispatcher.ts',
        'if (!this.isStopping) void this.pump();\n    return Promise.resolve();',
        'if (!this.isStopping) await this.pump();\n    return Promise.resolve();',
      ),
      ...edit(
        'runs/queue/run-queue-dispatcher.ts',
        '      this.launch(claimed);\n',
        '      this.launch(claimed);\n      await this.active.get(claimed.runId);\n',
      ),
    ],
  },
  {
    name: 'DISPATCHER_SENDS_WALK_FORWARD_TO_THE_BACKTEST_RUNNER',
    edits: edit(
      'runs/queue/create-application-dispatcher.ts',
      '[RUN_KIND.WALK_FORWARD]: (runId) => runners.walkForwardRunner.run(runId),',
      '[RUN_KIND.WALK_FORWARD]: (runId) => runners.backtestRunner.run(runId),',
    ),
  },
  {
    name: 'WALK_FORWARD_NOT_VALIDATED_BEFORE_ACCEPTING',
    edits: edit(
      'runs/create-run.use-case.ts',
      'assertWalkForward(dependencies, body, version.config);',
      '',
    ),
  },
  {
    name: 'WALK_FORWARD_REQUEST_NOT_PERSISTED',
    edits: edit(
      'runs/create-run.use-case.ts',
      '  if (body.walkForward !== undefined) return parseJsonContainer(JSON.stringify(body.walkForward));',
      '',
    ),
  },
  {
    name: 'LIVE_RUN_DISPATCHED_TO_THE_BACKTEST_QUEUE',
    edits: edit(
      'runs/create-run.use-case.ts',
      'body.kind === RUN_KIND.LIVE_PAPER\n        ? created\n        : await dispatchOrFail(dependencies, scope, created);',
      'await dispatchOrFail(dependencies, scope, created);',
    ),
  },
  {
    name: 'LIVE_RUN_ACCEPTS_A_PERIOD',
    edits: edit(
      'runs/create-run-request.schema.ts',
      'if (isLive && value !== undefined) addIssue(context, [field], RUN_REASON.NOT_ALLOWED_FOR_KIND);',
      '',
    ),
  },
  {
    name: 'LIVE_RUN_STARTS_AT_THE_PAST',
    edits: edit(
      'runs/create-run.use-case.ts',
      'return Math.floor(now / duration) * duration;',
      'return Math.floor(now / duration) * duration - duration;',
    ),
  },
  {
    name: 'BACKTEST_WITHOUT_PERIOD_ACCEPTED',
    edits: edit(
      'runs/create-run-request.schema.ts',
      'if (!isLive && value === undefined) addIssue(context, [field], RUN_REASON.REQUIRED);',
      '',
    ),
  },
  {
    name: 'SURVIVAL_SETTINGS_NOT_STORED',
    edits: edit(
      'runs/create-run.use-case.ts',
      '    ...(body.survival === undefined ? {} : { survival: body.survival }),\n',
      '',
    ),
  },
  {
    name: 'SURVIVAL_ACCEPTED_FOR_BACKTEST',
    edits: edit(
      'runs/run-survival-request.ts',
      'if (body.kind !== RUN_KIND.LIVE_PAPER) {',
      'if (false as boolean) {',
    ),
  },
  {
    name: 'SURVIVAL_SHOWN_FOR_BACKTEST_ON_CREATION',
    edits: edit(
      'runs/run-survival.ts',
      'BalanceSurvival | null {\n  if (run.kind !== RUN_KIND.LIVE_PAPER) return null;\n',
      'BalanceSurvival | null {\n',
    ),
  },
  {
    name: 'SURVIVAL_READ_FOR_BACKTEST',
    edits: edit(
      'runs/run-survival.ts',
      '  if (run.kind !== RUN_KIND.LIVE_PAPER) return null;\n  const parameters = parseRunParameters(run.runParameters);\n  const levels',
      '  const parameters = parseRunParameters(run.runParameters);\n  const levels',
    ),
  },
  {
    name: 'SURVIVAL_READS_THE_WHOLE_SERIES_INSTEAD_OF_THE_DECIDING_POINTS',
    edits: edit(
      'runs/run-survival.ts',
      '  const points = await dependencies.results.listSurvivalPoints(params.scope, run.id, {',
      '  const points = await dependencies.results.listSurvivalPoints(params.scope, run.id + "x", {',
    ),
  },
  {
    name: 'SURVIVAL_READ_WITH_THE_WRONG_FLOOR',
    edits: edit(
      'runs/run-survival.ts',
      '    ...levels,\n',
      '    floorLevel: "0",\n    targetLevel: levels.targetLevel,\n',
    ),
  },
  {
    name: 'SURVIVAL_READ_WITH_THE_WRONG_TARGET',
    edits: edit(
      'runs/run-survival.ts',
      '    ...levels,\n',
      '    floorLevel: levels.floorLevel,\n    targetLevel: "999999999",\n',
    ),
  },
  {
    name: 'SURVIVAL_POINTS_DISCARDED_ON_READ',
    edits: edit('runs/run-survival.ts', '    (points ?? []).map(', '    [].map('),
  },
  {
    name: 'SURVIVAL_SETTINGS_IGNORED_ON_READ',
    edits: edit(
      'runs/run-survival.ts',
      'settings: parseSurvivalSettings(readSettingsInput(run.request)),\n  });\n  const points',
      'settings: parseSurvivalSettings(undefined),\n  });\n  const points',
    ),
  },
  {
    name: 'SURVIVAL_STARTS_AT_THE_EPOCH',
    edits: edit(
      'runs/run-survival.ts',
      '    startTime: run.periodStart,\n    ...levels,',
      '    startTime: 0,\n    ...levels,',
    ),
  },
  {
    name: 'SURVIVAL_SCAN_STARTS_AT_THE_EPOCH',
    edits: edit(
      'runs/run-survival.ts',
      'startTime: run.periodStart,\n    durationMilliseconds',
      'startTime: 0,\n    durationMilliseconds',
    ),
  },
  {
    name: 'WAITING_SHOWN_FOR_A_RUN_THAT_IS_NOT_RUNNING',
    edits: edit(
      'runs/run-view.ts',
      '  if (record.status !== RUN_STATUS.RUNNING) return null;\n',
      '',
    ),
  },
  {
    name: 'WAITING_NEVER_SHOWN',
    edits: edit(
      'runs/run-view.ts',
      'return { since: record.waitingSince, openTime: record.waitingOpenTime };',
      'return null;',
    ),
  },
  {
    name: 'WAITING_SINCE_AND_OPEN_TIME_SWAPPED',
    edits: edit(
      'runs/run-view.ts',
      'return { since: record.waitingSince, openTime: record.waitingOpenTime };',
      'return { since: record.waitingOpenTime, openTime: record.waitingSince };',
    ),
  },
  {
    name: 'WAITING_NOT_RETURNED_BY_THE_DETAIL',
    edits: edit(
      'runs/run.use-cases.ts',
      '      waitingForData: toWaitingForData(run),',
      '      waitingForData: null,',
    ),
  },
  {
    name: 'WARNINGS_NOT_RETURNED_ON_CREATION',
    edits: edit(
      'runs/create-run.use-case.ts',
      'read: () => readRunWarnings(dependencies, run),',
      'read: () => Promise.resolve([]),',
    ),
  },
  {
    name: 'STOP_IS_NOT_IDEMPOTENT',
    edits: edit(
      'runs/run.use-cases.ts',
      'if (result.currentStatus !== RUN_STATUS.CANCELLED) throw new RunAlreadyFinishedError();',
      'throw new RunAlreadyFinishedError();',
    ),
  },
  {
    name: 'RUN_LIST_IGNORES_THE_KIND_FILTER',
    edits: edit(
      'runs/run.use-cases.ts',
      'const page = await dependencies.runs.listRuns(scope, input);',
      'const page = await dependencies.runs.listRuns(scope, { ...input, kind: undefined });',
    ),
  },
  {
    name: 'OVERFITTING_ALERT_NOT_EXTRACTED',
    edits: edit(
      'runs/run-view.ts',
      'if (record.kind !== RUN_KIND.WALK_FORWARD || !isJsonObject(record.metrics)) return null;',
      'return null;',
    ),
  },
  {
    name: 'CANDLE_RANGE_UNBOUNDED',
    edits: edit(
      'markets/candles-query.schema.ts',
      '> MAX_CANDLES_PER_RESPONSE',
      '> MAX_CANDLES_PER_RESPONSE * 1000',
    ),
  },
  {
    name: 'CANDLE_END_IS_INCLUSIVE',
    edits: edit(
      'markets/list-candles.use-case.ts',
      '      to: query.to,',
      '      to: query.to + 1,',
    ),
  },
  {
    name: 'CANDLE_RATE_LIMIT_REMOVED',
    edits: edit(
      'markets/markets.routes.ts',
      '      rateLimitPolicy: RATE_LIMIT_POLICY.CANDLE_QUERY,\n',
      '',
    ),
  },
  {
    name: 'RUN_CREATION_RATE_LIMIT_REMOVED',
    edits: edit(
      'runs/runs.routes.ts',
      '    rateLimitPolicy: RATE_LIMIT_POLICY.EXECUTION_CREATION,\n',
      '',
    ),
  },
  {
    name: 'EXPORT_RATE_LIMIT_REMOVED',
    edits: edit(
      'runs/run-export.routes.ts',
      '      path: RUN_EXPORT_PATH,\n      access: ROUTE_ACCESS.USER,\n      rateLimitPolicy: RATE_LIMIT_POLICY.RUN_EXPORT,\n',
      '      path: RUN_EXPORT_PATH,\n      access: ROUTE_ACCESS.USER,\n',
    ),
  },
];

describe('rotas REST: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte (os sete contratos de rota); quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(API_ROUTES_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(API_ROUTES_MUTANT_TARGET));

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
