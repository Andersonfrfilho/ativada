// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  checkProductionRules,
  databaseQueryTimeoutSecondsSchema,
  environmentNameSchema,
  httpUrlSchema,
  nonEmptyTextSchema,
  parseEnvironment,
  pemCertificateSchema,
  postgresUrlSchema,
  webSocketUrlSchema,
  z,
  type ProductionProfile,
} from '@ativada/environment';
import {
  BINANCE_MARKET_DATA_BASE_URL,
  BINANCE_STREAM_BASE_URL,
  marketEnvironmentShape,
} from '@ativada/market-data-crypto';

import {
  ALERT_DEFAULT_DAILY_LIMIT_PER_USER,
  ALERT_DEFAULT_POLL_SECONDS,
  ALERT_MAXIMUM_DAILY_LIMIT_PER_USER,
  ALERT_MAXIMUM_POLL_SECONDS,
  ALERT_MINIMUM_DAILY_LIMIT_PER_USER,
  ALERT_MINIMUM_POLL_SECONDS,
  DEFAULT_TELEGRAM_API_BASE_URL,
} from './alerts/alerts.constant.js';
import {
  LIVE_DEFAULT_GAP_CONFIRM_RECOVERIES,
  LIVE_DEFAULT_HEARTBEAT_TIMEOUT_SECONDS,
  LIVE_MAXIMUM_GAP_CONFIRM_RECOVERIES,
  LIVE_DEFAULT_POLL_SECONDS,
  LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS,
  LIVE_MAXIMUM_POLL_SECONDS,
  LIVE_MINIMUM_GAP_CONFIRM_RECOVERIES,
  LIVE_MINIMUM_HEARTBEAT_TIMEOUT_SECONDS,
  LIVE_MINIMUM_POLL_SECONDS,
} from './live/live.constant.js';
import {
  DEFAULT_STREAM_GAP_CHECK_MINUTES,
  DEFAULT_STREAM_GAP_LOOKBACK_HOURS,
  DEFAULT_STREAM_STALE_SECONDS,
  MAXIMUM_STREAM_GAP_CHECK_MINUTES,
  MAXIMUM_STREAM_GAP_LOOKBACK_HOURS,
  MAXIMUM_STREAM_STALE_SECONDS,
  MINIMUM_STREAM_GAP_CHECK_MINUTES,
  MINIMUM_STREAM_GAP_LOOKBACK_HOURS,
  MINIMUM_STREAM_STALE_SECONDS,
  WORKER_HEARTBEAT_DEFAULT_SECONDS,
  WORKER_HEARTBEAT_MAXIMUM_SECONDS,
  WORKER_HEARTBEAT_MINIMUM_SECONDS,
} from './worker.constant.js';

const STALE_EXPECTATION = `inteiro de ${MINIMUM_STREAM_STALE_SECONDS} a ${MAXIMUM_STREAM_STALE_SECONDS}`;
const LOOKBACK_EXPECTATION = `inteiro de ${MINIMUM_STREAM_GAP_LOOKBACK_HOURS} a ${MAXIMUM_STREAM_GAP_LOOKBACK_HOURS}`;
const CHECK_EXPECTATION = `inteiro de ${MINIMUM_STREAM_GAP_CHECK_MINUTES} a ${MAXIMUM_STREAM_GAP_CHECK_MINUTES}`;
const HEARTBEAT_EXPECTATION = `inteiro de ${WORKER_HEARTBEAT_MINIMUM_SECONDS} a ${WORKER_HEARTBEAT_MAXIMUM_SECONDS}`;
const LIVE_POLL_EXPECTATION = `inteiro de ${LIVE_MINIMUM_POLL_SECONDS} a ${LIVE_MAXIMUM_POLL_SECONDS}`;
const LIVE_TIMEOUT_EXPECTATION = `inteiro de ${LIVE_MINIMUM_HEARTBEAT_TIMEOUT_SECONDS} a ${LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS}, maior que LIVE_POLL_SECONDS`;

const LIVE_GAP_EXPECTATION = `inteiro de ${LIVE_MINIMUM_GAP_CONFIRM_RECOVERIES} a ${LIVE_MAXIMUM_GAP_CONFIRM_RECOVERIES}`;
const ALERT_POLL_EXPECTATION = `inteiro de ${ALERT_MINIMUM_POLL_SECONDS} a ${ALERT_MAXIMUM_POLL_SECONDS}`;
const ALERT_DAILY_LIMIT_EXPECTATION = `inteiro de ${ALERT_MINIMUM_DAILY_LIMIT_PER_USER} a ${ALERT_MAXIMUM_DAILY_LIMIT_PER_USER}`;
const MAXIMUM_TELEGRAM_TOKEN_LENGTH = 256;

const PRODUCTION_PROFILE: ProductionProfile = {
  urlVariables: ['BINANCE_BASE_URL', 'TELEGRAM_API_BASE_URL'],
  webSocketUrlVariables: ['BINANCE_STREAM_URL'],
  secretVariables: ['TELEGRAM_BOT_TOKEN'],
  databaseUrlVariable: 'DATABASE_URL',
};

export const environmentSchema = z
  .object({
    ENV: environmentNameSchema,
    DATABASE_URL: postgresUrlSchema,
    DATABASE_SSL_ROOT_CERT: pemCertificateSchema.optional(),
    DATABASE_QUERY_TIMEOUT_SECONDS: databaseQueryTimeoutSecondsSchema,
    ...marketEnvironmentShape,
    BINANCE_BASE_URL: httpUrlSchema.default(BINANCE_MARKET_DATA_BASE_URL),
    BINANCE_STREAM_URL: webSocketUrlSchema.default(BINANCE_STREAM_BASE_URL),
    STREAM_STALE_SECONDS: z.coerce
      .number({ error: STALE_EXPECTATION })
      .int({ error: STALE_EXPECTATION })
      .min(MINIMUM_STREAM_STALE_SECONDS, { error: STALE_EXPECTATION })
      .max(MAXIMUM_STREAM_STALE_SECONDS, { error: STALE_EXPECTATION })
      .default(DEFAULT_STREAM_STALE_SECONDS),
    STREAM_GAP_LOOKBACK_HOURS: z.coerce
      .number({ error: LOOKBACK_EXPECTATION })
      .int({ error: LOOKBACK_EXPECTATION })
      .min(MINIMUM_STREAM_GAP_LOOKBACK_HOURS, { error: LOOKBACK_EXPECTATION })
      .max(MAXIMUM_STREAM_GAP_LOOKBACK_HOURS, { error: LOOKBACK_EXPECTATION })
      .default(DEFAULT_STREAM_GAP_LOOKBACK_HOURS),
    STREAM_GAP_CHECK_MINUTES: z.coerce
      .number({ error: CHECK_EXPECTATION })
      .int({ error: CHECK_EXPECTATION })
      .min(MINIMUM_STREAM_GAP_CHECK_MINUTES, { error: CHECK_EXPECTATION })
      .max(MAXIMUM_STREAM_GAP_CHECK_MINUTES, { error: CHECK_EXPECTATION })
      .default(DEFAULT_STREAM_GAP_CHECK_MINUTES),
    WORKER_HEARTBEAT_SECONDS: z.coerce
      .number({ error: HEARTBEAT_EXPECTATION })
      .int({ error: HEARTBEAT_EXPECTATION })
      .min(WORKER_HEARTBEAT_MINIMUM_SECONDS, { error: HEARTBEAT_EXPECTATION })
      .max(WORKER_HEARTBEAT_MAXIMUM_SECONDS, { error: HEARTBEAT_EXPECTATION })
      .default(WORKER_HEARTBEAT_DEFAULT_SECONDS),
    LIVE_POLL_SECONDS: z.coerce
      .number({ error: LIVE_POLL_EXPECTATION })
      .int({ error: LIVE_POLL_EXPECTATION })
      .min(LIVE_MINIMUM_POLL_SECONDS, { error: LIVE_POLL_EXPECTATION })
      .max(LIVE_MAXIMUM_POLL_SECONDS, { error: LIVE_POLL_EXPECTATION })
      .default(LIVE_DEFAULT_POLL_SECONDS),
    LIVE_HEARTBEAT_TIMEOUT_SECONDS: z.coerce
      .number({ error: LIVE_TIMEOUT_EXPECTATION })
      .int({ error: LIVE_TIMEOUT_EXPECTATION })
      .min(LIVE_MINIMUM_HEARTBEAT_TIMEOUT_SECONDS, { error: LIVE_TIMEOUT_EXPECTATION })
      .max(LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS, { error: LIVE_TIMEOUT_EXPECTATION })
      .default(LIVE_DEFAULT_HEARTBEAT_TIMEOUT_SECONDS),
    // Sem token os alertas ficam desligados: o passo ao vivo não enfileira nada e nenhum despachante sobe.
    LIVE_GAP_CONFIRM_RECOVERIES: z.coerce
      .number({ error: LIVE_GAP_EXPECTATION })
      .int({ error: LIVE_GAP_EXPECTATION })
      .min(LIVE_MINIMUM_GAP_CONFIRM_RECOVERIES, { error: LIVE_GAP_EXPECTATION })
      .max(LIVE_MAXIMUM_GAP_CONFIRM_RECOVERIES, { error: LIVE_GAP_EXPECTATION })
      .default(LIVE_DEFAULT_GAP_CONFIRM_RECOVERIES),
    TELEGRAM_BOT_TOKEN: nonEmptyTextSchema.max(MAXIMUM_TELEGRAM_TOKEN_LENGTH).optional(),
    TELEGRAM_API_BASE_URL: httpUrlSchema.default(DEFAULT_TELEGRAM_API_BASE_URL),
    ALERT_POLL_SECONDS: z.coerce
      .number({ error: ALERT_POLL_EXPECTATION })
      .int({ error: ALERT_POLL_EXPECTATION })
      .min(ALERT_MINIMUM_POLL_SECONDS, { error: ALERT_POLL_EXPECTATION })
      .max(ALERT_MAXIMUM_POLL_SECONDS, { error: ALERT_POLL_EXPECTATION })
      .default(ALERT_DEFAULT_POLL_SECONDS),
    // Mensagens do Telegram por usuário nas últimas 24 horas: acima disso o alerta é dispensado (volume de aviso, não de dado).
    ALERT_TELEGRAM_DAILY_LIMIT_PER_USER: z.coerce
      .number({ error: ALERT_DAILY_LIMIT_EXPECTATION })
      .int({ error: ALERT_DAILY_LIMIT_EXPECTATION })
      .min(ALERT_MINIMUM_DAILY_LIMIT_PER_USER, { error: ALERT_DAILY_LIMIT_EXPECTATION })
      .max(ALERT_MAXIMUM_DAILY_LIMIT_PER_USER, { error: ALERT_DAILY_LIMIT_EXPECTATION })
      .default(ALERT_DEFAULT_DAILY_LIMIT_PER_USER),
  })
  .superRefine((values, context) => {
    checkProductionRules(values, PRODUCTION_PROFILE, context);
    if (values.LIVE_HEARTBEAT_TIMEOUT_SECONDS <= values.LIVE_POLL_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['LIVE_HEARTBEAT_TIMEOUT_SECONDS'],
        message: LIVE_TIMEOUT_EXPECTATION,
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}
