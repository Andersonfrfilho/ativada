// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AlertRepository, ClaimedAlert } from '@ativada/database';
import { readErrorName } from '@ativada/environment';

import { ALERT_SIDE } from '@ativada/database';
import {
  alertPayloadSchema,
  goalAlertPayloadSchema,
  priceAlertPayloadSchema,
} from '../live/alert-payload.schema.js';
import type { WorkerLogger } from '../logging/worker-logger.js';
import {
  ALERT_BACKOFF_BASE_MILLISECONDS,
  ALERT_BATCH_SIZE,
  ALERT_DAILY_WINDOW_MILLISECONDS,
  ALERT_ERROR_CODE,
  ALERT_LEASE_MILLISECONDS,
  ALERT_LOG,
  ALERT_MAX_ATTEMPTS,
  ALERT_RETRY_AFTER_CAP_MILLISECONDS,
} from './alerts.constant.js';
import { formatAlertMessage } from './format-alert-message.js';
import { formatGoalAlertMessage } from './format-goal-alert-message.js';
import { formatPriceAlertMessage } from './format-price-alert-message.js';
import type { TelegramClient, TelegramSendResult } from './telegram-client.js';

const BACKOFF_FACTOR = 2;

export type AlertDispatchSummary = {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  readonly skipped: number;
  readonly errored: number;
};

export type AlertDispatcher = { readonly tick: () => Promise<AlertDispatchSummary> };

export type AlertDispatcherDependencies = {
  readonly alerts: AlertRepository;
  readonly client: TelegramClient;
  readonly logger: WorkerLogger;
  readonly now: () => number;
  // Mensagens por usuário nas últimas 24 horas: acima disso o alerta é dispensado em vez de virar enxurrada no chat.
  readonly dailyLimitPerUser: number;
};

type Outcome = Exclude<keyof AlertDispatchSummary, 'claimed'>;

// Espera crescente (30 s, 60 s, 120 s, ...); o `retry_after` do Telegram só PODE aumentá-la, e há um teto.
export function computeRetryDelay(params: {
  readonly attempts: number;
  readonly retryAfterMilliseconds: number | undefined;
}): number {
  const backoff = ALERT_BACKOFF_BASE_MILLISECONDS * BACKOFF_FACTOR ** (params.attempts - 1);
  const wanted = Math.max(backoff, params.retryAfterMilliseconds ?? 0);
  return Math.min(wanted, ALERT_RETRY_AFTER_CAP_MILLISECONDS);
}

type Context = AlertDispatcherDependencies & { readonly alert: ClaimedAlert };

async function settleFailure(
  context: Context,
  result: Exclude<TelegramSendResult, { kind: 'sent' }>,
): Promise<Outcome> {
  const { alerts, alert, logger } = context;
  const fields = { alertId: alert.id, attempts: alert.attempts, code: result.code };
  if (result.kind !== 'retry' || alert.attempts >= ALERT_MAX_ATTEMPTS) {
    await alerts.markFailed({ alertId: alert.id, errorCode: result.code });
    logger.warn(ALERT_LOG.GAVE_UP, fields);
    return 'failed';
  }
  const delay = computeRetryDelay({
    attempts: alert.attempts,
    retryAfterMilliseconds: result.retryAfterMilliseconds,
  });
  const nextAttemptAt = new Date(context.now() + delay);
  await alerts.reschedule({ alertId: alert.id, nextAttemptAt, errorCode: result.code });
  logger.warn(ALERT_LOG.RETRY_SCHEDULED, fields);
  return 'retried';
}

// O texto do alerta, pelo conteúdo gravado (sinal, desfecho de meta ou disparo de preço); conteúdo que não bate com o esquema não é enviado.
function renderAlertText(alert: ClaimedAlert): string | undefined {
  if (alert.side === ALERT_SIDE.GOAL) {
    const goal = goalAlertPayloadSchema.safeParse(alert.payload);
    return goal.success ? formatGoalAlertMessage(goal.data) : undefined;
  }
  if (alert.side === ALERT_SIDE.PRICE) {
    const price = priceAlertPayloadSchema.safeParse(alert.payload);
    return price.success ? formatPriceAlertMessage(price.data) : undefined;
  }
  const signal = alertPayloadSchema.safeParse(alert.payload);
  return signal.success
    ? formatAlertMessage({ side: alert.side, payload: signal.data })
    : undefined;
}

async function skip(context: Context, errorCode: string): Promise<Outcome> {
  const { alerts, alert, logger } = context;
  await alerts.markSkipped({ alertId: alert.id, errorCode });
  logger.info(ALERT_LOG.SKIPPED, { alertId: alert.id, code: errorCode });
  return 'skipped';
}

async function hasReachedDailyLimit(context: Context): Promise<boolean> {
  const since = new Date(context.now() - ALERT_DAILY_WINDOW_MILLISECONDS);
  const sent = await context.alerts.countSentSince({ userId: context.alert.userId, since });
  return sent >= context.dailyLimitPerUser;
}

async function deliver(context: Context): Promise<Outcome> {
  const { alerts, alert, client, logger } = context;
  if (alert.chatId === undefined) return skip(context, ALERT_ERROR_CODE.NO_LINK);
  if (await hasReachedDailyLimit(context)) return skip(context, ALERT_ERROR_CODE.DAILY_LIMIT);
  const text = renderAlertText(alert);
  if (text === undefined) {
    await alerts.markFailed({ alertId: alert.id, errorCode: ALERT_ERROR_CODE.BAD_PAYLOAD });
    logger.warn(ALERT_LOG.GAVE_UP, { alertId: alert.id, code: ALERT_ERROR_CODE.BAD_PAYLOAD });
    return 'failed';
  }
  const result = await client.sendMessage({ chatId: alert.chatId, text });
  if (result.kind !== 'sent') return settleFailure(context, result);
  await alerts.markSent({ alertId: alert.id, now: new Date(context.now()) });
  logger.info(ALERT_LOG.SENT, { alertId: alert.id, attempts: alert.attempts });
  return 'sent';
}

// Um alerta que dá erro (banco, por exemplo) não derruba os outros do lote nem o ciclo: o arrendamento vence e ele volta.
async function deliverSafely(context: Context): Promise<Outcome> {
  try {
    return await deliver(context);
  } catch (error: unknown) {
    context.logger.error(ALERT_LOG.DELIVERY_ERROR, {
      alertId: context.alert.id,
      errorName: readErrorName(error),
    });
    return 'errored';
  }
}

export function createAlertDispatcher(dependencies: AlertDispatcherDependencies): AlertDispatcher {
  return {
    tick: async (): Promise<AlertDispatchSummary> => {
      const claimed = await dependencies.alerts.claimDue({
        now: new Date(dependencies.now()),
        limit: ALERT_BATCH_SIZE,
        leaseMilliseconds: ALERT_LEASE_MILLISECONDS,
        maximumAttempts: ALERT_MAX_ATTEMPTS,
      });
      const counts = { sent: 0, retried: 0, failed: 0, skipped: 0, errored: 0 };
      // Em sequência de propósito: o Telegram limita mensagens por segundo, e a ordem dos candles é a ordem do aviso.
      const ordered = [...claimed].sort((first, second) => first.candleTime - second.candleTime);
      for (const alert of ordered) counts[await deliverSafely({ ...dependencies, alert })] += 1;
      return { claimed: claimed.length, ...counts };
    },
  };
}
