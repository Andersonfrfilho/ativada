// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  checkProductionRules,
  environmentNameSchema,
  httpUrlSchema,
  parseEnvironment,
  postgresUrlSchema,
  webSocketUrlSchema,
  z,
  type ProductionProfile,
} from '@cryptoada/environment';
import {
  BINANCE_MARKET_DATA_BASE_URL,
  BINANCE_STREAM_BASE_URL,
  marketEnvironmentShape,
} from '@cryptoada/market-data';

import {
  LIVE_DEFAULT_HEARTBEAT_TIMEOUT_SECONDS,
  LIVE_DEFAULT_POLL_SECONDS,
  LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS,
  LIVE_MAXIMUM_POLL_SECONDS,
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
} from './worker.constant.js';

const STALE_EXPECTATION = `inteiro de ${MINIMUM_STREAM_STALE_SECONDS} a ${MAXIMUM_STREAM_STALE_SECONDS}`;
const LOOKBACK_EXPECTATION = `inteiro de ${MINIMUM_STREAM_GAP_LOOKBACK_HOURS} a ${MAXIMUM_STREAM_GAP_LOOKBACK_HOURS}`;
const CHECK_EXPECTATION = `inteiro de ${MINIMUM_STREAM_GAP_CHECK_MINUTES} a ${MAXIMUM_STREAM_GAP_CHECK_MINUTES}`;
const LIVE_POLL_EXPECTATION = `inteiro de ${LIVE_MINIMUM_POLL_SECONDS} a ${LIVE_MAXIMUM_POLL_SECONDS}`;
const LIVE_TIMEOUT_EXPECTATION = `inteiro de ${LIVE_MINIMUM_HEARTBEAT_TIMEOUT_SECONDS} a ${LIVE_MAXIMUM_HEARTBEAT_TIMEOUT_SECONDS}, maior que LIVE_POLL_SECONDS`;

const PRODUCTION_PROFILE: ProductionProfile = {
  urlVariables: ['BINANCE_BASE_URL'],
  webSocketUrlVariables: ['BINANCE_STREAM_URL'],
  secretVariables: [],
  databaseUrlVariable: 'DATABASE_URL',
};

export const environmentSchema = z
  .object({
    ENV: environmentNameSchema,
    DATABASE_URL: postgresUrlSchema,
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
