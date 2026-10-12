// Copyright (c) 2026 Ada Technology. All rights reserved.
import { commaSeparatedTextSchema, httpUrlSchema, z } from '@ativada/environment';
import {
  BINANCE_MARKET_DATA_BASE_URL,
  FEAR_GREED_API_URL,
  marketEnvironmentShape as sharedMarketEnvironmentShape,
} from '@ativada/market-data-crypto';

import { TASK_NAME } from '../cron.constant.js';
import {
  DEFAULT_BACKFILL_YEARS,
  DEFAULT_FEAR_GREED_REFRESH_DAYS,
  MAXIMUM_BACKFILL_YEARS,
  MAXIMUM_FEAR_GREED_REFRESH_DAYS,
  MINIMUM_BACKFILL_YEARS,
  MINIMUM_FEAR_GREED_REFRESH_DAYS,
} from './market.constant.js';

const YEARS_EXPECTATION = `inteiro de ${MINIMUM_BACKFILL_YEARS} a ${MAXIMUM_BACKFILL_YEARS}`;
const REFRESH_DAYS_EXPECTATION = `inteiro de ${MINIMUM_FEAR_GREED_REFRESH_DAYS} a ${MAXIMUM_FEAR_GREED_REFRESH_DAYS}`;
const TASKS_EXPECTATION = 'nomes de tarefas do cron separados por vírgula';

export const marketEnvironmentShape = {
  ...sharedMarketEnvironmentShape,
  BACKFILL_YEARS: z.coerce
    .number({ error: YEARS_EXPECTATION })
    .int({ error: YEARS_EXPECTATION })
    .min(MINIMUM_BACKFILL_YEARS, { error: YEARS_EXPECTATION })
    .max(MAXIMUM_BACKFILL_YEARS, { error: YEARS_EXPECTATION })
    .default(DEFAULT_BACKFILL_YEARS),
  BINANCE_BASE_URL: httpUrlSchema.default(BINANCE_MARKET_DATA_BASE_URL),
  FEAR_GREED_API_URL: httpUrlSchema.default(FEAR_GREED_API_URL),
  FEAR_GREED_REFRESH_DAYS: z.coerce
    .number({ error: REFRESH_DAYS_EXPECTATION })
    .int({ error: REFRESH_DAYS_EXPECTATION })
    .min(MINIMUM_FEAR_GREED_REFRESH_DAYS, { error: REFRESH_DAYS_EXPECTATION })
    .max(MAXIMUM_FEAR_GREED_REFRESH_DAYS, { error: REFRESH_DAYS_EXPECTATION })
    .default(DEFAULT_FEAR_GREED_REFRESH_DAYS),
  CRON_TASKS: commaSeparatedTextSchema
    .pipe(z.array(z.enum(TASK_NAME), { error: TASKS_EXPECTATION }).min(1))
    .optional(),
};
