// Copyright (c) 2026 Ada Technology. All rights reserved.
import { marketEnvironmentShape } from '@cryptoada/market-data';
import {
  checkProductionRules,
  environmentNameSchema,
  httpUrlSchema,
  nonEmptyTextSchema,
  parseEnvironment,
  postgresUrlSchema,
  PRODUCTION_ENVIRONMENT,
  z,
  type ProductionProfile,
} from '@cryptoada/environment';

import {
  HEARTBEAT_ORDER_EXPECTATION,
  isHeartbeatTimeoutAfterInterval,
  runQueueEnvironmentShape,
} from './run-queue-environment.js';

const API_PORT_EXPECTATION = 'inteiro entre 1024 e 65535';
const ORIGIN_LIST_EXPECTATION =
  'lista de origens exatas separadas por vírgula (https://host[:porta], sem caminho nem barra final)';
const URL_LIST_EXPECTATION = 'lista de URLs http:// ou https:// separadas por vírgula';
const TEXT_LIST_EXPECTATION = 'lista de textos separados por vírgula';
const BACKTEST_TIMEOUT_EXPECTATION = 'inteiro de segundos entre 5 e 86400';
const MIN_BACKTEST_TIMEOUT_SECONDS = 5;
const MAX_BACKTEST_TIMEOUT_SECONDS = 86_400;
const DEFAULT_BACKTEST_TIMEOUT_SECONDS = 900;
const WALK_FORWARD_TIMEOUT_EXPECTATION = 'inteiro de segundos entre 5 e 86400';
const DEFAULT_WALK_FORWARD_TIMEOUT_SECONDS = 3_600;
const WALK_FORWARD_THREADS_EXPECTATION = 'inteiro entre 1 e 8';
const MIN_WALK_FORWARD_THREADS = 1;
const MAX_WALK_FORWARD_THREADS = 8;
const DEFAULT_WALK_FORWARD_THREADS = 2;
const PROXY_HOPS_EXPECTATION = 'inteiro entre 0 e 10';
const TELEGRAM_SECRET_EXPECTATION = 'texto de 16 a 256 caracteres A-Z, a-z, 0-9, _ ou -';
const TELEGRAM_PAIR_EXPECTATION =
  'TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET devem ser definidos juntos ou omitidos juntos';
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const DEFAULT_API_HOST = '127.0.0.1';
const MAX_TRUSTED_PROXY_HOPS = 10;
const DEFAULT_TRUSTED_PROXY_HOPS = 0;
const PRODUCTION_PROXY_HOPS_REASON =
  'obrigatória em produção (use 1 ou mais atrás de proxy; 0 só com a API exposta direto)';

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
  ],
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

// Quantas threads de busca o walk-forward usa (RNF02): o resultado não depende do número.
const walkForwardThreadsSchema = z.coerce
  .number({ error: WALK_FORWARD_THREADS_EXPECTATION })
  .int({ error: WALK_FORWARD_THREADS_EXPECTATION })
  .min(MIN_WALK_FORWARD_THREADS, { error: WALK_FORWARD_THREADS_EXPECTATION })
  .max(MAX_WALK_FORWARD_THREADS, { error: WALK_FORWARD_THREADS_EXPECTATION })
  .default(DEFAULT_WALK_FORWARD_THREADS);

export const environmentSchema = z
  .object({
    ENV: environmentNameSchema,
    DATABASE_URL: postgresUrlSchema,
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
    TRUSTED_PROXY_HOPS: z.coerce
      .number({ error: PROXY_HOPS_EXPECTATION })
      .int({ error: PROXY_HOPS_EXPECTATION })
      .min(0, { error: PROXY_HOPS_EXPECTATION })
      .max(MAX_TRUSTED_PROXY_HOPS, { error: PROXY_HOPS_EXPECTATION })
      .optional(),
    TELEGRAM_BOT_TOKEN: nonEmptyTextSchema.max(256).optional(),
    TELEGRAM_WEBHOOK_SECRET: z
      .string({ error: TELEGRAM_SECRET_EXPECTATION })
      .regex(TELEGRAM_SECRET_PATTERN, { error: TELEGRAM_SECRET_EXPECTATION })
      .optional(),
    TELEGRAM_API_BASE_URL: httpUrlSchema.default(DEFAULT_TELEGRAM_API_BASE_URL),
    BACKTEST_TIMEOUT_SECONDS: z.coerce
      .number({ error: BACKTEST_TIMEOUT_EXPECTATION })
      .int({ error: BACKTEST_TIMEOUT_EXPECTATION })
      .min(MIN_BACKTEST_TIMEOUT_SECONDS, { error: BACKTEST_TIMEOUT_EXPECTATION })
      .max(MAX_BACKTEST_TIMEOUT_SECONDS, { error: BACKTEST_TIMEOUT_EXPECTATION })
      .default(DEFAULT_BACKTEST_TIMEOUT_SECONDS),
    ...runQueueEnvironmentShape,
    WALK_FORWARD_THREADS: walkForwardThreadsSchema,
    WALK_FORWARD_TIMEOUT_SECONDS: z.coerce
      .number({ error: WALK_FORWARD_TIMEOUT_EXPECTATION })
      .int({ error: WALK_FORWARD_TIMEOUT_EXPECTATION })
      .min(MIN_BACKTEST_TIMEOUT_SECONDS, { error: WALK_FORWARD_TIMEOUT_EXPECTATION })
      .max(MAX_BACKTEST_TIMEOUT_SECONDS, { error: WALK_FORWARD_TIMEOUT_EXPECTATION })
      .default(DEFAULT_WALK_FORWARD_TIMEOUT_SECONDS),
    // Pares e timeframes habilitados no ambiente (os mesmos do cron e do worker): a consulta de candles e a criação
    // de execuções só aceitam estes.
    MARKET_EXCHANGE: marketEnvironmentShape.MARKET_EXCHANGE,
    MARKET_SYMBOLS: marketEnvironmentShape.MARKET_SYMBOLS,
    MARKET_TIMEFRAMES: marketEnvironmentShape.MARKET_TIMEFRAMES,
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
  .superRefine((values, context) => {
    checkProductionRules(values, PRODUCTION_PROFILE, context);
    const isHopsMissing = values.TRUSTED_PROXY_HOPS === undefined;
    if (values.ENV === PRODUCTION_ENVIRONMENT && isHopsMissing) {
      context.addIssue({
        code: 'custom',
        message: PRODUCTION_PROXY_HOPS_REASON,
        path: ['TRUSTED_PROXY_HOPS'],
      });
    }
  })
  .transform((values) => ({
    ...values,
    TRUSTED_PROXY_HOPS: values.TRUSTED_PROXY_HOPS ?? DEFAULT_TRUSTED_PROXY_HOPS,
  }));

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return parseEnvironment(environmentSchema, process.env);
}

// O que a thread do backtest lê do ambiente que a API lhe passa: só a conexão com o banco.
export const backtestWorkerEnvironmentSchema = z.object({ DATABASE_URL: postgresUrlSchema });

export type BacktestWorkerEnvironment = z.infer<typeof backtestWorkerEnvironmentSchema>;

export function loadBacktestWorkerEnvironment(): BacktestWorkerEnvironment {
  return parseEnvironment(backtestWorkerEnvironmentSchema, process.env);
}

// O que a thread do walk-forward lê do ambiente que a API lhe passa: a conexão com o banco e as threads de busca.
export const walkForwardWorkerEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  WALK_FORWARD_THREADS: walkForwardThreadsSchema,
});

export type WalkForwardWorkerEnvironment = z.infer<typeof walkForwardWorkerEnvironmentSchema>;

export function loadWalkForwardWorkerEnvironment(): WalkForwardWorkerEnvironment {
  return parseEnvironment(walkForwardWorkerEnvironmentSchema, process.env);
}
