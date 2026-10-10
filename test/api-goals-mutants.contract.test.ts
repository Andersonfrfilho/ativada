// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { GOALS_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
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
const REQUESTS = 'goals/goal-requests.ts';
const USE_CASES = 'goals/goal.use-cases.ts';
const ROUTES = 'goals/goals.routes.ts';
const COMBINATION = 'goals/goal-evaluation-combination.ts';
const CANDLES = 'goals/goal-evaluation-candles.ts';
const EVALUATION = 'goals/goal-evaluation.use-case.ts';
const STRATEGIES = 'goals/goal-evaluation-strategies.ts';
const CACHE = 'goals/goal-evaluation-cache.ts';
const CONSTANT = 'goals/goal.constant.ts';
const RUN_REQUEST = 'runs/create-run-request.schema.ts';
const CREATE_RUN = 'runs/create-run.use-case.ts';
const RUN_VIEW = 'runs/run-view.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

function withoutAccess(path: string, documentation: string): SourceEdit[] {
  return edit(
    ROUTES,
    `path: ${path},\n    access: ROUTE_ACCESS.USER,\n    documentation: GOAL_DOCUMENTATION.${documentation},`,
    `path: ${path},\n    documentation: GOAL_DOCUMENTATION.${documentation},`,
  );
}

const MUTANTS: readonly SourceMutant[] = [
  { name: 'LIST_ROUTE_WITHOUT_ACCESS', edits: withoutAccess('GOALS_PATH', 'list') },
  { name: 'CREATE_ROUTE_WITHOUT_ACCESS', edits: withoutAccess('GOALS_PATH', 'create') },
  { name: 'GET_ROUTE_WITHOUT_ACCESS', edits: withoutAccess('GOAL_PATH', 'get') },
  { name: 'UPDATE_ROUTE_WITHOUT_ACCESS', edits: withoutAccess('GOAL_PATH', 'update') },
  { name: 'DELETE_ROUTE_WITHOUT_ACCESS', edits: withoutAccess('GOAL_PATH', 'delete') },
  {
    name: 'EVALUATION_ROUTE_WITHOUT_ACCESS',
    edits: edit(
      ROUTES,
      'path: GOAL_EVALUATION_PATH,\n    access: ROUTE_ACCESS.USER,',
      'path: GOAL_EVALUATION_PATH,',
    ),
  },
  {
    name: 'EVALUATION_WITHOUT_ITS_RATE_LIMIT',
    edits: edit(ROUTES, '    rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,\n', ''),
  },
  {
    name: 'MALFORMED_ID_IS_NOT_A_NOT_FOUND',
    edits: edit(ROUTES, 'if (goalId === undefined) throw new GoalNotFoundError();', ''),
  },
  {
    name: 'CREATE_ACCEPTS_UNKNOWN_FIELDS',
    edits: [
      {
        file: REQUESTS,
        find: '    .strictObject({\n      symbol: enabledSymbol(enabledSymbols),\n      targetRate: z.string().max(TEXT_MAXIMUM),',
        replace:
          '    .object({\n      symbol: enabledSymbol(enabledSymbols),\n      targetRate: z.string().max(TEXT_MAXIMUM),',
        occurrences: 1,
      },
    ],
  },
  {
    name: 'PATCH_ACCEPTS_UNKNOWN_FIELDS',
    edits: edit(
      REQUESTS,
      '    .strictObject({\n      symbol: enabledSymbol(enabledSymbols).optional(),',
      '    .object({\n      symbol: enabledSymbol(enabledSymbols).optional(),',
    ),
  },
  {
    name: 'ANY_SYMBOL_ACCEPTED',
    edits: edit(
      REQUESTS,
      '.refine((symbol) => enabledSymbols.includes(symbol), { error: GOAL_REASON.NOT_ENABLED })',
      '.refine(() => true, { error: GOAL_REASON.NOT_ENABLED })',
    ),
  },
  {
    name: 'GOAL_VALUES_NOT_CHECKED_ON_CREATE',
    edits: edit(REQUESTS, '.superRefine(checkFields)', '.superRefine(() => undefined)'),
  },
  {
    name: 'EMPTY_PATCH_ACCEPTED',
    edits: edit(
      REQUESTS,
      "context.addIssue({ code: 'custom', path: [], message: NO_FIELD_REASON });",
      '',
    ),
  },
  {
    name: 'PATCH_VALUES_NOT_CHECKED',
    edits: edit(REQUESTS, '      checkFields(body, context);\n    })', '    })'),
  },
  {
    name: 'PATCH_SPELLING_NOT_CANONICAL',
    edits: edit(REQUESTS, '{ targetRate: spec.targetRate }', '{ targetRate: body.targetRate }'),
  },
  {
    name: 'CREATE_SPELLING_NOT_CANONICAL',
    edits: edit(
      REQUESTS,
      '({ symbol: body.symbol, ...canonicalFields(body) })',
      '({ symbol: body.symbol, targetRate: body.targetRate, maxLossRate: body.maxLossRate, horizonDays: body.horizonDays })',
    ),
  },
  {
    name: 'GOAL_LIMIT_NOT_ENFORCED',
    edits: edit(USE_CASES, 'maxGoals: dependencies.maxGoals,', 'maxGoals: 1_000_000,'),
  },
  {
    name: 'GOAL_LIMIT_NOT_REPORTED',
    edits: edit(
      USE_CASES,
      'if (created.outcome === GOAL_CREATE_OUTCOME.LIMIT_REACHED) throw new GoalLimitReachedError();',
      '',
    ),
  },
  {
    name: 'DELETE_IN_USE_NOT_REPORTED',
    edits: edit(
      USE_CASES,
      'if (outcome === GOAL_DELETE_OUTCOME.IN_USE) throw new GoalInUseError();',
      '',
    ),
  },
  {
    name: 'DELETE_NOT_FOUND_NOT_REPORTED',
    edits: edit(
      USE_CASES,
      'if (outcome === GOAL_DELETE_OUTCOME.NOT_FOUND) throw new GoalNotFoundError();',
      '',
    ),
  },
  {
    name: 'EVALUATION_CACHE_NEVER_READ',
    edits: edit(COMBINATION, 'if (cached !== undefined) return cached;', ''),
  },
  {
    name: 'EVALUATION_CACHE_NEVER_WRITTEN',
    edits: edit(COMBINATION, 'dependencies.cache.set(key, computed);', ''),
  },
  {
    name: 'CACHE_IGNORES_THE_LAST_CANDLE',
    edits: edit(
      COMBINATION,
      'lastCandleOpenTime: lastOpenTimeOf(candles),',
      'lastCandleOpenTime: null,',
    ),
  },
  {
    name: 'CACHE_IGNORES_THE_TARGET',
    edits: edit(
      COMBINATION,
      '    targetRate: goal.targetRate,\n    maxLossRate: goal.maxLossRate,\n    horizonDays: goal.horizonDays,\n    strategyVersionId',
      "    targetRate: '',\n    maxLossRate: goal.maxLossRate,\n    horizonDays: goal.horizonDays,\n    strategyVersionId",
    ),
  },
  {
    name: 'EVALUATION_SITUATION_FOR_THE_HOLDING_STATE',
    edits: edit(
      COMBINATION,
      'state: TRIGGER_STATE.AWAITING_ENTRY,',
      'state: TRIGGER_STATE.HOLDING,',
    ),
  },
  {
    name: 'CANDLE_GAP_NOT_DETECTED',
    edits: edit(CANDLES, 'next.openTime - candle.openTime !== DURATION', 'false as boolean'),
  },
  {
    name: 'HISTORY_TOO_SHORT',
    edits: edit(CONSTANT, 'GOAL_HISTORY_DAYS = 1_100', 'GOAL_HISTORY_DAYS = 100'),
  },
  {
    name: 'MORE_STRATEGIES_THAN_THE_CEILING',
    edits: edit(
      CONSTANT,
      'GOAL_EVALUATION_MAX_STRATEGIES = 5',
      'GOAL_EVALUATION_MAX_STRATEGIES = 6',
    ),
  },
  {
    name: 'TRUNCATION_NOT_REPORTED',
    edits: edit(STRATEGIES, 'isTruncated: page.nextCursor !== undefined', 'isTruncated: false'),
  },
  {
    name: 'EVALUATION_NOT_RANKED',
    edits: edit(
      EVALUATION,
      'combinations: rankViews(evaluated.views),',
      'combinations: evaluated.views,',
    ),
  },
  {
    name: 'EVERY_SYMBOL_IS_THE_GOAL_SYMBOL',
    edits: edit(EVALUATION, 'isGoalSymbol: series.symbol === goal.symbol,', 'isGoalSymbol: true,'),
  },
  {
    name: 'RANK_STARTS_AT_ZERO',
    edits: edit(EVALUATION, 'rank: index + 1', 'rank: index'),
  },
  {
    name: 'CACHE_NEVER_EVICTS',
    edits: edit(CACHE, 'if (entries.size <= maxEntries) return;', 'return;'),
  },
  {
    name: 'CACHE_REWRITE_KEEPS_THE_OLD_POSITION',
    edits: edit(CACHE, '      entries.delete(text);\n', ''),
  },
  {
    name: 'GOAL_ACCEPTED_FOR_BACKTEST_AND_WALK_FORWARD',
    edits: edit(
      RUN_REQUEST,
      'if (body.goalId !== undefined && body.kind !== RUN_KIND.LIVE_PAPER) {',
      'if (false as boolean) {',
    ),
  },
  {
    name: 'GOAL_NEVER_RESOLVED_ON_RUN_CREATION',
    edits: edit(
      CREATE_RUN,
      'if (body.goalId === undefined) return undefined;',
      'return undefined;',
    ),
  },
  {
    name: 'MISSING_GOAL_NOT_REPORTED',
    edits: edit(CREATE_RUN, 'if (goal === undefined) throw new GoalNotFoundError();', ''),
  },
  {
    name: 'INACTIVE_GOAL_ACCEPTED',
    edits: edit(CREATE_RUN, 'if (!goal.isActive) throw new GoalInactiveError();', ''),
  },
  {
    name: 'GOAL_OF_ANOTHER_SYMBOL_ACCEPTED',
    edits: edit(
      CREATE_RUN,
      'if (goal.symbol !== body.setup.parameters.symbol) {',
      'if (false as boolean) {',
    ),
  },
  {
    name: 'GOAL_SNAPSHOT_FROM_THE_WRONG_FIELD',
    edits: edit(CREATE_RUN, 'targetRate: goal.targetRate,', 'targetRate: goal.maxLossRate,'),
  },
  {
    name: 'GOAL_NOT_LINKED_TO_THE_RUN',
    edits: edit(
      CREATE_RUN,
      '    ...(context.goal === undefined ? {} : { goalId: context.goal.id }),\n',
      '',
    ),
  },
  {
    name: 'RUN_VIEW_HIDES_THE_GOAL',
    edits: edit(RUN_VIEW, 'goalId: record.goalId ?? null,', 'goalId: null,'),
  },
  {
    name: 'RUN_VIEW_HIDES_THE_OUTCOME',
    edits: edit(RUN_VIEW, 'goalOutcome: record.goalOutcome ?? null,', 'goalOutcome: null,'),
  },
];

describe('metas na API: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(GOALS_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(GOALS_MUTANT_TARGET));

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
