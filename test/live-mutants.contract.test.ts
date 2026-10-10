// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  LIVE_RECORDING_COPY,
  removeLiveMutants,
  runLiveMutant,
  type LiveMutantVerdict,
  type LiveSourceEdit,
  type LiveSourceMutant,
} from './fixtures/live/live-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: LiveSourceMutant = { name: 'CONTROL', edits: [] };
const EVALUATOR = 'live-evaluator.ts';
const PASS = 'live-pass.ts';
const STEP = 'live-step.ts';
const CURSOR = 'resolve-live-cursor.ts';
const RESTORE = 'restore-live-state.ts';
const CONTEXT = 'load-live-context.ts';
const EVALUATE = 'evaluate-live-run.ts';
const FAILURE = 'describe-live-failure.ts';
const SCHEDULER = 'live-scheduler.ts';
const ADVANCE = `${LIVE_RECORDING_COPY}/advance-candle.ts`;
const STEP_ALERTS = 'step-alerts.ts';
const BUILD_ALERT = 'build-step-alert.ts';
const HIT_RATE = 'hit-rate.ts';
const PAYLOAD = 'alert-payload.schema.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): LiveSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly LiveSourceMutant[] = [
  {
    name: 'LOST_RUN_KEEPS_BEING_EVALUATED',
    edits: edit(
      EVALUATOR,
      '  // Fica só o que ainda é desta instância: a que outro worker tomou ou que terminou sai da lista.\n  roster.clear();\n',
      '',
    ),
  },
  {
    name: 'HEARTBEAT_NEVER_RENEWED',
    edits: edit(
      EVALUATOR,
      'const renewed = await claims.renewHeartbeat({ claimedBy: instanceId, runIds: [...roster] });',
      'const renewed = { held: [...roster], lost: [] };',
    ),
  },
  {
    name: 'INACTIVE_OWNERS_NOT_CANCELLED',
    edits: edit(
      EVALUATOR,
      '      await dependencies.claims.cancelLiveRunsOfInactiveOwners();\n',
      '',
    ),
  },
  {
    name: 'TAKEOVER_NOT_REPORTED',
    edits: edit(
      EVALUATOR,
      'item.isTakeover ? LIVE_LOG.RUN_TAKEN_OVER',
      'false ? LIVE_LOG.RUN_TAKEN_OVER',
    ),
  },
  {
    name: 'RELEASE_NEVER_CALLED',
    edits: edit(
      EVALUATOR,
      'const released = await dependencies.claims.releaseClaimedRuns({\n        claimedBy: dependencies.instanceId,\n      });',
      'const released = 0;',
    ),
  },
  {
    name: 'ALREADY_PROCESSED_CANDLE_REAPPLIED',
    edits: edit(PASS, '    if (isAlreadyProcessed(cursor.state, candle)) continue;\n', ''),
  },
  {
    name: 'UNCONFIRMED_GAP_NOT_AWAITED',
    edits: edit(PASS, '    if (gap.length > 0) {', '    if (false as boolean) {'),
  },
  {
    name: 'GAP_COUNTS_ONE_EXTRA_CANDLE',
    edits: edit(PASS, 'time < params.openTime;', 'time <= params.openTime;'),
  },
  {
    name: 'GAP_DECLARED_WITHOUT_ASKING_THE_RECOVERY',
    edits: edit(
      PASS,
      'return run.isGapConfirmed({ symbol, timeframe, openTimes }) ? [] : openTimes;',
      'return [];',
    ),
  },
  {
    name: 'RESUME_SKIPS_A_CANDLE',
    edits: edit(
      PASS,
      ': cursor.previousOpenTime + context.durationMilliseconds;',
      ': cursor.previousOpenTime + 2 * context.durationMilliseconds;',
    ),
  },
  {
    name: 'FRESH_START_SKIPS_THE_WARM_UP',
    edits: edit(PASS, '? context.loadStart', '? context.run.periodStart'),
  },
  {
    name: 'CHECKPOINT_AT_THE_WRONG_CANDLE',
    edits: edit(STEP, 'lastCandleTime: candle.openTime,', 'lastCandleTime: candle.closeTime,'),
  },
  {
    name: 'CURSOR_NOT_ADVANCED',
    edits: edit(PASS, '    cursor = stepped.next;\n', ''),
  },
  {
    name: 'REFUSED_COMMIT_KEEPS_STEPPING',
    edits: edit(
      PASS,
      '    if (stepped.commit !== LIVE_COMMIT_OUTCOME.COMMITTED) return settle(stepped.commit, steps);\n',
      '',
    ),
  },
  {
    name: 'OPEN_POSITION_FORGOTTEN_ON_RESUME',
    edits: edit(
      PASS,
      'tracker: createPositionTracker(cursor.state.wallet.position),',
      'tracker: createPositionTracker(null),',
    ),
  },
  {
    name: 'SENTIMENT_QUERIED_UP_TO_THE_BEGINNING',
    edits: edit(PASS, 'until: last.closeTime', 'until: 0'),
  },
  {
    name: 'SENTIMENT_SOURCE_IGNORED',
    edits: edit(
      PASS,
      'createSentimentPicker({ observations, source })',
      "createSentimentPicker({ observations, source: 'outra-fonte' })",
    ),
  },
  {
    name: 'WARM_UP_NOT_REQUIRED',
    edits: edit(
      CURSOR,
      '  if (leadIn.length < context.leadInCandles) {',
      '  if (false as boolean) {',
    ),
  },
  {
    name: 'CHECKPOINT_OF_ANOTHER_RUN_ACCEPTED',
    edits: edit(RESTORE, '  if (!isOwnState) throw unusable();', ''),
  },
  {
    name: 'CHECKPOINT_CANDLE_NOT_CONFERRED',
    edits: edit(
      RESTORE,
      '    state.signal.lastCandleOpenTime === checkpoint.lastCandleTime;',
      '    true;',
    ),
  },
  {
    name: 'HASHES_NOT_RECOMPUTED',
    edits: edit(
      CONTEXT,
      '  if (strategy.configHash !== blueprint.version.configHash || setup.runHash !== run.runHash) {',
      '  if (false as boolean) {',
    ),
  },
  {
    name: 'RUN_KIND_NOT_CHECKED',
    edits: edit(CONTEXT, '  if (run.kind !== RUN_KIND.LIVE_PAPER) {', '  if (false as boolean) {'),
  },
  {
    name: 'ENGINE_VERSION_NOT_CHECKED',
    edits: edit(
      CONTEXT,
      '  if (run.engineVersion !== ENGINE_VERSION || run.metricsVersion !== METRICS_VERSION) {',
      '  if (false as boolean) {',
    ),
  },
  {
    name: 'DATABASE_OUTAGE_FAILS_THE_RUN',
    edits: edit(EVALUATE, '  if (isTransientFailure(error)) {', '  if (false as boolean) {'),
  },
  {
    name: 'ACCOUNT_DELETION_FAILS_THE_RUN',
    edits: edit(EVALUATE, '  if (isEndedByAccountDeletion(error)) {', '  if (false as boolean) {'),
  },
  {
    name: 'FAILURE_NOT_RECORDED',
    edits: edit(EVALUATE, '  await recordFailure(session, errorCode);\n', ''),
  },
  {
    name: 'MISSING_OWNER_NOT_AN_END',
    edits: edit(
      EVALUATE,
      'return { kind: LIVE_PASS_KIND.ENDED, steps: 0 };\n    }\n    const outcome',
      'return { kind: LIVE_PASS_KIND.IDLE, steps: 0 };\n    }\n    const outcome',
    ),
  },
  {
    name: 'DATA_DEFECT_RETRIED_FOREVER',
    edits: edit(FAILURE, "['22', '23', '42']", '[]'),
  },
  {
    name: 'GAP_NOT_DECLARED_TO_THE_ENGINE',
    edits: edit(
      ADVANCE,
      'confirmedGapCandles: gapCandles > 0 ? gapCandles : undefined,',
      'confirmedGapCandles: undefined,',
    ),
  },
  {
    name: 'SCHEDULER_ROUNDS_OVERLAP',
    edits: edit(
      SCHEDULER,
      '    if (!state.isRunning) state.current = drain(dependencies, state);',
      '    state.current = drain(dependencies, state);',
    ),
  },
  {
    name: 'SCHEDULER_STOP_DOES_NOT_WAIT',
    edits: edit(SCHEDULER, '      await state.current;\n', ''),
  },
  {
    name: 'SCHEDULER_RELEASE_ERROR_ESCAPES_THE_SHUTDOWN',
    edits: edit(
      SCHEDULER,
      'dependencies.logger.error(LIVE_LOG.RELEASE_FAILED, { errorName: readErrorName(error) });',
      'throw error;',
    ),
  },
  {
    name: 'SCHEDULER_STOP_DOES_NOT_RELEASE',
    edits: edit(SCHEDULER, '      await releaseBestEffort(dependencies);\n', ''),
  },
  {
    name: 'ALERT_FOR_STALE_CANDLES',
    edits: edit(STEP_ALERTS, '  if (!isFresh(params, alerting)) return [];\n', ''),
  },
  {
    name: 'FRESHNESS_BOUNDARY_EXCLUSIVE',
    edits: edit(
      STEP_ALERTS,
      'return age <= alerting.maxAgeCandles * params.durationMilliseconds;',
      'return age < alerting.maxAgeCandles * params.durationMilliseconds;',
    ),
  },
  {
    name: 'FRESHNESS_MEASURED_FROM_THE_OPEN',
    edits: edit(
      STEP_ALERTS,
      'alerting.now() - params.candle.closeTime',
      'alerting.now() - params.candle.openTime',
    ),
  },
  {
    name: 'HIT_RATE_READ_FOR_EVERY_SIGNAL',
    edits: edit(
      STEP_ALERTS,
      '    pending ??= session.findHitRate()',
      '    pending = session.findHitRate()',
    ),
  },
  {
    name: 'HIT_RATE_FAILURE_BREAKS_THE_STEP',
    edits: edit(STEP_ALERTS, '.findHitRate().catch(() => undefined);', '.findHitRate();'),
  },
  {
    name: 'HIT_RATE_NEVER_ATTACHED',
    edits: edit(BUILD_ALERT, 'hitRate: params.hitRate ?? null,', 'hitRate: null,'),
  },
  {
    name: 'HOLD_RAISES_AN_ALERT',
    edits: edit(
      BUILD_ALERT,
      'return signal !== null && signal.action !== SIGNAL_ACTION.HOLD;',
      'return signal !== null;',
    ),
  },
  {
    name: 'STOP_ABOVE_THE_CLOSE',
    edits: edit(BUILD_ALERT, 'close.minus(order.stopDistance)', 'close.plus(order.stopDistance)'),
  },
  {
    name: 'TARGET_BELOW_THE_CLOSE',
    edits: edit(
      BUILD_ALERT,
      'close.plus(order.targetDistance)',
      'close.minus(order.targetDistance)',
    ),
  },
  {
    name: 'BUY_TAKES_ANY_NEW_ORDER_AS_ITS_ACTION',
    edits: edit(BUILD_ALERT, '? order.purpose === ORDER_PURPOSE.ENTRY', '? true'),
  },
  {
    name: 'SELL_TAKES_THE_PROTECTIVE_ORDER_AS_ITS_ACTION',
    edits: edit(
      BUILD_ALERT,
      ': order.purpose === ORDER_PURPOSE.EXIT && order.type === ORDER_TYPE.MARKET',
      ': order.purpose === ORDER_PURPOSE.EXIT',
    ),
  },
  {
    name: 'REFUSED_ORDER_COUNTS_AS_AN_ACTION',
    edits: edit(BUILD_ALERT, '      order.status === ORDER_STATUS.CREATED &&\n', ''),
  },
  {
    name: 'OPEN_POSITION_LEVELS_DROPPED',
    edits: edit(
      BUILD_ALERT,
      'return { stopPrice: position?.stopPrice ?? null, targetPrice: position?.targetPrice ?? null };',
      'return { stopPrice: null, targetPrice: null };',
    ),
  },
  {
    name: 'ALERT_REASON_REPLACED',
    edits: edit(BUILD_ALERT, 'reason: signal.reason,', "reason: 'sinal',"),
  },
  {
    name: 'ALERT_SIDE_ALWAYS_BUY',
    edits: edit(BUILD_ALERT, 'side: signal.action,', "side: 'BUY',"),
  },
  {
    name: 'ALERT_PRICE_IS_THE_OPEN',
    edits: edit(BUILD_ALERT, 'closePrice: params.candle.close,', 'closePrice: params.candle.open,'),
  },
  {
    name: 'ALERTS_NOT_HANDED_TO_THE_COMMIT',
    edits: edit(
      STEP,
      '    alerts: await collectAlerts(run, { settled, candle }),\n',
      '    alerts: [],\n',
    ),
  },
  {
    name: 'ALERTING_NOT_FORWARDED_TO_THE_PASS',
    edits: edit(EVALUATE, '      alerting: dependencies.alerting,\n', ''),
  },
  {
    name: 'ALERT_PAYLOAD_ACCEPTS_EXTRA_FIELDS',
    edits: edit(
      PAYLOAD,
      'export const alertPayloadSchema = z.strictObject({',
      'export const alertPayloadSchema = z.looseObject({',
    ),
  },
  {
    name: 'HIT_RATE_WITHOUT_VALUE_IS_ACCEPTED',
    edits: edit(
      HIT_RATE,
      'if (!parsed.success || parsed.data.winRate.value === null) return undefined;',
      'if (!parsed.success) return undefined;',
    ),
  },
  {
    name: 'HIT_RATE_TRADES_DROPPED',
    edits: edit(HIT_RATE, 'trades: parsed.data.trades }', 'trades: 0 }'),
  },
];

describe('mutantes da simulação ao vivo', () => {
  const verdicts = new Map<string, LiveMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runLiveMutant(next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeLiveMutants);

  test('the control copy (no edit) passes the same tests: the harness is sound', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.problem).toBeUndefined();
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });
});
