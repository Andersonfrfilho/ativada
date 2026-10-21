// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { LIVE_STATUS_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
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
const DIRECTORY = 'runs/live-status';
const CONTEXT = `${DIRECTORY}/live-status-context.ts`;
const STATUS_ROUTE = `${DIRECTORY}/live-status.route.ts`;
const STATUS_DOCS = `${DIRECTORY}/live-status.docs.ts`;
const STATUS_USE_CASE = `${DIRECTORY}/live-status.use-case.ts`;
const DECISIONS_ROUTE = `${DIRECTORY}/run-decisions.route.ts`;
const DECISIONS_DOCS = `${DIRECTORY}/run-decisions.docs.ts`;
const DECISIONS_USE_CASE = `${DIRECTORY}/run-decisions.use-case.ts`;
const DECISION_PAGE = `${DIRECTORY}/decision-page.ts`;
const CANDLE_STATE = `${DIRECTORY}/decision-candle-state.ts`;
const DECISION_MESSAGES = `${DIRECTORY}/decision-messages.ts`;
const BALANCE = `${DIRECTORY}/live-balance.ts`;
const GOAL_PROGRESS = `${DIRECTORY}/live-goal-progress.ts`;
const CONSTANT = `${DIRECTORY}/live-status.constant.ts`;
const MESSAGES = `${DIRECTORY}/live-status-messages.ts`;
const NUMBER_FORMAT = `${DIRECTORY}/live-number-format.ts`;
const SECTIONS = `${DIRECTORY}/live-status-sections.ts`;
const TRIGGERS = `${DIRECTORY}/live-status-triggers.ts`;
const STORED_READINGS = `${DIRECTORY}/stored-readings.ts`;
const CHART_DECISIONS = 'runs/chart/chart-decisions.ts';
const RUN_CHART = 'runs/chart/run-chart.use-case.ts';
const PAGE_QUERY = 'shared/pagination/page-query.schema.ts';
const POLICY = 'rate-limit/rate-limit-policy.constant.ts';
const USER_ACCESS = 'access: ROUTE_ACCESS.USER,';
const PUBLIC_ACCESS = 'access: ROUTE_ACCESS.PUBLIC,';
const RATE_LIMIT_LINE = '    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,\n';
const FOREIGN_RUN_ERROR = "throw new Error('execução de outro dono');";

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const TRADE_PLAN_DIRECTORY = 'runs/trade-plan';
const TRADE_PLAN_ROUTE = `${TRADE_PLAN_DIRECTORY}/trade-plan.route.ts`;
const TRADE_PLAN_USE_CASE = `${TRADE_PLAN_DIRECTORY}/trade-plan.use-case.ts`;
const TRADE_PLAN_LEVELS = `${TRADE_PLAN_DIRECTORY}/trade-plan-levels.ts`;
const TRADE_PLAN_MATH = `${TRADE_PLAN_DIRECTORY}/trade-plan-math.ts`;
const TRADE_PLAN_TEAMS = `${TRADE_PLAN_DIRECTORY}/trade-plan-teams.ts`;

// O plano de operação ao vivo (`/trade-plan`): dono, direção dos arredondamentos e as contas do preenchimento.
const TRADE_PLAN: readonly SourceMutant[] = [
  { name: 'TRADE_PLAN_ROUTE_IS_PUBLIC', edits: edit(TRADE_PLAN_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
  {
    name: 'TRADE_PLAN_TARGET_RATE_ROUNDS_DOWN',
    edits: edit(
      TRADE_PLAN_LEVELS,
      'exitPrice: target }, UP);',
      'exitPrice: target }, ROUNDING_DIRECTION.DOWN);',
    ),
  },
  {
    name: 'TRADE_PLAN_RESULT_RATE_ROUNDS_UP',
    edits: edit(
      TRADE_PLAN_MATH,
      'params.entryCost), ROUNDING_DIRECTION.DOWN)',
      'params.entryCost), ROUNDING_DIRECTION.UP)',
    ),
  },
  {
    name: 'TRADE_PLAN_STOP_EXITS_WITHOUT_SLIPPAGE',
    edits: edit(
      TRADE_PLAN_LEVELS,
      'const exitPrice = marketSellFill(stop, params.basis.parameters);',
      'const exitPrice = stop;',
    ),
  },
  {
    name: 'TRADE_PLAN_FEE_ROUNDS_DOWN',
    edits: edit(
      TRADE_PLAN_MATH,
      'return roundMoneyUp(notional.times(pricing.feeRate));',
      'return roundMoneyDown(notional.times(pricing.feeRate));',
    ),
  },
  {
    name: 'TRADE_PLAN_TEAM_READS_ON_DEMAND_REPORTS',
    edits: edit(TRADE_PLAN_TEAMS, 'row.kind === MODEL_TEAM_REPORT_KIND.SCHEDULED &&', ''),
  },
  {
    name: 'TRADE_PLAN_IGNORES_A_STALLED_RUN',
    edits: edit(
      TRADE_PLAN_USE_CASE,
      'if (run.stalledSince !== undefined) return TRADE_PLAN_UNAVAILABLE_REASON.STALLED;',
      '',
    ),
  },
];

const OWNER_ACCESS_AND_KIND: readonly SourceMutant[] = [
  {
    name: 'LIVE_STATUS_OF_FOREIGN_RUN_ANSWERS_DIFFERENTLY',
    edits: edit(
      CONTEXT,
      'if (run === undefined) throw new RunNotFoundError();',
      `if (run === undefined) ${FOREIGN_RUN_ERROR}`,
    ),
  },
  {
    name: 'LIVE_STATUS_OF_FOREIGN_RUN_IS_A_409',
    edits: edit(
      CONTEXT,
      'if (run === undefined) throw new RunNotFoundError();',
      'if (run === undefined) throw new RunNotLiveError();',
    ),
  },
  {
    name: 'LIVE_STATUS_ACCEPTS_BACKTEST_AND_WALK_FORWARD',
    edits: edit(CONTEXT, 'if (!params.kinds.has(run.kind)) throw new RunNotLiveError();', ''),
  },
  {
    name: 'LIVE_STATUS_NOT_LIVE_IS_A_404',
    edits: edit(
      CONTEXT,
      'if (!params.kinds.has(run.kind)) throw new RunNotLiveError();',
      'if (!params.kinds.has(run.kind)) throw new RunNotFoundError();',
    ),
  },
  { name: 'LIVE_STATUS_ROUTE_IS_PUBLIC', edits: edit(STATUS_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
  { name: 'DECISIONS_ROUTE_IS_PUBLIC', edits: edit(DECISIONS_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
  {
    name: 'CHART_DECISIONS_FOR_BACKTEST_AND_WALK_FORWARD',
    edits: edit(CHART_DECISIONS, 'if (run.kind !== RUN_KIND.LIVE_PAPER) return null;', ''),
  },
];

const VALIDATION_AND_LIMITS: readonly SourceMutant[] = [
  {
    name: 'LIVE_STATUS_ACCEPTS_ANY_QUERY',
    edits: edit(STATUS_DOCS, 'z.strictObject({})', 'z.looseObject({})'),
  },
  {
    name: 'DECISIONS_ACCEPTS_ANY_QUERY',
    edits: edit(DECISIONS_DOCS, 'z.strictObject({', 'z.looseObject({'),
  },
  {
    name: 'DECISIONS_LIMIT_NOT_CAPPED_AT_100',
    edits: edit(
      PAGE_QUERY,
      '.pipe(z.number().int().min(1).max(MAX_PAGE_SIZE))',
      '.pipe(z.number().int().min(1))',
    ),
  },
  {
    name: 'DECISIONS_DEFAULT_PAGE_IS_NOT_24',
    edits: edit(
      DECISIONS_ROUTE,
      'query.limit ?? LIVE_DECISIONS_PAGE_SIZE.DEFAULT',
      'query.limit ?? LIVE_DECISIONS_PAGE_SIZE.MAXIMUM',
    ),
  },
  {
    name: 'LIVE_STATUS_FIRST_PAGE_IS_NOT_24',
    edits: edit(
      STATUS_USE_CASE,
      'limit: LIVE_DECISIONS_PAGE_SIZE.DEFAULT,',
      'limit: LIVE_DECISIONS_PAGE_SIZE.MAXIMUM,',
    ),
  },
  {
    name: 'DECISIONS_IGNORE_THE_LIMIT',
    edits: edit(DECISIONS_USE_CASE, 'limit: input.limit,', 'limit: 24,'),
  },
  {
    name: 'DECISIONS_IGNORE_THE_CURSOR',
    edits: edit(DECISIONS_USE_CASE, '? input.before :', '? undefined :'),
  },
  {
    name: 'DECISIONS_NEVER_RETURN_A_NEXT_CURSOR',
    edits: edit(
      DECISION_PAGE,
      'nextCursor: page.nextBefore === undefined ? null : encodeTimeCursor(page.nextBefore),',
      'nextCursor: null,',
    ),
  },
  {
    name: 'DECISIONS_CURSOR_NOT_VALIDATED',
    edits: edit(
      DECISIONS_ROUTE,
      'if (query.cursor !== undefined && before === undefined) throw invalidCursorError();',
      '',
    ),
  },
  {
    name: 'LIVE_STATUS_WITHOUT_RATE_LIMIT',
    edits: edit(STATUS_ROUTE, RATE_LIMIT_LINE, ''),
  },
  {
    name: 'DECISIONS_WITHOUT_RATE_LIMIT',
    edits: edit(DECISIONS_ROUTE, RATE_LIMIT_LINE, ''),
  },
  {
    name: 'LIVE_STATUS_RATE_LIMIT_IS_NOT_60',
    edits: edit(
      POLICY,
      "name: 'run-live-status',\n    limit: 60,",
      "name: 'run-live-status',\n    limit: 600,",
    ),
  },
  {
    name: 'CHART_DECISIONS_CAP_OFF_BY_ONE',
    edits: edit(
      CHART_DECISIONS,
      '/ durationMilliseconds > CHART_MARKER_LIMIT',
      '/ durationMilliseconds >= CHART_MARKER_LIMIT',
    ),
  },
  {
    name: 'CHART_DECISIONS_CAP_REMOVED',
    edits: edit(
      CHART_DECISIONS,
      '/ durationMilliseconds > CHART_MARKER_LIMIT',
      '/ durationMilliseconds > CHART_MARKER_LIMIT * 1000',
    ),
  },
  {
    name: 'CHART_DECISIONS_MORE_THAN_500_MARKERS_KEPT',
    edits: edit(CHART_DECISIONS, 'if (markers.length > CHART_MARKER_LIMIT) return null;', ''),
  },
];

const ROUNDING_AND_ARITHMETIC: readonly SourceMutant[] = [
  {
    name: 'BALANCE_RATE_ROUNDED_UP',
    edits: edit(
      BALANCE,
      'toDecimalPlaces(LIVE_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR)',
      'toDecimalPlaces(LIVE_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL)',
    ),
  },
  {
    name: 'BALANCE_USES_THE_BENCHMARK_AS_THE_BALANCE',
    edits: edit(
      SECTIONS,
      'latestEquity: equityPoint?.equity,',
      'latestEquity: equityPoint?.benchmark,',
    ),
  },
  {
    name: 'BUY_AND_HOLD_EVEN_BAND_TOO_WIDE',
    edits: edit(CONSTANT, "EVEN_DIFFERENCE_POINTS = '0.01'", "EVEN_DIFFERENCE_POINTS = '0.1'"),
  },
  {
    name: 'BUY_AND_HOLD_BELOW_EXCLUDES_THE_LIMIT',
    edits: edit(
      BALANCE,
      'differencePoints.lessThanOrEqualTo(threshold.negated())',
      'differencePoints.lessThan(threshold.negated())',
    ),
  },
  {
    name: 'BUY_AND_HOLD_ABOVE_EXCLUDES_THE_LIMIT',
    edits: edit(
      BALANCE,
      'differencePoints.greaterThanOrEqualTo(threshold)',
      'differencePoints.greaterThan(threshold)',
    ),
  },
  {
    name: 'GOAL_REMAINING_ROUNDED_DOWN',
    edits: edit(
      GOAL_PROGRESS,
      'roundMoneyUp(levels.target.minus(current))',
      'roundMoneyDown(levels.target.minus(current))',
    ),
  },
  {
    name: 'GOAL_LOSS_ROOM_ROUNDED_UP',
    edits: edit(
      GOAL_PROGRESS,
      'roundMoneyDown(current.minus(levels.stop))',
      'roundMoneyUp(current.minus(levels.stop))',
    ),
  },
  {
    name: 'GOAL_REMAINING_CAN_BE_NEGATIVE',
    edits: edit(
      GOAL_PROGRESS,
      'EngineDecimal.max(ZERO, roundMoneyUp(levels.target.minus(current)))',
      'roundMoneyUp(levels.target.minus(current))',
    ),
  },
  {
    name: 'GOAL_LOSS_ROOM_CAN_BE_NEGATIVE',
    edits: edit(
      GOAL_PROGRESS,
      'EngineDecimal.max(ZERO, roundMoneyDown(current.minus(levels.stop)))',
      'roundMoneyDown(current.minus(levels.stop))',
    ),
  },
  {
    name: 'GOAL_DEADLINE_COUNTS_FROM_NOW',
    edits: edit(
      GOAL_PROGRESS,
      'params.periodStart + goal.horizonDays * MILLISECONDS_PER_DAY',
      'params.now + goal.horizonDays * MILLISECONDS_PER_DAY',
    ),
  },
  {
    name: 'NUMBER_FORMAT_DIRECTIONS_SWAPPED',
    edits: edit(
      NUMBER_FORMAT,
      'direction === ROUNDING_DIRECTION.UP ? EngineDecimal.ROUND_CEIL : EngineDecimal.ROUND_FLOOR',
      'direction === ROUNDING_DIRECTION.UP ? EngineDecimal.ROUND_FLOOR : EngineDecimal.ROUND_CEIL',
    ),
  },
  {
    name: 'BALANCE_MESSAGE_ROUNDED_UP',
    edits: edit(
      MESSAGES,
      'formatAmount(balance.current, DOWN)',
      'formatAmount(balance.current, UP)',
    ),
  },
  {
    name: 'BALANCE_MESSAGE_RESULT_PERCENT_ROUNDED_UP',
    edits: edit(
      MESSAGES,
      'formatRatePercent(balance.resultRate, DOWN)',
      'formatRatePercent(balance.resultRate, UP)',
    ),
  },
  {
    name: 'BUY_AND_HOLD_MESSAGE_ABOVE_ROUNDED_UP',
    edits: edit(
      MESSAGES,
      'describePoints(buyAndHold.differencePoints, DOWN)',
      'describePoints(buyAndHold.differencePoints, UP)',
    ),
  },
  {
    name: 'BUY_AND_HOLD_MESSAGE_BELOW_ROUNDED_DOWN',
    edits: edit(
      MESSAGES,
      'describePoints(toEngineDecimal(buyAndHold.differencePoints).abs().toFixed(), UP)',
      'describePoints(toEngineDecimal(buyAndHold.differencePoints).abs().toFixed(), DOWN)',
    ),
  },
  {
    name: 'GOAL_MESSAGE_REMAINING_ROUNDED_DOWN',
    edits: edit(
      MESSAGES,
      'formatAmount(progress.remainingAmount, UP)',
      'formatAmount(progress.remainingAmount, DOWN)',
    ),
  },
  {
    name: 'GOAL_MESSAGE_LOSS_ROOM_ROUNDED_UP',
    edits: edit(
      MESSAGES,
      'formatAmount(progress.lossRoomAmount, DOWN)',
      'formatAmount(progress.lossRoomAmount, UP)',
    ),
  },
];

const PHRASES_AND_STATES: readonly SourceMutant[] = [
  {
    name: 'DECISION_MESSAGE_USES_THE_SELL_THRESHOLD',
    edits: edit(
      DECISION_MESSAGES,
      'toEngineDecimal(params.config.thresholds.buy).minus(params.score)',
      'toEngineDecimal(params.config.thresholds.sell).minus(params.score)',
    ),
  },
  {
    name: 'SIGNAL_EXIT_COUNTS_AS_AN_EXIT_WITHOUT_SIGNAL',
    edits: edit(CANDLE_STATE, 'position.exitReason !== EXIT_REASON.SIGNAL', 'true'),
  },
  {
    name: 'BUY_COUNTS_AS_FILLED_WITHOUT_THE_NEXT_CANDLE_POSITION',
    edits: edit(
      CANDLE_STATE,
      'positions.some((position) => position.openedCandleTime === nextOpen)',
      'true',
    ),
  },
  {
    name: 'THE_LAST_CANDLE_NEVER_HAS_A_PENDING_BUY',
    edits: edit(CANDLE_STATE, 'params.lastCandleTime === candleTime', 'false'),
  },
  {
    name: 'DECISION_PAGE_SPAN_ENDS_AT_THE_NEWEST_CANDLE',
    edits: edit(
      DECISION_PAGE,
      'newest.candleTime + params.durationMilliseconds',
      'newest.candleTime',
    ),
  },
  {
    name: 'CHART_DECISIONS_FAILURE_BREAKS_THE_CHART',
    edits: edit(RUN_CHART, '.catch(() => null)', ''),
  },
  {
    name: 'HOLDING_STARTS_AFTER_THE_BUY_CANDLE',
    edits: edit(
      CANDLE_STATE,
      'position.openedCandleTime <= candleTime &&',
      'position.openedCandleTime < candleTime &&',
    ),
  },
  {
    name: 'HOLDING_INCLUDES_THE_EXIT_CANDLE',
    edits: edit(
      CANDLE_STATE,
      'position.closedCandleTime > candleTime),',
      'position.closedCandleTime >= candleTime),',
    ),
  },
  {
    name: 'TRIGGERS_IGNORE_THE_RUN_STATUS',
    edits: edit(
      TRIGGERS,
      'return context.run.status === RUN_STATUS.RUNNING\n    ? undefined\n    : TRIGGER_UNAVAILABLE_REASON.NOT_RUNNING;',
      'return undefined;',
    ),
  },
  {
    name: 'TRIGGERS_WITHOUT_A_CANDLE_SAY_WARMING_UP',
    edits: edit(
      TRIGGERS,
      'if (latest === undefined) return unavailable(context, TRIGGER_UNAVAILABLE_REASON.NO_CANDLE);',
      'if (latest === undefined) return unavailable(context, TRIGGER_UNAVAILABLE_REASON.WARMING_UP);',
    ),
  },
  {
    name: 'TRIGGERS_ALWAYS_WAIT_FOR_THE_ENTRY',
    edits: edit(
      TRIGGERS,
      'params.hasOpenPosition\n    ? TRIGGER_STATE.HOLDING\n    : TRIGGER_STATE.AWAITING_ENTRY;',
      'TRIGGER_STATE.AWAITING_ENTRY;',
    ),
  },
  {
    name: 'OPEN_POSITION_IS_THE_CLOSED_ONE',
    edits: edit(
      SECTIONS,
      'position.status === POSITION_STATUS.OPEN',
      'position.status === POSITION_STATUS.CLOSED',
    ),
  },
  {
    name: 'STORED_READINGS_DONCHIAN_PREVIOUS_IS_THE_CURRENT_ROW',
    edits: edit(
      STORED_READINGS,
      'previous: unflattenIndicator(params.previous, id)',
      'previous: unflattenIndicator(params.latest, id)',
    ),
  },
  {
    name: 'STORED_READINGS_DONCHIAN_WITHOUT_PREVIOUS_IS_INVENTED',
    edits: edit(STORED_READINGS, 'if (params.previous === undefined) return undefined;', ''),
  },
  {
    name: 'STORED_READINGS_KEEP_NON_NUMBERS',
    edits: edit(
      STORED_READINGS,
      "(entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),",
      '(entry): entry is [string, number] => true,',
    ),
  },
  {
    name: 'STORED_READINGS_DROP_THE_SENTIMENT',
    edits: edit(
      STORED_READINGS,
      'sentiment: readSentiment(params.latest.sentimentObservation),',
      'sentiment: undefined,',
    ),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'DECISIONS_REFUSE_WALK_FORWARD',
    edits: edit(CONTEXT, 'RUN_KIND.WALK_FORWARD,', ''),
  },
  {
    name: 'DECISIONS_REFUSE_BACKTEST',
    edits: edit(CONTEXT, 'RUN_KIND.BACKTEST,', ''),
  },
  {
    name: 'LIVE_STATUS_ACCEPTS_THE_HISTORICAL_KINDS',
    edits: edit(CONTEXT, 'kinds: LIVE_RUN_KINDS', 'kinds: SIGNAL_RUN_KINDS'),
  },
  {
    name: 'DECISIONS_AT_IS_IGNORED',
    edits: edit(
      DECISIONS_USE_CASE,
      'input.at === undefined ? input.before : input.at + 1',
      'input.before',
    ),
  },
  {
    name: 'DECISIONS_AT_EXCLUDES_THE_REQUESTED_CANDLE',
    edits: edit(DECISIONS_USE_CASE, 'input.at + 1', 'input.at'),
  },
  {
    name: 'DECISIONS_AT_WITH_CURSOR_IS_ACCEPTED',
    edits: edit(
      DECISIONS_ROUTE,
      'if (query.at !== undefined && query.cursor !== undefined) {',
      'if (query.at === Infinity) {',
    ),
  },
  {
    name: 'HISTORICAL_LAST_CANDLE_BUY_STAYS_PENDING',
    edits: edit(
      DECISION_PAGE,
      'context.run.kind === RUN_KIND.LIVE_PAPER ? context.run.lastCandleTime : undefined',
      'context.run.lastCandleTime',
    ),
  },
  ...OWNER_ACCESS_AND_KIND,
  ...VALIDATION_AND_LIMITS,
  ...ROUNDING_AND_ARITHMETIC,
  ...PHRASES_AND_STATES,
  ...TRADE_PLAN,
];

describe('acompanhamento ao vivo: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(LIVE_STATUS_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(LIVE_STATUS_MUTANT_TARGET));

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
