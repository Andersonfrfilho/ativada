// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  checkProductionRules,
  databaseLongQueryTimeoutSecondsSchema,
  databaseQueryTimeoutSecondsSchema,
  environmentNameSchema,
  httpUrlSchema,
  nonEmptyTextSchema,
  parseEnvironment,
  pemCertificateSchema,
  postgresUrlSchema,
  webSocketUrlSchema,
  workerHeartbeatSecondsSchema,
  z,
  type ProductionProfile,
} from '@ativada/environment';
import { BINANCE_MARKET_DATA_BASE_URL, BINANCE_STREAM_BASE_URL } from '@ativada/market-data-crypto';

import {
  HEARTBEAT_ORDER_EXPECTATION,
  isHeartbeatTimeoutAfterInterval,
  runQueueEnvironmentShape,
} from './run-queue-environment.js';
import { goalEvaluationEnvironmentShape } from './goals/goal-evaluation-environment.js';
import { stallEnvironmentShape } from './runs/stall/stall-environment.js';
import { checkRateLimit, rateLimitEnvironmentShape } from './rate-limit/rate-limit-environment.js';
import {
  checkTranscription,
  transcriptionEnvironmentShape,
} from './transcriptions/transcription-environment.js';
import {
  checkProxyHops,
  DEFAULT_TRUSTED_PROXY_HOPS,
  trustedProxyHopsSchema,
} from './proxy-hops-environment.js';
import { userLimitsEnvironmentShape } from './user-limits-environment.js';
import {
  runExecutionEnvironmentShape,
  walkForwardThreadsSchema,
} from './run-execution-environment.js';
import {
  isPongTimeoutAfterPingInterval,
  PONG_AFTER_PING_EXPECTATION,
  streamEnvironmentShape,
} from './stream/stream-environment.js';

const API_PORT_EXPECTATION = 'inteiro entre 1024 e 65535';
const ORIGIN_LIST_EXPECTATION =
  'lista de origens exatas separadas por vírgula (https://host[:porta], sem caminho nem barra final)';
const URL_LIST_EXPECTATION = 'lista de URLs http:// ou https:// separadas por vírgula';
const TEXT_LIST_EXPECTATION = 'lista de textos separados por vírgula';
const TELEGRAM_SECRET_EXPECTATION = 'texto de 16 a 256 caracteres A-Z, a-z, 0-9, _ ou -';
const TELEGRAM_PAIR_EXPECTATION =
  'TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET devem ser definidos juntos ou omitidos juntos';
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const DEFAULT_API_HOST = '127.0.0.1';

const PRODUCTION_PROFILE: ProductionProfile = {
  urlVariables: [
    'KEYCLOAK_ISSUER',
    'KEYCLOAK_JWKS_URL',
    'KEYCLOAK_TOKEN_URL',
    'KEYCLOAK_LOGOUT_URL',
    'KEYCLOAK_ADMIN_API_URL',
    'TELEGRAM_API_BASE_URL',
    'SESSION_ALLOWED_REDIRECT_URIS',
    'CORS_ALLOWED_ORIGINS',
    'BINANCE_BASE_URL',
  ],
  webSocketUrlVariables: ['BINANCE_STREAM_URL'],
  secretVariables: [
    'KEYCLOAK_SESSION_CLIENT_SECRET',
    'KEYCLOAK_SERVICE_CLIENT_SECRET',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
  ],
  databaseUrlVariable: 'DATABASE_URL',
};

function splitCommaSeparatedList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isExactOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const parsed = new URL(value);
  return parsed.origin === value && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

const textListSchema = z
  .string({ error: TEXT_LIST_EXPECTATION })
  .transform(splitCommaSeparatedList)
  .pipe(z.array(nonEmptyTextSchema).min(1, { error: TEXT_LIST_EXPECTATION }));

const originListSchema = z
  .string({ error: ORIGIN_LIST_EXPECTATION })
  .transform(splitCommaSeparatedList)
  .pipe(
    z
      .array(z.string().refine(isExactOrigin, { error: ORIGIN_LIST_EXPECTATION }))
      .min(1, { error: ORIGIN_LIST_EXPECTATION }),
  );

const urlListSchema = z
  .string({ error: URL_LIST_EXPECTATION })
  .transform(splitCommaSeparatedList)
  .pipe(z.array(httpUrlSchema).min(1, { error: URL_LIST_EXPECTATION }));

export const environmentSchema = z
  .object({
    ENV: environmentNameSchema,
    DATABASE_URL: postgresUrlSchema,
    DATABASE_SSL_ROOT_CERT: pemCertificateSchema.optional(),
    DATABASE_QUERY_TIMEOUT_SECONDS: databaseQueryTimeoutSecondsSchema,
    DATABASE_LONG_QUERY_TIMEOUT_SECONDS: databaseLongQueryTimeoutSecondsSchema,
    WORKER_HEARTBEAT_SECONDS: workerHeartbeatSecondsSchema,
    API_HOST: nonEmptyTextSchema.default(DEFAULT_API_HOST),
    API_PORT: z.coerce
      .number({ error: API_PORT_EXPECTATION })
      .int({ error: API_PORT_EXPECTATION })
      .min(1024, { error: API_PORT_EXPECTATION })
      .max(65535, { error: API_PORT_EXPECTATION }),
    KEYCLOAK_ISSUER: httpUrlSchema,
    KEYCLOAK_JWKS_URL: httpUrlSchema,
    KEYCLOAK_TOKEN_URL: httpUrlSchema,
    KEYCLOAK_LOGOUT_URL: httpUrlSchema,
    KEYCLOAK_SESSION_CLIENT_ID: nonEmptyTextSchema,
    KEYCLOAK_SESSION_CLIENT_SECRET: nonEmptyTextSchema,
    KEYCLOAK_ADMIN_API_URL: httpUrlSchema,
    KEYCLOAK_SERVICE_CLIENT_ID: nonEmptyTextSchema,
    KEYCLOAK_SERVICE_CLIENT_SECRET: nonEmptyTextSchema,
    SESSION_ALLOWED_REDIRECT_URIS: urlListSchema,
    API_AUDIENCE: nonEmptyTextSchema,
    AUTHORIZED_PARTIES: textListSchema,
    CORS_ALLOWED_ORIGINS: originListSchema,
    TRUSTED_PROXY_HOPS: trustedProxyHopsSchema,
    TELEGRAM_BOT_TOKEN: nonEmptyTextSchema.max(256).optional(),
    TELEGRAM_WEBHOOK_SECRET: z
      .string({ error: TELEGRAM_SECRET_EXPECTATION })
      .regex(TELEGRAM_SECRET_PATTERN, { error: TELEGRAM_SECRET_EXPECTATION })
      .optional(),
    TELEGRAM_API_BASE_URL: httpUrlSchema.default(DEFAULT_TELEGRAM_API_BASE_URL),
    ...runQueueEnvironmentShape,
    ...runExecutionEnvironmentShape,
    ...streamEnvironmentShape,
    ...userLimitsEnvironmentShape,
    ...rateLimitEnvironmentShape,
    ...stallEnvironmentShape,
    ...goalEvaluationEnvironmentShape,
    ...transcriptionEnvironmentShape,
    // O ticker público da Binance (T4.7): a hora do servidor (REST) e o stream de `<par>@miniTicker` (WebSocket).
    BINANCE_BASE_URL: httpUrlSchema.default(BINANCE_MARKET_DATA_BASE_URL),
    BINANCE_STREAM_URL: webSocketUrlSchema.default(BINANCE_STREAM_BASE_URL),
  })
  .refine(
    (values) =>
      (values.TELEGRAM_BOT_TOKEN === undefined) === (values.TELEGRAM_WEBHOOK_SECRET === undefined),
    { error: TELEGRAM_PAIR_EXPECTATION, path: ['TELEGRAM_WEBHOOK_SECRET'] },
  )
  .refine(isHeartbeatTimeoutAfterInterval, {
    error: HEARTBEAT_ORDER_EXPECTATION,
    path: ['RUN_HEARTBEAT_TIMEOUT_SECONDS'],
  })
  .refine(isPongTimeoutAfterPingInterval, {
    error: PONG_AFTER_PING_EXPECTATION,
    path: ['STREAM_PONG_TIMEOUT_SECONDS'],
  })
  .superRefine((values, context) => {
    checkProductionRules(values, PRODUCTION_PROFILE, context);
    checkRateLimit(values, context);
    checkTranscription(values, context);
    checkProxyHops(values, context);
  })
  .transform((values) => ({
    ...values,
    TRUSTED_PROXY_HOPS: values.TRUSTED_PROXY_HOPS ?? DEFAULT_TRUSTED_PROXY_HOPS,
  }));

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}

// O que a thread do backtest lê do ambiente que a API lhe passa: a conexão com o banco e o teto do perfil longo.
export const backtestWorkerEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  DATABASE_SSL_ROOT_CERT: pemCertificateSchema.optional(),
  DATABASE_LONG_QUERY_TIMEOUT_SECONDS: databaseLongQueryTimeoutSecondsSchema,
});

export type BacktestWorkerEnvironment = z.infer<typeof backtestWorkerEnvironmentSchema>;

export function loadBacktestWorkerEnvironment(): BacktestWorkerEnvironment {
  return parseEnvironment(backtestWorkerEnvironmentSchema, process.env);
}

// O que a thread do walk-forward lê do ambiente que a API lhe passa: a conexão com o banco, o teto do perfil longo e as threads de busca.
export const walkForwardWorkerEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  DATABASE_SSL_ROOT_CERT: pemCertificateSchema.optional(),
  DATABASE_LONG_QUERY_TIMEOUT_SECONDS: databaseLongQueryTimeoutSecondsSchema,
  WALK_FORWARD_THREADS: walkForwardThreadsSchema,
});

export type WalkForwardWorkerEnvironment = z.infer<typeof walkForwardWorkerEnvironmentSchema>;

export function loadWalkForwardWorkerEnvironment(): WalkForwardWorkerEnvironment {
  return parseEnvironment(walkForwardWorkerEnvironmentSchema, process.env);
}
