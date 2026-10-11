// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  removeAlertsMutants,
  runAlertsMutant,
  type AlertsMutantVerdict,
  type AlertsSourceEdit,
  type AlertsSourceMutant,
} from './fixtures/telegram/alerts-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: AlertsSourceMutant = { name: 'CONTROL', edits: [] };
const CLIENT = 'telegram-client.ts';
const FORMAT = 'format-alert-message.ts';
const DISPATCHER = 'alert-dispatcher.ts';
const SCHEDULER = 'alert-scheduler.ts';
const CONSTANTS = 'alerts.constant.ts';
const GOAL_FORMAT = 'format-goal-alert-message.ts';
const PERCENT = 'format-percent.ts';
const PAYLOAD_SCHEMA = 'alert-payload.schema.ts';
const PRICE_FORMAT = 'format-price-alert-message.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): AlertsSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly AlertsSourceMutant[] = [
  {
    name: 'FIVE_XX_REJECTED_FOR_GOOD',
    edits: edit(
      CLIENT,
      '  if (status >= HTTP_SERVER_ERROR_FLOOR) return retry(ALERT_ERROR_CODE.SERVER_ERROR);\n',
      '',
    ),
  },
  {
    name: 'RETRY_AFTER_IGNORED',
    edits: edit(CLIENT, 'body?.parameters?.retry_after', 'undefined'),
  },
  {
    name: 'RETRY_AFTER_KEPT_IN_SECONDS',
    edits: edit(
      CLIENT,
      'retryAfterSeconds === undefined ? undefined : retryAfterSeconds * MILLISECONDS_PER_SECOND;',
      'retryAfterSeconds;',
    ),
  },
  {
    name: 'OK_FALSE_COUNTS_AS_SENT',
    edits: edit(
      CLIENT,
      "return body?.ok === true ? { kind: 'sent' } : retry(ALERT_ERROR_CODE.BAD_RESPONSE);",
      "return { kind: 'sent' };",
    ),
  },
  {
    name: 'REDIRECT_IS_FOLLOWED',
    edits: edit(CLIENT, "          redirect: 'error',\n", ''),
  },
  {
    name: 'DEFINITIVE_REFUSAL_RETRIED',
    edits: edit(
      CLIENT,
      "return { kind: 'rejected', code: `http_${status}` };",
      'return retry(`http_${status}`);',
    ),
  },
  {
    name: 'NETWORK_ERROR_TEXT_LEAKS',
    edits: edit(
      CLIENT,
      '} catch {\n        return retry(ALERT_ERROR_CODE.NETWORK);',
      '} catch (error: unknown) {\n        return retry(String(error));',
    ),
  },
  {
    name: 'NO_REQUEST_TIMEOUT',
    edits: edit(CLIENT, '          signal: AbortSignal.timeout(timeout),\n', ''),
  },
  {
    name: 'TRAILING_SLASHES_KEPT',
    edits: edit(CLIENT, "settings.apiBaseUrl.replace(TRAILING_SLASHES, '')", 'settings.apiBaseUrl'),
  },
  {
    name: 'SIDE_LABELS_SWAPPED',
    edits: edit(
      FORMAT,
      "[ALERT_SIDE.BUY]: 'COMPRA',\n  [ALERT_SIDE.SELL]: 'VENDA',",
      "[ALERT_SIDE.BUY]: 'VENDA',\n  [ALERT_SIDE.SELL]: 'COMPRA',",
    ),
  },
  {
    name: 'HIT_RATE_NOT_SCALED_TO_PERCENT',
    edits: edit(PERCENT, 'const PERCENT_FACTOR = 100;', 'const PERCENT_FACTOR = 1;'),
  },
  {
    name: 'HIT_RATE_TRUNCATED_INSTEAD_OF_ROUNDED',
    edits: edit(PERCENT, 'EngineDecimal.ROUND_HALF_UP', 'EngineDecimal.ROUND_DOWN'),
  },
  {
    name: 'MISSING_HIT_RATE_SHOWN_AS_ZERO',
    edits: edit(
      FORMAT,
      'if (hitRate === null) return NO_HIT_RATE;',
      "if (hitRate === null) return 'Acerto histórico (fora da amostra): 0,0% em 0 operações.';",
    ),
  },
  {
    name: 'LONG_REASON_BREAKS_THE_TELEGRAM_LIMIT',
    edits: edit(
      FORMAT,
      '  if (params.reason.length <= room) return params.reason;\n',
      '  return params.reason;\n',
    ),
  },
  {
    name: 'UNLINKED_ALERT_IS_SENT_ANYWAY',
    edits: edit(
      DISPATCHER,
      '  if (alert.chatId === undefined) return skip(',
      '  if ((alert.chatId as string | undefined) === "nunca") return skip(',
    ),
  },
  {
    name: 'RETRIES_FOREVER',
    edits: edit(DISPATCHER, 'alert.attempts >= ALERT_MAX_ATTEMPTS', 'false'),
  },
  {
    name: 'REFUSAL_IS_RETRIED',
    edits: edit(DISPATCHER, "result.kind !== 'retry' || alert.attempts", 'alert.attempts'),
  },
  {
    name: 'BACKOFF_STAYS_FLAT',
    edits: edit(DISPATCHER, 'BACKOFF_FACTOR ** (params.attempts - 1)', '1'),
  },
  {
    name: 'RETRY_AFTER_SHORTENS_THE_BACKOFF',
    edits: edit(
      DISPATCHER,
      'Math.max(backoff, params.retryAfterMilliseconds ?? 0)',
      'params.retryAfterMilliseconds ?? backoff',
    ),
  },
  {
    name: 'WAIT_WITHOUT_CEILING',
    edits: edit(
      DISPATCHER,
      'return Math.min(wanted, ALERT_RETRY_AFTER_CAP_MILLISECONDS);',
      'return wanted;',
    ),
  },
  {
    name: 'SENT_ALERT_NOT_MARKED',
    edits: edit(
      DISPATCHER,
      '  await alerts.markSent({ alertId: alert.id, now: new Date(context.now()) });\n',
      '',
    ),
  },
  {
    name: 'ONE_ERROR_ABORTS_THE_BATCH',
    edits: edit(DISPATCHER, '    return await deliver(context);', '    return deliver(context);'),
  },
  {
    name: 'CANDLE_ORDER_IGNORED',
    edits: edit(
      DISPATCHER,
      '[...claimed].sort((first, second) => first.candleTime - second.candleTime)',
      '[...claimed]',
    ),
  },
  {
    name: 'PAYLOAD_NOT_VALIDATED',
    edits: edit(
      DISPATCHER,
      'const signal = alertPayloadSchema.safeParse(alert.payload);',
      'const signal = { success: true, data: alert.payload } as never as ReturnType<typeof alertPayloadSchema.safeParse>;',
    ),
  },
  {
    name: 'CHAT_WRITTEN_TO_THE_LOG',
    edits: edit(
      DISPATCHER,
      'logger.info(ALERT_LOG.SENT, { alertId: alert.id, attempts: alert.attempts });',
      'logger.info(ALERT_LOG.SENT, { alertId: alert.id, chat: alert.chatId ?? "" });',
    ),
  },
  {
    name: 'RETRY_CODE_NOT_RECORDED',
    edits: edit(
      DISPATCHER,
      'await alerts.reschedule({ alertId: alert.id, nextAttemptAt, errorCode: result.code });',
      "await alerts.reschedule({ alertId: alert.id, nextAttemptAt, errorCode: 'x' });",
    ),
  },
  {
    name: 'FIFTH_FAILURE_STILL_RETRIES_BECAUSE_THE_LIMIT_IS_SIX',
    edits: edit(
      CONSTANTS,
      'export const ALERT_MAX_ATTEMPTS = 5;',
      'export const ALERT_MAX_ATTEMPTS = 6;',
    ),
  },
  {
    name: 'BACKOFF_BASE_TENFOLD_SHORTER',
    edits: edit(
      CONSTANTS,
      'ALERT_BACKOFF_BASE_MILLISECONDS = 30_000',
      'ALERT_BACKOFF_BASE_MILLISECONDS = 3_000',
    ),
  },
  {
    name: 'RETRY_AFTER_CEILING_TENFOLD_HIGHER',
    edits: edit(
      CONSTANTS,
      'ALERT_RETRY_AFTER_CAP_MILLISECONDS = 900_000',
      'ALERT_RETRY_AFTER_CAP_MILLISECONDS = 9_000_000',
    ),
  },
  {
    name: 'LEASE_SHORTER_THAN_THE_BATCH',
    edits: edit(
      CONSTANTS,
      'ALERT_LEASE_MILLISECONDS = 120_000',
      'ALERT_LEASE_MILLISECONDS = 1_000',
    ),
  },
  {
    name: 'SCHEDULER_CYCLES_OVERLAP',
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
    name: 'SCHEDULER_LOGS_THE_ERROR_MESSAGE',
    edits: edit(
      SCHEDULER,
      'dependencies.logger.error(ALERT_LOG.DISPATCH_FAILED, { errorName: readErrorName(error) });',
      'dependencies.logger.error(ALERT_LOG.DISPATCH_FAILED, { errorName: String(error) });',
    ),
  },
  {
    name: 'SCHEDULER_RUNS_AFTER_STOP',
    edits: edit(
      SCHEDULER,
      'while (state.isRequested && !state.isStopped) {',
      'while (state.isRequested) {',
    ),
  },
  {
    name: 'GOAL_ALERT_SENT_WITH_THE_SIGNAL_TEXT',
    edits: edit(DISPATCHER, 'if (alert.side === ALERT_SIDE.GOAL) {', 'if (false as boolean) {'),
  },
  {
    name: 'GOAL_PAYLOAD_NOT_VALIDATED',
    edits: edit(
      DISPATCHER,
      'return goal.success ? formatGoalAlertMessage(goal.data) : undefined;',
      'return formatGoalAlertMessage(alert.payload as never);',
    ),
  },
  {
    name: 'CLAIM_CEILING_NOT_FORWARDED',
    edits: edit(
      DISPATCHER,
      'maximumAttempts: ALERT_MAX_ATTEMPTS,',
      'maximumAttempts: Number.MAX_SAFE_INTEGER,',
    ),
  },
  {
    name: 'HIT_RATE_NOT_A_DECIMAL',
    edits: edit(
      PAYLOAD_SCHEMA,
      'winRate: z.string().regex(DECIMAL_TEXT_PATTERN)',
      'winRate: z.string().min(1)',
    ),
  },
  {
    name: 'GOAL_OUTCOME_UNKNOWN_ACCEPTED',
    edits: edit(PAYLOAD_SCHEMA, 'outcome: z.enum(GOAL_RUN_OUTCOME),', 'outcome: z.string(),'),
  },
  {
    name: 'GOAL_PAYLOAD_ACCEPTS_EXTRA_FIELDS',
    edits: edit(
      PAYLOAD_SCHEMA,
      'export const goalAlertPayloadSchema = z.strictObject({',
      'export const goalAlertPayloadSchema = z.object({',
    ),
  },
  {
    name: 'GOAL_RESULT_WITHOUT_SIGN',
    edits: edit(
      PERCENT,
      "return text.startsWith('-') || new EngineDecimal(rate).isZero() ? text : `+${text}`;",
      'return text;',
    ),
  },
  {
    name: 'GOAL_ZERO_RESULT_WITH_PLUS',
    edits: edit(
      PERCENT,
      "text.startsWith('-') || new EngineDecimal(rate).isZero() ? text",
      "text.startsWith('-') ? text",
    ),
  },
  {
    name: 'GOAL_TITLES_SWAPPED',
    edits: edit(
      GOAL_FORMAT,
      "[GOAL_RUN_OUTCOME.REACHED]: 'Meta atingida',",
      "[GOAL_RUN_OUTCOME.REACHED]: 'Perda máxima atingida',",
    ),
  },
  {
    name: 'GOAL_RESULT_VERB_SWAPPED',
    edits: edit(
      GOAL_FORMAT,
      "[GOAL_RUN_OUTCOME.STOPPED]: 'A simulação caiu a',",
      "[GOAL_RUN_OUTCOME.STOPPED]: 'A simulação chegou a',",
    ),
  },
  {
    name: 'GOAL_WITHOUT_THE_DISCLAIMER',
    edits: edit(
      GOAL_FORMAT,
      '    CLOSING_LINE,\n    DISCLAIMER,\n  ].join',
      '    CLOSING_LINE,\n  ].join',
    ),
  },
  {
    name: 'GOAL_TARGET_SHOWN_AS_LOSS',
    edits: edit(
      GOAL_FORMAT,
      'Meta: ${formatPercent(payload.targetRate)} em ${payload.horizonDays} dias, perda máxima de ${formatPercent(payload.maxLossRate)}.',
      'Meta: ${formatPercent(payload.maxLossRate)} em ${payload.horizonDays} dias, perda máxima de ${formatPercent(payload.targetRate)}.',
    ),
  },
  {
    name: 'PRICE_VERBS_SWAPPED',
    edits: edit(
      PRICE_FORMAT,
      "{ above: 'subiu acima de', below: 'caiu abaixo de' }",
      "{ above: 'caiu abaixo de', below: 'subiu acima de' }",
    ),
  },
  {
    name: 'PRICE_THRESHOLD_AND_PRICE_SWAPPED',
    edits: edit(
      PRICE_FORMAT,
      '${payload.threshold} (agora ${payload.price})',
      '${payload.price} (agora ${payload.threshold})',
    ),
  },
  {
    name: 'PRICE_WITHOUT_THE_DISCLAIMER',
    edits: edit(PRICE_FORMAT, '    DISCLAIMER,\n  ].join', '  ].join'),
  },
  {
    name: 'PRICE_SIDE_USES_THE_SIGNAL_TEXT',
    edits: edit(DISPATCHER, 'if (alert.side === ALERT_SIDE.PRICE) {', 'if (false) {'),
  },
  {
    name: 'PRICE_PAYLOAD_ACCEPTS_EXTRA_FIELDS',
    edits: edit(
      PAYLOAD_SCHEMA,
      'export const priceAlertPayloadSchema = z.strictObject({',
      'export const priceAlertPayloadSchema = z.object({',
    ),
  },
  {
    name: 'PRICE_THRESHOLD_NOT_A_DECIMAL',
    edits: edit(
      PAYLOAD_SCHEMA,
      'threshold: z.string().regex(DECIMAL_TEXT_PATTERN)',
      'threshold: z.string()',
    ),
  },
  {
    name: 'PRICE_VALUE_NOT_A_DECIMAL',
    edits: edit(
      PAYLOAD_SCHEMA,
      'price: z.string().regex(DECIMAL_TEXT_PATTERN)',
      'price: z.string()',
    ),
  },
  {
    name: 'PRICE_DIRECTION_ANY_TEXT',
    edits: edit(PAYLOAD_SCHEMA, "direction: z.enum(['above', 'below']),", 'direction: z.string(),'),
  },
];

describe('mutantes do despacho de alertas no Telegram', () => {
  const verdicts = new Map<string, AlertsMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runAlertsMutant(next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeAlertsMutants);

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
